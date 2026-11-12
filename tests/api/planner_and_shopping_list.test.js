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
import { mealPlannerService } from '../../server/services/mealPlannerService.js';
import { pantryService } from '../../server/services/pantryService.js';

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

test('API /api/planner & /api/shopping-list — Full Stanza 6 Workflow & Bug Regressions', async (t) => {
  const origShopPath = shoppingListService.storagePath;
  const origShopState = shoppingListService._state;
  const origPlanPath = mealPlannerService.storagePath;
  const origLastPlan = mealPlannerService._lastGeneratedPlan;
  const origPantryPath = pantryService.storagePath;
  const origPantryState = pantryService._state;

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-shop-api-'));
  shoppingListService.storagePath = path.join(tmpDir, 'shopping_list.json');
  shoppingListService._state = null;
  mealPlannerService.storagePath = path.join(tmpDir, 'weekly_plan.json');
  mealPlannerService._lastGeneratedPlan = null;
  pantryService.storagePath = path.join(tmpDir, 'pantry.json');
  pantryService._state = null;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.close();
    shoppingListService.storagePath = origShopPath;
    shoppingListService._state = origShopState;
    mealPlannerService.storagePath = origPlanPath;
    mealPlannerService._lastGeneratedPlan = origLastPlan;
    pantryService.storagePath = origPantryPath;
    pantryService._state = origPantryState;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  // 1. GET /api/planner/models
  const modelsRes = await requestJson(server, 'GET', '/api/planner/models');
  assert.equal(modelsRes.status, 200);
  assert.equal(modelsRes.body.models.length, 6);

  // 2. Specialist 1-Store simulation & M-P1-01 promo cart preservation on GET /api/planner/current
  const panAddRes = await requestJson(server, 'POST', '/api/shopping-list/items', {
    name: 'Padella Antiaderente 28cm',
    domain: 'kitchen_cookware',
    source: 'flyer_offer',
    preferredStore: 'Unieuro Rapallo',
    packsToBuy: 1,
    unitPriceEur: 24.9
  });
  assert.equal(panAddRes.status, 201);
  const sim1OnlyPan = panAddRes.body.storeSimulations.find((s) => s.strategyId === '1_store_express');
  assert.ok(sim1OnlyPan);
  assert.match(sim1OnlyPan.storesVisited[0], /Unieuro/i, '1-item Unieuro cookware cart must pick Unieuro in 1_store_express (M-P1-19)');
  for (const sim of panAddRes.body.storeSimulations) {
    assert.equal(sim.storesVisited.length, 1, '2/3-store modes must prune 0-item ghost stops (M-P1-19)');
  }

  // Calling GET /api/planner/current must NOT wipe or dilute the flyer_offer item!
  const current1Res = await requestJson(server, 'GET', '/api/planner/current?profileId=dany');
  assert.equal(current1Res.status, 200);
  assert.ok(current1Res.body.plan.planId);
  assert.ok(
    current1Res.body.shoppingList.items.some((i) => i.name === 'Padella Antiaderente 28cm'),
    'GET /api/planner/current must preserve existing flyer_offer items (M-P1-01)'
  );

  // Second GET /api/planner/current returns the exact persisted planId
  const current2Res = await requestJson(server, 'GET', '/api/planner/current?profileId=dany');
  assert.equal(current2Res.status, 200);
  assert.equal(current2Res.body.plan.planId, current1Res.body.plan.planId);

  // 3. Input validation (400 on non-finite budgetEur or unitPriceEur — M-P0-02)
  const badGenRes = await requestJson(server, 'POST', '/api/planner/generate', {
    modelId: 'ligurian_traditional',
    budgetEur: 'abc'
  });
  assert.equal(badGenRes.status, 400);

  const badShopAdd = await requestJson(server, 'POST', '/api/shopping-list/items', {
    name: 'Pane',
    unitPriceEur: 'abc'
  });
  assert.equal(badShopAdd.status, 400);

  // 4. POST /api/planner/generate -> 21/21 unique meals across 7 days (M-P1-17)
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

  const allSlotIds = [];
  for (const d of genRes.body.plan.days) {
    allSlotIds.push(d.breakfast.id || d.breakfast.title);
    allSlotIds.push(d.lunch.dish.id);
    allSlotIds.push(d.dinner.dish.id);
  }
  assert.equal(new Set(allSlotIds).size, 21, 'All 21 meals across 7 days must be distinct (M-P1-17)');

  // 5. POST /api/planner/swap-meal rotates without oscillating between 2 dishes (M-P1-18)
  const initialLunchId = genRes.body.plan.days[0].lunch.dish.id;
  const swap1 = await requestJson(server, 'POST', '/api/planner/swap-meal', { dayIndex: 1, slot: 'lunch' });
  assert.equal(swap1.status, 200);
  const swap1Id = swap1.body.plan.days[0].lunch.dish.id;
  assert.notEqual(swap1Id, initialLunchId);

  const swap2 = await requestJson(server, 'POST', '/api/planner/swap-meal', { dayIndex: 1, slot: 'lunch' });
  assert.equal(swap2.status, 200);
  const swap2Id = swap2.body.plan.days[0].lunch.dish.id;
  assert.notEqual(swap2Id, swap1Id);
  assert.notEqual(swap2Id, initialLunchId, 'Second swap must advance to a 3rd candidate rather than oscillating back');

  // 6. POST /api/shopping-list/items (Kitchen Reset) + Plan B replacement updating packSizeGrams (M-P1-20)
  const addRes = await requestJson(server, 'POST', '/api/shopping-list/items', {
    name: 'Spugne Antigraffio Cellulosa Tigotà',
    domain: 'home_cleaning',
    source: 'kitchen_care',
    packsToBuy: 1,
    unitPriceEur: 1.99
  });
  assert.equal(addRes.status, 201);
  assert.ok(addRes.body.subtotals.homeAndKitchenSubtotalEur >= 1.99);

  const targetId = addRes.body.items.find((i) => i.name.includes('Spugne')).id;
  const planBRes = await requestJson(server, 'GET', `/api/shopping-list/items/${encodeURIComponent(targetId)}/plan-b`);
  assert.equal(planBRes.status, 200);
  assert.equal(planBRes.body.originalItem.id, targetId);

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

  // 7. POST /api/shopping-list/complete-and-load-pantry loads closed packs, clears cart to 0, and is idempotent on repeat click (M-P1-20)
  const complete1 = await requestJson(server, 'POST', '/api/shopping-list/complete-and-load-pantry', {});
  assert.equal(complete1.status, 200);
  assert.ok(complete1.body.loadedCount > 0);
  assert.equal(complete1.body.shoppingList.items.length, 0, 'Completed shopping list must reset active cart to 0 items');

  const complete2 = await requestJson(server, 'POST', '/api/shopping-list/complete-and-load-pantry', {});
  assert.equal(complete2.status, 200);
  assert.equal(complete2.body.loadedCount, 0, 'Second click on empty completed cart must load 0 duplicate items');
});
