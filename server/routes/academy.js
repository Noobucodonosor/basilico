/**
 * Basilico 2.0 — Culinary Academy, Cookware Physics, Ratios & 30s SOS Express Router (`TASK-V2-02`)
 * Location: server/routes/academy.js
 * Ready to be mounted at `/api/academy` in Wave 2 (`server/index.js`).
 */

import express from 'express';
import { cookwarePhysicsEngine } from '../services/cookwarePhysicsEngine.js';
import { culinaryAcademyService } from '../services/culinaryAcademyService.js';

const router = express.Router();

// 1. 12-Skill Tree & 5 Generative Pillars (`/skills`, `/curriculum`, `/competenze`)
const handleGetSkills = (req, res, next) => {
  try {
    const profileId = String(req.query.profileId || 'dany');
    const data = culinaryAcademyService.getSkillsCurriculum({ profileId });
    res.status(200).json(data);
  } catch (err) {
    next(err);
  }
};

router.get('/skills', handleGetSkills);
router.get('/curriculum', handleGetSkills);
router.get('/competenze', handleGetSkills);

router.post('/skills/practice', (req, res, next) => {
  try {
    const { profileId = 'dany', skillId, dishId = null, visualOutcome = 'perfect' } = req.body || {};
    if (!skillId) {
      return res.status(400).json({ error: 'Parametro obbligatorio mancante: skillId' });
    }
    const updated = culinaryAcademyService.recordSkillPractice({
      profileId,
      skillId,
      dishId,
      visualOutcome
    });
    res.status(200).json(updated);
  } catch (err) {
    if (err.status === 404) {
      return res.status(404).json({ error: err.message });
    }
    next(err);
  }
});

// 2. Ruhlman's Generative Ratios & 8x Zero-Cheese Umami Synergy
router.get('/ratios', (req, res, next) => {
  try {
    const ratios = culinaryAcademyService.getRatiosCatalog();
    res.status(200).json({ ratios });
  } catch (err) {
    next(err);
  }
});

router.post('/ratios/calculate', (req, res, next) => {
  try {
    const { ratioId, anchorGrams = 100, ingredients = [] } = req.body || {};
    const scaled = culinaryAcademyService.calculateGenerativeRatio({ ratioId, anchorGrams });
    const umami =
      Array.isArray(ingredients) && ingredients.length > 0
        ? culinaryAcademyService.computeZeroCheeseUmamiSynergy({ ingredients })
        : null;
    res.status(200).json({ ...scaled, umamiSynergy: umami });
  } catch (err) {
    next(err);
  }
});

router.post('/umami-synergy', (req, res, next) => {
  try {
    const { ingredients = [] } = req.body || {};
    const result = culinaryAcademyService.computeZeroCheeseUmamiSynergy({ ingredients });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 3. 30-Second Cooking SOS Diagnostic & Rescue
router.get('/sos', (req, res, next) => {
  try {
    const { symptomKey = null, q = '', heatSource = 'gas', toolId = null } = req.query;
    const result = culinaryAcademyService.solveCookingSOS({
      symptomKey: symptomKey ? String(symptomKey) : null,
      queryText: String(q || ''),
      heatSource: String(heatSource),
      toolId: toolId ? String(toolId) : null
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

router.post('/sos', (req, res, next) => {
  try {
    const result = culinaryAcademyService.solveCookingSOS(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 4. "Frigo -> Tecnica" Improvisation without Recipe
router.post('/improvise', (req, res, next) => {
  try {
    const result = culinaryAcademyService.improviseFromFridge(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

// 5. Cookware Thermophysics, Batching, P0 Validation, Knives & Storage Containers
router.get('/cookware-physics', (req, res, next) => {
  try {
    const catalog = cookwarePhysicsEngine.getMaterialsCatalog();
    const toolId = req.query.toolId ? String(req.query.toolId) : null;
    const profile = toolId
      ? cookwarePhysicsEngine.getCookwarePhysicsProfile({
          toolId,
          diameterCm: req.query.diameterCm,
          weightClass: req.query.weightClass,
          measuredMassGrams: req.query.measuredMassGrams
        })
      : null;
    res.status(200).json({ catalog, selectedToolProfile: profile });
  } catch (err) {
    next(err);
  }
});

router.post('/cookware-physics/evaluate', (req, res, next) => {
  try {
    const payload = req.body || {};
    const batching = cookwarePhysicsEngine.computeBatchingAndThermalDrop(payload);
    const stoveValidation = cookwarePhysicsEngine.translateStovePowerAndValidateP0(payload);
    const knifeAdvice = payload.knifeId || payload.boardId ? cookwarePhysicsEngine.adviseKnifeAndBoard(payload) : null;
    const containerAdvice = payload.containerContext
      ? cookwarePhysicsEngine.adviseStorageContainer({
          context: payload.containerContext,
          isHot: payload.isHot,
          isFatty: payload.isFatty,
          isAcidicOrTomato: payload.isAcidicOrTomato
        })
      : null;
    res.status(200).json({
      batching,
      stoveValidation,
      knifeAdvice,
      containerAdvice
    });
  } catch (err) {
    next(err);
  }
});

// 6. 1-Tap Lab Notebook Closed-Loop Calibration & Scale Mass Persistence
router.get('/calibration', (req, res, next) => {
  try {
    const heatSource = String(req.query.heatSource || 'gas');
    const toolId = String(req.query.toolId || 'padella_antiaderente');
    const calibration = cookwarePhysicsEngine.getCalibrationProfile({ heatSource, toolId });
    res.status(200).json({ calibration });
  } catch (err) {
    next(err);
  }
});

router.post('/calibration', (req, res, next) => {
  try {
    const result = cookwarePhysicsEngine.recordOneTapCalibration(req.body || {});
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
