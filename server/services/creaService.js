/**
 * Basilico — Official CREA Nutritional Database Service (ADR-0008 / TASK-M2-01)
 * Location: server/services/creaService.js
 *
 * Exposes 100% of the official CREA food composition dataset:
 *  - 832 official foods across 17 categories
 *  - 26,622 nutrient rows across all 7 sections (zero .slice truncation)
 *  - Instant recalculation for:
 *      * 100g edible (standard CREA)
 *      * 100g gross purchased weight (ediblePartPct / 100)
 *      * 1 standard LARN portion (defaultPortionG)
 *      * custom free grams
 *  - Physical Raw <-> Cooked conversion via crea_yield_factors (Y)
 *  - Relative fraction invariance (% of proteins / % of fatty acids are never multiplied by weight)
 *  - Daily VNR / LARN reference percentage calculation
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSearchToken } from './offerService.js';
import { userProfileService } from './userProfileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CREA_FOODS_PATH = path.resolve(__dirname, '../../data/seed/crea_foods.json');
const CREA_YIELDS_PATH = path.resolve(__dirname, '../../data/seed/crea_yields.json');

export const CREA_SECTION_ORDER = [
  'MACRO NUTRIENTI',
  'MINERALI',
  'VITAMINE',
  'ACIDI GRASSI',
  'AMINOACIDI (% DI PROTEINE)',
  'SINGOLI ZUCCHERI',
  'ALTRI COMPOSTI'
];

// Reference LARN / EU 1169/2011 daily values for % VNR calculation
export const DAILY_VNR_REFERENCE = {
  'Energia (kcal)': 2000,
  'Proteine (g)': 50,
  'Proteine totali (g)': 50,
  'Lipidi (g)': 70,
  'Lipidi totali (g)': 70,
  'Carboidrati disponibili (g)': 260,
  'Fibra totale (g)': 25,
  'Fibra alimentare totale (g)': 25,
  'Ferro (mg)': 14,
  'Calcio (mg)': 800,
  'Magnesio (mg)': 375,
  'Potassio (mg)': 2000,
  'Fosforo (mg)': 700,
  'Zinco (mg)': 10,
  'Rame (mg)': 1,
  'Selenio (μg)': 55,
  'Iodio (μg)': 150,
  'Manganese (mg)': 2,
  'Vitamina C (mg)': 80,
  'Vitamina E (mg)': 12,
  'Vitamina D (μg)': 5,
  'Vitamina B12 (μg)': 2.5,
  'Vitamina B6 (mg)': 1.4,
  'Tiamina (mg)': 1.1,
  'Riboflavina (mg)': 1.4,
  'Niacina (mg)': 16,
  'Folati totali (μg)': 200,
  'Folati (μg)': 200,
  'Vitamina A retinolo equivalente (μg)': 800
};

// USDA / CREA thermal retention factors (Rf) applied when cooking raw foods (state === 'cooked_from_raw')
export const THERMAL_VITAMIN_RETENTION = {
  'Vitamina C (mg)': 0.60,
  'Folati totali (μg)': 0.65,
  'Folati (μg)': 0.65,
  'Tiamina (mg)': 0.75,
  'Riboflavina (mg)': 0.85,
  'Vitamina B6 (mg)': 0.80,
  'Niacina (mg)': 0.85,
  'Vitamina B12 (μg)': 0.85
};

/**
 * FAO / INFOODS (Greenfield & Southgate) lipid-to-total-fatty-acids conversion factor (F_lipid).
 * Converts total lipids (g/100g) into total fatty acids (g/100g) before multiplying by % fatty acid composition.
 */
