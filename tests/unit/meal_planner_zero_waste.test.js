/**
 * Basilico — Unit Tests for Zero-Waste Whole-Pack Meal Planner & Multi-Store Shopping List (ADR-0012 / TASK-M6-01)
 * Location: tests/unit/meal_planner_zero_waste.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import os from 'node:os';
import { MealPlannerService } from '../../server/services/mealPlannerService.js';
import { ShoppingListService } from '../../server/services/shoppingListService.js';

test('MealPlannerService — 6 Neo-Dieta Models, Boat/Land Day Modes, Whole-Pack Chaining & Honest Residuals', async () => {
  const planner = new MealPlannerService();
  const models = planner.getModels();
  assert.equal(models.length, 6, 'Must expose all 6 Neo-Dieta entry models');

  const plan = await planner.generateWeeklyPlan({
    modelId: 'promo_driven_neodiet',
    daysCount: 7,
    servings: 1,
    budgetEur: 85,
    dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'boat_day', 'land_day', 'eat_out']
  });

  assert.equal(plan.days.length, 7);
  assert.equal(plan.days[2].dayMode, 'boat_day');
  assert.match(plan.days[2].lunch.contextLabel, /Barca/i);
  assert.equal(plan.days[6].dayMode, 'eat_out');
  assert.equal(plan.days[6].lunch, null);

  // Verify Whole-Pack math ($K_p = \lceil Q_p / S_p \rceil$) and honest residual reporting
  assert.ok(plan.ledger.wholePackItems.length > 0);
  for (const wp of plan.ledger.wholePackItems) {
    assert.equal(wp.domain, 'food_human', 'Meal planner must only include food_human items');
    const expectedPacks = wp.netToBuyGrams > 0 ? Math.ceil(wp.netToBuyGrams / wp.packSizeGrams) : 0;
    assert.equal(wp.packsToBuy, expectedPacks);
    assert.equal(wp.totalPurchasedGrams, wp.packsToBuy * wp.packSizeGrams);
    const expectedResidual = Math.max(
      0,
      Number((wp.fromPantryGrams + wp.totalPurchasedGrams - wp.totalRequiredGrams).toFixed(1))
    );
    assert.equal(wp.residualReturnedToPantryGrams, expectedResidual);
  }
});

test('MealPlannerService — Honest Whole-Recipe Budget Governance (Never Removes Single Ingredients)', async () => {
  const planner = new MealPlannerService();
  const tightPlan = await planner.generateWeeklyPlan({
    modelId: 'tigullio_gourmet_home',
    daysCount: 5,
    servings: 1,
    budgetEur: 25
  });

  // Every planned lunch/dinner must still retain 100% of its BOM ingredients
  for (const day of tightPlan.days) {
    for (const slot of ['lunch', 'dinner']) {
      if (day[slot]?.dish) {
        assert.ok(day[slot].dish.bom.length >= 2, 'Dish BOM must remain intact (never popped)');
      }
    }
  }
});

test('ShoppingListService — Domain Separation, 1/2/3 Store Simulations & Shelf Plan B', async () => {
  const planner = new MealPlannerService();
  const shop = new ShoppingListService({
    storagePath: path.join(os.tmpdir(), `basilico-shop-test-${Date.now()}.json`)
  });

  const plan = await planner.generateWeeklyPlan({ daysCount: 4, servings: 1 });
  shop.syncFromWeeklyPlan(plan);

  // Add a home_cleaning item from Tigotà/PiùMe
  const state = shop.addItem({
    name: 'Acido Citrico Puro Anticalcare Inox',
    domain: 'home_cleaning',
    source: 'kitchen_care',
    packsToBuy: 1,
    unitPriceEur: 3.49,
    preferredChain: 'Tigotà Rapallo'
  });

  assert.ok(state.subtotals.foodSubtotalEur > 0);
  assert.equal(state.subtotals.homeAndKitchenSubtotalEur, 3.49);
  assert.equal(
    state.subtotals.grandTotalEur,
    Number((state.subtotals.foodSubtotalEur + state.subtotals.homeAndKitchenSubtotalEur).toFixed(2))
  );
  assert.equal(state.storeSimulations.length, 3, 'Must simulate 1 vs 2 vs 3 stores in Rapallo');
  assert.match(state.whatsappExportText, /BASILICO — LISTA SPESA SMART RAPALLO/);

  // Test Plan B on shelf
  const firstId = state.items[0].id;
  const planB = await shop.getShelfPlanB(firstId);
  assert.equal(planB.originalItem.id, firstId);
  assert.ok(Array.isArray(planB.planBAlternatives));
});
