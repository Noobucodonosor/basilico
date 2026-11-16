/**
 * Basilico 2.0 — Room 7 Home & Boat Chemistry Router (ADR-0015 / TASK-V2-01)
 * Location: server/routes/homeChemistry.js
 *
 * Ready to be mounted at `/api/home-chemistry` in Wave 2:
 *   - GET/POST `/solve`          -> resolveStainOrSoil (4-Axis Sinner protocol + P0 red alerts)
 *   - GET/POST `/safety-check`   -> checkChemicalSafetyP0 (non-bypassable P0/P1 guard)
 *   - GET      `/minimal-kit`    -> getMinimalKitGuide (7 pillars calibrated to Rapallo °f)
 *   - GET      `/myths`          -> getMythBusters (stoichiometric myth-busting)
 *   - GET      `/appliances`     -> getApplianceMaintenancePlan (appliances + Boat module)
 *   - GET/POST `/offers-value`   -> evaluateDetergentOffersRapallo (ADR-0006 + Reg. 648/2004 intervals)
 *   - POST     `/decode-inci`    -> decodeDetergentInci (Reg. 648/2004 INCI decoder)
 */

import express from 'express';
import {
  homeChemistryService,
  resolveStainOrSoil,
  checkChemicalSafetyP0,
  getMinimalKitGuide,
  getApplianceMaintenancePlan,
  getMythBusters,
  evaluateDetergentOffersRapallo,
  decodeDetergentInci
} from '../services/homeChemistryService.js';

const router = express.Router();

function parseCsvParam(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map((x) => String(x).trim()).filter(Boolean);
  return String(raw)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

router.get('/matrix', (req, res, next) => {
  try {
    res.status(200).json(homeChemistryService.getMatrix());
  } catch (err) {
    next(err);
  }
});

const handleSolve = (req, res, next) => {
  try {
    const src = req.method === 'POST' ? req.body || {} : req.query || {};
    const result = resolveStainOrSoil({
      surface: src.surface || 'acciaio_inox_satinato',
      soil: src.soil || 'lipid_fresh',
      ownedKitKeys: parseCsvParam(src.ownedKitKeys || src.owned),
      waterHardnessF: src.waterHardnessF !== undefined ? Number(src.waterHardnessF) : 18,
      peakTempC: src.peakTempC !== undefined ? Number(src.peakTempC) : null,
      boatMode: src.boatMode === true || src.boatMode === 'true'
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

router.get('/solve', handleSolve);
router.post('/solve', handleSolve);

const handleSafetyCheck = (req, res, next) => {
  try {
    const src = req.method === 'POST' ? req.body || {} : req.query || {};
    const result = checkChemicalSafetyP0({
      reagents: src.reagents ? parseCsvParam(src.reagents) : [],
      surface: src.surface || '',
      containerType: src.containerType || '',
      applicationMethod: src.applicationMethod || '',
      waterTempC: src.waterTempC !== undefined ? Number(src.waterTempC) : null,
      queryText: src.queryText || src.q || '',
      boatMode: src.boatMode === true || src.boatMode === 'true'
    });
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
};

router.get('/safety-check', handleSafetyCheck);
router.post('/safety-check', handleSafetyCheck);

router.get('/minimal-kit', (req, res, next) => {
  try {
    const waterHardnessF =
      req.query.waterHardnessF !== undefined ? Number(req.query.waterHardnessF) : 18;
    const ownedKitKeys = parseCsvParam(req.query.ownedKitKeys || req.query.owned);
    res.status(200).json(getMinimalKitGuide({ waterHardnessF, ownedKitKeys }));
  } catch (err) {
    next(err);
  }
});

router.get('/myths', (req, res, next) => {
  try {
    const topic = req.query.topic || req.query.q || null;
    res.status(200).json({ myths: getMythBusters({ topic }) });
  } catch (err) {
    next(err);
  }
});

router.get('/appliances', (req, res, next) => {
  try {
    const applianceId = req.query.applianceId || req.query.id || null;
    const waterHardnessF =
      req.query.waterHardnessF !== undefined ? Number(req.query.waterHardnessF) : 18;
    const includeBoat = req.query.includeBoat !== 'false';
    res.status(200).json(
      getApplianceMaintenancePlan({ applianceId, waterHardnessF, includeBoat })
    );
  } catch (err) {
    next(err);
  }
});

const handleOffersValue = async (req, res, next) => {
  try {
    const src = req.method === 'POST' ? req.body || {} : req.query || {};
    const waterHardnessF =
      src.waterHardnessF !== undefined ? Number(src.waterHardnessF) : 18;
    const customOffers = Array.isArray(src.offers) ? src.offers : null;
    const report = await evaluateDetergentOffersRapallo(customOffers, { waterHardnessF });
    res.status(200).json(report);
  } catch (err) {
    next(err);
  }
};

router.get('/offers-value', handleOffersValue);
router.post('/offers-value', handleOffersValue);

router.post('/decode-inci', (req, res, next) => {
  try {
    const inciText = String(req.body?.inci || req.body?.inciText || '');
    res.status(200).json(decodeDetergentInci(inciText));
  } catch (err) {
    next(err);
  }
});

export default router;