export function resolveLipidConversionFactor(food = {}, fatG = 0) {
  const catNorm = normalizeSearchToken(food.category || '');
  const nameNorm = normalizeSearchToken(food.name || '');
  if (catNorm.includes('oli e grassi') || /\b(olio|strutto|sego)\b/.test(nameNorm)) {
    return 0.956;
  }
  if (/\b(burro)\b/.test(nameNorm)) {
    return 0.945;
  }
  if (catNorm.includes('prodotti della pesca')) {
    return (fatG || 0) >= 2.0 ? 0.90 : 0.80;
  }
  if (
    catNorm.includes('carni') ||
    catNorm.includes('latte') ||
    catNorm.includes('formaggi') ||
    catNorm.includes('uova') ||
    /\b(noci|mandorl\w*|nocciol\w*|pistacch\w*|pinol\w*|arachid\w*|anacard\w*|semi)\b/.test(nameNorm)
  ) {
    return 0.90;
  }
  return 0.80;
}

// Canonical key nutrients extracted on every food summary for fast sorting & Nutrients/€
export const KEY_NUTRIENT_MAP = {
  kcal: ['Energia (kcal)'],
  kj: ['Energia (kJ)'],
  waterG: ['Acqua (g)'],
  proteinG: ['Proteine (g)', 'Proteine totali (g)'],
  fatG: ['Lipidi (g)', 'Lipidi totali (g)'],
  carbsG: ['Carboidrati disponibili (g)'],
  sugarsG: ['Zuccheri solubili (g)'],
  fiberG: ['Fibra totale (g)', 'Fibra alimentare totale (g)'],
  saturatedFatG: ['Acidi grassi saturi totali (g)'],
  monounsaturatedFatG: ['Acidi grassi monoinsaturi totali (g)'],
  polyunsaturatedFatG: ['Acidi grassi polinsaturi totali (g)'],
  omega3G: ['C18:3 acido linolenico (%)', 'C20:5 acido eicosapentenoico EPA (%)', 'C22:6 acido docosaesenoico DHA (%)'],
  epaDhaG: ['C20:5 acido eicosapentenoico EPA (%)', 'C22:6 acido docosaesenoico DHA (%)'],
  sodiumMg: ['Sodio (mg)'],
  potassiumMg: ['Potassio (mg)'],
  ironMg: ['Ferro (mg)'],
  calciumMg: ['Calcio (mg)'],
  magnesiumMg: ['Magnesio (mg)'],
  zincMg: ['Zinco (mg)'],
  phosphorusMg: ['Fosforo (mg)'],
  vitaminCMg: ['Vitamina C (mg)'],
  vitaminB12Ug: ['Vitamina B12 (μg)'],
  vitaminDUg: ['Vitamina D (μg)'],
  folateUg: ['Folati totali (μg)', 'Folati (μg)'],
  cholesterolMg: ['Colesterolo (mg)']
};

/**
 * Parses a CREA value string into { numeric, isTrace, isNull, raw }.
 * Preserves the exact scientific distinction between 0.0, "tr" (trace), and null.
 */
export function parseCreaValue(rawVal) {
  if (rawVal === null || rawVal === undefined || rawVal === '') {
    return { numeric: null, isTrace: false, isNull: true, raw: null };
  }
  const str = String(rawVal).trim();
  if (!str || str === '-' || str.toLowerCase() === 'n.d.') {
    return { numeric: null, isTrace: false, isNull: true, raw: str };
  }
  if (str.toLowerCase() === 'tr' || str.toLowerCase() === 'tr.' || str.toLowerCase() === 'tracce') {
    return { numeric: 0, isTrace: true, isNull: false, raw: 'tr' };
  }
  const num = parseFloat(str.replace(',', '.'));
  if (Number.isNaN(num)) {
    return { numeric: null, isTrace: false, isNull: true, raw: str };
  }
  return { numeric: num, isTrace: false, isNull: false, raw: str };
}

/**
 * Checks if a nutrient component is a relative percentage (% di proteine / % AG)
 * which must remain invariant when scaling weight.
 */
export function isRelativeFractionComponent(sectionName = '', componentName = '') {
  if (sectionName.includes('%')) return true;
  if (componentName.includes('(%') || componentName.includes('% di ') || componentName.includes('% AG')) {
    return true;
  }
  return false;
}

export class CreaService {
  constructor() {
    this._foods = null;
    this._foodsById = null;
    this._yields = null;
    this._categories = null;
  }

