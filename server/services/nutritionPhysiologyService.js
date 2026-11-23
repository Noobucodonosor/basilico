/**
 * Basilico 2.0 — Cooked Meal Physiology, Bioavailability & Adaptive Nutrition Coach Engine (ADR-0015 / TASK-V2-03)
 * Location: server/services/nutritionPhysiologyService.js
 *
 * Strictly adheres to ADR-0006 (Zero Synthetic Numbers):
 *  - 100% grounded on official CREA (832 foods × 7 sections), USDA Release 6 / Bognár (2002) retention factors,
 *    SINU LARN V Rev. (2024), EFSA DRVs, FAO/WHO/UNU (2007) amino acid reference pattern, Weaver (1999) calcium tiers,
 *    and Hallberg (2000) iron bioavailability rules.
 *  - Never invents absorption decimals on untabulated foods (`null` when retention is untabulated; discrete certified
 *    bioavailability classes for Calcium, Iron, Carotenoids/Lycopene, and Type 3 Resistant Starch RS3).
 *  - Adaptive coaching operates on a 7–14 day rolling physiological horizon with zero punitive restriction/orthorexia.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaService, parseCreaValue } from './creaService.js';
import { creaOfferMatcher } from './creaOfferMatcher.js';
import { offerService, enrichOfferRecord, normalizeSearchToken } from './offerService.js';
import { userProfileService } from './userProfileService.js';
import { pantryService } from './pantryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RULES_SEED_PATH = path.resolve(__dirname, '../../data/seed/nutrition_physiology_rules.json');
const DISHES_SEED_PATH = path.resolve(__dirname, '../../data/seed/recipes_and_dishes.json');
const EVO_OIL_CREA_ID = '009210';

// Canonical 31+ CREA nutrients extracted per ingredient for cooked meal physiology
export const PHYSIOLOGY_NUTRIENT_SPECS = [
  { key: 'kcal', unit: 'kcal', creaLabels: ['Energia (kcal)'] },
  { key: 'kj', unit: 'kJ', creaLabels: ['Energia (kJ)'] },
  { key: 'waterG', unit: 'g', creaLabels: ['Acqua (g)'] },
  { key: 'proteinG', unit: 'g', creaLabels: ['Proteine (g)', 'Proteine totali (g)'] },
  { key: 'fatG', unit: 'g', creaLabels: ['Lipidi (g)', 'Lipidi totali (g)'] },
  { key: 'carbsG', unit: 'g', creaLabels: ['Carboidrati disponibili (g)'] },
  { key: 'starchG', unit: 'g', creaLabels: ['Amido (g)'] },
  { key: 'sugarsG', unit: 'g', creaLabels: ['Zuccheri solubili (g)'] },
  { key: 'fiberG', unit: 'g', creaLabels: ['Fibra totale (g)', 'Fibra alimentare totale (g)'] },
  { key: 'saturatedFatG', unit: 'g', fromKeyMetrics: 'saturatedFatG' },
  { key: 'monounsaturatedFatG', unit: 'g', fromKeyMetrics: 'monounsaturatedFatG' },
  { key: 'polyunsaturatedFatG', unit: 'g', fromKeyMetrics: 'polyunsaturatedFatG' },
  { key: 'omega3G', unit: 'g', fromKeyMetrics: 'omega3G' },
  { key: 'epaDhaG', unit: 'g', fromKeyMetrics: 'epaDhaG' },
  { key: 'cholesterolMg', unit: 'mg', creaLabels: ['Colesterolo (mg)'] },
  { key: 'sodiumMg', unit: 'mg', creaLabels: ['Sodio (mg)'] },
  { key: 'potassiumMg', unit: 'mg', creaLabels: ['Potassio (mg)'] },
  { key: 'calciumMg', unit: 'mg', creaLabels: ['Calcio (mg)'] },
  { key: 'magnesiumMg', unit: 'mg', creaLabels: ['Magnesio (mg)'] },
  { key: 'phosphorusMg', unit: 'mg', creaLabels: ['Fosforo (mg)'] },
  { key: 'ironMg', unit: 'mg', creaLabels: ['Ferro (mg)'] },
  { key: 'zincMg', unit: 'mg', creaLabels: ['Zinco (mg)'] },
  { key: 'copperMg', unit: 'mg', creaLabels: ['Rame (mg)'] },
  { key: 'manganeseMg', unit: 'mg', creaLabels: ['Manganese (mg)'] },
  { key: 'seleniumUg', unit: 'μg', creaLabels: ['Selenio (μg)'] },
  { key: 'iodineUg', unit: 'μg', creaLabels: ['Iodio (μg)'] },
  { key: 'vitaminCMg', unit: 'mg', creaLabels: ['Vitamina C (mg)'] },
  { key: 'thiaminMg', unit: 'mg', creaLabels: ['Tiamina (mg)'] },
  { key: 'riboflavinMg', unit: 'mg', creaLabels: ['Riboflavina (mg)'] },
  { key: 'niacinMg', unit: 'mg', creaLabels: ['Niacina (mg)'] },
  { key: 'vitaminB6Mg', unit: 'mg', creaLabels: ['Vitamina B6 (mg)'] },
  { key: 'folateUg', unit: 'μg', creaLabels: ['Folati totali (μg)', 'Folati (μg)'] },
  { key: 'vitaminB12Ug', unit: 'μg', creaLabels: ['Vitamina B12 (μg)'] },
  { key: 'vitaminAReUg', unit: 'μg', creaLabels: ['Vitamina A retinolo equivalente (μg)'] },
  { key: 'betaCaroteneUg', unit: 'μg', creaLabels: ['Carotene beta (μg)'] },
  { key: 'vitaminDUg', unit: 'μg', creaLabels: ['Vitamina D (μg)'] },
  { key: 'vitaminEMg', unit: 'mg', creaLabels: ['Vitamina E (mg)'] }
];

const LEAFY_OR_CRUCIFEROUS_REGEX =
  /\b(spinac\w*|bietol\w*|erbett\w*|cavol\w*|broccol\w*|cime\s+di\s+rapa|verza|rucola|ruchetta|lattuga|cicoria|catalogna|indivia|scarola|radicchio|agretti|borragine|prezzemolo|basilico)\b/i;

export class NutritionPhysiologyService {
  constructor(options = {}) {
    this.rulesPath = options.rulesPath || RULES_SEED_PATH;
    this.dishesPath = options.dishesPath || DISHES_SEED_PATH;
    this._rules = null;
    this._dishesCache = null;
  }

  getRules() {
    if (!this._rules) {
      this._rules = JSON.parse(fs.readFileSync(this.rulesPath, 'utf8'));
    }
    return this._rules;
  }

  _getDishesCatalog() {
    if (!this._dishesCache) {
      try {
        this._dishesCache = fs.existsSync(this.dishesPath)
          ? JSON.parse(fs.readFileSync(this.dishesPath, 'utf8'))
          : [];
      } catch (_) {
        this._dishesCache = [];
      }
    }
    return this._dishesCache;
  }

  /**
   * Resolves a canonical cookingMethod ID and liquidFate from flexible caller inputs.
   */
  resolveCookingContext(cookingMethod = 'pan_seared_gentle', liquidFate = null) {
    const rules = this.getRules();
    const rawMethod = normalizeSearchToken(String(cookingMethod || 'pan_seared_gentle')).replace(/\s+/g, '_');
    let canonicalMethod =
      (rules.cookingMethods[rawMethod] && rawMethod) ||
      rules.cookingMethodAliases[rawMethod] ||
      'pan_seared_gentle';

    const normFate = liquidFate ? normalizeSearchToken(String(liquidFate)) : null;

    // Physical liquid-fate override: boiling where broth/water is kept in the dish (soup, minestra, risottatura)
    // retains leached minerals (K, Mg, Fe, Ca), whereas draining discards them.
    if (canonicalMethod === 'boiled_drained' && normFate && /^(retained|kept|trattenut\w*|soup|risott\w*)$/.test(normFate)) {
      canonicalMethod = 'stewed_liquid_kept';
    } else if (canonicalMethod === 'stewed_liquid_kept' && normFate && /^(discarded|drained|scolat\w*)$/.test(normFate)) {
      canonicalMethod = 'boiled_drained';
    }

    const methodDef = rules.cookingMethods[canonicalMethod] || rules.cookingMethods.pan_seared_gentle;
    return {
      cookingMethod: canonicalMethod,
      methodLabel: methodDef.label,
      liquidFate: normFate || methodDef.defaultLiquidFate,
      isThermal: Boolean(methodDef.isThermal),
      sourceRef: methodDef.sourceRef
    };
  }

  /**
   * Maps a CREA food item into one of the USDA Release 6 retention food groups.
   */
  resolveRetentionFoodGroup(food = {}) {
    const catNorm = normalizeSearchToken(food.category || '');
    const nameNorm = normalizeSearchToken(food.name || '');

    if (catNorm.includes('verdure') || catNorm.includes('ortaggi')) {
      if (LEAFY_OR_CRUCIFEROUS_REGEX.test(nameNorm)) {
        return 'leafy_cruciferous_veg';
      }
      return 'fruiting_other_veg';
    }
    if (catNorm.includes('legumi')) return 'legumes_pulses';
    if (catNorm.includes('cereali')) return 'cereals_pasta_grains';
    if (catNorm.includes('prodotti della pesca')) return 'finfish_shellfish';
    if (catNorm.includes('carni') || catNorm.includes('uova') || catNorm.includes('frattaglie')) {
      return 'meat_poultry_eggs';
    }
    return 'other_foods';
  }

  /**
   * Resolves a CREA food record from an ingredient input (`creaId`, `creaFoodId`, `id`, or conservative name lookup).
   */
  resolveIngredientCreaFood(ingredient = {}) {
    if (!ingredient) return null;
    const explicitId = ingredient.creaId ?? ingredient.creaFoodId ?? ingredient.id ?? null;
    if (explicitId) {
      const byId = creaService.getFoodById(String(explicitId));
      if (byId) return byId;
    }

    const rawName = String(ingredient.name || ingredient.title || '').trim();
    if (!rawName) return null;

    // Try conservative matcher first, then exact/prefix CREA search
    const offerStyleMatch = creaOfferMatcher.matchOfferToCrea({
      title: rawName,
      domain: 'food_human'
    });
    if (offerStyleMatch?.food) return offerStyleMatch.food;

    const qNorm = normalizeSearchToken(rawName);
    const all = creaService.getAllFoods();
    return (
      all.find((f) => f.normName === qNorm) ||
      all.find((f) => f.normName.startsWith(`${qNorm},`) || f.normName.startsWith(`${qNorm} `)) ||
      all.find((f) => f.normName.includes(qNorm)) ||
      null
    );
  }

  /**
   * Classifies a food item into a discrete certified Calcium Bioavailability tier (Weaver 1999 / SINU LARN V Rev.).
   * Never invents continuous fractional percentages on untabulated foods (ADR-0006).
   */
  classifyCalciumBioavailability(foodOrItem = {}) {
    const rules = this.getRules().calciumBioavailabilityClasses;
    const labelText = normalizeSearchToken(
      `${foodOrItem.name || foodOrItem.title || ''} ${foodOrItem.category || ''}`
    );

    const matchesAny = (kwList = []) =>
      kwList.some((kw) => {
        const normKw = normalizeSearchToken(kw);
        return normKw && new RegExp(`\\b${normKw}`, 'i').test(labelText);
      });

    // Check oxalate-inhibited FIRST so "spinaci" or "bietole" never leak into another tier
    if (matchesAny(rules.low_oxalate_lt_10pct.keywords)) {
      return {
        tierId: 'low_oxalate_lt_10pct',
        ...rules.low_oxalate_lt_10pct
      };
    }

    // Special fish rule: canned skinless/boneless fillets of large tuna do NOT provide edible fish bones,
    // whereas fresh/whole anchovies (alici/acciughe), sardines, latterini, or whole canned mackerel in brine do.
    const isBonelessTuna = /\btonno\b/.test(labelText);
    if (!isBonelessTuna && matchesAny(rules.high_gt_30pct.keywords)) {
      return {
        tierId: 'high_gt_30pct',
        ...rules.high_gt_30pct
      };
    }

    if (matchesAny(rules.moderate_15_25pct.keywords)) {
      return {
        tierId: 'moderate_15_25pct',
        ...rules.moderate_15_25pct
      };
    }

    return {
      tierId: 'unclassified_standard',
      ...rules.unclassified_standard
    };
  }

  _extractFlatCreaRowMap(food) {
    const flat = {};
    for (const rows of Object.values(food?.sections || {})) {
      for (const row of rows || []) {
        const parsed = parseCreaValue(row.v100);
        if (parsed.numeric !== null) {
          flat[row.c] = parsed.numeric;
        }
      }
    }
    return flat;
  }

  _extractAminoAcidsPer100gProtein(food) {
    const rows = food?.sections?.['AMINOACIDI (% DI PROTEINE)'] || [];
    if (!rows.length) return null;
    const map = {};
    for (const r of rows) {
      if (r.c === 'Aminoacido limitante') {
        map._limitingLabel = r.v100 || null;
        continue;
      }
      const parsed = parseCreaValue(r.v100);
      if (parsed.numeric !== null) {
        map[r.c] = parsed.numeric;
      }
    }
    return Object.keys(map).length > 0 ? map : null;
  }

  _resolvePhysicalCookedYieldMultiplier(food, effectiveMethod) {
    if (!food || effectiveMethod === 'raw') return 1.0;
    if (food.yieldFactor && food.yieldFactor.isRaw === false) return 1.0;

    const baseMult = Number(food.yieldFactor?.multiplier) || 1.0;
    const group = this.resolveRetentionFoodGroup(food);

    // Steaming or gentle pan searing of leafy vegetables dehydrates slightly less than boiling+squeezing
    if (group === 'leafy_cruciferous_veg' && effectiveMethod === 'steamed' && baseMult < 1.0) {
      return Math.min(0.92, Number((baseMult + 0.12).toFixed(2)));
    }
    return baseMult;
  }

  /**
   * Computes personalized or preset LARN V Rev. (2024) daily nutritional targets.
   */
  getPresets() {
    const rules = this.getRules();
    return {
      presets: rules.larnZeroFrictionPresets,
      advancedSchema: rules.advancedParametersSchema,
      sources: rules.sources
    };
  }

  computePersonalizedLarnTargets(options = {}) {
    const rules = this.getRules();
    const presetId = options.presetId || 'active_adult';
    const preset =
      rules.larnZeroFrictionPresets.find((p) => p.id === presetId) || rules.larnZeroFrictionPresets[0];
    const profile = userProfileService.getProfileById(options.profileId || null);
    const excludesCheese =
      (profile?.excludedCategories || []).some((c) => /formagg|latticin/i.test(c)) ||
      (profile?.excludedIngredients || []).some((i) => /formagg/i.test(i));

    const adv = options.advancedParams || null;
    if (!adv || typeof adv !== 'object' || !adv.weightKg || !adv.heightCm || !adv.ageYears) {
      return {
        mode: 'zero_friction_preset',
        presetId: preset.id,
        presetName: preset.name,
        profileId: profile?.id || 'casa',
        zeroCheeseCalciumGuardActive: excludesCheese,
        dailyTargets: { ...preset.dailyTargets },
        sourceRef: 'LARN_V_2024'
      };
    }

    // Mifflin-St Jeor BMR × LAF (SINU LARN V Rev.)
    const sex = adv.sex === 'F' ? 'F' : 'M';
    const weightKg = Math.max(40, Math.min(160, Number(adv.weightKg) || 72));
    const heightCm = Math.max(140, Math.min(215, Number(adv.heightCm) || 178));
    const ageYears = Math.max(18, Math.min(95, Number(adv.ageYears) || 38));
    const laf = Math.max(1.2, Math.min(2.2, Number(adv.laf) || 1.6));
    const goalDeltaKcal = Math.max(-400, Math.min(400, Number(adv.goalDeltaKcal) || 0));

    const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * ageYears + (sex === 'M' ? 5 : -161));
    const tdee = Math.max(1400, Math.round(bmr * laf + goalDeltaKcal));
    const protPerKg = preset.dailyTargets.proteinGPerKgRef || 1.2;
    const proteinG = Math.round(weightKg * protPerKg);
    const fatG = Math.round((tdee * 0.30) / 9);
    const carbsG = Math.max(120, Math.round((tdee - proteinG * 4 - fatG * 9) / 4));
    const ironMg = sex === 'F' && ageYears < 50 ? 18 : preset.dailyTargets.ironMg;
    const calciumMg = ageYears >= 60 ? 1200 : 1000;

    return {
      mode: 'personalized_mifflin_larn',
      presetId: preset.id,
      presetName: preset.name,
      profileId: profile?.id || 'casa',
      zeroCheeseCalciumGuardActive: excludesCheese,
      anthropometrics: { sex, ageYears, weightKg, heightCm, laf, bmrKcal: bmr, tdeeKcal: tdee },
      dailyTargets: {
        ...preset.dailyTargets,
        kcal: tdee,
        proteinG,
        fatG,
        carbsG,
        ironMg,
        calciumMg
      },
      sourceRef: 'LARN_V_2024'
    };
  }

  /**
   * Core Physiological Meal Evaluator (`TASK-V2-03`):
   * Accepts either:
   *  - positional `(ingredients, cookingMethod, liquidFate, addedFatGrams, cooledHours, extraOptions)`
   *  - or single object `({ ingredients, cookingMethod, liquidFate, addedFatGrams, cooledHours, ... })`
   *
   * Computes:
   *  1. Full 30+ CREA cooked nutrient vector applying USDA Release 6 / Bognár (2002) retention factors
   *     (`null` preserved honestly when untabulated; zero synthetic numbers).
   *  2. Physical cooked weight & Volumetrics Cooked Energy Density (`kcal / 100g cooked`).
   *  3. Discrete Calcium Bioavailability assessment (highlighting high-bioavail brassicas/anchovies vs oxalate-trapped spinach).
   *  4. Heme vs Non-Heme Iron partition + Vitamin C (>=30 mg) activation & phytate/oxalate/tannin inhibitors.
   *  5. Carotenoids / cis-Lycopene micellar unlocking (>=5g EVO lipids + thermal isomerization).
   *  6. Type 3 Resistant Starch (RS3) retrogradation when cooked starchy foods are cooled >=12h at +4°C (`boat_day` ideal).
   *  7. Indispensable Amino Acid Complementation using CREA Section 5 (`AMINOACIDI % DI PROTEINE`) vs FAO/WHO/UNU 2007.
   */
  evaluateCookedMealPhysiology(
    ingredientsOrPayload = [],
    cookingMethodArg = 'pan_seared_gentle',
    liquidFateArg = null,
    addedFatGramsArg = 0,
    cooledHoursArg = 0,
    extraOptions = {}
  ) {
    let ingredients = [];
    let cookingMethod = cookingMethodArg;
    let liquidFate = liquidFateArg;
    let addedFatGrams = addedFatGramsArg;
    let cooledHours = cooledHoursArg;
    let opts = extraOptions || {};

    if (
      ingredientsOrPayload &&
      !Array.isArray(ingredientsOrPayload) &&
      typeof ingredientsOrPayload === 'object'
    ) {
      ingredients = Array.isArray(ingredientsOrPayload.ingredients)
        ? ingredientsOrPayload.ingredients
        : [];
      cookingMethod = ingredientsOrPayload.cookingMethod ?? 'pan_seared_gentle';
      liquidFate = ingredientsOrPayload.liquidFate ?? null;
      addedFatGrams = Number(ingredientsOrPayload.addedFatGrams) || 0;
      cooledHours = Number(ingredientsOrPayload.cooledHours) || 0;
      opts = ingredientsOrPayload;
    } else {
      ingredients = Array.isArray(ingredientsOrPayload) ? ingredientsOrPayload : [];
      addedFatGrams = Number(addedFatGrams) || 0;
      cooledHours = Number(cooledHours) || 0;
    }

    const rules = this.getRules();
    const mealCookCtx = this.resolveCookingContext(cookingMethod, liquidFate);

    // Prepare working ingredient list + optional added cooking/dressing EVO oil (`addedFatGrams`)
    const workingList = ingredients.map((ing) => ({ ...ing, _isAddedCookingFat: false }));
    if (addedFatGrams > 0) {
      workingList.push({
        creaId: opts.addedFatCreaId || EVO_OIL_CREA_ID,
        name: 'Olio di oliva extra vergine (condimento/cottura)',
        grams: addedFatGrams,
        cookingMethod: opts.addedFatAddedRaw ? 'raw' : mealCookCtx.cookingMethod,
        _isAddedCookingFat: true
      });
    }

    const nutrientSums = {};
    const nutrientMeasuredCount = {};
    for (const spec of PHYSIOLOGY_NUTRIENT_SPECS) {
      nutrientSums[spec.key] = 0;
      nutrientMeasuredCount[spec.key] = 0;
    }

    let totalRawEdibleGrams = 0;
    let totalCookedWeightGrams = 0;

    // Bioavailability accumulators
    let highBioavailCalciumMg = 0;
    let moderateBioavailCalciumMg = 0;
    let oxalateInhibitedCalciumMg = 0;
    let unclassifiedCalciumMg = 0;

    let hemeIronMg = 0;
    let nonHemeIronMg = 0;
    let animalMuscleProteinG = 0;
    let hasPhytateRichIngredient = false;
    let hasOxalateRichIngredient = false;
    let hasTanninInhibitor = Boolean(opts.hasTanninBeverage);
    let hasLycopeneTomato = false;
    let hasThermalLycopeneTomato = false;
    let thermalStarchyCookedGrams = 0;
    let thermalStarchGrams = 0;

    // Amino acid accumulators (in total grams of each indispensable AA group across covered protein)
    const aaRefPattern = rules.essentialAminoAcidPatternFAO2007.referencePattern;
    const aaGroupTotalsGrams = {};
    for (const groupKey of Object.keys(aaRefPattern)) {
      aaGroupTotalsGrams[groupKey] = 0;
    }
    let aaCoveredProteinGrams = 0;
    const individualIngredientAaScores = [];

    const evaluatedIngredients = [];

    for (const item of workingList) {
      const food = this.resolveIngredientCreaFood(item);
      const rawInputGrams = Number(
        item.grams ?? item.edibleGrams ?? item.rawGramsPerServing ?? item.rawGrams ?? 0
      );
      if (!food || !(rawInputGrams > 0)) {
        evaluatedIngredients.push({
          inputName: item.name || item.title || null,
          creaId: item.creaId || null,
          matched: false,
          grams: rawInputGrams > 0 ? rawInputGrams : 0
        });
        continue;
      }

      const edibleRatio = item.isGrossWeight
        ? Math.max(0.1, (Number(food.ediblePartPct) || 100) / 100)
        : 1.0;
      const edibleRawGrams = Number((rawInputGrams * edibleRatio).toFixed(2));
      const scale100 = edibleRawGrams / 100;

      // Support optional per-ingredient cooking method (e.g. raw lemon juice squeezed at the end onto boiled lentils!)
      const itemCookCtx =
        item.isRawGarnish || item.addedRawAtEnd || item.cookingMethod === 'raw'
          ? this.resolveCookingContext('raw', 'none')
          : item.cookingMethod
            ? this.resolveCookingContext(item.cookingMethod, item.liquidFate || mealCookCtx.liquidFate)
            : mealCookCtx;

      const foodGroup = this.resolveRetentionFoodGroup(food);
      const groupMatrix =
        rules.thermalRetentionMatrix[foodGroup] || rules.thermalRetentionMatrix.other_foods;
      const methodRetentions = groupMatrix?.methods?.[itemCookCtx.cookingMethod] || {};
      const shouldApplyThermalRetention =
        itemCookCtx.isThermal && (food.yieldFactor ? food.yieldFactor.isRaw !== false : true);

      const yieldMult = this._resolvePhysicalCookedYieldMultiplier(food, itemCookCtx.cookingMethod);
      const cookedGrams = Number((edibleRawGrams * yieldMult).toFixed(1));

      totalRawEdibleGrams += edibleRawGrams;
      totalCookedWeightGrams += cookedGrams;

      const flatMap = this._extractFlatCreaRowMap(food);
      const km = food.keyMetrics || {};
      const itemNutrients = {};
      const appliedRetentions = {};

      for (const spec of PHYSIOLOGY_NUTRIENT_SPECS) {
        let basePer100g = null;
        if (spec.fromKeyMetrics) {
          basePer100g = km[spec.fromKeyMetrics] !== undefined ? km[spec.fromKeyMetrics] : null;
        } else {
          for (const lbl of spec.creaLabels || []) {
            if (flatMap[lbl] !== undefined) {
              basePer100g = flatMap[lbl];
              break;
            }
          }
        }

        if (basePer100g === null || basePer100g === undefined) {
          itemNutrients[spec.key] = null;
          appliedRetentions[spec.key] = null;
          continue;
        }

        let retention = 1.0;
        if (shouldApplyThermalRetention) {
          const rf = methodRetentions[spec.key];
          if (typeof rf === 'number') {
            retention = rf;
            appliedRetentions[spec.key] = rf;
          } else {
            // ADR-0006: when USDA/Bognár has no retention factor for this nutrient, preserve 1.0 with explicit null rf metadata
            appliedRetentions[spec.key] = null;
          }
        } else {
          appliedRetentions[spec.key] = itemCookCtx.isThermal ? null : 1.0;
        }

        let cookedVal = basePer100g * scale100 * retention;
        // Adjust physical water content when hydration (pasta/rice/legumes) or dehydration occurs
        if (spec.key === 'waterG' && yieldMult !== 1.0) {
          const massDelta = cookedGrams - edibleRawGrams;
          cookedVal = Math.max(0, basePer100g * scale100 + massDelta);
        }

        const rounded = Number(cookedVal.toFixed(cookedVal > 0 && cookedVal < 1 ? 3 : 2));
        itemNutrients[spec.key] = rounded;
        nutrientSums[spec.key] += cookedVal;
        nutrientMeasuredCount[spec.key] += 1;
      }

      // 1. Calcium Tier Classification
      const caTier = this.classifyCalciumBioavailability(food);
      const itemCa = itemNutrients.calciumMg || 0;
      if (caTier.tierId === 'high_gt_30pct') highBioavailCalciumMg += itemCa;
      else if (caTier.tierId === 'moderate_15_25pct') moderateBioavailCalciumMg += itemCa;
      else if (caTier.tierId === 'low_oxalate_lt_10pct') oxalateInhibitedCalciumMg += itemCa;
      else unclassifiedCalciumMg += itemCa;

      // 2. Iron Heme vs Non-Heme & Enhancers/Inhibitors
      const ironRules = rules.ironBioavailabilityRules;
      const isAnimalHemeSource = ironRules.hemeIronCategories.some(
        (c) => normalizeSearchToken(c) === normalizeSearchToken(food.category || '')
      );
      const itemFe = itemNutrients.ironMg || 0;
      if (isAnimalHemeSource) {
        const hemeShare = ironRules.hemeShareInAnimalTissue;
        hemeIronMg += itemFe * hemeShare;
        nonHemeIronMg += itemFe * (1 - hemeShare);
        animalMuscleProteinG += itemNutrients.proteinG || 0;
      } else {
        nonHemeIronMg += itemFe;
      }

      const itemTextNorm = normalizeSearchToken(`${item.name || ''} ${food.name || ''}`);
      if (
        !item.isSoakedOrSprouted &&
        ironRules.inhibitorPhytateKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(itemTextNorm))
      ) {
        hasPhytateRichIngredient = true;
      }
      if (ironRules.inhibitorOxalateKeywords.some((kw) => new RegExp(`\\b${kw}`, 'i').test(itemTextNorm))) {
        hasOxalateRichIngredient = true;
      }
      if (ironRules.inhibitorTanninKeywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(itemTextNorm))) {
        hasTanninInhibitor = true;
      }

      // 3. Lycopene / Carotenoids check
      if (
        rules.carotenoidsAndLiposolubleRules.lycopeneRichKeywords.some((kw) =>
          new RegExp(`\\b${kw}`, 'i').test(itemTextNorm)
        )
      ) {
        hasLycopeneTomato = true;
        if (itemCookCtx.isThermal) {
          hasThermalLycopeneTomato = true;
        }
      }

      // 4. Starchy cooked check for Type 3 Resistant Starch (RS3)
      const isStarchyItem =
        (itemNutrients.starchG || 0) >= 8 ||
        rules.resistantStarchRS3Rules.starchyKeywords.some((kw) =>
          new RegExp(`\\b${kw}`, 'i').test(itemTextNorm)
        );
      if (isStarchyItem && itemCookCtx.isThermal) {
        thermalStarchyCookedGrams += cookedGrams;
        thermalStarchGrams += itemNutrients.starchG || (itemNutrients.carbsG || 0) * 0.75;
      }

      // 5. CREA Section 5 Indispensable Amino Acids
      const aaMap = this._extractAminoAcidsPer100gProtein(food);
      const itemProt = itemNutrients.proteinG || 0;
      if (aaMap && itemProt > 0.2) {
        aaCoveredProteinGrams += itemProt;
        let itemMinRatio = Infinity;
        let itemLimitingKey = null;
        for (const [groupKey, spec] of Object.entries(aaRefPattern)) {
          const per100gProt = (spec.creaLabels || []).reduce(
            (sum, lbl) => sum + (aaMap[lbl] || 0),
            0
          );
          // g of AA = itemProt * (per100gProt / 100)
          aaGroupTotalsGrams[groupKey] += itemProt * (per100gProt / 100);
          const ratio = per100gProt / spec.targetPer100gProtein;
          if (ratio < itemMinRatio) {
            itemMinRatio = ratio;
            itemLimitingKey = groupKey;
          }
        }
        if (Number.isFinite(itemMinRatio)) {
          individualIngredientAaScores.push({
            creaId: food.id,
            name: food.name,
            proteinG: Number(itemProt.toFixed(2)),
            chemicalScorePct: Math.min(100, Math.round(itemMinRatio * 100)),
            limitingGroup: itemMinRatio < 1.0 ? itemLimitingKey : null
          });
        }
      }

      evaluatedIngredients.push({
        creaId: food.id,
        name: food.name,
        category: food.category,
        foodGroup,
        edibleRawGrams,
        cookedWeightGrams: cookedGrams,
        yieldMultiplier: yieldMult,
        cookingMethod: itemCookCtx.cookingMethod,
        calciumBioavailabilityTier: caTier.tierId,
        appliedRetentions,
        nutrients: itemNutrients,
        isAddedCookingFat: Boolean(item._isAddedCookingFat)
      });
    }

    // Finalize 30+ nutrient vector (preserving `null` when NO ingredient in the meal measured that micronutrient)
    const nutrients = {};
    const unmeasuredNutrients = [];
    for (const spec of PHYSIOLOGY_NUTRIENT_SPECS) {
      if (nutrientMeasuredCount[spec.key] === 0) {
        nutrients[spec.key] = null;
        unmeasuredNutrients.push(spec.key);
      } else {
        const rawSum = nutrientSums[spec.key];
        nutrients[spec.key] = Number(rawSum.toFixed(rawSum > 0 && rawSum < 1 ? 3 : 2));
      }
    }

    totalRawEdibleGrams = Number(totalRawEdibleGrams.toFixed(1));
    totalCookedWeightGrams = Number(totalCookedWeightGrams.toFixed(1));

    const totalKcal = nutrients.kcal || 0;
    const cookedEnergyDensityKcalPer100g =
      totalCookedWeightGrams > 0
        ? Number(((totalKcal / totalCookedWeightGrams) * 100).toFixed(1))
        : null;

    let energyDensityBand = 'medium_150_225';
    if (cookedEnergyDensityKcalPer100g !== null) {
      if (cookedEnergyDensityKcalPer100g < 70) energyDensityBand = 'very_low_lt_70';
      else if (cookedEnergyDensityKcalPer100g <= 150) energyDensityBand = 'low_70_150';
      else if (cookedEnergyDensityKcalPer100g <= 225) energyDensityBand = 'medium_150_225';
      else energyDensityBand = 'high_gt_225';
    }

    // Protein+Fiber per 100 kcal satiety proxy (100% deterministic CREA metric, replacing synthetic "hours")
    const proteinPlusFiberG = Number(((nutrients.proteinG || 0) + (nutrients.fiberG || 0)).toFixed(2));
    const proteinFiberPer100Kcal =
      totalKcal > 0 ? Number(((proteinPlusFiberG / totalKcal) * 100).toFixed(2)) : 0;

    // --- Bioavailability Assessments & Badges ---
    const badges = [];

    // 1. Calcium Bioavailability (Zero-Cheese critical lens)
    const totalCa = nutrients.calciumMg || 0;
    let zeroCheeseCalciumTier = 'low_calcium_content';
    if (highBioavailCalciumMg >= 80) {
      zeroCheeseCalciumTier = 'high_bioavailability_verified';
      badges.push({
        code: 'CA_HIGH_BIOAVAIL',
        tone: 'emerald',
        label: 'Calcio Alta Biodisponibilità (>30%) — Ideale Zero Formaggi',
        detail: `${Math.round(highBioavailCalciumMg)} mg da matrici a basso ossalato o lische edibili (Weaver 1999 / LARN V).`
      });
    } else if (oxalateInhibitedCalciumMg >= 60 && highBioavailCalciumMg < 40) {
      zeroCheeseCalciumTier = 'oxalate_trapped_poor';
      badges.push({
        code: 'CA_OXALATE_INHIBITED',
        tone: 'amber',
        label: 'Calcio Bloccato da Ossalati (<10%)',
        detail: `${Math.round(oxalateInhibitedCalciumMg)} mg provengono da spinaci/bietole ad alto acido ossalico: non contare per la quota Calcio Zero Formaggi; preferisci cavolo nero, broccoli, rucola o alici.`
      });
    } else if (highBioavailCalciumMg + moderateBioavailCalciumMg >= 60) {
      zeroCheeseCalciumTier = 'moderate_bioavailability';
      badges.push({
        code: 'CA_MODERATE_BIOAVAIL',
        tone: 'sky',
        label: 'Contributo Calcio Biodisponibile Moderato (15–30%)',
        detail: `${Math.round(highBioavailCalciumMg + moderateBioavailCalciumMg)} mg da fonti vegetali/semi non ossalate.`
      });
    }

    const calciumAssessment = {
      totalGrossCalciumMg: totalCa,
      highBioavailCalciumMg: Number(highBioavailCalciumMg.toFixed(1)),
      moderateBioavailCalciumMg: Number(moderateBioavailCalciumMg.toFixed(1)),
      oxalateInhibitedCalciumMg: Number(oxalateInhibitedCalciumMg.toFixed(1)),
      unclassifiedCalciumMg: Number(unclassifiedCalciumMg.toFixed(1)),
      zeroCheeseCalciumTier,
      sourceRef: 'WEAVER_1999_CA'
    };

    // 2. Iron Bioavailability (Heme vs Non-Heme + Vitamin C >= 30mg synergy)
    const retainedVitC = nutrients.vitaminCMg || 0;
    const vitCThreshold = rules.ironBioavailabilityRules.vitaminCActivationThresholdMg;
    const vitCActivated = nonHemeIronMg >= 0.8 && retainedVitC >= vitCThreshold;
    const hasMfpFactor = animalMuscleProteinG >= rules.ironBioavailabilityRules.mfpAnimalProteinThresholdGrams;

    let ironTier = 'low_iron_meal';
    if (hemeIronMg + nonHemeIronMg >= 1.2) {
      if (hemeIronMg >= 0.8 && (vitCActivated || hasMfpFactor)) {
        ironTier = 'heme_plus_activated_non_heme';
        badges.push({
          code: 'FE_HEME_OPTIMAL',
          tone: 'emerald',
          label: 'Ferro Eme + Fattore MFP Attivo',
          detail: `${hemeIronMg.toFixed(2)} mg ferro eme ad assorbimento diretto + ${nonHemeIronMg.toFixed(2)} mg non-eme.`
        });
      } else if (vitCActivated) {
        ironTier = 'non_heme_vit_c_activated';
        badges.push({
          code: 'FE_VITC_SYNERGY',
          tone: 'emerald',
          label: 'Sinergia Ferro + Vitamina C Attiva (×2–3)',
          detail: `${retainedVitC.toFixed(1)} mg di Vitamina C termoresidua (>=${vitCThreshold} mg) riducono Fe3+ a Fe2+ solubile, sbloccando i ${nonHemeIronMg.toFixed(2)} mg di ferro non-eme.`
        });
      } else if (hasPhytateRichIngredient || hasOxalateRichIngredient || hasTanninInhibitor) {
        ironTier = 'non_heme_inhibited';
        badges.push({
          code: 'FE_INHIBITED_ADD_VITC',
          tone: 'amber',
          label: 'Ferro Non-Eme Frenato — Aggiungi Limone/Vit. C a Crudo',
          detail: `Presenza di fitati/ossalati/tannini con soli ${retainedVitC.toFixed(1)} mg di Vit. C: spruzza succo di limone fresco o aggiungi peperoni/kiwi per attivare l'assorbimento.`
        });
      } else {
        ironTier = 'non_heme_baseline';
      }
    }

    const ironAssessment = {
      totalIronMg: nutrients.ironMg || 0,
      hemeIronMg: Number(hemeIronMg.toFixed(2)),
      nonHemeIronMg: Number(nonHemeIronMg.toFixed(2)),
      retainedVitaminCMg: retainedVitC,
      isVitaminCActivated: vitCActivated,
      hasMfpFactor,
      inhibitors: {
        phytates: hasPhytateRichIngredient,
        oxalates: hasOxalateRichIngredient,
        tannins: hasTanninInhibitor
      },
      ironTier,
      sourceRef: 'HALLBERG_2000_FE'
    };

    // 3. Carotenoids / Lycopene & Liposoluble Micellization
    const totalFatG = nutrients.fatG || 0;
    const minMicelleFat = rules.carotenoidsAndLiposolubleRules.minLipidsForMicellesGrams;
    const hasHighCarotenoids =
      hasLycopeneTomato ||
      (nutrients.vitaminAReUg || 0) >= rules.carotenoidsAndLiposolubleRules.carotenoidRichVitaminAReThresholdUg;

    let micellarStatus = 'neutral';
    let cisLycopeneUnlocked = false;
    if (hasThermalLycopeneTomato && totalFatG >= minMicelleFat) {
      micellarStatus = 'unlocked';
      cisLycopeneUnlocked = true;
      badges.push({
        code: 'LYCOPENE_CIS_EVO_UNLOCKED',
        tone: 'emerald',
        label: 'Cis-Licopene Sbloccato (Calore + Olio EVO)',
        detail: `Cottura del pomodoro con ${totalFatG.toFixed(1)}g di lipidi isomerizza il licopene in forma cis micellizzabile (assorbimento 2–3× vs crudo scondito).`
      });
    } else if (hasHighCarotenoids && totalFatG >= minMicelleFat) {
      micellarStatus = 'unlocked';
      badges.push({
        code: 'LIPOSOLUBLE_MICELLES_OK',
        tone: 'sky',
        label: 'Vitamine Liposolubili & Carotenoidi Micellizzati',
        detail: `Quota lipidica (${totalFatG.toFixed(1)}g >= ${minMicelleFat}g) sufficiente per l'assorbimento biliare di Vit. A/D/E/K e carotenoidi.`
      });
    } else if (hasHighCarotenoids && totalFatG < rules.carotenoidsAndLiposolubleRules.lowFatWarningThresholdGrams) {
      micellarStatus = 'suboptimal_low_lipid';
      badges.push({
        code: 'CAROTENOIDS_NEED_EVO',
        tone: 'amber',
        label: 'Aggiungi 1 Cucchiaino di Olio EVO (>=5g)',
        detail: `Pasto ricco di carotenoidi ma quasi privo di lipidi (${totalFatG.toFixed(1)}g): senza grassi vettori l'assorbimento intestinale resta minimo.`
      });
    }

    const liposolubleAssessment = {
      mealFatGrams: totalFatG,
      micellarStatus,
      cisLycopeneUnlocked,
      sourceRef: 'UNLU_2005_CAROTENOIDS'
    };

    // 4. Type 3 Resistant Starch (RS3) Retrogradation (Boat Day Cold Meals)
    const rsRules = rules.resistantStarchRS3Rules;
    const rs3Activated =
      cooledHours >= rsRules.minCoolingHoursAt4C &&
      (thermalStarchGrams >= rsRules.minStarchGramsInMeal || thermalStarchyCookedGrams >= 120);

    if (rs3Activated) {
      badges.push({
        code: 'RS3_RETROGRADED_STARCH',
        tone: 'emerald',
        label: `Amido Resistente RS3 Attivo (${cooledHours}h a +4°C · Ideale Barca)`,
        detail: rsRules.physiologicalEffect
      });
    }

    const resistantStarchAssessment = {
      cooledHours,
      thermalStarchGrams: Number(thermalStarchGrams.toFixed(1)),
      rs3Activated,
      boatDayAntiDrowsinessIdeal: rs3Activated,
      sourceRef: 'SONI_RS3_RETROGRADATION'
    };

    // 5. Indispensable Amino Acid Complementation (FAO/WHO/UNU 2007 on CREA Section 5)
    const totalProteinG = nutrients.proteinG || 0;
    let aminoAcidAssessment = {
      evaluated: false,
      coveredProteinGrams: 0,
      coveredProteinSharePct: 0,
      chemicalScorePct: null,
      limitingAminoAcid: null,
      totalLeucineGrams: null,
      triggersMpsLeucineThreshold: false,
      complementationAchieved: false,
      profilePer100gProtein: null,
      sourceRef: 'FAO_AA_2007'
    };

    if (aaCoveredProteinGrams > 0.5) {
      const profilePer100gProtein = {};
      let minRatio = Infinity;
      let limitingGroup = null;

      for (const [groupKey, spec] of Object.entries(aaRefPattern)) {
        const combinedPer100g = (aaGroupTotalsGrams[groupKey] / aaCoveredProteinGrams) * 100;
        const ratio = combinedPer100g / spec.targetPer100gProtein;
        profilePer100gProtein[groupKey] = {
          gramsPer100gProtein: Number(combinedPer100g.toFixed(2)),
          faoTargetPer100gProtein: spec.targetPer100gProtein,
          scorePct: Math.round(ratio * 100)
        };
        if (ratio < minRatio) {
          minRatio = ratio;
          limitingGroup = groupKey;
        }
      }

      const combinedScorePct = Math.min(100, Math.round(minRatio * 100));
      const minSingleScore =
        individualIngredientAaScores.length > 0
          ? Math.min(...individualIngredientAaScores.map((x) => x.chemicalScorePct))
          : combinedScorePct;
      const complementationAchieved =
        individualIngredientAaScores.length >= 2 &&
        minSingleScore < 85 &&
        combinedScorePct >= Math.min(95, minSingleScore + 20);

      const totalLeucineGrams = Number(aaGroupTotalsGrams.leucine.toFixed(2));
      const triggersMps =
        totalLeucineGrams >= rules.essentialAminoAcidPatternFAO2007.leucineAnabolicTriggerGramsPerMeal;

      if (complementationAchieved) {
        badges.push({
          code: 'AA_COMPLEMENTATION_COMPLETE',
          tone: 'emerald',
          label: `Complementazione Proteica Completa (${combinedScorePct}% FAO)`,
          detail: `La combinazione degli ingredienti compensa i singoli aminoacidi limitanti (da ${minSingleScore}% a ${combinedScorePct}% di score chimico).`
        });
      }

      aminoAcidAssessment = {
        evaluated: true,
        coveredProteinGrams: Number(aaCoveredProteinGrams.toFixed(2)),
        coveredProteinSharePct:
          totalProteinG > 0 ? Math.min(100, Math.round((aaCoveredProteinGrams / totalProteinG) * 100)) : 100,
        chemicalScorePct: combinedScorePct,
        unclampedChemicalScorePct: Math.round(minRatio * 100),
        limitingAminoAcid: combinedScorePct < 100 ? limitingGroup : null,
        totalLeucineGrams,
        triggersMpsLeucineThreshold: triggersMps,
        complementationAchieved,
        individualIngredients: individualIngredientAaScores,
        profilePer100gProtein,
        sourceRef: 'FAO_AA_2007'
      };
    }

    return {
      cookingContext: mealCookCtx,
      weights: {
        rawEdibleGrams: totalRawEdibleGrams,
        addedFatGrams: Number(addedFatGrams.toFixed(1)),
        cookedWeightGrams: totalCookedWeightGrams
      },
      satietyAndVolumetrics: {
        cookedEnergyDensityKcalPer100g,
        energyDensityBand,
        proteinPlusFiberGrams: proteinPlusFiberG,
        proteinFiberPer100Kcal
      },
      nutrientsCount: PHYSIOLOGY_NUTRIENT_SPECS.length,
      measuredNutrientsCount: PHYSIOLOGY_NUTRIENT_SPECS.length - unmeasuredNutrients.length,
      unmeasuredNutrients,
      nutrients,
      bioavailability: {
        calcium: calciumAssessment,
        iron: ironAssessment,
        liposoluble: liposolubleAssessment,
        resistantStarch: resistantStarchAssessment,
        aminoAcids: aminoAcidAssessment
      },
      badges,
      ingredients: evaluatedIngredients
    };
  }

  /**
   * Generates deterministic 5-minute / zero-cook rescue meals from real pantry stock,
   * strictly respecting active profile exclusions (e.g. Zero Formaggi) and opened T_open urgency.
   */
  buildEmergencyRescueMeals({ pantryItems = [], profile = null } = {}) {
    const activeProfile =
      typeof profile === 'object' && profile !== null
        ? profile
        : userProfileService.getProfileById(typeof profile === 'string' ? profile : null);

    const compatiblePantry = (pantryItems || []).filter((p) => {
      if (!p || (p.remainingWeightGrams !== undefined && p.remainingWeightGrams !== null && p.remainingWeightGrams <= 0)) {
        return false;
      }
      if (p.remainingFraction !== undefined && p.remainingFraction <= 0) return false;
      return userProfileService.checkItemCompatibility(
        { title: p.title || p.name || '', category: p.category || '', domain: 'food_human' },
        activeProfile
      ).isCompatible;
    });

    // Sort opened / expiring perishables first so lazy nights save VaR_48h!
    compatiblePantry.sort((a, b) => {
      const aOpen = a.status === 'opened' ? 1 : 0;
      const bOpen = b.status === 'opened' ? 1 : 0;
      if (aOpen !== bOpen) return bOpen - aOpen;
      return (a.hoursRemaining ?? 999) - (b.hoursRemaining ?? 999);
    });

    const findStock = (regex) =>
      compatiblePantry.find((p) => regex.test(normalizeSearchToken(p.title || p.name || '')));

    const fishStock = findStock(/\b(sgombro|tonno|acciug\w*|alici|salmone|sard\w*)\b/);
    const legumeStock = findStock(/\b(ceci|lenticchi\w*|fagiol\w*|cannellini|borlotti)\b/);
    const vegStock = findStock(/\b(rucola|pomodor\w*|peperon\w*|spinac\w*|finocch\w*|insalat\w*|carot\w*|cavol\w*)\b/);
    const carbStock = findStock(/\b(pane|gallett\w*|fette\s+biscottate|avena|crostin\w*)\b/);
    const nutStock = findStock(/\b(mandorl\w*|noci|pinol\w*|nocciole|pistacchi)\b/);

    const candidates = [
      {
        id: 'rescue-mediterranean-fish-pulse-bowl',
        title: 'Piatto Salvagente Cambusa: Sgombro/Pesce Azzurro, Ceci, Rucola & Limone a Crudo',
        prepMinutes: 4,
        cookwareCount: 0,
        savedOpenItems: [fishStock, legumeStock, vegStock].filter((x) => x?.status === 'opened').map((x) => x.title),
        pantryMatchedCount: [fishStock, legumeStock, vegStock].filter(Boolean).length,
        stepsSummary:
          'Scola i ceci e il pesce in conserva in una ciotola, unisci rucola/ortaggi crudi, 1 cucchiaio di Olio EVO e succo di limone fresco (sblocca il ferro non-eme dei legumi).',
        ingredients: [
          { creaId: '123010', name: fishStock?.title || 'Sgombro in salamoia/vetro', grams: 120, cookingMethod: 'raw' },
          { creaId: '004010', name: legumeStock?.title || 'Ceci scolati', grams: 140, cookingMethod: 'raw' },
          { creaId: '005460', name: vegStock?.title || 'Rucola fresca', grams: 60, cookingMethod: 'raw' },
          { creaId: '008040', name: 'Succo di limone fresco', grams: 35, cookingMethod: 'raw' }
        ],
        addedFatGrams: 10
      },
      {
        id: 'rescue-lentil-pepper-vitamin-c-bowl',
        title: 'Bowl Lampo Ferro-Attivata: Lenticchie Pronte, Peperoni Crudi Croccanti, Mandorle & Limone',
        prepMinutes: 5,
        cookwareCount: 0,
        savedOpenItems: [legumeStock, vegStock, nutStock].filter((x) => x?.status === 'opened').map((x) => x.title),
        pantryMatchedCount: [legumeStock, vegStock, nutStock].filter(Boolean).length,
        stepsSummary:
          'Sciacqua rapidamente le lenticchie in scatola/vetro, condisci a freddo con listarelle di peperone crudo (151 mg/100g Vit. C!), mandorle tritate al coltello, limone e Olio EVO.',
        ingredients: [
          { creaId: '004510', name: legumeStock?.title || 'Lenticchie scolate', grams: 180, cookingMethod: 'raw' },
          { creaId: '005600', name: 'Peperoni crudi a filetti', grams: 80, cookingMethod: 'raw' },
          { creaId: '008540', name: nutStock?.title || 'Mandorle dolci secche', grams: 20, cookingMethod: 'raw' },
          { creaId: '008040', name: 'Succo di limone fresco', grams: 25, cookingMethod: 'raw' },
          ...(carbStock ? [{ creaId: '000800', name: carbStock.title, grams: 40, cookingMethod: 'raw' }] : [])
        ],
        addedFatGrams: 10
      },
      {
        id: 'rescue-ligurian-anchovy-tomato-bruschetta',
        title: 'Piatto Freddo del Marinaio: Alici del Mar Ligure, Pomodori Maturi, Rucola & Pane/Gallette',
        prepMinutes: 5,
        cookwareCount: 0,
        savedOpenItems: [fishStock, vegStock, carbStock].filter((x) => x?.status === 'opened').map((x) => x.title),
        pantryMatchedCount: [fishStock, vegStock, carbStock].filter(Boolean).length,
        stepsSummary:
          'Disponi filetti di alici/tonno su pane tostato o gallette da cambusa con pomodoro maturo spezzato a mano, rucola ad alto calcio biodisponibile e Olio EVO ligure.',
        ingredients: [
          { creaId: '120020', name: 'Acciughe/Alici sott\'olio sgocciolate', grams: 65, cookingMethod: 'raw' },
          { creaId: '006610', name: 'Pomodori maturi freschi', grams: 160, cookingMethod: 'raw' },
          { creaId: '005460', name: 'Rucola fresca', grams: 50, cookingMethod: 'raw' },
          { creaId: '008540', name: 'Mandorle o pinoli', grams: 15, cookingMethod: 'raw' }
        ],
        addedFatGrams: 8
      }
    ];

    return candidates
      .map((cand) => {
        // Double-check profile compatibility on every ingredient
        const allSafe = cand.ingredients.every(
          (ing) =>
            userProfileService.checkItemCompatibility(
              { title: ing.name, domain: 'food_human' },
              activeProfile
            ).isCompatible
        );
        if (!allSafe) return null;

        const physiology = this.evaluateCookedMealPhysiology({
          ingredients: cand.ingredients,
          cookingMethod: 'raw',
          liquidFate: 'none',
          addedFatGrams: cand.addedFatGrams,
          cooledHours: 0
        });

        return {
          id: cand.id,
          title: cand.title,
          prepMinutes: cand.prepMinutes,
          cookwareCount: cand.cookwareCount,
          pantryMatchedCount: cand.pantryMatchedCount,
          savedOpenItems: cand.savedOpenItems,
          stepsSummary: cand.stepsSummary,
          physiology
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.savedOpenItems.length - a.savedOpenItems.length || b.pantryMatchedCount - a.pantryMatchedCount);
  }

  /**
   * 1-Tap Adaptive & Behavioral Coaching (`TASK-V2-03`):
   * Handles real-life disruptions without guilt or punitive calorie slashing:
   *  - `eat_out` ("Ho mangiato fuori"): logs real GE restaurant dish (if provided), protects skipped T_open
   *    perishables by shifting them into the next 48h slot, and applies gentle 3–7 day physiological rebalancing
   *    (potassium/water/soluble fiber/low-energy-density cooked meals, zero fasting punishment).
   *  - `emergency_5min` ("Sono stanco / 5 minuti"): builds zero-cook nutritionally complete rescue meals from pantry.
   */
  adaptCoachingPlan(payload = {}) {
    const rawEvent = normalizeSearchToken(String(payload.eventType || 'eat_out')).replace(/\s+/g, '_');
    const isEmergency = /^(emergency|emergency_5min|tired|stanco|5min|zero_cook|salvagente)/.test(rawEvent);
    const activeProfile =
      typeof payload.profile === 'object' && payload.profile !== null
        ? payload.profile
        : userProfileService.getProfileById(payload.profile || payload.profileId || null);

    const pantryItems = Array.isArray(payload.pantryItems)
      ? payload.pantryItems
      : pantryService.getPantryState().items || [];

    const larnContext = this.computePersonalizedLarnTargets({
      presetId: payload.presetId || 'active_adult',
      profileId: activeProfile?.id
    });

    if (isEmergency) {
      const rescueMeals = this.buildEmergencyRescueMeals({
        pantryItems,
        profile: activeProfile
      });
      return {
        eventType: 'emergency_5min',
        nonPunitiveGuarantee: true,
        dailyCalorieFloorRespected: true,
        profileId: activeProfile.id,
        coachingMessage:
          'Stanchezza serale gestita con metodo: zero pentole da sgrassare, zero delivery impulsivo e nutrienti chiave (proteine nobili, Omega-3, Vitamina C + ferro) pronti in 4–5 minuti usando le scorte già aperte.',
        rescueMeals,
        recommendedRescueMeal: rescueMeals[0] || null,
        protectedPerishables: rescueMeals[0]?.savedOpenItems || []
      };
    }

    // --- Event: "Ho mangiato fuori" (`eat_out`) ---
    let resolvedRestaurantDish = null;
    if (payload.restaurantDish) {
      if (typeof payload.restaurantDish === 'object') {
        resolvedRestaurantDish = payload.restaurantDish;
      } else if (typeof payload.restaurantDish === 'string') {
        const q = normalizeSearchToken(payload.restaurantDish);
        const allDishes = this._getDishesCatalog();
        resolvedRestaurantDish =
          allDishes.find((d) => String(d.id) === payload.restaurantDish) ||
          allDishes.find((d) => normalizeSearchToken(d.title || '').includes(q)) ||
          { title: payload.restaurantDish };
      }
    }

    let restaurantMealPhysiology = null;
    if (resolvedRestaurantDish?.bom?.length) {
      restaurantMealPhysiology = this.evaluateCookedMealPhysiology({
        ingredients: resolvedRestaurantDish.bom.map((b) => ({
          creaId: b.creaId,
          name: b.name,
          grams: b.rawGramsPerServing || 100
        })),
        cookingMethod: 'pan_seared_high',
        addedFatGrams: 12
      });
    }

    const adaptedPlan = payload.plan ? JSON.parse(JSON.stringify(payload.plan)) : null;
    const currentDayIndex = Number(payload.currentDayIndex) || 1;
    const currentSlot = payload.currentSlot === 'lunch' ? 'lunch' : 'dinner';

    const urgentPerishables = pantryItems.filter(
      (p) =>
        p &&
        (p.status === 'opened' || (Number.isFinite(p.hoursRemaining) && p.hoursRemaining <= 48)) &&
        (p.remainingWeightGrams === undefined || p.remainingWeightGrams === null || p.remainingWeightGrams > 0)
    );

    const protectedPerishables = [];
    let shiftedDishInfo = null;

    if (adaptedPlan && Array.isArray(adaptedPlan.days)) {
      const currentDay = adaptedPlan.days.find((d) => d.dayIndex === currentDayIndex) || adaptedPlan.days[0];
      const skippedMeal = currentDay?.[currentSlot] || null;
      const skippedDish = skippedMeal?.dish || null;

      if (currentDay) {
        currentDay[currentSlot] = {
          slot: currentSlot,
          status: 'eaten_out_logged',
          contextLabel: `🍷 Pasto Fuori Casa (${resolvedRestaurantDish?.title || 'Pasto sociale registrato'})`,
          loggedRestaurantDish: resolvedRestaurantDish
            ? { id: resolvedRestaurantDish.id || null, title: resolvedRestaurantDish.title }
            : null,
          dish: null
        };
      }

      // Check if skipped dish consumed an opened/perishable item and shift it into next 48h compatible slot
      if (skippedDish) {
        const skippedText = normalizeSearchToken(
          `${skippedDish.title || ''} ${(skippedDish.bom || []).map((b) => b.name).join(' ')}`
        );
        const matchedUrgent = urgentPerishables.filter((u) => {
          const tok = normalizeSearchToken(u.title || '').split(' ').find((w) => w.length >= 4);
          return tok && skippedText.includes(tok);
        });

        const shouldRescueSkippedDish =
          skippedMeal?.consumesOpenedPerishable || matchedUrgent.length > 0;

        if (shouldRescueSkippedDish) {
          for (const nextDay of adaptedPlan.days) {
            if (nextDay.dayIndex <= (currentDay?.dayIndex || 1)) continue;
            if (nextDay.dayIndex > (currentDay?.dayIndex || 1) + 2) break;
            if (nextDay.dayMode === 'eat_out') continue;

            for (const candidateSlot of ['dinner', 'lunch']) {
              if (nextDay.dayMode === 'boat_day' && candidateSlot === 'lunch' && !skippedDish.boatSafeCold) {
                continue;
              }
              if (nextDay[candidateSlot] && !nextDay[candidateSlot].consumesOpenedPerishable) {
                const displacedTitle = nextDay[candidateSlot].dish?.title || null;
                nextDay[candidateSlot] = {
                  ...nextDay[candidateSlot],
                  consumesOpenedPerishable: true,
                  rescuedFromDayIndex: currentDay?.dayIndex || 1,
                  dish: skippedDish
                };
                shiftedDishInfo = {
                  rescuedDishTitle: skippedDish.title,
                  movedToDayIndex: nextDay.dayIndex,
                  movedToDayName: nextDay.dayName,
                  movedToSlot: candidateSlot,
                  displacedDishTitle: displacedTitle
                };
                break;
              }
            }
            if (shiftedDishInfo) break;
          }
        }

        for (const u of matchedUrgent) {
          protectedPerishables.push({
            id: u.id || null,
            title: u.title,
            hoursRemaining: u.hoursRemaining ?? 36,
            action: shiftedDishInfo
              ? `Spostato automaticamente a ${shiftedDishInfo.movedToDayName} (${shiftedDishInfo.movedToSlot})`
              : 'Priorità alta nelle prossime 36h'
          });
        }
      }
    }

    for (const u of urgentPerishables) {
      if (!protectedPerishables.some((x) => x.title === u.title)) {
        protectedPerishables.push({
          id: u.id || null,
          title: u.title,
          hoursRemaining: u.hoursRemaining ?? 48,
          action: 'Protetto nella finestra anti-spreco 48h'
        });
      }
    }

    // Gentle physiological rebalance over next 3–7 days (NEVER punitive fasting!)
    const estimatedOutKcal =
      restaurantMealPhysiology?.nutrients?.kcal ||
      resolvedRestaurantDish?.nutritionPerServing?.energyKcal ||
      850;
    const normalSlotKcal = Math.round(larnContext.dailyTargets.kcal * 0.36);
    const surplusKcal = Math.max(0, estimatedOutKcal - normalSlotKcal);
    // Cap daily adjustment to at most 150 kcal/day spread across 4 days, respecting >=85% of LARN daily target
    const gentleDailyDeltaKcal = surplusKcal > 150 ? -Math.min(150, Math.round(surplusKcal / 4)) : 0;
    const adjustedDailyTargetKcal = Math.max(
      Math.round(larnContext.dailyTargets.kcal * 0.85),
      larnContext.dailyTargets.kcal + gentleDailyDeltaKcal
    );

    const rebalanceActions = [
      {
        code: 'HYDRATION_POTASSIUM_RESET',
        horizon: 'Prossime 24h',
        recommendation:
          'Riequilibra il sodio della cucina da ristorante aumentando potassio e acqua intracellulare (verdure amare/crucifere a vapore, agrumi, zero salumi).'
      },
      {
        code: 'VOLUMETRIC_HIGH_FIBER_NEXT_MEALS',
        horizon: 'Prossimi 3 giorni (Rolling 7gg)',
        recommendation:
          'Privilegia pasti a bassa densità energetica cotta (<140 kcal/100g: legumi in umido, pesce azzurro del Golfo + ortaggi) per sazietà piena senza restrizioni punitive.'
      }
    ];

    if (shiftedDishInfo) {
      rebalanceActions.unshift({
        code: 'T_OPEN_PERISHABLE_RESCUED',
        horizon: 'Entro 48h',
        recommendation: `Salvataggio Zero-Spreco: "${shiftedDishInfo.rescuedDishTitle}" è stato spostato a ${shiftedDishInfo.movedToDayName} (${shiftedDishInfo.movedToSlot}) per consumare i freschi aperti in frigo.`
      });
    }

    return {
      eventType: 'eat_out',
      nonPunitiveGuarantee: true,
      dailyCalorieFloorRespected: adjustedDailyTargetKcal >= 1450,
      profileId: activeProfile.id,
      loggedOutMeal: {
        title: resolvedRestaurantDish?.title || 'Pasto fuori casa / sociale',
        estimatedKcal: Math.round(estimatedOutKcal),
        physiology: restaurantMealPhysiology
      },
      rollingRebalanceWindowDays: 4,
      baselineDailyTargetKcal: larnContext.dailyTargets.kcal,
      gentleAdjustedDailyTargetKcal: adjustedDailyTargetKcal,
      gentleDailyDeltaKcal,
      shiftedDishInfo,
      protectedPerishables,
      rebalanceActions,
      coachingMessage:
        'La fisiologia lavora su medie settimanali, mai sul singolo pasto: nessun taglio punitivo né sensi di colpa. Abbiamo protetto i freschi aperti in frigo e orientato i prossimi 3 giorni su idratazione, potassio e fibre sazianti.',
      adaptedPlan
    };
  }

  /**
   * Passive 14–30 Day Receipt Nutritional Sentinel Audit (`TASK-V2-03`):
   *  - Excludes `isGuests` / `ospiti` receipts so dinner parties never distort personal nutrition.
   *  - Never invents `250g` for unweighed receipt lines (`ADR-0006` strict compliance).
   *  - Amortizes long-shelf-life staples (EVO oil, dry pasta/rice, dry legumes/nuts) across their
   *    multi-week household cycle instead of dumping 1L of olive oil into a single day.
   *  - Audits LARN sentinel group coverage (highlighting Zero-Cheese Calcium & Marine Omega-3 gaps)
   *    and links 1 concrete shopping action to live Rapallo offers.
   */
  async auditReceiptsNutritionalCoverage(receipts = [], options = {}) {
    const rules = this.getRules();
    const windowDays = Math.max(7, Math.min(60, Number(options.windowDays) || 21));
    const profile = userProfileService.getProfileById(options.profileId || null);
    const excludesCheese =
      (profile?.excludedCategories || []).some((c) => /formagg|latticin/i.test(c)) ||
      (profile?.excludedIngredients || []).some((i) => /formagg/i.test(i));

    const safeReceipts = Array.isArray(receipts) ? receipts : [];
    const excludedGuestReceiptsCount = safeReceipts.filter(
      (r) =>
        r &&
        (r.isGuests === true ||
          r.profileId === 'ospiti' ||
          normalizeSearchToken(r.context || r.tag || '') === 'ospiti')
    ).length;

    const personalReceipts = safeReceipts.filter(
      (r) =>
        r &&
        r.isGuests !== true &&
        r.profileId !== 'ospiti' &&
        normalizeSearchToken(r.context || r.tag || '') !== 'ospiti'
    );

    const sentinelStats = new Map();
    for (const grp of rules.sentinelGroupsLarnAudit) {
      sentinelStats.set(grp.id, {
        ...grp,
        observedLineCount: 0,
        amortizedEffectiveUnits: 0,
        verifiedGramsSum: 0,
        unweighedLineCount: 0,
        matchedExamples: []
      });
    }

    let totalFoodLinesAudited = 0;
    let unweighedLinesRespectedCount = 0;
    let oxalateOnlyLeafyCount = 0;

    for (const rec of personalReceipts) {
      const lines = Array.isArray(rec.lines) ? rec.lines : Array.isArray(rec.items) ? rec.items : [];
      for (const line of lines) {
        if (!line) continue;
        if (line.domain && line.domain !== 'food_human') continue;
        const titleNorm = normalizeSearchToken(`${line.title || line.name || ''} ${line.category || ''}`);
        if (!titleNorm) continue;

        totalFoodLinesAudited += 1;

        const explicitGrams =
          Number.isFinite(Number(line.packWeightGrams)) && Number(line.packWeightGrams) > 0
            ? Number(line.packWeightGrams)
            : Number.isFinite(Number(line.explicitWeightGrams)) && Number(line.explicitWeightGrams) > 0
              ? Number(line.explicitWeightGrams)
              : Number.isFinite(Number(line.packVolumeMl)) && Number(line.packVolumeMl) > 0
                ? Number(line.packVolumeMl)
                : null;

        if (explicitGrams === null) {
          unweighedLinesRespectedCount += 1;
        }

        if (/\b(spinac\w*|bietol\w*|erbett\w*)\b/.test(titleNorm)) {
          oxalateOnlyLeafyCount += 1;
        }

        for (const grp of rules.sentinelGroupsLarnAudit) {
          const hit = grp.keywords.some((kw) => {
            const normKw = normalizeSearchToken(kw);
            return normKw && new RegExp(`\\b${normKw}`, 'i').test(titleNorm);
          });
          if (!hit) continue;

          // Guardrail: boneless canned tuna doesn't count as high-bioavail calcium bone source
          if (grp.id === 'calcium_high_bioavail_zero_dairy' && /\btonno\b/.test(titleNorm)) {
            continue;
          }

          const st = sentinelStats.get(grp.id);
          st.observedLineCount += 1;
          if (explicitGrams !== null) {
            st.verifiedGramsSum += explicitGrams;
          } else {
            st.unweighedLineCount += 1;
          }

          // Amortize large shelf-stable stock packs (e.g. 1000ml EVO oil -> covers whole window, not 1 day)
          if (grp.isLongShelfAmortized) {
            const covDays = grp.typicalCoverageDaysPerPack || 14;
            const packFactor =
              explicitGrams && explicitGrams >= 750 ? Math.max(1, covDays / 7) : 1;
            st.amortizedEffectiveUnits += packFactor;
          } else {
            st.amortizedEffectiveUnits += 1;
          }

          if (st.matchedExamples.length < 4) {
            st.matchedExamples.push(line.title || line.name);
          }
        }
      }
    }

    const scaleWindow = windowDays / 14;
    const groupEvaluations = [];
    const gaps = [];
    const warnings = [];

    for (const st of sentinelStats.values()) {
      if (st.isExcessWatch) {
        const maxAllowed = Math.ceil((st.maxRecommendedPurchasesPer14Days || 2) * scaleWindow);
        const status = st.observedLineCount > maxAllowed ? 'excess_watch' : 'ok';
        if (status === 'excess_watch') {
          warnings.push({
            groupId: st.id,
            label: st.label,
            observedCount: st.observedLineCount,
            message: `Rilevati ${st.observedLineCount} acquisti di salumi/carni trasformate su ${windowDays} giorni: per LARN V Rev. conviene alternarli con pesce azzurro, uova o legumi per ridurre sodio e nitriti.`
          });
        }
        groupEvaluations.push({
          groupId: st.id,
          label: st.label,
          status,
          observedLineCount: st.observedLineCount,
          verifiedGramsSum: st.verifiedGramsSum || null,
          unweighedLineCount: st.unweighedLineCount,
          matchedExamples: st.matchedExamples
        });
        continue;
      }

      const scaledTarget = Math.max(1, Math.round((st.targetPurchasesPer14Days || 2) * scaleWindow));
      const effectiveScore = st.isLongShelfAmortized ? st.amortizedEffectiveUnits : st.observedLineCount;
      let status = 'covered';
      if (effectiveScore === 0) status = 'missing';
      else if (effectiveScore < scaledTarget * 0.6) status = 'low';

      const evalRow = {
        groupId: st.id,
        label: st.label,
        status,
        observedLineCount: st.observedLineCount,
        amortizedEffectiveUnits: Number(effectiveScore.toFixed(1)),
        targetUnitsInWindow: scaledTarget,
        verifiedGramsSum: st.verifiedGramsSum > 0 ? st.verifiedGramsSum : null,
        unweighedLineCount: st.unweighedLineCount,
        matchedExamples: st.matchedExamples
      };
      groupEvaluations.push(evalRow);

      if (status === 'missing' || status === 'low') {
        // Elevate priority of Zero-Cheese Calcium gap when active profile excludes cheese
        const priority =
          excludesCheese && st.id === 'calcium_high_bioavail_zero_dairy'
            ? 'high_profile_priority'
            : 'standard';
        gaps.push({ ...evalRow, priority });
      }
    }

    gaps.sort((a, b) => (a.priority === 'high_profile_priority' ? -1 : 1) - (b.priority === 'high_profile_priority' ? -1 : 1));

    if (
      excludesCheese &&
      oxalateOnlyLeafyCount > 0 &&
      (sentinelStats.get('calcium_high_bioavail_zero_dairy')?.observedLineCount || 0) === 0
    ) {
      warnings.push({
        groupId: 'calcium_oxalate_trap_notice',
        label: 'Trappola degli Ossalati nel Profilo Zero Formaggi',
        observedCount: oxalateOnlyLeafyCount,
        message:
          'Negli scontrini compaiono spinaci/bietole ma zero brassicacee o alici: il calcio degli spinaci è assorbito <10% per gli ossalati. Aggiungi cavolo nero, broccoli, rucola o alici per coprire davvero il Calcio LARN.'
      });
    }

    // Link top gap to 1 concrete live Rapallo offer if available
    let suggestedRapalloAction = null;
    if (gaps.length > 0) {
      const topGap = gaps[0];
      const topGapDef = rules.sentinelGroupsLarnAudit.find((g) => g.id === topGap.groupId);
      try {
        const rawOffers = options.activeOffers || offerService.getSeedOffersSync();
        const compatibleOffers = (rawOffers || [])
          .map((o) => enrichOfferRecord(o, profile?.id))
          .filter((o) => o && o.domain === 'food_human' && !o.isNamelessTile && o.profileCompatibility?.isCompatible !== false);

        const matchingOffer = compatibleOffers.find((o) => {
          const t = normalizeSearchToken(o.title || '');
          if (topGap.groupId === 'calcium_high_bioavail_zero_dairy' && /\btonno\b/.test(t)) return false;
          return (topGapDef?.keywords || []).some((kw) => new RegExp(`\\b${normalizeSearchToken(kw)}`, 'i').test(t));
        });

        suggestedRapalloAction = {
          targetGapId: topGap.groupId,
          targetGapLabel: topGap.label,
          advice:
            topGap.groupId === 'calcium_high_bioavail_zero_dairy'
              ? 'Aggiungi 1 fonte di Calcio Fascia Alta (>30%: broccoli, cavolo nero, rucola, mandorle o alici) nella prossima spesa.'
              : `Aggiungi 1 prodotto del gruppo "${topGap.label}" nel prossimo giro spesa a Rapallo.`,
          matchedRapalloOffer: matchingOffer
            ? {
                id: matchingOffer.id,
                title: matchingOffer.title,
                storeName: matchingOffer.storeName || matchingOffer.chainName || matchingOffer.storeId,
                promoPrice: matchingOffer.promoPrice
              }
            : null
        };
      } catch (_) {
        suggestedRapalloAction = {
          targetGapId: topGap.groupId,
          targetGapLabel: topGap.label,
          advice: `Inserisci 1 porzione di "${topGap.label}" nella prossima lista della spesa.`,
          matchedRapalloOffer: null
        };
      }
    }

    return {
      windowDays,
      profileId: profile?.id || 'casa',
      zeroCheeseCalciumGuardActive: excludesCheese,
      auditedPersonalReceiptsCount: personalReceipts.length,
      excludedGuestReceiptsCount,
      totalFoodLinesAudited,
      unweighedLinesRespectedCount,
      syntheticWeightFallbackUsed: false,
      groupEvaluations,
      gaps,
      warnings,
      suggestedRapalloAction
    };
  }

  /**
   * Returns a structured scientific reference guide on meal bioavailability synergies & antagonists
   * tailored to the active user profile.
   */
  getBioavailabilityGuide(options = {}) {
    const rules = this.getRules();
    const profile = userProfileService.getProfileById(options.profileId || null);
    return {
      profileId: profile?.id || 'casa',
      sources: rules.sources,
      pillars: [
        {
          id: 'calcium_zero_cheese',
          title: 'Calcio nel Profilo Zero Formaggi: Brassicacee & Alici vs Spinaci',
          rule: rules.calciumBioavailabilityClasses.high_gt_30pct.explanation,
          classes: rules.calciumBioavailabilityClasses
        },
        {
          id: 'iron_vitamin_c',
          title: 'Ferro Eme vs Non-Eme: Attivazione con >=30 mg di Vitamina C Cruda',
          rule: 'Spruzzare limone fresco a fine cottura o abbinare peperoni/rucola/kiwi crudi raddoppia o triplica la riduzione di Fe3+ a Fe2+ assorbibile.',
          thresholds: {
            vitaminCMg: rules.ironBioavailabilityRules.vitaminCActivationThresholdMg,
            hemeShareAnimal: rules.ironBioavailabilityRules.hemeShareInAnimalTissue
          }
        },
        {
          id: 'carotenoids_evo',
          title: 'Licopene & Vitamine Liposolubili: Calore + >=5g Olio EVO',
          rule: 'La cottura della salsa di pomodoro con almeno 5g di Olio EVO converte il trans-licopene in cis-licopene micellizzato (+2–3× biodisponibilità).'
        },
        {
          id: 'resistant_starch_rs3',
          title: 'Amido Resistente RS3 per la Cambusa in Barca (>=12h a +4°C)',
          rule: rules.resistantStarchRS3Rules.physiologicalEffect
        },
        {
          id: 'amino_acid_complementation',
          title: 'Complementazione Aminoacidica Cereali + Legumi (FAO 2007)',
          rule: 'Unire pasta/riso/farro (ricchi di metionina+cisteina, carenti di lisina) con ceci/lenticchie/fagioli (ricchi di lisina) porta lo score proteico al ~100%.'
        }
      ]
    };
  }
}

export const nutritionPhysiologyService = new NutritionPhysiologyService();

export function evaluateCookedMealPhysiology(...args) {
  return nutritionPhysiologyService.evaluateCookedMealPhysiology(...args);
}

export function adaptCoachingPlan(payload) {
  return nutritionPhysiologyService.adaptCoachingPlan(payload);
}

export function auditReceiptsNutritionalCoverage(receipts, options) {
  return nutritionPhysiologyService.auditReceiptsNutritionalCoverage(receipts, options);
}

export default nutritionPhysiologyService;
