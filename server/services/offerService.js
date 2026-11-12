/**
 * Basilico — Supermarket Offers Application
 * Location: server/services/offerService.js
 *
 * Dedicated search, filter, sorting, facet aggregation, and pagination engine
 * for Rapallo supermarket promotions.
 * Guarantees 100% contract compliance with tests/api/offers_api.test.js (F6).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestionService } from './ingestionService.js';
import {
  classifyProductDomain,
  classifyCanonicalCategory,
  VALID_PRODUCT_DOMAINS
} from './domainClassifier.js';
import { normalizeUnitPricing } from './unitPriceExtractor.js';
import { evaluateQualityLens } from './qualityLensService.js';
import { priceHistoryService } from './priceHistoryService.js';
import { userProfileService } from './userProfileService.js';
import { creaOfferMatcher } from './creaOfferMatcher.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SEED_OFFERS_PATH = path.resolve(__dirname, '../../data/seed/rapallo_offers.json');

/**
 * Authoritative Rapallo product categories
 */
export const VALID_PRODUCT_CATEGORIES = [
  'Frutta e Verdura',
  'Carne e Pesce',
  'Latticini e Formaggi',
  'Pane e Pasticceria',
  'Dispensa e Pasta',
  'Colazione e Dolci',
  'Acqua e Bevande',
  'Surgelati',
  'Cura Casa e Bucato',
  'Cura Persona e Igiene',
  'Pentole, Cucina ed Elettrodomestici',
  'Animali Domestici',
  'Giocattoli, Natale e Tempo Libero',
  'Tessile, Abbigliamento e Bazar Casa'
];

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

/**
 * Accent & case-folding search normalization
 * "caffè" -> "caffe", "TÈ" -> "te", "  pasta   barilla " -> "pasta barilla"
 */
