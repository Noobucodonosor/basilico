/**
 * Basilico Test Helper & Specification Oracles
 * 
 * Provides authoritative reference definitions, mathematical models, schema validators,
 * and test harness utilities derived directly from ORIGINAL_REQUEST.md, PROJECT.md, and TEST_INFRA.md.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '../..');

/**
 * 1. Rapallo Supermarket Chains & Canonical Reference Stores
 * Authoritative ground truth from Explorer Survey 1 & PROJECT.md
 */
export const CANONICAL_CHAINS = ['Coop', 'Carrefour', 'Conad', 'Basko', 'Doro'];

export const CANONICAL_RAPALLO_STORES = [
  {
    id: 'coop-rapallo-sciesa',
    name: 'Coop Rapallo',
    brand: 'Coop',
    banner: 'Supermercato',
    address: 'Via Amatore Sciesa, 15',
    city: 'Rapallo',
    postalCode: '16035',
    zone: 'Centro residenziale / Stazione',
    coordinates: { lat: 44.3541, lng: 9.2274 },
    openingHours: 'Lunedì - Sabato: 08:00 - 20:00, Domenica: 08:30 - 13:00',
    isRegionalServing: false
  },
  {
    id: 'carrefour-market-assereto',
    name: 'Carrefour Market Assereto',
    brand: 'Carrefour',
    banner: 'Market',
    address: 'Corso Giuseppe Assereto, 37/51',
    city: 'Rapallo',
    postalCode: '16035',
    zone: 'Porto / Centro',
    coordinates: { lat: 44.3512, lng: 9.2315 },
    openingHours: 'Lunedì - Domenica: 08:00 - 21:00',
    isRegionalServing: false
  },
  {
    id: 'conad-city-torrecivica',
    name: 'Conad City Torre Civica',
    brand: 'Conad',
    banner: 'City',
    address: 'Via alla Torre Civica, 12',
    city: 'Rapallo',
    postalCode: '16035',
    zone: 'Centro storico',
    coordinates: { lat: 44.3508, lng: 9.2291 },
    openingHours: 'Lunedì - Sabato: 08:00 - 20:00, Domenica: 08:30 - 13:00',
    isRegionalServing: false
  },
  {
    id: 'basko-rapallo-colombo',
    name: 'Basko Rapallo Porto',
    brand: 'Basko',
    banner: 'Superstore',
    address: 'Corso Cristoforo Colombo, 4',
    city: 'Rapallo',
    postalCode: '16035',
    zone: 'Porto Turistico',
    coordinates: { lat: 44.3489, lng: 9.2332 },
    openingHours: 'Lunedì - Sabato: 08:30 - 20:30, Domenica: 08:30 - 19:30',
    isRegionalServing: false
  },
  {
    id: 'doro-tigullio-margherita',
    name: 'Doro Supermercati Tigullio',
    brand: 'Doro',
    banner: 'Supermercato',
    address: 'Via Roma, 10A / 6A',
    city: 'Santa Margherita Ligure',
    postalCode: '16038',
    zone: 'Tigullio / Rapallo Nord',
    coordinates: { lat: 44.3412, lng: 9.2514 },
    openingHours: 'Lunedì - Sabato: 08:00 - 20:00, Domenica: Chiuso',
    isRegionalServing: true
  }
];

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
  'Cura Persona e Igiene'
];

/**
 * 2. Mathematical & Algorithmic Oracles
 */

/**
 * Discount calculation oracle: Math.round(((originalPrice - promoPrice) / originalPrice) * 100)
 */
export function calculateDiscountPercentage(originalPrice, promoPrice) {
  if (typeof originalPrice !== 'number' || typeof promoPrice !== 'number' || isNaN(originalPrice) || isNaN(promoPrice)) {
    return 0;
  }
  if (originalPrice <= 0 || promoPrice < 0 || promoPrice >= originalPrice) {
    return 0;
  }
  const pct = ((originalPrice - promoPrice) / originalPrice) * 100;
  return Math.round(pct);
}

/**
 * Unit price calculation oracle: e.g. "€ 1,78 / kg"
 */
export function formatUnitPrice(price, quantity, unit) {
  if (typeof price !== 'number' || typeof quantity !== 'number' || quantity <= 0) {
    return '';
  }
  const unitCost = price / quantity;
  return `€ ${unitCost.toFixed(2).replace('.', ',')} / ${unit}`;
}

/**
 * Accent & case-folding search normalization oracle
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
 * Cache TTL & Stale Grace period evaluation oracle
 */
