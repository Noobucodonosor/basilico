/**
 * Basilico — Unit & API Tests for Kitchen Equipment ROI & Chemical Reset (ADR-0010 / TASK-M4-01)
 * Location: tests/unit/kitchen_services.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KitchenInventoryService, normalizeDishCookwareIds } from '../../server/services/kitchenInventoryService.js';
import { kitchenResetService } from '../../server/services/kitchenResetService.js';

describe('ADR-0010 / TASK-M4-01: Kitchen Equipment ROI & Chemical Reset Protocol', () => {
  let tmpDir;
  let kitchenService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-m4-01-'));
    kitchenService = new KitchenInventoryService({
      storagePath: path.join(tmpDir, 'kitchen.json')
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. should provide default kitchen equipment, stove source, and compute Missing Cookware ROI', () => {
    const state = kitchenService.getKitchenState();
    assert.equal(state.heatSource, 'gas');
    assert.ok(state.effectiveTools.length >= 3);
    assert.ok(state.missingRoiOpportunities.length > 0);
    // Missing Casseruola Inox should report +73 unlocked dishes
    const casseruolaRoi = state.missingRoiOpportunities.find((m) => m.id === 'casseruola_inox');
    assert.ok(casseruolaRoi);
    assert.equal(casseruolaRoi.unlockedDishesCount, 73);
  });

  it('2. should disqualify non-ferromagnetic copper/terracotta cookware when stove is switched to induction', () => {
    kitchenService.updateKitchenConfig({
      heatSource: 'induction',
      ownedToolIds: ['padella_antiaderente', 'pentola_rame_non_induzione']
    });
    const state = kitchenService.getKitchenState();
    assert.equal(state.heatSource, 'induction');
    assert.equal(state.disqualifiedTools.length, 1);
    assert.equal(state.disqualifiedTools[0].id, 'pentola_rame_non_induzione');
    assert.ok(state.disqualifiedTools[0].disqualificationReason.includes('Foucault'));
  });

  it('3. should generate chemical Kitchen Reset protocols with thermal shock warnings and Tigotà/PiùMe offers', async () => {
    const res = await kitchenResetService.generateProtocol(['padella_antiaderente', 'casseruola_inox', 'mortaio']);
    assert.equal(res.protocols.length, 3);
    const ptfeProto = res.protocols.find((p) => p.toolId === 'padella_antiaderente');
    assert.ok(ptfeProto.thermalShockWarning.includes('PTFE'));
    assert.ok(ptfeProto.prohibitions.some((pr) => pr.includes('abrasivo')));

    const mortaioProto = res.protocols.find((p) => p.toolId === 'mortaio');
    assert.ok(mortaioProto.thermalShockWarning.includes('CaCO3'));
    assert.ok(Array.isArray(res.liveRapalloCleaningOffers));
    // Verify zero food, dolls, or perfumes leak into Kitchen Reset cleaning offers
    assert.ok(
      res.liveRapalloCleaningOffers.every(
        (o) => !/pizza|canestrell|barbie|parfum|peluche/i.test(`${o.title} ${o.brand || ''}`)
      ),
      'Kitchen Reset offers must strictly contain genuine cleaning supplies'
    );
    // Verify P0-Safety Chemical Incompatibility Matrix is exposed
    assert.ok(Array.isArray(res.chemicalSafetyMatrix) && res.chemicalSafetyMatrix.length >= 4);
    assert.ok(res.chemicalSafetyMatrix.some((r) => r.id === 'p0-bleach-acid' && /Cl2/.test(r.hazardFormula)));
  });

  it('4. should align cookware IDs 1:1 and keep totalUnlockedDishes <= totalCatalogDishes (ADR-0013 / TASK-REAL-04)', () => {
    const state = kitchenService.getKitchenState();
    assert.ok(state.totalCatalogDishes >= 264);
    assert.ok(
      state.totalUnlockedDishes <= state.totalCatalogDishes,
      `totalUnlockedDishes (${state.totalUnlockedDishes}) must never exceed totalCatalogDishes (${state.totalCatalogDishes})`
    );

    const archetypeIds = new Set(kitchenService.getArchetypes().map((a) => a.id));
    const pestoTools = normalizeDishCookwareIds(['mortaio', 'pentola', 'tagliere'], { title: 'Trofie al pesto ligure' });
    assert.ok(pestoTools.includes('mortaio'), 'Must emit canonical mortaio ID, not orphaned mortaio_marmo');
    assert.ok(pestoTools.every((id) => archetypeIds.has(id)), 'Every normalized tool ID must exist in cookware_archetypes.json');

    const tartareTools = normalizeDishCookwareIds(['bistecchiera', 'mortaio', 'spremiagrumi'], { title: 'Tartare di manzo tagliata al coltello' });
    assert.deepEqual(tartareTools, ['coltello_chef'], 'Cold raw tartare must not require bistecchiera or mortaio');
  });
});
