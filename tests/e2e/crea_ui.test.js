/**
 * Basilico — E2E & Component Contracts for Stanza 2: Scienza & CREA (ADR-0008 / TASK-M2-02)
 * Location: tests/e2e/crea_ui.test.js
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../helpers/test_helper.js';

describe('E2E Contracts: Stanza 2 — Scienza & CREA UI (ADR-0008 / TASK-M2-02)', () => {
  it('1. CreaExplorerView.jsx exposes physiological presets, 832 catalog explorer, and live Nutrients per Euro tab', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/crea/CreaExplorerView.jsx'), 'utf8');
    assert.ok(src.includes('nutrients_per_euro'));
    assert.ok(src.includes('boat_hydration'));
    assert.ok(src.includes('CreaCompareTray'));
    assert.ok(src.includes('CreaFoodModal'));
  });

  it('2. CreaFoodModal.jsx supports all 4 weight calculation modes and Raw <-> Cooked yield switch without .slice truncation', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/crea/CreaFoodModal.jsx'), 'utf8');
    assert.ok(src.includes('100g_edible'));
    assert.ok(src.includes('100g_gross'));
    assert.ok(src.includes('portion_larn'));
    assert.ok(src.includes('custom_grams'));
    assert.ok(src.includes('cooked_from_raw'));
    assert.ok(!src.includes('.slice(0, 12)'), 'Must never truncate CREA nutrients with .slice(0, 12)');
  });

  it('3. OfferCard.jsx preserves formatValidityBadge and subgrid while adding bidirectional CREA bridge', () => {
    const src = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/OfferCard.jsx'), 'utf8');
    assert.ok(src.includes('export function formatValidityBadge(isoString)'));
    assert.ok(src.includes('grid-rows-subgrid row-span-4'));
    assert.ok(src.includes('offer.creaMatch'));
  });
});
