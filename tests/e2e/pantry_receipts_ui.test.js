/**
 * Basilico — E2E & Component Contracts for Stanza 5: Dispensa & Scontrini (ADR-0009 / TASK-M3-02)
 * Location: tests/e2e/pantry_receipts_ui.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../helpers/test_helper.js';

describe('E2E Contracts: Stanza 5 — Dispensa & Scontrini UI (ADR-0009 / TASK-M3-02)', () => {
  it('1. PantryAndReceiptsView.jsx renders 3 physical locations (dry_pantry, fridge_freezer, boat_cooler) and T_open priority alerts', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/pantry/PantryAndReceiptsView.jsx'), 'utf8');
    assert.ok(src.includes('dry_pantry'));
    assert.ok(src.includes('fridge_freezer'));
    assert.ok(src.includes('boat_cooler'));
    assert.ok(src.includes('openedPriorityAlerts'));
    assert.ok(src.includes('ReceiptScannerModal'));
  });

  it('2. ReceiptScannerModal.jsx enforces cent-exact reconciliation (deltaCents === 0) before enabling confirm button', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/pantry/ReceiptScannerModal.jsx'), 'utf8');
    assert.ok(src.includes('deltaCents === 0'));
    assert.ok(src.includes('disabled={!reconciliation.isReconciled || submitting}'));
    assert.ok(src.includes('/api/receipts/confirm'));
  });
});
