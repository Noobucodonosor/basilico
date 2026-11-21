/**
 * Basilico 2.0 — Nutrition Physiology & Adaptive Coaching API Router (ADR-0015 / TASK-V2-03)
 * Location: server/routes/nutritionCoach.js
 *
 * Mount target in Wave 2: app.use('/api/nutrition-coach', nutritionCoachRouter)
 *
 * Endpoints:
 *  - POST /api/nutrition-coach/evaluate-meal         : 30+ CREA cooked nutrients, USDA retention, Ca/Fe/Lycopene/RS3/AA bioavailability
 *  - GET  /api/nutrition-coach/presets               : 4 Zero-friction LARN V Rev. presets + optional personalized Mifflin-St Jeor target
 *  - POST /api/nutrition-coach/adapt                 : 1-tap adaptive coaching ("eat_out" & "emergency_5min" zero-cook rescue meals)
 *  - GET  /api/nutrition-coach/receipt-audit         : Passive 14–30d LARN sentinel audit on stored confirmed receipts
 *  - POST /api/nutrition-coach/receipt-audit         : Passive 14–30d LARN sentinel audit on custom receipt payload
 *  - GET  /api/nutrition-coach/bioavailability-guide : Scientific reference pillars & citations (Weaver, Hallberg, USDA, LARN V)
 */

import express from 'express';
import { nutritionPhysiologyService } from '../services/nutritionPhysiologyService.js';
import { receiptService } from '../services/receiptService.js';
import { mealPlannerService } from '../services/mealPlannerService.js';

const router = express.Router();

router.post('/evaluate-meal', (req, res, next) => {
  try {
    const body = req.body || {};
    if (!Array.isArray(body.ingredients) || body.ingredients.length === 0) {
      return res.status(400).json({
        error: 'Il campo ingredients (array non vuoto) è obbligatorio per valutare il pasto cotto.'
      });
    }
    const evaluation = nutritionPhysiologyService.evaluateCookedMealPhysiology(body);
    res.status(200).json(evaluation);
  } catch (err) {
    next(err);
  }
});

router.get('/presets', (req, res, next) => {
  try {
    const base = nutritionPhysiologyService.getPresets();
    const presetId = req.query.presetId ? String(req.query.presetId) : 'active_adult';
    const profileId = req.query.profileId ? String(req.query.profileId) : null;

    const hasAdvanced =
      req.query.weightKg !== undefined &&
      req.query.heightCm !== undefined &&
      req.query.ageYears !== undefined;

    const activeTargets = nutritionPhysiologyService.computePersonalizedLarnTargets({
      presetId,
      profileId,
      advancedParams: hasAdvanced
        ? {
            sex: req.query.sex || 'M',
            ageYears: Number(req.query.ageYears),
            weightKg: Number(req.query.weightKg),
            heightCm: Number(req.query.heightCm),
            laf: req.query.laf ? Number(req.query.laf) : 1.6,
            goalDeltaKcal: req.query.goalDeltaKcal ? Number(req.query.goalDeltaKcal) : 0
          }
        : null
    });

    res.status(200).json({
      ...base,
      activeTargets
    });
  } catch (err) {
    next(err);
  }
});

router.post('/adapt', async (req, res, next) => {
  try {
    const body = req.body || {};
    let planToUse = body.plan || null;

    if (!planToUse && body.useCurrentPlan === true) {
      const current = await mealPlannerService.getCurrentOrGeneratePlan({
        profileId: body.profileId || body.profile
      });
      planToUse = current.plan;
    }

    const result = nutritionPhysiologyService.adaptCoachingPlan({
      ...body,
      plan: planToUse
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/receipt-audit', async (req, res, next) => {
  try {
    const receipts = receiptService.getReceipts();
    const audit = await nutritionPhysiologyService.auditReceiptsNutritionalCoverage(receipts, {
      windowDays: req.query.windowDays ? Number(req.query.windowDays) : 21,
      profileId: req.query.profileId ? String(req.query.profileId) : null
    });
    res.status(200).json(audit);
  } catch (err) {
    next(err);
  }
});

router.post('/receipt-audit', async (req, res, next) => {
  try {
    const body = req.body || {};
    const receipts = Array.isArray(body.receipts) ? body.receipts : receiptService.getReceipts();
    const audit = await nutritionPhysiologyService.auditReceiptsNutritionalCoverage(receipts, {
      windowDays: body.windowDays ? Number(body.windowDays) : 21,
      profileId: body.profileId || null,
      activeOffers: Array.isArray(body.activeOffers) ? body.activeOffers : undefined
    });
    res.status(200).json(audit);
  } catch (err) {
    next(err);
  }
});

router.get('/bioavailability-guide', (req, res, next) => {
  try {
    const guide = nutritionPhysiologyService.getBioavailabilityGuide({
      profileId: req.query.profileId ? String(req.query.profileId) : null
    });
    res.status(200).json(guide);
  } catch (err) {
    next(err);
  }
});

export default router;
