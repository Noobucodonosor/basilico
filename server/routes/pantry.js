/**
 * Basilico — Three-Zone Pantry Router (ADR-0009 / TASK-M3-01)
 * Location: server/routes/pantry.js
 */

import express from 'express';
import { pantryService } from '../services/pantryService.js';

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

export default router;
