/**
 * Basilico — API Integration Tests for Stanza 3 (/api/recipes) (ADR-0011 / TASK-M5-01)
 * Location: tests/api/recipes_api.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../../server/index.js';
import { recipeAndArbitrageService } from '../../server/services/recipeAndArbitrageService.js';

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

test('API /api/recipes — Catalog, 80/20 Solver, Cooking Session, Lab Notes & Custom Deconstruction', async (t) => {
  const tmpLabPath = path.join(os.tmpdir(), `basilico-lab-test-${process.pid}-${Date.now()}.json`);
  const origLabPath = recipeAndArbitrageService.labNotebookPath;
  recipeAndArbitrageService.labNotebookPath = tmpLabPath;
  recipeAndArbitrageService._labNotes = null;

  const app = createApp();
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => {
    server.close();
    recipeAndArbitrageService.labNotebookPath = origLabPath;
    recipeAndArbitrageService._labNotes = null;
    try {
      if (fs.existsSync(tmpLabPath)) fs.unlinkSync(tmpLabPath);
    } catch (_) {}
  });

  // 1. GET /api/recipes
  const listRes = await requestJson(server, 'GET', '/api/recipes?limit=15&servings=2');
  assert.equal(listRes.status, 200);
  assert.ok(listRes.body.totalDishesInCatalog >= 234);
  assert.equal(listRes.body.restaurants.length, 32);
  assert.equal(listRes.body.dishes.length, 15);
  assert.equal(listRes.body.servings, 2);

  // 2. GET /api/recipes/8020
  const paretoRes = await requestJson(server, 'GET', '/api/recipes/8020?topK=8');
  assert.equal(paretoRes.status, 200);
  assert.equal(paretoRes.body.paretoBasket.length, 8);

  // 3. GET /api/recipes/:id/cooking-session
  const sessionRes = await requestJson(
    server,
    'GET',
    '/api/recipes/base-barca-insalata-mare-ceci/cooking-session?heatSource=boat_no_stove'
  );
  assert.equal(sessionRes.status, 200);
  assert.equal(sessionRes.body.heatSource, 'boat_no_stove');
  assert.ok(sessionRes.body.scientificSteps.length >= 2);

  // 4. POST /api/recipes/:id/lab-notes
  const noteRes = await requestJson(
    server,
    'POST',
    '/api/recipes/base-barca-insalata-mare-ceci/lab-notes',
    {
      dishTitle: 'Insalata Tiepida di Ceci e Tonno',
      rating: 5,
      actualCookedWeightGrams: 340,
      saltAndHydrationNotes: 'Ottima tenuta in borsa termica per 4 ore in barca.',
      heatSourceUsed: 'boat_no_stove'
    }
  );
  assert.equal(noteRes.status, 201);
  assert.equal(noteRes.body.entry.rating, 5);

  // 5. POST /api/recipes/deconstruct
  const deconstructRes = await requestJson(server, 'POST', '/api/recipes/deconstruct', {
    title: 'Tagliolini all\'Astice e Pomodorini del Golfo',
    restaurantName: 'Ristorante Test Rapallo',
    menuPriceEuro: 28,
    ingredientsText: 'pasta di semola, pomodori maturi, olio di oliva extravergine',
    profileId: 'dany'
  });
  assert.equal(deconstructRes.status, 201);
  assert.equal(deconstructRes.body.dish.bom.length, 3, 'Comma-separated ingredients must split cleanly into 3 CREA BOM rows');
  assert.equal(deconstructRes.body.dish.costAndArbitrage.menuPricePerServingEur, 28);

  // 6. GET /api/recipes/8020?profileId=dany & GET /api/kitchen/reset-protocol?tools=
  const paretoDanyRes = await requestJson(server, 'GET', '/api/recipes/8020?topK=12&profileId=dany');
  assert.equal(paretoDanyRes.status, 200);
  assert.equal(paretoDanyRes.body.activeProfileId, 'dany');
  assert.ok(!paretoDanyRes.body.paretoBasket.some((i) => /burro|parmigiano|mascarpone/i.test(i.name)));

  const emptyToolsRes = await requestJson(server, 'GET', '/api/kitchen/reset-protocol?tools=');
  assert.equal(emptyToolsRes.status, 200);
  assert.equal(emptyToolsRes.body.protocols.length, 0, 'Explicit empty ?tools= must return 0 protocols instead of resurrecting defaults');
});
