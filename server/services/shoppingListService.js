/**
 * Basilico — Multi-Store Smart Shopping List & Empirical Rapallo 1/2/3 Store Simulator (ADR-0012 / ADR-0013 / TASK-REAL-05)
 * Location: server/services/shoppingListService.js
 *
 * Implements:
 *  1. 3 Synchronized Sources with Strict Domain Separation:
 *     - 'meal_planner' (`food_human` whole packages from weekly plan, including Breakfasts, Lunches & Dinners)
 *     - 'promo_flyer' (1-click offers from Stanza 1 / Stanza 2)
 *     - 'kitchen_care' (`home_cleaning` & `kitchen_cookware` from Stanza 4 / Tigotà / PiùMe / Unieuro)
 *  2. Separate Subtotals: `foodSubtotalEur` vs `homeAndKitchenSubtotalEur`
 *  3. Empirical Rapallo 1-Store vs 2-Store vs 3-Store Logistics Simulator:
 *     - Computed against real Rapallo stores (`rapallo_stores.json`), real active flyer promos, real loyalty cards,
 *       specialist stores (`Unieuro`, `Tigotà`, `PiùMe`, `Arcaplanet`) when covering 100% of cart, and zero ghost stops!
 *  4. "In Corsia" Aisle Ordering (`Ortofrutta -> Pesce/Carne -> Freschi -> Dispensa Secca -> Surgelati -> Cura Casa & Pentole`)
 *  5. Semantic "Prodotto Finito / Piano B sullo Scaffale" substitute finder (strict culinary/sub-family coherence, profile-safe)
 *  6. WhatsApp / Telegram / Markdown formatted export & idempotent 1-click individual-pack transfer to Pantry
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerService, enrichOfferRecord, normalizeSearchToken } from './offerService.js';
import { cacheManager } from './cacheManager.js';
import { pantryService } from './pantryService.js';
import { extractPackMetrics } from './unitPriceExtractor.js';
import { matchBomIngredientToOffer, resolveIngredientPackSpec } from './recipeAndArbitrageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORES_SEED_PATH = path.resolve(__dirname, '../../data/seed/rapallo_stores.json');
const OFFERS_SEED_PATH = path.resolve(__dirname, '../../data/seed/rapallo_offers.json');
const DEFAULT_SHOPPING_LIST_PATH = path.resolve(__dirname, '../../data/cache/shopping_list.json');

export const AISLE_ORDER = [
  { id: 'ortofrutta', label: '1. Ortofrutta & Erbe Fresche', icon: '🥬' },
  { id: 'pesce_carne', label: '2. Pescheria & Macelleria', icon: '🐟' },
  { id: 'freschi_gastronomia', label: '3. Banco Freschi, Salumi & Uova', icon: '🥚' },
  { id: 'dispensa_secca', label: '4. Corsia Secca (Pasta, Legumi, Olio EVO, Conserve)', icon: '🍝' },
  { id: 'surgelati', label: '5. Surgelati', icon: '❄️' },
  { id: 'cura_casa_pentole', label: '6. Chimica Casa, Sottolavello & Pentole (Tigotà/PiùMe/Unieuro)', icon: '🧼' }
];

function throwBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

export function classifyAisle(item = {}) {
  if (item.domain && item.domain !== 'food_human') {
    return 'cura_casa_pentole';
  }
  const norm = normalizeSearchToken(`${item.name || item.title || ''} ${item.category || ''}`);
  if (/\b(salsa|sugo|passata|polpa|pelat\w*|scatola|sott\s*olio|all\s*olio|in\s+olio|al\s+naturale|liquore|limoncetta)\b/.test(norm)) {
    return 'dispensa_secca';
  }
  if (
    /\b(pomodor\w*|insalata|spinac\w*|bietol\w*|borragine|zucchin\w*|sedano|cipoll\w*|scalogno|aglio|patat\w*|carciof\w*|limon\w*|basilico|prezzemolo|rosmarino|salvia|timo|maggiorana|mele|mela|banan\w*|aranc\w*|mirtill\w*|avocado|asparag\w*|melanzan\w*|peperon\w*|finocch\w*|carot\w*|frutta|verdura|ortagg\w*)\b/.test(
      norm
    )
  ) {
    return 'ortofrutta';
  }
  if (/\b(tonno\s+(?:sott|all\s*olio|al\s+naturale|in\s+olio|sgocciolat\w*)|sgombro\s+(?:al\s+naturale|all\s*olio|sott|sgocciolat\w*)|acciug\w*\s+sott\w*)\b/.test(norm)) {
    return 'dispensa_secca';
  }
  if (
    /\b(acciug\w*|alici|orata|branzino|spigola|salmone|sgombro|palamita|tonno|seppi\w*|gamber\w*|pesce|polpo|calamar\w*|cozz\w*|vongol\w*|merluzzo|baccala|pollo|tacchino|manzo|bovino|vitello|coniglio|maiale|carne)\b/.test(
      norm
    )
  ) {
    return 'pesce_carne';
  }
  if (/\b(surgelat\w*|gelat\w*)\b/.test(norm)) {
    return 'surgelati';
  }
  if (/\b(uov\w*|albume|latte|yogurt|kefir|skyr|prosciutto|bresaola|fresc\w*|trofie|pansot\w*|raviol\w*)\b/.test(norm)) {
    return 'freschi_gastronomia';
  }
  return 'dispensa_secca';
}

/**
 * Local culinary family resolver that hardens `resolveIngredientPackSpec` against
 * canned fish (`all'olio`/`vasetto`), fried crackers/snacks (`cialde gamberetti`),
 * and beverages/coffee/wine so Shelf Plan B never cross-substitutes incompatible foods!
 */
function resolveEffectiveFoodFamily(text = '') {
  const norm = normalizeSearchToken(text);
  if (
    /\b(ciald\w*|nuvol\w*\s+di\s+drago|cracker\w*|patatin\w*|chips|grissin\w*|tarall\w*|snack|pop\s*corn|biscott\w*|merendin\w*|cioccolat\w*|wafer|caramell\w*)\b/.test(
      norm
    )
  ) {
    return 'snack_sweet_composite';
  }
  if (
    /\b(vino|prosecco|spumante|champagne|birra|liquore|amaro|grappa|aperitivo|gin\b|vodka|rum\b|whisky|caffe|cappuccino|cialde\s+caffe|capsule\s+caffe|bevanda|succo|nettare|bibita|cola|aranciata|acqua)\b/.test(
      norm
    )
  ) {
    return 'beverage_coffee_alcohol';
  }
  if (
    /\b(tonno|sgombro|salmone|acciug\w*|alici|sardine)\b/.test(norm) &&
    /\b(all\s*olio|sott\s*olio|in\s+olio|al\s+naturale|sgocciolat\w*|in\s+scatola|scatola|lattina|vasetto|vetro|sott\s*sale|pasta\s+d\s*acciug\w*|3\s*x|4\s*x|2\s*x)\b/.test(
      norm
    )
  ) {
    return 'canned_fish';
  }
  return resolveIngredientPackSpec(text).family;
}

