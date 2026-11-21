/**
 * Basilico 2.0 — Hybrid Maestro Coach, "⚡ Oggi" Co-Pilot & Household Economics Router
 * Location: server/routes/maestro.js (ADR-0015 / TASK-V2-04)
 *
 * Mount target for Wave 2: `app.use('/api/maestro', maestroRouter)`
 * Endpoints:
 *  - GET  /today-copilot          -> Snapshot + 3 Pareto Tonight Cards + VaR_48h + Rapallo Store Yield
 *  - POST /chat                   -> Grounded Hybrid Maestro Chat (`askMaestro` with P0 safety guard)
 *  - GET  /calibration            -> Active rhythm preset (`sera_stanca`/`feriale`/`weekend_relax`) & overrides
 *  - POST /calibration            -> Update rhythm preset and/or optional advanced overrides (`€/h`, `kWh`, `Smc`)
 *  - PUT  /calibration            -> Idempotent alias for POST /calibration
 *  - GET  /economics/store-yield  -> Empirical Rapallo 1/2/3 store net `€/h` yield (including `parkingEase`)
 *  - POST /economics/store-yield  -> Custom simulation evaluation for Rapallo `€/h` yield
 *  - GET  /economics/tco          -> Cookware CapEx vs OpEx `CPU` & 10-year `TCO` ranges + Commodity vs Brand guide
 *  - GET  /economics/inflation    -> Personal Laspeyres Price Index ("Il Tuo ISTAT a Rapallo") & Shrinkflation Watchdog
 *  - POST /economics/meal-cost    -> Generalized Full Meal Cost (`C_full`) & Batch Cooking scale economies
 *  - POST /pantry-swipe/:id       -> 5-second Swipe Check (`applyQuickFractionUpdate`: 1.0 / 0.5 / 0)
 */

import express from 'express';
import { maestroCoachService } from '../services/maestroCoachService.js';
import { householdEconomicsService } from '../services/householdEconomicsService.js';
import { pantryService } from '../services/pantryService.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const maestroChatLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  maxRequests: 20,
  message: 'Limite chat Maestro raggiunto. Riprova tra qualche minuto.'
});

router.get('/today-copilot', async (req, res, next) => {
  try {
    const data = await maestroCoachService.getTodayCopilot({
      profileId: req.query.profileId || null,
      rhythmPreset: req.query.rhythmPreset || null
    });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
});

router.post('/chat', maestroChatLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    // ADR-0017: never accept untrusted contextOverride in production
    const safeContextOverride = process.env.NODE_ENV === 'production' ? null : (body.contextOverride || null);
    const result = await maestroCoachService.askMaestro({
      message: body.message,
      history: body.history || [],
      contextOverride: safeContextOverride,
      rhythmPreset: body.rhythmPreset || null,
      profileId: body.profileId || null
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/calibration', (req, res, next) => {
  try {
    const cal = householdEconomicsService.getCalibration(req.query.rhythmPreset || null);
    res.status(200).json(cal);
  } catch (err) {
    next(err);
  }
});

function handleUpdateCalibration(req, res, next) {
  try {
    const updated = householdEconomicsService.updateCalibration(req.body || {});
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
}

router.post('/calibration', handleUpdateCalibration);
router.put('/calibration', handleUpdateCalibration);

router.get('/economics/store-yield', (req, res, next) => {
  try {
    const result = householdEconomicsService.evaluateMultiStoreTimeYield({
      rhythmPreset: req.query.rhythmPreset || null,
      transportMode: req.query.transportMode || null,
      hourlyValueEuro:
        req.query.hourlyValueEuro !== undefined && req.query.hourlyValueEuro !== ''
          ? Number(req.query.hourlyValueEuro)
          : undefined
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/economics/store-yield', (req, res, next) => {
  try {
    const body = req.body || {};
    const result = householdEconomicsService.evaluateMultiStoreTimeYield({
      storeSimulations: body.storeSimulations,
      rhythmPreset: body.rhythmPreset || null,
      transportMode: body.transportMode || null,
      hourlyValueEuro: body.hourlyValueEuro
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/economics/tco', (req, res, next) => {
  try {
    const usesPerWeek =
      req.query.usesPerWeek !== undefined && req.query.usesPerWeek !== ''
        ? Number(req.query.usesPerWeek)
        : 3;
    const result = householdEconomicsService.evaluateCookwareTco({ usesPerWeek });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/economics/inflation', (req, res, next) => {
  try {
    const result = householdEconomicsService.computePersonalInflationAndShrinkflation();
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/economics/meal-cost', (req, res, next) => {
  try {
    const result = householdEconomicsService.computeGeneralizedMealCost(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/pantry-swipe/:id', (req, res, next) => {
  try {
    const body = req.body || {};
    const updated = pantryService.applyQuickFractionUpdate(req.params.id, body.fraction, {
      reason: body.reason
    });
    res.status(200).json(updated);
  } catch (err) {
    next(err);
  }
});

export default router;
