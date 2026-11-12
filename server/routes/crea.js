/**
 * Basilico — Official CREA Nutritional Database & Nutrients/€ Router (ADR-0008 / TASK-M2-01)
 * Location: server/routes/crea.js
 *
 * Endpoints:
 *  - GET  /api/crea/foods                : Search, filter, and rank the 832 CREA foods
 *  - GET  /api/crea/foods/:id            : Full 7-section academic nutritional sheet with dynamic weight/cooking calculation
 *  - GET  /api/crea/nutrients-per-euro   : Live ranking of Rapallo offers by Nutrients per Edible Euro
 *  - POST /api/crea/override             : Save 1-click user manual override Offer <-> CREA
 */

import express from 'express';
import { creaService } from '../services/creaService.js';
import { creaOfferMatcher } from '../services/creaOfferMatcher.js';
import { offerService, enrichOfferRecord } from '../services/offerService.js';

const router = express.Router();

router.get('/foods', (req, res, next) => {
  try {
    const result = creaService.searchAndRankFoods(req.query || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/foods/:id', async (req, res, next) => {
  try {
    const sheet = creaService.computeNutritionalSheet(req.params.id, {
      mode: req.query.mode || '100g_edible',
      grams: req.query.grams ? parseFloat(req.query.grams) : 100,
      state: req.query.state || 'as_is',
      per100gCooked: req.query.per100gCooked === 'true'
    });
    if (!sheet) {
      return res.status(404).json({ error: `Alimento CREA non trovato: ${req.params.id}` });
    }

    // Evaluate ALL active Rapallo food offers for this CREA food (never truncated at 100)
    const rawOffers = await offerService.getRawOffers();
    const matchingOffers = rawOffers
      .map((o) => enrichOfferRecord(o, req.query.profileId || null))
      .filter((o) => o && o.domain === 'food_human' && o.creaMatch && String(o.creaMatch.creaFoodId) === String(sheet.id));

    res.status(200).json({
      ...sheet,
      matchingRapalloOffers: matchingOffers
    });
  } catch (err) {
    next(err);
  }
});

router.get('/nutrients-per-euro', async (req, res, next) => {
  try {
    const metric = req.query.metric || 'proteinGPerEuro';
    const profileId = req.query.profileId || null;
    const hideIncompatible = req.query.hideIncompatible !== 'false';
    const storeId = req.query.storeId || null;

    const rawOffers = await offerService.getRawOffers();
    const allFoodOffers = rawOffers
      .map((o) => enrichOfferRecord(o, profileId))
      .filter((o) => o && o.domain === 'food_human');

    const ranked = creaOfferMatcher.rankOffersByNutrientPerEuro(allFoodOffers, {
      metric,
      storeId,
      hideIncompatible
    });

    res.status(200).json({
      metric,
      totalMatchedOffers: ranked.length,
      rankings: ranked
    });
  } catch (err) {
    next(err);
  }
});

router.post('/override', (req, res, next) => {
  try {
    const { offerIdOrTitle, creaFoodId } = req.body || {};
    if (!offerIdOrTitle || !creaFoodId) {
      return res.status(400).json({ error: 'offerIdOrTitle e creaFoodId sono obbligatori' });
    }
    const saved = creaOfferMatcher.setManualOverride(offerIdOrTitle, creaFoodId);
    res.status(200).json({ override: saved });
  } catch (err) {
    next(err);
  }
});

export default router;