export function evaluateCacheFreshness(cachedAt, ttlSeconds = 21600, staleGraceSeconds = 604800, now = Date.now()) {
  const cachedTime = new Date(cachedAt).getTime();
  if (isNaN(cachedTime)) {
    return { isFresh: false, isStale: true, isExpired: true };
  }
  const ageSeconds = (now - cachedTime) / 1000;
  const isFresh = ageSeconds <= ttlSeconds;
  const isStale = ageSeconds > ttlSeconds && ageSeconds <= (ttlSeconds + staleGraceSeconds);
  const isExpired = ageSeconds > (ttlSeconds + staleGraceSeconds);
  return { isFresh, isStale, isExpired, ageSeconds };
}

/**
 * 3. Schema Validators
 */
export function validateStoreSchema(store) {
  const errors = [];
  if (!store || typeof store !== 'object') {
    return ['Store must be a valid object'];
  }
  if (!store.id || typeof store.id !== 'string') errors.push('Missing or invalid id');
  if (!store.name || typeof store.name !== 'string') errors.push('Missing or invalid name');
  if (!store.brand || typeof store.brand !== 'string') errors.push('Missing or invalid brand');
  if (!store.address || typeof store.address !== 'string') errors.push('Missing or invalid address');
  if (!store.postalCode || typeof store.postalCode !== 'string') errors.push('Missing or invalid postalCode');
  if (!store.coordinates || typeof store.coordinates.lat !== 'number' || typeof store.coordinates.lng !== 'number') {
    errors.push('Missing or invalid coordinates (lat, lng)');
  }
  return errors;
}

export function validateFlyerSchema(flyer) {
  const errors = [];
  if (!flyer || typeof flyer !== 'object') {
    return ['Flyer must be a valid object'];
  }
  if (!flyer.id || typeof flyer.id !== 'string') errors.push('Missing or invalid id');
  if (!flyer.storeId || typeof flyer.storeId !== 'string') errors.push('Missing or invalid storeId');
  if (!flyer.title || typeof flyer.title !== 'string') errors.push('Missing or invalid title');
  if (!flyer.validFrom || isNaN(Date.parse(flyer.validFrom))) errors.push('Invalid validFrom ISO timestamp');
  if (!flyer.validTo || isNaN(Date.parse(flyer.validTo))) errors.push('Invalid validTo ISO timestamp');
  if (typeof flyer.pageCount !== 'number' || flyer.pageCount < 1) errors.push('Invalid pageCount');
  if (!flyer.coverImageUrl || typeof flyer.coverImageUrl !== 'string') errors.push('Missing or invalid coverImageUrl');
  return errors;
}

export function validateOfferSchema(offer) {
  const errors = [];
  if (!offer || typeof offer !== 'object') {
    return ['Offer must be a valid object'];
  }
  if (!offer.id || typeof offer.id !== 'string') errors.push('Missing or invalid id');
  if (!offer.storeId || typeof offer.storeId !== 'string') errors.push('Missing or invalid storeId');
  if (!offer.title || typeof offer.title !== 'string') errors.push('Missing or invalid title');
  if (!offer.category || typeof offer.category !== 'string' || !VALID_PRODUCT_CATEGORIES.includes(offer.category)) {
    errors.push('Missing or invalid category');
  }
  if (typeof offer.promoPrice !== 'number' || offer.promoPrice <= 0) errors.push('Invalid promoPrice');
  if (offer.originalPrice !== undefined && offer.originalPrice !== null && (typeof offer.originalPrice !== 'number' || offer.originalPrice < offer.promoPrice)) {
    errors.push('originalPrice must be >= promoPrice when present');
  }
  if (offer.discountPercentage !== undefined && offer.discountPercentage !== null && (typeof offer.discountPercentage !== 'number' || offer.discountPercentage < 0 || offer.discountPercentage > 100)) {
    errors.push('Invalid discountPercentage range');
  }
  return errors;
}

/**
 * 4. Temporary Isolated Test Directory Manager
 */
export function createIsolatedTempDir(prefix = 'basilico-test-') {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  return {
    path: tempDir,
    cleanup: () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch (_) {}
    }
  };
}

/**
 * 5. Dynamic Module Loader
 * Allows tests to load implementation files if they exist, or safely inspect them.
 */
export async function tryImport(relativeModulePath) {
  const fullPath = path.resolve(PROJECT_ROOT, relativeModulePath);
  if (!fs.existsSync(fullPath)) {
    return null;
  }
  try {
    const mod = await import(fullPath);
    return mod;
  } catch (err) {
    // If it's a syntax or module error inside an existing file, throw so reviewer/worker sees it
    throw err;
  }
}