  _init() {
    if (this._foods) return;
    const rawFoods = JSON.parse(fs.readFileSync(CREA_FOODS_PATH, 'utf8'));
    const rawYields = fs.existsSync(CREA_YIELDS_PATH)
      ? JSON.parse(fs.readFileSync(CREA_YIELDS_PATH, 'utf8'))
      : [];

    this._yields = rawYields;
    this._foodsById = new Map();
    const catSet = new Set();

    this._foods = rawFoods.map((f) => {
      if (f.category) catSet.add(f.category);
      const keyMetrics = this._extractKeyMetrics(f);
      const defaultYield = this._resolveYieldFactor(f);
      const enriched = {
        ...f,
        normName: normalizeSearchToken(f.name),
        keyMetrics,
        yieldFactor: defaultYield
      };
      this._foodsById.set(String(f.id), enriched);
      return enriched;
    });

    this._categories = Array.from(catSet).sort((a, b) => a.localeCompare(b, 'it'));
  }

  _extractKeyMetrics(food) {
    const flatMap = {};
    for (const sec of Object.keys(food.sections || {})) {
      for (const row of food.sections[sec] || []) {
        const parsed = parseCreaValue(row.v100);
        if (parsed.numeric !== null) {
          flatMap[row.c] = parsed.numeric;
        }
      }
    }

    const metrics = {};
    for (const [key, labels] of Object.entries(KEY_NUTRIENT_MAP)) {
      if (['saturatedFatG', 'monounsaturatedFatG', 'polyunsaturatedFatG', 'omega3G', 'epaDhaG'].includes(key)) {
        continue;
      }
      let val = null;
      for (const lbl of labels) {
        if (flatMap[lbl] !== undefined) {
          val = flatMap[lbl];
          break;
        }
      }
      metrics[key] = val;
    }

    // Rigorous FAO fatty-acid conversion from % of total fatty acids -> g per 100g edible food
    const fatG = metrics.fatG;
    const fLipid = resolveLipidConversionFactor(food, fatG || 0);
    const totalFaG = fatG !== null ? fatG * fLipid : null;

    const toGramsFromPct = (pctVal) => {
      if (fatG === 0) return 0;
      if (totalFaG === null || pctVal === undefined || pctVal === null) return null;
      return Number((totalFaG * (pctVal / 100)).toFixed(3));
    };

    metrics.saturatedFatG =
      flatMap['Acidi grassi saturi totali (g)'] !== undefined
        ? flatMap['Acidi grassi saturi totali (g)']
        : toGramsFromPct(flatMap['Acidi grassi Saturi (%)']);
    metrics.monounsaturatedFatG = toGramsFromPct(flatMap['Acidi grassi Monoinsaturi (%)']);
    metrics.polyunsaturatedFatG = toGramsFromPct(flatMap['Acidi grassi Polinsaturi (%)']);

    const alaPct = flatMap['C18:3 acido linolenico (%)'];
    const epaPct = flatMap['C20:5 acido eicosapentenoico EPA (%)'];
    const dhaPct = flatMap['C22:6 acido docosaesenoico DHA (%)'];

    if (fatG === 0) {
      metrics.omega3G = 0;
      metrics.epaDhaG = 0;
    } else if (totalFaG !== null && (alaPct !== undefined || epaPct !== undefined || dhaPct !== undefined)) {
      const sumOmega3Pct = (alaPct || 0) + (epaPct || 0) + (dhaPct || 0);
      metrics.omega3G = Number((totalFaG * (sumOmega3Pct / 100)).toFixed(3));
      metrics.epaDhaG =
        epaPct !== undefined || dhaPct !== undefined
          ? Number((totalFaG * (((epaPct || 0) + (dhaPct || 0)) / 100)).toFixed(3))
          : 0;
    } else {
      metrics.omega3G = null;
      metrics.epaDhaG = null;
    }

    metrics.lipidConversionFactor = fLipid;
    return metrics;
  }

