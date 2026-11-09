/**
 * Basilico — Supermarket Offers Application
 * Location: tests/integration/challenger_m2_stress.test.js
 *
 * EMPIRICAL CHALLENGER STRESS HARNESS (Milestone 2)
 *
 * Adversarial stress testing of:
 * 1. Search query stress:
 *    - Diacritics and Italian accents ("Caffè", "CAFFÈ", "caffe", "latte", "pò", "olio extra vergine")
 *    - Special characters and regex injection attempts (".*", "[a-z]", "(", "\\", "'", "\"", "<script>")
 *    - Mixed cases, extra whitespaces, empty strings
 * 2. Filter & pagination boundaries:
 *    - Extreme page numbers (page=999999, page=-5, page=abc)
 *    - Extreme limits (limit=0, limit=500000, limit=-1)
 *    - Non-existent categories, non-existent storeIds
 *    - Dual sort parameter variations (snake_case vs camelCase)
 * 3. Live HTTP endpoint probes:
 *    - REST API routes (/api/offers, /api/stores, /api/flyers, /api/status, /api/sync)
 *    - Malformed payloads, path traversal defense, SPA fallback
 * 4. High concurrency & stress load
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApp } from '../../server/index.js';
import { offerService, normalizeSearchToken, getSortComparator, VALID_PRODUCT_CATEGORIES } from '../../server/services/offerService.js';
import { ingestionService } from '../../server/services/ingestionService.js';

describe('EMPIRICAL CHALLENGER STRESS HARNESS (Milestone 2)', () => {
  let server;
  let baseUrl;
  let serverPort;
  let rawOffers;

  before(async () => {
    // Initialize ingestion service
    await ingestionService.init();
    rawOffers = await offerService.getRawOffers();
    assert.ok(Array.isArray(rawOffers) && rawOffers.length > 0, 'Seed offers must be loaded');

    // Spin up real HTTP server on ephemeral port (port 0)
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server && typeof server.close === 'function') {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  /**
   * Helper to perform raw HTTP requests without client-side WHATWG URL canonicalization
   */
  function rawHttpRequest(path, method = 'GET', body = null, headers = {}) {
    return new Promise((resolve, reject) => {
      const req = http.request(
        {
          host: '127.0.0.1',
          port: serverPort,
          path,
          method,
          headers
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => (data += chunk));
          res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
        }
      );
      req.on('error', reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // =========================================================================
  // 1. SEARCH QUERY STRESS & QUERY NORMALIZATION
  // =========================================================================
  describe('1. Search Query Stress & Query Normalization', () => {
    it('1.1 Diacritics: should return identical results for "Caffè", "caffè", "CAFFÈ", "caffe", "CAFFE"', async () => {
      const queries = ['Caffè', 'caffè', 'CAFFÈ', 'caffe', 'CAFFE'];
      const results = await Promise.all(queries.map((q) => offerService.getOffers({ q })));

      const firstTotal = results[0].totalOffers;
      assert.ok(firstTotal > 0, `Expected search for "Caffè" to find offers, got ${firstTotal}`);

      for (let i = 1; i < queries.length; i++) {
        assert.equal(
          results[i].totalOffers,
          firstTotal,
          `Query "${queries[i]}" totalOffers (${results[i].totalOffers}) must match "${queries[0]}" (${firstTotal})`
        );
        const ids1 = results[0].offers.map((o) => o.id).sort();
        const ids2 = results[i].offers.map((o) => o.id).sort();
        assert.deepEqual(ids1, ids2, `Offer IDs for "${queries[i]}" must match "${queries[0]}"`);
      }
    });

    it('1.2 Italian accents: should match "latte" across variations ("latte", "Latte", "LATTE")', async () => {
      const queries = ['latte', 'Latte', 'LATTE'];
      const results = await Promise.all(queries.map((q) => offerService.getOffers({ q })));

      assert.ok(results[0].totalOffers > 0, 'Query "latte" should match offers');
      for (const res of results) {
        assert.equal(res.totalOffers, results[0].totalOffers);
        assert.ok(
          res.offers.some((o) => {
            const text = `${o.title} ${o.description || ''} ${o.category}`.toLowerCase();
            return text.includes('latte');
          }),
          'Must find items containing "latte"'
        );
      }
    });

    it('1.3 Multi-word & Italian accents: should handle "olio extra vergine" and variations', async () => {
      const queries = [
        'olio extra vergine',
        'Olio Extra Vergine',
        'OLIO EXTRA VERGINE',
        'olio extra-vergine'
      ];

      for (const q of queries) {
        const res = await offerService.getOffers({ q });
        assert.ok(
          res.totalOffers >= 2,
          `Expected query "${q}" to match at least 2 offers, got ${res.totalOffers}`
        );
        assert.ok(
          res.offers.some((o) => o.title.toLowerCase().includes('olio') || o.id.includes('olio')),
          `Query "${q}" should match oil promotions`
        );
      }
    });

    it('1.4 Diacritics: should handle "pò", "po\'", and "po" safely without syntax crash', async () => {
      const queries = ['pò', "po'", 'po'];
      for (const q of queries) {
        const res = await offerService.getOffers({ q });
        assert.ok(typeof res.totalOffers === 'number', `Query "${q}" must return number for totalOffers`);
        assert.ok(Array.isArray(res.offers), `Query "${q}" must return array for offers`);
      }

      // Verify normalizeSearchToken on "pò" and "po'"
      assert.equal(normalizeSearchToken('pò'), 'po');
      assert.equal(normalizeSearchToken("po'"), 'po');
    });

    it('1.5 All Italian vowel diacritics: should normalize à, è, é, ì, ò, ù in complex queries', () => {
      const input = 'caffè tè però più lì città bontà qualità';
      const expected = 'caffe te pero piu li citta bonta qualita';
      assert.equal(normalizeSearchToken(input), expected);
    });

    it('1.6 Special characters & Regex injection attempts: must NOT crash or evaluate as RegExp', async () => {
      const injectionAttempts = [
        '.*',
        '[a-z]',
        '(',
        '\\',
        "'",
        '"',
        '<script>',
        '<script>alert("xss")</script>',
        '(((((((((a+)+)+)+)+)+)+)+)+',
        '^.*$',
        '?()|[]{}',
        '\\\\\\\\',
        '${7*7}',
        '{{constructor.constructor("return process")()}}',
        'SELECT * FROM offers WHERE 1=1 --',
        'null',
        'undefined',
        'NaN',
        'true',
        'false'
      ];

      for (const attempt of injectionAttempts) {
        // Must not throw an unhandled exception
        let res;
        assert.doesNotThrow(() => {
          res = offerService.processQuery({ q: attempt }, rawOffers);
        }, `Query attempt "${attempt}" threw an exception!`);

        assert.ok(typeof res.totalOffers === 'number');
        assert.ok(Array.isArray(res.offers));
        assert.ok(typeof res.totalPages === 'number');

        // Check token normalization doesn't explode
        const token = normalizeSearchToken(attempt);
        assert.ok(typeof token === 'string');
      }
    });

    it('1.7 Mixed cases, extra whitespaces, tabs, newlines, empty strings', async () => {
      // Empty string query -> all offers
      const resEmpty = await offerService.getOffers({ q: '' });
      assert.equal(resEmpty.totalOffers, rawOffers.length);

      // Whitespace only -> all offers
      const resWhitespace = await offerService.getOffers({ q: '     \t  \n   ' });
      assert.equal(resWhitespace.totalOffers, rawOffers.length);

      // Null or undefined q -> all offers
      const resNull = await offerService.getOffers({ q: null });
      assert.equal(resNull.totalOffers, rawOffers.length);

      const resUndefined = await offerService.getOffers({});
      assert.equal(resUndefined.totalOffers, rawOffers.length);

      // Excessive internal and surrounding spaces
      const resSpaces = await offerService.getOffers({ q: '   pasta     barilla    ' });
      const resClean = await offerService.getOffers({ q: 'pasta barilla' });
      assert.equal(resSpaces.totalOffers, resClean.totalOffers);
      assert.ok(resSpaces.totalOffers > 0);
    });

    it('1.8 Unmatched queries must return totalOffers: 0, offers: [], totalPages: 0', async () => {
      const res = await offerService.getOffers({ q: 'prodotto-inesistente-totale-xyz-99999' });
      assert.equal(res.totalOffers, 0);
      assert.deepEqual(res.offers, []);
      assert.equal(res.totalPages, 0);
    });
  });

  // =========================================================================
  // 2. FILTER & PAGINATION BOUNDARIES
  // =========================================================================
  describe('2. Filter & Pagination Boundaries', () => {
    it('2.1 Extreme page numbers: page=999999 should return empty offers and not crash', async () => {
      const res = await offerService.getOffers({ page: '999999' });
      assert.equal(res.page, 999999);
      assert.deepEqual(res.offers, []);
      assert.ok(res.totalOffers > 0);
      assert.ok(res.totalPages > 0);
    });

    it('2.2 Negative and zero page numbers: page=-5, page=0 should clamp to page 1', async () => {
      const resNeg = await offerService.getOffers({ page: '-5' });
      assert.equal(resNeg.page, 1);
      assert.ok(resNeg.offers.length > 0);

      const resZero = await offerService.getOffers({ page: '0' });
      assert.equal(resZero.page, 1);
      assert.ok(resZero.offers.length > 0);
    });

    it('2.3 Non-numeric page numbers: page=abc, page=NaN, page=undefined should default to page 1', async () => {
      const resAbc = await offerService.getOffers({ page: 'abc' });
      assert.equal(resAbc.page, 1);

      const resNan = await offerService.getOffers({ page: 'NaN' });
      assert.equal(resNan.page, 1);

      const resObj = await offerService.getOffers({ page: {} });
      assert.equal(resObj.page, 1);

      const resArr = await offerService.getOffers({ page: ['1', '2'] });
      assert.equal(resArr.page, 1);
    });

    it('2.4 Extreme limits: limit=0 should clamp or fallback to DEFAULT_LIMIT (20)', async () => {
      const resZero = await offerService.getOffers({ limit: '0' });
      assert.ok(resZero.limit >= 1, `Limit must be >= 1, got ${resZero.limit}`);
      assert.ok(resZero.offers.length > 0);
      assert.ok(resZero.totalPages > 0);
    });

    it('2.5 Extreme limits: limit=500000 should clamp to MAX_LIMIT (100)', async () => {
      const resHuge = await offerService.getOffers({ limit: '500000' });
      assert.equal(resHuge.limit, 100);
      assert.ok(resHuge.offers.length <= 100);
    });

    it('2.6 Negative limits: limit=-1, limit=-100 should clamp to minimum 1', async () => {
      const resNeg = await offerService.getOffers({ limit: '-1' });
      assert.ok(resNeg.limit >= 1);
      assert.equal(resNeg.offers.length, 1);

      const resNeg100 = await offerService.getOffers({ limit: '-100' });
      assert.ok(resNeg100.limit >= 1);
    });

    it('2.7 Non-numeric limits: limit=abc, limit=xyz should fallback to DEFAULT_LIMIT', async () => {
      const resAbc = await offerService.getOffers({ limit: 'abc' });
      assert.equal(resAbc.limit, 20);
    });

    it('2.8 Non-existent categories: should return totalOffers: 0, offers: [], totalPages: 0', async () => {
      const res = await offerService.getOffers({ category: 'Astronautica e Spazio' });
      assert.equal(res.totalOffers, 0);
      assert.deepEqual(res.offers, []);
      assert.equal(res.totalPages, 0);
      assert.ok(Array.isArray(res.categories));
    });

    it('2.9 Category filter normalization: should match category with different casing or accents', async () => {
      const resExact = await offerService.getOffers({ category: 'Latticini e Formaggi' });
      const resLower = await offerService.getOffers({ category: 'latticini e formaggi' });
      assert.ok(resExact.totalOffers > 0);
      assert.equal(resExact.totalOffers, resLower.totalOffers);
    });

    it('2.10 Non-existent storeIds: should return totalOffers: 0, offers: [], totalPages: 0', async () => {
      const res = await offerService.getOffers({ storeId: 'walmart-rapallo-nonexistent' });
      assert.equal(res.totalOffers, 0);
      assert.deepEqual(res.offers, []);
      assert.equal(res.totalPages, 0);
    });

    it('2.11 StoreId alias matching: rapallo- prefix alias and exact storeId', async () => {
      const res1 = await offerService.getOffers({ storeId: 'rapallo-coop-sciesa' });
      const res2 = await offerService.getOffers({ storeId: 'coop-rapallo-sciesa' });
      assert.ok(res1.totalOffers > 0 || res2.totalOffers > 0);
    });

    it('2.12 MinDiscount boundary values: negative, zero, 100, 999, non-numeric', async () => {
      // minDiscount: negative -> clamped to 0 (all offers)
      const resNeg = await offerService.getOffers({ minDiscount: '-10' });
      assert.equal(resNeg.totalOffers, rawOffers.length);

      // minDiscount: 0 -> all offers
      const resZero = await offerService.getOffers({ minDiscount: '0' });
      assert.equal(resZero.totalOffers, rawOffers.length);

      // minDiscount: 999 -> 0 offers
      const resHuge = await offerService.getOffers({ minDiscount: '999' });
      assert.equal(resHuge.totalOffers, 0);
      assert.equal(resHuge.totalPages, 0);

      // minDiscount: non-numeric -> ignored safely
      const resAbc = await offerService.getOffers({ minDiscount: 'invalid' });
      assert.equal(resAbc.totalOffers, rawOffers.length);
    });

    it('2.13 Dual sort parameter variations (snake_case vs camelCase vs hyphenated)', async () => {
      const sortPairs = [
        ['discount_desc', 'discountDesc'],
        ['discount_asc', 'discountAsc'],
        ['price_asc', 'priceAsc'],
        ['price_desc', 'priceDesc'],
        ['name_asc', 'nameAsc'],
        ['name_desc', 'nameDesc'],
        ['expiring_soon', 'expiringSoon']
      ];

      for (const [snake, camel] of sortPairs) {
        const resSnake = await offerService.getOffers({ sortBy: snake, limit: 100 });
        const resCamel = await offerService.getOffers({ sortBy: camel, limit: 100 });

        assert.equal(
          resSnake.totalOffers,
          resCamel.totalOffers,
          `Sort count mismatch between ${snake} and ${camel}`
        );

        const idsSnake = resSnake.offers.map((o) => o.id);
        const idsCamel = resCamel.offers.map((o) => o.id);
        assert.deepEqual(
          idsSnake,
          idsCamel,
          `Order mismatch between snake_case (${snake}) and camelCase (${camel})`
        );
      }
    });

    it('2.14 Sort verification: discount_desc and price_asc correctness', async () => {
      const resDiscount = await offerService.getOffers({ sortBy: 'discount_desc', limit: 100 });
      for (let i = 0; i < resDiscount.offers.length - 1; i++) {
        const d1 = resDiscount.offers[i].discountPercentage || 0;
        const d2 = resDiscount.offers[i + 1].discountPercentage || 0;
        assert.ok(d1 >= d2, `Discount sort error: ${d1} should be >= ${d2}`);
      }

      const resPrice = await offerService.getOffers({ sortBy: 'price_asc', limit: 100 });
      for (let i = 0; i < resPrice.offers.length - 1; i++) {
        const p1 = resPrice.offers[i].promoPrice ?? resPrice.offers[i].discountPrice ?? 0;
        const p2 = resPrice.offers[i + 1].promoPrice ?? resPrice.offers[i + 1].discountPrice ?? 0;
        assert.ok(p1 <= p2, `Price asc sort error: ${p1} should be <= ${p2}`);
      }
    });

    it('2.15 Unknown sortBy value: should be safely ignored and not crash', async () => {
      const res = await offerService.getOffers({ sortBy: 'random_malicious_sort; DROP TABLE offers;' });
      assert.equal(res.totalOffers, rawOffers.length);
      assert.ok(res.offers.length > 0);
    });
  });

  // =========================================================================
  // 3. LIVE HTTP REST API ENDPOINT PROBES
  // =========================================================================
  describe('3. Live HTTP REST API Endpoint Probes', () => {
    it('3.1 GET /api/offers with query parameters over HTTP', async () => {
      const url = `${baseUrl}/api/offers?q=caff%C3%A8&sortBy=discount_desc&page=1&limit=5`;
      const res = await fetch(url);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('application/json'));

      const data = await res.json();
      assert.ok(Array.isArray(data.offers));
      assert.ok(data.totalOffers > 0);
      assert.equal(data.page, 1);
      assert.equal(data.limit, 5);
      assert.ok(data.offers.length <= 5);
    });

    it('3.2 GET /api/offers with extreme parameters over HTTP', async () => {
      const url = `${baseUrl}/api/offers?page=999999&limit=500000`;
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.deepEqual(data.offers, []);
      assert.equal(data.limit, 100); // clamped to MAX_LIMIT
      assert.equal(data.page, 999999);
    });

    it('3.3 GET /api/offers with negative/malformed parameters over HTTP', async () => {
      const url = `${baseUrl}/api/offers?page=-5&limit=0&minDiscount=-20`;
      const res = await fetch(url);
      assert.equal(res.status, 200);

      const data = await res.json();
      assert.equal(data.page, 1);
      assert.equal(data.limit, 20); // defaulted to DEFAULT_LIMIT
      assert.ok(data.offers.length > 0);
    });

    it('3.4 GET /api/stores endpoint contract and hasOffers filter', async () => {
      const resAll = await fetch(`${baseUrl}/api/stores`);
      assert.equal(resAll.status, 200);
      const dataAll = await resAll.json();

      assert.ok(Array.isArray(dataAll.stores));
      assert.equal(dataAll.totalStores, dataAll.stores.length);
      assert.ok(typeof dataAll.totalFlyers === 'number');
      assert.ok(typeof dataAll.totalOffers === 'number');
      assert.ok(dataAll.stores.length >= 5, 'Must contain all 5 required supermarket chains');

      // Check hasOffers=true
      const resOffers = await fetch(`${baseUrl}/api/stores?hasOffers=true`);
      assert.equal(resOffers.status, 200);
      const dataOffers = await resOffers.json();
      assert.ok(dataOffers.stores.every((s) => s.activeOfferCount > 0));

      // Check invalid hasOffers value
      const resInvalid = await fetch(`${baseUrl}/api/stores?hasOffers=notaboolean`);
      assert.equal(resInvalid.status, 200);
      const dataInvalid = await resInvalid.json();
      assert.equal(dataInvalid.totalStores, dataAll.totalStores);
    });

    it('3.5 GET /api/flyers endpoint contract and page URL array normalization', async () => {
      const resAll = await fetch(`${baseUrl}/api/flyers`);
      assert.equal(resAll.status, 200);
      const dataAll = await resAll.json();

      assert.ok(Array.isArray(dataAll.flyers));
      assert.ok(dataAll.flyers.length > 0);
      assert.equal(dataAll.totalFlyers, dataAll.flyers.length);

      // Verify pages is an array of strings
      for (const flyer of dataAll.flyers) {
        assert.ok(Array.isArray(flyer.pages), 'Flyer pages must be an array');
        assert.ok(flyer.pages.length > 0, 'Flyer pages must not be empty');
        assert.ok(
          flyer.pages.every((p) => typeof p === 'string'),
          'Each element in flyer.pages must be a URL string'
        );
        assert.ok(typeof flyer.pageCount === 'number' && flyer.pageCount >= 1);
      }

      // Filter by storeId
      const testStoreId = dataAll.flyers[0].storeId;
      const resFiltered = await fetch(`${baseUrl}/api/flyers?storeId=${testStoreId}`);
      assert.equal(resFiltered.status, 200);
      const dataFiltered = await resFiltered.json();
      assert.ok(
        dataFiltered.flyers.every(
          (f) => f.storeId === testStoreId || (Array.isArray(f.storeIds) && f.storeIds.includes(testStoreId))
        ),
        'All returned flyers must match requested storeId or have it in storeIds'
      );

      // Filter by non-existent storeId
      const resNone = await fetch(`${baseUrl}/api/flyers?storeId=non-existent-store-xyz`);
      assert.equal(resNone.status, 200);
      const dataNone = await resNone.json();
      assert.equal(dataNone.totalFlyers, 0);
      assert.deepEqual(dataNone.flyers, []);
    });

    it('3.6 GET /api/status endpoint contract', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.equal(res.status, 200);
      const data = await res.json();

      assert.ok(typeof data.isOnline === 'boolean');
      assert.ok(['live', 'cache', 'seed'].includes(data.dataSource));
      assert.ok(typeof data.lastSyncTimestamp === 'string');
      assert.ok(typeof data.storeCount === 'number' && data.storeCount >= 5);
      assert.ok(typeof data.flyerCount === 'number');
      assert.ok(typeof data.offerCount === 'number');
    });

    it('3.7 POST /api/sync endpoint with valid and empty bodies', async () => {
      // POST with empty body
      const resEmpty = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      assert.equal(resEmpty.status, 200);
      const dataEmpty = await resEmpty.json();
      assert.ok(dataEmpty.status === 'success' || dataEmpty.status === 'cached_fallback');

      // POST with force: false
      const resForceFalse = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: false })
      });
      assert.equal(resForceFalse.status, 200);
    });

    it('3.8 POST /api/sync with malformed JSON body: must return HTTP 400 JSON', async () => {
      const res = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"invalidJson: true' // intentionally broken syntax
      });
      assert.equal(res.status, 400);
      const data = await res.json();
      assert.equal(data.error, 'Invalid JSON payload');
    });

    it('3.9 Path traversal defense: raw HTTP request with %2e%2e, dot-collapse, and multi-encoding must return HTTP 403 JSON', async () => {
      const attackPaths = [
        '/%2e%2e/%2e%2e/package.json',
        '/static/%2e%2e/%2e%2e/package.json',
        '/..%2f..%2fpackage.json',
        '/....//....//etc/shadow',
        '/%252e%252e/%252e%252e/etc/passwd'
      ];

      for (const p of attackPaths) {
        const res = await rawHttpRequest(p);
        assert.equal(res.status, 403, `Expected HTTP 403 for traversal path ${p}, got ${res.status}`);
        const data = JSON.parse(res.body);
        assert.ok(data.error && data.error.includes('Path traversal'));
      }
    });

    it('3.10 Unhandled /api routes must return HTTP 404 JSON (not HTML)', async () => {
      const nonExistentRoutes = [
        `${baseUrl}/api/unknown_route`,
        `${baseUrl}/api/v1/offers`,
        `${baseUrl}/api`
      ];

      for (const route of nonExistentRoutes) {
        const res = await fetch(route);
        assert.equal(res.status, 404);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const data = await res.json();
        assert.ok(data.error);
      }
    });

    it('3.11 SPA route fallback: non-API route must return HTML shell with mobile viewport meta', async () => {
      const spaRoutes = [
        `${baseUrl}/`,
        `${baseUrl}/volantini`,
        `${baseUrl}/offerte/pasta`,
        `${baseUrl}/supermercati/rapallo-coop`
      ];

      for (const route of spaRoutes) {
        const res = await fetch(route);
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('text/html'));
        const html = await res.text();
        assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0" />'));
        assert.ok(html.includes('Basilico'));
      }
    });
  });

  // =========================================================================
  // 4. CONCURRENCY & STRESS LOAD
  // =========================================================================
  describe('4. Concurrency & Stress Load', () => {
    it('4.1 should handle 50 rapid concurrent HTTP requests with zero drops or errors', async () => {
      const requestCount = 50;
      const endpoints = [
        `${baseUrl}/api/stores`,
        `${baseUrl}/api/offers?q=caff%C3%A8`,
        `${baseUrl}/api/offers?q=latte&sortBy=price_asc`,
        `${baseUrl}/api/flyers`,
        `${baseUrl}/api/status`
      ];

      const start = performance.now();
      const promises = Array.from({ length: requestCount }, (_, i) => {
        const ep = endpoints[i % endpoints.length];
        return fetch(ep).then((res) => {
          assert.equal(res.status, 200, `Expected 200 for ${ep}`);
          return res.json();
        });
      });

      const responses = await Promise.all(promises);
      const elapsed = performance.now() - start;

      assert.equal(responses.length, requestCount);
      assert.ok(elapsed < 3000, `50 concurrent requests took ${elapsed.toFixed(1)}ms (expected < 3000ms)`);
    });
  });
});
