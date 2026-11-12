/**
 * Basilico — Unit Tests for Recipes, Tigullio Restaurants, Arbitrage & 80/20 Solver (ADR-0011 / TASK-M5-01)
 * Location: tests/unit/recipe_arbitrage_8020.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import {
  RecipeAndArbitrageService,
  matchBomIngredientToOffer,
  resolveIngredientPackSpec
} from '../../server/services/recipeAndArbitrageService.js';

test('RecipeAndArbitrageService — Certified Catalog Integrity (234 Dishes & 32 Tigullio Restaurants)', () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test-${Date.now()}.json`)
  });

  const dishes = svc.getDishesSeed();
  const restaurants = svc.getRestaurantsSeed();

  assert.equal(restaurants.length, 32, 'Must include all 32 Tigullio restaurants');
  assert.ok(dishes.length >= 234, `Expected at least 234 dishes, got ${dishes.length}`);

  const totalBomRows = dishes.reduce((acc, d) => acc + (d.bom?.length || 0), 0);
  assert.ok(totalBomRows >= 1134, `Expected at least 1134 BOM rows, got ${totalBomRows}`);
});

test('RecipeAndArbitrageService — Profile-Adapted Variant & Dual Cost Arbitrage', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test2-${Date.now()}.json`)
  });

  const dishes = svc.getDishesSeed();
  // tigullio-dish-2 has Parmigiano Reggiano DOP 24 mesi
  const dishWithCheese = dishes.find((d) => d.id === 'tigullio-dish-2');
  assert.ok(dishWithCheese, 'Expected tigullio-dish-2 in seed');

  // Evaluate for 'dany' profile (cheese excluded)
  const evalDany = await svc.evaluateDish(dishWithCheese, { profileId: 'dany', servings: 2 });
  assert.equal(evalDany.hasProfileSubstitution, true, 'Must trigger dairy-free Ligurian substitution for dany');
  assert.ok(evalDany.substitutionsApplied.length >= 1);
  assert.equal(evalDany.servings, 2);
  assert.ok(evalDany.costAndArbitrage.purePortionCostEur > 0);
  assert.ok(evalDany.costAndArbitrage.totalMenuPriceEur === dishWithCheese.menuPriceEuro * 2);
  assert.equal(
    evalDany.costAndArbitrage.arbitrageSavingsEur,
    Number((evalDany.costAndArbitrage.totalMenuPriceEur - evalDany.costAndArbitrage.purePortionCostEur).toFixed(2))
  );

  // Evaluate for 'ospiti' profile (no exclusions)
  const evalFree = await svc.evaluateDish(dishWithCheese, { profileId: 'ospiti', servings: 1 });
  assert.equal(evalFree.hasProfileSubstitution, false, 'Must not substitute cheese for ospiti profile');
});

test('RecipeAndArbitrageService — 80/20 Max-Coverage Basket & Science Cooking Session', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test3-${Date.now()}.json`)
  });

  const pareto = await svc.computeMaxCoverage8020({ topK: 10 });
  assert.equal(pareto.paretoBasket.length, 10);
  assert.ok(pareto.totalCatalogDishes >= 234);
  assert.ok(
    pareto.paretoBasket[9].cumulativeUnlockedDishesCount >= pareto.paretoBasket[0].cumulativeUnlockedDishesCount
  );

  // Check Harvard Science & Cooking session translation for Induction vs Gas
  const sessionInduction = await svc.getScientificCookingSession('starred-cracco-spaghetto-pomodoro-studio', {
    heatSource: 'induction',
    servings: 2
  });
  assert.equal(sessionInduction.heatSource, 'induction');
  assert.ok(sessionInduction.scientificSteps.length >= 3);
  assert.match(sessionInduction.scientificSteps[1].stoveInstruction, /Induzione/i);
  assert.ok(sessionInduction.kitchenReset.protocols.length >= 1);
});

test('RecipeAndArbitrageService — Expanded Single/Breakfast/Boat Catalog & Twin Deduplication (ADR-0013 / TASK-REAL-02)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test4-${Date.now()}.json`)
  });

  const all = svc.getDishesSeed();
  assert.ok(all.length >= 264, `Expected >=264 dishes after TASK-REAL-02 expansion, got ${all.length}`);

  const breakfasts = all.filter((d) => d.course === 'colazione');
  assert.ok(breakfasts.length >= 6, `Expected >=6 real breakfast recipes, got ${breakfasts.length}`);

  const boatDishes = await svc.queryDishes({ mealContext: 'boat_cooler', limit: 50 });
  const coldSafeCount = boatDishes.dishes.filter((d) => d.boatSafeCold).length;
  assert.ok(coldSafeCount >= 13, `Expected >=13 cold-safe boat dishes, got ${coldSafeCount}`);

  // Comparative restaurant twin deduplication
  const rawPesto = await svc.queryDishes({ q: 'pesto', sourceType: 'tigullio_restaurant', deduplicateTwins: false, limit: 50 });
  const dedupPesto = await svc.queryDishes({ q: 'pesto', sourceType: 'tigullio_restaurant', deduplicateTwins: true, limit: 50 });
  assert.ok(rawPesto.totalMatching > dedupPesto.totalMatching, 'Deduplicating homologous twins must consolidate multiple restaurant pesto entries');
  assert.ok(dedupPesto.dishes.some((d) => d.restaurantPriceRangeEur && d.restaurantPriceRangeEur.count >= 5));
});

test('RecipeAndArbitrageService — Strict BOM Matcher, Granular Packs, 3-Tier Zero-Cheese & 8 Archetypes (ADR-0013 / TASK-REAL-03)', async () => {
  const svc = new RecipeAndArbitrageService({
    labNotebookPath: path.join(os.tmpdir(), `basilico-lab-test5-${Date.now()}.json`)
  });

  // 1. Strict word-boundary & physical-state offer matching (zero substring hallucinations)
  const fakeTraps = [
    { id: 'trap-1', title: 'Battaglio Ananas 1 kg', brand: 'Battaglio', domain: 'food_human', promoPrice: 1.99 },
    { id: 'trap-2', title: 'Tonno Rio Mare all Olio di Oliva 4x80g', brand: 'Rio Mare', domain: 'food_human', promoPrice: 4.99 },
    { id: 'trap-3', title: 'La Robiola Osella con Latte Fresco 100g', brand: 'Osella', domain: 'food_human', promoPrice: 1.49 },
    { id: 'trap-4', title: 'Salsa di Noci Fresca 150g', brand: 'Biffi', domain: 'food_human', promoPrice: 2.39 },
    { id: 'valid-garlic', title: 'Aglio Bianco Italiano Rete 100g', brand: '', domain: 'food_human', promoPrice: 1.19 }
  ];

  assert.equal(matchBomIngredientToOffer({ name: 'Aglio fresco', creaId: '005010' }, [fakeTraps[0]]), null, 'Aglio must NEVER match Battaglio');
  assert.equal(matchBomIngredientToOffer({ name: 'Tonno rosso crudo abbattuto', creaId: '123520' }, [fakeTraps[1]]), null, 'Raw tuna must NEVER match canned Rio Mare');
  assert.equal(matchBomIngredientToOffer({ name: 'Latte parzialmente scremato', creaId: '130020' }, [fakeTraps[2]]), null, 'Milk must NEVER match Robiola cheese');
  assert.equal(matchBomIngredientToOffer({ name: 'Gherigli di noci', creaId: '009910' }, [fakeTraps[3]]), null, 'Raw walnuts must NEVER match processed walnut sauce');
  assert.equal(matchBomIngredientToOffer({ name: 'Aglio fresco', creaId: '005010' }, fakeTraps)?.id, 'valid-garlic');

  // 2. Granular commercial packs (3g herbs -> 30g pack < €2.00, not 500g)
  const herbSpec = resolveIngredientPackSpec('Maggiorana fresca ligure');
  assert.equal(herbSpec.packGrams, 30);
  const pineSpec = resolveIngredientPackSpec('Pinoli italiani');
  assert.equal(pineSpec.packGrams, 50);
  const garlicSpec = resolveIngredientPackSpec('Aglio di Vessalico');
  assert.equal(garlicSpec.packGrams, 100);

  // 3. 3-Tier Zero-Cheese: structural dairy dishes flagged honestly, Pansotti herb-bound cleanly
  const all = svc.getDishesSeed();
  const structuralDairyDish = all.find((d) => /focaccia\s+(?:col|al)\s+formaggio|caprese|tiramisu/i.test(d.title));
  assert.ok(structuralDairyDish, 'Expected structural dairy dish in catalog');
  const evalStructuralDany = await svc.evaluateDish(structuralDairyDish, { profileId: 'dany', servings: 1 });
  assert.equal(evalStructuralDany.isExcludedByProfileIdentity, true, 'Structural dairy dish must be flagged as excluded for dany');
  assert.equal(evalStructuralDany.hasProfileSubstitution, false, 'Structural dairy dish must NOT receive absurd olive-oil substitution');

  const pansottiDish = all.find((d) => /pansot/i.test(d.title));
  if (pansottiDish) {
    const evalPansotti = await svc.evaluateDish(pansottiDish, { profileId: 'dany', servings: 1 });
    assert.equal(evalPansotti.isExcludedByProfileIdentity, false);
    assert.equal(evalPansotti.hasProfileSubstitution, true);
  }

  // 4. Distinct Science & Cooking archetypes across diverse dishes
  const archetypesSeen = new Set();
  const sampleIds = [
    'tigullio-dish-2', // pesto pasta
    'starred-cracco-spaghetto-pomodoro-studio', // starch_emulsion_pasta
    all.find((d) => d.boatSafeCold && d.course === 'piatto_unico_barca')?.id, // cold_osmotic_boat_cambusa
    all.find((d) => /risott/i.test(d.title))?.id, // amylopectin_risotto
    all.find((d) => d.course === 'secondo' && /orata|branzino|acciug/i.test(d.title))?.id, // fish_skin_maillard_or_poach
    all.find((d) => d.course === 'colazione' && /avena|porridge|yogurt/i.test(d.title))?.id // baking_or_breakfast_gelatinization
  ].filter(Boolean);

  for (const sid of sampleIds) {
    const sess = await svc.getScientificCookingSession(sid, { heatSource: 'gas', servings: 1 });
    assert.ok(sess.cookingArchetype, `Expected cookingArchetype for ${sid}`);
    assert.ok(sess.scientificSteps.length >= 3);
    archetypesSeen.add(sess.cookingArchetype);
  }
  assert.ok(archetypesSeen.size >= 5, `Expected at least 5 distinct cooking archetypes across sample dishes, got ${archetypesSeen.size}`);
});
