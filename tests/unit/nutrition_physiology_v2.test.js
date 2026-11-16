/**
 * Basilico 2.0 — Unit & Router Tests for Cooked Meal Physiology, Bioavailability & Adaptive Coaching (ADR-0015 / TASK-V2-03)
 * Location: tests/unit/nutrition_physiology_v2.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {
  nutritionPhysiologyService,
  evaluateCookedMealPhysiology,
  adaptCoachingPlan,
  auditReceiptsNutritionalCoverage
} from '../../server/services/nutritionPhysiologyService.js';
import nutritionCoachRouter from '../../server/routes/nutritionCoach.js';

describe('ADR-0015 / TASK-V2-03: Cooked Meal Physiology, Bioavailability & Adaptive Nutrition Coach', () => {
  it('1. exposes 30+ CREA nutrients on cooked meals, supports positional & object signatures, and preserves null when untabulated (ADR-0006)', () => {
    const posRes = evaluateCookedMealPhysiology(
      [{ creaId: '120010', grams: 150 }],
      'steamed',
      'none',
      10,
      0
    );
    const objRes = evaluateCookedMealPhysiology({
      ingredients: [{ creaId: '120010', grams: 150 }],
      cookingMethod: 'steamed',
      liquidFate: 'none',
      addedFatGrams: 10,
      cooledHours: 0
    });

    assert.ok(posRes.nutrientsCount >= 24, `Expected >=24 nutrients, got ${posRes.nutrientsCount}`);
    assert.equal(posRes.nutrients.kcal, objRes.nutrients.kcal);
    assert.equal(posRes.nutrients.proteinG, objRes.nutrients.proteinG);
    assert.ok(posRes.nutrients.epaDhaG > 0.5, 'Steamed anchovies must retain rich marine EPA+DHA');
    assert.ok(posRes.weights.cookedWeightGrams > 120, 'Cooked weight must include fish yield + added EVO fat');

    // Untabulated retention factors in USDA Release 6 must stay explicitly null on ingredient metadata (never synthetic)
    const fishIng = posRes.ingredients.find((i) => i.creaId === '120010');
    assert.equal(fishIng.appliedRetentions.copperMg, null);
  });

  it('2. applies USDA Release 6 / Bognár retention: steaming vs boiling-drained vs soup-liquid-kept on brassicas & fish', () => {
    const rawIngredients = [{ creaId: '005090', name: 'Broccoletti di rapa, crudi', grams: 200 }];

    const boiledDrained = evaluateCookedMealPhysiology(rawIngredients, 'boiled_drained', 'discarded', 0, 0);
    const steamed = evaluateCookedMealPhysiology(rawIngredients, 'steamed', 'none', 0, 0);
    const soupRetained = evaluateCookedMealPhysiology(rawIngredients, 'boiled_drained', 'retained', 0, 0);

    // Vitamin C & Folate: steamed >> boiled_drained
    assert.ok(
      steamed.nutrients.vitaminCMg > boiledDrained.nutrients.vitaminCMg * 1.45,
      `Steamed Vit C (${steamed.nutrients.vitaminCMg}) must exceed boiled-drained (${boiledDrained.nutrients.vitaminCMg})`
    );
    assert.ok(
      steamed.nutrients.folateUg > boiledDrained.nutrients.folateUg * 1.4,
      `Steamed folate (${steamed.nutrients.folateUg}) must exceed boiled-drained folate (${boiledDrained.nutrients.folateUg})`
    );

    // ADR-0006 check: when CREA omits Folate on 005180, cooked folateUg remains honestly null (never 0 or invented)
    const unmeasuredFolateVeg = evaluateCookedMealPhysiology([{ creaId: '005180', grams: 200 }], 'steamed', 'none', 0, 0);
    assert.equal(unmeasuredFolateVeg.nutrients.folateUg, null);

    // Potassium & Magnesium mineral leaching: soup (liquid kept) >> boiled_drained (water discarded)
    assert.equal(soupRetained.cookingContext.cookingMethod, 'stewed_liquid_kept');
    assert.ok(
      soupRetained.nutrients.potassiumMg > boiledDrained.nutrients.potassiumMg * 1.35,
      `Retained broth K (${soupRetained.nutrients.potassiumMg}) must prevent leaching loss (${boiledDrained.nutrients.potassiumMg})`
    );

    // Marine EPA+DHA thermal protection: gentle steaming > high-temperature pan searing
    const fishSteamed = evaluateCookedMealPhysiology([{ creaId: '123000', grams: 150 }], 'steamed', 'none', 5, 0);
    const fishHighSear = evaluateCookedMealPhysiology([{ creaId: '123000', grams: 150 }], 'pan_seared_high', 'retained', 5, 0);
    assert.ok(fishSteamed.nutrients.epaDhaG > fishHighSear.nutrients.epaDhaG);
  });

  it('3. Zero-Cheese Calcium Bioavailability: distinguishes oxalate-trapped spinach (<10%) from low-oxalate brassicas/arugula & whole anchovies (>30%)', () => {
    const spinachMeal = evaluateCookedMealPhysiology(
      [{ creaId: '005700', name: 'Spinaci, crudi', grams: 200 }],
      'steamed',
      'none',
      8,
      0
    );
    assert.ok(spinachMeal.nutrients.calciumMg > 140, 'Spinach has high gross CREA calcium');
    assert.equal(spinachMeal.bioavailability.calcium.highBioavailCalciumMg, 0);
    assert.ok(spinachMeal.bioavailability.calcium.oxalateInhibitedCalciumMg > 140);
    assert.equal(spinachMeal.bioavailability.calcium.zeroCheeseCalciumTier, 'oxalate_trapped_poor');
    assert.ok(spinachMeal.badges.some((b) => b.code === 'CA_OXALATE_INHIBITED'));

    const brassicaAnchovyMeal = evaluateCookedMealPhysiology(
      [
        { creaId: '005090', name: 'Broccoletti di rapa, crudi', grams: 150 },
        { creaId: '120010', name: 'Acciuga o alice', grams: 100 }
      ],
      'pan_seared_gentle',
      'retained',
      8,
      0
    );
    assert.ok(brassicaAnchovyMeal.bioavailability.calcium.highBioavailCalciumMg > 250);
    assert.equal(brassicaAnchovyMeal.bioavailability.calcium.zeroCheeseCalciumTier, 'high_bioavailability_verified');
    assert.ok(brassicaAnchovyMeal.badges.some((b) => b.code === 'CA_HIGH_BIOAVAIL'));

    // Guardrail: boneless canned tuna fillets must NOT be classified as bone-in high-calcium fish
    const tunaClass = nutritionPhysiologyService.classifyCalciumBioavailability({
      name: "Tonno sott'olio, sgocciolato",
      category: 'Prodotti della pesca'
    });
    assert.notEqual(tunaClass.tierId, 'high_gt_30pct');
  });

  it('4. Iron + Vitamin C (>=30 mg) activation & cis-Lycopene thermal EVO micellization', () => {
    // Dry lentils cooked alone: phytate-inhibited non-heme iron
    const plainLentils = evaluateCookedMealPhysiology(
      [{ creaId: '004500', name: 'Lenticchie, secche', grams: 80 }],
      'boiled_drained',
      'discarded',
      5,
      0
    );
    assert.equal(plainLentils.bioavailability.iron.isVitaminCActivated, false);
    assert.equal(plainLentils.bioavailability.iron.ironTier, 'non_heme_inhibited');

    // Same lentils + fresh raw lemon juice squeezed off-heat (>=30 mg Vitamin C)
    const lentilsWithRawLemon = evaluateCookedMealPhysiology(
      [
        { creaId: '004500', name: 'Lenticchie, secche', grams: 80 },
        { creaId: '008040', name: 'Limoni, succo', grams: 75, cookingMethod: 'raw' }
      ],
      'stewed_liquid_kept',
      'retained',
      8,
      0
    );
    assert.ok(lentilsWithRawLemon.nutrients.vitaminCMg >= 30);
    assert.equal(lentilsWithRawLemon.bioavailability.iron.isVitaminCActivated, true);
    assert.equal(lentilsWithRawLemon.bioavailability.iron.ironTier, 'non_heme_vit_c_activated');
    assert.ok(lentilsWithRawLemon.badges.some((b) => b.code === 'FE_VITC_SYNERGY'));

    // Tomato sauce cooked with >=5g EVO oil -> cis-lycopene unlocked vs raw fat-free warning
    const cookedTomatoEvo = evaluateCookedMealPhysiology(
      [{ creaId: '006610', name: 'Pomodori, maturi, freschi', grams: 250 }],
      'stewed_liquid_kept',
      'retained',
      10,
      0
    );
    assert.equal(cookedTomatoEvo.bioavailability.liposoluble.cisLycopeneUnlocked, true);
    assert.ok(cookedTomatoEvo.badges.some((b) => b.code === 'LYCOPENE_CIS_EVO_UNLOCKED'));

    const fatFreeCarotenoids = evaluateCookedMealPhysiology(
      [{ creaId: '006610', name: 'Pomodori, maturi, freschi', grams: 250 }],
      'raw',
      'none',
      0,
      0
    );
    assert.equal(fatFreeCarotenoids.bioavailability.liposoluble.micellarStatus, 'suboptimal_low_lipid');
  });

  it('5. Boat-Day Resistant Starch RS3 (>=12h at +4°C) and Cereal+Legume Amino Acid Complementation (CREA Sec. 5)', () => {
    // Freshly boiled hot rice -> RS3 false; same rice cooled 14h for boat cooler -> RS3 true
    const hotRice = evaluateCookedMealPhysiology(
      [{ creaId: '000100', name: 'Riso, brillato', grams: 90 }],
      'boiled_drained',
      'discarded',
      10,
      0
    );
    const coldBoatRice = evaluateCookedMealPhysiology(
      [{ creaId: '000100', name: 'Riso, brillato', grams: 90 }],
      'boiled_drained',
      'discarded',
      10,
      14
    );
    assert.equal(hotRice.bioavailability.resistantStarch.rs3Activated, false);
    assert.equal(coldBoatRice.bioavailability.resistantStarch.rs3Activated, true);
    assert.equal(coldBoatRice.bioavailability.resistantStarch.boatDayAntiDrowsinessIdeal, true);
    assert.ok(coldBoatRice.badges.some((b) => b.code === 'RS3_RETROGRADED_STARCH'));

    // Pasta alone (limiting Lysine ~45%) + Lentils alone (limiting Sulfur AA ~82%) -> Combined Pasta & Lenticchie = 100%!
    const pastaAlone = evaluateCookedMealPhysiology([{ creaId: '000800', grams: 80 }], 'boiled_drained', 'discarded', 0, 0);
    const lentilsAlone = evaluateCookedMealPhysiology([{ creaId: '004500', grams: 60 }], 'stewed_liquid_kept', 'retained', 0, 0);
    const pastaAndLentils = evaluateCookedMealPhysiology(
      [
        { creaId: '000800', grams: 80 },
        { creaId: '004500', grams: 60 }
      ],
      'stewed_liquid_kept',
      'retained',
      10,
      0
    );

    assert.ok(pastaAlone.bioavailability.aminoAcids.chemicalScorePct < 55);
    assert.equal(pastaAlone.bioavailability.aminoAcids.limitingAminoAcid, 'lysine');
    assert.ok(lentilsAlone.bioavailability.aminoAcids.chemicalScorePct < 90);
    assert.equal(lentilsAlone.bioavailability.aminoAcids.limitingAminoAcid, 'sulfurAminoAcids');
    assert.equal(pastaAndLentils.bioavailability.aminoAcids.chemicalScorePct, 100);
    assert.equal(pastaAndLentils.bioavailability.aminoAcids.complementationAchieved, true);
    assert.ok(pastaAndLentils.badges.some((b) => b.code === 'AA_COMPLEMENTATION_COMPLETE'));
  });

  it('6. Adaptive Coaching ("eat_out" & "emergency_5min"): non-punitive rebalancing, T_open perishable rescue, and Zero-Cheese safety', () => {
    const mockPlan = {
      planId: 'plan-test',
      profileId: 'dany',
      days: [
        {
          dayIndex: 1,
          dayName: 'Martedì',
          dayMode: 'land_day',
          lunch: { slot: 'lunch', consumesOpenedPerishable: false, dish: { id: 'd1', title: 'Spaghetti al Pomodoro', boatSafeCold: false, bom: [] } },
          dinner: {
            slot: 'dinner',
            consumesOpenedPerishable: true,
            dish: {
              id: 'd2',
              title: 'Alici al Limone in Padella',
              boatSafeCold: false,
              bom: [{ creaId: '120010', name: 'Alici fresche', rawGramsPerServing: 180 }]
            }
          }
        },
        {
          dayIndex: 2,
          dayName: 'Mercoledì',
          dayMode: 'boat_day',
          lunch: { slot: 'lunch', consumesOpenedPerishable: false, dish: { id: 'd3', title: 'Insalata di Farro Barca', boatSafeCold: true, bom: [] } },
          dinner: { slot: 'dinner', consumesOpenedPerishable: false, dish: { id: 'd4', title: 'Zuppa di Ceci', boatSafeCold: false, bom: [] } }
        }
      ]
    };

    const pantryItems = [
      { id: 'p-alici', title: 'Alici fresche del Golfo', status: 'opened', hoursRemaining: 24, remainingWeightGrams: 180 },
      { id: 'p-mozz', title: 'Mozzarella Fior di Latte', status: 'opened', hoursRemaining: 20, remainingWeightGrams: 125 },
      { id: 'p-ceci', title: 'Ceci in vetro', status: 'opened', hoursRemaining: 48, remainingWeightGrams: 200 }
    ];

    // 1. "Ho mangiato fuori" on Tuesday dinner: rescues hot Alici dish to Wednesday DINNER (skipping Wednesday boat_day lunch!)
    const eatOutRes = adaptCoachingPlan({
      plan: mockPlan,
      eventType: 'eat_out',
      restaurantDish: {
        title: 'Pansotti in Salsa di Noci (Trattoria Tigullio)',
        nutritionPerServing: { energyKcal: 1180 }
      },
      pantryItems,
      profileId: 'dany',
      currentDayIndex: 1,
      currentSlot: 'dinner'
    });

    assert.equal(eatOutRes.nonPunitiveGuarantee, true);
    assert.equal(eatOutRes.dailyCalorieFloorRespected, true);
    assert.ok(eatOutRes.gentleAdjustedDailyTargetKcal >= 1800, 'Must never apply punitive starvation calorie cuts');
    assert.ok(eatOutRes.shiftedDishInfo, 'Skipped T_open perishable dish must be rescued into next 48h');
    assert.equal(eatOutRes.shiftedDishInfo.movedToDayIndex, 2);
    assert.equal(eatOutRes.shiftedDishInfo.movedToSlot, 'dinner', 'Hot fish dish must NOT be placed on boat_day cold lunch');

    // 2. "Emergenza 5 minuti / Sono stanco" for profile 'dany' (Zero Formaggi): zero-cook, <=5 min, zero cheese!
    const emergencyRes = adaptCoachingPlan({
      eventType: 'emergency_5min',
      pantryItems,
      profileId: 'dany'
    });

    assert.equal(emergencyRes.eventType, 'emergency_5min');
    assert.ok(emergencyRes.rescueMeals.length >= 2);
    for (const meal of emergencyRes.rescueMeals) {
      assert.ok(meal.prepMinutes <= 5);
      assert.equal(meal.cookwareCount, 0);
      assert.ok(meal.physiology.nutrients.proteinG >= 14);
      const text = `${meal.title} ${meal.ingredients?.map((i) => i.name).join(' ') || ''}`.toLowerCase();
      assert.ok(!/mozzarella|formaggio|parmigiano|ricotta/.test(text), 'Zero Formaggi profile must never receive cheese rescue meals');
    }
  });

  it('7. Passive Receipt Audit (ADR-0006): ignores guest receipts, never invents 250g on unweighed lines, flags Spinach Oxalate Trap, and serves /api/nutrition-coach routes', async () => {
    const receipts = [
      {
        id: 'r-home-1',
        isGuests: false,
        lines: [
          { title: 'Olio Extra Vergine 100% Italiano 1000 ml', packVolumeMl: 1000, domain: 'food_human' },
          { title: 'Spinaci Freschi in Busta', packWeightGrams: null, domain: 'food_human' },
          { title: 'Spaghetti Trafilati Bronzo 500 g', packWeightGrams: 500, domain: 'food_human' },
          { title: 'Detersivo Piatti Neutro', packVolumeMl: 1000, domain: 'home_cleaning' }
        ]
      },
      {
        id: 'r-guests-party',
        isGuests: true,
        lines: [
          { title: 'Filetti di Alici del Mar Ligure 300 g', packWeightGrams: 300, domain: 'food_human' },
          { title: 'Broccoletti di Rapa 500 g', packWeightGrams: 500, domain: 'food_human' }
        ]
      }
    ];

    const audit = await auditReceiptsNutritionalCoverage(receipts, {
      windowDays: 21,
      profileId: 'dany'
    });

    assert.equal(audit.auditedPersonalReceiptsCount, 1);
    assert.equal(audit.excludedGuestReceiptsCount, 1);
    assert.equal(audit.syntheticWeightFallbackUsed, false);
    assert.equal(audit.unweighedLinesRespectedCount, 1, 'Spinaci without weight must remain unweighed, never 250g');
    assert.equal(audit.gaps[0].groupId, 'calcium_high_bioavail_zero_dairy', 'Zero-Cheese profile must prioritize high-bioavail Calcium gap');
    assert.ok(audit.warnings.some((w) => w.groupId === 'calcium_oxalate_trap_notice'));
    assert.ok(audit.suggestedRapalloAction);

    // Smoke-test Express router `/api/nutrition-coach`
    const app = express();
    app.use(express.json());
    app.use('/api/nutrition-coach', nutritionCoachRouter);
    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });

    try {
      const baseUrl = `http://127.0.0.1:${server.address().port}/api/nutrition-coach`;

      const presetsRes = await fetch(`${baseUrl}/presets?presetId=sport_recomp&weightKg=75&heightCm=180&ageYears=35&sex=M`);
      assert.equal(presetsRes.status, 200);
      const presetsJson = await presetsRes.json();
      assert.equal(presetsJson.presets.length, 4);
      assert.equal(presetsJson.activeTargets.mode, 'personalized_mifflin_larn');

      const evalRes = await fetch(`${baseUrl}/evaluate-meal`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: [{ creaId: '005460', grams: 100 }],
          cookingMethod: 'raw'
        })
      });
      assert.equal(evalRes.status, 200);
      const evalJson = await evalRes.json();
      assert.equal(evalJson.bioavailability.calcium.zeroCheeseCalciumTier, 'high_bioavailability_verified');

      const guideRes = await fetch(`${baseUrl}/bioavailability-guide?profileId=dany`);
      assert.equal(guideRes.status, 200);
      const guideJson = await guideRes.json();
      assert.ok(guideJson.pillars.length >= 5);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