  _resolveYieldFactor(food) {
    const catNorm = normalizeSearchToken(food.category || '');
    const nameNorm = normalizeSearchToken(food.name || '');

    // If already cooked in CREA title, yield factor is 1.0
    if (/\b(cott[oaie]|bollit[oaie]|lessat[oaie]|arrostit[oaie]|fritt[oaie])\b/.test(nameNorm)) {
      return { multiplier: 1.0, method: 'già cotto in tabella CREA', isRaw: false };
    }

    if (catNorm.includes('cereali') && /\b(pasta|spaghetti|maccheroni|penne|fusilli|farro|orzo|avena)\b/.test(nameNorm)) {
      return { multiplier: 2.4, method: 'bollitura (idratazione amido ~240%)', isRaw: true };
    }
    if (catNorm.includes('cereali') && /\b(riso)\b/.test(nameNorm)) {
      return { multiplier: 2.5, method: 'bollitura (idratazione riso ~250%)', isRaw: true };
    }
    if (catNorm.includes('legumi') && /\b(secc\w*|crudi|crudo)\b/.test(nameNorm)) {
      return { multiplier: 2.2, method: 'ammollo + bollitura (~220%)', isRaw: true };
    }
    if (catNorm.includes('prodotti della pesca')) {
      return { multiplier: 0.85, method: 'cottura termica (resa ~85%)', isRaw: true };
    }
    if (catNorm.includes('carni fresche') && /\b(pollo|tacchino|faraona|gallina)\b/.test(nameNorm)) {
      return { multiplier: 0.78, method: 'cottura termica avicoli (resa ~78%)', isRaw: true };
    }
    if (catNorm.includes('carni fresche')) {
      return { multiplier: 0.75, method: 'cottura termica carni (resa ~75%)', isRaw: true };
    }
    if (catNorm.includes('verdure') && /\b(spinaci|bietol\w*|cicoria|lattuga|erbette|catalogna)\b/.test(nameNorm)) {
      return { multiplier: 0.70, method: 'lessatura/vapore verdure a foglia (resa ~70%)', isRaw: true };
    }
    if (catNorm.includes('verdure') && /\b(patat\w*|carot\w*)\b/.test(nameNorm)) {
      return { multiplier: 0.95, method: 'bollitura/forno tuberi (resa ~95%)', isRaw: true };
    }
    return { multiplier: 1.0, method: 'consumo diretto / resa neutra (100%)', isRaw: true };
  }

  getAllFoods() {
    this._init();
    return this._foods;
  }

  getCategories() {
    this._init();
    return this._categories;
  }

  getYieldFactors() {
    this._init();
    return this._yields;
  }

  getFoodById(id) {
    this._init();
    return this._foodsById.get(String(id)) || null;
  }

