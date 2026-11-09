/**
 * Basilico — Deterministic Zero-Waste Whole-Pack Weekly Meal Planner (ADR-0012 / TASK-M6-01)
 * Location: server/services/mealPlannerService.js
 *
 * Implements:
 *  1. 6 Immediate "Neo-Dieta" Entry Models:
 *     - 'balanced_daily' (Equilibrata Quotidiana)
 *     - 'ligurian_traditional' (Tradizionale Ligure & Italiana)
 *     - 'promo_driven_neodiet' (Neo-Dieta Offerte Rapallo & Nutrienti/€)
 *     - 'high_protein_sport' (Alta Densità Proteica & Recupero)
 *     - 'pescetarian_sea' (Pescetariana & Mare del Golfo)
 *     - 'tigullio_gourmet_home' (Esplorazione Ristoranti del Tigullio a Casa)
 *  2. Physical Day Modes ('boat_day', 'land_day', 'eat_out')
 *  3. Step 1: Opened Perishable Priority (consumes opened pantry items within T_open first)
 *  4. Step 2: Whole-Pack Chaining ($K_p = \lceil Q_p / S_p \rceil$) with full traceability of shared packages
 *     and honest residual pantry return (never masks leftovers via `required_g = total_available_g`)
 *  5. Step 3: Honest Whole-Recipe Budget Substitution (never removes single ingredients via `items.pop()`)
 */

import { recipeAndArbitrageService } from './recipeAndArbitrageService.js';
import { pantryService } from './pantryService.js';
import { offerService, normalizeSearchToken } from './offerService.js';
import { userProfileService } from './userProfileService.js';

export const NEO_DIETA_MODELS = [
  {
    id: 'balanced_daily',
    name: '1. Equilibrata Quotidiana (LARN & Mediterranea)',
    shortLabel: 'Equilibrata Quotidiana',
    icon: '🌿',
    description:
      'Rotazione bilanciata di pesce del Mar Ligure, legumi, verdure di stagione e cereali integrali/semola per 1 persona.'
  },
  {
    id: 'ligurian_traditional',
    name: '2. Tradizionale Ligure & Cambusa di Mare',
    shortLabel: 'Tradizionale Ligure',
    icon: '⚓',
    description:
      'Classici della Riviera di Levante (acciughe, seppie, torte verdi, minestre e piatti da barca) adattati senza formaggi.'
  },
  {
    id: 'promo_driven_neodiet',
    name: '3. Neo-Dieta Offerte Rapallo (Max Nutrienti/€)',
    shortLabel: 'Neo-Dieta Offerte Rapallo',
    icon: '🏷️',
    description:
      'Costruita al 100% attorno ai migliori sconti reali della settimana nei supermercati di Rapallo e alla densità CREA per euro.'
  },
  {
    id: 'high_protein_sport',
    name: '4. Alta Densità Proteica & Recupero Sportivo',
    shortLabel: 'Alta Densità Proteica',
    icon: '💪',
    description:
      'Priorità a pesce azzurro, carni bianche, uova e legumi ad alto valore biologico e aminoacidi essenziali.'
  },
  {
    id: 'pescetarian_sea',
    name: '5. Pescetariana & Mare del Golfo',
    shortLabel: 'Pescetariana & Mare',
    icon: '🐟',
    description:
      'Esclusivamente prodotti ittici del Golfo/supermercati di Rapallo, legumi e ortaggi ricchi di EPA/DHA e iodio.'
  },
  {
    id: 'tigullio_gourmet_home',
    name: '6. Esplorazione Ristoranti del Tigullio a Casa',
    shortLabel: 'Ristoranti Tigullio a Casa',
    icon: '🦞',
    description:
      'Riproduce nella tua cucina i grandi piatti di Puny, Da Ö Batti, Cracco Portofino, La Brinca e Zi Ninella con arbitraggio >70%.'
  }
];

const DAY_NAMES_IT = ['Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato', 'Domenica'];

export class MealPlannerService {
  constructor() {
    this._lastGeneratedPlan = null;
  }

  getModels() {
    return NEO_DIETA_MODELS;
  }

