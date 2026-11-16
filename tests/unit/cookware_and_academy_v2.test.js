/**
 * Basilico 2.0 — Unit & Router Tests for Cookware Physics Engine & Culinary Academy (`TASK-V2-02`)
 * Location: tests/unit/cookware_and_academy_v2.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { CookwarePhysicsEngine } from '../../server/services/cookwarePhysicsEngine.js';
import { CulinaryAcademyService } from '../../server/services/culinaryAcademyService.js';
import { KitchenInventoryService } from '../../server/services/kitchenInventoryService.js';
import { kitchenResetService } from '../../server/services/kitchenResetService.js';
import academyRouter from '../../server/routes/academy.js';

describe('TASK-V2-02: Cookware Physics Engine, P0 Guards & Culinary Academy', () => {
  let tmpDir;
  let physics;
  let academy;
  let server;
  let baseUrl;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-v2-02-'));
    physics = new CookwarePhysicsEngine({
      storagePath: path.join(tmpDir, 'calibration.json')
    });
    academy = new CulinaryAcademyService({
      storagePath: path.join(tmpDir, 'academy.json'),
      physicsEngine: physics
    });

    const app = express();
    app.use(express.json());
    app.use('/api/academy', academyRouter);
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}/api/academy`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. ADR-0006 Materials Physics: separates Copper vs Terracotta (>180x diffusivity) & enforces discrete bands vs scale exact C=M*cp', () => {
    const catalog = physics.getMaterialsCatalog();
    assert.ok(catalog.metadata.sources.length >= 4);

    const copper = catalog.materials.copper_tinned;
    const terracotta = catalog.materials.terracotta_glazed;
    assert.ok(
      copper.thermalDiffusivityMm2S / terracotta.thermalDiffusivityMm2S > 180,
      'Copper thermal diffusivity must be >180x higher than terracotta'
    );
    assert.equal(copper.liningMeltingPointC, 231.9);

    // Without scale weighing -> certified discrete band, exactHeatCapacityJK === null (zero fake decimals!)
    const unweighed = physics.getCookwarePhysicsProfile({
      toolId: 'padella_acciaio_inox',
      weightClass: 'medium'
    });
    assert.equal(unweighed.confidenceMode, 'certified_discrete_band');
    assert.equal(unweighed.exactHeatCapacityJK, null);
    assert.equal(unweighed.arealHeatCapacityRangeKJm2K.length, 2);
    assert.ok(unweighed.arealHeatCapacityRangeKJm2K[1] > unweighed.arealHeatCapacityRangeKJm2K[0]);

    // With 1-time kitchen scale weighing (e.g. 1200g pan) -> exact physical heat capacity C = M_eff * cp
    const weighed = physics.getCookwarePhysicsProfile({
      toolId: 'padella_acciaio_inox',
      measuredMassGrams: 1200
    });
    assert.equal(weighed.confidenceMode, 'measured_scale_exact');
    // 1.2 kg * (1 - 0.15 handle) * 620 J/(kg*K) = 632.4 -> 632 J/K
    assert.equal(weighed.exactHeatCapacityJK, 632);
    assert.ok(weighed.arealHeatCapacityRangeKJm2K[0] > 10);
  });

  it('2. Retrocompatibility of cookware_archetypes.json: preserves legacy IDs while adding separated Testo Stagnato, Terracotta, Inox & Ferro Blu', async () => {
    const isolatedKitchen = new KitchenInventoryService({
      storagePath: path.join(tmpDir, 'kitchen-retro.json')
    });
    const archetypes = isolatedKitchen.getArchetypes();
    const ids = new Set(archetypes.map((a) => a.id));

    for (const requiredId of [
      'padella_antiaderente',
      'casseruola_inox',
      'pentola',
      'bistecchiera',
      'mortaio',
      'teglia_forno',
      'wok',
      'coltello_chef',
      'pentola_rame_non_induzione',
      'testo_rame_stagnato',
      'tegame_terracotta',
      'padella_acciaio_inox',
      'padella_ferro_blu',
      'termometro_sonda'
    ]) {
      assert.ok(ids.has(requiredId), `Missing expected archetype ID: ${requiredId}`);
    }

    // Verify legacy reset protocol compatibility for newly separated items
    const resetRes = await kitchenResetService.generateProtocol([
      'pentola_rame_non_induzione',
      'testo_rame_stagnato',
      'tegame_terracotta'
    ]);
    assert.equal(resetRes.protocols.length, 3);
    const testoProto = resetRes.protocols.find((p) => p.toolId === 'testo_rame_stagnato');
    assert.match(testoProto.thermalShockWarning, /232°C/);
  });

  it('3. P0 Safety Guards: blocks PTFE Boost/dry-preheat, Tinned Copper dry-preheat, Raw Copper acid, Ferrous long-acid & Inox cold-salt pitting', () => {
    // A. PTFE + Induction Boost -> P0-PTFE-NO-BOOST + capped power
    const ptfeCheck = physics.translateStovePowerAndValidateP0({
      heatSource: 'induction',
      requestedLevel: 'boost',
      toolId: 'padella_antiaderente'
    });
    assert.equal(ptfeCheck.isBlockedP0, true);
    assert.ok(ptfeCheck.p0Blocks.some((b) => b.code === 'P0-PTFE-NO-BOOST'));
    assert.ok(ptfeCheck.effectiveStepIndex <= 3, 'PTFE must be auto-capped at safe medium power');

    // B. Tinned Copper (`testo_rame_stagnato`) + Dry Preheat -> P0-TIN-NO-DRY-PREHEAT (Sn melts at 231.9°C)
    const tinCheck = physics.translateStovePowerAndValidateP0({
      heatSource: 'gas',
      requestedLevel: 'high',
      toolId: 'testo_rame_stagnato',
      isDryPreheat: true
    });
    assert.equal(tinCheck.isBlockedP0, true);
    assert.ok(tinCheck.p0Blocks.some((b) => b.code === 'P0-TIN-NO-DRY-PREHEAT'));

    // C. Raw Unlined Copper (`pentola_rame_non_induzione`) + Acid -> P0-RAW-COPPER-ACID-TOXICITY
    const rawCopperAcid = physics.translateStovePowerAndValidateP0({
      heatSource: 'gas',
      requestedLevel: 'medium',
      toolId: 'pentola_rame_non_induzione',
      hasAcidicIngredients: true
    });
    assert.equal(rawCopperAcid.isBlockedP0, true);
    assert.ok(rawCopperAcid.p0Blocks.some((b) => b.code === 'P0-RAW-COPPER-ACID-TOXICITY'));

    // D. Carbon Steel / Cast Iron + 25 min acidic tomato simmer -> P0-SEASONING-ACID-STRIP
    const ferroAcid = physics.translateStovePowerAndValidateP0({
      heatSource: 'gas',
      requestedLevel: 'medium',
      toolId: 'padella_ferro_blu',
      hasAcidicIngredients: true,
      acidDurationMinutes: 25
    });
    assert.equal(ferroAcid.isBlockedP0, true);
    assert.ok(ferroAcid.p0Blocks.some((b) => b.code === 'P0-SEASONING-ACID-STRIP'));

    // E. 18/10 Stainless Steel + Cold Water Salting -> P0-INOX-COLD-SALT-PITTING
    const inoxPitting = physics.translateStovePowerAndValidateP0({
      heatSource: 'induction',
      requestedLevel: 'high',
      toolId: 'pentola',
      coldWaterSaltingAttempt: true
    });
    assert.equal(inoxPitting.isBlockedP0, true);
    assert.ok(inoxPitting.p0Blocks.some((b) => b.code === 'P0-INOX-COLD-SALT-PITTING'));

    // F. Non-ferromagnetic Terracotta on Induction -> P0-INDUCTION-NON-FERROMAGNETIC
    const terraInd = physics.translateStovePowerAndValidateP0({
      heatSource: 'induction',
      requestedLevel: 'medium',
      toolId: 'tegame_terracotta'
    });
    assert.equal(terraInd.isBlockedP0, true);
    assert.ok(terraInd.p0Blocks.some((b) => b.code === 'P0-INDUCTION-NON-FERROMAGNETIC'));
  });

  it('4. Thermal Drop & Batching + 1-Tap Calibration + Knives & Marine Storage Advisors', () => {
    // Single filet (160g) in heavy 26cm carbon steel -> 1 batch
    const singleBatch = physics.computeBatchingAndThermalDrop({
      toolId: 'padella_ferro_blu',
      diameterCm: 26,
      weightClass: 'heavy',
      foodMassGrams: 160,
      foodInitialTempC: 4
    });
    assert.equal(singleBatch.recommendedBatches, 1);

    // 550g cold fridge protein crowded into light 22cm pan -> >=2 batches to avoid boiling below 140°C
    const crowdedBatch = physics.computeBatchingAndThermalDrop({
      toolId: 'padella_antiaderente',
      diameterCm: 22,
      weightClass: 'light',
      foodMassGrams: 550,
      foodInitialTempC: 4
    });
    assert.ok(crowdedBatch.recommendedBatches >= 2);
    assert.equal(crowdedBatch.crowdingRisk, true);

    // 1-Tap Lab Notebook Calibration (`overcooked_dry` lowers power step & time multiplier)
    const calRes = physics.recordOneTapCalibration({
      heatSource: 'induction',
      toolId: 'padella_acciaio_inox',
      visualOutcome: 'overcooked_dry',
      measuredPanMassGrams: 1150
    });
    assert.equal(calRes.calibration.powerStepDelta, -1);
    assert.ok(calRes.calibration.timeMultiplier < 1.0);
    assert.equal(calRes.measuredPanMassGrams, 1150);

    // Knife & Board Advisor flags glass board + Japanese 60-63 HRC on bones
    const badKnifeUse = physics.adviseKnifeAndBoard({
      knifeId: 'japanese_hard_60_63hrc',
      boardId: 'glass_marble_ceramic',
      task: 'trinciare ossa e lische grosse'
    });
    assert.equal(badKnifeUse.isSafePairing, false);
    assert.equal(badKnifeUse.alerts.length, 2);

    // Storage Container Advisor selects AISI 316 for boat cooler and warns on PP #5 with hot fatty tomato sauce
    const boatBox = physics.adviseStorageContainer({
      context: 'boat_cooler',
      isHot: false,
      isFatty: true,
      isAcidicOrTomato: true
    });
    assert.equal(boatBox.recommendedContainer.id, 'stainless_aisi_316_marine');

    const hotTomatoCheck = physics.adviseStorageContainer({
      context: 'home_fridge',
      isHot: true,
      isFatty: true,
      isAcidicOrTomato: true
    });
    assert.equal(hotTomatoCheck.recommendedContainer.id, 'borosilicate_glass');
    assert.equal(hotTomatoCheck.pp5Warnings.length, 2);
  });

  it('5. Culinary Academy: 12-Skill progression, verbosity adaptation, 30s SOS, Ratios, 8x Umami & Frigo->Tecnica', () => {
    const initial = academy.getSkillsCurriculum({ profileId: 'dany' });
    assert.equal(initial.totalSkills, 12);
    assert.equal(initial.fivePillars.length, 5);
    const leidenfrostSkill = initial.skills.find((s) => s.id === 'skill-03-leidenfrost-inox');
    assert.equal(leidenfrostSkill.masteryLevel, 'novice');
    const noviceLen = leidenfrostSkill.activeGuidanceText.length;

    // Practice 3 times perfectly -> advances to `master` with concise dashboard cue
    academy.recordSkillPractice({ profileId: 'dany', skillId: 'skill-03-leidenfrost-inox', visualOutcome: 'perfect' });
    academy.recordSkillPractice({ profileId: 'dany', skillId: 'skill-03-leidenfrost-inox', visualOutcome: 'perfect' });
    const afterThree = academy.recordSkillPractice({
      profileId: 'dany',
      skillId: 'skill-03-leidenfrost-inox',
      visualOutcome: 'perfect'
    });
    const masteredSkill = afterThree.skills.find((s) => s.id === 'skill-03-leidenfrost-inox');
    assert.equal(masteredSkill.masteryLevel, 'master');
    assert.ok(masteredSkill.activeGuidanceText.length < noviceLen, 'Master cue must be more concise than novice guide');

    // 30s SOS Fornelli via Italian natural language
    const sosBroken = academy.solveCookingSOS({
      queryText: 'aiuto si è stracciata la salsa con pozza d\'olio sul fondo',
      heatSource: 'induction',
      toolId: 'padella_acciaio_inox'
    });
    assert.equal(sosBroken.matchedSymptomId, 'emulsion_broken');
    assert.ok(sosBroken.rescueIn30Seconds.length >= 3);

    const sosBurnt = academy.solveCookingSOS({ queryText: 'aglio nero bruciato amaro' });
    assert.equal(sosBurnt.matchedSymptomId, 'bitter_burnt_fond');
    assert.match(sosBurnt.doNotDo, /MAI deglassare/i);

    // Ruhlman's Ratio scaling: Farinata Ligure 1:3 chickpea flour : water
    const farinata = academy.calculateGenerativeRatio({
      ratioId: 'ratio-farinata-ligure',
      anchorGrams: 150
    });
    assert.equal(farinata.scaledParts[0].grams, 150);
    assert.equal(farinata.scaledParts[1].grams, 450);

    // Zero-Cheese 8x Umami Synergy (Glutamate + IMP/GMP)
    const umamiFull = academy.computeZeroCheeseUmamiSynergy({
      ingredients: ['Sgombro fresco del Golfo', 'Pomodorini datterini', 'Olive taggiasche']
    });
    assert.equal(umamiFull.synergy8xActive, true);

    // Improvise From Fridge without recipe
    const improvised = academy.improviseFromFridge({
      availableIngredients: ['Alici fresche', 'Limoni liguri', 'Prezzemolo e capperi'],
      ownedToolIds: ['padella_antiaderente', 'coltello_chef'],
      heatSource: 'induction',
      maxMinutes: 15
    });
    assert.equal(improvised.selectedToolId, 'padella_antiaderente');
    assert.equal(improvised.steps.length, 3);
    assert.equal(improvised.umamiZeroCheeseAnalysis.synergy8xActive, true);
  });

  it('6. Express Router `/api/academy`: serves skills, SOS, ratios, cookware physics & calibration cleanly', async () => {
    const skillsRes = await fetch(`${baseUrl}/skills?profileId=dany`).then((r) => r.json());
    assert.equal(skillsRes.totalSkills, 12);

    const sosRes = await fetch(`${baseUrl}/sos?q=${encodeURIComponent('pesce che bolle e tira fuori acqua')}`).then((r) =>
      r.json()
    );
    assert.equal(sosRes.matchedSymptomId, 'fish_meat_boiling');

    const evalRes = await fetch(`${baseUrl}/cookware-physics/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        heatSource: 'induction',
        requestedLevel: 'boost',
        toolId: 'padella_antiaderente',
        foodMassGrams: 200
      })
    }).then((r) => r.json());
    assert.equal(evalRes.stoveValidation.isBlockedP0, true);
  });
});
