/**
 * Basilico — User Profiles & Dietary Exclusions Router (ADR-0007 / TASK-M1-02)
 * Location: server/routes/profiles.js
 *
 * Endpoints:
 *  - GET  /api/profiles          : Returns active profile and all available profiles
 *  - POST /api/profiles/active   : Switches the active profile (e.g., 'dany', 'barca', 'ospiti')
 *  - POST /api/profiles          : Creates or updates a user profile
 *  - GET  /api/profiles/export   : Exports profiles as portable JSON
 *  - POST /api/profiles/import   : Imports profiles from portable JSON
 */

import express from 'express';
import { userProfileService } from '../services/userProfileService.js';

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const state = userProfileService.getProfilesState();
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/active', (req, res, next) => {
  try {
    const { profileId } = req.body || {};
    const state = userProfileService.setActiveProfile(profileId);
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

router.post('/', (req, res, next) => {
  try {
    const profile = userProfileService.upsertProfile(req.body || {});
    res.status(200).json({
      profile,
      ...userProfileService.getProfilesState()
    });
  } catch (err) {
    next(err);
  }
});

router.get('/export', (req, res, next) => {
  try {
    const exported = userProfileService.exportProfilesJson();
    res.status(200).json(exported);
  } catch (err) {
    next(err);
  }
});

router.post('/import', (req, res, next) => {
  try {
    const state = userProfileService.importProfilesJson(req.body || {});
    res.status(200).json(state);
  } catch (err) {
    next(err);
  }
});

export default router;
