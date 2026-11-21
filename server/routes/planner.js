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
 * GET /api/planner/current
 * Returns the persisted active weekly plan and current shopping list without clobbering
 * existing promo/manual items, checked aisle flags, or prior meal swaps (`M-P1-01`).
 * Generates an initial plan ONLY if none exists yet.
 */
router.get('/current', async (req, res, next) => {
  try {
    const profileId = req.query?.profileId ? String(req.query.profileId) : undefined;
    const { plan, wasGenerated } = await mealPlannerService.getCurrentOrGeneratePlan({ profileId });
    let shoppingList = shoppingListService.getShoppingListState();

    // Only auto-seed the shopping list if a brand-new plan was generated AND the user doesn't
    // have an exclusive manual/flyer cart that would be unexpectedly diluted, OR if existing
    // meal_planner items need profile alignment while preserving checked flags.
    const hasPlannerItems = shoppingList.items.some((i) => i.source === 'meal_planner');
    if (wasGenerated && (shoppingList.items.length === 0 || hasPlannerItems)) {
      shoppingList = shoppingListService.syncFromWeeklyPlan(plan, { preserveChecked: true });
    }

    res.json({ plan, shoppingList });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/generate
 * Generates a weekly zero-waste whole-pack meal plan and syncs it to the shopping list.
 */
router.post('/generate', async (req, res, next) => {
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
    const shoppingList = shoppingListService.syncFromWeeklyPlan(plan, { preserveChecked: true });
    res.json({ plan, shoppingList });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/planner/swap-meal
 * Swaps a single meal in the current plan and updates the whole-pack ledger & shopping list.
 */
router.post('/swap-meal', async (req, res, next) => {
  try {
    const plan = await mealPlannerService.swapMealInPlan(req.body || {});
    const shoppingList = shoppingListService.syncFromWeeklyPlan(plan, { preserveChecked: true });
    res.json({ plan, shoppingList });
  } catch (err) {
    next(err);
  }
});

export default router;
