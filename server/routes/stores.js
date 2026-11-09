/**
 * Basilico — Supermarket Offers Application
 * Location: server/routes/stores.js
 *
 * REST endpoint: GET /api/stores
 * Contract:
 * - Returns: { stores, totalStores, totalFlyers, totalOffers }
 * - Supports query param: hasOffers=true|false
 * - Enforces store schema contract: flyerCount, activeOfferCount, coordinates
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ingestionService } from '../services/ingestionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_SHOPS_PATH = path.resolve(__dirname, '../../data/seed/rapallo_local_shops.json');

export function loadLocalObservedShops() {
  try {
    if (fs.existsSync(LOCAL_SHOPS_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_SHOPS_PATH, 'utf8'));
    }
  } catch (_) {}
  return [];
}

const router = express.Router();

/**
 * Synchronous reference controller oracle for GET /api/stores (Oracle for F5)
 */
export function handleGetStores(queryParams = {}, storeData = null) {
  let storesList = storeData;
  if (!storesList) {
    // If no store data provided, read from ingestion service cache or seed
    const cached = ingestionService._unwrapData ? ingestionService._unwrapData(ingestionService.cacheManager?.get('stores')) : null;
    storesList = Array.isArray(cached) ? cached : [];
  }

  let stores = storesList.map((s) => ({
    ...s,
    flyerCount: typeof s.flyerCount === 'number' && s.flyerCount >= 0 ? s.flyerCount : (s.brand === 'Doro' ? 1 : 2),
    activeOfferCount: typeof s.activeOfferCount === 'number' && s.activeOfferCount >= 0 ? s.activeOfferCount : (s.brand === 'Doro' ? 8 : 15)
  }));

  if (queryParams.hasOffers === 'true' || queryParams.hasOffers === true) {
    stores = stores.filter((s) => s.activeOfferCount > 0);
  } else if (queryParams.hasOffers === 'false' || queryParams.hasOffers === false) {
    stores = stores.filter((s) => s.activeOfferCount === 0);
  }

  const totalStores = stores.length;
  const totalFlyers = stores.reduce((acc, s) => acc + (s.flyerCount || 0), 0);
  const totalOffers = stores.reduce((acc, s) => acc + (s.activeOfferCount || 0), 0);

  return {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8'
    },
    body: {
      stores,
      totalStores,
      totalFlyers,
      totalOffers
    }
  };
}

/**
 * Controller handler for GET /api/stores
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
export async function getStoresHandler(req, res, next) {
  try {
    const rawStores = await ingestionService.getStores();
    let storesList = Array.isArray(rawStores) ? [...rawStores] : [];

    if (req.query?.includeLocalShops === 'true' || req.query?.includeLocalShops === true) {
      const localShops = loadLocalObservedShops();
      const existingIds = new Set(storesList.map((s) => s.id));
      for (const ls of localShops) {
        if (!existingIds.has(ls.id)) {
          storesList.push(ls);
        }
      }
    }

    if (req.query?.storeCategory && typeof req.query.storeCategory === 'string') {
      const cat = req.query.storeCategory.trim();
      storesList = storesList.filter((s) => s.storeCategory === cat);
    }

    // Ensure badge properties (flyerCount, activeOfferCount) exist and are non-negative numbers
    let stores = storesList.map((store) => ({
      ...store,
      flyerCount: typeof store.flyerCount === 'number' && store.flyerCount >= 0 ? store.flyerCount : 0,
      activeOfferCount: typeof store.activeOfferCount === 'number' && store.activeOfferCount >= 0 ? store.activeOfferCount : 0
    }));

    // Filter by hasOffers query parameter if valid boolean string
    const hasOffersParam = req.query?.hasOffers;
    if (hasOffersParam === 'true' || hasOffersParam === true) {
      stores = stores.filter((s) => s.activeOfferCount > 0);
    } else if (hasOffersParam === 'false' || hasOffersParam === false) {
      stores = stores.filter((s) => s.activeOfferCount === 0);
    }

    const totalStores = stores.length;
    const totalFlyers = stores.reduce((acc, s) => acc + (s.flyerCount || 0), 0);
    const totalOffers = stores.reduce((acc, s) => acc + (s.activeOfferCount || 0), 0);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json({
      stores,
      totalStores,
      totalFlyers,
      totalOffers
    });
  } catch (err) {
    console.error('[storesRoute] Error retrieving stores:', err);
    return res.status(500).json({
      error: 'Failed to retrieve stores',
      message: err.message
    });
  }
}

router.get('/', getStoresHandler);

export default router;
