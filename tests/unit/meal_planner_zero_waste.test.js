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

test('MealPlannerService (TASK-REAL-05) — Human Anti-Monotony, Boat Cold Safety, Real Breakfast BOMs & Diet Purity Across All 6 Models', async () => {
  const planner = new MealPlannerService();
  const models = planner.getModels();
  const meatRx = /\b(manzo|vitello|bovino|pollo|tacchino|coniglio|maiale|suino|agnello|salame|prosciutto|pancetta|guanciale|salsiccia|mortadella|bresaola|cima)\b/i;

  for (const model of models) {
    const plan = await planner.generateWeeklyPlan({
      modelId: model.id,
      daysCount: 7,
      servings: 1,
      budgetEur: 55,
      profileId: 'dany',
      dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'boat_day', 'land_day', 'land_day']
    });

    const dishIds = new Set();
    const twinKeys = new Set();
    let pestoMeals = 0;

    for (const day of plan.days) {
      // 1. Real Breakfast with CREA BOM
      assert.ok(day.breakfast?.dish, `Day ${day.dayIndex} in ${model.id} must have a real breakfast dish`);
      assert.equal(day.breakfast.dish.course, 'colazione');
      assert.ok(day.breakfast.dish.bom.length >= 2);

      // 2. Boat day lunches MUST be strictly cold-safe (zero hot pasta / stove dishes)
      if (day.dayMode === 'boat_day') {
        assert.equal(
          day.lunch.dish.boatSafeCold,
          true,
          `Boat lunch "${day.lunch.dish.title}" in ${model.id} must be cold-safe`
        );
      }

      // 3. No double pasta/risotto on the same day
      assert.ok(
        !(day.lunch.dish.course === 'primo' && day.dinner.dish.course === 'primo'),
        `Day ${day.dayName} in ${model.id} must not schedule primo at both lunch and dinner`
      );

      for (const slot of ['lunch', 'dinner']) {
        const dish = day[slot].dish;
        assert.equal(dish.isExcludedByProfileIdentity, false, `Dish "${dish.title}" violates Zero Formaggi identity`);
        assert.ok(
          !['dolce', 'gelato', 'merenda', 'aperitivo', 'colazione', 'contorno'].includes(dish.course),
          `Non-meal course "${dish.course}" ("${dish.title}") must never be scheduled as ${slot}`
        );

        // Zero duplicate dishes or homologous restaurant twins across the entire week
        assert.ok(!dishIds.has(dish.id), `Duplicate dish ID ${dish.id} in ${model.id}`);
        dishIds.add(dish.id);
        if (dish.canonicalTwinKey) {
          assert.ok(!twinKeys.has(dish.canonicalTwinKey), `Duplicate twin "${dish.canonicalTwinKey}" in ${model.id}`);
          twinKeys.add(dish.canonicalTwinKey);
        }

        if (dish.dishFamily === 'pesto_pasta') pestoMeals += 1;

        if (model.id === 'pescetarian_sea') {
          const text = `${dish.title} ${dish.bom.map((b) => b.name).join(' ')}`;
          assert.ok(!meatRx.test(text), `Pescetarian plan must never include meat dish: ${dish.title}`);
        }
        if (model.id === 'high_protein_sport') {
          assert.notEqual(dish.dishFamily, 'pizza_focaccia', `High-protein plan must not include pizza: ${dish.title}`);
          assert.notEqual(dish.dishFamily, 'fried_dish', `High-protein plan must not include fried dish: ${dish.title}`);
        }
      }
    }

    assert.ok(pestoMeals <= 1, `Weekly plan ${model.id} had ${pestoMeals} pesto meals (max 1 allowed!)`);

    // Verify breakfast ingredients are tracked in the Whole-Pack Ledger
    const hasBreakfastLedgerUsage = plan.ledger.wholePackItems.some((wp) =>
      wp.usedInMeals.some((u) => u.slot === 'breakfast')
    );
    assert.ok(hasBreakfastLedgerUsage, `Whole-pack ledger in ${model.id} must include real breakfast BOM ingredients`);
  }
});

test('ShoppingListService (TASK-REAL-05) — Zero Esselunga, Real Rapallo Stores & Semantic Shelf Plan B', async () => {
  const shop = new ShoppingListService({
    storagePath: path.join(os.tmpdir(), `basilico-shop-real05-${Date.now()}.json`)
  });

  shop.addItem({
    name: 'Filetto di Orata Fresca',
    domain: 'food_human',
    packsToBuy: 1,
    packSizeGrams: 250,
    unitPriceEur: 4.9,
    onPromo: true,
    preferredStoreId: 'rapallo-basko-colombo',
    preferredChain: 'Basko'
  });
  const state = shop.addItem({
    name: 'Sgrassatore Cucina Alcalino',
    domain: 'home_cleaning',
    packsToBuy: 1,
    unitPriceEur: 2.49,
    onPromo: true,
    preferredStoreId: 'rapallo-tigota-lamarmora',
    preferredChain: 'Tigotà'
  });

  // 1. Verify zero non-existent chains ("Esselunga") and real Rapallo store names
  const simJson = JSON.stringify(state.storeSimulations);
  assert.ok(!/esselunga/i.test(simJson), 'Rapallo store simulator must NEVER reference Esselunga');
  assert.ok(
    state.storeSimulations[0].estimatedTotalEur >= state.storeSimulations[1].estimatedTotalEur,
    '2-store optimum must be <= 1-store cost'
  );
  assert.ok(
    state.storeSimulations[1].estimatedTotalEur >= state.storeSimulations[2].estimatedTotalEur,
    '3-store optimum must be <= 2-store cost'
  );

  // 2. Verify semantic Shelf Plan B excludes nameless tiles ("Al Kg") and cheese for Dany
  const fishItem = state.items.find((i) => /Orata/i.test(i.name));
  const planB = await shop.getShelfPlanB(fishItem.id);
  assert.ok(planB.planBAlternatives.length > 0, 'Must find real Rapallo fish/aisle substitutes');
  for (const alt of planB.planBAlternatives) {
    assert.notEqual(alt.title.trim().toLowerCase(), 'al kg', 'Must never return nameless "Al Kg" tile as Plan B');
    assert.ok(!/formagg|mozzarell|robiola|gorgonzola/i.test(alt.title), `Plan B "${alt.title}" must respect Dany profile`);
  }
});
