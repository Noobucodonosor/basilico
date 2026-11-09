/**
 * Basilico — Unit Tests for Recipes, Tigullio Restaurants, Arbitrage & 80/20 Solver (ADR-0011 / TASK-M5-01)
 * Location: tests/unit/recipe_arbitrage_8020.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { RecipeAndArbitrageService } from '../../server/services/recipeAndArbitrageService.js';

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