  _scoreDishForModel(dish, modelId, openedTokens = [], activeIngredientKeys = new Set()) {
    let score = 10;

    // 1. Opened perishable priority bonus (T_open urgency)
    const dishText = normalizeSearchToken(
      `${dish.title} ${(dish.bom || []).map((b) => b.name).join(' ')}`
    );
    let consumesOpenedPerishable = false;
    for (const tok of openedTokens) {
      if (tok && dishText.includes(tok)) {
        score += 45;
        consumesOpenedPerishable = true;
      }
    }

    // 2. Whole-pack chaining bonus (reuses an ingredient already opened by an earlier meal in the week)
    let sharedPackCount = 0;
    for (const b of dish.bom || []) {
      const k = b.creaId || normalizeSearchToken(b.name);
      if (activeIngredientKeys.has(k)) {
        score += 18;
        sharedPackCount += 1;
      }
    }

    // 3. Model-specific weighting
    if (modelId === 'promo_driven_neodiet') {
      score += (dish.costAndArbitrage?.onPromoIngredientsCount || 0) * 22;
      score += Math.max(0, 20 - (dish.costAndArbitrage?.purePortionCostPerServingEur || 5) * 3);
    } else if (modelId === 'high_protein_sport') {
      score += (dish.nutritionPerServing?.proteinG || 0) * 1.6;
    } else if (modelId === 'pescetarian_sea') {
      if (/\b(acciug\w*|tonno|sgombro|palamita|seppi\w*|gamber\w*|orata|branzino|pesce|calamar\w*|polpo|baccala)\b/.test(dishText)) {
        score += 35;
      }
    } else if (modelId === 'tigullio_gourmet_home') {
      if (dish.sourceType === 'tigullio_restaurant' || dish.sourceType === 'starred_author') {
        score += 30;
      }
      score += (dish.costAndArbitrage?.arbitrageSavingsEur || 0) * 0.8;
    } else if (modelId === 'ligurian_traditional') {
      if (/\b(ligure|genovese|pesto|acciug\w*|pansot\w*|trofie|cappon|brandacujun|cima|torta)\b/.test(dishText)) {
        score += 32;
      }
    } else {
      // balanced_daily
      score += (dish.feasibility?.pantryCoveragePct || 0) * 0.25;
      score += (dish.costAndArbitrage?.onPromoIngredientsCount || 0) * 10;
    }

    return {
      score,
      consumesOpenedPerishable,
      sharedPackCount
    };
  }

