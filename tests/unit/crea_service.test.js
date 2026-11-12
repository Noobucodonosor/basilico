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
import { enrichOfferRecord, offerService } from '../../server/services/offerService.js';

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

  it('6. should convert FAO fatty acids to true g/100g (Sardines/Mackerel/Walnuts >> Garlic on Omega-3) and apply thermal vitamin retention (ADR-0013)', () => {
    const aglio = creaService.searchAndRankFoods({ q: 'Aglio', limit: 3 }).foods[0];
    const sgombro = creaService.searchAndRankFoods({ q: 'Sgombro o maccarello', limit: 3 }).foods[0];
    const noci = creaService.searchAndRankFoods({ q: 'Noci, secche', limit: 3 }).foods[0];

    assert.ok(aglio.keyMetrics.omega3G < 0.1, `Garlic omega3G must be <0.1g/100g, got ${aglio.keyMetrics.omega3G}`);
    assert.ok(sgombro.keyMetrics.omega3G > 1.5, 'Mackerel must have >1.5g/100g Omega-3');
    assert.ok(sgombro.keyMetrics.epaDhaG > 1.5, 'Mackerel must have >1.5g/100g marine EPA+DHA');
    assert.ok(noci.keyMetrics.omega3G > 5.0, 'Walnuts must have >5g/100g ALA Omega-3');

    // Thermal retention Rf on cooked spinach Vitamin C
    const spinaci = creaService.searchAndRankFoods({ q: 'Spinaci, crudi', limit: 1 }).foods[0];
    const rawSheet = creaService.computeNutritionalSheet(spinaci.id, { mode: '100g_edible', state: 'as_is' });
    const cookedSheet = creaService.computeNutritionalSheet(spinaci.id, { mode: '100g_edible', state: 'cooked_from_raw' });
    const vitCRaw = rawSheet.sections['VITAMINE'].find((r) => r.component === 'Vitamina C (mg)').computedValue;
    const vitCCookedRow = cookedSheet.sections['VITAMINE'].find((r) => r.component === 'Vitamina C (mg)');
    assert.ok(vitCCookedRow.computedValue < vitCRaw, 'Cooked spinach Vitamin C must reflect thermal retention loss');
    assert.equal(vitCCookedRow.thermalRetentionFactor, 0.6);

    // Real Rapallo seed offers must populate >50 live Nutrients/€ entries while rejecting nameless "Al Kg"
    const allEnriched = offerService.getSeedOffersSync().map((o) => enrichOfferRecord(o, 'dany'));
    const alKg = allEnriched.find((o) => o.title === 'Al Kg');
    assert.equal(alKg.isNamelessTile, true);
    assert.equal(alKg.creaMatch, null);
    const ranked = matcher.rankOffersByNutrientPerEuro(allEnriched, { metric: 'proteinGPerEuro', hideIncompatible: true });
    assert.ok(ranked.length >= 80, `Expected >=80 real Rapallo offers in Nutrients/Euro ranking, got ${ranked.length}`);
  });

  it('7. M-P0-06: never divides portion_larn or custom_grams kcal by yieldMult when cooked_from_raw (80g raw pasta -> 192g cooked stays ~273 kcal)', () => {
    const pasta = creaService.searchAndRankFoods({ q: 'Pasta di semola', limit: 3 }).foods[0];
    const larnCooked = creaService.computeNutritionalSheet(pasta.id, {
      mode: 'portion_larn',
      state: 'cooked_from_raw',
      per100gCooked: true
    });
    assert.equal(larnCooked.calculationContext.resultingCookedWeightGrams, 192);
    const larnKcal = larnCooked.sections['MACRO NUTRIENTI'].find((r) => r.component === 'Energia (kcal)').computedValue;
    assert.ok(larnKcal > 250 && larnKcal < 300, `80g raw pasta cooked must preserve ~273 kcal, got ${larnKcal}`);

    const per100Cooked = creaService.computeNutritionalSheet(pasta.id, {
      mode: '100g_edible',
      state: 'cooked_from_raw',
      per100gCooked: true
    });
    const per100CookedKcal = per100Cooked.sections['MACRO NUTRIENTI'].find((r) => r.component === 'Energia (kcal)').computedValue;
    assert.ok(per100CookedKcal > 130 && per100CookedKcal < 160, `100g of cooked pasta should be ~142 kcal, got ${per100CookedKcal}`);
  });

  it('8. M-P0-08: filters all official CREA "Formaggi e latticini" cheeses when includeExcluded=false for both dany and barca', () => {
    const danyCheeses = creaService.searchAndRankFoods({
      profileId: 'dany',
      includeExcluded: false,
      category: 'Formaggi e latticini'
    });
    const barcaCheeses = creaService.searchAndRankFoods({
      profileId: 'barca',
      includeExcluded: false,
      category: 'Formaggi e latticini'
    });
    const cheeseKeywords = /formagg|pecorin|parmigian|grana|mozzarell|ricott|stracchin|gorgonzol|scamorz|provol|caciott|asiago|taleggi|robiol|brie|feta|mascarpon|crescenz|caprin|camembert|cheddar|edam|fontin|caciocavall|primo sale|fiocchi di latte|quark|formaggin|sottilett|roquefort|vezzena/i;
    const leakedDany = danyCheeses.foods.filter((f) => cheeseKeywords.test(f.name));
    const leakedBarca = barcaCheeses.foods.filter((f) => cheeseKeywords.test(f.name));
    assert.equal(leakedDany.length, 0, `Dany leaked cheeses: ${leakedDany.map((f) => f.name).join(', ')}`);
    assert.equal(leakedBarca.length, 0, `Barca leaked cheeses: ${leakedBarca.map((f) => f.name).join(', ')}`);
  });

  it('9. M-P1-07 & M-P1-09: maps canned tuna, passata, caciotta & butcher burgers to exact CREA items, exposes packWeightGrams, and invalidates enrichOfferRecord memo on override', () => {
    const tonno = matcher.matchOfferToCrea({
      id: 'test-tonno-pinna',
      title: "Eurospin - Tonno Pinna Gialla All'Olio Di Oliva 3x80g",
      brand: 'Eurospin',
      domain: 'food_human',
      category: 'Dispensa e Pasta'
    });
    assert.ok(tonno);
    assert.equal(tonno.creaFoodName, "Tonno sott'olio, sgocciolato");

    const passata = matcher.matchOfferToCrea({
      id: 'test-passata-mutti',
      title: 'Mutti - Passata Di Pomodoro 700g',
      brand: 'Mutti',
      domain: 'food_human',
      category: 'Dispensa e Pasta'
    });
    assert.ok(passata);
    assert.equal(passata.creaFoodName, 'Pomodori, passata');

    const caciotta = matcher.matchOfferToCrea({
      id: 'test-caciotta-bruna',
      title: 'Bruna - Caciotta Fresca 300g',
      brand: 'Bruna',
      domain: 'food_human',
      category: 'Latticini e Formaggi'
    });
    assert.ok(caciotta);
    assert.equal(caciotta.creaFoodName, 'Caciotta mista');

    const burger = matcher.matchOfferToCrea({
      id: 'test-burger-bovino',
      title: 'Hamburger Di Bovino Adulto Scelto 200g',
      domain: 'food_human',
      category: 'Carne e Pesce'
    });
    assert.ok(burger);
    assert.ok(!burger.creaFoodName.toLowerCase().includes('panino'), `Butcher burger must not match fast-food panino: ${burger.creaFoodName}`);

    const enrichedPassata = enrichOfferRecord({
      id: 'test-npe-weights',
      title: 'Mutti - Passata Di Pomodoro 700g',
      brand: 'Mutti',
      promoPrice: 1.19,
      domain: 'food_human',
      category: 'Dispensa e Pasta'
    });
    const npe = matcher.computeOfferNutrientsPerEuro(enrichedPassata);
    assert.equal(npe.packWeightGrams, 700);
    assert.equal(npe.drainedWeightGrams, 700);
  });
});
