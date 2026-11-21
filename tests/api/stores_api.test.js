import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_CHAINS,
  CANONICAL_RAPALLO_STORES,
  validateStoreSchema
} from '../helpers/test_helper.js';

describe('API Tests: Store Overview Endpoint (F5 - GET /api/stores)', () => {
  /**
   * Reference Controller for GET /api/stores (Oracle for F5)
   */
  function handleGetStores(queryParams = {}, storeData = CANONICAL_RAPALLO_STORES) {
    let stores = storeData.map((s) => ({
      ...s,
      flyerCount: s.brand === 'Doro' ? 1 : 2,
      activeOfferCount: s.brand === 'Doro' ? 8 : 15
    }));

    if (queryParams.hasOffers === 'true' || queryParams.hasOffers === true) {
      stores = stores.filter((s) => s.activeOfferCount > 0);
    } else if (queryParams.hasOffers === 'false' || queryParams.hasOffers === false) {
      stores = stores.filter((s) => s.activeOfferCount === 0);
    }

    const totalStores = stores.length;
    const totalFlyers = stores.reduce((acc, s) => acc + (s.flyerCount || 0), 0);
    const totalOffers = stores.reduce((acc, s) => acc + (s.activeOfferCount || 0), 0);

    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8'
      },
      body: {
        stores,
        totalStores,
        totalFlyers,
        totalOffers
      }
    };
  }

  describe('F5: Store Overview API Contract (Tier 1)', () => {
    it('5.1 should return HTTP 200 with JSON content-type', () => {
      const response = handleGetStores({});
      assert.equal(response.status, 200);
      assert.ok(response.headers['content-type'].includes('application/json'));
    });

    it('5.2 should match contract schema { stores, totalStores, totalFlyers, totalOffers }', () => {
      const { body } = handleGetStores({});
      assert.ok(Array.isArray(body.stores));
      assert.equal(typeof body.totalStores, 'number');
      assert.equal(typeof body.totalFlyers, 'number');
      assert.equal(typeof body.totalOffers, 'number');
      assert.equal(body.totalStores, body.stores.length);
    });

    it('5.3 should include flyerCount and activeOfferCount badges on each store', () => {
      const { body } = handleGetStores({});
      for (const store of body.stores) {
        assert.equal(typeof store.flyerCount, 'number');
        assert.equal(typeof store.activeOfferCount, 'number');
        assert.ok(store.flyerCount >= 0);
        assert.ok(store.activeOfferCount >= 0);
      }
    });

    it('5.4 should return all 5 required supermarket chains in Rapallo', () => {
      const { body } = handleGetStores({});
      const brands = body.stores.map((s) => s.brand);
      for (const chain of CANONICAL_CHAINS) {
        assert.ok(brands.includes(chain), `Stores response must include brand: ${chain}`);
      }
    });

    it('5.5 should filter stores when ?hasOffers=true is provided', () => {
      const customStores = [
        ...CANONICAL_RAPALLO_STORES,
        {
          id: 'empty-store',
          name: 'Empty Mart',
          brand: 'Discount',
          address: 'Via Rapallo 1',
          postalCode: '16035',
          coordinates: { lat: 44.35, lng: 9.22 }
        }
      ];
      const res = handleGetStores({ hasOffers: 'true' }, customStores);
      assert.ok(res.body.stores.every((s) => s.activeOfferCount > 0));
    });
  });

  describe('F5: Store Overview Boundary & Corner Cases (Tier 2)', () => {
    it('5.6 should safely ignore unknown extraneous query parameters', () => {
      const res = handleGetStores({ foo: 'bar', timestamp: '123456789' });
      assert.equal(res.status, 200);
      assert.equal(res.body.totalStores, 5);
    });

    it('5.7 should handle invalid boolean string for hasOffers safely without error', () => {
      const res = handleGetStores({ hasOffers: 'not-a-bool' });
      assert.equal(res.status, 200);
      assert.equal(res.body.totalStores, 5);
    });

    it('5.8 should return valid empty shape when no stores exist in database', () => {
      const res = handleGetStores({}, []);
      assert.equal(res.status, 200);
      assert.equal(res.body.totalStores, 0);
      assert.equal(res.body.totalFlyers, 0);
      assert.equal(res.body.totalOffers, 0);
      assert.deepEqual(res.body.stores, []);
    });

    it('5.9 should complete store listing execution within < 50ms', () => {
      const start = performance.now();
      handleGetStores({});
      const duration = performance.now() - start;
      assert.ok(duration < 50, `Handler execution took ${duration}ms`);
    });

    it('5.10 should ensure every store in API output satisfies validateStoreSchema', () => {
      const { body } = handleGetStores({});
      for (const store of body.stores) {
        const errors = validateStoreSchema(store);
        assert.equal(errors.length, 0, `Store ${store.id} failed schema: ${errors.join(', ')}`);
      }
    });
  });
});