function classifyNonFoodSubFamily(domain = '', text = '') {
  const norm = normalizeSearchToken(text);

  if (domain === 'kitchen_cookware') {
    if (
      /\b(lavastovigli\w*|lavatric\w*|asciugatric\w*|frigorifer\w*|congelator\w*|forno\s+incasso|piano\s+cottura|cappa\s+aspirante|climatizzator\w*|condizionator\w*|scaldabagn\w*)\b/.test(
        norm
      )
    ) {
      return 'major_appliances';
    }
    if (
      /\b(bollitor\w*|tostapan\w*|frullator\w*|impastatric\w*|planetari\w*|friggitric\w*|microonde|macchina\s+(?:del\s+)?caffe|robot\s+cucina|tritatutto|sbattitor\w*|minipimer|estrattor\w*|spremiagrum\w*|griglia\s+elettrica|piastra)\b/.test(
        norm
      )
    ) {
      return 'small_kitchen_appliances';
    }
    if (
      /\b(telecamer\w*|videocamer\w*|fotocamer\w*|smart\s*tv|televisor\w*|tv\b|notebook|computer|pc\b|tablet|ipad|iphone|smartphone|cellular\w*|cuffi\w*|auricolar\w*|speaker|soundbar|console|playstation|xbox|nintendo|stampant\w*|monitor|router|wifi|wi\s*fi|full\s*hd)\b/.test(
        norm
      )
    ) {
      return 'consumer_electronics';
    }
    if (
      /\b(padell\w*|pentol\w*|casseruol\w*|tegam\w*|wok\b|bistecchier\w*|rostier\w*|tegli\w*|pirofil\w*|stampo|coperchi\w*|batteria\s+pentole|antiaderent\w*|coltell\w*|taglier\w*|mestol\w*|utensil\w*|scolapasta|pentolame)\b/.test(
        norm
      )
    ) {
      return 'cookware_pots_pans';
    }
    return 'kitchen_accessories_other';
  }

  if (domain === 'home_cleaning') {
    if (/\b(lavatric\w*|bucato|ammorbident\w*|capi\b|smacchiator\w*|lana\b)\b/.test(norm)) {
      return 'laundry_care';
    }
    if (/\b(piatti|lavastovigli\w*|brillantant\w*|cura\s+lavastoviglie|svelto|fairy|pril|finish)\b/.test(norm)) {
      return 'dishwashing';
    }
    if (/\b(citric\w*|anticalcare|viakal|disincrostant\w*|acido|wc\b|bagno)\b/.test(norm)) {
      return 'descaler_bathroom';
    }
    if (/\b(sgrassator\w*|forno|cappe|alcalin\w*|chanteclair|candeggina|ipoclorito|igienizzant\w*|disinfettant\w*)\b/.test(norm)) {
      return 'degreaser_sanitizer';
    }
    if (/\b(spugn\w*|pann\w*|microfibra|pagliett\w*|guant\w*|mocio|scopa|paviment\w*|carta\s+(?:forno|assorbente|igienica)|alluminio|pellicola|sacchett\w*)\b/.test(norm)) {
      return 'sponges_cloths_wraps';
    }
    return 'home_cleaning_general';
  }

  if (domain === 'personal_care') {
    if (/\b(dentifrici\w*|spazzolin\w*|collutori\w*)\b/.test(norm)) return 'oral_care';
    if (/\b(shampoo|balsamo|capelli|maschera\s+capelli)\b/.test(norm)) return 'hair_care';
    if (/\b(bagnodoccia|docciaschiuma|bagnoschiuma|sapone|detergente\s+intimo|deodorant\w*|crema\s+corpo|crema\s+viso)\b/.test(norm)) {
      return 'body_skin_care';
    }
    return 'personal_care_general';
  }

  if (domain === 'pet_care') {
    if (/\b(lettier\w*|sabbiett\w*|traversin\w*)\b/.test(norm)) return 'pet_litter_hygiene';
    if (/\b(gatt\w*|felin\w*|micio)\b/.test(norm)) return 'pet_cat_food';
    if (/\b(can[ei]|cucciol\w*|dog\b)\b/.test(norm)) return 'pet_dog_food';
    return 'pet_general';
  }

  return `${domain}_general`;
}

function stemItalianWord(word = '') {
  if (word.length <= 4) return word;
  return word.replace(/(?:he|hi|ie|ii|[aeiou])$/, '');
}

function haversineKm(lat1, lon1, lat2, lon2) {
  if (!Number.isFinite(lat1) || !Number.isFinite(lon1) || !Number.isFinite(lat2) || !Number.isFinite(lon2)) {
    return 0.8;
  }
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function canStoreSupplyDomain(store, domain = 'food_human') {
  if (!store) return false;
  if (store.storeCategory === 'gdo') {
    return true; // Full-line supermarkets carry food, home cleaning, personal care, basic cookware, pet & seasonal bazar
  }
  if (store.storeCategory === 'cura_casa_persona') {
    return domain === 'home_cleaning' || domain === 'personal_care';
  }
  if (store.storeCategory === 'elettronica_cucina') {
    return domain === 'kitchen_cookware' || domain === 'bazar_seasonal';
  }
  if (store.storeCategory === 'pet') {
    return domain === 'pet_care';
  }
  return domain === 'food_human';
}

function sanitizeLoadedShoppingItem(raw = {}) {
  const safePos = (v, fb) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : fb);
  const safeNonNeg = (v, fb = 0) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : fb);
  const name = String(raw.name || raw.title || 'Articolo Spesa').trim() || 'Articolo Spesa';
  const domain = raw.domain || 'food_human';
  const packsToBuy = Math.max(1, Math.round(safePos(raw.packsToBuy, 1)));
  const packSizeGrams = safePos(raw.packSizeGrams, 300);
  const unitPriceEur = Number(safePos(raw.unitPriceEur, 2.5).toFixed(2));
  const lineTotalEur = Number(
    safePos(raw.lineTotalEur, Number((packsToBuy * unitPriceEur).toFixed(2))).toFixed(2)
  );
  const totalPurchasedGrams = safePos(raw.totalPurchasedGrams, packsToBuy * packSizeGrams);
  const totalRequiredGrams = safePos(raw.totalRequiredGrams, totalPurchasedGrams);
  const residualReturnedToPantryGrams = safeNonNeg(raw.residualReturnedToPantryGrams, 0);

  return {
    ...raw,
    id: String(raw.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    name,
    domain,
    aisle: raw.aisle || classifyAisle({ name, domain }),
    packsToBuy,
    packSizeGrams,
    totalPurchasedGrams,
    totalRequiredGrams,
    residualReturnedToPantryGrams,
    unitPriceEur,
    lineTotalEur,
    checked: Boolean(raw.checked)
  };
}

