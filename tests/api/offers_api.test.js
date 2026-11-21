import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_PRODUCT_CATEGORIES,
  normalizeSearchToken,
  validateOfferSchema
} from '../helpers/test_helper.js';

describe('API Tests: Product Search & Filter Engine (F6 - GET /api/offers)', () => {
  // Authoritative fixture of grocery offers across Rapallo stores
  const testOffers = [
    {
      id: 'offer-barilla-penne',
      storeId: 'coop-rapallo-sciesa',
      flyerId: 'flyer-coop-1',
      title: 'Pasta Barilla Penne Rigate 500g',
      brand: 'Barilla',
      category: 'Dispensa e Pasta',
      originalPrice: 1.49,
      promoPrice: 0.89,
      discountPercentage: 40,
      validityStart: '2026-10-25T00:00:00.000Z',
      validityEnd: '2026-11-15T23:59:59.000Z'
    },
    {
      id: 'offer-dececco-spaghetti',
      storeId: 'basko-rapallo-colombo',
      flyerId: 'flyer-basko-1',
      title: 'Spaghetti De Cecco N.12 500g',
      brand: 'De Cecco',
      category: 'Dispensa e Pasta',
      originalPrice: 1.99,
      promoPrice: 1.39,
      discountPercentage: 30,
      validityStart: '2026-10-25T00:00:00.000Z',
      validityEnd: '2026-11-15T23:59:59.000Z'
    },
    {
      id: 'offer-lavazza-caffe',
      storeId: 'carrefour-market-assereto',
      flyerId: 'flyer-carrefour-1',
      title: 'Caffè Lavazza Qualità Oro 250g',
      brand: 'Lavazza',
      category: 'Colazione e Dolci',
      originalPrice: 4.29,
      promoPrice: 2.99,
      discountPercentage: 30,
      validityStart: '2026-10-25T00:00:00.000Z',
      validityEnd: '2026-11-15T23:59:59.000Z'
    },
    {
      id: 'offer-latte-parmalat',
      storeId: 'conad-city-torrecivica',
      flyerId: 'flyer-conad-1',
      title: 'Latte Parmalat UHT Parzialmente Scremato 1L',
      brand: 'Parmalat',
      category: 'Latticini e Formaggi',
      originalPrice: 1.69,
      promoPrice: 0.99,
      discountPercentage: 41,
      validityStart: '2026-10-25T00:00:00.000Z',
      validityEnd: '2026-11-15T23:59:59.000Z'
    },
    {
      id: 'offer-dash-detersivo',
      storeId: 'doro-tigullio-margherita',
      flyerId: 'flyer-doro-1',
      title: 'Dash Detersivo Liquido Lavatrice 40 Lavaggi',
      brand: 'Dash',
      category: 'Cura Casa e Bucato',
      originalPrice: 12.90,
      promoPrice: 6.45,
      discountPercentage: 50,
      validityStart: '2026-10-25T00:00:00.000Z',
      validityEnd: '2026-11-15T23:59:59.000Z'
    }
  ];

  /**
   * Reference Controller for GET /api/offers (Oracle for F6)
   */
  function handleGetOffers(query = {}, offers = testOffers) {
    let filtered = [...offers];

    // Filter by storeId
    if (query.storeId) {
      filtered = filtered.filter((o) => o.storeId === query.storeId);
    }

    // Filter by category
    if (query.category) {
      filtered = filtered.filter((o) => o.category === query.category);
    }

    // Keyword search with accent normalization
    if (query.q && typeof query.q === 'string' && query.q.trim()) {
      const normalizedQ = normalizeSearchToken(query.q);
      filtered = filtered.filter((o) => {
        const itemText = normalizeSearchToken(`${o.title} ${o.brand || ''} ${o.category || ''} ${o.description || ''}`);
        return itemText.includes(normalizedQ);
      });
    }

    // Filter by minDiscount
    if (query.minDiscount) {
      const minDisc = parseInt(query.minDiscount, 10);
      if (!isNaN(minDisc)) {
        filtered = filtered.filter((o) => (o.discountPercentage || 0) >= minDisc);
      }
    }

    // Sorting
    if (query.sortBy === 'discountDesc') {
      filtered.sort((a, b) => (b.discountPercentage || 0) - (a.discountPercentage || 0));
    } else if (query.sortBy === 'priceAsc') {
      filtered.sort((a, b) => a.promoPrice - b.promoPrice);
    } else if (query.sortBy === 'priceDesc') {
      filtered.sort((a, b) => b.promoPrice - a.promoPrice);
    }

    // Pagination
    const page = Math.max(1, parseInt(query.page || '1', 10));
    const limit = Math.max(1, parseInt(query.limit || '10', 10));
    const totalOffers = filtered.length;
    const totalPages = Math.ceil(totalOffers / limit);
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: {
        offers: paginated,
        totalOffers,
        page,
        totalPages,
        categories: VALID_PRODUCT_CATEGORIES
      }
    };
  }

  describe('F6: Offer Search & Filtering (Tier 1)', () => {
    it('6.1 should return paginated offers and category facets by default', () => {
      const { body } = handleGetOffers({});
      assert.ok(Array.isArray(body.offers));
      assert.equal(body.totalOffers, testOffers.length);
      assert.equal(body.page, 1);
      assert.ok(Array.isArray(body.categories));
    });

    it('6.2 should filter offers matching query keyword "pasta"', () => {
      const { body } = handleGetOffers({ q: 'pasta' });
      assert.equal(body.totalOffers, 2);
      assert.ok(body.offers.every((o) => o.title.toLowerCase().includes('pasta') || o.category.toLowerCase().includes('pasta')));
    });

    it('6.3 should filter offers strictly by storeId (Basko Rapallo)', () => {
      const { body } = handleGetOffers({ storeId: 'basko-rapallo-colombo' });
      assert.equal(body.totalOffers, 1);
      assert.equal(body.offers[0].storeId, 'basko-rapallo-colombo');
    });

    it('6.4 should filter offers strictly by category ("Latticini e Formaggi")', () => {
      const { body } = handleGetOffers({ category: 'Latticini e Formaggi' });
      assert.equal(body.totalOffers, 1);
      assert.equal(body.offers[0].id, 'offer-latte-parmalat');
    });

    it('6.5 should sort offers by discount descending (?sortBy=discountDesc)', () => {
      const { body } = handleGetOffers({ sortBy: 'discountDesc' });
      assert.equal(body.offers[0].discountPercentage, 50); // Dash 50%
      for (let i = 0; i < body.offers.length - 1; i++) {
        assert.ok(body.offers[i].discountPercentage >= body.offers[i + 1].discountPercentage);
      }
    });
  });

  describe('F6: Offer Search Boundary & Corner Cases (Tier 2)', () => {
    it('6.6 should return identical results for accented and unaccented query ("caffè" vs "caffe")', () => {
      const resWithAccent = handleGetOffers({ q: 'caffè' });
      const resWithoutAccent = handleGetOffers({ q: 'caffe' });

      assert.equal(resWithAccent.body.totalOffers, 1);
      assert.equal(resWithoutAccent.body.totalOffers, 1);
      assert.equal(resWithAccent.body.offers[0].id, resWithoutAccent.body.offers[0].id);
      assert.equal(resWithAccent.body.offers[0].id, 'offer-lavazza-caffe');
    });

    it('6.7 should sort offers by price ascending (?sortBy=priceAsc)', () => {
      const { body } = handleGetOffers({ sortBy: 'priceAsc' });
      assert.equal(body.offers[0].promoPrice, 0.89); // Barilla 0.89
      for (let i = 0; i < body.offers.length - 1; i++) {
        assert.ok(body.offers[i].promoPrice <= body.offers[i + 1].promoPrice);
      }
    });

    it('6.8 should sort offers by price descending (?sortBy=priceDesc)', () => {
      const { body } = handleGetOffers({ sortBy: 'priceDesc' });
      assert.equal(body.offers[0].promoPrice, 6.45); // Dash 6.45
      for (let i = 0; i < body.offers.length - 1; i++) {
        assert.ok(body.offers[i].promoPrice >= body.offers[i + 1].promoPrice);
      }
    });

    it('6.9 should filter offers by minimum discount percentage (?minDiscount=45)', () => {
      const { body } = handleGetOffers({ minDiscount: '45' });
      assert.equal(body.totalOffers, 1);
      assert.equal(body.offers[0].id, 'offer-dash-detersivo'); // 50%
    });

    it('6.10 should return empty array when query does not match any offer', () => {
      const { body } = handleGetOffers({ q: 'prodotto-inesistente-xyz' });
      assert.equal(body.totalOffers, 0);
      assert.deepEqual(body.offers, []);
      assert.equal(body.totalPages, 0);
    });
  });
});
