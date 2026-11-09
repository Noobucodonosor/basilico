/**
 * Basilico — Kitchen Equipment, Cookware ROI & Chemical Reset Router (ADR-0010 / TASK-M4-01)
 * Location: server/routes/kitchen.js
 */

import express from 'express';
import { kitchenInventoryService } from '../services/kitchenInventoryService.js';
import { kitchenResetService } from '../services/kitchenResetService.js';

const router = express.Router();

router.get('/state', (req, res, next) => {
  try {
    const state = kitchenInventoryService.getKitchenState();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/config', (req, res, next) => {
  try {
    const updated = kitchenInventoryService.updateKitchenConfig(req.body || {});
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

router.get('/reset-protocol', async (req, res, next) => {
  try {
    const toolsParam = req.query.tools
      ? String(req.query.tools).split(',').map((s) => s.trim()).filter(Boolean)
      : ['padella_antiaderente', 'casseruola_inox', 'coltello_chef'];
    const protocol = await kitchenResetService.generateProtocol(toolsParam);
    res.status(200).json(protocol);
  } catch (err) {
    next(err);
  }
});

export default router;
