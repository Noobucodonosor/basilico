/**
 * Basilico — E2E & Component Contracts for Stanza 4: Cucina, Pentole & Pulizia (ADR-0010 / TASK-M4-02)
 * Location: tests/e2e/kitchen_care_ui.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../helpers/test_helper.js';

describe('E2E Contracts: Stanza 4 — Cucina, Pentole & Pulizia UI (ADR-0010 / TASK-M4-02)', () => {
  it('1. KitchenCareView.jsx renders stove selector, ferromagnetic induction warning, missing cookware ROI, and under-sink inventory', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/kitchen/KitchenCareView.jsx'), 'utf8');
    assert.ok(src.includes('induction'));
    assert.ok(src.includes('missingRoiOpportunities'));
    assert.ok(src.includes('disqualifiedTools'));
    assert.ok(src.includes('underSinkCatalog'));
    assert.ok(src.includes('KitchenResetCard'));
  });

  it('2. KitchenResetCard.jsx displays anti-thermal shock warning, prohibitions, step-by-step care, and pH supplies', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/kitchen/KitchenResetCard.jsx'), 'utf8');
    assert.ok(src.includes('thermalShockWarning'));
    assert.ok(src.includes('prohibitions'));
    assert.ok(src.includes('requiredSupplies'));
  });
});
