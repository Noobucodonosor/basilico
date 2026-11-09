/**
 * Basilico — API Tests for /api/pantry and /api/receipts (ADR-0009 / TASK-M3-01)
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

describe('API Tests: Three-Zone Pantry & Receipt Reconciliation (/api/pantry & /api/receipts)', () => {
  let server;
  let baseUrl;
  let tmpDir;

  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-api-m3-'));
    pantryService.storagePath = path.join(tmpDir, 'pantry.json');
    pantryService._state = null;
    receiptService.storagePath = path.join(tmpDir, 'receipts.json');
    receiptService._receipts = null;
    priceHistoryService.storagePath = path.join(tmpDir, 'prices.json');
    priceHistoryService._observations = null;

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
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. GET /api/pantry returns items grouped across dry_pantry, fridge_freezer, and boat_cooler', async () => {
    const res = await fetch(`${baseUrl}/api/pantry`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(Array.isArray(data.items));
    assert.ok(data.byZone.dry_pantry);
    assert.ok(data.byZone.fridge_freezer);
    assert.ok(data.byZone.boat_cooler);
    assert.ok(Array.isArray(data.openedPriorityAlerts));
  });

  it('2. POST /api/receipts/parse parses raw receipt text and validates cent reconciliation', async () => {
    const rawText = [
      'PASSATA MUTTI 700G 1,69',
      'TONNO RIO MARE 3X80G 3,99',
      'SCONTO SOCIO -0,50',
      'TOTALE EURO 5,18'
    ].join('\n');

    const res = await fetch(`${baseUrl}/api/receipts/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rawText, storeId: 'coop-rapallo-sciesa' })
    });
    assert.equal(res.status, 200);
    const draft = await res.json();
    assert.equal(draft.isReconciled, true);
    assert.equal(draft.deltaCents, 0);
    assert.equal(draft.lines.length, 2);
  });

  it('3. POST /api/receipts/confirm returns 422 on cent mismatch and 201 when balanced', async () => {
    const badRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        declaredTotal: 9.99,
        lines: [{ title: 'Riso Carnaroli 1kg', lineTotal: 3.49 }]
      })
    });
    assert.equal(badRes.status, 422);

    const okRes = await fetch(`${baseUrl}/api/receipts/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storeId: 'coop-rapallo-sciesa',
        storeName: 'Coop Rapallo',
        declaredTotal: 3.49,
        lines: [{ title: 'Riso Carnaroli 1kg', lineTotal: 3.49 }]
      })
    });
    assert.equal(okRes.status, 201);
  });
});
