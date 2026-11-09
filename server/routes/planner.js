/**
 * Basilico — Weekly Meal Planner API Routes (ADR-0012 / TASK-M6-01)
 * Location: server/routes/planner.js
 */

import express from 'express';
import { mealPlannerService } from '../services/mealPlannerService.js';
import { shoppingListService } from '../services/shoppingListService.js';

const router = express.Router();

/**
 * GET /api/planner/models
 * Lists the 6 Neo-Dieta entry models.
 */
router.get('/models', (_req, res) => {
  res.json({ models: mealPlannerService.getModels() });
});

/**
 * POST /api/planner/generate
 * Generates a weekly zero-waste whole-pack meal plan and optionally syncs it to the shopping list.
 */
router.post('/generate', async (req, res) => {
  try {
    const body = req.body || {};
    const plan = await mealPlannerService.generateWeeklyPlan({
      modelId: body.modelId,
      daysCount: body.daysCount,
      servings: body.servings,
      budgetEur: body.budgetEur,
      dayModes: body.dayModes,
      profileId: body.profileId
    });
    const shoppingList = shoppingListService.syncFromWeeklyPlan(plan);
    res.json({ plan, shoppingList });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

/**
 * POST /api/planner/swap-meal
 * Swaps a single meal in the current plan and updates the whole-pack ledger & shopping list.
 */
router.post('/swap-meal', async (req, res) => {
  try {
    const plan = await mealPlannerService.swapMealInPlan(req.body || {});
    const shoppingList = shoppingListService.syncFromWeeklyPlan(plan);
    res.json({ plan, shoppingList });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
