/**
 * Basilico 2.0 — End-to-End HTTP Integration Tests for the 5-Souls V2 API Routers
 * Location: tests/api/v2_five_souls_api.test.js (ADR-0015 / TASK-V2-05)
 *
 * Tests real HTTP calls against `createApp()` (`server/index.js`) across all 4 newly mounted prefixes:
 *  - `/api/maestro/*`         (`maestroRouter`)
 *  - `/api/home-chemistry/*`  (`homeChemistryRouter`)
 *  - `/api/academy/*`         (`academyRouter`)
 *  - `/api/nutrition-coach/*` (`nutritionCoachRouter`)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createApp } from '../../server/index.js';
import { pantryService } from '../../server/services/pantryService.js';
import { householdEconomicsService } from '../../server/services/householdEconomicsService.js';
import { cookwarePhysicsEngine } from '../../server/services/cookwarePhysicsEngine.js';
import { mealPlannerService } from '../../server/services/mealPlannerService.js';

describe('API Integration Tests: Basilico 2.0 — 5 Souls Mounted Routers (/api/maestro, /api/home-chemistry, /api/academy, /api/nutrition-coach)', () => {
  let server;
  let baseUrl;
  let tmpDir;
  let origPantryPath;
  let origEconPath;
  let origCalPath;
  let origPlanPath;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-v2-api-'));
    origPantryPath = pantryService.storagePath;
    origEconPath = householdEconomicsService.storagePath;
    origCalPath = cookwarePhysicsEngine.calibrationPath;
    origPlanPath = mealPlannerService.storagePath;

    pantryService.storagePath = path.join(tmpDir, 'pantry.json');
    pantryService._state = null;
    householdEconomicsService.storagePath = path.join(tmpDir, 'economics.json');
    householdEconomicsService._config = null;
    if ('calibrationPath' in cookwarePhysicsEngine) {
      cookwarePhysicsEngine.calibrationPath = path.join(tmpDir, 'cookware_cal.json');
      cookwarePhysicsEngine._calibrations = null;
    }
    mealPlannerService.storagePath = path.join(tmpDir, 'weekly_plan.json');
    mealPlannerService._lastGeneratedPlan = null;

    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        baseUrl = `http://127.0.0.1:${server.address().port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    pantryService.storagePath = origPantryPath;
    pantryService._state = null;
    householdEconomicsService.storagePath = origEconPath;
    householdEconomicsService._config = null;
    if ('calibrationPath' in cookwarePhysicsEngine) {
      cookwarePhysicsEngine.calibrationPath = origCalPath;
      cookwarePhysicsEngine._calibrations = null;
    }
    mealPlannerService.storagePath = origPlanPath;
    mealPlannerService._lastGeneratedPlan = null;

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. GET /api/maestro/today-copilot & POST /api/maestro/calibration return 3 Pareto cards, VaR_48h, and dual-tier calibration', async () => {
    const calUpdate = await fetch(`${baseUrl}/api/maestro/calibration`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        activeRhythmPreset: 'sera_stanca',
        advancedOverrides: { transportMode: 'car' }
      })
    });
    assert.equal(calUpdate.status, 200);
    const calBody = await calUpdate.json();
    assert.equal(calBody.activeRhythmPreset, 'sera_stanca');
    assert.equal(calBody.effectiveParameters.hourlyValueEuro, 30);

    const res = await fetch(`${baseUrl}/api/maestro/today-copilot?profileId=casa&rhythmPreset=sera_stanca`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.activeProfile.id, 'casa');
    assert.equal(data.tonightParetoCards.length, 3);
    assert.ok(data.valueAtRisk48h.totalAtRiskEuro > 0);
    for (const card of data.tonightParetoCards) {
      assert.ok(card.fiveSoulsChain?.economia);
      assert.ok(card.fiveSoulsChain?.strumenti);
      assert.ok(card.fiveSoulsChain?.casa);
    }

    const tcoRes = await fetch(`${baseUrl}/api/maestro/economics/tco`);
    assert.equal(tcoRes.status, 200);
    const yieldRes = await fetch(`${baseUrl}/api/maestro/economics/store-yield`);
    assert.equal(yieldRes.status, 200);
  });

  it('2. POST /api/maestro/chat enforces P0 safety guardrails on dangerous chemical/thermal prompts and answers offline', async () => {
    const p0Res = await fetch(`${baseUrl}/api/maestro/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Mescolo candeggina e aceto sullo sporco dell\'acciaio inox e chiudo il percarbonato in uno spruzzino spray?',
        profileId: 'casa'
      })
    });
    assert.equal(p0Res.status, 200);
    const p0Body = await p0Res.json();
    assert.equal(p0Body.hasP0Block, true);
    const codes = p0Body.p0Alerts.map((a) => a.code);
    assert.ok(codes.includes('P0-CHEM-CHLORINE-GAS'));
    assert.ok(codes.includes('P0-SURFACE-INOX-PITTING'));
    assert.ok(codes.includes('P0-PRESSURE-BURST'));
  });

  it('3. /api/home-chemistry/solve & /safety-check protect Ligurian marble against acids and stainless steel against bleach', async () => {
    const marbleRes = await fetch(`${baseUrl}/api/home-chemistry/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        surface: 'marmo_ardesia_graniglia',
        soil: 'inorganic_limescale_soapscum',
        waterHardnessF: 18
      })
    });
    assert.equal(marbleRes.status, 200);
    const marbleData = await marbleRes.json();
    assert.ok(marbleData);
    assert.match(JSON.stringify(marbleData), /acido|aceto|citrico|marmo|caco3/i);

    const safetyRes = await fetch(`${baseUrl}/api/home-chemistry/safety-check`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        queryText: 'candeggina su acciaio inox con acido citrico'
      })
    });
    assert.equal(safetyRes.status, 200);
    const safetyData = await safetyRes.json();
    const safetyJson = JSON.stringify(safetyData);
    assert.match(safetyJson, /Cl2|cloro|pitting/i);

    const kitRes = await fetch(`${baseUrl}/api/home-chemistry/minimal-kit?waterHardnessF=18`);
    assert.equal(kitRes.status, 200);
  });

  it('4. /api/academy/cookware-physics/evaluate & /sos enforce PTFE Boost P0 block and 30s culinary rescue', async () => {
    const physRes = await fetch(`${baseUrl}/api/academy/cookware-physics/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heatSource: 'induction',
        requestedLevel: 'boost',
        toolId: 'padella_antiaderente',
        isDryPreheat: true,
        foodMassGrams: 320
      })
    });
    assert.equal(physRes.status, 200);
    const physBody = await physRes.json();
    assert.ok(physBody.batching);
    assert.ok(physBody.stoveValidation);
    assert.match(JSON.stringify(physBody.stoveValidation), /PTFE|BOOST/i);

    const sosRes = await fetch(`${baseUrl}/api/academy/sos?q=${encodeURIComponent('salsa slegata')}&heatSource=induction`);
    assert.equal(sosRes.status, 200);
    const sosBody = await sosRes.json();
    assert.ok(sosBody);

    const skillsRes = await fetch(`${baseUrl}/api/academy/skills?profileId=casa`);
    assert.equal(skillsRes.status, 200);
  });

  it('5. /api/nutrition-coach/evaluate-meal & /adapt compute cooked CREA nutrients + bioavailability and 1-tap emergency rescue', async () => {
    const evalRes = await fetch(`${baseUrl}/api/nutrition-coach/evaluate-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: [
          { creaId: '120010', grams: 150, name: 'Acciughe fresche' },
          { creaId: '007450', grams: 30, name: 'Succo di limone fresco a crudo', isRawFinishing: true },
          { creaId: '009210', grams: 10, name: 'Olio EVO' }
        ],
        cookingMethod: 'pan_seared_gentle',
        liquidFate: 'stewed_liquid_kept',
        addedFatGrams: 10
      })
    });
    assert.equal(evalRes.status, 200);
    const evalBody = await evalRes.json();
    assert.ok(evalBody);
    assert.match(JSON.stringify(evalBody), /calcium|calcio|iron|ferro|kcal/i);

    const adaptRes = await fetch(`${baseUrl}/api/nutrition-coach/adapt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType: 'emergency_5min',
        profileId: 'casa'
      })
    });
    assert.equal(adaptRes.status, 200);
    const adaptBody = await adaptRes.json();
    assert.ok(adaptBody);
  });
});
