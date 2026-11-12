/**
 * Basilico — Unit Tests for Zero-Waste Whole-Pack Meal Planner & Multi-Store Shopping List (ADR-0012 / TASK-M6-01)
 * Location: tests/unit/meal_planner_zero_waste.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { MealPlannerService } from '../../server/services/mealPlannerService.js';
import { ShoppingListService } from '../../server/services/shoppingListService.js';
import { PantryService } from '../../server/services/pantryService.js';

function makeTmpDir(prefix = 'basilico-m6-unit-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test('MealPlannerService — 6 Neo-Dieta Models, Boat/Land Day Modes, Whole-Pack Chaining & Honest Residuals', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const planner = new MealPlannerService({
    storagePath: path.join(tmpDir, 'weekly_plan.json'),
    pantryService: pantry
  });

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

test('MealPlannerService — Honest Whole-Recipe Budget Governance (Never Removes Single Ingredients)', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const planner = new MealPlannerService({
    storagePath: path.join(tmpDir, 'weekly_plan.json'),
    pantryService: pantry
  });

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

test('ShoppingListService — Domain Separation, 1/2/3 Store Simulations & Shelf Plan B', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const planner = new MealPlannerService({
    storagePath: path.join(tmpDir, 'weekly_plan.json'),
    pantryService: pantry
  });
  const shop = new ShoppingListService({
    storagePath: path.join(tmpDir, 'shopping_list.json'),
    pantryService: pantry
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

test('MealPlannerService (M-P1-17) — 21/21 Unique Meals (7 Distinct Breakfasts), Adjacent-Day Spacing & Diet Purity Across All 6 Models', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const planner = new MealPlannerService({
    storagePath: path.join(tmpDir, 'weekly_plan.json'),
    pantryService: pantry
  });
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
    let prevDayFamilies = new Set();

    for (const day of plan.days) {
      // 1. Real Breakfast with CREA BOM — strictly unique across all 7 days (21/21 unique meals!)
      assert.ok(day.breakfast?.dish, `Day ${day.dayIndex} in ${model.id} must have a real breakfast dish`);
      assert.equal(day.breakfast.dish.course, 'colazione');
      assert.ok(day.breakfast.dish.bom.length >= 2);
      assert.ok(!dishIds.has(day.breakfast.dish.id), `Duplicate breakfast ID ${day.breakfast.dish.id} in ${model.id}`);
      dishIds.add(day.breakfast.dish.id);
      if (day.breakfast.dish.canonicalTwinKey) {
        assert.ok(
          !twinKeys.has(day.breakfast.dish.canonicalTwinKey),
          `Duplicate breakfast twin "${day.breakfast.dish.canonicalTwinKey}" in ${model.id}`
        );
        twinKeys.add(day.breakfast.dish.canonicalTwinKey);
      }

      // 2. Boat day lunches MUST be strictly cold-safe (zero hot pasta / stove dishes)
      if (day.dayMode === 'boat_day') {
        assert.equal(
          day.lunch.dish.boatSafeCold,
          true,
          `Boat lunch "${day.lunch.dish.title}" in ${model.id} must be cold-safe`
        );
      }

      // 3. No double pasta/risotto on the same day & no same-day dishFamily clash
      assert.ok(
        !(day.lunch.dish.course === 'primo' && day.dinner.dish.course === 'primo'),
        `Day ${day.dayName} in ${model.id} must not schedule primo at both lunch and dinner`
      );
      assert.notEqual(
        day.lunch.dish.dishFamily,
        day.dinner.dish.dishFamily,
        `Same-day dishFamily collision on ${day.dayName} in ${model.id}`
      );

      const currentDayFamilies = new Set();
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

        // Strict adjacent-day dishFamily spacing
        assert.ok(
          !prevDayFamilies.has(dish.dishFamily),
          `Adjacent-day dishFamily "${dish.dishFamily}" repeated on Day ${day.dayIndex} in ${model.id}`
        );
        currentDayFamilies.add(dish.dishFamily);

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
      prevDayFamilies = currentDayFamilies;
    }

    assert.equal(dishIds.size, 21, `All 21 meals (7 breakfasts + 7 lunches + 7 dinners) must be unique in ${model.id}`);
    assert.ok(pestoMeals <= 1, `Weekly plan ${model.id} had ${pestoMeals} pesto meals (max 1 allowed!)`);

    const hasBreakfastLedgerUsage = plan.ledger.wholePackItems.some((wp) =>
      wp.usedInMeals.some((u) => u.slot === 'breakfast')
    );
    assert.ok(hasBreakfastLedgerUsage, `Whole-pack ledger in ${model.id} must include real breakfast BOM ingredients`);
  }
});

test('MealPlannerService (M-P1-18 & M-P2-07) — swapMealInPlan Rotation Without Oscillation & Multi-Pack Non-Double-Spent Pantry Ledger', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const planner = new MealPlannerService({
    storagePath: path.join(tmpDir, 'weekly_plan.json'),
    pantryService: pantry
  });

  const initial = await planner.generateWeeklyPlan({
    modelId: 'ligurian_traditional',
    daysCount: 7,
    servings: 1,
    budgetEur: 45,
    profileId: 'dany'
  });

  // 4 consecutive swaps on Day 1 Lunch must rotate through distinct valid dishes (zero A<->B loop!)
  const seenSwapIds = new Set([initial.days[0].lunch.dish.id]);
  for (let step = 0; step < 3; step++) {
    const swapped = await planner.swapMealInPlan({ dayIndex: 1, slot: 'lunch' });
    const nextLunch = swapped.days[0].lunch.dish;
    const sameDayDinner = swapped.days[0].dinner.dish;
    assert.ok(!seenSwapIds.has(nextLunch.id), `Swap #${step + 1} oscillated back to ${nextLunch.id}`);
    seenSwapIds.add(nextLunch.id);
    assert.notEqual(nextLunch.dishFamily, sameDayDinner.dishFamily, 'Swap must preserve same-day dishFamily diversity');
    assert.equal(swapped.withinBudget, swapped.ledger.totalCheckoutCashEur <= swapped.budgetEur);
  }

  // Multi-pack pantry sum (100g opened + 500g closed = 600g) AND zero double-spend across distinct BOM keys!
  const multiPackPantry = [
    { id: 'p1', title: 'Spaghetti di Semola Rummo', zone: 'dry_pantry', status: 'opened', remainingWeightGrams: 100, creaFoodId: '000800' },
    { id: 'p2', title: 'Spaghetti di Semola Barilla', zone: 'dry_pantry', status: 'closed', remainingWeightGrams: 500, creaFoodId: '000800' }
  ];
  const syntheticDays = [
    {
      dayIndex: 1,
      dayName: 'Lunedì',
      dayMode: 'land_day',
      breakfast: { dish: null },
      lunch: {
        dish: {
          id: 'd1',
          title: 'Spaghetti aglio olio',
          bom: [{ creaId: '000800', name: 'Spaghetti', rawGramsTotal: 400, packSizeGrams: 500, euroPerKg: 2.6 }]
        }
      },
      dinner: {
        dish: {
          id: 'd2',
          title: 'Spaghetti alle erbe',
          bom: [{ creaId: null, name: 'Spaghetti di semola', rawGramsTotal: 400, packSizeGrams: 500, euroPerKg: 2.6 }]
        }
      }
    }
  ];

  const ledger = planner._computeWholePackLedger(syntheticDays, multiPackPantry);
  const byCrea = ledger.wholePackItems.find((x) => x.key === '000800');
  const byLex = ledger.wholePackItems.find((x) => x.key !== '000800');
  assert.equal(byCrea.availableInPantryGrams, 600, 'Must sum both 100g + 500g pantry packs');
  assert.equal(byCrea.fromPantryGrams, 400);
  assert.equal(byCrea.packsToBuy, 0);
  assert.equal(byLex.fromPantryGrams, 200, 'Second BOM key may only claim the remaining 200g, never double-spending 600g!');
  assert.equal(byLex.packsToBuy, 1);
});

test('ShoppingListService (M-P0-02, M-P1-19, M-P1-20) — Specialist 1-Store Mode, Zero Ghost Stops, Coherent Plan B & Idempotent Pantry Load', async (t) => {
  const tmpDir = makeTmpDir();
  t.after(() => fs.rmSync(tmpDir, { recursive: true, force: true }));

  const pantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
  const shop = new ShoppingListService({
    storagePath: path.join(tmpDir, 'shopping_list.json'),
    pantryService: pantry
  });

  // 1. M-P0-02: Non-numeric inputs throw 400 and never poison JSON state
  assert.throws(
    () => shop.addItem({ name: 'Pane', unitPriceEur: 'abc', packsToBuy: 'bad' }),
    (err) => err.status === 400
  );

  // 2. M-P1-19: Single Unieuro pan cart MUST pick Unieuro in 1-Store mode and prune 0-item ghost stops in 2/3-Store
  const panOnlyState = shop.addItem({
    name: 'Padella Antiaderente Lagostina 28cm',
    domain: 'kitchen_cookware',
    packsToBuy: 1,
    unitPriceEur: 29.9,
    onPromo: true,
    preferredStoreId: 'rapallo-unieuro-matteotti',
    preferredChain: 'Unieuro'
  });
  assert.match(panOnlyState.storeSimulations[0].storesVisited[0], /Unieuro/i);
  assert.equal(panOnlyState.storeSimulations[0].estimatedTotalEur, 29.9);
  assert.equal(panOnlyState.storeSimulations[1].storesVisited.length, 1, 'Must prune 0-item ghost stops in 2-store mode');
  assert.equal(panOnlyState.storeSimulations[2].storesVisited.length, 1, 'Must prune 0-item ghost stops in 3-store mode');
  assert.ok(!/g\)/i.test(panOnlyState.whatsappExportText), 'Non-food items must export pieces (pz.), not grams');

  // Plan B on frying pan must ONLY return cookware/pots/pans, NEVER dishwashers, kettles, or security cameras!
  const panItem = panOnlyState.items[0];
  const panPlanB = await shop.getShelfPlanB(panItem.id);
  for (const alt of panPlanB.planBAlternatives) {
    assert.ok(
      !/\b(lavastovigli\w*|bollitor\w*|telecamer\w*|tv\b|frigorifer\w*|lavatric\w*)\b/i.test(alt.title),
      `Cookware Plan B must never return appliance/electronics "${alt.title}"`
    );
  }
  shop.removeItem(panItem.id);

  // Pet-only item must price Arcaplanet competitively (0.94x, not 1.16x GDO penalty)
  const petState = shop.addItem({
    name: 'Crocchette Gatto Sterilizzato 1.5kg',
    domain: 'pet_care',
    packsToBuy: 1,
    unitPriceEur: 8.9
  });
  assert.match(petState.storeSimulations[0].storesVisited[0], /Arcaplanet/i);
  const petPlanB = await shop.getShelfPlanB(petState.items[0].id);
  for (const alt of petPlanB.planBAlternatives) {
    assert.ok(!/Tigotà/i.test(alt.rationale), 'Pet Plan B rationale must reference Arcaplanet/GDO, not Tigotà');
  }
  shop.removeItem(petState.items[0].id);

  // 3. M-P1-20: Food Plan B coherence (Orata -> fresh/frozen fish, NEVER canned tuna in oil or shrimp crackers; Eggs -> Eggs, NEVER yogurt)
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
  shop.addItem({
    name: 'Uova Fresche Bio 6 pz',
    domain: 'food_human',
    packsToBuy: 1,
    packSizeGrams: 360,
    unitPriceEur: 2.49
  });
  const pastaState = shop.addItem({
    name: 'Filetti di Acciughe Fresche',
    domain: 'food_human',
    packsToBuy: 3,
    packSizeGrams: 250,
    unitPriceEur: 3.5
  });

  const fishItem = pastaState.items.find((i) => /Orata/i.test(i.name));
  const fishPlanB = await shop.getShelfPlanB(fishItem.id);
  assert.ok(fishPlanB.planBAlternatives.length > 0);
  for (const alt of fishPlanB.planBAlternatives) {
    assert.ok(
      !/\b(all['’\s]*olio|sott['’\s]*olio|in\s+scatola|ciald\w*|cracker\w*|formagg\w*|mozzarell\w*)\b/i.test(alt.title),
      `Fresh fish Plan B must never return canned oil fish or crackers: "${alt.title}"`
    );
  }

  const eggItem = pastaState.items.find((i) => /Uova/i.test(i.name));
  const eggPlanB = await shop.getShelfPlanB(eggItem.id);
  for (const alt of eggPlanB.planBAlternatives) {
    assert.ok(!/\b(yogurt|yomo|latte|prosciutto|salame)\b/i.test(alt.title), `Egg Plan B must never return "${alt.title}"`);
  }

  // replaceItemWithPlanB updates packSizeGrams & totalPurchasedGrams when replacing 250g with 1 kg
  const replaced = shop.replaceItemWithPlanB(fishItem.id, {
    title: 'Branzino Fresco Pulito 1 kg',
    price: 9.9,
    chainName: 'Coop Liguria'
  });
  const updatedFish = replaced.items.find((i) => i.id === fishItem.id);
  assert.equal(updatedFish.packSizeGrams, 1000);
  assert.equal(updatedFish.totalPurchasedGrams, 1000);

  // completeShoppingAndLoadPantry inserts 3 individual 250g closed packs for packsToBuy=3 and clears cart (0 duplicates on 2nd click!)
  const load1 = shop.completeShoppingAndLoadPantry();
  assert.equal(load1.loadedCount, 5); // 1 fish + 1 eggs + 3 individual anchovy packs
  assert.equal(load1.shoppingList.items.length, 0, 'Active cart must clear after loading into pantry');
  assert.equal(load1.shoppingList.subtotals.totalItemsCount, 0);

  const anchovyPacksInPantry = load1.loadedItems.filter((p) => /Filetti di Acciughe Fresche/i.test(p.title));
  assert.equal(anchovyPacksInPantry.length, 3, 'packsToBuy=3 must create 3 separate closed 250g packages');
  assert.ok(anchovyPacksInPantry.every((p) => p.initialWeightGrams === 250 && p.status === 'closed'));

  const load2 = shop.completeShoppingAndLoadPantry();
  assert.equal(load2.loadedCount, 0, 'Repeat click on completeShoppingAndLoadPantry must NOT duplicate pantry items');
});
