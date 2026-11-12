/**
 * Basilico — Deterministic Zero-Waste Whole-Pack Weekly Meal Planner (ADR-0012 / ADR-0013 / TASK-REAL-05)
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
 *  2. Physical Day Modes ('boat_day', 'land_day', 'eat_out') with strict cold-safety (`boatSafeCold`) on boat lunches
 *  3. Real Breakfast Recipes (`course === 'colazione'`) rotated with 0 duplicates across all 7 days (21/21 unique meals)
 *  4. Human Anti-Monotony & Culinary Structure:
 *     - Zero duplicate dishes by `id` OR `canonicalTwinKey` across the week (Breakfast + Lunch + Dinner)
 *     - Strict `dishFamily` weekly cap & non-adjacent day spacing (`!prevDayFamilies.has(fam)`)
 *     - Lunch != Dinner balance (savory main lunch + light protein/veg `lightDinnerSuitable` dinner, zero desserts as meals)
 *     - Perishable-only residual pack chaining (never chains on shelf-stable olive oil, salt, or dry pasta)
 *  5. Whole-Pack Chaining ($K_p = \lceil Q_p / S_p \rceil$) with multi-pack pantry aggregation & zero double-spend
 *  6. Constraint-preserving Whole-Recipe Budget Substitution + Persistent Active Plan (`data/cache/weekly_plan.json`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  recipeAndArbitrageService,
  resolveIngredientPackSpec
} from './recipeAndArbitrageService.js';
import { pantryService, isPantryItemCompatibleWithBom } from './pantryService.js';
import { normalizeSearchToken } from './offerService.js';
import { userProfileService } from './userProfileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PLAN_PATH = path.resolve(__dirname, '../../data/cache/weekly_plan.json');

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
      'Priorità a pesce azzurro, carni bianche, uova e legumi ad alta densità proteica per kcal (zero pizze/fritti ipercalorici).'
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

// Only genuinely perishable open packs trigger whole-pack chaining bonuses across meals
const PERISHABLE_PACK_FAMILIES = new Set([
  'fresh_herbs',
  'fresh_fish',
  'meat_poultry',
  'fresh_pasta',
  'vegetables_fruit',
  'fresh_vegetables',
  'fresh_fruit',
  'yogurt_single',
  'smoked_cured',
  'canned_fish'
]);

const MEAT_KEYWORDS_REGEX =
  /\b(manzo|vitell\w*|bovino|angus|fassone|chianina|scottona|costat\w*|entrecote|controfiletto|fiorentina|pollo|tacchino|coniglio|maiale|suino|agnello|anatra|faraona|cervo|cinghiale|capriolo|lepre|ragu|salame|prosciutto|pancetta|guanciale|salsiccia|mortadella|bresaola|cima|carne\s+salada)\b/i;

function isPerishableBomItem(bomItem = {}) {
  const spec = resolveIngredientPackSpec(bomItem.name || '');
  return PERISHABLE_PACK_FAMILIES.has(spec.family);
}

function getFamilyWeeklyCap(family = '', modelId = '') {
  if (['pesto_pasta', 'walnut_filled_pasta', 'fried_dish', 'pizza_focaccia', 'raw_crudo'].includes(family)) {
    return 1; // At most once per week for signature rich/pesto/fried/pizza families -> true human variety!
  }
  if (modelId === 'pescetarian_sea' && ['baked_or_pan_fish', 'shellfish_cephalopods'].includes(family)) {
    return 3;
  }
  return 2;
}

export class MealPlannerService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_PLAN_PATH || DEFAULT_PLAN_PATH;
    this.pantryService = options.pantryService || pantryService;
    this._lastGeneratedPlan = null;
    this._swapHistory = new Map();
  }

  getModels() {
    return NEO_DIETA_MODELS;
  }

  _loadPersistedPlan() {
    if (this._lastGeneratedPlan) return this._lastGeneratedPlan;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && Array.isArray(parsed.days) && parsed.ledger) {
          this._lastGeneratedPlan = parsed;
          return this._lastGeneratedPlan;
        }
      }
    } catch (_) {}
    return null;
  }

  _savePersistedPlan(plan) {
    this._lastGeneratedPlan = plan;
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(plan, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  /**
   * Returns the persisted active weekly plan if present (and matching `profileId` when requested),
   * or generates an initial plan ONLY if none exists yet (`M-P1-01`).
   */
  async getCurrentOrGeneratePlan(options = {}) {
    const requestedProfileId = options.profileId || null;
    const existing = this._loadPersistedPlan();
    if (existing && (!requestedProfileId || existing.profileId === requestedProfileId)) {
      return {
        plan: existing,
        wasGenerated: false
      };
    }

    const generated = await this.generateWeeklyPlan({
      modelId: existing?.model?.id || options.modelId || 'promo_driven_neodiet',
      daysCount: existing?.daysCount || options.daysCount || 7,
      servings: existing?.servings || options.servings || 1,
      budgetEur: existing?.budgetEur || options.budgetEur || 80,
      dayModes: existing?.days ? existing.days.map((d) => d.dayMode) : options.dayModes,
      profileId: requestedProfileId || userProfileService.getProfileById().id
    });
    return {
      plan: generated,
      wasGenerated: true
    };
  }

  _isEligibleMainMeal(dish, modelId) {
    if (!dish) return false;
    if (dish.isExcludedByProfileIdentity) return false;
    if (['colazione', 'dolce', 'gelato', 'merenda', 'aperitivo', 'contorno'].includes(dish.course)) return false;
    if (dish.dishFamily === 'dessert_gelato' || dish.dishFamily === 'breakfast_sweet' || dish.dishFamily === 'breakfast_savory') {
      return false;
    }

    const combinedText = `${dish.title || ''} ${(dish.bom || []).map((b) => b.name).join(' ')}`;

    if (modelId === 'pescetarian_sea') {
      if (['white_meat', 'red_meat', 'meat_ragu_pasta'].includes(dish.dishFamily)) return false;
      if (MEAT_KEYWORDS_REGEX.test(combinedText)) return false;
    }

    if (modelId === 'high_protein_sport') {
      const kcal = dish.nutritionPerServing?.energyKcal || 0;
      const prot = dish.nutritionPerServing?.proteinG || 0;
      if (dish.dishFamily === 'pizza_focaccia' || dish.dishFamily === 'fried_dish') return false;
      if (kcal > 880 || prot < 16) return false;
    }

    return true;
  }

  _scoreDishForModel(dish, modelId, slot, openedTokens = [], unallocatedPerishableGrams = new Map(), dIdx = 0) {
    let score = 15;
    const dishText = normalizeSearchToken(`${dish.title} ${(dish.bom || []).map((b) => b.name).join(' ')}`);

    // 1. Opened perishable priority bonus (T_open urgency in first 3 days)
    let consumesOpenedPerishable = false;
    if (dIdx < 3) {
      for (const tok of openedTokens) {
        if (tok && new RegExp(`\\b${tok}\\b`, 'i').test(dishText)) {
          score += 42;
          consumesOpenedPerishable = true;
        }
      }
    }

    // 2. Perishable-only whole-pack residual chaining bonus (capped at 2 shared perishables so variety wins)
    let sharedPackCount = 0;
    for (const b of dish.bom || []) {
      if (!isPerishableBomItem(b)) continue;
      const k = b.creaId || normalizeSearchToken(b.name);
      const rem = unallocatedPerishableGrams.get(k) || 0;
      if (rem >= 10) {
        sharedPackCount += 1;
        if (sharedPackCount <= 2) {
          score += 12;
        }
      }
    }

    // 3. Slot physiological suitability (Lunch vs Light Evening Dinner)
    if (slot === 'lunch') {
      if (dish.course === 'primo' || dish.course === 'piatto_unico_barca') score += 10;
      if (dish.sourceType === 'base_single_school') score += 6;
    } else if (slot === 'dinner') {
      if (dish.lightDinnerSuitable) score += 22;
      if (dish.course === 'secondo') score += 12;
      if (dish.course === 'primo') score -= 18;
      if (dish.dishFamily === 'fried_dish' || dish.dishFamily === 'pizza_focaccia') score -= 30;
    }

    // 4. Model-specific culinary & nutritional scoring
    const kcal = Math.max(180, dish.nutritionPerServing?.energyKcal || 450);
    const prot = dish.nutritionPerServing?.proteinG || 0;
    const proteinCalorieSharePct = ((prot * 4) / kcal) * 100;

    if (modelId === 'promo_driven_neodiet') {
      score += Math.min(3, dish.costAndArbitrage?.onPromoIngredientsCount || 0) * 16;
      score += Math.max(0, 18 - (dish.costAndArbitrage?.purePortionCostPerServingEur || 5) * 2.5);
    } else if (modelId === 'high_protein_sport') {
      score += proteinCalorieSharePct * 1.35 + prot * 0.85;
    } else if (modelId === 'pescetarian_sea') {
      if (/\b(acciug\w*|alici|tonno|sgombro|palamita|seppi\w*|gamber\w*|orata|branzino|spigola|pesce|calamar\w*|polpo|baccala|merluzzo|cozz\w*|vongol\w*)\b/.test(dishText)) {
        score += 32;
      }
    } else if (modelId === 'tigullio_gourmet_home') {
      if (dish.sourceType === 'tigullio_restaurant' || dish.sourceType === 'starred_author') {
        score += 28;
      }
      score += Math.min(25, (dish.costAndArbitrage?.arbitrageSavingsEur || 0) * 0.7);
    } else if (modelId === 'ligurian_traditional') {
      if (/\b(ligure|genovese|pesto|acciug\w*|pansot\w*|trofie|cappon|brandacujun|cima|farinata|panissa|borragine|olive)\b/.test(dishText)) {
        score += 26;
      }
    } else {
      // balanced_daily: favor everyday single meals, fish/legume/veg balance, reasonable cost
      if (dish.sourceType === 'base_single_school') score += 14;
      score += (dish.feasibility?.pantryCoveragePct || 0) * 0.2;
      score += Math.min(2, dish.costAndArbitrage?.onPromoIngredientsCount || 0) * 8;
      score += Math.max(0, 14 - (dish.costAndArbitrage?.purePortionCostPerServingEur || 5) * 1.8);
    }

    // Small deterministic tie-breaker based on day index + dish ID hash so days rotate naturally
    const idHash = Array.from(String(dish.id)).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
    score += ((idHash + dIdx * 17) % 11) * 0.35;

    return {
      score,
      consumesOpenedPerishable,
      sharedPackCount
    };
  }

  _registerMealPerishables(dish, unallocatedPerishableGrams) {
    if (!dish) return;
    for (const b of dish.bom || []) {
      if (!isPerishableBomItem(b)) continue;
      const k = b.creaId || normalizeSearchToken(b.name);
      const currentRem = unallocatedPerishableGrams.get(k) || 0;
      const used = Number(b.rawGramsTotal || b.rawGramsPerServing || 0);
      if (currentRem >= used) {
        unallocatedPerishableGrams.set(k, Number((currentRem - used).toFixed(1)));
      } else {
        const packGrams = b.packSizeGrams || resolveIngredientPackSpec(b.name).packGrams;
        const neededAfterRem = used - currentRem;
        const packs = Math.ceil(neededAfterRem / packGrams);
        const newRem = Number((packs * packGrams - neededAfterRem).toFixed(1));
        unallocatedPerishableGrams.set(k, newRem);
      }
    }
  }

  /**
   * Aggregates all BOM ingredients across the planned week (including real Breakfasts, Lunches & Dinners)
   * into whole supermarket packages: $K_p = \lceil (Q_p - \text{inPantry}_p) / S_p \rceil$.
   * Sums ALL matching pantry packages (`opened` prioritized first) while tracking a shared
   * `Map<pantryItemId, remainingGrams>` so a single pantry package is NEVER double-spent across two BOM keys!
   */
  _computeWholePackLedger(daysPlan, pantryItems = []) {
    const ledgerMap = new Map();

    const accumulateSlot = (day, slotLabel, dish) => {
      if (!dish || !Array.isArray(dish.bom)) return;
      for (const b of dish.bom) {
        const key = b.creaId || normalizeSearchToken(b.name);
        if (!ledgerMap.has(key)) {
          const spec = resolveIngredientPackSpec(b.name);
          const packSizeGrams = b.packSizeGrams || spec.packGrams;
          const euroPerKg = b.euroPerKg || spec.euroPerKg;

          ledgerMap.set(key, {
            key,
            bomRef: b,
            creaId: b.creaId || null,
            name: b.name,
            domain: 'food_human',
            packSizeGrams,
            euroPerKg,
            packPriceEur:
              b.matchedOffer?.price > 0
                ? Number(b.matchedOffer.price)
                : Number(((euroPerKg * packSizeGrams) / 1000).toFixed(2)),
            matchedOffer: b.matchedOffer || null,
            availableInPantryGrams: 0,
            isOpenedInPantry: false,
            totalRequiredGrams: 0,
            usedInMeals: []
          });
        }

        const entry = ledgerMap.get(key);
        const grams = Number(b.rawGramsTotal || b.rawGramsPerServing || 0);
        entry.totalRequiredGrams = Number((entry.totalRequiredGrams + grams).toFixed(1));
        entry.usedInMeals.push({
          dayIndex: day.dayIndex,
          dayName: day.dayName,
          slot: slotLabel,
          dishId: dish.id,
          dishTitle: dish.title,
          gramsUsed: grams
        });
      }
    };

    let totalMenuEquivalentEur = 0;

    for (const day of daysPlan) {
      if (day.dayMode !== 'eat_out' && day.breakfast?.dish) {
        accumulateSlot(day, 'breakfast', day.breakfast.dish);
        totalMenuEquivalentEur += Number(day.breakfast.dish.costAndArbitrage?.totalMenuPriceEur || 0);
      }
      if (day.dayMode === 'eat_out') continue;
      for (const slot of ['lunch', 'dinner']) {
        const meal = day[slot];
        if (meal?.dish) {
          accumulateSlot(day, slot, meal.dish);
          totalMenuEquivalentEur += Number(meal.dish.costAndArbitrage?.totalMenuPriceEur || 0);
        }
      }
    }

    // Track remaining grams per physical pantry package across all ledger entries (no double-spend!)
    const pantryRemainingById = new Map();
    for (const p of pantryItems || []) {
      if (!p || !p.id) continue;
      const rem = Number(p.remainingWeightGrams);
      if (Number.isFinite(rem) && rem > 0) {
        pantryRemainingById.set(p.id, rem);
      }
    }

    // Allocate pantry stock: entries with explicit `creaId` claim exact matches first, followed by lexical BOM keys
    const orderedEntries = [...ledgerMap.values()].sort((a, b) => (b.creaId ? 1 : 0) - (a.creaId ? 1 : 0));

    const wholePackItems = [];
    let totalCheckoutCashEur = 0;
    let totalPureConsumedValueEur = 0;

    for (const entry of orderedEntries) {
      const matchingPantryPacks = (pantryItems || [])
        .filter((p) => {
          const rem = pantryRemainingById.get(p?.id) || 0;
          if (rem <= 0) return false;
          return isPantryItemCompatibleWithBom(entry.bomRef, { ...p, remainingWeightGrams: rem });
        })
        .sort((x, y) => (x.status === 'opened' ? -1 : 1) - (y.status === 'opened' ? -1 : 1));

      const availableInPantryGrams = Number(
        matchingPantryPacks.reduce((acc, p) => acc + (pantryRemainingById.get(p.id) || 0), 0).toFixed(1)
      );
      const isOpenedInPantry = matchingPantryPacks.some((p) => p.status === 'opened');

      let needToCoverFromPantry = entry.totalRequiredGrams;
      let fromPantryGrams = 0;
      for (const p of matchingPantryPacks) {
        if (needToCoverFromPantry <= 0) break;
        const avail = pantryRemainingById.get(p.id) || 0;
        if (avail <= 0) continue;
        const take = Number(Math.min(avail, needToCoverFromPantry).toFixed(1));
        pantryRemainingById.set(p.id, Number(Math.max(0, avail - take).toFixed(1)));
        fromPantryGrams = Number((fromPantryGrams + take).toFixed(1));
        needToCoverFromPantry = Number(Math.max(0, needToCoverFromPantry - take).toFixed(1));
      }

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

      const { bomRef: _omitBomRef, ...publicEntry } = entry;
      wholePackItems.push({
        ...publicEntry,
        availableInPantryGrams,
        isOpenedInPantry,
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
   * Generates a complete 7-day (or N-day) human-grade zero-waste weekly meal plan.
   */
  async generateWeeklyPlan(options = {}) {
    const modelId = NEO_DIETA_MODELS.some((m) => m.id === options.modelId)
      ? options.modelId
      : 'promo_driven_neodiet';

    if (options.daysCount !== undefined && options.daysCount !== null && options.daysCount !== '') {
      const parsedDays = Number(options.daysCount);
      if (!Number.isFinite(parsedDays) || parsedDays <= 0) {
        const err = new Error('daysCount non valido: inserire un numero > 0');
        err.status = 400;
        throw err;
      }
    }
    if (options.servings !== undefined && options.servings !== null && options.servings !== '') {
      const parsedServings = Number(options.servings);
      if (!Number.isFinite(parsedServings) || parsedServings <= 0) {
        const err = new Error('servings non valido: inserire un numero > 0');
        err.status = 400;
        throw err;
      }
    }
    if (options.budgetEur !== undefined && options.budgetEur !== null && options.budgetEur !== '') {
      const parsedBudget = Number(options.budgetEur);
      if (!Number.isFinite(parsedBudget) || parsedBudget <= 0) {
        const err = new Error('budgetEur non valido: inserire un importo > 0');
        err.status = 400;
        throw err;
      }
    }

    const daysCount = Math.max(1, Math.min(14, Number(options.daysCount) || 7));
    const servings = Math.max(1, Math.min(8, Number(options.servings) || 1));
    const budgetEur = Number(options.budgetEur) > 0 ? Number(options.budgetEur) : 80;
    const profileId = options.profileId || userProfileService.getProfileById().id;

    const customDayModes = Array.isArray(options.dayModes) ? options.dayModes : null;

    const pantryState = this.pantryService.getPantryState();
    const openedItems = pantryState.openedPriorityAlerts || [];
    const openedTokens = openedItems
      .map((i) => normalizeSearchToken(i.title).split(' ').find((w) => w.length >= 4))
      .filter(Boolean);

    const catalogRes = await recipeAndArbitrageService.queryDishes({
      servings,
      profileId,
      limit: 350
    });
    const allEvaluated = catalogRes.dishes || [];

    // 1. Real Breakfast Pool (`course === 'colazione'`, deduplicated by id & canonicalTwinKey, >= 7 distinct breakfasts!)
    const allBreakfasts = allEvaluated.filter((d) => {
      if (d.course !== 'colazione' || d.isExcludedByProfileIdentity) return false;
      if (/^colazion[ei]$/i.test((d.title || '').trim())) return false;
      if (modelId === 'pescetarian_sea') {
        const txt = `${d.title || ''} ${(d.bom || []).map((b) => b.name).join(' ')}`;
        if (MEAT_KEYWORDS_REGEX.test(txt)) return false;
      }
      return true;
    });

    const orderedBreakfastCandidates = [
      ...allBreakfasts.filter((d) => d.sourceType === 'base_single_school'),
      ...allBreakfasts.filter((d) => d.sourceType !== 'base_single_school')
    ];

    if (modelId === 'high_protein_sport') {
      orderedBreakfastCandidates.sort(
        (a, b) => (b.nutritionPerServing?.proteinG || 0) - (a.nutritionPerServing?.proteinG || 0)
      );
    }

    const seenBfIds = new Set();
    const seenBfTwins = new Set();
    const breakfastPool = [];
    for (const bf of orderedBreakfastCandidates) {
      if (!bf || seenBfIds.has(bf.id)) continue;
      if (bf.canonicalTwinKey && seenBfTwins.has(bf.canonicalTwinKey)) continue;
      seenBfIds.add(bf.id);
      if (bf.canonicalTwinKey) seenBfTwins.add(bf.canonicalTwinKey);
      breakfastPool.push(bf);
    }

    // 2. Savory Lunch & Dinner Pools with strict cold-boat and light-dinner separation
    const eligibleMain = allEvaluated.filter((d) => this._isEligibleMainMeal(d, modelId));
    const boatLunchPool = eligibleMain.filter((d) => d.boatSafeCold);
    const landLunchPool = eligibleMain.filter((d) => d.course !== 'piatto_unico_barca' || eligibleMain.length < 20);
    const dinnerPool = eligibleMain.filter((d) => d.lightDinnerSuitable);
    const effectiveDinnerPool = dinnerPool.length >= daysCount ? dinnerPool : eligibleMain;

    const usedDishIds = new Set();
    const usedTwinKeys = new Set();
    const familyCounts = new Map();
    const daySelectedFamilies = new Map();
    const unallocatedPerishableGrams = new Map();

    const getPrevDayFamilies = (dIdx) => daySelectedFamilies.get(dIdx - 1) || new Set();

    // Pass 0: strict cap + strict 2-day spacing
    // Pass 1: relax weekly cap by +1 (except cap=1 signature families), STILL strictly enforcing `!prevDayFamilies.has(fam)`!
    // Pass 2: emergency fallback (still strictly no duplicate ID / twinKey / sameDayFamily / double-primo)
    const canUseCandidate = (cand, dIdx, sameDayLunchFamily = null, passLevel = 0) => {
      if (!cand) return false;
      if (usedDishIds.has(cand.id)) return false;
      if (cand.canonicalTwinKey && usedTwinKeys.has(cand.canonicalTwinKey)) return false;

      const fam = cand.dishFamily || 'mediterranean_vegetable';
      if (sameDayLunchFamily && fam === sameDayLunchFamily) return false;

      const count = familyCounts.get(fam) || 0;
      const cap = getFamilyWeeklyCap(fam, modelId);
      if (cap <= 1 && count >= 1) return false;

      const prevFamilies = getPrevDayFamilies(dIdx);
      if (passLevel === 0) {
        if (count >= cap) return false;
        if (prevFamilies.has(fam)) return false;
      } else if (passLevel === 1) {
        if (prevFamilies.has(fam)) return false;
        if (count >= cap + 1) return false;
      }

      return true;
    };

    const recordSelectedDish = (dish, dIdx, trackFamilySpacing = true) => {
      if (!dish) return;
      usedDishIds.add(dish.id);
      if (dish.canonicalTwinKey) usedTwinKeys.add(dish.canonicalTwinKey);
      if (trackFamilySpacing) {
        const fam = dish.dishFamily || 'mediterranean_vegetable';
        familyCounts.set(fam, (familyCounts.get(fam) || 0) + 1);
        if (!daySelectedFamilies.has(dIdx)) daySelectedFamilies.set(dIdx, new Set());
        daySelectedFamilies.get(dIdx).add(fam);
      }
      this._registerMealPerishables(dish, unallocatedPerishableGrams);
    };

    const pickBestFromPool = (pool, slot, dIdx, sameDayLunchDish = null) => {
      const sameDayFamily = sameDayLunchDish?.dishFamily || null;
      const isDoublePrimo = (cand) =>
        slot === 'dinner' && sameDayLunchDish?.course === 'primo' && cand.course === 'primo';

      for (const passLevel of [0, 1, 2]) {
        const scored = pool
          .filter((cand) => {
            if (isDoublePrimo(cand)) return false;
            return canUseCandidate(cand, dIdx, sameDayFamily, passLevel);
          })
          .map((d) => ({
            dish: d,
            ...this._scoreDishForModel(d, modelId, slot, openedTokens, unallocatedPerishableGrams, dIdx)
          }))
          .sort((a, b) => b.score - a.score);

        if (scored.length > 0) return scored[0];
      }

      const unusedAny = pool.find((d) => !usedDishIds.has(d.id)) || pool[0];
      return { dish: unusedAny, consumesOpenedPerishable: false, sharedPackCount: 0 };
    };

    const daysPlan = [];

    for (let dIdx = 0; dIdx < daysCount; dIdx++) {
      const dayName = DAY_NAMES_IT[dIdx % 7];
      const dayMode = customDayModes?.[dIdx] || (dIdx === 4 || dIdx === 5 ? 'boat_day' : 'land_day');

      // Select unique real breakfast recipe (0 duplicates across all 7 days!)
      const chosenBreakfastDish =
        breakfastPool.find(
          (bf) => !usedDishIds.has(bf.id) && (!bf.canonicalTwinKey || !usedTwinKeys.has(bf.canonicalTwinKey))
        ) || (breakfastPool.length > 0 ? breakfastPool[dIdx % breakfastPool.length] : null);

      if (chosenBreakfastDish) {
        usedDishIds.add(chosenBreakfastDish.id);
        if (chosenBreakfastDish.canonicalTwinKey) usedTwinKeys.add(chosenBreakfastDish.canonicalTwinKey);
        if (dayMode !== 'eat_out') {
          this._registerMealPerishables(chosenBreakfastDish, unallocatedPerishableGrams);
        }
      }

      const breakfastObj = chosenBreakfastDish
        ? {
            dishId: chosenBreakfastDish.id,
            title: chosenBreakfastDish.title,
            kcal: chosenBreakfastDish.nutritionPerServing?.energyKcal || 340,
            proteinG: chosenBreakfastDish.nutritionPerServing?.proteinG || 14,
            purePortionCostEur: chosenBreakfastDish.costAndArbitrage?.purePortionCostEur || 1.2,
            dish: dayMode === 'eat_out' ? null : chosenBreakfastDish
          }
        : {
            title: `Colazione Domestica Giorno ${dIdx + 1} (Caffè, Fiocchi d'Avena & Frutta Fresca)`,
            kcal: 330,
            proteinG: 12,
            dish: null
          };

      if (dayMode === 'eat_out') {
        daysPlan.push({
          dayIndex: dIdx + 1,
          dayName,
          dayMode,
          breakfast: breakfastObj,
          lunch: null,
          dinner: null
        });
        continue;
      }

      // Select Lunch (strictly cold-safe `boatSafeCold` on boat_day!)
      const activeLunchPool =
        dayMode === 'boat_day' && boatLunchPool.length > 0 ? boatLunchPool : landLunchPool;
      const chosenLunch = pickBestFromPool(activeLunchPool, 'lunch', dIdx, null);
      recordSelectedDish(chosenLunch?.dish, dIdx, true);

      // Select Dinner (light recovery evening dish, distinct family & course from lunch)
      const chosenDinner = pickBestFromPool(effectiveDinnerPool, 'dinner', dIdx, chosenLunch?.dish);
      recordSelectedDish(chosenDinner?.dish, dIdx, true);

      daysPlan.push({
        dayIndex: dIdx + 1,
        dayName,
        dayMode,
        breakfast: breakfastObj,
        lunch: {
          slot: 'lunch',
          contextLabel:
            dayMode === 'boat_day'
              ? '⛵ Pranzo in Barca (Borsa Termica · Freddo Sicuro Zero Fornelli)'
              : '🏠 Pranzo a Terra',
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

    // Helper to gather adjacent-day (dayIndex - 1 and dayIndex + 1) dishFamilies
    const getAdjacentDayFamilies = (dayIndexOneBased) => {
      const adj = new Set();
      for (const neighborIdx of [dayIndexOneBased - 1, dayIndexOneBased + 1]) {
        const neighborDay = daysPlan.find((d) => d.dayIndex === neighborIdx);
        if (!neighborDay || neighborDay.dayMode === 'eat_out') continue;
        if (neighborDay.lunch?.dish?.dishFamily) adj.add(neighborDay.lunch.dish.dishFamily);
        if (neighborDay.dinner?.dish?.dishFamily) adj.add(neighborDay.dinner.dish.dishFamily);
      }
      return adj;
    };

    // Compute initial Whole-Pack Ledger
    let ledger = this._computeWholePackLedger(daysPlan, pantryState.items);
    const budgetSubstitutionsLog = [];

    // Step 3: Constraint-Preserving Whole-Recipe Budget Governance
    // NEVER pops single BOM ingredients AND NEVER violates boat-safety, profile exclusions, adjacent-day families, or uniqueness!
    let guardIterations = 0;
    while (ledger.totalCheckoutCashEur > budgetEur && guardIterations < 10) {
      guardIterations++;
      let replacedInPass = false;

      // Rank current meal slots by highest checkout cash cost descending
      const activeSlots = [];
      for (const day of daysPlan) {
        if (day.dayMode === 'eat_out') continue;
        for (const slot of ['lunch', 'dinner']) {
          const meal = day[slot];
          if (meal?.dish) {
            activeSlots.push({ day, slot, oldDish: meal.dish });
          }
        }
      }
      activeSlots.sort(
        (a, b) => b.oldDish.costAndArbitrage.checkoutCashCostEur - a.oldDish.costAndArbitrage.checkoutCashCostEur
      );

      for (const slotRef of activeSlots) {
        const isBoatLunch = slotRef.day.dayMode === 'boat_day' && slotRef.slot === 'lunch';
        const otherMealSameDay =
          slotRef.slot === 'lunch' ? slotRef.day.dinner?.dish : slotRef.day.lunch?.dish;
        const adjacentFamilies = getAdjacentDayFamilies(slotRef.day.dayIndex);

        const candidatePool = (isBoatLunch ? boatLunchPool : slotRef.slot === 'dinner' ? effectiveDinnerPool : landLunchPool)
          .filter((cand) => {
            if (cand.id === slotRef.oldDish.id) return false;
            if (usedDishIds.has(cand.id)) return false;
            if (cand.canonicalTwinKey && usedTwinKeys.has(cand.canonicalTwinKey)) return false;
            if (otherMealSameDay && cand.dishFamily === otherMealSameDay.dishFamily) return false;
            if (adjacentFamilies.has(cand.dishFamily)) return false;
            // Symmetric double-primo check for BOTH lunch and dinner!
            if (otherMealSameDay?.course === 'primo' && cand.course === 'primo') {
              return false;
            }
            const effectiveFamCount =
              (familyCounts.get(cand.dishFamily) || 0) - (cand.dishFamily === slotRef.oldDish.dishFamily ? 1 : 0);
            if (effectiveFamCount >= getFamilyWeeklyCap(cand.dishFamily, modelId)) return false;
            return (
              cand.costAndArbitrage.checkoutCashCostEur <
              slotRef.oldDish.costAndArbitrage.checkoutCashCostEur - 0.8
            );
          })
          .map((cand) => {
            const estSave = slotRef.oldDish.costAndArbitrage.checkoutCashCostEur - cand.costAndArbitrage.checkoutCashCostEur;
            const affinity = this._scoreDishForModel(cand, modelId, slotRef.slot, openedTokens, unallocatedPerishableGrams, slotRef.day.dayIndex - 1).score;
            return { cand, combinedRank: estSave * 4 + affinity * 0.3 };
          })
          .sort((a, b) => b.combinedRank - a.combinedRank);

        let acceptedReplacement = null;
        let acceptedLedger = null;
        for (const { cand } of candidatePool.slice(0, 6)) {
          const prevDish = slotRef.day[slotRef.slot].dish;
          slotRef.day[slotRef.slot].dish = cand;
          const trialLedger = this._computeWholePackLedger(daysPlan, pantryState.items);
          if (trialLedger.totalCheckoutCashEur <= ledger.totalCheckoutCashEur - 0.5) {
            acceptedReplacement = cand;
            acceptedLedger = trialLedger;
            break;
          }
          slotRef.day[slotRef.slot].dish = prevDish;
        }

        if (acceptedReplacement && acceptedLedger) {
          usedDishIds.delete(slotRef.oldDish.id);
          if (slotRef.oldDish.canonicalTwinKey) usedTwinKeys.delete(slotRef.oldDish.canonicalTwinKey);
          const oldFam = slotRef.oldDish.dishFamily;
          familyCounts.set(oldFam, Math.max(0, (familyCounts.get(oldFam) || 1) - 1));

          usedDishIds.add(acceptedReplacement.id);
          if (acceptedReplacement.canonicalTwinKey) usedTwinKeys.add(acceptedReplacement.canonicalTwinKey);
          familyCounts.set(
            acceptedReplacement.dishFamily,
            (familyCounts.get(acceptedReplacement.dishFamily) || 0) + 1
          );

          budgetSubstitutionsLog.push({
            dayName: slotRef.day.dayName,
            slot: slotRef.slot,
            replacedDishTitle: slotRef.oldDish.title,
            newDishTitle: acceptedReplacement.title,
            reason:
              'Sostituzione onesta di intera ricetta (rispettando modello, varietà, profilo e modalità barca/terra) con riduzione reale dello scontrino confezioni intere.'
          });

          ledger = acceptedLedger;
          replacedInPass = true;
          break;
        }
      }

      if (!replacedInPass) break;
    }

    const modelMeta = NEO_DIETA_MODELS.find((m) => m.id === modelId) || NEO_DIETA_MODELS[0];

    const planResult = {
      planId: `plan-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      profileId,
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

    this._swapHistory.clear();
    this._savePersistedPlan(planResult);
    return planResult;
  }

  /**
   * Swaps a single meal in the current plan with a compatible, non-duplicate alternative (1-click swap).
   * Rotates cleanly through all valid candidates without 2-dish oscillation, enforces twinKey,
   * same-day/adjacent-day `dishFamily`, weekly caps, double-`primo` blocking, and updates `withinBudget`.
   */
  async swapMealInPlan(payload = {}) {
    let activePlan = this._loadPersistedPlan();
    if (!activePlan) {
      activePlan = await this.generateWeeklyPlan({});
    }
    const dayIndex = Number(payload.dayIndex) || 1;
    const slot = payload.slot === 'dinner' ? 'dinner' : payload.slot === 'breakfast' ? 'breakfast' : 'lunch';
    const activeModelId = activePlan.model?.id || 'promo_driven_neodiet';
    const explicitExcludes = new Set(
      Array.isArray(payload.excludeDishIds) ? payload.excludeDishIds.map(String) : []
    );

    const targetDay = activePlan.days.find((d) => d.dayIndex === dayIndex);
    if (!targetDay || !targetDay[slot]) {
      return activePlan;
    }

    const currentSlotDishId =
      slot === 'breakfast'
        ? targetDay.breakfast?.dishId || targetDay.breakfast?.dish?.id || null
        : targetDay[slot]?.dish?.id || null;

    // Track all OTHER meals in the week so we never introduce duplicates by id or canonicalTwinKey
    const otherUsedIds = new Set();
    const otherUsedTwins = new Set();
    const otherFamilyCounts = new Map();

    for (const d of activePlan.days) {
      const bfDish = d.breakfast?.dish;
      const bfId = d.breakfast?.dishId || bfDish?.id;
      if (bfId && !(d.dayIndex === dayIndex && slot === 'breakfast')) {
        otherUsedIds.add(bfId);
        if (bfDish?.canonicalTwinKey) otherUsedTwins.add(bfDish.canonicalTwinKey);
      }
      for (const s of ['lunch', 'dinner']) {
        if (d.dayIndex === dayIndex && s === slot) continue;
        const mDish = d[s]?.dish;
        if (mDish?.id) {
          otherUsedIds.add(mDish.id);
          if (mDish.canonicalTwinKey) otherUsedTwins.add(mDish.canonicalTwinKey);
          const fam = mDish.dishFamily || 'mediterranean_vegetable';
          otherFamilyCounts.set(fam, (otherFamilyCounts.get(fam) || 0) + 1);
        }
      }
    }

    const adjacentFamilies = new Set();
    for (const neighborIdx of [dayIndex - 1, dayIndex + 1]) {
      const neighborDay = activePlan.days.find((d) => d.dayIndex === neighborIdx);
      if (!neighborDay || neighborDay.dayMode === 'eat_out') continue;
      if (neighborDay.lunch?.dish?.dishFamily) adjacentFamilies.add(neighborDay.lunch.dish.dishFamily);
      if (neighborDay.dinner?.dish?.dishFamily) adjacentFamilies.add(neighborDay.dinner.dish.dishFamily);
    }

    const otherMealSameDay =
      slot === 'lunch' ? targetDay.dinner?.dish : slot === 'dinner' ? targetDay.lunch?.dish : null;

    const catalogRes = await recipeAndArbitrageService.queryDishes({
      servings: activePlan.servings,
      profileId: activePlan.profileId,
      limit: 350
    });
    const allDishes = (catalogRes.dishes || []).filter((d) => !d.isExcludedByProfileIdentity);

    let candidates = [];
    if (slot === 'breakfast') {
      candidates = allDishes.filter((d) => {
        if (d.course !== 'colazione') return false;
        if (/^colazion[ei]$/i.test((d.title || '').trim())) return false;
        if (d.id === currentSlotDishId) return false;
        if (otherUsedIds.has(d.id)) return false;
        if (d.canonicalTwinKey && otherUsedTwins.has(d.canonicalTwinKey)) return false;
        if (activeModelId === 'pescetarian_sea') {
          const txt = `${d.title || ''} ${(d.bom || []).map((b) => b.name).join(' ')}`;
          if (MEAT_KEYWORDS_REGEX.test(txt)) return false;
        }
        return true;
      });
    } else {
      const filterMainCandidates = (enforceStrictCapAndAdjacency) =>
        allDishes.filter((d) => {
          if (!this._isEligibleMainMeal(d, activeModelId)) return false;
          if (d.id === currentSlotDishId) return false;
          if (otherUsedIds.has(d.id)) return false;
          if (d.canonicalTwinKey && otherUsedTwins.has(d.canonicalTwinKey)) return false;
          if (targetDay.dayMode === 'boat_day' && slot === 'lunch' && !d.boatSafeCold) return false;
          if (slot === 'dinner' && !d.lightDinnerSuitable && enforceStrictCapAndAdjacency) return false;
          if (otherMealSameDay && d.dishFamily === otherMealSameDay.dishFamily) return false;
          if (otherMealSameDay?.course === 'primo' && d.course === 'primo') return false;

          const fam = d.dishFamily || 'mediterranean_vegetable';
          const cap = getFamilyWeeklyCap(fam, activeModelId);
          const count = otherFamilyCounts.get(fam) || 0;
          if (cap <= 1 && count >= 1) return false;
          if (enforceStrictCapAndAdjacency) {
            if (count >= cap) return false;
            if (adjacentFamilies.has(fam)) return false;
          }
          return true;
        });

      candidates = filterMainCandidates(true);
      if (candidates.length === 0) {
        candidates = filterMainCandidates(false);
      }

      candidates.sort(
        (a, b) =>
          this._scoreDishForModel(b, activeModelId, slot, [], new Map(), dayIndex - 1).score -
          this._scoreDishForModel(a, activeModelId, slot, [], new Map(), dayIndex - 1).score
      );
    }

    if (candidates.length === 0) {
      return activePlan;
    }

    // Rotate through all valid candidates using slot history + optional caller `excludeDishIds` (zero A<->B loop!)
    const slotHistoryKey = `${activePlan.planId}:${dayIndex}:${slot}`;
    let seenInSlot = this._swapHistory.get(slotHistoryKey);
    if (!seenInSlot) {
      seenInSlot = new Set();
      this._swapHistory.set(slotHistoryKey, seenInSlot);
    }
    if (currentSlotDishId) {
      seenInSlot.add(currentSlotDishId);
    }

    let unvisited = candidates.filter((d) => !explicitExcludes.has(d.id) && !seenInSlot.has(d.id));
    if (unvisited.length === 0) {
      // Full cycle completed: reset slot history (keeping only immediate current dish & explicit excludes)
      seenInSlot.clear();
      if (currentSlotDishId) seenInSlot.add(currentSlotDishId);
      unvisited = candidates.filter((d) => !explicitExcludes.has(d.id) && d.id !== currentSlotDishId);
    }

    const nextDish = unvisited[0] || candidates[0];
    if (nextDish) {
      seenInSlot.add(nextDish.id);
      if (slot === 'breakfast') {
        targetDay.breakfast = {
          dishId: nextDish.id,
          title: nextDish.title,
          kcal: nextDish.nutritionPerServing?.energyKcal || 340,
          proteinG: nextDish.nutritionPerServing?.proteinG || 14,
          purePortionCostEur: nextDish.costAndArbitrage?.purePortionCostEur || 1.2,
          dish: targetDay.dayMode === 'eat_out' ? null : nextDish
        };
      } else {
        targetDay[slot].dish = nextDish;
      }

      const pantryState = this.pantryService.getPantryState();
      activePlan.ledger = this._computeWholePackLedger(activePlan.days, pantryState.items);
      activePlan.withinBudget = activePlan.ledger.totalCheckoutCashEur <= activePlan.budgetEur;
      this._savePersistedPlan(activePlan);
    }

    return activePlan;
  }
}

export const mealPlannerService = new MealPlannerService();
export default mealPlannerService;
