/**
 * Basilico — Supermarket Offers Application
 * Location: server/routes/offers.js
 *
 * REST API Router for Promotional Offers (F6 - GET /api/offers)
 */

import express from 'express';
import { offerService, handleGetOffers } from '../services/offerService.js';

const router = express.Router();

/**
 * GET /api/offers
 *
 * Query parameters:
 *  - storeId: Supermarket store identifier (e.g. 'coop-rapallo-sciesa')
 *  - q / query: Free-text search term with accent normalization (e.g. 'caffè', 'pasta')
 *  - category: Grocery product category (e.g. 'Latticini e Formaggi')
 *  - minDiscount: Minimum discount percentage integer (e.g. 40)
 *  - sortBy: Sorting criterion ('discount_desc', 'price_asc', 'price_desc', 'name_asc')
 *  - page: 1-indexed page number (default 1)
 *  - limit: Maximum items per page (default 20, max 100)
 *  - onlyActive: Boolean flag to restrict to currently valid offers
 *
 * Response shape:
 *  {
 *    offers: PromotionItem[],
 *    totalOffers: number,
 *    page: number,
 *    limit: number,
 *    totalPages: number,
 *    categories: string[],
 *    facets: { categories, stores, discountRanges }
 *  }
 */
export async function getOffersHandler(req, res, next) {
  try {
    const result = await offerService.getOffers(req.query);
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}

router.get('/', getOffersHandler);

// Re-export reference oracle for test harnesses and dynamic module imports
export { handleGetOffers };
export default router;
