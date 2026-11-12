/**
 * Basilico — Three-Zone Pantry Router (ADR-0009 / TASK-M3-01)
 * Location: server/routes/pantry.js
 */

import express from 'express';
import { pantryService } from '../services/pantryService.js';
import { recipeAndArbitrageService } from '../services/recipeAndArbitrageService.js';

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const state = pantryService.getPantryState(req.query || {});
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/items', (req, res, next) => {
  try {
    const item = pantryService.addItem(req.body || {});
    res.status(201).json({
      item,
      ...pantryService.getPantryState()
    });
  } catch (err) {
    next(err);
  }
});

router.post('/items/:id/consume', (req, res, next) => {
  try {
    const updated = pantryService.consumeOrOpenItem(req.params.id, req.body || {});
    res.status(200).json({
      item: updated,
      ...pantryService.getPantryState()
    });
  } catch (err) {
    next(err);
  }
});

router.post('/consume-dish', async (req, res, next) => {
  try {
    const body = req.body || {};
    const servings = Math.max(1, Number(body.servings) || 1);

    if (Array.isArray(body.bom) && body.bom.length > 0) {
      const result = pantryService.consumeDishIngredients({
        dishId: body.dishId || null,
        dishTitle: body.dishTitle || null,
        servings,
        bom: body.bom
      });
      return res.status(200).json(result);
    }

    if (!body.dishId) {
      const err = new Error('dishId o bom obbligatori per lo scarico dispensa post-cottura');
      err.status = 400;
      throw err;
    }

    const allDishes = recipeAndArbitrageService.getDishesSeed();
    const dish = allDishes.find((d) => d.id === body.dishId || String(d.numericId) === String(body.dishId));
    if (!dish) {
      const err = new Error(`Piatto non trovato per scarico dispensa: ${body.dishId}`);
      err.status = 404;
      throw err;
    }

    const evaluated = await recipeAndArbitrageService.evaluateDish(dish, {
      servings,
      profileId: body.profileId || null
    });
    const result = pantryService.consumeDishIngredients({
      dishId: evaluated.id,
      dishTitle: evaluated.title,
      servings: evaluated.servings,
      bom: evaluated.bom
    });
    return res.status(200).json(result);
  } catch (err) {
    return next(err);
  }
});

export default router;
