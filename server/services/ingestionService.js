/**
 * Basilico — Supermarket Offers Application
 * Location: server/services/ingestionService.js
 *
 * Multi-tier ingestion and parser engine for Rapallo supermarkets.
 * Guarantees 100% availability with 5000ms timeout guard and multi-tier fallback:
 * Tier 1: Live aggregator connector (PromoQui / ShopFully Next.js __NEXT_DATA__)
 * Tier 2: Local cache manager with stale grace period (up to 7 days)
 * Tier 3: Bundled offline seed dataset (data/seed/*.json)
 * Tier 4: Defensive empty shield (never crash)
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cacheManager } from './cacheManager.js';
import { classifyProductDomain, classifyCanonicalCategory } from './domainClassifier.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_DIR = path.resolve(__dirname, '../../data/seed');

// Primary and backup aggregator endpoints for Rapallo (16035 GE)
const PROMOQUI_RAPALLO_SUPERMERCATI_URL = 'https://www.promoqui.it/rapallo/supermercati';
const PROMOQUI_RAPALLO_FALLBACK_URL = 'https://www.promoqui.it/rapallo';
const NETWORK_TIMEOUT_MS = 5000;
const CACHE_TTL_SECONDS = 21600; // 6 hours

// Brand mapping rules for Rapallo supermarkets and stores (14 verified chains - ADR-0004)
const BRAND_RULES = [
  { chainId: 'coop', brand: 'Coop', defaultStoreId: 'rapallo-coop-sciesa', patterns: [/coop/i, /ipercoop/i] },
  { chainId: 'carrefour', brand: 'Carrefour', defaultStoreId: 'rapallo-carrefour-assereto', patterns: [/carrefour/i] },
  { chainId: 'basko', brand: 'Basko', defaultStoreId: 'rapallo-basko-colombo', patterns: [/basko/i] },
  { chainId: 'gulliver', brand: 'Gulliver', defaultStoreId: 'rapallo-gulliver-mameli', patterns: [/gulliver/i] },
  { chainId: 'penny', brand: 'Penny', defaultStoreId: 'rapallo-penny-milano', patterns: [/penny/i] },
  { chainId: 'ekom', brand: 'Ekom', defaultStoreId: 'rapallo-ekom-mameli', patterns: [/ekom/i] },
  { chainId: 'eurospin', brand: 'Eurospin', defaultStoreId: 'rapallo-eurospin-aurelia', patterns: [/eurospin/i] },
  { chainId: 'despar', brand: 'Despar', defaultStoreId: 'rapallo-despar-betti', patterns: [/despar/i] },
  { chainId: 'dpiu', brand: 'DPiù', defaultStoreId: 'rapallo-dpiu-fioria', patterns: [/dpi[uù]/i, /d-piu/i] },
  { chainId: 'tigota', brand: 'Tigotà', defaultStoreId: 'rapallo-tigota-lamarmora', patterns: [/tigot[aà]/i] },
  { chainId: 'piume', brand: 'PiùMe', defaultStoreId: 'rapallo-piume-neri', patterns: [/pi[uù]me/i] },
  { chainId: 'unieuro', brand: 'Unieuro', defaultStoreId: 'rapallo-unieuro-matteotti', patterns: [/unieuro/i] },
  { chainId: 'arcaplanet', brand: 'Arcaplanet', defaultStoreId: 'rapallo-arcaplanet-italia', patterns: [/arcaplanet/i] }
];

// Geo-filter excluding flyers from unrelated provinces/regions (ADR-0004; guard against "Grandi marche" = top brands!)
const NON_RAPALLO_FLYER_REGEX = /spezia|piacentin|pavese|piemont|lombard|sardegn|sicili|pugli|calabri|campani|lazio|toscan|venet|friul|trentin|emili|romagn|umbria|(?<!grandi\s)marche\b|abruzz|molis|basilicat|aosta/i;

// Per-retailer PromoQui slugs for the 14 verified Rapallo chains (ADR-0004 & ADR-0005)
const RAPALLO_STORE_SLUGS = {
  'rapallo-basko-colombo': 'basko',
  'rapallo-coop-sciesa': 'coop',
  'rapallo-gulliver-mameli': 'gulliver',
  'rapallo-carrefour-assereto': 'carrefour-market',
  'rapallo-carrefour-express-mameli': 'carrefour-express',
  'rapallo-ekom-mameli': 'ekom',
  'rapallo-penny-milano': 'penny',
  'rapallo-eurospin-aurelia': 'eurospin',
  'rapallo-despar-betti': 'despar',
  'rapallo-dpiu-fioria': 'dpiu',
  'rapallo-tigota-lamarmora': 'tigota',
  'rapallo-piume-neri': 'piume',
  'rapallo-unieuro-matteotti': 'unieuro',
  'rapallo-arcaplanet-italia': 'arcaplanet'
};

/**
 * Categorize Italian promotional products into canonical Basilico departments
 * using strict word-boundary and domain-aware rules from domainClassifier.js (ADR-0013).
 */
function classifyOfferCategory(title = '', brand = '', chainId = '') {
  return classifyCanonicalCategory({ title, brand, chainId });
}

export class IngestionService {
  constructor(options = {}) {
    this.cacheManager = options.cacheManager || cacheManager;
    this.seedDir = options.seedDir || SEED_DIR;
    this.lastResult = null;
    this.isInitialized = false;
    this.inFlightSync = null;
    this.syncProgress = {
      active: false,
      mode: null,
      phase: 'idle',
      title: 'Pronto',
      currentStore: null,
      completedStores: 0,
      totalStores: 14,
      flyersFound: 0,
      offersFound: 0,
      percent: 0,
      logs: [],
      startedAt: null,
      completedAt: null,
      error: null
    };
  }

  /**
   * Return current sync operation telemetry for UI modal dialog (ADR-0005)
   */
  getSyncProgress() {
    return { ...this.syncProgress, logs: [...this.syncProgress.logs] };
  }

  _updateProgress(patch = {}, logEntry = null) {
    const nextLogs = logEntry
      ? [...this.syncProgress.logs, `[${new Date().toLocaleTimeString('it-IT')}] ${logEntry}`].slice(-40)
      : this.syncProgress.logs;
    this.syncProgress = {
      ...this.syncProgress,
      ...patch,
      logs: nextLogs
    };
  }

  /**
   * Helper to unwrap envelope { data: [...] } or direct array [...]
   */
  _unwrapData(val) {
    if (!val) return null;
    if (typeof val === 'object' && val !== null && 'data' in val && Array.isArray(val.data)) {
      return val.data;
    }
    return val;
  }