  /**
   * Computes a full academic nutritional sheet for a food item with dynamic scaling:
   *  - mode: '100g_edible' (default) | '100g_gross' | 'portion_larn' | 'custom_grams'
   *  - grams: custom weight in grams (default 100)
   *  - state: 'as_is' (default) | 'cooked_from_raw' (applies yieldFactor)
   */
  computeNutritionalSheet(foodId, options = {}) {
    this._init();
    const food = this.getFoodById(foodId);
    if (!food) return null;

    const mode = options.mode || '100g_edible';
    const customGrams = Number(options.grams) > 0 ? Number(options.grams) : 100;
    const state = options.state || 'as_is'; // 'as_is' or 'cooked_from_raw'

    const edibleRatio = (Number(food.ediblePartPct) || 100) / 100;
    const yieldMult = state === 'cooked_from_raw' && food.yieldFactor?.multiplier
      ? Number(food.yieldFactor.multiplier)
      : 1.0;

    let effectiveEdibleGramsRaw = 100;
    if (mode === '100g_gross') {
      effectiveEdibleGramsRaw = 100 * edibleRatio;
    } else if (mode === 'portion_larn') {
      effectiveEdibleGramsRaw = Number(food.defaultPortionG) || 100;
    } else if (mode === 'custom_grams') {
      effectiveEdibleGramsRaw = customGrams;
    }

    // If user asks for 100g of COOKED product (or cooked portion from raw weight):
    // When state === 'cooked_from_raw', we report both resulting cooked weight and nutrient density per 100g cooked
    const scaleFactor = (effectiveEdibleGramsRaw / 100) / (options.per100gCooked ? yieldMult : 1.0);
    const resultingCookedWeightGrams = Number((effectiveEdibleGramsRaw * yieldMult).toFixed(1));
    const applyThermalRetention = state === 'cooked_from_raw' && Boolean(food.yieldFactor?.isRaw);
    const baseFatG = food.keyMetrics?.fatG || 0;
    const fLipid = food.keyMetrics?.lipidConversionFactor || resolveLipidConversionFactor(food, baseFatG);

    const computedSections = {};
    let totalValuesCount = 0;

    for (const secName of CREA_SECTION_ORDER) {
      const rows = food.sections[secName] || [];
      if (rows.length === 0) continue;

      computedSections[secName] = rows.map((row) => {
        totalValuesCount++;
        const parsed = parseCreaValue(row.v100);
        const isRelative = isRelativeFractionComponent(secName, row.c);
        const retentionFactor = applyThermalRetention && !isRelative
          ? (THERMAL_VITAMIN_RETENTION[row.c] ?? 1.0)
          : 1.0;

        let computedValue = null;
        let displayValue = 'n.d.';
        let gramsEquivalent = null;

        if (parsed.isTrace) {
          computedValue = 0;
          displayValue = 'tr';
        } else if (parsed.numeric !== null) {
          // Relative percentages (% of proteins / % AG) are NOT multiplied by weight
          const val = isRelative ? parsed.numeric : parsed.numeric * scaleFactor * retentionFactor;
          computedValue = Number(val.toFixed(val < 1 && val > 0 ? 3 : 2));
          displayValue = String(computedValue);
          if (secName === 'ACIDI GRASSI' && row.c.includes('(%)') && baseFatG > 0) {
            gramsEquivalent = Number((baseFatG * scaleFactor * fLipid * (parsed.numeric / 100)).toFixed(3));
          }
        }

        const vnrRef = DAILY_VNR_REFERENCE[row.c];
        const vnrPct = !isRelative && vnrRef && computedValue !== null && computedValue > 0
          ? Math.round((computedValue / vnrRef) * 100)
          : null;

        return {
          component: row.c,
          value100gRaw: row.v100,
          portionRaw: row.vp,
          computedValue,
          displayValue,
          gramsEquivalent,
          thermalRetentionFactor: retentionFactor < 1.0 ? retentionFactor : null,
          isTrace: parsed.isTrace,
          isNull: parsed.isNull,
          isRelativeFraction: isRelative,
          vnrPct,
          sourceCode: row.src,
          bibliographicRef: row.ref
        };
      });
    }

    // Include any section not in CREA_SECTION_ORDER (defensive completeness)
    for (const [secName, rows] of Object.entries(food.sections || {})) {
      if (!computedSections[secName] && rows.length > 0) {
        computedSections[secName] = rows.map((row) => {
          totalValuesCount++;
          const parsed = parseCreaValue(row.v100);
          return {
            component: row.c,
            value100gRaw: row.v100,
            portionRaw: row.vp,
            computedValue: parsed.numeric,
            displayValue: parsed.isTrace ? 'tr' : (parsed.numeric !== null ? String(parsed.numeric) : 'n.d.'),
            isTrace: parsed.isTrace,
            isNull: parsed.isNull,
            isRelativeFraction: false,
            vnrPct: null,
            sourceCode: row.src,
            bibliographicRef: row.ref
          };
        });
      }
    }

    return {
      id: food.id,
      name: food.name,
      nameEn: food.nameEn,
      scientificName: food.scientificName,
      category: food.category,
      ediblePartPct: food.ediblePartPct,
      defaultPortionG: food.defaultPortionG,
      officialUrl: food.officialUrl,
      langualCodes: food.langualCodes,
      yieldFactor: food.yieldFactor,
      calculationContext: {
        mode,
        effectiveEdibleGramsRaw: Number(effectiveEdibleGramsRaw.toFixed(1)),
        resultingCookedWeightGrams,
        scaleFactor: Number(scaleFactor.toFixed(4)),
        state,
        thermalRetentionApplied: applyThermalRetention
      },
      keyMetrics: food.keyMetrics,
      totalValuesCount,
      sections: computedSections
    };
  }

