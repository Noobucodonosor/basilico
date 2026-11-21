/**
 * Basilico — Price History & Counter Observations Router (ADR-0007 / TASK-M1-02)
 * Location: server/routes/prices.js
 *
 * Endpoints:
 *  - GET  /api/prices/history : Lists price observations (flyer, receipt, counter)
 *  - POST /api/prices/observe : Records a quick "Prezzo visto al banco" observation
 *  - POST /api/prices/check   : Evaluates "È un vero sconto?" for a product payload
 */

import express from 'express';
import { priceHistoryService } from '../services/priceHistoryService.js';

const router = express.Router();

router.get('/history', (req, res, next) => {
  try {
    const observations = priceHistoryService.getAllObservations(req.query || {});
    res.status(200).json({
      observations,
      totalObservations: observations.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/observe', (req, res, next) => {
  try {
    const observation = priceHistoryService.recordObservation(req.body || {});
    res.status(201).json({
      observation,
      message: 'Prezzo registrato nello storico di Rapallo'
    });
  } catch (err) {
    next(err);
  }
});

router.post('/check', (req, res, next) => {
  try {
    const evaluation = priceHistoryService.evaluateRealDiscount(req.body || {});
    res.status(200).json({ evaluation });
  } catch (err) {
    next(err);
  }
});

export default router;
