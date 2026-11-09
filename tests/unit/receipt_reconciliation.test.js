/**
 * Basilico — Unit Tests for Receipt Cent-Exact Reconciliation & 3-Zone Pantry (ADR-0009 / TASK-M3-01)
 * Location: tests/unit/receipt_reconciliation.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReceiptService, validateReceiptCentReconciliation } from '../../server/services/receiptService.js';
import { PantryService } from '../../server/services/pantryService.js';
import { PriceHistoryService } from '../../server/services/priceHistoryService.js';

describe('ADR-0009 / TASK-M3-01: Receipt Cent-Exact Reconciliation & Three-Zone Pantry', () => {
  let tmpDir;
  let pantryService;
  let priceService;
  let receiptService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-m3-01-'));
    pantryService = new PantryService({
      storagePath: path.join(tmpDir, 'pantry.json')
    });
    priceService = new PriceHistoryService({
      storagePath: path.join(tmpDir, 'prices.json')
    });
    receiptService = new ReceiptService({
      storagePath: path.join(tmpDir, 'receipts.json'),
      priceHistoryService: priceService,
      pantryService
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. should reject receipt confirmation when cent reconciliation delta !== 0', () => {
    const check = validateReceiptCentReconciliation({
      declaredTotal: 10.00,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Olio EVO 1L', lineTotal: 8.50 }
      ],
      discounts: []
    });
    assert.equal(check.isReconciled, false);
    assert.equal(check.deltaCents, -1); // 9.99 vs 10.00 -> -1 cent

    assert.throws(() => {
      receiptService.confirmReceipt({
        declaredTotal: 10.00,
        lines: [
          { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
          { title: 'Olio EVO 1L', lineTotal: 8.50 }
        ]
      });
    }, /Scarto di quadratura/);
  });

  it('2. should confirm receipt when sum(lines) - sum(discounts) === declaredTotal to the exact cent', () => {
    const res = receiptService.confirmReceipt({
      id: 'rcpt-test-101',
      storeId: 'basko-rapallo-colombo',
      storeName: 'Basko Rapallo',
      declaredTotal: 8.79,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Filetti di Orata Fresca 400g', lineTotal: 6.50 },
        { title: 'Detersivo Piatti Svelto 1L', lineTotal: 2.00 }
      ],
      discounts: [
        { label: 'Buono Prima Card Basko', amount: 1.20 }
      ],
      revisionKey: 'v1'
    });

    assert.equal(res.reconciliation.isReconciled, true);
    assert.equal(res.reconciliation.deltaCents, 0);
    assert.equal(res.recordedObservationsCount, 3);
    // Only the 2 food_human items enter the pantry (Svelto detergent is excluded by domain guardrail)
    assert.equal(res.pantryTransfer.addedItems.length, 2);
  });

  it('3. should guarantee idempotency on repeated receipt confirmation with the same revisionKey', () => {
    const secondCall = receiptService.confirmReceipt({
      id: 'rcpt-test-101',
      storeId: 'basko-rapallo-colombo',
      declaredTotal: 8.79,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Filetti di Orata Fresca 400g', lineTotal: 6.50 },
        { title: 'Detersivo Piatti Svelto 1L', lineTotal: 2.00 }
      ],
      discounts: [{ label: 'Buono Prima Card Basko', amount: 1.20 }],
      revisionKey: 'v1'
    });

    assert.equal(secondCall.pantryTransfer.alreadyApplied, true);
    assert.equal(secondCall.pantryTransfer.addedItems.length, 0);
  });

  it('4. should manage 3 pantry zones (dry_pantry, fridge_freezer, boat_cooler) and start T_open clock when opened', () => {
    const added = pantryService.addItem({
      title: 'Trancio di Salmone Fresco',
      zone: 'fridge_freezer',
      initialWeightGrams: 300,
      status: 'closed'
    });
    assert.equal(added.status, 'closed');
    assert.equal(added.expiresAt, null);

    // Consume 150g -> automatically transitions to 'opened' and sets expiresAt = openedAt + 36h
    const opened = pantryService.consumeOrOpenItem(added.id, { gramsUsed: 150 });
    assert.equal(opened.status, 'opened');
    assert.equal(opened.remainingWeightGrams, 150);
    assert.ok(opened.openedAt);
    assert.ok(opened.expiresAt);
    assert.ok(opened.hoursRemaining > 30 && opened.hoursRemaining <= 36);
  });
});
