/**
 * Basilico — API Tests for /api/crea Endpoints (ADR-0008 / TASK-M2-01)
 * Location: tests/api/crea_api.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/index.js';

describe('API Tests: Official CREA Scientific Endpoints (/api/crea)', () => {
  let server;
  let baseUrl;

  before(async () => {
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
  });

  it('1. GET /api/crea/foods returns paginated CREA foods, totalCatalogSize=832, and 17 categories', async () => {
    const res = await fetch(`${baseUrl}/api/crea/foods?limit=25`);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.totalCatalogSize, 832);
    assert.equal(data.categories.length, 17);
    assert.equal(data.foods.length, 25);
  });

  it('2. GET /api/crea/foods?profileId=dany filters out cheese/dairy items unless includeExcluded=true', async () => {
    const resFiltered = await fetch(`${baseUrl}/api/crea/foods?q=mozzarella&profileId=dany`);
    const dataFiltered = await resFiltered.json();
    assert.equal(dataFiltered.totalFoods, 0);

    const resAcademic = await fetch(`${baseUrl}/api/crea/foods?q=mozzarella&profileId=dany&includeExcluded=true`);
    const dataAcademic = await resAcademic.json();
    assert.ok(dataAcademic.totalFoods > 0);
  });

  it('3. GET /api/crea/foods/:id returns full 7-section academic sheet and matchingRapalloOffers', async () => {
    const res = await fetch(`${baseUrl}/api/crea/foods/123610?mode=custom_grams&grams=150`);
    assert.equal(res.status, 200);
    const sheet = await res.json();
    assert.equal(sheet.id, '123610');
    assert.ok(sheet.sections['MACRO NUTRIENTI']);
    assert.ok(sheet.sections['MINERALI']);
    assert.ok(Array.isArray(sheet.matchingRapalloOffers));
  });

  it('4. GET /api/crea/nutrients-per-euro ranks Rapallo food offers by proteinGPerEuro', async () => {
    const res = await fetch(`${baseUrl}/api/crea/nutrients-per-euro?metric=proteinGPerEuro&profileId=dany`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.metric, 'proteinGPerEuro');
    assert.ok(Array.isArray(body.rankings));
    if (body.rankings.length >= 2) {
      assert.ok(body.rankings[0].nutrientsPerEuro.proteinGPerEuro >= body.rankings[1].nutrientsPerEuro.proteinGPerEuro);
    }
  });
});
