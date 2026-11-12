/**
 * Basilico — Smart Multi-Store Shopping List API Routes (ADR-0012 / TASK-M6-01)
 * Location: server/routes/shoppingList.js
 */

import express from 'express';
import { shoppingListService } from '../services/shoppingListService.js';

const router = express.Router();

/**
 * GET /api/shopping-list
 * Returns the current shopping list, aisle groupings, separated subtotals, and 1/2/3 store simulations.
 */
router.get('/', (_req, res, next) => {
  try {
    res.json(shoppingListService.getShoppingListState());
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shopping-list/items
 * Adds an item to the shopping list (from flyer, Stanza 4 Kitchen Reset, or manual entry).
 */
router.post('/items', (req, res, next) => {
  try {
    const state = shoppingListService.addItem(req.body || {});
    res.status(201).json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shopping-list/items/:id/toggle
 * Toggles the checked state of an item in aisle checklist mode.
 */
router.post('/items/:id/toggle', (req, res, next) => {
  try {
    const state = shoppingListService.toggleCheckItem(req.params.id);
    res.json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/shopping-list/items/:id
 * Removes an item from the shopping list.
 */
router.delete('/items/:id', (req, res, next) => {
  try {
    const state = shoppingListService.removeItem(req.params.id);
    res.json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shopping-list/items/:id/replace-plan-b
 * Replaces an out-of-stock item in the cart with the selected Plan B shelf substitute.
 */
router.post('/items/:id/replace-plan-b', (req, res, next) => {
  try {
    const state = shoppingListService.replaceItemWithPlanB(req.params.id, req.body || {});
    res.json(state);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/shopping-list/items/:id/plan-b
 * Returns immediate shelf Plan B substitutes for an out-of-stock item in Rapallo.
 */
router.get('/items/:id/plan-b', async (req, res, next) => {
  try {
    const planB = await shoppingListService.getShelfPlanB(req.params.id);
    res.json(planB);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/shopping-list/complete-and-load-pantry
 * Marks all items completed, loads purchased food packages into the 3-zone pantry, and clears the cart.
 */
router.post('/complete-and-load-pantry', (_req, res, next) => {
  try {
    const result = shoppingListService.completeShoppingAndLoadPantry();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
