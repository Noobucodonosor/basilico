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
router.get('/', (_req, res) => {
  res.json(shoppingListService.getShoppingListState());
});

/**
 * POST /api/shopping-list/items
 * Adds an item to the shopping list (from flyer, Stanza 4 Kitchen Reset, or manual entry).
 */
router.post('/items', (req, res) => {
  try {
    const state = shoppingListService.addItem(req.body || {});
    res.status(201).json(state);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/**
 * POST /api/shopping-list/items/:id/toggle
 * Toggles the checked state of an item in aisle checklist mode.
 */
router.post('/items/:id/toggle', (req, res) => {
  try {
    const state = shoppingListService.toggleCheckItem(req.params.id);
    res.json(state);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message });
  }
});

/**
 * GET /api/shopping-list/items/:id/plan-b
 * Returns immediate shelf Plan B substitutes for an out-of-stock item in Rapallo.
 */
router.get('/items/:id/plan-b', async (req, res) => {
  try {
    const planB = await shoppingListService.getShelfPlanB(req.params.id);
    res.json(planB);
  } catch (err) {
    res.status(err.status || 404).json({ error: err.message });
  }
});

/**
 * POST /api/shopping-list/complete-and-load-pantry
 * Marks all items checked and loads all purchased food packages into the 3-zone pantry.
 */
router.post('/complete-and-load-pantry', (_req, res) => {
  try {
    const result = shoppingListService.completeShoppingAndLoadPantry();
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

export default router;
