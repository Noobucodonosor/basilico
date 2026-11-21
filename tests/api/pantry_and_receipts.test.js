/**
 * Basilico — API Tests for /api/pantry, /api/receipts, and /api/agentation (ADR-0009 / TASK-M3-01)
 * Location: tests/api/pantry_and_receipts.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/index.js';
import { pantryService } from '../../server/services/pantryService.js';
import { receiptService } from '../../server/services/receiptService.js';
import { priceHistoryService } from '../../server/services/priceHistoryService.js';

describe('API Tests: Three-Zone Pantry, Receipt Reconciliation & Agentation (/api/pantry, /api/receipts, /api/agentation)', () => {
  let server;
  let baseUrl;
  let tmpDir;
  let origPantryPath;
  let origReceiptPath;
  let origPricesPath;
  let origAgentationJsonPath;
  let origAgentationMdPath;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-api-m3-'));
    origPantryPath = pantryService.storagePath;
    origReceiptPath = receiptService.storagePath;
    origPricesPath = priceHistoryService.storagePath;
    origAgentationJsonPath = process.env.BASILICO_AGENTATION_JSON_PATH;
    origAgentationMdPath = process.env.BASILICO_AGENTATION_MD_PATH;

    pantryService.storagePath = path.join(tmpDir, 'pantry.json');
    pantryService._state = null;
    receiptService.storagePath = path.join(tmpDir, 'receipts.json');
    receiptService._receipts = null;
    priceHistoryService.storagePath = path.join(tmpDir, 'prices.json');
    priceHistoryService._observations = null;
    process.env.BASILICO_AGENTATION_JSON_PATH = path.join(tmpDir, 'agentation_inbox.json');
    process.env.BASILICO_AGENTATION_MD_PATH = path.join(tmpDir, 'agentation_inbox.md');

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
    receiptService.storagePath = origReceiptPath;
    receiptService._receipts = null;
    priceHistoryService.storagePath = origPricesPath;
    priceHistoryService._observations = null;

    if (origAgentationJsonPath === undefined) {
      delete process.env.BASILICO_AGENTATION_JSON_PATH;
    } else {
      process.env.BASILICO_AGENTATION_JSON_PATH = origAgentationJsonPath;
    }
    if (origAgentationMdPath === undefined) {
      delete process.env.BASILICO_AGENTATION_MD_PATH;
    } else {
      process.env.BASILICO_AGENTATION_MD_PATH = origAgentationMdPath;
    }

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. GET /api/pantry returns items grouped across 3 zones with Spaghetti creaFoodId = 000800 (M-P0-09)', async () => {
    const res = await fetch(`${baseUrl}/api/pantry`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    assert.ok(data.byZone.dry_pantry);
    assert.ok(data.byZone.fridge_freezer);
    assert.ok(data.byZone.boat_cooler);
    assert.ok(Array.isArray(data.openedPriorityAlerts));

    const spaghetti = data.items.find((i) => i.id === 'pantry-seed-1');
    assert.ok(spaghetti);
    assert.equal(spaghetti.creaFoodId, '000800');
  });

  it('2. POST /api/pantry/items rejects non-finite weights with 400 and consume clamps expiresAt <= closedExpiresAt (M-P0-02, M-P1-15)', async () => {
    const badRes = await fetch(`${baseUrl}/api/pantry/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Pane', initialWeightGrams: 'abc' })
    });
    assert.equal(badRes.status, 400);

    const closedDeadline = new Date(Date.now() + 12 * 3600 * 1000).toISOString();
    const createRes = await fetch(`${baseUrl}/api/pantry/items`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Ricotta Fresca',
        zone: 'fridge_freezer',
        initialWeightGrams: 250,
        tOpenHours: 72,
        closedExpiresAt: closedDeadline
      })
    });
    assert.equal(createRes.status, 201);
    const createdBody = await createRes.json();
    const created = createdBody.item;
    assert.equal(created.closedExpiresAt, closedDeadline);

    const openRes = await fetch(`${baseUrl}/api/pantry/items/${encodeURIComponent(created.id)}/consume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consumedGrams: 50 })
    });
    assert.equal(openRes.status, 200);
    const openedBody = await openRes.json();
    const opened = openedBody.item;
    assert.equal(opened.status, 'opened');
    assert.equal(opened.expiresAt, closedDeadline);
  });

  it('3. POST /api/pantry/consume-dish validates servings and never deducts canned tuna (123610) for raw tuna tartare (120600) (M-P1-13)', async () => {
    const badServings = await fetch(`${baseUrl}/api/pantry/consume-dish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishId: 'tigullio-dish-58', servings: 'bad' })
    });
    assert.equal(badServings.status, 400);

    const beforeRes = await fetch(`${baseUrl}/api/pantry`);
    const beforeData = await beforeRes.json();
    const cannedTunaBefore = beforeData.items.find((i) => i.id === 'pantry-seed-3');
    assert.ok(cannedTunaBefore);

    const consumeRes = await fetch(`${baseUrl}/api/pantry/consume-dish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dishId: 'tigullio-dish-58', servings: 1 })
    });
    assert.equal(consumeRes.status, 200);

    const afterRes = await fetch(`${baseUrl}/api/pantry`);
    const afterData = await afterRes.json();
    const cannedTunaAfter = afterData.items.find((i) => i.id === 'pantry-seed-3');
    assert.equal(cannedTunaAfter.remainingWeightGrams, cannedTunaBefore.remainingWeightGrams);
  });

  it('4. POST /api/receipts/parse filters IVA DI CUI fiscal noise while keeping CASSA ACQUA and 1L volume (M-P1-16)', async () => {
    const rawText = [
      'LATTE INTERO 1L 1,59',
      'CASSA ACQUA NAT 6X1,5L 2,40',
      'SCONTO SOCIO -0,50',
      'IVA DI CUI 0,35',
      'CASSA 02',
      'TOTALE COMPLESSIVO EURO 3,49'
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/receipts/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, storeId: 'rapallo-basko-colombo' })
    });
    assert.equal(res.status, 200);
    const draft = await res.json();
    assert.equal(draft.isReconciled, true);
    assert.equal(draft.deltaCents, 0);
    assert.equal(draft.lines.length, 2);
    assert.equal(draft.lines[0].packVolumeMl, 1000);
    assert.match(draft.lines[1].title, /CASSA ACQUA/i);
  });

  it('5. POST /api/receipts/confirm enforces 400/422 validation, 0,00€ promo items, 1000ml pantry load, and strict (id, revisionKey) idempotency (M-P0-02, M-P0-03, M-P1-16)', async () => {
    const nanRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        declaredTotal: 'abc',
        lines: [{ title: 'Riso Carnaroli 1kg', lineTotal: 3.49 }]
      })
    });
    assert.equal(nanRes.status, 400);

    const badRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        declaredTotal: 9.99,
        lines: [{ title: 'Riso Carnaroli 1kg', lineTotal: 3.49 }]
      })
    });
    assert.equal(badRes.status, 422);

    const payload = {
      id: 'rcpt-idem-api-1',
      revisionKey: 'rev-idem-api-1',
      storeId: 'rapallo-basko-colombo',
      storeName: 'Basko Rapallo',
      declaredTotal: 1.59,
      lines: [
        { title: 'Latte Fresco Intero 1L', lineTotal: 1.59, packVolumeMl: 1000, quantity: 1 },
        { title: 'Omaggio Promo Fedeltà', lineTotal: 0.0, quantity: 1 }
      ]
    };

    const firstRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(firstRes.status, 201);
    const firstBody = await firstRes.json();
    assert.equal(firstBody.recordedObservationsCount, 1);
    assert.equal(firstBody.pantryTransfer.addedItems.length, 2);
    const milkPantry = firstBody.pantryTransfer.addedItems.find((p) => /Latte/i.test(p.title));
    assert.equal(milkPantry.initialWeightGrams, 1000);
    assert.equal(milkPantry.zone, 'fridge_freezer');

    // Second identical submission with same (id, revisionKey): zero duplicate observations or pantry items
    const secondRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    assert.equal(secondRes.status, 201);
    const secondBody = await secondRes.json();
    assert.equal(secondBody.recordedObservationsCount, 0);
    assert.equal(secondBody.pantryTransfer.addedItems.length, 0);
    assert.equal(secondBody.receipt.pantryItemsAddedCount, 2);
  });

  it('6. POST /api/agentation enforces batch size cap (413) and writes safely to isolated path (M-P2-08)', async () => {
    const oversized = Array.from({ length: 101 }, (_, idx) => ({
      id: `ann-${idx}`,
      comment: 'Test'
    }));
    const res413 = await fetch(`${baseUrl}/api/agentation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ annotations: oversized })
    });
    assert.equal(res413.status, 413);

    const res201 = await fetch(`${baseUrl}/api/agentation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        annotations: [{ id: 'ann-ok-1', comment: 'Verifica bottone', url: '/?room=dispensa' }]
      })
    });
    assert.equal(res201.status, 201);
    const body = await res201.json();
    assert.equal(body.pendingCount, 1);
  });
});