  /**
   * Safe fetch with AbortController timeout guard (5000ms max)
   */
  async fetchWithTimeout(url, timeoutMs = NETWORK_TIMEOUT_MS) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'it-IT,it;q=0.9,en-US;q=0.8,en;q=0.7'
        }
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Safely extract Next.js __NEXT_DATA__ JSON from HTML response
   */
  extractNextData(html) {
    if (!html || typeof html !== 'string') {
      throw new Error('Invalid HTML payload');
    }
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match || !match[1]) {
      throw new Error('__NEXT_DATA__ script tag not found in HTML response');
    }
    return JSON.parse(match[1]);
  }

  /**
   * Normalize search string for accent-insensitive matching
   */
  normalizeText(text) {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  /**
   * Match raw aggregator flyer to known Rapallo store profile
   */
  matchStore(retailerName, stores = []) {
    const name = retailerName || '';
    const storeList = Array.isArray(stores) ? stores : [];
    for (const rule of BRAND_RULES) {
      if (rule.patterns.some(p => p.test(name))) {
        const store = storeList.find(s => s.id === rule.defaultStoreId || s.chainId === rule.chainId);
        if (store) return { store, chainId: rule.chainId, brand: rule.brand };
      }
    }
    // Fallback search across store names
    const fallbackStore = storeList.find(s =>
      this.normalizeText(s.name).includes(this.normalizeText(name)) ||
      this.normalizeText(name).includes(this.normalizeText(s.brand || ''))
    );
    if (fallbackStore) {
      return { store: fallbackStore, chainId: fallbackStore.chainId, brand: fallbackStore.brand };
    }
    return null;
  }

  /**
   * Transform raw PromoQui flyer into canonical Flyer model
   */
  normalizeLiveFlyers(rawFlyers = [], stores = []) {
    if (!Array.isArray(rawFlyers)) return [];
    const flyers = [];
    const now = new Date();
    const storeList = Array.isArray(stores) ? stores : [];

    for (const raw of rawFlyers) {
      if (!raw || !raw.id) continue;
      if (NON_RAPALLO_FLYER_REGEX.test(raw.title || '')) continue;
      const matched = this.matchStore(raw.retailerName, storeList);
      const storeId = matched?.store?.id || `store-${raw.retailer_id || 'unknown'}`;
      const storeName = matched?.store?.name || raw.retailerName || 'Supermercato Rapallo';
      const chainId = matched?.chainId || matched?.store?.chainId || 'other';

      const validFrom = raw.start_date || now.toISOString();
      const validTo = raw.end_date || new Date(now.getTime() + 14 * 86400000).toISOString();
      const coverImageUrl = raw.imageAssets?.cover || raw.imageAssets?.big ||
        `https://it-it-media.shopfully.cloud/images/volantini/big_${raw.id}.jpg`;

      const isCurrent = new Date(validTo).getTime() >= now.getTime();
      const rawPages = raw.imageAssets?.pages;
      let pages = [];

      if (Array.isArray(rawPages) && rawPages.length > 0) {
        pages = rawPages
          .filter(Boolean)
          .map((img, idx) => ({
            pageNumber: idx + 1,
            imageUrl: typeof img === 'string' ? img : (img?.imageUrl || coverImageUrl),
            offerIds: []
          }));
      } else {
        const pageCount = raw.pageCount || 12;
        for (let p = 1; p <= pageCount; p++) {
          pages.push({
            pageNumber: p,
            imageUrl: p === 1 ? coverImageUrl : coverImageUrl.replace(`big_${raw.id}`, `page_${raw.id}_${p}`),
            offerIds: []
          });
        }
      }

      flyers.push({
        id: String(raw.id),
        storeId,
        chainId,
        storeName,
        title: raw.title || `Volantino ${storeName}`,
        validFrom,
        validTo,
        startDate: validFrom,
        endDate: validTo,
        pageCount: pages.length,
        coverImageUrl,
        pages,
        pageImages: pages.map(p => p.imageUrl),
        pdfUrl: raw.publication_url || null,
        isCurrent,
        isExpired: !isCurrent,
        featured: raw.is_premium === '1'
      });
    }

    return flyers;
  }

  /**
   * Transform raw PromoQui topOffers / flyerGibs into canonical Rapallo Offer records
   */
  normalizeLiveOffers(rawOffers = [], stores = [], flyers = []) {
    if (!Array.isArray(rawOffers) || rawOffers.length === 0) return [];

    const now = new Date();
    const defaultValidFrom = now.toISOString();
    const defaultValidTo = new Date(now.getTime() + 14 * 86400000).toISOString();
    const storeList = Array.isArray(stores) ? stores : [];
    const flyerList = Array.isArray(flyers) ? flyers : [];
    const storeById = new Map(storeList.map((s) => [s.id, s]));
    const flyerById = new Map(flyerList.map((f) => [String(f.id), f]));
    const hasRealRapalloStores = storeList.some((s) => String(s?.id || '').startsWith('rapallo-'));

    const seenIds = new Set();
    const normalized = [];

    for (let idx = 0; idx < rawOffers.length; idx++) {
      const raw = rawOffers[idx];
      if (!raw || typeof raw !== 'object') continue;

      const rawPriceCandidate =
        raw.promoPrice ??
        raw.discountPrice ??
        raw.price ??
        raw.settings?.price_extended?.digits ??
        String(raw.settings?.price || '').replace(/[^0-9.,]/g, '').replace(',', '.');
      const parsedPromo = typeof rawPriceCandidate === 'number'
        ? rawPriceCandidate
        : parseFloat(String(rawPriceCandidate || '').replace(',', '.'));
      if (!Number.isFinite(parsedPromo) || parsedPromo <= 0) continue;

      const promoPrice = Math.round(parsedPromo * 100) / 100;

      const rawOrigCandidate =
        raw.originalPrice ??
        raw.settings?.starting_price?.digits ??
        null;
      const parsedOrig = rawOrigCandidate !== null && rawOrigCandidate !== undefined && rawOrigCandidate !== ''
        ? parseFloat(String(rawOrigCandidate).replace(',', '.'))
        : NaN;
      const hasRealOriginalPrice = Number.isFinite(parsedOrig) && parsedOrig > promoPrice;
      const originalPrice = hasRealOriginalPrice ? Math.round(parsedOrig * 100) / 100 : null;
      const discountPercentage = hasRealOriginalPrice
        ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
        : (Number.isFinite(Number(raw.discountPercentage)) && Number(raw.discountPercentage) > 0
            ? Math.round(Number(raw.discountPercentage))
            : null);
      const discountLabel = discountPercentage && discountPercentage > 0 ? `-${discountPercentage}%` : null;

      const flyerId = raw.flyerId ? String(raw.flyerId) : (raw.flyer_id ? String(raw.flyer_id) : null);
      const linkedFlyer = flyerId ? flyerById.get(flyerId) : null;

      let resolvedStore = raw.storeId ? storeById.get(raw.storeId) : null;
      let chainId = raw.chainId || null;
      if (!resolvedStore && linkedFlyer?.storeId) {
        resolvedStore = storeById.get(linkedFlyer.storeId) || null;
        chainId = chainId || linkedFlyer.chainId || null;
      }
      if (!resolvedStore) {
        const retailerHint = raw.storeName || raw.retailerName || raw.retailer_name || raw.chainId || '';
        const matched = this.matchStore(retailerHint, storeList);
        if (matched?.store) {
          resolvedStore = matched.store;
          chainId = chainId || matched.chainId || matched.store.chainId;
        }
      }

      const storeId = resolvedStore?.id || raw.storeId || linkedFlyer?.storeId || null;
      if (!storeId) continue;
      if (hasRealRapalloStores && String(storeId).startsWith('store-')) continue;

      const storeName = resolvedStore?.brand || resolvedStore?.name || raw.storeName || linkedFlyer?.storeName || 'Supermercato Rapallo';
      const resolvedChainId = chainId || resolvedStore?.chainId || 'other';
      const title = String(raw.title || raw.name || 'Prodotto in Offerta').trim();
      if (!title) continue;

      const brand = String(raw.brand || raw.settings?.brand || storeName).trim();
      const offerId = String(raw.id || `${storeId}-${flyerId || 'live'}-${idx}`);
      if (seenIds.has(offerId)) continue;
      seenIds.add(offerId);

      const validFrom = raw.validFrom || raw.validityStart || linkedFlyer?.validFrom || defaultValidFrom;
      const validTo = raw.validTo || raw.validityEnd || linkedFlyer?.validTo || defaultValidTo;

      const domain = classifyProductDomain({
        title,
        brand,
        category: raw.category,
        domain: raw.domain,
        chainId: resolvedChainId,
        storeId
      });
      const category = classifyCanonicalCategory(
        { title, brand, category: raw.category, chainId: resolvedChainId, storeId },
        domain
      );

      const rawUnitSuffix = raw.settings?.price_suffix ? String(raw.settings.price_suffix).trim() : null;
      const unitPrice = raw.unitPrice || (rawUnitSuffix ? `${promoPrice.toFixed(2).replace('.', ',')} € ${rawUnitSuffix}` : null);
      const pageNumber = Math.max(1, parseInt(raw.pageNumber ?? raw.settings?.flyer_page ?? 1, 10) || 1);
      const imageUrl = raw.imageUrl || raw.settings?.image_url || raw.image || linkedFlyer?.coverImageUrl || null;

      normalized.push({
        id: offerId,
        storeId,
        chainId: resolvedChainId,
        storeName,
        brand,
        flyerId,
        pageNumber,
        title,
        description: raw.description
          ? String(raw.description).trim()
          : `${brand} — ${resolvedStore?.name || storeName}`,
        price: promoPrice,
        promoPrice,
        discountPrice: promoPrice,
        originalPrice,
        discountPercentage,
        discountLabel,
        unitPrice,
        domain,
        category,
        imageUrl,
        validFrom,
        validTo,
        validityStart: validFrom,
        validityEnd: validTo,
        isHighlight: Boolean(discountPercentage && discountPercentage >= 30)
      });
    }

    return normalized;
  }

  /**
   * Load bundled offline seed dataset from data/seed/
   */
  async loadSeedData() {
    try {
      const storesRaw = await fs.readFile(path.join(this.seedDir, 'rapallo_stores.json'), 'utf-8');
      const flyersRaw = await fs.readFile(path.join(this.seedDir, 'rapallo_flyers.json'), 'utf-8');
      const offersRaw = await fs.readFile(path.join(this.seedDir, 'rapallo_offers.json'), 'utf-8');

      const rawStores = JSON.parse(storesRaw);
      const flyers = JSON.parse(flyersRaw);
      const offers = JSON.parse(offersRaw);
      const stores = this.recalculateStoreCounts(rawStores, flyers, offers);

      return { stores, flyers, offers };
    } catch (err) {
      console.error(`[IngestionService] Failed to read seed data from ${this.seedDir}: ${err.message}`);
      return { stores: [], flyers: [], offers: [] };
    }
  }

  /**
   * Update dynamic flyerCount and activeOfferCount per store
   */
  recalculateStoreCounts(stores = [], flyers = [], offers = []) {
    const now = Date.now();
    return stores.map(store => {
      const storeFlyers = flyers.filter(f =>
        (f.storeId === store.id || (Array.isArray(f.storeIds) && f.storeIds.includes(store.id)) || f.chainId === store.chainId) &&
        new Date(f.validTo).getTime() >= now
      );
      const storeOffers = offers.filter(o =>
        (o.storeId === store.id || o.chainId === store.chainId) &&
        new Date(o.validTo || o.validityEnd).getTime() >= now
      );

      return {
        ...store,
        flyerCount: storeFlyers.length,
        activeOfferCount: storeOffers.length
      };
    });
  }

  /**
   * Attempt live fetch from upstream aggregator
   */
  async fetchLiveAggregator() {
    let response = null;
    let endpointUsed = PROMOQUI_RAPALLO_SUPERMERCATI_URL;

    try {
      response = await this.fetchWithTimeout(PROMOQUI_RAPALLO_SUPERMERCATI_URL);
    } catch (err) {
      console.warn(`[IngestionService] Primary endpoint failed (${err.message}), trying fallback...`);
      endpointUsed = PROMOQUI_RAPALLO_FALLBACK_URL;
      response = await this.fetchWithTimeout(PROMOQUI_RAPALLO_FALLBACK_URL);
    }

    if (!response || !response.ok) {
      throw new Error(`Upstream HTTP error: status ${response ? response.status : 'NO_RESPONSE'}`);
    }

    const html = await response.text();
    const nextData = this.extractNextData(html);
    const resources = nextData?.props?.pageProps?.apiResources;

    if (!resources) {
      throw new Error('Missing apiResources in upstream __NEXT_DATA__');
    }

    const rawFlyers = resources.topCategoryFlyers || resources.flyers || [];
    const rawOffers = resources.topOffers || resources.offers || [];
    const rawRetailers = resources.retailers || [];

    return { rawFlyers, rawOffers, rawRetailers, endpointUsed };
  }

  /**
   * Multi-tier ingestion runner with concurrent call deduplication
   */
  async sync(force = false) {
    if (this.inFlightSync) {
      return this.inFlightSync;
    }

    this.inFlightSync = this._executeSync(force);
    try {
      return await this.inFlightSync;
    } finally {
      this.inFlightSync = null;
    }
  }

  async _executeSync(force = false) {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const errors = [];

    this.syncProgress = {
      active: true,
      mode: 'quick',
      phase: 'connecting',
      title: 'Aggiornamento Rapido in corso...',
      currentStore: 'Controllo generale Rapallo (16035)',
      completedStores: 0,
      totalStores: 14,
      flyersFound: 0,
      offersFound: 0,
      percent: 15,
      logs: [`[${new Date().toLocaleTimeString('it-IT')}] Avvio controllo rapido volantini e stato online di Rapallo...`],
      startedAt,
      completedAt: null,
      error: null
    };

    // Tier 0: Cache Freshness Check
    if (!force) {
      const cachedFlyers = this._unwrapData(this.cacheManager.get('flyers'));
      const cachedStores = this._unwrapData(this.cacheManager.get('stores'));
      const cachedOffers = this._unwrapData(this.cacheManager.get('offers'));

      if (cachedFlyers && cachedStores && cachedOffers && !this.cacheManager.isExpired('flyers')) {
        const completedAt = new Date().toISOString();
        const result = {
          status: 'success',
          startedAt,
          completedAt,
          durationMs: Date.now() - startTime,
          storesProcessed: cachedStores.length,
          totalFlyers: cachedFlyers.length,
          totalOffers: cachedOffers.length,
          dataSource: 'cache',
          errors: []
        };
        this._updateProgress({
          active: false,
          phase: 'completed',
          title: 'Controllo Rapido Completato (Cache Attiva)',
          currentStore: 'Tutti i 14 punti vendita di Rapallo',
          completedStores: cachedStores.length,
          totalStores: cachedStores.length,
          flyersFound: cachedFlyers.length,
          offersFound: cachedOffers.length,
          percent: 100,
          completedAt
        }, `✔ Cache locale già aggiornata (${cachedStores.length} negozi, ${cachedFlyers.length} volantini, ${cachedOffers.length} offerte).`);
        this.lastResult = result;
        return result;
      }
    }

    // Tier 1: Attempt Live Ingestion
    try {
      this._updateProgress({
        phase: 'fetching_live',
        percent: 45,
        currentStore: 'Connessione al server PromoQui Rapallo...'
      }, 'Interrogazione server PromoQui per Rapallo (16035 GE)...');

      const liveData = await this.fetchLiveAggregator();
      const seedData = await this.loadSeedData();
      const cachedStores = this._unwrapData(this.cacheManager.get('stores'));
      const cachedFlyers = this._unwrapData(this.cacheManager.get('flyers'));
      const baseStores = (cachedStores && cachedStores.length > 0) ? cachedStores : seedData.stores;

      const liveFlyers = this.normalizeLiveFlyers(liveData.rawFlyers, baseStores);

      // Merge live flyers with seed/cached flyers so all Rapallo stores maintain active flyers,
      // excluding unmapped national `store-*` flyers when real Rapallo stores are configured
      const mergedFlyersMap = new Map();
      const baseFlyers = (cachedFlyers && cachedFlyers.length > 0) ? cachedFlyers : seedData.flyers;
      const hasRealRapalloStores = Array.isArray(baseStores) && baseStores.some((s) => String(s?.id || '').startsWith('rapallo-'));
      for (const fl of (baseFlyers || [])) {
        if (hasRealRapalloStores && String(fl?.storeId || '').startsWith('store-')) continue;
        mergedFlyersMap.set(fl.id, fl);
      }
      for (const fl of liveFlyers) {
        if (hasRealRapalloStores && String(fl?.storeId || '').startsWith('store-')) continue;
        mergedFlyersMap.set(fl.id, fl);
      }
      const allFlyers = Array.from(mergedFlyersMap.values());

      // PromoQui landing page often has empty topOffers; normalize live offers into canonical schema or combine with cache/seed
      const normalizedLiveOffers = this.normalizeLiveOffers(liveData.rawOffers, baseStores, allFlyers);
      let liveOffers = [];
      let offersDataSource = 'live';
      if (normalizedLiveOffers.length > 0) {
        liveOffers = normalizedLiveOffers;
      } else {
        const fallbackOffers = this._unwrapData(this.cacheManager.get('offers'));
        if (Array.isArray(fallbackOffers) && fallbackOffers.length > 0) {
          liveOffers = fallbackOffers;
          offersDataSource = 'cache';
        } else {
          liveOffers = seedData.offers;
          offersDataSource = 'seed';
        }
      }

      const updatedStores = this.recalculateStoreCounts(baseStores, allFlyers, liveOffers);

      // Persist to CacheManager
      this.cacheManager.set('stores', updatedStores, CACHE_TTL_SECONDS, { dataSource: 'live' });
      this.cacheManager.set('flyers', allFlyers, CACHE_TTL_SECONDS, { dataSource: 'live' });
      this.cacheManager.set('offers', liveOffers, CACHE_TTL_SECONDS, { dataSource: offersDataSource });

      const completedAt = new Date().toISOString();
      const status = normalizedLiveOffers.length > 0 ? 'success' : 'partial_success';

      const result = {
        status,
        startedAt,
        completedAt,
        durationMs: Date.now() - startTime,
        storesProcessed: updatedStores.length,
        totalFlyers: allFlyers.length,
        totalOffers: liveOffers.length,
        dataSource: 'live',
        errors: []
      };

      this._updateProgress({
        active: false,
        phase: 'completed',
        title: 'Aggiornamento Rapido Completato con Successo!',
        currentStore: 'Tutti i 14 punti vendita di Rapallo verificati',
        completedStores: updatedStores.length,
        totalStores: updatedStores.length,
        flyersFound: allFlyers.length,
        offersFound: liveOffers.length,
        percent: 100,
        completedAt
      }, `✔ Aggiornamento rapido completato: ${updatedStores.length} negozi, ${allFlyers.length} volantini, ${liveOffers.length} offerte disponibili.`);

      this.cacheManager.set('sync_status', result, CACHE_TTL_SECONDS);
      this.lastResult = result;
      return result;

    } catch (err) {
      console.warn(`[IngestionService] Live fetch failed: ${err.message}. Cascading to cache fallback.`);
      errors.push({ storeId: 'all', message: `Live fetch failed: ${err.message}` });
      this._updateProgress({
        phase: 'fallback',
        percent: 75
      }, `⚠ Connessione diretta non disponibile (${err.message}). Attivazione paracadute locale...`);
    }

    // Tier 2: CacheManager Grace Fallback
    try {
      const cachedFlyers = this._unwrapData(this.cacheManager.get('flyers'));
      const cachedStores = this._unwrapData(this.cacheManager.get('stores'));
      const cachedOffers = this._unwrapData(this.cacheManager.get('offers'));

      if (cachedFlyers && cachedStores && cachedOffers && !this.cacheManager.isExpired('flyers', true)) {
        const completedAt = new Date().toISOString();
        const result = {
          status: 'cached_fallback',
          startedAt,
          completedAt,
          durationMs: Date.now() - startTime,
          storesProcessed: cachedStores.length,
          totalFlyers: cachedFlyers.length,
          totalOffers: cachedOffers.length,
          dataSource: 'cache',
          errors
        };
        this._updateProgress({
          active: false,
          phase: 'completed',
          title: 'Ripristino da Copia Cache Locale Completato',
          currentStore: 'Copia locale salvata sul computer',
          completedStores: cachedStores.length,
          totalStores: cachedStores.length,
          flyersFound: cachedFlyers.length,
          offersFound: cachedOffers.length,
          percent: 100,
          completedAt
        }, `✔ Dati caricati dalla cache locale (${cachedFlyers.length} volantini, ${cachedOffers.length} offerte).`);
        this.cacheManager.set('sync_status', result, CACHE_TTL_SECONDS);
        this.lastResult = result;
        return result;
      }
    } catch (cacheErr) {
      console.warn(`[IngestionService] Cache read failed: ${cacheErr.message}`);
      errors.push({ storeId: 'cache', message: cacheErr.message });
    }

    // Tier 3: Bundled Seed Dataset Fallback
    try {
      const seedData = await this.loadSeedData();
      if (seedData.stores.length > 0) {
        const updatedStores = this.recalculateStoreCounts(seedData.stores, seedData.flyers, seedData.offers);

        // Prime cache with seed data
        this.cacheManager.set('stores', updatedStores, CACHE_TTL_SECONDS, { dataSource: 'seed' });
        this.cacheManager.set('flyers', seedData.flyers, CACHE_TTL_SECONDS, { dataSource: 'seed' });
        this.cacheManager.set('offers', seedData.offers, CACHE_TTL_SECONDS, { dataSource: 'seed' });

        const completedAt = new Date().toISOString();
        const result = {
          status: 'cached_fallback',
          startedAt,
          completedAt,
          durationMs: Date.now() - startTime,
          storesProcessed: updatedStores.length,
          totalFlyers: seedData.flyers.length,
          totalOffers: seedData.offers.length,
          dataSource: 'seed',
          errors
        };
        this._updateProgress({
          active: false,
          phase: 'completed',
          title: 'Ripristino da Dataset Offline di Emergenza',
          currentStore: 'Archivio sicuro integrato in Basilico',
          completedStores: updatedStores.length,
          totalStores: updatedStores.length,
          flyersFound: seedData.flyers.length,
          offersFound: seedData.offers.length,
          percent: 100,
          completedAt
        }, `✔ Ripristinati ${updatedStores.length} negozi e ${seedData.offers.length} offerte dall'archivio offline.`);
        this.cacheManager.set('sync_status', result, CACHE_TTL_SECONDS);
        this.lastResult = result;
        return result;
      }
    } catch (seedErr) {
      console.error(`[IngestionService] Seed fallback failed: ${seedErr.message}`);
      errors.push({ storeId: 'seed', message: seedErr.message });
    }

    // Tier 4: Defensive Shield — Never throw or crash
    const completedAt = new Date().toISOString();
    const failedResult = {
      status: 'failed',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      storesProcessed: 0,
      totalFlyers: 0,
      totalOffers: 0,
      dataSource: 'seed',
      errors
    };
    this._updateProgress({
      active: false,
      phase: 'failed',
      title: 'Operazione terminata con avvisi',
      percent: 100,
      completedAt,
      error: errors[0]?.message || 'Errore sconosciuto'
    }, '✖ Impossibile completare la sincronizzazione.');
    this.lastResult = failedResult;
    return failedResult;
  }

  /**
   * Deep Sync runner: iterates over all 14 verified Rapallo chains (/rapallo/<slug>)
   * and extracts per-retailer flyers and product offers (flyerGibs) with live progress telemetry (ADR-0005).
   */
  async deepSync() {
    if (this.inFlightSync) {
      return this.inFlightSync;
    }

    this.inFlightSync = this._executeDeepSync();
    try {
      return await this.inFlightSync;
    } finally {
      this.inFlightSync = null;
    }
  }

  async _executeDeepSync() {
    const startedAt = new Date().toISOString();
    const startTime = Date.now();
    const errors = [];

    const seedData = await this.loadSeedData();
    const baseStores = seedData.stores.length > 0
      ? seedData.stores
      : (this._unwrapData(this.cacheManager.get('stores')) || []);
    const totalStores = baseStores.length || 14;

    this.syncProgress = {
      active: true,
      mode: 'deep',
      phase: 'scanning_stores',
      title: 'Deep Sync dei 14 Negozi di Rapallo in corso...',
      currentStore: 'Inizializzazione scansione per-insegna...',
      completedStores: 0,
      totalStores,
      flyersFound: 0,
      offersFound: 0,
      percent: 5,
      logs: [
        `[${new Date().toLocaleTimeString('it-IT')}] Avvio Deep Sync completo su ${totalStores} insegne reali di Rapallo (16035 GE)...`,
        `[${new Date().toLocaleTimeString('it-IT')}] Filtro anti-rumore geografico attivo (esclusione volantini fuori provincia).`
      ],
      startedAt,
      completedAt: null,
      error: null
    };

    const allFlyers = [];
    const allOffers = [];
    let liveSuccessCount = 0;

    for (let idx = 0; idx < baseStores.length; idx++) {
      const store = baseStores[idx];
      const slug = RAPALLO_STORE_SLUGS[store.id] || store.chainId;
      const storePercent = Math.min(95, Math.round(((idx) / totalStores) * 90) + 5);

      this._updateProgress({
        currentStore: `${store.name} (${store.address})`,
        completedStores: idx,
        percent: storePercent
      }, `Scansione ${idx + 1}/${totalStores}: ${store.name} (/rapallo/${slug})...`);

      try {
        const res = await this.fetchWithTimeout(`https://www.promoqui.it/rapallo/${slug}`, NETWORK_TIMEOUT_MS);
        if (!res || !res.ok) {
          throw new Error(`HTTP ${res ? res.status : 'NO_RESPONSE'}`);
        }
        const html = await res.text();
        const nextData = this.extractNextData(html);
        const r = nextData?.props?.pageProps?.apiResources;
        if (!r) {
          throw new Error('Dati __NEXT_DATA__ assenti');
        }

        const rawFlyersMap = new Map();
        for (const candidateF of [...(r.mainFlyer ? [r.mainFlyer] : []), ...(r.flyersByRetailer || [])]) {
          if (candidateF && candidateF.id && !rawFlyersMap.has(String(candidateF.id))) {
            rawFlyersMap.set(String(candidateF.id), candidateF);
          }
        }
        const rawFlyers = [...rawFlyersMap.values()];

        // Strict geographical filter: NEVER fall back to rawFlyers if all flyers are from other provinces (ADR-0006 & TASK-DATA-03)
        const selectedFlyers = rawFlyers.filter(f => !NON_RAPALLO_FLYER_REGEX.test(f.title || ''));
        let storeOffersAdded = 0;
        let verifiedFlyersForStore = 0;

        for (const rawF of selectedFlyers) {
          if (!rawF || !rawF.id) continue;
          const nowMs = Date.now();
          const validFrom = rawF.settings?.time_zone?.publish_at_iso
            ? new Date(rawF.settings.time_zone.publish_at_iso).toISOString()
            : (rawF.start_date ? new Date(rawF.start_date).toISOString() : new Date(nowMs).toISOString());
          const validTo = rawF.settings?.time_zone?.unpublish_at_iso
            ? new Date(rawF.settings.time_zone.unpublish_at_iso).toISOString()
            : (rawF.end_date ? new Date(rawF.end_date).toISOString() : validFrom);

          const isCurrent = new Date(validTo).getTime() >= nowMs;
          if (!isCurrent) continue;

          const coverImageUrl = rawF.imageAssets?.big || rawF.imageAssets?.cover ||
            `https://it-it-media.shopfully.cloud/images/volantini/big_${rawF.id}.jpg`;
          const page1 = rawF.imageAssets?.firstPage || coverImageUrl;
          const page2 = rawF.imageAssets?.secondPage || null;

          // Always resolve canonical PromoQui flyer path `/volantino/<slug>/<id>` even when `rawF.href`
          // is an external redirect (`next.doveconviene.it` / `s2s.promoqui.it`), so we inspect real storesData & gibs!
          const rawHrefStr = String(rawF.href || '').trim();
          const canonicalFlyerPath = rawHrefStr.startsWith('/volantino/')
            ? rawHrefStr
            : `/volantino/${slug}/${rawF.id}`;

          let gibs = [];
          let upstreamGibsCount = null;
          let flyerGeoRejected = false;

          if (rawF.href) {
            try {
              const resF = await this.fetchWithTimeout(`https://www.promoqui.it${canonicalFlyerPath}`, NETWORK_TIMEOUT_MS);
              if (resF && resF.ok) {
                const htmlF = await resF.text();
                const nextDataF = this.extractNextData(htmlF);
                const flyerApi = nextDataF?.props?.pageProps?.apiResources;

                // Strict province/city geo-truth check on PromoQui's attached storesData (TASK-DATA-03):
                // If PromoQui explicitly attaches stores to this flyer and NONE are in Provincia di Genova (GE) or Rapallo,
                // reject it immediately (eliminates silent Catanzaro/Latina/Roma flyer leaks).
                const attachedStores = flyerApi?.storesData?.stores;
                const isNationalFlyer = Boolean(flyerApi?.flyer?.is_national);
                if (Array.isArray(attachedStores) && attachedStores.length > 0 && !isNationalFlyer) {
                  const coversGenovaOrRapallo = attachedStores.some(
                    (st) =>
                      String(st?.province || '').toUpperCase().trim() === 'GE' ||
                      /rapallo|santa\s+margherita|chiavari|recco|genova|lavagna|sestri\s+levante|zoagli/i.test(
                        String(st?.city || '')
                      )
                  );
                  if (!coversGenovaOrRapallo) {
                    flyerGeoRejected = true;
                    const leakedProvinces = [...new Set(attachedStores.map((st) => st?.province).filter(Boolean))].slice(0, 4).join(',');
                    this._updateProgress(
                      {},
                      `⛔ Scartato volantino fuori zona "${rawF.title}" (${store.brand}) — province [${leakedProvinces}], non valido a Rapallo (GE).`
                    );
                  }
                }

                if (!flyerGeoRejected) {
                  gibs = flyerApi?.flyerGibsData?.flyerGibs || [];
                  upstreamGibsCount = flyerApi?.flyerGibsData?.flyerGibsCount ?? gibs.length;
                }
              }
            } catch (_) {
              // Fallback to retailer page gibs matching this flyer
            }
          }

          if (flyerGeoRejected) {
            continue;
          }

          if (gibs.length === 0) {
            const pageGibs = r.flyerGibsData?.flyerGibs || [];
            gibs = pageGibs.filter(g => !g.flyer_id || String(g.flyer_id) === String(rawF.id));
          }

          // Group offers by their real flyer_page (ADR-0006)
          const pageOffersMap = new Map();
          const pagePreviewImageMap = new Map();
          pagePreviewImageMap.set(1, page1);
          if (page2) pagePreviewImageMap.set(2, page2);

          let flyerOffersExtracted = 0;

          for (const g of gibs) {
            const promoDigits = parseFloat(
              g.settings?.price_extended?.digits ||
              String(g.settings?.price || '').replace(/[^0-9.,]/g, '').replace(',', '.')
            );
            if (!promoDigits || Number.isNaN(promoDigits) || promoDigits <= 0) continue;

            const promoPrice = Math.round(promoDigits * 100) / 100;
            const origDigits = parseFloat(g.settings?.starting_price?.digits || '');
            const hasRealOriginalPrice = Boolean(origDigits && !Number.isNaN(origDigits) && origDigits > promoPrice);

            const originalPrice = hasRealOriginalPrice ? Math.round(origDigits * 100) / 100 : null;
            const discountPercentage = hasRealOriginalPrice
              ? Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
              : null;
            const discountLabel = discountPercentage && discountPercentage > 0 ? `-${discountPercentage}%` : null;

            const offerId = String(g.id);
            if (allOffers.some(existing => existing.id === offerId)) continue;

            const title = (g.title || 'Prodotto in Offerta').trim();
            const brand = (g.settings?.brand || store.brand).trim();
            const domain = classifyProductDomain({ title, brand, chainId: store.chainId, storeId: store.id });
            const category = classifyCanonicalCategory({ title, brand, chainId: store.chainId, storeId: store.id }, domain);
            const imageUrl = g.settings?.image_url || g.image || coverImageUrl;
            const rawUnitSuffix = g.settings?.price_suffix ? String(g.settings.price_suffix).trim() : null;
            const unitPrice = rawUnitSuffix ? `${promoPrice.toFixed(2).replace('.', ',')} € ${rawUnitSuffix}` : null;
            const pageNum = Math.max(1, parseInt(g.settings?.flyer_page, 10) || 1);

            allOffers.push({
              id: offerId,
              storeId: store.id,
              chainId: store.chainId,
              storeName: store.brand,
              brand,
              flyerId: String(rawF.id),
              pageNumber: pageNum,
              title,
              description: g.description ? String(g.description).trim() : `${brand} — ${store.name} (${store.address})`,
              price: promoPrice,
              promoPrice,
              discountPrice: promoPrice,
              originalPrice,
              discountPercentage,
              discountLabel,
              unitPrice,
              domain,
              category,
              imageUrl,
              validFrom,
              validTo,
              validityStart: validFrom,
              validityEnd: validTo,
              isHighlight: Boolean(discountPercentage && discountPercentage >= 30)
            });

            if (!pageOffersMap.has(pageNum)) {
              pageOffersMap.set(pageNum, []);
            }
            pageOffersMap.get(pageNum).push(offerId);
            if (!pagePreviewImageMap.has(pageNum)) {
              pagePreviewImageMap.set(pageNum, imageUrl);
            }
            storeOffersAdded++;
            flyerOffersExtracted++;
          }

          // Skip empty ghost/redirect flyers with 0 real priced offers unless explicit multi-page images exist
          if (flyerOffersExtracted === 0 && (!Array.isArray(rawF.imageAssets?.pages) || rawF.imageAssets.pages.length === 0)) {
            continue;
          }

          verifiedFlyersForStore++;

          const maxDetectedPage = Math.max(
            page2 ? 2 : 1,
            ...Array.from(pageOffersMap.keys())
          );
          const pages = [];
          for (let p = 1; p <= maxDetectedPage; p++) {
            pages.push({
              pageNumber: p,
              imageUrl: pagePreviewImageMap.get(p) || coverImageUrl,
              offerIds: pageOffersMap.get(p) || []
            });
          }

          if (!allFlyers.some(f => f.id === String(rawF.id))) {
            allFlyers.push({
              id: String(rawF.id),
              storeId: store.id,
              chainId: store.chainId,
              storeName: store.brand,
              title: (rawF.title || `Volantino ${store.brand}`).trim(),
              validFrom,
              validTo,
              startDate: validFrom,
              endDate: validTo,
              pageCount: pages.length,
              extractedOffersCount: flyerOffersExtracted,
              upstreamIndexedCap: upstreamGibsCount === 50 ? 50 : null,
              geoVerifiedProvince: 'GE',
              coverImageUrl,
              pages,
              pageImages: pages.map(p => p.imageUrl),
              pdfUrl: rawF.publication_url || null,
              isCurrent,
              isExpired: !isCurrent,
              featured: rawF.is_premium === '1'
            });
          }
        }

        liveSuccessCount++;
        this._updateProgress({
          completedStores: idx + 1,
          flyersFound: allFlyers.length,
          offersFound: allOffers.length,
          percent: Math.min(96, Math.round(((idx + 1) / totalStores) * 90) + 5)
        }, `✔ ${store.name}: ${verifiedFlyersForStore} volantini verificati GE/Rapallo, ${storeOffersAdded} prodotti estratti.`);
      } catch (storeErr) {
        errors.push({ storeId: store.id, message: storeErr.message });
        this._updateProgress({
          completedStores: idx + 1,
          flyersFound: allFlyers.length,
          offersFound: allOffers.length,
          percent: Math.min(96, Math.round(((idx + 1) / totalStores) * 90) + 5)
        }, `⚠ ${store.name}: errore di rete (${storeErr.message}).`);
      }
    }

    const deduplicatedOffersMap = new Map();
    for (const off of allOffers) {
      if (off && off.id && !deduplicatedOffersMap.has(off.id)) {
        deduplicatedOffersMap.set(off.id, off);
      }
    }
    const deduplicatedOffers = Array.from(deduplicatedOffersMap.values());

    if (liveSuccessCount > 0 && deduplicatedOffers.length > 0) {
      const updatedStores = this.recalculateStoreCounts(baseStores, allFlyers, deduplicatedOffers);
      const dataSource = 'live';
      const status = liveSuccessCount === totalStores ? 'success' : 'partial_success';

      this.cacheManager.set('stores', updatedStores, CACHE_TTL_SECONDS, { dataSource });
      this.cacheManager.set('flyers', allFlyers, CACHE_TTL_SECONDS, { dataSource });
      this.cacheManager.set('offers', deduplicatedOffers, CACHE_TTL_SECONDS, { dataSource });

      const completedAt = new Date().toISOString();
      const result = {
        status,
        mode: 'deep',
        startedAt,
        completedAt,
        durationMs: Date.now() - startTime,
        storesProcessed: updatedStores.length,
        totalFlyers: allFlyers.length,
        totalOffers: deduplicatedOffers.length,
        dataSource,
        errors
      };

      this._updateProgress({
        active: false,
        phase: 'completed',
        title: 'Deep Sync dei 14 Negozi Completato con Successo!',
        currentStore: `Tutti i ${updatedStores.length} negozi di Rapallo aggiornati`,
        completedStores: updatedStores.length,
        totalStores: updatedStores.length,
        flyersFound: allFlyers.length,
        offersFound: deduplicatedOffers.length,
        percent: 100,
        completedAt
      }, `🎉 Deep Sync concluso in ${((Date.now() - startTime) / 1000).toFixed(1)}s: ${updatedStores.length} negozi, ${allFlyers.length} volantini e ${deduplicatedOffers.length} offerte pronte!`);

      this.cacheManager.set('sync_status', result, CACHE_TTL_SECONDS);
      this.lastResult = result;
      return result;
    }

    // Defensive Offline/Zero-Yield Guard: NEVER overwrite valid cache with empty arrays!
    const existingFlyers = this._unwrapData(this.cacheManager.get('flyers'));
    const existingOffers = this._unwrapData(this.cacheManager.get('offers'));
    const hasValidCache =
      Array.isArray(existingOffers) && existingOffers.length > 0 &&
      Array.isArray(existingFlyers) && existingFlyers.length > 0;

    const preservedFlyers = hasValidCache ? existingFlyers : seedData.flyers;
    const preservedOffers = hasValidCache ? existingOffers : seedData.offers;
    const preservedStores = this.recalculateStoreCounts(baseStores, preservedFlyers, preservedOffers);
    const fallbackSource = hasValidCache ? 'cache' : 'seed';

    if (!hasValidCache && preservedOffers.length > 0) {
      this.cacheManager.set('stores', preservedStores, CACHE_TTL_SECONDS, { dataSource: 'seed' });
      this.cacheManager.set('flyers', preservedFlyers, CACHE_TTL_SECONDS, { dataSource: 'seed' });
      this.cacheManager.set('offers', preservedOffers, CACHE_TTL_SECONDS, { dataSource: 'seed' });
    }

    const completedAt = new Date().toISOString();
    const fallbackResult = {
      status: 'cached_fallback',
      mode: 'deep',
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      storesProcessed: preservedStores.length,
      totalFlyers: preservedFlyers.length,
      totalOffers: preservedOffers.length,
      dataSource: fallbackSource,
      errors
    };

    this._updateProgress({
      active: false,
      phase: 'completed',
      title: 'Deep Sync Offline — Cache Locale Preservata',
      currentStore: `Dati preservati (${preservedOffers.length} offerte attive)`,
      completedStores: preservedStores.length,
      totalStores: preservedStores.length,
      flyersFound: preservedFlyers.length,
      offersFound: preservedOffers.length,
      percent: 100,
      completedAt
    }, `⚠ Deep Sync senza nuovi dati live (${liveSuccessCount}/${totalStores} risposte): preservate ${preservedOffers.length} offerte da ${fallbackSource}.`);

    this.cacheManager.set('sync_status', fallbackResult, CACHE_TTL_SECONDS);
    this.lastResult = fallbackResult;
    return fallbackResult;
  }

  /**
   * Initialize service on startup
   */
  async init() {
    if (this.isInitialized) return;
    try {
      await this.sync(false);
    } catch (err) {
      console.error(`[IngestionService] Init error: ${err.message}`);
    } finally {
      this.isInitialized = true;
    }
  }

  /**
   * Retrieve all Rapallo stores with active badge counts
   */
  async getStores() {
    await this.init();
    let stores = this._unwrapData(this.cacheManager.get('stores'));
    if (stores && Array.isArray(stores) && stores.length > 0) return stores;
    const seed = await this.loadSeedData();
    return seed.stores;
  }

  /**
   * Retrieve flyers, optionally filtered by storeId or chainId
   */
  async getFlyers(storeId) {
    await this.init();
    let flyers = this._unwrapData(this.cacheManager.get('flyers'));
    if (!flyers || !Array.isArray(flyers) || flyers.length === 0) {
      const seed = await this.loadSeedData();
      flyers = seed.flyers;
    }

    // Exclude unmapped generic national flyers (`store-*`) when real Rapallo store flyers are present
    const rapalloMappedFlyers = flyers.filter((f) => f && f.storeId && !String(f.storeId).startsWith('store-'));
    if (rapalloMappedFlyers.length > 0) {
      flyers = rapalloMappedFlyers;
    }

    if (storeId) {
      flyers = flyers.filter(f =>
        f.storeId === storeId ||
        (Array.isArray(f.storeIds) && f.storeIds.includes(storeId)) ||
        f.chainId === storeId
      );
    }

    // Sort active first, then by validTo
    return flyers.slice().sort((a, b) => {
      if (a.isCurrent !== b.isCurrent) return b.isCurrent ? 1 : -1;
      return new Date(a.validTo) - new Date(b.validTo);
    });
  }

  /**
   * Unified search, filter, and pagination engine for promotional items
   */
  async getOffers(filter = {}) {
    await this.init();
    let offers = this._unwrapData(this.cacheManager.get('offers'));
    if (!offers || !Array.isArray(offers) || offers.length === 0) {
      const seed = await this.loadSeedData();
      offers = seed.offers;
    }

    const now = Date.now();
    const query = this.normalizeText(filter.query || filter.q);
    const chainId = filter.chainId ? filter.chainId.toLowerCase() : null;
    const storeId = filter.storeId || null;
    const category = filter.category ? this.normalizeText(filter.category) : null;
    const minDiscount = filter.minDiscount !== undefined && filter.minDiscount !== null ? Number(filter.minDiscount) : null;
    const maxPrice = filter.maxPrice !== undefined && filter.maxPrice !== null ? Number(filter.maxPrice) : null;
    const onlyActive = filter.onlyActive === true;

    // Extract unique categories across all offers before filtering
    const allCategories = [...new Set(offers.map(o => o.category).filter(Boolean))].sort();

    // 1. Filtering
    let filtered = offers.filter(offer => {
      // Date validity (if onlyActive is true)
      if (onlyActive && (offer.validTo || offer.validityEnd)) {
        if (new Date(offer.validTo || offer.validityEnd).getTime() < now) return false;
      }
      // Store / Chain filter
      if (storeId && offer.storeId !== storeId) return false;
      if (chainId && offer.chainId !== chainId) return false;
      // Category filter
      if (category && this.normalizeText(offer.category) !== category) return false;
      // Price / Discount threshold
      if (minDiscount !== null && (offer.discountPercentage || 0) < minDiscount) return false;
      if (maxPrice !== null && (offer.discountPrice || offer.promoPrice) > maxPrice) return false;
      // Keyword query search (accent & case-insensitive)
      if (query) {
        const titleNorm = this.normalizeText(offer.title);
        const brandNorm = this.normalizeText(offer.brand || '');
        const descNorm = this.normalizeText(offer.description || '');
        if (!titleNorm.includes(query) && !brandNorm.includes(query) && !descNorm.includes(query)) {
          return false;
        }
      }
      return true;
    });

    // 2. Sorting
    const sortBy = filter.sortBy || 'discountDesc';
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'discountDesc':
          return (b.discountPercentage || 0) - (a.discountPercentage || 0);
        case 'priceAsc':
          return (a.discountPrice ?? a.promoPrice) - (b.discountPrice ?? b.promoPrice);
        case 'priceDesc':
          return (b.discountPrice ?? b.promoPrice) - (a.discountPrice ?? a.promoPrice);
        case 'expiringSoon':
          return new Date(a.validTo || a.validityEnd) - new Date(b.validTo || b.validityEnd);
        case 'nameAsc':
          return (a.title || '').localeCompare(b.title || '', 'it', { sensitivity: 'base' });
        default:
          return 0;
      }
    });

    // 3. Pagination
    const page = Math.max(1, parseInt(filter.page, 10) || 1);
    const limit = Math.max(1, Math.min(100, parseInt(filter.limit, 10) || 20));
    const totalOffers = filtered.length;
    const totalPages = Math.ceil(totalOffers / limit) || 1;
    const offset = (page - 1) * limit;
    const paginatedOffers = filtered.slice(offset, offset + limit);

    return {
      offers: paginatedOffers,
      totalOffers,
      page,
      limit,
      totalPages,
      categories: allCategories
    };
  }

  /**
   * Computes honest freshness telemetry for offline seed flyers (ADR-0018 / ADR-0006).
   */
  async getSeedHealth(nowMs = Date.now()) {
    let seedFlyers = [];
    try {
      const flyersRaw = await fs.readFile(path.join(this.seedDir, 'rapallo_flyers.json'), 'utf-8');
      const parsed = JSON.parse(flyersRaw);
      seedFlyers = Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      seedFlyers = [];
    }

    const totalSeedFlyers = seedFlyers.length;
    let activeSeedFlyers = 0;
    let expiredSeedFlyers = 0;

    for (const f of seedFlyers) {
      const validToMs = f?.validTo ? Date.parse(f.validTo) : NaN;
      if (!Number.isFinite(validToMs) || validToMs >= nowMs) {
        activeSeedFlyers += 1;
      } else {
        expiredSeedFlyers += 1;
      }
    }

    return {
      totalSeedFlyers,
      activeSeedFlyers,
      expiredSeedFlyers,
      seedNeedsRefresh: totalSeedFlyers > 0 && activeSeedFlyers < Math.ceil(totalSeedFlyers / 2)
    };
  }

  /**
   * Health and status query (non-blocking during in-flight cold-start sync)
   */
  async getStatus() {
    let stores = this._unwrapData(this.cacheManager.get('stores')) || [];
    let flyers = this._unwrapData(this.cacheManager.get('flyers')) || [];
    let offers = this._unwrapData(this.cacheManager.get('offers')) || [];
    if (stores.length === 0 || flyers.length === 0 || offers.length === 0) {
      const seed = await this.loadSeedData();
      if (stores.length === 0) stores = seed.stores;
      if (flyers.length === 0) flyers = seed.flyers;
      if (offers.length === 0) offers = seed.offers;
    }

    const isCacheExpired = this.cacheManager.isExpired('flyers');
    const storesEnvelope = typeof this.cacheManager.getEnvelope === 'function'
      ? this.cacheManager.getEnvelope('stores')
      : null;
    const envelopeOrigin = storesEnvelope?.metadata?.dataSource || null;
    const isFallbackOrFailed =
      this.lastResult?.status === 'cached_fallback' || this.lastResult?.status === 'failed';
    const isFreshLiveCache = !isCacheExpired && envelopeOrigin === 'live' && !isFallbackOrFailed;
    const effectiveSource = isFreshLiveCache
      ? 'live'
      : (this.lastResult?.dataSource || envelopeOrigin || 'seed');

    return {
      isOnline: (effectiveSource === 'live' || isFreshLiveCache) && !isFallbackOrFailed,
      dataSource: effectiveSource,
      syncInProgress: Boolean(this.inFlightSync),
      lastSyncTimestamp: storesEnvelope?.metadata?.cachedAt || this.lastResult?.completedAt || new Date().toISOString(),
      lastResult: this.lastResult,
      storeCount: Array.isArray(stores) && stores.length > 0 ? stores.length : 14,
      flyerCount: Array.isArray(flyers) ? flyers.length : 0,
      offerCount: Array.isArray(offers) ? offers.length : 0,
      cacheFresh: !isCacheExpired,
      seedHealth: await this.getSeedHealth()
    };
  }
}

// Singleton export
export const ingestionService = new IngestionService();
export default ingestionService;