  /**
   * Searches and ranks the 832 CREA foods by query, category, physiological preset,
   * any nutrient sort key, and active user profile exclusions.
   */
  searchAndRankFoods(query = {}) {
    this._init();
    const qNorm = normalizeSearchToken(query.q || '');
    const category = query.category ? String(query.category).trim() : null;
    const sortBy = query.sortBy || 'nameAsc'; // e.g., 'proteinG', 'ironMg', 'kcalAsc', 'fiberG', etc.
    const profileId = query.profileId || null;
    const includeExcluded = query.includeExcluded === 'true' || query.includeExcluded === true;
    const preset = query.preset || null; // 'boat_hydration', 'evening_light', 'high_protein', 'micronutrient_dense'

    let results = this._foods.map((f) => {
      const compatibility = userProfileService.checkItemCompatibility(
        { title: f.name, category: f.category, domain: 'food_human' },
        profileId
      );
      return {
        id: f.id,
        name: f.name,
        nameEn: f.nameEn,
        scientificName: f.scientificName,
        category: f.category,
        ediblePartPct: f.ediblePartPct,
        defaultPortionG: f.defaultPortionG,
        officialUrl: f.officialUrl,
        yieldFactor: f.yieldFactor,
        keyMetrics: f.keyMetrics,
        sectionCount: Object.keys(f.sections || {}).length,
        profileCompatibility: compatibility
      };
    });

    if (!includeExcluded && profileId) {
      results = results.filter((f) => f.profileCompatibility.isCompatible);
    }

    if (category) {
      results = results.filter((f) => f.category === category);
    }

    if (qNorm) {
      results = results.filter((f) => {
        const hay = normalizeSearchToken(`${f.name} ${f.nameEn || ''} ${f.scientificName || ''} ${f.category || ''}`);
        return hay.includes(qNorm);
      });
    }

    // Physiological presets (Stanza 2)
    if (preset === 'boat_hydration') {
      results = results.filter((f) => (f.keyMetrics.waterG || 0) >= 75 && (f.keyMetrics.potassiumMg || 0) >= 180);
    } else if (preset === 'evening_light') {
      results = results.filter((f) => (f.keyMetrics.kcal || 999) <= 150 && (f.keyMetrics.proteinG || 0) >= 12 && (f.keyMetrics.fatG || 99) <= 8);
    } else if (preset === 'high_protein') {
      results = results.filter((f) => (f.keyMetrics.proteinG || 0) >= 18);
    } else if (preset === 'iron_vitamin_c') {
      results = results.filter((f) => (f.keyMetrics.ironMg || 0) >= 2.0 || (f.keyMetrics.vitaminCMg || 0) >= 30);
    }

    // Sorting
    if (sortBy === 'nameAsc') {
      results.sort((a, b) => a.name.localeCompare(b.name, 'it'));
    } else if (sortBy === 'kcalAsc') {
      results.sort((a, b) => (a.keyMetrics.kcal ?? 9999) - (b.keyMetrics.kcal ?? 9999));
    } else if (KEY_NUTRIENT_MAP[sortBy]) {
      results.sort((a, b) => (b.keyMetrics[sortBy] ?? -1) - (a.keyMetrics[sortBy] ?? -1));
    }

    const limit = Math.min(832, Math.max(1, parseInt(query.limit || '100', 10) || 100));
    const page = Math.max(1, parseInt(query.page || '1', 10) || 1);
    const totalFoods = results.length;

    return {
      foods: results.slice((page - 1) * limit, page * limit),
      totalFoods,
      totalCatalogSize: this._foods.length,
      categories: this._categories,
      page,
      limit
    };
  }
}

export const creaService = new CreaService();
export default creaService;
