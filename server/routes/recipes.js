/**
 * Basilico — Recipes, Tigullio Restaurants, Arbitrage & Science Cooking API (ADR-0011 / TASK-M5-01)
 * Location: server/routes/recipes.js
 */

import express from 'express';
import { recipeAndArbitrageService } from '../services/recipeAndArbitrageService.js';

const router = express.Router();

/**
 * GET /api/recipes
 * Query dishes with real-time Dual Cost, Arbitrage, Profile-Adapted Variants, and Tigullio Restaurants.
 */
router.get('/', async (req, res) => {
  try {
    const result = await recipeAndArbitrageService.queryDishes({
      sourceType: req.query.sourceType,
      restaurantId: req.query.restaurantId,
      course: req.query.course,
      mealContext: req.query.mealContext,
      q: req.query.q,
      servings: req.query.servings,
      sortBy: req.query.sortBy,
      limit: req.query.limit,
      offset: req.query.offset,
      deduplicateTwins: req.query.deduplicateTwins,
      excludeIncompatible: req.query.excludeIncompatible,
      profileId: req.query.profileId
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/recipes/8020
 * Computes the submodular 80/20 Max-Coverage ingredient basket.
 */
router.get('/8020', async (req, res) => {
  try {
    const result = await recipeAndArbitrageService.computeMaxCoverage8020({
      topK: req.query.topK
    });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * GET /api/recipes/lab-notes
 * Lists all Lab Notebook entries (or filtered by dishId).
 */
router.get('/lab-notes', (req, res) => {
  try {
    const entries = recipeAndArbitrageService.getLabNotesForDish(req.query.dishId || null);
    res.json({ entries, total: entries.length });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/recipes/deconstruct
 * On-demand deconstruction of a custom restaurant menu dish into a scientific BOM + CREA + Arbitrage sheet.
 */
router.post('/deconstruct', async (req, res) => {
  try {
    const dish = await recipeAndArbitrageService.deconstructCustomMenuDish(req.body || {});
    res.status(201).json({ dish });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/**
 * GET /api/recipes/:id/cooking-session
 * Returns the Harvard "Science & Cooking" step-by-step interactive session translated for the user's stove,
 * plus embedded Kitchen Reset protocols.
 */
router.get('/:id/cooking-session', async (req, res) => {
  try {
    const session = await recipeAndArbitrageService.getScientificCookingSession(req.params.id, {
      heatSource: req.query.heatSource,
      servings: req.query.servings,
      profileId: req.query.profileId
    });
    res.json(session);
  } catch (err) {
    res.status(err.status || 404).json({ error: err.message });
  }
});

/**
 * POST /api/recipes/:id/lab-notes
 * Saves a Lab Notebook entry for a dish (`rating`, `actualCookedWeightGrams`, `saltAndHydrationNotes`).
 */
router.post('/:id/lab-notes', (req, res) => {
  try {
    const entry = recipeAndArbitrageService.saveLabNote(req.params.id, req.body || {});
    res.status(201).json({ entry });
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

export default router;