  /**
   * Aggregates all BOM ingredients across the planned week into whole supermarket packages:
   *  $K_p = \lceil (Q_p - \text{inPantry}_p) / S_p \rceil$
   * Never masks residuals: explicitly reports `totalRequiredGrams`, `fromPantryGrams`,
   * `netToBuyGrams`, `packsToBuy`, `totalPurchasedGrams`, and `residualReturnedToPantryGrams`.
   */
  _computeWholePackLedger(daysPlan, pantryItems = []) {
    const ledgerMap = new Map();

    for (const day of daysPlan) {
      if (day.dayMode === 'eat_out') continue;
      for (const slot of ['lunch', 'dinner']) {
        const meal = day[slot];
        if (!meal || !meal.dish) continue;
        for (const b of meal.dish.bom || []) {
          const key = b.creaId || normalizeSearchToken(b.name);
          if (!ledgerMap.has(key)) {
            const itemNorm = normalizeSearchToken(b.name);
            const headToken = itemNorm.split(' ').find((w) => w.length >= 4) || itemNorm;
            const pantryMatch = pantryItems.find(
              (p) =>
                p.remainingWeightGrams > 0 &&
                ((b.creaId && p.creaFoodId === b.creaId) ||
                  (headToken && normalizeSearchToken(p.title).includes(headToken)))
            );

            ledgerMap.set(key, {
              key,
              creaId: b.creaId || null,
              name: b.name,
              domain: 'food_human',
              packSizeGrams: b.packSizeGrams || 300,
              euroPerKg: b.euroPerKg || 7.5,
              packPriceEur: Number((((b.euroPerKg || 7.5) * (b.packSizeGrams || 300)) / 1000).toFixed(2)),
              matchedOffer: b.matchedOffer || null,
              availableInPantryGrams: pantryMatch ? Number(pantryMatch.remainingWeightGrams) : 0,
              isOpenedInPantry: pantryMatch ? pantryMatch.status === 'opened' : false,
              totalRequiredGrams: 0,
              usedInMeals: []
            });
          }

          const entry = ledgerMap.get(key);
          entry.totalRequiredGrams = Number((entry.totalRequiredGrams + b.rawGramsTotal).toFixed(1));
          entry.usedInMeals.push({
            dayIndex: day.dayIndex,
            dayName: day.dayName,
            slot,
            dishId: meal.dish.id,
            dishTitle: meal.dish.title,
            gramsUsed: b.rawGramsTotal
          });
        }
      }
    }

    const wholePackItems = [];
    let totalCheckoutCashEur = 0;
    let totalPureConsumedValueEur = 0;
    let totalMenuEquivalentEur = 0;

    for (const day of daysPlan) {
      if (day.dayMode === 'eat_out') continue;
      for (const slot of ['lunch', 'dinner']) {
        if (day[slot]?.dish) {
          totalMenuEquivalentEur += day[slot].dish.costAndArbitrage.totalMenuPriceEur;
        }
      }
    }

    for (const entry of ledgerMap.values()) {
      const fromPantryGrams = Math.min(entry.totalRequiredGrams, entry.availableInPantryGrams);
      const netToBuyGrams = Math.max(0, Number((entry.totalRequiredGrams - fromPantryGrams).toFixed(1)));
      const packsToBuy = netToBuyGrams > 0 ? Math.ceil(netToBuyGrams / entry.packSizeGrams) : 0;
      const totalPurchasedGrams = packsToBuy * entry.packSizeGrams;
      const residualReturnedToPantryGrams = Math.max(
        0,
        Number((fromPantryGrams + totalPurchasedGrams - entry.totalRequiredGrams).toFixed(1))
      );

      const checkoutCostEur = Number((packsToBuy * entry.packPriceEur).toFixed(2));
      const pureConsumedCostEur = Number(((entry.totalRequiredGrams / 1000) * entry.euroPerKg).toFixed(2));

      totalCheckoutCashEur += checkoutCostEur;
      totalPureConsumedValueEur += pureConsumedCostEur;

      wholePackItems.push({
        ...entry,
        fromPantryGrams,
        netToBuyGrams,
        packsToBuy,
        totalPurchasedGrams,
        residualReturnedToPantryGrams,
        checkoutCostEur,
        pureConsumedCostEur,
        isSharedAcrossMultipleMeals: entry.usedInMeals.length > 1
      });
    }

    wholePackItems.sort((a, b) => b.usedInMeals.length - a.usedInMeals.length || b.checkoutCostEur - a.checkoutCostEur);

    return {
      wholePackItems,
      totalCheckoutCashEur: Number(totalCheckoutCashEur.toFixed(2)),
      totalPureConsumedValueEur: Number(totalPureConsumedValueEur.toFixed(2)),
      totalMenuEquivalentEur: Number(totalMenuEquivalentEur.toFixed(2)),
      totalArbitrageSavingsEur: Number((totalMenuEquivalentEur - totalPureConsumedValueEur).toFixed(2))
    };
  }

