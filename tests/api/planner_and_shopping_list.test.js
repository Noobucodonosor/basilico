/**
 * Basilico — API Integration Tests for Stanza 6 (/api/planner & /api/shopping-list) (ADR-0012 / TASK-M6-01)
 * Location: tests/api/planner_and_shopping_list.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/index.js';
import { shoppingListService } from '../../server/services/shoppingListService.js';

function requestJson(server, method, reqPath, body = null) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const payload = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: addr.port,
        path: reqPath,
        method,
        headers: payload
          ? {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            }
          : {}
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

test('API /api/planner & /api/shopping-list — Full Stanza 6 Workflow', async (t) => {
  const origPath = shoppingListService.storagePath;
  const origState = shoppingListService._state;
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-shop-api-'));
  shoppingListService.storagePath = path.join(tmpDir, 'shopping_list.json');
  shoppingListService._state = null;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.close();
    shoppingListService.storagePath = origPath;
    shoppingListService._state = origState;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // 1. GET /api/planner/models
  const modelsRes = await requestJson(server, 'GET', '/api/planner/models');
  assert.equal(modelsRes.status, 200);
  assert.equal(modelsRes.body.models.length, 6);

  // 2. POST /api/planner/generate
  const genRes = await requestJson(server, 'POST', '/api/planner/generate', {
    modelId: 'ligurian_traditional',
    daysCount: 7,
    servings: 1,
    budgetEur: 70
  });
  assert.equal(genRes.status, 200);
  assert.equal(genRes.body.plan.days.length, 7);
  assert.ok(genRes.body.shoppingList.items.length > 0);
  assert.equal(genRes.body.shoppingList.storeSimulations.length, 3);

  // 3. POST /api/planner/swap-meal
  const swapRes = await requestJson(server, 'POST', '/api/planner/swap-meal', {
    dayIndex: 1,
    slot: 'lunch'
  });
  assert.equal(swapRes.status, 200);
  assert.ok(swapRes.body.plan.days[0].lunch.dish);

  // 4. POST /api/shopping-list/items (add Kitchen Reset supply)
  const addRes = await requestJson(server, 'POST', '/api/shopping-list/items', {
    name: 'Spugne Antigraffio Cellulosa Tigotà',
    domain: 'home_cleaning',
    source: 'kitchen_care',
    packsToBuy: 1,
    unitPriceEur: 1.99
  });
  assert.equal(addRes.status, 201);
  assert.ok(addRes.body.subtotals.homeAndKitchenSubtotalEur >= 1.99);

  // 5. GET /api/shopping-list/items/:id/plan-b
  const targetId = addRes.body.items[0].id;
  const planBRes = await requestJson(server, 'GET', `/api/shopping-list/items/${encodeURIComponent(targetId)}/plan-b`);
  assert.equal(planBRes.status, 200);
  assert.equal(planBRes.body.originalItem.id, targetId);

  // 6. POST /api/shopping-list/items/:id/replace-plan-b & DELETE /api/shopping-list/items/:id
  const replRes = await requestJson(
    server,
    'POST',
    `/api/shopping-list/items/${encodeURIComponent(targetId)}/replace-plan-b`,
    { title: 'Spugne Vegetali PiùMe Rapallo', price: 1.49, chainName: 'PiùMe Rapallo' }
  );
  assert.equal(replRes.status, 200);
  assert.equal(replRes.body.items.find((i) => i.id === targetId)?.name, 'Spugne Vegetali PiùMe Rapallo');

  const delRes = await requestJson(server, 'DELETE', `/api/shopping-list/items/${encodeURIComponent(targetId)}`);
  assert.equal(delRes.status, 200);
  assert.ok(!delRes.body.items.some((i) => i.id === targetId));
});
