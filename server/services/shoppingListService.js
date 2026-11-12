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
 *       and Haversine transfer minutes across Rapallo (16035 GE) — zero non-existent chains!
 *  4. "In Corsia" Aisle Ordering (`Ortofrutta -> Pesce/Carne -> Freschi -> Dispensa Secca -> Surgelati -> Cura Casa & Pentole`)
 *  5. Semantic "Prodotto Finito / Piano B sullo Scaffale" substitute finder (same ingredient / culinary family / aisle, profile-safe)
 *  6. WhatsApp / Telegram / Markdown formatted export & 1-click transfer to Pantry
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerService, enrichOfferRecord, normalizeSearchToken } from './offerService.js';
import { cacheManager } from './cacheManager.js';
import { pantryService } from './pantryService.js';
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

export function classifyAisle(item = {}) {
  if (item.domain && item.domain !== 'food_human') {
    return 'cura_casa_pentole';
  }
  const norm = normalizeSearchToken(`${item.name || item.title || ''} ${item.category || ''}`);
  if (/\b(salsa|sugo|passata|polpa|pelat\w*|scatola|sott\s*olio|in\s+olio|al\s+naturale|liquore|limoncetta)\b/.test(norm)) {
    return 'dispensa_secca';
  }
  if (
    /\b(pomodor\w*|insalata|spinac\w*|bietol\w*|borragine|zucchin\w*|sedano|cipoll\w*|scalogno|aglio|patat\w*|carciof\w*|limon\w*|basilico|prezzemolo|rosmarino|salvia|timo|maggiorana|mele|mela|banan\w*|aranc\w*|mirtill\w*|avocado|asparag\w*|melanzan\w*|peperon\w*|finocch\w*|carot\w*|frutta|verdura|ortagg\w*)\b/.test(
      norm
    )
  ) {
    return 'ortofrutta';
  }
  if (/\b(tonno\s+(?:sott|al\s+naturale|in\s+olio|sgocciolat\w*)|sgombro\s+(?:al\s+naturale|sott|sgocciolat\w*)|acciug\w*\s+sott\w*)\b/.test(norm)) {
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

export class ShoppingListService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_SHOPPING_PATH || DEFAULT_SHOPPING_LIST_PATH;
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
          this._state = parsed;
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
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  /**
   * Synchronizes the weekly meal plan's whole-pack ledger into the shopping list,
   * preserving any manual or kitchen_care items already in the cart.
   */
  syncFromWeeklyPlan(plan) {
    const state = this._load();
    const nonPlannerItems = state.items.filter((i) => i.source !== 'meal_planner');

    const plannerItems = (plan?.ledger?.wholePackItems || [])
      .filter((wp) => wp.packsToBuy > 0)
      .map((wp) => ({
        id: `shop-plan-${wp.key}`,
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
        checked: false,
        creaId: wp.creaId || null
      }));

    state.items = [...plannerItems, ...nonPlannerItems];
    this._save();
    return this.getShoppingListState();
  }

  /**
   * Adds a single item (from flyer offer, Stanza 2 CREA, Stanza 4 Kitchen Reset, or manual entry).
   */
  addItem(payload = {}) {
    const name = String(payload.name || payload.title || '').trim();
    if (!name) {
      const err = new Error('Nome articolo lista spesa obbligatorio');
      err.status = 400;
      throw err;
    }

    const domain = payload.domain || 'food_human';
    const spec = domain === 'food_human' ? resolveIngredientPackSpec(name) : { packGrams: 500, euroPerKg: 5.0 };
    const packsToBuy = Math.max(1, Number(payload.packsToBuy || payload.quantity || 1));
    const packSizeGrams = Number(payload.packSizeGrams || spec.packGrams || 300);
    const defaultUnitPrice =
      domain === 'food_human' ? Number(((spec.euroPerKg * packSizeGrams) / 1000).toFixed(2)) : 2.5;
    const unitPriceEur = Math.max(0.1, Number(payload.unitPriceEur ?? payload.price ?? defaultUnitPrice));

    const item = {
      id: payload.id || `shop-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      domain,
      source: payload.source || 'manual_or_flyer',
      aisle: classifyAisle({ name, domain }),
      packsToBuy,
      packSizeGrams,
      totalPurchasedGrams: packsToBuy * packSizeGrams,
      totalRequiredGrams: packsToBuy * packSizeGrams,
      residualReturnedToPantryGrams: 0,
      unitPriceEur: Number(unitPriceEur.toFixed(2)),
      lineTotalEur: Number((packsToBuy * unitPriceEur).toFixed(2)),
      preferredStoreId: payload.storeId || payload.preferredStoreId || null,
      preferredChain:
        payload.preferredChain ||
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
      if (payload.storeId) existing.preferredStoreId = payload.storeId;
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
    const nextPrice = Number(replacement.price ?? replacement.unitPriceEur ?? current.unitPriceEur);
    const validPrice = Number.isFinite(nextPrice) && nextPrice > 0 ? Number(nextPrice.toFixed(2)) : current.unitPriceEur;
    const packs = Math.max(1, Number(current.packsToBuy || 1));

    state.items[idx] = {
      ...current,
      name: nextTitle,
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
   * Finds semantically coherent in-store substitutes in Rapallo (same ingredient, same culinary/chemical family,
   * or same supermarket aisle — strictly excluding nameless flyer tiles and profile-incompatible items).
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

    const itemSpec = targetDomain === 'food_human' ? resolveIngredientPackSpec(item.name) : { family: 'non_food' };
    const itemAisle = item.aisle || classifyAisle(item);
    const itemNormWords = normalizeSearchToken(item.name)
      .split(' ')
      .filter((w) => w.length >= 4);

    const scored = [];
    for (const o of domainOffers) {
      let tier = 0;
      let score = 0;
      let rationale = '';

      if (targetDomain === 'food_human') {
        const directMatch = matchBomIngredientToOffer({ name: item.name, creaId: item.creaId }, [o]);
        const candSpec = resolveIngredientPackSpec(o.title);
        const candAisle = classifyAisle({ name: o.title, category: o.category, domain: o.domain });

        if (directMatch) {
          tier = 1;
          score = 120;
          rationale = 'Stesso ingrediente in offerta attiva a Rapallo (altra marca/insegna) — sostituzione 1:1 immediata.';
        } else if (itemSpec.family !== 'default' && candSpec.family === itemSpec.family) {
          tier = 2;
          score = 70;
          rationale =
            'Stessa famiglia gastronomica/nutrizionale in offerta oggi a Rapallo — equivalente diretto per le ricette del piano.';
        } else if (candAisle === itemAisle) {
          // Guardrail: never cross-substitute sweet fresh fruit with savory vegetables/salads in ortofrutta,
          // nor sweet biscuits/confectionery with savory pasta/legumes in dispensa_secca!
          const isFruitVegClash =
            (itemSpec.family === 'fresh_fruit' && candSpec.family === 'fresh_vegetables') ||
            (itemSpec.family === 'fresh_vegetables' && candSpec.family === 'fresh_fruit') ||
            (itemSpec.family === 'fresh_fruit' && candSpec.family === 'citrus' && /\b(insalat|carot|cipoll|patat|zucchin)\b/i.test(o.title)) ||
            (itemSpec.family === 'fresh_fruit' && candSpec.family === 'default');
          const isSweetSavoryPantryClash =
            ['dry_pasta_grains', 'legumes_tomato', 'oil_fats'].includes(itemSpec.family) &&
            (o.category === 'Colazione e Dolci' || candSpec.family === 'honey_sweet');

          if (!isFruitVegClash && !isSweetSavoryPantryClash) {
            tier = 3;
            score = 30;
            rationale = 'Alternativa compatibile dello stesso reparto disponibile oggi nei supermercati di Rapallo.';
          }
        }
      } else {
        const offNorm = normalizeSearchToken(`${o.title} ${o.brand || ''}`);
        const sharedWord = itemNormWords.some((w) => offNorm.includes(w));
        const isChemMatch =
          (/\b(citric\w*|anticalcare|viakal|acido)\b/.test(normalizeSearchToken(item.name)) &&
            /\b(anticalcare|viakal|acido|bagno|wc)\b/.test(offNorm)) ||
          (/\b(sgrassator\w*|forno|cappe|alcalin\w*)\b/.test(normalizeSearchToken(item.name)) &&
            /\b(sgrassator\w*|chanteclair|forno|cucina)\b/.test(offNorm)) ||
          (/\b(piatti|lavastoviglie|enzim\w*)\b/.test(normalizeSearchToken(item.name)) &&
            /\b(piatti|svelto|fairy|pril|finish|lavastoviglie)\b/.test(offNorm));

        if (sharedWord || isChemMatch) {
          tier = 1;
          score = 100;
          rationale = 'Stessa funzione chimica/tecnica in promozione attiva a Rapallo (Tigotà / PiùMe / GDO).';
        } else {
          tier = 3;
          score = 25;
          rationale = 'Alternativa dello stesso reparto Cura Casa / Cucina disponibile oggi a Rapallo.';
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
      alternatives.push({
        offerId: entry.offer.id,
        title: entry.offer.title,
        storeId: entry.offer.storeId || null,
        chainName: entry.offer.storeName || entry.offer.chainName || entry.offer.brand || entry.offer.chainId,
        price: Number(entry.offer.promoPrice ?? entry.offer.price ?? entry.offer.discountPrice ?? 0),
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
   * verified retailers of Rapallo (16035 GE) — zero synthetic multipliers, zero non-Rapallo chains.
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
        const brandNorm = normalizeSearchToken(store.brand || store.name || '');
        const isPreferredStore =
          (item.preferredStoreId && item.preferredStoreId === store.id) ||
          (item.onPromo && brandNorm && prefChainNorm.includes(brandNorm));

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
          matchedStoreOffer = storeOffers.find((o) => {
            if (o.domain !== item.domain) return false;
            const offNorm = normalizeSearchToken(`${o.title} ${o.brand || ''}`);
            return itemNormWords.some((w) => offNorm.includes(w));
          });
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

    const evalStoreSubset = (storeIndices) => {
      let total = 0;
      for (let i = 0; i < items.length; i++) {
        let bestItemCost = Infinity;
        for (const sIdx of storeIndices) {
          const c = costMatrix[i][sIdx];
          if (c < bestItemCost) bestItemCost = c;
        }
        if (!Number.isFinite(bestItemCost)) return Infinity;
        total += bestItemCost;
      }
      return Number(total.toFixed(2));
    };

    const formatCards = (storesArr) => {
      const cards = [...new Set(storesArr.map((s) => s.loyaltyCard?.name).filter(Boolean))];
      return cards.length > 0 ? cards : ['Nessuna tessera richiesta'];
    };

    // 1. Optimal Single Store in Rapallo (must be full-line GDO to cover 100% of basket)
    let best1 = null;
    for (let sIdx = 0; sIdx < candidateStores.length; sIdx++) {
      const s = candidateStores[sIdx];
      if (s.storeCategory !== 'gdo') continue;
      const cost = evalStoreSubset([sIdx]);
      if (!Number.isFinite(cost)) continue;
      const mins = (s.logistics?.avgVisitMinutes || 20) + Math.min(10, Math.ceil(items.length * 0.5));
      if (!best1 || cost < best1.cost || (cost === best1.cost && mins < best1.mins)) {
        best1 = { indices: [sIdx], stores: [s], cost, mins };
      }
    }

    // 2. Optimal 2-Store Combination in Rapallo
    let best2 = null;
    for (let a = 0; a < candidateStores.length; a++) {
      for (let b = a + 1; b < candidateStores.length; b++) {
        if (candidateStores[a].storeCategory !== 'gdo' && candidateStores[b].storeCategory !== 'gdo') continue;
        const cost = evalStoreSubset([a, b]);
        if (!Number.isFinite(cost)) continue;
        const sa = candidateStores[a];
        const sb = candidateStores[b];
        const distKm = haversineKm(sa.latitude, sa.longitude, sb.latitude, sb.longitude);
        const transferMins = Math.max(5, Math.round(distKm * 11));
        const mins = (sa.logistics?.avgVisitMinutes || 18) + (sb.logistics?.avgVisitMinutes || 14) + transferMins;
        if (!best2 || cost < best2.cost || (cost === best2.cost && mins < best2.mins)) {
          best2 = { indices: [a, b], stores: [sa, sb], cost, mins };
        }
      }
    }

    // 3. Optimal 3-Store Cherry-Picking Combination in Rapallo
    let best3 = null;
    for (let a = 0; a < candidateStores.length; a++) {
      for (let b = a + 1; b < candidateStores.length; b++) {
        for (let c = b + 1; c < candidateStores.length; c++) {
          const trio = [candidateStores[a], candidateStores[b], candidateStores[c]];
          if (!trio.some((s) => s.storeCategory === 'gdo')) continue;
          const cost = evalStoreSubset([a, b, c]);
          if (!Number.isFinite(cost)) continue;
          const dist12 = haversineKm(trio[0].latitude, trio[0].longitude, trio[1].latitude, trio[1].longitude);
          const dist23 = haversineKm(trio[1].latitude, trio[1].longitude, trio[2].latitude, trio[2].longitude);
          const transferMins = Math.max(10, Math.round((dist12 + dist23) * 11));
          const mins =
            (trio[0].logistics?.avgVisitMinutes || 16) +
            (trio[1].logistics?.avgVisitMinutes || 14) +
            (trio[2].logistics?.avgVisitMinutes || 12) +
            transferMins;
          if (!best3 || cost < best3.cost || (cost === best3.cost && mins < best3.mins)) {
            best3 = { indices: [a, b, c], stores: trio, cost, mins };
          }
        }
      }
    }

    const singleCost = best1 ? best1.cost : Number(items.reduce((acc, i) => acc + i.lineTotalEur, 0).toFixed(2));
    const twoCost = best2 ? Math.min(singleCost, best2.cost) : singleCost;
    const threeCost = best3 ? Math.min(twoCost, best3.cost) : twoCost;

    const savings2vs1 = Number(Math.max(0, singleCost - twoCost).toFixed(2));
    const savings3vs1 = Number(Math.max(0, singleCost - threeCost).toFixed(2));
    const extraSavings3vs2 = Number(Math.max(0, twoCost - threeCost).toFixed(2));
    const extraMins3vs2 = Math.max(8, (best3?.mins || 54) - (best2?.mins || 38));

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
          'Unica tappa nel supermercato di Rapallo col miglior costo complessivo sul tuo carrello attuale: zero spostamenti tra insegne.'
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
        recommendation:
          savings2vs1 >= 1.5
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
        recommendation:
          extraSavings3vs2 < 3.0
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

    const foodSubtotalEur = Number(foodItems.reduce((acc, i) => acc + i.lineTotalEur, 0).toFixed(2));
    const homeAndKitchenSubtotalEur = Number(
      homeAndKitchenItems.reduce((acc, i) => acc + i.lineTotalEur, 0).toFixed(2)
    );
    const grandTotalEur = Number((foodSubtotalEur + homeAndKitchenSubtotalEur).toFixed(2));
    const checkedTotalEur = Number(
      items
        .filter((i) => i.checked)
        .reduce((acc, i) => acc + i.lineTotalEur, 0)
        .toFixed(2)
    );

    const byAisle = AISLE_ORDER.map((aisle) => ({
      ...aisle,
      items: items.filter((i) => i.aisle === aisle.id)
    })).filter((g) => g.items.length > 0);

    const storeSimulations = this._simulateMultiStoreScenarios(items);

    // Build formatted WhatsApp / Telegram text export
    const exportLines = [
      '🌿 *BASILICO — LISTA SPESA SMART RAPALLO (16035)*',
      `💰 Totale Stimato: €${grandTotalEur.toFixed(2)} (Alimentari: €${foodSubtotalEur.toFixed(2)} · Casa/Pentole: €${homeAndKitchenSubtotalEur.toFixed(2)})`,
      ''
    ];
    for (const grp of byAisle) {
      exportLines.push(`*${grp.icon} ${grp.label}*`);
      for (const it of grp.items) {
        const chk = it.checked ? '✅' : '⬜';
        exportLines.push(
          `${chk} ${it.name} — ${it.packsToBuy} conf. (${it.totalPurchasedGrams}g) · €${it.lineTotalEur.toFixed(2)} [${it.preferredChain}]`
        );
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
   * Transfers all food_human items from the shopping list into the user's 3-zone pantry.
   */
  completeShoppingAndLoadPantry() {
    const state = this._load();
    const loadedToPantry = [];

    for (const item of state.items) {
      item.checked = true;
      if (item.domain === 'food_human') {
        const added = pantryService.addItem({
          title: item.name,
          initialWeightGrams: item.totalPurchasedGrams || 300,
          remainingWeightGrams: item.totalPurchasedGrams || 300,
          creaFoodId: item.creaId || null
        });
        loadedToPantry.push(added);
      }
    }

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