  /**
   * Generates a complete 7-day (or N-day) zero-waste weekly meal plan.
   */
  async generateWeeklyPlan(options = {}) {
    const modelId = NEO_DIETA_MODELS.some((m) => m.id === options.modelId)
      ? options.modelId
      : 'promo_driven_neodiet';
    const daysCount = Math.max(1, Math.min(14, Number(options.daysCount) || 7));
    const servings = Math.max(1, Math.min(8, Number(options.servings) || 1));
    const budgetEur = Number(options.budgetEur) > 0 ? Number(options.budgetEur) : 65;
    const profileId = options.profileId || userProfileService.getProfileById().id;

    // Default day modes: Fri & Sat as 'boat_day' (Giornata in Barca) unless custom dayModes passed
    const customDayModes = Array.isArray(options.dayModes) ? options.dayModes : null;

    const pantryState = pantryService.getPantryState();
    const openedItems = pantryState.openedPriorityAlerts || [];
    const openedTokens = openedItems
      .map((i) => normalizeSearchToken(i.title).split(' ').find((w) => w.length >= 4))
      .filter(Boolean);

    const catalogRes = await recipeAndArbitrageService.queryDishes({
      servings,
      profileId,
      limit: 240
    });
    const allEvaluated = catalogRes.dishes || [];

    const boatCompatibleDishes = allEvaluated.filter(
      (d) => (d.mealContexts || []).includes('boat_cooler') || d.course === 'antipasto' || d.course === 'piatto_unico_barca'
    );
    const landDishes = allEvaluated;

    const usedDishIds = new Set();
    const activeIngredientKeys = new Set();
    const daysPlan = [];

    for (let dIdx = 0; dIdx < daysCount; dIdx++) {
      const dayName = DAY_NAMES_IT[dIdx % 7];
      const dayMode = customDayModes?.[dIdx] || (dIdx === 4 || dIdx === 5 ? 'boat_day' : 'land_day');

      if (dayMode === 'eat_out') {
        daysPlan.push({
          dayIndex: dIdx + 1,
          dayName,
          dayMode,
          breakfast: { title: 'Colazione a Casa (Caffè, Avena/Pane Tostato & Frutta)', kcal: 320 },
          lunch: null,
          dinner: null
        });
        continue;
      }

      // Select Lunch (if boat_day -> cold boat_cooler dish; if land_day -> balanced dish)
      const lunchPool = dayMode === 'boat_day' && boatCompatibleDishes.length > 0 ? boatCompatibleDishes : landDishes;
      const scoredLunch = lunchPool
        .filter((d) => !usedDishIds.has(d.id))
        .map((d) => ({
          dish: d,
          ...this._scoreDishForModel(d, modelId, dIdx < 2 ? openedTokens : [], activeIngredientKeys)
        }))
        .sort((a, b) => b.score - a.score);

      const chosenLunch = scoredLunch[0] || { dish: lunchPool[0], consumesOpenedPerishable: false, sharedPackCount: 0 };
      if (chosenLunch?.dish) {
        usedDishIds.add(chosenLunch.dish.id);
        for (const b of chosenLunch.dish.bom || []) {
          activeIngredientKeys.add(b.creaId || normalizeSearchToken(b.name));
        }
      }

      // Select Dinner (light evening recovery at home)
      const scoredDinner = landDishes
        .filter((d) => !usedDishIds.has(d.id))
        .map((d) => ({
          dish: d,
          ...this._scoreDishForModel(d, modelId, dIdx < 2 ? openedTokens : [], activeIngredientKeys)
        }))
        .sort((a, b) => b.score - a.score);

      const chosenDinner = scoredDinner[0] || { dish: landDishes[1] || landDishes[0], consumesOpenedPerishable: false, sharedPackCount: 0 };
      if (chosenDinner?.dish) {
        usedDishIds.add(chosenDinner.dish.id);
        for (const b of chosenDinner.dish.bom || []) {
          activeIngredientKeys.add(b.creaId || normalizeSearchToken(b.name));
        }
      }

      daysPlan.push({
        dayIndex: dIdx + 1,
        dayName,
        dayMode,
        breakfast: {
          title:
            dayMode === 'boat_day'
              ? 'Colazione Pre-Uscita in Barca (Idratazione + Carboidrati Lenti & Frutta Secca)'
              : 'Colazione Domestica (Caffè, Fiocchi d\'Avena / Pane Ligure & Frutta Fresca)',
          kcal: 340
        },
        lunch: {
          slot: 'lunch',
          contextLabel: dayMode === 'boat_day' ? '⛵ Pranzo in Barca (Borsa Termica · Zero Fornelli)' : '🏠 Pranzo a Casa',
          consumesOpenedPerishable: chosenLunch.consumesOpenedPerishable,
          sharedPackCount: chosenLunch.sharedPackCount,
          dish: chosenLunch.dish
        },
        dinner: {
          slot: 'dinner',
          contextLabel: '🌙 Cena Leggera a Terra (Recupero Serale)',
          consumesOpenedPerishable: chosenDinner.consumesOpenedPerishable,
          sharedPackCount: chosenDinner.sharedPackCount,
          dish: chosenDinner.dish
        }
      });
    }

    // Compute initial Whole-Pack Ledger
    let ledger = this._computeWholePackLedger(daysPlan, pantryState.items);
    const budgetSubstitutionsLog = [];

    // Step 3: Honest Whole-Recipe Budget Governance (NEVER removes single ingredients via items.pop())
    const cheapestPool = [...landDishes].sort(
      (a, b) => a.costAndArbitrage.checkoutCashCostEur - b.costAndArbitrage.checkoutCashCostEur
    );

    let guardIterations = 0;
    while (ledger.totalCheckoutCashEur > budgetEur && guardIterations < 8) {
      guardIterations++;
      // Find the meal slot with the highest checkout cash cost
      let maxSlotRef = null;
      let maxSlotCost = -1;

      for (const day of daysPlan) {
        if (day.dayMode === 'eat_out') continue;
        for (const slot of ['lunch', 'dinner']) {
          const meal = day[slot];
          if (meal?.dish && meal.dish.costAndArbitrage.checkoutCashCostEur > maxSlotCost) {
            maxSlotCost = meal.dish.costAndArbitrage.checkoutCashCostEur;
            maxSlotRef = { day, slot, oldDish: meal.dish };
          }
        }
      }

      if (!maxSlotRef) break;
      const replacement = cheapestPool.find(
        (cand) =>
          cand.id !== maxSlotRef.oldDish.id &&
          cand.costAndArbitrage.checkoutCashCostEur < maxSlotRef.oldDish.costAndArbitrage.checkoutCashCostEur
      );
      if (!replacement) break;

      maxSlotRef.day[maxSlotRef.slot].dish = replacement;
      budgetSubstitutionsLog.push({
        dayName: maxSlotRef.day.dayName,
        slot: maxSlotRef.slot,
        replacedDishTitle: maxSlotRef.oldDish.title,
        newDishTitle: replacement.title,
        reason: 'Sostituzione onesta di intera ricetta per rientrare nel budget settimanale (nessun singolo ingrediente rimosso).'
      });

      ledger = this._computeWholePackLedger(daysPlan, pantryState.items);
    }

    const modelMeta = NEO_DIETA_MODELS.find((m) => m.id === modelId) || NEO_DIETA_MODELS[0];

    const planResult = {
      planId: `plan-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      model: modelMeta,
      daysCount,
      servings,
      budgetEur,
      withinBudget: ledger.totalCheckoutCashEur <= budgetEur,
      budgetSubstitutionsLog,
      openedPerishablesPrioritized: openedItems.map((i) => ({
        id: i.id,
        title: i.title,
        remainingWeightGrams: i.remainingWeightGrams,
        hoursRemaining: i.hoursRemaining
      })),
      days: daysPlan,
      ledger
    };

    this._lastGeneratedPlan = planResult;
    return planResult;
  }

  /**
   * Swaps a single meal in the current plan with a compatible alternative (1-click swap).
   */
  async swapMealInPlan(payload = {}) {
    if (!this._lastGeneratedPlan) {
      await this.generateWeeklyPlan({});
    }
    const dayIndex = Number(payload.dayIndex) || 1;
    const slot = payload.slot === 'dinner' ? 'dinner' : 'lunch';

    const targetDay = this._lastGeneratedPlan.days.find((d) => d.dayIndex === dayIndex);
    if (!targetDay || !targetDay[slot]) {
      return this._lastGeneratedPlan;
    }

    const currentDishId = targetDay[slot].dish?.id;
    const catalogRes = await recipeAndArbitrageService.queryDishes({
      servings: this._lastGeneratedPlan.servings,
      limit: 120
    });
    const candidates = (catalogRes.dishes || []).filter((d) => d.id !== currentDishId);
    const nextDish = candidates[Math.floor(Math.random() * Math.min(15, candidates.length))] || candidates[0];

    if (nextDish) {
      targetDay[slot].dish = nextDish;
      const pantryState = pantryService.getPantryState();
      this._lastGeneratedPlan.ledger = this._computeWholePackLedger(
        this._lastGeneratedPlan.days,
        pantryState.items
      );
    }
    return this._lastGeneratedPlan;
  }
}

export const mealPlannerService = new MealPlannerService();
export default mealPlannerService;
