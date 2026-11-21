/**
 * Basilico — API & Service Tests for User Profiles & Price History (ADR-0007 / TASK-M1-02)
 * Location: tests/api/profiles_and_prices.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { UserProfileService } from '../../server/services/userProfileService.js';
import { PriceHistoryService } from '../../server/services/priceHistoryService.js';
import { enrichOfferRecord } from '../../server/services/offerService.js';

describe('ADR-0007 / TASK-M1-02: User Profiles (4-Level Exclusions) & Price History Service', () => {
  let tmpDir;
  let profileService;
  let priceService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-m1-02-'));
    profileService = new UserProfileService({
      storagePath: path.join(tmpDir, 'user_profiles.json')
    });
    priceService = new PriceHistoryService({
      storagePath: path.join(tmpDir, 'price_history.json')
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. should provide default profiles (dany, barca, ospiti) with Dany active by default', () => {
    const state = profileService.getProfilesState();
    assert.equal(state.activeProfileId, 'dany');
    assert.ok(state.profiles.some((p) => p.id === 'dany'));
    assert.ok(state.profiles.some((p) => p.id === 'barca'));
    assert.ok(state.profiles.some((p) => p.id === 'ospiti'));
  });

  it('2. should flag cheese/dairy products for Dany ("Zero Formaggi") while allowing fish and vegetables', () => {
    const mozzarella = {
      title: 'Mozzarella Fior di Latte Granarolo 3x100g',
      category: 'Latticini e Formaggi',
      domain: 'food_human'
    };
    const resMozz = profileService.checkItemCompatibility(mozzarella, 'dany');
    assert.equal(resMozz.isCompatible, false);
    assert.equal(resMozz.action, 'flag');
    assert.ok(resMozz.matchedExclusions.includes('mozzarella'));

    const orata = {
      title: 'Orata Fresca del Mar Ligure',
      category: 'Carne e Pesce',
      domain: 'food_human'
    };
    const resOrata = profileService.checkItemCompatibility(orata, 'dany');
    assert.equal(resOrata.isCompatible, true);
    assert.equal(resOrata.action, 'allow');
  });

  it('3. should enforce hard_ban for "barca" profile on frozen foods and cheeses', () => {
    const surgelato = {
      title: 'Minestrone Tradizionale Surgelato Findus 1kg',
      category: 'Surgelati',
      domain: 'food_human'
    };
    const res = profileService.checkItemCompatibility(surgelato, 'barca');
    assert.equal(res.isCompatible, false);
    assert.equal(res.action, 'hide');
  });

  it('4. should allow all food items when switching to "ospiti" profile', () => {
    const parmigiano = {
      title: 'Parmigiano Reggiano DOP 30 Mesi',
      category: 'Latticini e Formaggi',
      domain: 'food_human'
    };
    const res = profileService.checkItemCompatibility(parmigiano, 'ospiti');
    assert.equal(res.isCompatible, true);
  });

  it('5. should export and import profiles JSON cleanly in isolated storage', () => {
    profileService.upsertProfile({
      id: 'ospite-vegano',
      name: 'Ospite Vegano',
      dietaryRegime: 'vegan',
      filterMode: 'hard_ban',
      excludedCategories: [],
      excludedIngredients: []
    });
    const exported = profileService.exportProfilesJson();
    assert.equal(exported.schemaVersion, '1.0');
    assert.ok(exported.profiles.some((p) => p.id === 'ospite-vegano'));

    const imported = profileService.importProfilesJson({
      activeProfileId: 'ospite-vegano',
      profiles: exported.profiles
    });
    assert.equal(imported.activeProfileId, 'ospite-vegano');
  });

  it('6. should record a counter price observation ("Prezzo visto al banco") and normalize €/kg', () => {
    const obs = priceService.recordObservation({
      title: 'Acciughe fresche di Monterosso',
      price: 1.20,
      unitString: "all'etto",
      storeId: 'pescheria-locale-rapallo',
      storeName: 'Pescheria Rapallo'
    });
    assert.equal(obs.price, 1.20);
    assert.equal(obs.normalizedPricePerKgOrL, 12.00);
    assert.equal(obs.referenceUnit, 'kg');
  });

  it('7. should evaluate "È un vero sconto?" accurately against historical observations', () => {
    const promoOffer = enrichOfferRecord({
      title: 'Pasta di Semola Barilla 500 g',
      brand: 'Barilla',
      promoPrice: 0.89,
      originalPrice: 1.39,
      category: 'Dispensa e Pasta'
    });
    assert.ok(promoOffer.realDiscountCheck);
    assert.ok(['verified_best', 'verified_good'].includes(promoOffer.realDiscountCheck.status));
    assert.ok(promoOffer.realDiscountCheck.deltaVsHistoryPct > 20);
  });

  it('8. M-P0-08: unifies complete cheese lexicon across dany & barca without false-matching Rigoni di Asiago jam or Pecorino DOC/IGT wine', () => {
    for (const cheeseTitle of [
      'Mascarpone Fresco 250g',
      'Feta DOP Greca 200g',
      'Taleggio DOP 200g',
      'Philadelphia Classico 150g',
      'Robiola Osella 2x100g',
      'Caciocavallo Silano DOP',
      'Caciotta Mista',
      'Fiocchi di Latte 200g'
    ]) {
      const item = { title: cheeseTitle, category: 'Latticini e Formaggi', domain: 'food_human' };
      const resDany = profileService.checkItemCompatibility(item, 'dany');
      const resBarca = profileService.checkItemCompatibility(item, 'barca');
      assert.equal(resDany.isCompatible, false, `Dany must flag ${cheeseTitle}`);
      assert.equal(resBarca.isCompatible, false, `Barca must hide ${cheeseTitle}`);
      assert.equal(resBarca.action, 'hide');
    }

    const jam = {
      title: 'Rigoni Di Asiago - Confetture Bio Albicocche 250g',
      brand: 'Rigoni di Asiago',
      category: 'Colazione e Dolci',
      domain: 'food_human'
    };
    assert.equal(profileService.checkItemCompatibility(jam, 'dany').isCompatible, true);
    assert.equal(profileService.checkItemCompatibility(jam, 'barca').isCompatible, true);

    const wine = {
      title: 'Spinelli - Montepulciano DOC O Pecorino IGT Valdifara 75cl',
      brand: 'Spinelli',
      category: 'Acqua e Bevande',
      domain: 'food_human'
    };
    assert.equal(profileService.checkItemCompatibility(wine, 'dany').isCompatible, true);
    assert.equal(profileService.checkItemCompatibility(wine, 'barca').isCompatible, true);
  });

  it('9. M-P1-09: invalidates enrichOfferRecord memo immediately when priceHistoryService or userProfileService mutates', () => {
    const sharedOffer = {
      id: 'memo-invalidation-test',
      title: 'Filetto di Salmone Fresco 1 kg',
      promoPrice: 14.9,
      category: 'Carne e Pesce',
      domain: 'food_human'
    };
    const beforeObs = enrichOfferRecord(sharedOffer, 'dany');
    assert.equal(beforeObs.profileCompatibility.isCompatible, true);

    // Mutate isolated priceService -> bumps global enrichment epoch so sharedOffer re-enriches
    priceService.recordObservation({
      title: 'Filetto di Salmone Fresco',
      price: 24.9,
      unitString: '1 kg',
      storeId: 'rapallo-pescheria-mercato'
    });
    const afterObs = enrichOfferRecord(sharedOffer, 'dany');
    assert.notEqual(afterObs, beforeObs, 'recordObservation must invalidate enrichOfferRecord memo');
  });
});