export function normalizeSearchToken(str) {
  if (typeof str !== 'string') return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Detects generic or OCR-truncated flyer tiles without an identifiable product noun
 * (e.g. "Al Kg", "Galbani - no", "Biraghi - ni", "Goliath -") so they never pollute CREA or recipe BOM matching.
 */
export function isNamelessOfferTile(offer = {}) {
  const titleNorm = normalizeSearchToken(offer.title || '');
  if (!titleNorm) return true;
  if (/^(al\s*kg|all\s*etto|al\s*etto|al\s*litro|offerta|solo|prezzo|prezzo\s*speciale|goliath|natural)$/.test(titleNorm)) {
    return true;
  }
  const brandNorm = normalizeSearchToken(offer.brand || '');
  if (brandNorm && titleNorm.startsWith(`${brandNorm} `)) {
    const rest = titleNorm.slice(brandNorm.length).trim();
    if (rest.length <= 2 || /^(no|ni|si|il|lo|la)$/.test(rest)) {
      return true;
    }
  }
  return false;
}

export function cleanOfferDisplayTitle(rawTitle = '') {
  const s = String(rawTitle || '').trim();
  if (!s) return s;
  return s
    .replace(/\bFa\s*-\s*shion\b/gi, 'Fashion')
    .replace(/(?:\s+-\s*)+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
/**
 * Returns a sort comparator supporting both snake_case and camelCase keys
 */
export function getSortComparator(sortBy) {
  if (!sortBy || typeof sortBy !== 'string') return null;
  const key = sortBy.trim().toLowerCase().replace(/[-_]/g, '');

  switch (key) {
    case 'discountdesc':
      return (a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0);
    case 'discountasc':
      return (a, b) => (a.discountPercentage || 0) - (b.discountPercentage || 0);
    case 'priceasc':
      return (a, b) => (a.promoPrice ?? a.discountPrice ?? 0) - (b.promoPrice ?? b.discountPrice ?? 0);
    case 'pricedesc':
      return (a, b) => (b.promoPrice ?? b.discountPrice ?? 0) - (a.promoPrice ?? a.discountPrice ?? 0);
    case 'nameasc':
      return (a, b) => (a.title || '').localeCompare(b.title || '', 'it', { sensitivity: 'base' });
    case 'namedesc':
      return (a, b) => (b.title || '').localeCompare(a.title || '', 'it', { sensitivity: 'base' });
    case 'expiringsoon':
      return (a, b) => new Date(a.validityEnd || a.validTo || 0) - new Date(b.validityEnd || b.validTo || 0);
    case 'priceperkgasc':
      return (a, b) => {
        const va = a.isNamelessTile
          ? 999999
          : (a.ediblePricePerKg ?? a.pricePerKg ?? a.referencePackEstimate?.estimatedEdiblePricePerKg ?? 999999);
        const vb = b.isNamelessTile
          ? 999999
          : (b.ediblePricePerKg ?? b.pricePerKg ?? b.referencePackEstimate?.estimatedEdiblePricePerKg ?? 999999);
        return va - vb;
      };
    default:
      return null;
  }
}

const _enrichedOfferMemo = new WeakMap();
const _enrichedOfferByIdMemo = new Map();
let _enrichmentMutationEpoch = 1;

export function bumpEnrichmentEpoch() {
  _enrichmentMutationEpoch++;
  _enrichedOfferByIdMemo.clear();
  return _enrichmentMutationEpoch;
}

export function getEnrichmentEpoch() {
  return _enrichmentMutationEpoch;
}

/**
 * Enriches an offer record with domain taxonomy, normalized €/kg pricing, and quality lens metadata.
 * Uses both a WeakMap and an ID/title signature Map so repeated disk cache reads are O(1) instant,
 * while invalidating immediately when price history, CREA manual overrides, or user profiles mutate.
 */
export function enrichOfferRecord(offer = {}, profileId = null) {
  if (!offer || typeof offer !== 'object') return offer;

  // Ensure lazy singletons are initialized before computing memo key (prevents cold-start :0 vs :N mismatch)
  priceHistoryService._load?.();
  userProfileService._load?.();
  creaOfferMatcher._loadOverrides?.();

  const resolvedProfileKey =
    typeof profileId === 'object' && profileId !== null
      ? (profileId.id || '__custom__')
      : (profileId || userProfileService.getProfilesState?.()?.activeProfileId || '__default__');
  const phVer = priceHistoryService.getMutationVersion?.() ?? (priceHistoryService._observations?.length || 0);
  const creaVer = creaOfferMatcher.getMutationVersion?.() ?? 0;
  const profVer = userProfileService.getMutationVersion?.() ?? 0;
  const cacheKey = `${resolvedProfileKey}:e${_enrichmentMutationEpoch}:ph${phVer}:cr${creaVer}:pr${profVer}`;

  let cachedByProfile = _enrichedOfferMemo.get(offer);
  if (cachedByProfile && cachedByProfile.has(cacheKey)) {
    return cachedByProfile.get(cacheKey);
  }

  const sigKey = offer.id
    ? `${offer.id}:${offer.promoPrice ?? offer.discountPrice ?? offer.price ?? ''}:${offer.title || ''}:${cacheKey}`
    : null;
  if (sigKey && _enrichedOfferByIdMemo.has(sigKey)) {
    const hit = _enrichedOfferByIdMemo.get(sigKey);
    if (!cachedByProfile) {
      cachedByProfile = new Map();
      _enrichedOfferMemo.set(offer, cachedByProfile);
    }
    cachedByProfile.set(cacheKey, hit);
    return hit;
  }

  const cleanedTitle = cleanOfferDisplayTitle(offer.title);
  const workingOffer = cleanedTitle && cleanedTitle !== offer.title ? { ...offer, title: cleanedTitle } : offer;
  const domain = classifyProductDomain(workingOffer);
  const category = classifyCanonicalCategory(workingOffer, domain);
  const isNamelessTile = isNamelessOfferTile(offer);
  const pricing = normalizeUnitPricing({ ...workingOffer, domain, category });
  const quality = evaluateQualityLens({ ...workingOffer, domain, category });
  const _searchNorm = normalizeSearchToken(
    `${workingOffer.title} ${workingOffer.brand || ''} ${category} ${workingOffer.description || ''}`
  );

  const enrichedBase = {
    ...workingOffer,
    category,
    _searchNorm,
    domain,
    isNamelessTile,
    checkoutPackPrice: pricing.checkoutPackPrice,
    packWeightGrams: pricing.packWeightGrams,
    drainedWeightGrams: pricing.drainedWeightGrams,
    packVolumeMl: pricing.packVolumeMl,
    pricePerKg: pricing.pricePerKg,
    ediblePricePerKg: pricing.ediblePricePerKg,
    pricePerLiter: pricing.pricePerLiter,
    formattedNormalizedPrice: pricing.formattedNormalizedPrice,
    referencePackEstimate: isNamelessTile ? null : pricing.referencePackEstimate,
    priceAnomalyFlag: pricing.priceAnomalyFlag,
    priceAnomalyReasons: pricing.priceAnomalyReasons,
    qualityBadges: quality.badges,
    qualityWarnings: quality.warnings,
    technicalSpec: quality.technicalSpec
  };

  const realDiscount = priceHistoryService.evaluateRealDiscount(enrichedBase);
  const profileCompatibility = userProfileService.checkItemCompatibility(enrichedBase, profileId);
  const creaMatch = enrichedBase.domain === 'food_human'
    ? creaOfferMatcher.computeOfferNutrientsPerEuro(enrichedBase)
    : null;

  const fullResult = {
    ...enrichedBase,
    realDiscountCheck: realDiscount,
    profileCompatibility,
    creaMatch
  };

  if (!cachedByProfile) {
    cachedByProfile = new Map();
    _enrichedOfferMemo.set(offer, cachedByProfile);
  }
  cachedByProfile.set(cacheKey, fullResult);
  if (sigKey) {
    if (_enrichedOfferByIdMemo.size > 5000) _enrichedOfferByIdMemo.clear();
    _enrichedOfferByIdMemo.set(sigKey, fullResult);
  }

  return fullResult;
}

/**
 * Aggregates facet distributions for categories, stores, and discount brackets
 */
export function computeFacets(offers = []) {
  const categories = {};
  const stores = {};
  const domains = {};
  const discountRanges = {
    '50+': 0,
    '40-49': 0,
    '30-39': 0,
    '20-29': 0,
    'under20': 0
  };

  for (const cat of VALID_PRODUCT_CATEGORIES) {
    categories[cat] = 0;
  }
  for (const dom of VALID_PRODUCT_DOMAINS) {
    domains[dom] = 0;
  }

  for (const o of offers) {
    if (o.category) {
      categories[o.category] = (categories[o.category] || 0) + 1;
    }
    if (o.storeId) {
      stores[o.storeId] = (stores[o.storeId] || 0) + 1;
    }
    const dom = o.domain || classifyProductDomain(o);
    domains[dom] = (domains[dom] || 0) + 1;

    const d = o.discountPercentage || 0;
    if (d >= 50) discountRanges['50+']++;
    else if (d >= 40) discountRanges['40-49']++;
    else if (d >= 30) discountRanges['30-39']++;
    else if (d >= 20) discountRanges['20-29']++;
    else discountRanges['under20']++;
  }

  return { categories, stores, domains, discountRanges };
}

export function filterActiveAndDeduplicateOffers(rawOffers = [], nowMs = Date.now()) {
  if (!Array.isArray(rawOffers) || rawOffers.length === 0) return [];

  // 1. Filter out expired promotional flyers when at least one offer in the dataset is currently active
  const activeCandidates = rawOffers.filter((o) => {
    const end = o?.validityEnd || o?.validTo;
    if (!end) return true;
    const endTime = new Date(end).getTime();
    return Number.isNaN(endTime) || endTime >= nowMs;
  });
  const baseList = activeCandidates.length > 0 ? activeCandidates : rawOffers;

  // 2. Deduplicate identical promo tiles across overlapping flyers of the same store
  const byKey = new Map();
  for (const offer of baseList) {
    if (!offer || typeof offer !== 'object') continue;
    const titleNorm = normalizeSearchToken(offer.title || '');
    const priceKey = Number(offer.promoPrice ?? offer.discountPrice ?? offer.price ?? 0).toFixed(2);
    const dedupKey = isNamelessOfferTile(offer)
      ? `${offer.storeId || ''}|nameless|${offer.id || `${offer.flyerId}-${offer.pageNumber}-${priceKey}`}`
      : `${offer.storeId || ''}|${titleNorm}|${priceKey}`;

    const existing = byKey.get(dedupKey);
    if (!existing) {
      byKey.set(dedupKey, offer);
      continue;
    }

    // Prefer the richer record (with discountPercentage / originalPrice / unitPrice / imageUrl / later validity)
    const score = (item) =>
      (item.discountPercentage ? 4 : 0) +
      (item.originalPrice ? 2 : 0) +
      (item.unitPrice ? 2 : 0) +
      (item.imageUrl ? 1 : 0);
    const existingEnd = new Date(existing.validityEnd || existing.validTo || 0).getTime() || 0;
    const candidateEnd = new Date(offer.validityEnd || offer.validTo || 0).getTime() || 0;
    if (score(offer) > score(existing) || (score(offer) === score(existing) && candidateEnd > existingEnd)) {
      byKey.set(dedupKey, offer);
    }
  }

  return Array.from(byKey.values());
}

export class OfferService {
  constructor(options = {}) {
    this.ingestionService = options.ingestionService || ingestionService;
    this.seedOffersPath = options.seedOffersPath || SEED_OFFERS_PATH;
    this._cachedSeedOffers = null;
  }

  /**
   * Synchronous seed data loader fallback
   */
  getSeedOffersSync() {
    if (this._cachedSeedOffers) return this._cachedSeedOffers;
    try {
      if (fs.existsSync(this.seedOffersPath)) {
        const raw = fs.readFileSync(this.seedOffersPath, 'utf8');
        this._cachedSeedOffers = JSON.parse(raw);
        return this._cachedSeedOffers;
      }
    } catch (err) {
      console.error(`[OfferService] Failed to read seed offers: ${err.message}`);
    }
    return [];
  }

  /**
   * Asynchronous raw offer retrieval from cache or seed (active & deduplicated)
   */
  async getRawOffers() {
    try {
      await this.ingestionService.init();
      let cached = this.ingestionService._unwrapData(this.ingestionService.cacheManager.get('offers'));
      if (Array.isArray(cached) && cached.length > 0) {
        const deduped = filterActiveAndDeduplicateOffers(cached);
        return deduped.length > 20 ? deduped.filter((o) => !isNamelessOfferTile(o)) : deduped;
      }
      const seed = await this.ingestionService.loadSeedData();
      if (seed && Array.isArray(seed.offers) && seed.offers.length > 0) {
        const deduped = filterActiveAndDeduplicateOffers(seed.offers);
        return deduped.length > 20 ? deduped.filter((o) => !isNamelessOfferTile(o)) : deduped;
      }
    } catch (err) {
      console.error(`[OfferService] Error fetching raw offers: ${err.message}`);
    }
    const fallback = filterActiveAndDeduplicateOffers(this.getSeedOffersSync());
    return fallback.length > 20 ? fallback.filter((o) => !isNamelessOfferTile(o)) : fallback;
  }

  /**
   * Pure synchronous query processing over an offers array
   */
  processQuery(query = {}, offers = []) {
    const profileId = query.profileId || null;
    let baseFiltered = offers.map((o) => enrichOfferRecord(o, profileId));

    // Optional profile filtering when hideIncompatible=true or profile has hard_ban enabled and profileId is explicitly requested
    if (query.hideIncompatible === 'true' || query.hideIncompatible === true) {
      baseFiltered = baseFiltered.filter((o) => o.profileCompatibility?.isCompatible !== false);
    } else if (profileId && query.enforceProfileBan === 'true') {
      baseFiltered = baseFiltered.filter((o) => o.profileCompatibility?.action !== 'hide');
    }

    // Non-facet base filters: keyword search, minDiscount, maxPrice, onlyActive
    const rawQ = query.q || query.query;
    if (rawQ && typeof rawQ === 'string' && rawQ.trim()) {
      const normalizedQ = normalizeSearchToken(rawQ);
      if (normalizedQ.length > 0) {
        baseFiltered = baseFiltered.filter((o) => {
          const itemText = o._searchNorm || normalizeSearchToken(
            `${o.title} ${o.brand || ''} ${o.category || ''} ${o.description || ''}`
          );
          return itemText.includes(normalizedQ);
        });
      }
    }

    if (
      query.minDiscount !== undefined &&
      query.minDiscount !== null &&
      String(query.minDiscount).trim() !== ''
    ) {
      const minDisc = parseInt(query.minDiscount, 10);
      if (!isNaN(minDisc)) {
        const clampedDisc = Math.max(0, minDisc);
        baseFiltered = baseFiltered.filter((o) => (o.discountPercentage || 0) >= clampedDisc);
      }
    }

    if (
      query.maxPrice !== undefined &&
      query.maxPrice !== null &&
      String(query.maxPrice).trim() !== ''
    ) {
      const maxP = parseFloat(query.maxPrice);
      if (!isNaN(maxP) && maxP >= 0) {
        baseFiltered = baseFiltered.filter((o) => (o.promoPrice ?? o.discountPrice ?? 0) <= maxP);
      }
    }

    if (query.onlyActive === true || query.onlyActive === 'true') {
      const now = Date.now();
      baseFiltered = baseFiltered.filter((o) => {
        const end = o.validityEnd || o.validTo;
        if (!end) return true;
        return new Date(end).getTime() >= now;
      });
    }

    // Dimension predicates (orthogonal facet calculation so sibling pills never zero out!)
    const domFilter = query.domain && typeof query.domain === 'string' ? query.domain.trim() : '';
    const storeFilter = query.storeId && typeof query.storeId === 'string' ? query.storeId.trim() : '';
    const catFilter = query.category && typeof query.category === 'string' ? query.category.trim() : '';
    const catNorm = catFilter ? normalizeSearchToken(catFilter) : '';

    const matchesDomain = (o) => !domFilter || o.domain === domFilter;
    const matchesStore = (o) =>
      !storeFilter ||
      o.storeId === storeFilter ||
      o.storeId === storeFilter.replace(/^rapallo-/, '') ||
      `rapallo-${o.storeId}` === storeFilter ||
      o.chainId === storeFilter;
    const matchesCategory = (o) =>
      !catFilter ||
      o.category === catFilter ||
      normalizeSearchToken(o.category) === catNorm ||
      o.categorySlug === catFilter;

    let filtered = baseFiltered.filter((o) => matchesDomain(o) && matchesStore(o) && matchesCategory(o));

    // Orthogonal facets: each dimension reflects baseFiltered + all OTHER active dimensions
    const domainSlice = domFilter
      ? baseFiltered.filter((o) => matchesStore(o) && matchesCategory(o))
      : filtered;
    const categorySlice = catFilter
      ? baseFiltered.filter((o) => matchesDomain(o) && matchesStore(o))
      : filtered;
    const storeSlice = storeFilter
      ? baseFiltered.filter((o) => matchesDomain(o) && matchesCategory(o))
      : filtered;

    const baseFacets = computeFacets(filtered);
    const facets = {
      domains: domFilter ? computeFacets(domainSlice).domains : baseFacets.domains,
      categories: catFilter ? computeFacets(categorySlice).categories : baseFacets.categories,
      stores: storeFilter ? computeFacets(storeSlice).stores : baseFacets.stores,
      discountRanges: baseFacets.discountRanges
    };

    // Sorting
    const comparator = getSortComparator(query.sortBy);
    if (comparator) {
      filtered.sort(comparator);
    }

    // Pagination (1-indexed page, limit clamped to 1..100)
    const page = Math.max(1, parseInt(query.page || '1', 10) || DEFAULT_PAGE);
    const limit = Math.max(
      1,
      Math.min(MAX_LIMIT, parseInt(query.limit || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT)
    );
    const totalOffers = filtered.length;
    // CRITICAL: When totalOffers is 0, totalPages must be 0
    const totalPages = totalOffers === 0 ? 0 : Math.ceil(totalOffers / limit);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      offers: paginated,
      totalOffers,
      page,
      limit,
      totalPages,
      categories: VALID_PRODUCT_CATEGORIES,
      facets
    };
  }

  /**
   * Main asynchronous entrypoint for API route handlers
   */
  async getOffers(query = {}, customOffers = null) {
    const offers = customOffers || (await this.getRawOffers());
    return this.processQuery(query, offers);
  }
}

export const offerService = new OfferService();

/**
 * Authoritative Reference Controller Oracle for tests/api/offers_api.test.js
 * Supports synchronous execution with mock fixtures or fallback seed data.
 */
export function handleGetOffers(query = {}, offers = null) {
  const offerList = offers || offerService.getSeedOffersSync();
  const body = offerService.processQuery(query, offerList);

  return {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body
  };
}

export default offerService;
