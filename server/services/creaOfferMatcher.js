/**
 * Basilico — Conservative Head-Noun Offer <-> CREA Matcher & Nutrients per Euro Engine (ADR-0008 / TASK-M2-01)
 * Location: server/services/creaOfferMatcher.js
 *
 * Rules enforced:
 * 1. Only matches offers with `domain === 'food_human'`.
 * 2. Head-noun semantic verification: the CREA food's core noun must match the commercial product's head noun
 *    (after stripping brand and safe cut wrappers like "filetti di", "tranci di", "fette di").
 *    Prevents false positives like "Salsa di noci" -> "Noci" or "Biscotti al miele" -> "Miele".
 * 3. Physical state alignment (canned/drained vs dry vs fresh).
 * 4. Computes "Nutrients per Edible Euro" (g protein/€, kcal/€, mg iron/€, mg calcium/€, mg potassium/€, g fiber/€)
 *    using the offer's drained/edible €/kg price and the CREA food's `ediblePartPct`.
 * 5. Supports manual 1-click user override persisted in isolated storage.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { creaService } from './creaService.js';
import { normalizeSearchToken } from './offerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_OVERRIDES_PATH = path.resolve(__dirname, '../../data/cache/crea_manual_overrides.json');

const SAFE_WRAPPERS = new Set([
  'filetti', 'filetto', 'tranci', 'trancio', 'fette', 'fetta', 'bocconcini', 'bocconcino',
  'cuori', 'cuore', 'spicchi', 'cubetti', 'polpa', 'passata', 'farina', 'olio'
]);

const CONNECTORS = new Set([
  'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'all', 'in', 'con', 'da', 'per', 'tipo', 'extra', 'vergine', 'classico', 'classica'
]);

const FORBIDDEN_COMPOSITE_HEADS = new Set([
  'salsa', 'sugo', 'pesto', 'biscotti', 'biscotto', 'torta', 'crostata', 'gelato',
  'patatine', 'chips', 'cracker', 'crackers', 'bevanda', 'succo', 'nettare',
  'preparato', 'insaporitore', 'dado', 'brodo', 'snack', 'merendina', 'merendine',
  'ravioli', 'tortellini', 'pansotti', 'gnocchi', 'lasagne', 'pizza', 'focaccia'
]);

// High-precision canonical dictionary mapping common Italian commercial grocery head patterns to official CREA IDs
const CANONICAL_HEAD_PATTERNS = [
  { regex: /^(?:pasta\s+(?:di\s+semola|integrale)?|spaghetti|penne|fusilli|rigatoni|mezze\s+maniche|farfalle|linguine|bucatini|maccheroni|trofie|orecchiette)\b/, creaQuery: 'Pasta di semola' },
  { regex: /^(?:riso\s+(?:carnaroli|arborio|roma|vialone|basmati|parboiled|originario)|riso)\b/, creaQuery: 'Riso, brillato' },
  { regex: /^(?:passata\s+di\s+pomodoro|polpa\s+di\s+pomodoro|pomodori\s+pelati|pelati)\b/, creaQuery: 'Pomodori, pelati' },
  { regex: /^(?:olio\s+extra\s*vergine\s+(?:di\s+oliva|d\s*oliva)|olio\s+evo)\b/, creaQuery: 'Olio di oliva, extra vergine' },
  { regex: /^(?:tonno\s+(?:all\s*olio|in\s+olio)|tranci\s+di\s+tonno|filetti\s+di\s+tonno)\b/, creaQuery: 'Tonno, sott\'olio, sgocciolato' },
  { regex: /^(?:tonno\s+al\s+naturale)\b/, creaQuery: 'Tonno, in salamoia, sgocciolato' },
  { regex: /^(?:salmone\s+affumicato|salmone\s+norvegese)\b/, creaQuery: 'Salmone, affumicato' },
  { regex: /^(?:salmone\s+fresco|trancio\s+di\s+salmone|filetto\s+di\s+salmone)\b/, creaQuery: 'Salmone, fresco' },
  { regex: /^(?:filetti\s+di\s+merluzzo|cuori\s+di\s+merluzzo|merluzzo|nasello)\b/, creaQuery: 'Merluzzo o nasello, fresco' },
  { regex: /^(?:orata|orate)\b/, creaQuery: 'Orata, fresca' },
  { regex: /^(?:branzino|spigola)\b/, creaQuery: 'Spigola, fresca' },
  { regex: /^(?:acciughe|alici)\b/, creaQuery: 'Acciuga o alice, fresca' },
  { regex: /^(?:sgombro|filetti\s+di\s+sgombro)\b/, creaQuery: 'Sgombro o maccarello, fresco' },
  { regex: /^(?:gamberi|code\s+di\s+gambero|mazzancolle)\b/, creaQuery: 'Gamberi, freschi' },
  { regex: /^(?:petto\s+di\s+pollo|fette\s+di\s+pollo|filetti\s+di\s+pollo|pollo)\b/, creaQuery: 'Pollo, petto, crudo' },
  { regex: /^(?:fesa\s+di\s+tacchino|petto\s+di\s+tacchino|tacchino)\b/, creaQuery: 'Tacchino, fesa, crudo' },
  { regex: /^(?:bresaola)\b/, creaQuery: 'Bresaola della Valtellina' },
  { regex: /^(?:prosciutto\s+crudo)\b/, creaQuery: 'Prosciutto crudo' },
  { regex: /^(?:prosciutto\s+cotto)\b/, creaQuery: 'Prosciutto cotto' },
  { regex: /^(?:macinato\s+di\s+bovino|polpa\s+di\s+bovino|fettine\s+di\s+bovino|manzo|bovino|scottona)\b/, creaQuery: 'Bovino adulto, fesa, crudo' },
  { regex: /^(?:uova\s+fresche|uova)\b/, creaQuery: 'Uova di gallina, intero' },
  { regex: /^(?:latte\s+parzialmente\s+scremato|latte\s+uht)\b/, creaQuery: 'Latte di vacca, parzialmente scremato, UHT' },
  { regex: /^(?:latte\s+intero)\b/, creaQuery: 'Latte di vacca, intero, pastorizzato' },
  { regex: /^(?:yogurt\s+greco)\b/, creaQuery: 'Yogurt greco, 0% grassi' },
  { regex: /^(?:yogurt)\b/, creaQuery: 'Yogurt di latte intero, bianco' },
  { regex: /^(?:mozzarella|fior\s+di\s+latte|bocconcini\s+di\s+mozzarella)\b/, creaQuery: 'Mozzarella di vacca' },
  { regex: /^(?:parmigiano\s+reggiano)\b/, creaQuery: 'Parmigiano Reggiano DOP' },
  { regex: /^(?:grana\s+padano)\b/, creaQuery: 'Grana Padano DOP' },
  { regex: /^(?:pecorino)\b/, creaQuery: 'Pecorino' },
  { regex: /^(?:ricotta)\b/, creaQuery: 'Ricotta di vacca' },
  { regex: /^(?:stracchino|crescenza)\b/, creaQuery: 'Stracchino' },
  { regex: /^(?:gorgonzola)\b/, creaQuery: 'Gorgonzola' },
  { regex: /^(?:burro)\b/, creaQuery: 'Burro' },
  { regex: /^(?:ceci)\b/, creaQuery: 'Ceci, in scatola, scolati' },
  { regex: /^(?:lenticchie)\b/, creaQuery: 'Lenticchie, in scatola, scolate' },
  { regex: /^(?:fagioli\s+(?:borlotti|cannellini)|fagioli)\b/, creaQuery: 'Fagioli, in scatola, scolati' },
  { regex: /^(?:piselli\s+finissimi|piselli)\b/, creaQuery: 'Piselli, surgelati' },
  { regex: /^(?:spinaci)\b/, creaQuery: 'Spinaci, crudi' },
  { regex: /^(?:zucchine)\b/, creaQuery: 'Zucchine, crude' },
  { regex: /^(?:pomodori|pomodorini)\b/, creaQuery: 'Pomodori da insalata, maturi' },
  { regex: /^(?:patate)\b/, creaQuery: 'Patate, crude' },
  { regex: /^(?:carote)\b/, creaQuery: 'Carote, crude' },
  { regex: /^(?:mele|mela)\b/, creaQuery: 'Mele, con buccia' },
  { regex: /^(?:banane|banana)\b/, creaQuery: 'Banane' },
  { regex: /^(?:arance|arancia)\b/, creaQuery: 'Arance' },
  { regex: /^(?:mandorle)\b/, creaQuery: 'Mandorle, dolci, secche' },
  { regex: /^(?:noci)\b/, creaQuery: 'Noci, secche' },
  { regex: /^(?:caffe\s+macinato|caffe\s+in\s+grani|caffe)\b/, creaQuery: 'Caffè, tostato, in polvere' }
];

export class CreaOfferMatcher {
  constructor(options = {}) {
    this.overridesPath = options.overridesPath || process.env.BASILICO_CREA_OVERRIDES_PATH || DEFAULT_OVERRIDES_PATH;
    this._overrides = null;
  }

  _loadOverrides() {
    if (this._overrides) return this._overrides;
    try {
      if (fs.existsSync(this.overridesPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.overridesPath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this._overrides = parsed;
          return this._overrides;
        }
      }
    } catch (_) {}
    this._overrides = {};
    return this._overrides;
  }

  _saveOverrides() {
    try {
      const dir = path.dirname(this.overridesPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.overridesPath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._overrides, null, 2), 'utf8');
      fs.renameSync(tmp, this.overridesPath);
    } catch (_) {}
  }

  setManualOverride(offerIdOrTitle, creaFoodId) {
    const food = creaService.getFoodById(creaFoodId);
    if (!food) {
      const err = new Error(`Alimento CREA non trovato: ${creaFoodId}`);
      err.status = 404;
      throw err;
    }
    const key = normalizeSearchToken(String(offerIdOrTitle));
    const overrides = this._loadOverrides();
    overrides[key] = String(creaFoodId);
    this._saveOverrides();
    return { key, creaFoodId: food.id, creaFoodName: food.name };
  }

  /**
   * Strips leading brand name from normalized product title so the head noun is exposed.
   */
  _stripBrandFromTitle(title = '', brand = '') {
    let normTitle = normalizeSearchToken(title);
    const normBrand = normalizeSearchToken(brand);
    if (normBrand && normTitle.startsWith(`${normBrand} `)) {
      normTitle = normTitle.slice(normBrand.length).trim();
    }
    return normTitle;
  }

  /**
   * Conservatively matches an offer to an official CREA food.
   * Returns null if domain !== 'food_human' or if no safe head-noun match exists.
   */
  matchOfferToCrea(offer = {}) {
    if (!offer || (offer.domain && offer.domain !== 'food_human')) {
      return null;
    }

    const overrides = this._loadOverrides();
    const idKey = offer.id ? normalizeSearchToken(offer.id) : null;
    const titleKey = normalizeSearchToken(offer.title || '');

    // 1. Check explicit user manual override
    const overrideId = (idKey && overrides[idKey]) || overrides[titleKey];
    if (overrideId) {
      const manualFood = creaService.getFoodById(overrideId);
      if (manualFood) {
        return {
          creaFoodId: manualFood.id,
          creaFoodName: manualFood.name,
          creaCategory: manualFood.category,
          ediblePartPct: manualFood.ediblePartPct,
          matchBasis: 'manual_override',
          confidence: 'verified_user',
          food: manualFood
        };
      }
    }

    const stripped = this._stripBrandFromTitle(offer.title || '', offer.brand || '');
    if (!stripped) return null;

    const tokens = stripped.split(' ');
    const headToken = tokens[0];

    // Guardrail: reject composite processed products when matching raw single ingredients
    // e.g. "Salsa di noci" must NOT match "Noci"
    if (FORBIDDEN_COMPOSITE_HEADS.has(headToken)) {
      return null;
    }

    const allFoods = creaService.getAllFoods();

    // 2. Check high-precision canonical head patterns
    for (const rule of CANONICAL_HEAD_PATTERNS) {
      if (rule.regex.test(stripped)) {
        const targetNorm = normalizeSearchToken(rule.creaQuery);
        const found =
          allFoods.find((f) => f.normName === targetNorm) ||
          allFoods.find((f) => f.normName.startsWith(targetNorm)) ||
          allFoods.find((f) => f.normName.includes(targetNorm));
        if (found) {
          return {
            creaFoodId: found.id,
            creaFoodName: found.name,
            creaCategory: found.category,
            ediblePartPct: found.ediblePartPct,
            matchBasis: 'canonical_head_pattern',
            confidence: 'high',
            food: found
          };
        }
      }
    }

    // 3. Unwrap safe cut wrappers (e.g. "filetti di orata" -> "orata")
    let effectiveTokens = [...tokens];
    if (SAFE_WRAPPERS.has(effectiveTokens[0]) && effectiveTokens.length >= 3 && CONNECTORS.has(effectiveTokens[1])) {
      effectiveTokens = effectiveTokens.slice(2);
    }
    const candidateHead = effectiveTokens[0];
    if (!candidateHead || candidateHead.length < 4 || FORBIDDEN_COMPOSITE_HEADS.has(candidateHead)) {
      return null;
    }

    // 4. Match against CREA food core head (first word before comma)
    const candidates = allFoods.filter((f) => {
      const coreHead = normalizeSearchToken(f.name.split(',')[0]).split(' ')[0];
      return coreHead === candidateHead;
    });

    if (candidates.length > 0) {
      // Prefer raw/fresh or drained according to offer text
      const isCanned = /\b(scatola|olio|salamoia|sgocciolat\w*|vasetto)\b/.test(stripped);
      const best =
        candidates.find((c) => isCanned && /\b(scolat\w*|sgocciolat\w*|scatola)\b/.test(c.normName)) ||
        candidates.find((c) => !isCanned && /\b(crud\w*|fresc\w*)\b/.test(c.normName)) ||
        candidates[0];

      return {
        creaFoodId: best.id,
        creaFoodName: best.name,
        creaCategory: best.category,
        ediblePartPct: best.ediblePartPct,
        matchBasis: 'head_noun_exact',
        confidence: 'medium_high',
        food: best
      };
    }

    return null;
  }

  /**
   * Computes "Nutrients per Edible Euro" for an offer matched to CREA.
   */
  computeOfferNutrientsPerEuro(offer = {}) {
    const match = this.matchOfferToCrea(offer);
    if (!match || !match.food) return null;

    const food = match.food;
    const rawKgPrice = offer.ediblePricePerKg ?? offer.pricePerKg ?? offer.pricePerLiter ?? null;
    if (!rawKgPrice || rawKgPrice <= 0) return null;

    // Account for CREA edible part % (e.g., whole fish with bones vs 100% edible fillet)
    const isAlreadyFilletOrPeeled = /\b(filett\w*|tranc\w*|sgusciat\w*|pelat\w*|polpa)\b/i.test(offer.title || '');
    const ediblePartRatio = isAlreadyFilletOrPeeled ? 1.0 : Math.max(0.2, (Number(food.ediblePartPct) || 100) / 100);
    const trueEdibleEuroPerKg = Number((rawKgPrice / ediblePartRatio).toFixed(2));

    // How many 100g edible units you buy with 1 €:
    // 1 kg edible = 10 × 100g units -> unitsPerEuro = 10 / trueEdibleEuroPerKg
    const units100gPerEuro = 10 / trueEdibleEuroPerKg;
    const km = food.keyMetrics || {};

    return {
      offerId: offer.id,
      offerTitle: offer.title,
      brand: offer.brand,
      storeId: offer.storeId,
      storeName: offer.storeName || offer.brand,
      promoPrice: offer.promoPrice,
      trueEdibleEuroPerKg,
      creaFoodId: food.id,
      creaFoodName: food.name,
      creaCategory: food.category,
      ediblePartPctUsed: Math.round(ediblePartRatio * 100),
      matchBasis: match.matchBasis,
      confidence: match.confidence,
      nutrientsPerEuro: {
        proteinGPerEuro: km.proteinG != null ? Number((km.proteinG * units100gPerEuro).toFixed(1)) : 0,
        kcalPerEuro: km.kcal != null ? Math.round(km.kcal * units100gPerEuro) : 0,
        fiberGPerEuro: km.fiberG != null ? Number((km.fiberG * units100gPerEuro).toFixed(1)) : 0,
        ironMgPerEuro: km.ironMg != null ? Number((km.ironMg * units100gPerEuro).toFixed(2)) : 0,
        calciumMgPerEuro: km.calciumMg != null ? Math.round(km.calciumMg * units100gPerEuro) : 0,
        potassiumMgPerEuro: km.potassiumMg != null ? Math.round(km.potassiumMg * units100gPerEuro) : 0,
        magnesiumMgPerEuro: km.magnesiumMg != null ? Math.round(km.magnesiumMg * units100gPerEuro) : 0,
        omega3GPerEuro: km.omega3G != null ? Number((km.omega3G * units100gPerEuro).toFixed(2)) : 0,
        vitaminCMgPerEuro: km.vitaminCMg != null ? Number((km.vitaminCMg * units100gPerEuro).toFixed(1)) : 0
      },
      keyMetrics100g: km
    };
  }

  /**
   * Ranks a list of Rapallo offers by a target nutrient per edible Euro.
   */
  rankOffersByNutrientPerEuro(offers = [], options = {}) {
    const metric = options.metric || 'proteinGPerEuro';
    const storeId = options.storeId || null;

    const evaluated = [];
    for (const offer of offers) {
      if (storeId && offer.storeId !== storeId) continue;
      if (offer.profileCompatibility && offer.profileCompatibility.isCompatible === false && options.hideIncompatible !== false) {
        continue;
      }
      const npe = this.computeOfferNutrientsPerEuro(offer);
      if (npe) {
        evaluated.push(npe);
      }
    }

    evaluated.sort((a, b) => (b.nutrientsPerEuro[metric] || 0) - (a.nutrientsPerEuro[metric] || 0));
    return evaluated;
  }
}

export const creaOfferMatcher = new CreaOfferMatcher();
export default creaOfferMatcher;
