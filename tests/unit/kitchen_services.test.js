/**
 * Basilico — Unit & API Tests for Kitchen Equipment ROI & Chemical Reset (ADR-0010 / TASK-M4-01)
 * Location: tests/unit/kitchen_services.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { KitchenInventoryService } from '../../server/services/kitchenInventoryService.js';
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
  });
});
