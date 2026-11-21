/**
 * Basilico — Supermarket Offers Application
 * Location: server/routes/flyers.js
 *
 * REST endpoint: GET /api/flyers
 * Contract:
 * - Returns: { flyers, totalFlyers }
 * - Supports query param: storeId (with whitespace trimming & special character tolerance)
 * - Enforces flyer schema contract: pages as array of ordered image URL strings, pageCount
 */

import express from 'express';
import { ingestionService } from '../services/ingestionService.js';

const router = express.Router();

/**
 * Controller handler for GET /api/flyers
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
export async function getFlyersHandler(req, res, next) {
  try {
    const rawStoreId = req.query?.storeId;
    const storeId = (typeof rawStoreId === 'string' && rawStoreId.trim().length > 0)
      ? rawStoreId.trim()
      : null;

    const rawFlyers = await ingestionService.getFlyers(storeId);
    const flyersList = Array.isArray(rawFlyers) ? rawFlyers : [];

    // Normalize flyer records to ensure pages is an array of image URL strings
    const flyers = flyersList.map((flyer) => {
      let pageUrls = [];
      if (Array.isArray(flyer.pages) && flyer.pages.length > 0) {
        pageUrls = flyer.pages.map((p) => (typeof p === 'string' ? p : (p?.imageUrl || flyer.coverImageUrl)));
      } else if (Array.isArray(flyer.pageImages) && flyer.pageImages.length > 0) {
        pageUrls = flyer.pageImages;
      } else if (flyer.coverImageUrl) {
        pageUrls = [flyer.coverImageUrl];
      }

      const pageCount = (typeof flyer.pageCount === 'number' && flyer.pageCount >= 1)
        ? flyer.pageCount
        : Math.max(1, pageUrls.length);

      return {
        ...flyer,
        pageCount,
        pages: pageUrls
      };
    });

    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json({
      flyers,
      totalFlyers: flyers.length
    });
  } catch (err) {
    console.error('[flyersRoute] Error retrieving flyers:', err);
    return next(err);
  }
}

router.get('/', getFlyersHandler);

export default router;