export class ShoppingListService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_SHOPPING_PATH || DEFAULT_SHOPPING_LIST_PATH;
    this.pantryService = options.pantryService || pantryService;
    this._stores = null;
    this._seedOffersCache = null;
    this._state = null;
  }

  getStores() {
    if (!this._stores) {
      this._stores = JSON.parse(fs.readFileSync(STORES_SEED_PATH, 'utf8'));
    }
    return this._stores;
  }

  _getEnrichedOffersSync() {
    let raw = null;
    try {
      const cached = cacheManager.get('offers');
      const unwrapped = cached && Array.isArray(cached.data) ? cached.data : Array.isArray(cached) ? cached : null;
      if (unwrapped && unwrapped.length > 0) {
        raw = unwrapped;
      }
    } catch (_) {}

    if (!raw) {
      if (!this._seedOffersCache) {
        this._seedOffersCache = JSON.parse(fs.readFileSync(OFFERS_SEED_PATH, 'utf8'));
      }
      raw = this._seedOffersCache;
    }
    return raw.map((o) => enrichOfferRecord(o));
  }

  _load() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && Array.isArray(parsed.items)) {
          this._state = {
            items: parsed.items.filter(Boolean).map((i) => sanitizeLoadedShoppingItem(i))
          };
          return this._state;
        }
      }
    } catch (_) {}
    this._state = {
      items: []
    };
    return this._state;
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  /**
   * Synchronizes the weekly meal plan's whole-pack ledger into the shopping list,
   * preserving any manual or kitchen_care items AND preserving existing `checked` flags
   * / Plan B substitutions on unchanged planner items when `options.preserveChecked` is true.
   */
  syncFromWeeklyPlan(plan, options = {}) {
    const state = this._load();
    const preserveChecked = options.preserveChecked !== false;
    const prevPlannerById = new Map(
      state.items.filter((i) => i.source === 'meal_planner').map((i) => [i.id, i])
    );
    const nonPlannerItems = state.items.filter((i) => i.source !== 'meal_planner');

    const plannerItems = (plan?.ledger?.wholePackItems || [])
      .filter((wp) => wp.packsToBuy > 0)
      .map((wp) => {
        const id = `shop-plan-${wp.key}`;
        const prev = prevPlannerById.get(id);
        return {
          id,
          name: wp.name,
          domain: 'food_human',
          source: 'meal_planner',
          aisle: classifyAisle({ name: wp.name, domain: 'food_human' }),
          packsToBuy: wp.packsToBuy,
          packSizeGrams: wp.packSizeGrams,
          totalPurchasedGrams: wp.totalPurchasedGrams,
          totalRequiredGrams: wp.totalRequiredGrams,
          residualReturnedToPantryGrams: wp.residualReturnedToPantryGrams,
          unitPriceEur: wp.packPriceEur,
          lineTotalEur: wp.checkoutCostEur,
          preferredStoreId: wp.matchedOffer?.storeId || null,
          preferredChain: wp.matchedOffer?.chainName || 'Basko / Coop Liguria Rapallo',
          onPromo: Boolean(wp.matchedOffer),
          usedInMeals: wp.usedInMeals || [],
          checked: preserveChecked && prev ? Boolean(prev.checked) : false,
          creaId: wp.creaId || null
        };
      });

    state.items = [...plannerItems, ...nonPlannerItems];
    this._save();
    return this.getShoppingListState();
  }

  /**
   * Adds a single item (from flyer offer, Stanza 2 CREA, Stanza 4 Kitchen Reset, or manual entry).
   * Enforces strict `Number.isFinite` validation (`400 Bad Request` on invalid numeric inputs).
   */
  addItem(payload = {}) {
    const name = String(payload.name || payload.title || '').trim();
    if (!name) {
      throwBadRequest('Nome articolo lista spesa obbligatorio');
    }

    const domain = payload.domain || 'food_human';
    const spec = domain === 'food_human' ? resolveIngredientPackSpec(name) : { packGrams: 500, euroPerKg: 5.0 };

    let packsToBuy = 1;
    const rawQty = payload.packsToBuy ?? payload.quantity;
    if (rawQty !== undefined && rawQty !== null && rawQty !== '') {
      const parsedQty = Number(rawQty);
      if (!Number.isFinite(parsedQty) || parsedQty <= 0) {
        throwBadRequest('Quantità confezioni (packsToBuy) non valida: inserire un numero > 0');
      }
      packsToBuy = Math.max(1, Math.round(parsedQty));
    }

    const extractedMetrics = extractPackMetrics({ title: `${name} ${payload.quantityLabel || ''}` });
    const fallbackPackGrams =
      extractedMetrics.packVolumeMl || extractedMetrics.packWeightGrams || spec.packGrams || 300;

    let packSizeGrams = fallbackPackGrams;
    if (payload.packSizeGrams !== undefined && payload.packSizeGrams !== null && payload.packSizeGrams !== '') {
      const parsedPack = Number(payload.packSizeGrams);
      if (!Number.isFinite(parsedPack) || parsedPack <= 0) {
        throwBadRequest('Formato confezione (packSizeGrams) non valido: inserire un numero > 0');
      }
      packSizeGrams = parsedPack;
    }

    const defaultUnitPrice =
      domain === 'food_human'
        ? Math.max(0.1, Number(((spec.euroPerKg * packSizeGrams) / 1000).toFixed(2)))
        : 2.5;

    let unitPriceEur = defaultUnitPrice;
    const rawPrice = payload.unitPriceEur ?? payload.price;
    if (rawPrice !== undefined && rawPrice !== null && rawPrice !== '') {
      const parsedPrice =
        typeof rawPrice === 'string' ? Number(rawPrice.trim().replace(',', '.')) : Number(rawPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throwBadRequest('Prezzo unitario (unitPriceEur) non valido: inserire un numero > 0');
      }
      unitPriceEur = Number(parsedPrice.toFixed(2));
    }

    const item = {
      id: payload.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      domain,
      source: payload.source || 'manual_or_flyer',
      aisle: classifyAisle({ name, domain }),
      packsToBuy,
      packSizeGrams,
      packVolumeMl: extractedMetrics.packVolumeMl || null,
      totalPurchasedGrams: packsToBuy * packSizeGrams,
      totalRequiredGrams: packsToBuy * packSizeGrams,
      residualReturnedToPantryGrams: 0,
      unitPriceEur: Number(unitPriceEur.toFixed(2)),
      lineTotalEur: Number((packsToBuy * unitPriceEur).toFixed(2)),
      preferredStoreId: payload.storeId || payload.preferredStoreId || null,
      preferredChain:
        payload.preferredChain ||
        payload.preferredStore ||
        (domain === 'home_cleaning' || domain === 'personal_care'
          ? 'Tigotà / PiùMe Rapallo'
          : domain === 'kitchen_cookware'
          ? 'Unieuro City Rapallo'
          : domain === 'pet_care'
          ? 'Arcaplanet Rapallo'
          : domain === 'bazar_seasonal'
          ? 'Carrefour Market / Penny Rapallo'
          : 'Basko / Coop Liguria Rapallo'),
      onPromo: Boolean(payload.onPromo),
      usedInMeals: payload.usedInMeals || [],
      checked: false,
      creaId: payload.creaId || null
    };

    const state = this._load();
    const normName = normalizeSearchToken(name);
    const existing = state.items.find(
      (i) => normalizeSearchToken(i.name) === normName && (i.domain || 'food_human') === domain
    );
    if (existing) {
      existing.packsToBuy = Number(existing.packsToBuy || 1) + packsToBuy;
      existing.totalPurchasedGrams = existing.packsToBuy * existing.packSizeGrams;
      existing.totalRequiredGrams = existing.packsToBuy * existing.packSizeGrams;
      existing.unitPriceEur = Number(unitPriceEur.toFixed(2));
      existing.lineTotalEur = Number((existing.packsToBuy * existing.unitPriceEur).toFixed(2));
      if (payload.preferredChain) existing.preferredChain = payload.preferredChain;
      if (payload.storeId || payload.preferredStoreId) {
        existing.preferredStoreId = payload.storeId || payload.preferredStoreId;
      }
      if (payload.onPromo !== undefined) existing.onPromo = Boolean(payload.onPromo);
      this._save();
      return this.getShoppingListState();
    }

    state.items.unshift(item);
    this._save();
    return this.getShoppingListState();
  }

  removeItem(itemId) {
    const state = this._load();
    state.items = state.items.filter((i) => i.id !== itemId);
    this._save();
    return this.getShoppingListState();
  }

  replaceItemWithPlanB(itemId, replacement = {}) {
    const state = this._load();
    const idx = state.items.findIndex((i) => i.id === itemId);
    if (idx === -1) {
      const err = new Error(`Articolo non trovato: ${itemId}`);
      err.status = 404;
      throw err;
    }
    const current = state.items[idx];
    const nextTitle = String(replacement.title || replacement.name || current.name).trim();
    if (!nextTitle) {
      throwBadRequest('Titolo sostituto Piano B obbligatorio');
    }

    let validPrice = current.unitPriceEur;
    const rawReplacementPrice = replacement.price ?? replacement.unitPriceEur;
    if (rawReplacementPrice !== undefined && rawReplacementPrice !== null && rawReplacementPrice !== '') {
      const parsedPrice =
        typeof rawReplacementPrice === 'string'
          ? Number(rawReplacementPrice.trim().replace(',', '.'))
          : Number(rawReplacementPrice);
      if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
        throwBadRequest('Prezzo sostituto Piano B non valido: inserire un numero > 0');
      }
      validPrice = Number(parsedPrice.toFixed(2));
    }

    // Recompute pack size & total purchased grams when the substitute carries an explicit pack weight/volume (e.g. 500g -> 1kg)!
    const replMetrics = extractPackMetrics({ title: nextTitle });
    let nextPackSizeGrams = Number(current.packSizeGrams) || 300;
    if (replacement.packSizeGrams !== undefined && replacement.packSizeGrams !== null) {
      const parsedPack = Number(replacement.packSizeGrams);
      if (!Number.isFinite(parsedPack) || parsedPack <= 0) {
        throwBadRequest('packSizeGrams sostituto non valido');
      }
      nextPackSizeGrams = parsedPack;
    } else if (replMetrics.packVolumeMl && replMetrics.packVolumeMl > 0) {
      nextPackSizeGrams = replMetrics.packVolumeMl;
    } else if (replMetrics.packWeightGrams && replMetrics.packWeightGrams > 0) {
      nextPackSizeGrams = replMetrics.packWeightGrams;
    }

    let packs = Math.max(1, Number(current.packsToBuy || 1));
    let totalRequiredGrams = Number(current.totalRequiredGrams) || packs * nextPackSizeGrams;
    if (current.source === 'meal_planner' && current.domain === 'food_human' && totalRequiredGrams > 0) {
      packs = Math.max(1, Math.ceil(totalRequiredGrams / nextPackSizeGrams));
    } else if (nextPackSizeGrams !== current.packSizeGrams) {
      totalRequiredGrams = packs * nextPackSizeGrams;
    }

    const totalPurchasedGrams = packs * nextPackSizeGrams;
    const residualReturnedToPantryGrams = Math.max(
      0,
      Number((totalPurchasedGrams - totalRequiredGrams).toFixed(1))
    );

    state.items[idx] = {
      ...current,
      name: nextTitle,
      packSizeGrams: nextPackSizeGrams,
      packVolumeMl: replMetrics.packVolumeMl || null,
      packsToBuy: packs,
      totalPurchasedGrams,
      totalRequiredGrams,
      residualReturnedToPantryGrams,
      unitPriceEur: validPrice,
      lineTotalEur: Number((packs * validPrice).toFixed(2)),
      preferredChain: replacement.chainName || replacement.preferredChain || current.preferredChain,
      preferredStoreId: replacement.storeId || null,
      onPromo: true,
      substitutedFrom: current.name
    };
    this._save();
    return this.getShoppingListState();
  }

  toggleCheckItem(itemId) {
    const state = this._load();
    const item = state.items.find((i) => i.id === itemId);
    if (item) {
      item.checked = !item.checked;
      this._save();
    }
    return this.getShoppingListState();
  }

  /**
   * "Prodotto Finito / Piano B sullo Scaffale":
   * Finds semantically coherent in-store substitutes in Rapallo (strict culinary/appliance/pet/cleaning
   * sub-family coherence — NEVER dishwashers/cameras for pans, NEVER canned tuna or shrimp crackers for
   * fresh sea bream, NEVER yogurt for eggs, and excluding nameless flyer tiles & profile-incompatible items).
   */
  async getShelfPlanB(itemId) {
    const state = this._load();
    const item = state.items.find((i) => i.id === itemId);
    if (!item) {
      const err = new Error(`Articolo non trovato: ${itemId}`);
      err.status = 404;
      throw err;
    }

    const targetDomain = item.domain || 'food_human';
    const rawOffers = await offerService.getRawOffers();
    const domainOffers = rawOffers
      .map((o) => enrichOfferRecord(o))
      .filter((o) => {
        if (!o || o.isNamelessTile) return false;
        if (o.domain !== targetDomain) return false;
        if (normalizeSearchToken(o.title) === normalizeSearchToken(item.name)) return false;
        if (targetDomain === 'food_human' && o.profileCompatibility?.isCompatible === false) return false;
        return true;
      });

    const itemEffectiveFamily =
      targetDomain === 'food_human' ? resolveEffectiveFoodFamily(item.name) : classifyNonFoodSubFamily(targetDomain, item.name);
    const itemAisle = item.aisle || classifyAisle(item);
    const itemNorm = normalizeSearchToken(item.name);
    const itemStems = itemNorm
      .split(' ')
      .filter((w) => w.length >= 4)
      .map(stemItalianWord)
      .filter((s) => s.length >= 3);

    const COMPATIBLE_AISLE_FOOD_FAMILIES = {
      fresh_fish: new Set(['fresh_fish', 'luxury_crustaceans']),
      luxury_crustaceans: new Set(['luxury_crustaceans', 'fresh_fish']),
      meat_poultry: new Set(['meat_poultry', 'prime_beef_cuts']),
      prime_beef_cuts: new Set(['prime_beef_cuts', 'meat_poultry']),
      eggs: new Set(['eggs']),
      milk: new Set(['milk']),
      yogurt_single: new Set(['yogurt_single']),
      smoked_cured: new Set(['smoked_cured']),
      fresh_pasta: new Set(['fresh_pasta']),
      fresh_fruit: new Set(['fresh_fruit', 'citrus']),
      citrus: new Set(['citrus', 'fresh_fruit']),
      fresh_vegetables: new Set(['fresh_vegetables', 'fresh_herbs', 'alliums_chili']),
      fresh_herbs: new Set(['fresh_herbs', 'fresh_vegetables']),
      alliums_chili: new Set(['alliums_chili', 'fresh_vegetables']),
      dry_pasta_grains: new Set(['dry_pasta_grains', 'bread_bakery']),
      bread_bakery: new Set(['bread_bakery', 'dry_pasta_grains']),
      legumes_tomato: new Set(['legumes_tomato']),
      canned_fish: new Set(['canned_fish', 'olives_capers_anchovies']),
      oil_fats: new Set(['oil_fats']),
      nuts_seeds: new Set(['nuts_seeds', 'pine_bottarga']),
      honey_sweet: new Set(['honey_sweet'])
    };

    const NON_FOOD_STORE_HINT = {
      kitchen_cookware: 'Unieuro / GDO Rapallo',
      home_cleaning: 'Tigotà / PiùMe / GDO Rapallo',
      personal_care: 'Tigotà / PiùMe / GDO Rapallo',
      pet_care: 'Arcaplanet / GDO Rapallo',
      bazar_seasonal: 'Negozi di Rapallo'
    };

    const scored = [];
    for (const o of domainOffers) {
      let tier = 0;
      let score = 0;
      let rationale = '';

      if (targetDomain === 'food_human') {
        const candEffectiveFamily = resolveEffectiveFoodFamily(o.title);

        // Hard guard against snack/cracker/sweet/beverage leaks into culinary ingredient Plan B
        if (
          candEffectiveFamily === 'snack_sweet_composite' &&
          itemEffectiveFamily !== 'snack_sweet_composite' &&
          itemEffectiveFamily !== 'honey_sweet'
        ) {
          continue;
        }
        if (
          candEffectiveFamily === 'beverage_coffee_alcohol' &&
          itemEffectiveFamily !== 'beverage_coffee_alcohol' &&
          itemEffectiveFamily !== 'wine_cooking'
        ) {
          continue;
        }

        const directMatch = matchBomIngredientToOffer({ name: item.name, creaId: item.creaId }, [o]);
        const candAisle = classifyAisle({ name: o.title, category: o.category, domain: o.domain });

        if (directMatch && candEffectiveFamily === itemEffectiveFamily) {
          tier = 1;
          score = 120;
          rationale = 'Stesso ingrediente in offerta attiva a Rapallo (altra marca/insegna) — sostituzione 1:1 immediata.';
        } else if (itemEffectiveFamily !== 'default' && candEffectiveFamily === itemEffectiveFamily) {
          tier = 2;
          score = 75;
          rationale =
            'Stessa famiglia gastronomica/nutrizionale in offerta oggi a Rapallo — equivalente diretto per le ricette del piano.';
        } else if (candAisle === itemAisle) {
          const allowedSet = COMPATIBLE_AISLE_FOOD_FAMILIES[itemEffectiveFamily];
          const isCompatibleInAisle = allowedSet
            ? allowedSet.has(candEffectiveFamily)
            : candEffectiveFamily !== 'snack_sweet_composite' &&
              candEffectiveFamily !== 'beverage_coffee_alcohol' &&
              o.category !== 'Colazione e Dolci';

          // Extra guard for citrus vs savory vegetables in ortofrutta
          const isFruitVegClash =
            (itemEffectiveFamily === 'fresh_fruit' &&
              /\b(insalat\w*|carot\w*|cipoll\w*|patat\w*|zucchin\w*|spinac\w*|cavol\w*|verza)\b/i.test(o.title)) ||
            (itemEffectiveFamily === 'fresh_vegetables' && candEffectiveFamily === 'fresh_fruit');

          if (isCompatibleInAisle && !isFruitVegClash) {
            tier = 3;
            score = 35;
            rationale = 'Alternativa compatibile dello stesso reparto e categoria culinaria disponibile oggi a Rapallo.';
          }
        }
      } else {
        const offNorm = normalizeSearchToken(`${o.title} ${o.brand || ''}`);
        const offWords = offNorm.split(' ').filter((w) => w.length >= 4);
        const offStems = offWords.map(stemItalianWord).filter((s) => s.length >= 3);
        const candSubFamily = classifyNonFoodSubFamily(targetDomain, o.title);

        const sharedStem = itemStems.some((st) => offStems.some((os) => os === st || (st.length >= 5 && os.startsWith(st))));
        const storeHint = NON_FOOD_STORE_HINT[targetDomain] || 'Rapallo';

        // Strict sub-family coherence: NEVER cross cookware <-> major_appliances (dishwashers) <-> electronics (cameras) <-> small_appliances (kettles)!
        if (candSubFamily === itemEffectiveFamily) {
          if (sharedStem) {
            tier = 1;
            score = 115;
            rationale = `Stessa tipologia di prodotto in promozione attiva a Rapallo (${storeHint}).`;
          } else {
            tier = 2;
            score = 70;
            rationale = `Alternativa equivalente della stessa famiglia merceologica in offerta a Rapallo (${storeHint}).`;
          }
        } else if (
          sharedStem &&
          candSubFamily !== 'consumer_electronics' &&
          candSubFamily !== 'major_appliances' &&
          itemEffectiveFamily !== 'cookware_pots_pans'
        ) {
          tier = 3;
          score = 40;
          rationale = `Alternativa affine disponibile nei punti vendita di Rapallo (${storeHint}).`;
        }
      }

      if (tier > 0) {
        const unitCost = o.ediblePricePerKg ?? o.pricePerKg ?? o.promoPrice ?? o.price ?? 99;
        score += Math.max(0, 20 - Math.min(20, Number(unitCost) * 0.5));
        scored.push({ offer: o, tier, score, rationale });
      }
    }

    scored.sort((a, b) => b.score - a.score);

    // Deduplicate identical offer titles across pages
    const seenTitles = new Set();
    const alternatives = [];
    for (const entry of scored) {
      const key = `${normalizeSearchToken(entry.offer.title)}:${entry.offer.chainId}`;
      if (seenTitles.has(key)) continue;
      seenTitles.add(key);
      const metrics = extractPackMetrics(entry.offer);
      alternatives.push({
        offerId: entry.offer.id,
        title: entry.offer.title,
        storeId: entry.offer.storeId || null,
        chainName: entry.offer.storeName || entry.offer.chainName || entry.offer.brand || entry.offer.chainId,
        price: Number(entry.offer.promoPrice ?? entry.offer.price ?? entry.offer.discountPrice ?? 0),
        packSizeGrams: metrics.packVolumeMl || metrics.packWeightGrams || null,
        rationale: entry.rationale
      });
      if (alternatives.length >= 3) break;
    }

    return {
      originalItem: item,
      planBAlternatives: alternatives
    };
  }

  /**
   * Empirically simulates shopping in 1 Single Store vs 2 Stores vs 3 Stores across the real
   * verified retailers of Rapallo (16035 GE) — allowing specialist stores (`Unieuro`, `Tigotà`,
   * `PiùMe`, `Arcaplanet`) whenever they cover 100% of active items, pricing `pet` properly (`0.94`),
   * and pruning 0-item ghost stops in 2/3-Store scenarios!
   */
  _simulateMultiStoreScenarios(items) {
    const allStores = this.getStores();
    const hasPetItems = items.some((i) => i.domain === 'pet_care');
    const candidateStores = allStores.filter((s) => hasPetItems || s.storeCategory !== 'pet');
    const gdoStores = candidateStores.filter((s) => s.storeCategory === 'gdo');

    if (items.length === 0) {
      const basko = gdoStores.find((s) => s.chainId === 'basko') || gdoStores[0];
      const coop = gdoStores.find((s) => s.chainId === 'coop') || gdoStores[1] || basko;
      const tigota = candidateStores.find((s) => s.chainId === 'tigota') || gdoStores[2] || basko;
      return [
        {
          strategyId: '1_store_express',
          title: '1 Solo Negozio (Spesa Unica Veloce)',
          storesVisited: [`${basko.name} (${basko.address})`],
          loyaltyCardsNeeded: [basko.loyaltyCard?.name || 'Nessuna tessera richiesta'],
          estimatedTotalEur: 0,
          savingsVsSingleEur: 0,
          estimatedTotalMinutes: basko.logistics?.avgVisitMinutes || 20,
          recommendation: 'Aggiungi articoli o genera un piano settimanale per calcolare i prezzi reali nei negozi di Rapallo.'
        },
        {
          strategyId: '2_stores_optimal',
          title: '2 Negozi Rapallo (Ottimo Qualità/Tempo — Consigliato)',
          storesVisited: [`${basko.name} (${basko.address})`, `${coop.name} (${coop.address})`],
          loyaltyCardsNeeded: [basko.loyaltyCard?.name, coop.loyaltyCard?.name].filter(Boolean),
          estimatedTotalEur: 0,
          savingsVsSingleEur: 0,
          estimatedTotalMinutes: 38,
          recommendation: 'Confronta automaticamente accoppiate GDO + Tigotà/PiùMe sul tuo carrello reale.'
        },
        {
          strategyId: '3_stores_cherry_picking',
          title: '3 Negozi Cherry-Picking (Massimo Risparmio Assoluto)',
          storesVisited: [
            `${basko.name} (${basko.address})`,
            `${coop.name} (${coop.address})`,
            `${tigota.name} (${tigota.address})`
          ],
          loyaltyCardsNeeded: [basko.loyaltyCard?.name, coop.loyaltyCard?.name, tigota.loyaltyCard?.name].filter(Boolean),
          estimatedTotalEur: 0,
          savingsVsSingleEur: 0,
          estimatedTotalMinutes: 52,
          recommendation: 'Calcola se una terza tappa a Rapallo ripaga davvero il tempo di spostamento.'
        }
      ];
    }

    const allOffers = this._getEnrichedOffersSync();
    const offersByStoreId = new Map();
    for (const s of candidateStores) {
      offersByStoreId.set(s.id, []);
    }
    for (const o of allOffers) {
      if (o.isNamelessTile) continue;
      if (o.storeId && offersByStoreId.has(o.storeId)) {
        offersByStoreId.get(o.storeId).push(o);
      }
    }

    const DISCOUNT_CHAINS = new Set(['eurospin', 'dpiu', 'ekom', 'penny']);

    // Build exact [items.length x candidateStores.length] empirical cost matrix
    const costMatrix = items.map((item) => {
      const prefChainNorm = normalizeSearchToken(item.preferredChain || '');
      const itemNormWords = normalizeSearchToken(item.name)
        .split(' ')
        .filter((w) => w.length >= 4);

      return candidateStores.map((store) => {
        if (!canStoreSupplyDomain(store, item.domain || 'food_human')) {
          return Infinity;
        }

        const storeOffers = offersByStoreId.get(store.id) || [];
        const chainNorm = normalizeSearchToken(store.chainId || store.brand || '');
        const nameHeadNorm = normalizeSearchToken(String(store.name || '').split('-')[0]);
        const isPreferredStore =
          (item.preferredStoreId && item.preferredStoreId === store.id) ||
          (prefChainNorm &&
            ((chainNorm && prefChainNorm.includes(chainNorm)) ||
              (nameHeadNorm && prefChainNorm.includes(nameHeadNorm))));

        if (isPreferredStore) {
          return item.lineTotalEur;
        }

        // Check if this specific Rapallo store has an active flyer promo matching the item
        let matchedStoreOffer = null;
        if ((item.domain || 'food_human') === 'food_human') {
          matchedStoreOffer = matchBomIngredientToOffer(
            { name: item.name, creaId: item.creaId },
            storeOffers
          );
        } else {
          // If the user explicitly pinned a specific store/promo (e.g. a €29.90 Lagostina pan at Unieuro
          // or a specific detergent at Tigotà), do NOT cross-match a generic store-brand/seasonal promo
          // at another chain (e.g. €3.90 "Padella per caldarroste" at Gulliver) as if it were the same SKU!
          const hasPinnedSingleChain =
            Boolean(item.preferredStoreId) ||
            (Boolean(prefChainNorm) && !prefChainNorm.includes('/'));

          if (!hasPinnedSingleChain) {
            const itemSubFamily = classifyNonFoodSubFamily(item.domain, item.name);
            const itemStems = itemNormWords.map(stemItalianWord).filter((s) => s.length >= 3);
            matchedStoreOffer = storeOffers.find((o) => {
              if (o.domain !== item.domain) return false;
              const candSubFamily = classifyNonFoodSubFamily(o.domain, o.title);
              if (!itemSubFamily.endsWith('_general') && !candSubFamily.endsWith('_general') && candSubFamily !== itemSubFamily) {
                return false;
              }
              if (/\bcaldarrost\w*\b/i.test(o.title || '') && !/\bcaldarrost\w*\b/i.test(item.name || '')) {
                return false;
              }
              const offWords = normalizeSearchToken(`${o.title} ${o.brand || ''}`).split(' ');
              const offStems = offWords.filter((w) => w.length >= 4).map(stemItalianWord);
              const sharedCount = itemStems.filter((st) => offStems.includes(st)).length;
              return itemStems.length >= 2 ? sharedCount >= 2 : sharedCount >= 1;
            });
          }
        }

        if (matchedStoreOffer) {
          const promoPackPrice = Number(
            matchedStoreOffer.promoPrice ?? matchedStoreOffer.price ?? matchedStoreOffer.discountPrice ?? 0
          );
          const kgRate = matchedStoreOffer.ediblePricePerKg ?? matchedStoreOffer.pricePerKg ?? null;
          let candidateLineCost = item.lineTotalEur;
          if (kgRate && kgRate > 0.4 && item.totalPurchasedGrams > 0) {
            candidateLineCost = (kgRate * item.totalPurchasedGrams) / 1000;
          } else if (promoPackPrice > 0) {
            candidateLineCost = promoPackPrice * item.packsToBuy;
          }
          // Bound within realistic commercial pack variance around baseline lineTotalEur
          const clamped = Math.max(item.lineTotalEur * 0.72, Math.min(item.lineTotalEur * 1.12, candidateLineCost));
          return Number(clamped.toFixed(2));
        }

        // No active flyer promo at this store -> apply empirical Rapallo shelf baseline by store format
        if (store.storeCategory === 'cura_casa_persona') {
          return Number((item.lineTotalEur * (item.onPromo ? 1.03 : 0.94)).toFixed(2));
        }
        if (store.storeCategory === 'elettronica_cucina') {
          return Number((item.lineTotalEur * (item.onPromo ? 1.03 : 0.95)).toFixed(2));
        }
        if (store.storeCategory === 'pet') {
          return Number((item.lineTotalEur * (item.onPromo ? 1.03 : 0.94)).toFixed(2));
        }
        if (store.chainId === 'carrefour-express') {
          return Number((item.lineTotalEur * (item.onPromo ? 1.21 : 1.08)).toFixed(2));
        }
        if (DISCOUNT_CHAINS.has(store.chainId)) {
          const mult = item.domain !== 'food_human' ? 1.12 : item.onPromo ? 1.1 : 0.97;
          return Number((item.lineTotalEur * mult).toFixed(2));
        }
        // Standard full-assortment GDO (Basko, Coop Liguria, Carrefour Market, Gulliver, Despar)
        const stdMult = item.domain !== 'food_human' ? 1.16 : item.onPromo ? 1.14 : 1.02;
        return Number((item.lineTotalEur * stdMult).toFixed(2));
      });
    });

    // Evaluates a subset of stores AND returns the pruned list of stores that actually win >= 1 item
    const evalStoreSubset = (storeIndices) => {
      let total = 0;
      const usedSet = new Set();
      for (let i = 0; i < items.length; i++) {
        let bestItemCost = Infinity;
        let bestStoreIdx = -1;
        for (const sIdx of storeIndices) {
          const c = costMatrix[i][sIdx];
          if (c < bestItemCost) {
            bestItemCost = c;
            bestStoreIdx = sIdx;
          }
        }
        if (!Number.isFinite(bestItemCost) || bestStoreIdx === -1) {
          return { cost: Infinity, activeIndices: [] };
        }
        total += bestItemCost;
        usedSet.add(bestStoreIdx);
      }
      const activeIndices = storeIndices.filter((idx) => usedSet.has(idx));
      return {
        cost: Number(total.toFixed(2)),
        activeIndices
      };
    };

    const computeRouteMinutes = (activeIndices) => {
      if (activeIndices.length === 0) return 20;
      if (activeIndices.length === 1) {
        const s = candidateStores[activeIndices[0]];
        return (s.logistics?.avgVisitMinutes || 20) + Math.min(10, Math.ceil(items.length * 0.5));
      }
      if (activeIndices.length === 2) {
        const sa = candidateStores[activeIndices[0]];
        const sb = candidateStores[activeIndices[1]];
        const distKm = haversineKm(sa.latitude, sa.longitude, sb.latitude, sb.longitude);
        const transferMins = Math.max(5, Math.round(distKm * 11));
        return (sa.logistics?.avgVisitMinutes || 18) + (sb.logistics?.avgVisitMinutes || 14) + transferMins;
      }
      const trio = activeIndices.map((idx) => candidateStores[idx]);
      const dist12 = haversineKm(trio[0].latitude, trio[0].longitude, trio[1].latitude, trio[1].longitude);
      const dist23 = haversineKm(trio[1].latitude, trio[1].longitude, trio[2].latitude, trio[2].longitude);
      const transferMins = Math.max(10, Math.round((dist12 + dist23) * 11));
      return (
        (trio[0].logistics?.avgVisitMinutes || 16) +
        (trio[1].logistics?.avgVisitMinutes || 14) +
        (trio[2].logistics?.avgVisitMinutes || 12) +
        transferMins
      );
    };

    const formatCards = (storesArr) => {
      const cards = [...new Set(storesArr.map((s) => s.loyaltyCard?.name).filter(Boolean))];
      return cards.length > 0 ? cards : ['Nessuna tessera richiesta'];
    };

    // 1. Optimal Single Store in Rapallo:
    // Any store (GDO OR specialist like Unieuro/Tigotà/PiùMe/Arcaplanet) that covers 100% of active items!
    let best1 = null;
    for (let sIdx = 0; sIdx < candidateStores.length; sIdx++) {
      const res1 = evalStoreSubset([sIdx]);
      if (!Number.isFinite(res1.cost)) continue;
      const mins = computeRouteMinutes([sIdx]);
      if (!best1 || res1.cost < best1.cost || (res1.cost === best1.cost && mins < best1.mins)) {
        best1 = { indices: [sIdx], stores: [candidateStores[sIdx]], cost: res1.cost, mins };
      }
    }

    // 2. Optimal Genuine 2-Store Combination in Rapallo (only if BOTH stores supply >= 1 item AND strictly save vs 1-store)
    let best2Genuine = null;
    for (let a = 0; a < candidateStores.length; a++) {
      for (let b = a + 1; b < candidateStores.length; b++) {
        const res2 = evalStoreSubset([a, b]);
        if (!Number.isFinite(res2.cost) || res2.activeIndices.length !== 2) continue;
        if (best1 && res2.cost >= best1.cost) continue;
        const mins = computeRouteMinutes(res2.activeIndices);
        if (!best2Genuine || res2.cost < best2Genuine.cost || (res2.cost === best2Genuine.cost && mins < best2Genuine.mins)) {
          best2Genuine = {
            indices: res2.activeIndices,
            stores: res2.activeIndices.map((i) => candidateStores[i]),
            cost: res2.cost,
            mins
          };
        }
      }
    }
    // Prune 0-item ghost stops: if no 2-store pair saves money over 1-store, report the pruned single-store winner!
    const best2 = best2Genuine || best1;

    // 3. Optimal Genuine 3-Store Combination in Rapallo (only if ALL 3 stores supply >= 1 item AND strictly save vs 2-store)
    let best3Genuine = null;
    for (let a = 0; a < candidateStores.length; a++) {
      for (let b = a + 1; b < candidateStores.length; b++) {
        for (let c = b + 1; c < candidateStores.length; c++) {
          const res3 = evalStoreSubset([a, b, c]);
          if (!Number.isFinite(res3.cost) || res3.activeIndices.length !== 3) continue;
          if (best2 && res3.cost >= best2.cost) continue;
          const mins = computeRouteMinutes(res3.activeIndices);
          if (!best3Genuine || res3.cost < best3Genuine.cost || (res3.cost === best3Genuine.cost && mins < best3Genuine.mins)) {
            best3Genuine = {
              indices: res3.activeIndices,
              stores: res3.activeIndices.map((i) => candidateStores[i]),
              cost: res3.cost,
              mins
            };
          }
        }
      }
    }
    const best3 = best3Genuine || best2;

    const singleCost = best1 ? best1.cost : Number(items.reduce((acc, i) => acc + i.lineTotalEur, 0).toFixed(2));
    const twoCost = best2 ? Math.min(singleCost, best2.cost) : singleCost;
    const threeCost = best3 ? Math.min(twoCost, best3.cost) : twoCost;

    const savings2vs1 = Number(Math.max(0, singleCost - twoCost).toFixed(2));
    const savings3vs1 = Number(Math.max(0, singleCost - threeCost).toFixed(2));
    const extraSavings3vs2 = Number(Math.max(0, twoCost - threeCost).toFixed(2));
    const extraMins3vs2 = Math.max(8, (best3Genuine?.mins || (best2?.mins || 38) + 12) - (best2?.mins || 38));

    return [
      {
        strategyId: '1_store_express',
        title: '1 Solo Negozio (Spesa Unica Veloce)',
        storesVisited: best1
          ? best1.stores.map((s) => `${s.name} (${s.address})`)
          : ['Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)'],
        loyaltyCardsNeeded: best1 ? formatCards(best1.stores) : ['Prima Card Basko'],
        estimatedTotalEur: singleCost,
        savingsVsSingleEur: 0,
        estimatedTotalMinutes: best1 ? best1.mins : 26,
        recommendation:
          'Unica tappa nel punto vendita di Rapallo col miglior costo complessivo sul tuo carrello attuale: zero spostamenti tra insegne.'
      },
      {
        strategyId: '2_stores_optimal',
        title: '2 Negozi Rapallo (Ottimo Qualità/Tempo — Consigliato)',
        storesVisited: best2
          ? best2.stores.map((s) => `${s.name} (${s.address})`)
          : ['Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)', 'Coop Liguria - Rapallo (Via Amatore Sciesa, 15)'],
        loyaltyCardsNeeded: best2 ? formatCards(best2.stores) : ['Prima Card Basko', 'Socio Coop Liguria'],
        estimatedTotalEur: twoCost,
        savingsVsSingleEur: savings2vs1,
        estimatedTotalMinutes: best2 ? best2.mins : 40,
        recommendation: !best2Genuine
          ? 'Un singolo punto vendita copre già il carrello al miglior prezzo attivo: nessuna 2ª tappa superflua.'
          : savings2vs1 >= 1.5
            ? `Risparmi €${savings2vs1.toFixed(2)} rispetto al singolo negozio abbinando le promozioni complementari delle 2 insegne a Rapallo.`
            : 'Il carrello è già molto concentrato su una sola insegna: la 2ª tappa offre un margine contenuto.'
      },
      {
        strategyId: '3_stores_cherry_picking',
        title: '3 Negozi Cherry-Picking (Massimo Risparmio Assoluto)',
        storesVisited: best3
          ? best3.stores.map((s) => `${s.name} (${s.address})`)
          : [
              'Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)',
              'Coop Liguria - Rapallo (Via Amatore Sciesa, 15)',
              'Tigotà - Rapallo (Via Lamarmora, 23)'
            ],
        loyaltyCardsNeeded: best3
          ? formatCards(best3.stores)
          : ['Prima Card Basko', 'Socio Coop Liguria', 'Fidelity Club Tigotà'],
        estimatedTotalEur: threeCost,
        savingsVsSingleEur: savings3vs1,
        estimatedTotalMinutes: best3 ? best3.mins : 55,
        recommendation: !best3Genuine
          ? `Nessuna 3ª tappa riduce ulteriormente il totale (€${twoCost.toFixed(2)}): tappe extra eliminate.`
          : extraSavings3vs2 < 3.0
            ? `Nota onesta: la 3ª tappa fa risparmiare solo €${extraSavings3vs2.toFixed(2)} in più rispetto ai 2 negozi (+${extraMins3vs2} min di spostamento a Rapallo) — consigliato fermarsi a 2 negozi.`
            : `Risparmio extra di €${extraSavings3vs2.toFixed(2)} rispetto a 2 negozi acquistando ogni articolo nell'insegna col miglior prezzo attivo a Rapallo.`
      }
    ];
  }

  getShoppingListState() {
    const state = this._load();
    const items = state.items;

    const foodItems = items.filter((i) => i.domain === 'food_human');
    const homeAndKitchenItems = items.filter((i) => i.domain !== 'food_human');

    const safeLineTotal = (i) => (Number.isFinite(Number(i.lineTotalEur)) ? Number(i.lineTotalEur) : 0);

    const foodSubtotalEur = Number(foodItems.reduce((acc, i) => acc + safeLineTotal(i), 0).toFixed(2));
    const homeAndKitchenSubtotalEur = Number(
      homeAndKitchenItems.reduce((acc, i) => acc + safeLineTotal(i), 0).toFixed(2)
    );
    const grandTotalEur = Number((foodSubtotalEur + homeAndKitchenSubtotalEur).toFixed(2));
    const checkedTotalEur = Number(
      items
        .filter((i) => i.checked)
        .reduce((acc, i) => acc + safeLineTotal(i), 0)
        .toFixed(2)
    );

    const byAisle = AISLE_ORDER.map((aisle) => ({
      ...aisle,
      items: items.filter((i) => i.aisle === aisle.id)
    })).filter((g) => g.items.length > 0);

    const storeSimulations = this._simulateMultiStoreScenarios(items);

    // Build formatted WhatsApp / Telegram text export (hide food grams on non-food items!)
    const exportLines = [
      '🌿 *BASILICO — LISTA SPESA SMART RAPALLO (16035)*',
      `💰 Totale Stimato: €${grandTotalEur.toFixed(2)} (Alimentari: €${foodSubtotalEur.toFixed(2)} · Casa/Pentole: €${homeAndKitchenSubtotalEur.toFixed(2)})`,
      ''
    ];
    for (const grp of byAisle) {
      exportLines.push(`*${grp.icon} ${grp.label}*`);
      for (const it of grp.items) {
        const chk = it.checked ? '✅' : '⬜';
        const priceTxt = safeLineTotal(it).toFixed(2);
        const qtyTxt =
          it.domain === 'food_human'
            ? `${it.packsToBuy} conf. (${it.totalPurchasedGrams}g)`
            : `${it.packsToBuy} pz.`;
        exportLines.push(`${chk} ${it.name} — ${qtyTxt} · €${priceTxt} [${it.preferredChain}]`);
      }
      exportLines.push('');
    }

    return {
      items,
      byAisle,
      subtotals: {
        foodSubtotalEur,
        homeAndKitchenSubtotalEur,
        grandTotalEur,
        checkedTotalEur,
        totalItemsCount: items.length,
        checkedItemsCount: items.filter((i) => i.checked).length
      },
      storeSimulations,
      whatsappExportText: exportLines.join('\n')
    };
  }

  /**
   * 1-Click "Spunta tutto e carica in Dispensa":
   * Inserts `packsToBuy` individual `closed` packages of `packSizeGrams` into the 3-zone Pantry
   * (so opening 1 pack starts `T_open` ONLY on that single pack, never on a merged 750g blob!)
   * and clears completed items from the active shopping cart so a second click NEVER duplicates
   * Pantry stock and resets the Header cart badge to `0` (`M-P1-20`).
   */
  completeShoppingAndLoadPantry() {
    const state = this._load();
    const loadedToPantry = [];

    for (const item of state.items) {
      if (item.domain !== 'food_human') continue;

      const packsCount = Math.max(1, Math.round(Number(item.packsToBuy) || 1));
      const metrics = extractPackMetrics({ title: item.name });
      const isLiquid =
        Boolean(item.packVolumeMl || metrics.packVolumeMl) ||
        /\b(olio|latte|vino|birra|aceto|acqua|succo|bevanda)\b/i.test(item.name || '');

      const singlePackWeight =
        Number.isFinite(Number(item.packSizeGrams)) && Number(item.packSizeGrams) > 0
          ? Number(item.packSizeGrams)
          : Number.isFinite(Number(item.totalPurchasedGrams)) && Number(item.totalPurchasedGrams) > 0
            ? Math.round(Number(item.totalPurchasedGrams) / packsCount)
            : 300;

      for (let p = 0; p < packsCount; p++) {
        const added = this.pantryService.addItem({
          title: item.name,
          initialWeightGrams: singlePackWeight,
          remainingWeightGrams: singlePackWeight,
          unit: isLiquid ? 'ml' : 'g',
          status: 'closed',
          creaFoodId: item.creaId || null
        });
        loadedToPantry.push(added);
      }
    }

    // Clear completed cart items so repeat clicks are a clean no-op and Header badge resets to 0
    state.items = [];
    this._save();

    return {
      loadedCount: loadedToPantry.length,
      loadedItems: loadedToPantry,
      shoppingList: this.getShoppingListState()
    };
  }
}

export const shoppingListService = new ShoppingListService();
export default shoppingListService;
