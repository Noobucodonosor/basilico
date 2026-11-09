/**
 * Basilico — Unit & API Tests for Official CREA Engine & Offer Matcher (ADR-0008 / TASK-M2-01)
 * Location: tests/unit/crea_service.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { creaService, parseCreaValue } from '../../server/services/creaService.js';
import { CreaOfferMatcher } from '../../server/services/creaOfferMatcher.js';
import { enrichOfferRecord } from '../../server/services/offerService.js';

describe('ADR-0008 / TASK-M2-01: CREA Scientific Nutrition Engine & Head-Noun Offer Matcher', () => {
  let tmpDir;
  let matcher;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-crea-test-'));
    matcher = new CreaOfferMatcher({
      overridesPath: path.join(tmpDir, 'crea_overrides.json')
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. should load all 832 official CREA foods and 17 categories without truncation', () => {
    const allFoods = creaService.getAllFoods();
    assert.equal(allFoods.length, 832);
    const categories = creaService.getCategories();
    assert.equal(categories.length, 17);
  });

  it('2. should distinguish 0.0, "tr" (trace), and null accurately in parseCreaValue', () => {
    const zero = parseCreaValue('0.0');
    assert.equal(zero.numeric, 0);
    assert.equal(zero.isTrace, false);
    assert.equal(zero.isNull, false);

    const trace = parseCreaValue('tr');
    assert.equal(trace.numeric, 0);
    assert.equal(trace.isTrace, true);
    assert.equal(trace.isNull, false);

    const missing = parseCreaValue(null);
    assert.equal(missing.numeric, null);
    assert.equal(missing.isNull, true);
  });

  it('3. should compute full 7-section nutritional sheet with relative fraction invariance and Raw<->Cooked yield', () => {
    // Find a food that has amino acids (% di proteine) and yield factor (e.g., Pasta di semola)
    const searchRes = creaService.searchAndRankFoods({ q: 'Pasta di semola', limit: 5 });
    assert.ok(searchRes.foods.length > 0);
    const pasta = searchRes.foods[0];

    const sheet100 = creaService.computeNutritionalSheet(pasta.id, { mode: '100g_edible' });
    const sheet250 = creaService.computeNutritionalSheet(pasta.id, { mode: 'custom_grams', grams: 250 });

    assert.ok(sheet100.totalValuesCount > 15, 'Should return all nutrient values without .slice(0, 12)');
    assert.ok(sheet100.sections['MACRO NUTRIENTI']);
    assert.ok(sheet100.sections['MINERALI']);

    // Energy scales by 2.5x when going from 100g to 250g
    const kcal100 = sheet100.sections['MACRO NUTRIENTI'].find((r) => r.component === 'Energia (kcal)').computedValue;
    const kcal250 = sheet250.sections['MACRO NUTRIENTI'].find((r) => r.component === 'Energia (kcal)').computedValue;
    assert.ok(Math.abs(kcal250 - kcal100 * 2.5) < 1);

    // Relative fractions (% di proteine) must remain invariant when scaling weight
    const aaSec100 = sheet100.sections['AMINOACIDI (% DI PROTEINE)'];
    const aaSec250 = sheet250.sections['AMINOACIDI (% DI PROTEINE)'];
    if (aaSec100 && aaSec100.length > 0) {
      assert.equal(aaSec100[0].computedValue, aaSec250[0].computedValue);
      assert.equal(aaSec250[0].isRelativeFraction, true);
    }

    // Cooked yield factor on pasta (~2.4x hydration)
    const sheetCooked = creaService.computeNutritionalSheet(pasta.id, {
      mode: '100g_edible',
      state: 'cooked_from_raw',
      per100gCooked: true
    });
    assert.equal(sheetCooked.calculationContext.resultingCookedWeightGrams, 240);
  });

  it('4. should match commercial food offers via head-noun rules and reject composite false positives ("Salsa di noci")', () => {
    const barilla = enrichOfferRecord({
      id: 'off-barilla',
      title: 'Barilla Pasta di Semola Spaghetti 500 g',
      brand: 'Barilla',
      promoPrice: 0.89,
      category: 'Dispensa e Pasta'
    });
    const mBarilla = matcher.matchOfferToCrea(barilla);
    assert.ok(mBarilla);
    assert.ok(mBarilla.creaFoodName.toLowerCase().includes('pasta di semola'));

    // False positive guard: "Salsa di noci" must NOT match raw "Noci"
    const salsaNoci = enrichOfferRecord({
      id: 'off-salsa-noci',
      title: 'Salsa di Noci Fresca Tigullio 150 g',
      promoPrice: 2.49,
      category: 'Latticini e Formaggi'
    });
    const mSalsa = matcher.matchOfferToCrea(salsaNoci);
    assert.equal(mSalsa, null);

    // Non-food guard: Detergent must NEVER match CREA
    const dash = enrichOfferRecord({
      id: 'off-dash',
      title: 'Dash Pods Detersivo Lavatrice 35 caps',
      promoPrice: 9.99,
      category: 'Cura Casa e Bucato'
    });
    assert.equal(matcher.matchOfferToCrea(dash), null);
  });

  it('5. should compute "Nutrients per Edible Euro" using drained weight and support manual overrides', () => {
    const tonno = enrichOfferRecord({
      id: 'off-tonno-rio',
      title: "Tonno all'Olio di Oliva Rio Mare 3 x 80 g",
      brand: 'Rio Mare',
      promoPrice: 3.49,
      category: 'Dispensa e Pasta'
    });
    const npe = matcher.computeOfferNutrientsPerEuro(tonno);
    assert.ok(npe);
    assert.ok(npe.nutrientsPerEuro.proteinGPerEuro > 8);
    assert.ok(npe.trueEdibleEuroPerKg > 15);

    // Manual override test
    const overrideRes = matcher.setManualOverride('off-tonno-rio', npe.creaFoodId);
    assert.equal(overrideRes.creaFoodId, npe.creaFoodId);
    const rematched = matcher.matchOfferToCrea(tonno);
    assert.equal(rematched.matchBasis, 'manual_override');
  });
});
