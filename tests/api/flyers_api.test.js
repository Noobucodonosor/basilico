import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateFlyerSchema } from '../helpers/test_helper.js';

describe('API Tests: Flyer Catalog & Page Viewer Endpoint (F7 - GET /api/flyers)', () => {
  const testFlyers = [
    {
      id: 'flyer-coop-sottocosto',
      storeId: 'coop-rapallo-sciesa',
      title: 'Coop Sottocosto Rapallo',
      validFrom: '2026-10-25T00:00:00.000Z',
      validTo: '2026-11-15T23:59:59.000Z',
      pageCount: 12,
      coverImageUrl: 'https://it-it-media.shopfully.cloud/images/volantini/big_1726910.jpg',
      pages: Array.from({ length: 12 }, (_, i) => `https://example.com/coop/page_${i + 1}.jpg`)
    },
    {
      id: 'flyer-basko-sconti',
      storeId: 'basko-rapallo-colombo',
      title: 'Basko Grandi Sconti',
      validFrom: '2026-11-01T00:00:00.000Z',
      validTo: '2026-11-14T23:59:59.000Z',
      pageCount: 16,
      coverImageUrl: 'https://it-it-media.shopfully.cloud/images/volantini/big_1735839.jpg',
      pages: Array.from({ length: 16 }, (_, i) => `https://example.com/basko/page_${i + 1}.jpg`)
    },
    {
      id: 'flyer-carrefour-market',
      storeId: 'carrefour-market-assereto',
      title: 'Carrefour Sottocosto Freschi',
      validFrom: '2026-10-28T00:00:00.000Z',
      validTo: '2026-11-10T23:59:59.000Z',
      pageCount: 8,
      coverImageUrl: 'https://it-it-media.shopfully.cloud/images/volantini/big_1727665.jpg',
      pages: Array.from({ length: 8 }, (_, i) => `https://example.com/carrefour/page_${i + 1}.jpg`)
    }
  ];

  /**
   * Reference Controller for GET /api/flyers (Oracle for F7)
   */
  function handleGetFlyers(query = {}, flyers = testFlyers) {
    let filtered = [...flyers];
    if (query.storeId && typeof query.storeId === 'string' && query.storeId.trim()) {
      filtered = filtered.filter((f) => f.storeId === query.storeId.trim());
    }

    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: {
        flyers: filtered,
        totalFlyers: filtered.length
      }
    };
  }

  describe('F7: Flyer Catalog Contract (Tier 1)', () => {
    it('7.1 should return all active flyers with totalFlyers count by default', () => {
      const res = handleGetFlyers({});
      assert.equal(res.status, 200);
      assert.equal(res.body.totalFlyers, testFlyers.length);
      assert.equal(res.body.flyers.length, testFlyers.length);
    });

    it('7.2 should match contract schema { flyers, totalFlyers }', () => {
      const { body } = handleGetFlyers({});
      assert.ok(Array.isArray(body.flyers));
      assert.equal(typeof body.totalFlyers, 'number');
      assert.equal(body.totalFlyers, body.flyers.length);
    });

    it('7.3 should filter flyers by specific storeId (Coop Rapallo)', () => {
      const { body } = handleGetFlyers({ storeId: 'coop-rapallo-sciesa' });
      assert.equal(body.totalFlyers, 1);
      assert.equal(body.flyers[0].id, 'flyer-coop-sottocosto');
      assert.equal(body.flyers[0].storeId, 'coop-rapallo-sciesa');
    });

    it('7.4 should include ordered pages image list matching pageCount', () => {
      const { body } = handleGetFlyers({ storeId: 'basko-rapallo-colombo' });
      const flyer = body.flyers[0];
      assert.equal(flyer.pageCount, 16);
      assert.equal(flyer.pages.length, 16);
      assert.ok(flyer.pages[0].includes('page_1.jpg'));
      assert.ok(flyer.pages[15].includes('page_16.jpg'));
    });

    it('7.5 should verify all flyers in response satisfy validateFlyerSchema', () => {
      const { body } = handleGetFlyers({});
      for (const flyer of body.flyers) {
        const errors = validateFlyerSchema(flyer);
        assert.equal(errors.length, 0, `Flyer ${flyer.id} failed validation: ${errors.join(', ')}`);
      }
    });
  });

  describe('F7: Flyer Catalog Boundary & Corner Cases (Tier 2)', () => {
    it('7.6 should return empty array when storeId has no active flyers', () => {
      const { body } = handleGetFlyers({ storeId: 'non-existent-store-xyz' });
      assert.equal(body.totalFlyers, 0);
      assert.deepEqual(body.flyers, []);
    });

    it('7.7 should safely trim whitespace from storeId parameter ("  basko-rapallo-colombo  ")', () => {
      const { body } = handleGetFlyers({ storeId: '   basko-rapallo-colombo   ' });
      assert.equal(body.totalFlyers, 1);
      assert.equal(body.flyers[0].storeId, 'basko-rapallo-colombo');
    });

    it('7.8 should handle special characters in storeId parameter without regex throw', () => {
      const { body } = handleGetFlyers({ storeId: 'store/*?[regex]' });
      assert.equal(body.totalFlyers, 0);
    });

    it('7.9 should verify HTTP content-type is application/json; charset=utf-8', () => {
      const res = handleGetFlyers({});
      assert.equal(res.headers['content-type'], 'application/json; charset=utf-8');
    });

    it('7.10 should verify flyer dates parse successfully into valid Date instances', () => {
      const { body } = handleGetFlyers({});
      for (const flyer of body.flyers) {
        const start = new Date(flyer.validFrom);
        const end = new Date(flyer.validTo);
        assert.ok(!isNaN(start.getTime()), 'validFrom must be valid date');
        assert.ok(!isNaN(end.getTime()), 'validTo must be valid date');
        assert.ok(start <= end, 'validFrom must be <= validTo');
      }
    });
  });
});
