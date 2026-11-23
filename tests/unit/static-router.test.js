import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

import { exportStaticData } from '../../scripts/exportStaticData.mjs';
import { primeDataset, clearMemoryCache } from '../../src/offline/localStore.js';
import { routeStaticApi } from '../../src/offline/localRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../..');
const SEED_DIR = path.join(ROOT_DIR, 'data', 'seed');

function seedMemoryFromDisk() {
  clearMemoryCache();
  for (const filename of fs.readdirSync(SEED_DIR).filter((f) => f.endsWith('.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(SEED_DIR, filename), 'utf8'));
    primeDataset(filename, raw);
  }
}

test('exportStaticData copies all seed JSON files and writes manifest.json', () => {
  const tmpOut = fs.mkdtempSync(path.join(os.tmpdir(), 'cibo-static-'));
  try {
    const manifest = exportStaticData(SEED_DIR, tmpOut);
    assert.equal(manifest.fileCount, 14);
    assert.ok(manifest.version.length === 12);
    assert.ok(fs.existsSync(path.join(tmpOut, 'manifest.json')));
    assert.ok(fs.existsSync(path.join(tmpOut, 'rapallo_offers.json')));
    assert.ok(fs.existsSync(path.join(tmpOut, 'crea_foods.json')));
  } finally {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  }
});

test('static router serves stores, flyers, offers with accent-insensitive search, and status', async () => {
  seedMemoryFromDisk();

  const storesRes = await routeStaticApi('/api/stores');
  assert.equal(storesRes.status, 200);
  const storesData = await storesRes.json();
  assert.equal(storesData.totalStores, 14);

  const flyersRes = await routeStaticApi('/api/flyers');
  const flyersData = await flyersRes.json();
  assert.ok(flyersData.totalFlyers > 0);
  assert.ok(Array.isArray(flyersData.flyers[0].pages));

  const offersRes = await routeStaticApi('/api/offers?q=caffe&limit=5');
  const offersData = await offersRes.json();
  assert.ok(offersData.offers.length <= 5);
  assert.ok(offersData.categories.length > 0);

  const exclRes = await routeStaticApi('/api/offers?excludeCategories=Carne%20e%20Pesce,Latticini%20e%20Formaggi&limit=50');
  const exclData = await exclRes.json();
  assert.ok(exclData.offers.every((o) => o.category !== 'Carne e Pesce' && o.category !== 'Latticini e Formaggi'));

  const porciniRes = await routeStaticApi('/api/offers?q=porcini&limit=5');
  const porciniData = await porciniRes.json();
  assert.ok(porciniData.offers.length >= 1);
  assert.equal(porciniData.offers[0].creaMatch?.creaFoodId, '006030');
  assert.ok(porciniData.offers[0].storageHint);

  const statusRes = await routeStaticApi('/api/status');
  const statusData = await statusRes.json();
  assert.equal(statusData.dataSource, 'static_offline');
  assert.equal(statusData.storeCount, 14);
  assert.ok(statusData.offerCount > 0);
});

test('static router handles pantry, shopping list, CREA, recipes, and P0 safety checks', async () => {
  seedMemoryFromDisk();

  // Pantry + VaR_48h
  const addPantry = await routeStaticApi('/api/pantry/items', {
    method: 'POST',
    body: JSON.stringify({ name: 'Mozzarella', daysLeft: 1, estimatedEuro: 3.2 })
  });
  assert.equal(addPantry.status, 201);

  const pantryRes = await routeStaticApi('/api/pantry');
  const pantryData = await pantryRes.json();
  assert.equal(pantryData.items.length, 1);
  assert.equal(pantryData.valueAtRisk48h.totalAtRiskEuro, 3.2);

  // Shopping list -> complete and load pantry
  const addList = await routeStaticApi('/api/shopping-list/items', {
    method: 'POST',
    body: JSON.stringify({ id: 'item-1', title: 'Pesto', price: 2.5 })
  });
  assert.equal(addList.status, 201);
  await routeStaticApi('/api/shopping-list/items/item-1/toggle', { method: 'POST' });
  const loadRes = await routeStaticApi('/api/shopping-list/complete-and-load-pantry', { method: 'POST' });
  const loadData = await loadRes.json();
  assert.equal(loadData.movedCount, 1);

  // CREA & Recipes
  const creaRes = await routeStaticApi('/api/crea/foods?q=basilico&limit=5');
  const creaData = await creaRes.json();
  assert.ok(creaData.total >= 1);

  const recipesRes = await routeStaticApi('/api/recipes?limit=5');
  const recipesData = await recipesRes.json();
  assert.equal(recipesData.recipes.length, 5);

  // Home Chemistry P0 safety
  const chemHazard = await routeStaticApi('/api/home-chemistry/safety-check', {
    method: 'POST',
    body: JSON.stringify({ agentA: 'candeggina', agentB: 'aceto' })
  });
  const chemData = await chemHazard.json();
  assert.equal(chemData.safe, false);
  assert.equal(chemData.severity, 'P0_BLOCK');

  // Maestro offline deterministic & P0 guard
  const maestroHazard = await routeStaticApi('/api/maestro/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Posso mischiare candeggina e ammoniaca?' })
  });
  const maestroHazardData = await maestroHazard.json();
  assert.equal(maestroHazardData.hasP0Block, true);

  const maestroOk = await routeStaticApi('/api/maestro/chat', {
    method: 'POST',
    body: JSON.stringify({ message: 'Cosa cucino stasera?' })
  });
  const maestroOkData = await maestroOk.json();
  assert.equal(maestroOkData.mode, 'deterministic_scientific_engine');
  assert.equal(maestroOkData.suggestedParetoCards.length, 3);

  // Kitchen set selection, Tier upgrade suggestions, and CREA -> Cooked Recipes -> Offers list
  const setRes = await routeStaticApi('/api/maestro/kitchen-set', {
    method: 'POST',
    body: JSON.stringify({ setId: 'cambusa_minima' })
  });
  const setData = await setRes.json();
  assert.equal(setData.setId, 'cambusa_minima');
  assert.ok(setData.unlockedRecipesCount > 0);
  assert.ok(Array.isArray(setData.upgradeSuggestions));

  const creaListRes = await routeStaticApi('/api/maestro/generate-crea-list', {
    method: 'POST',
    body: JSON.stringify({ goal: 'equilibrata', listName: 'Test CREA' })
  });
  const creaListData = await creaListRes.json();
  assert.equal(creaListData.creaEvaluatedCount, 832);
  assert.ok(creaListData.list.items.length > 0);

  // Monthly vegan base + optional omnivore recipe expansion
  const recipesSample = await (await routeStaticApi('/api/recipes?limit=3')).json();
  const sampleRecipeId = recipesSample.recipes[1]?.id;
  const monthRes = await routeStaticApi('/api/planner/generate-month', {
    method: 'POST',
    body: JSON.stringify({
      dailyKcal: 10000,
      days: 30,
      freshStartHaveIds: ['009210'],
      addRecipeIds: sampleRecipeId ? [sampleRecipeId] : []
    })
  });
  assert.equal(monthRes.status, 200);
  const monthData = await monthRes.json();
  assert.equal(monthData.dietBase, 'vegan');
  assert.equal(monthData.days, 30);
  assert.equal(monthData.targetTotalKcal, 300000);
  assert.equal(monthData.skippedByFreshStart.length, 1);
  assert.equal(monthData.processTrace.length, 5);
  assert.equal(monthData.dailyMeals[0].meals.length, 6);
  assert.equal(monthData.totalMealsGenerated, 180);
  assert.ok(monthData.dryMonthlyStock.length >= 5);
  assert.equal(monthData.freshTranches.length, 5);
  assert.equal(monthData.shelfLifeSafe, true);
  assert.ok(monthData.totalPlannedKcal > 200000);
  assert.ok(monthData.omnivoreExtensions.length >= 1);
});
