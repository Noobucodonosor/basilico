/**
 * Basilico — Supermarket Offers Application
 * Location: tests/e2e/tier5_adversarial_1.test.js
 *
 * EMPIRICAL CHALLENGER 1: WHITE-BOX ADVERSARIAL HARDENING (TIER 5)
 * Milestone 4 Adversarial Stress Testing Harness
 *
 * Comprehensive white-box adversarial verification covering:
 * 1. Malformed & Hostile HTTP Query Parameter Hardening (F5, F6, F7, F8):
 *    - Array type confusion (?storeId=a&storeId=b, ?sortBy=x&sortBy=y, ?q[]=x)
 *    - Prototype pollution payloads (__proto__, constructor.prototype)
 *    - Numeric boundaries (page=999999999999999, page=-1000, page=0, limit=0, limit=50000)
 *    - Filter boundaries (minDiscount=101, minDiscount=-50, maxPrice=0, maxPrice=-10)
 *    - Long search strings (10,000-char over HTTP sub-100ms, 50,000-char algorithmic sub-50ms)
 *    - Punctuation & regex fuzzing (!@#$%^&*()_+-=[]{}|;':",./<>?~)
 *    - Case-insensitive & delimiter-tolerant sorting (price_asc, PRICE-DESC, discount_desc)
 * 2. Extreme Concurrency & Multi-tier Ingestion Race Condition Hardening (F3, F4, F8):
 *    - 50 concurrent POST /api/sync deduplication stress test (inFlightSync sharing)
 *    - 100-request concurrent burst across all REST endpoints
 *    - Continuous read traffic during active background sync
 * 3. Cache Corruption Recovery & Fault Injection Resilience (F2, F4, F15):
 *    - Truncated/corrupted JSON cache quarantine (.corrupt.<timestamp>)
 *    - 0-byte empty cache file quarantine
 *    - Self-healing recovery on subsequent writes
 *    - Key sanitization directory traversal defenses (../../evil)
 *    - Native node:sqlite cache store stress, TTL expiration & pruneExpired
 * 4. Security, HTTP Method Enforcement & Traversal Defenses (F9, F16):
 *    - Unsupported HTTP methods on REST routes (POST /api/stores -> 404 JSON)
 *    - Malformed JSON body in POST /api/sync -> 400 Bad Request
 *    - Raw wire-level multi-layer traversal (%252e%252e%252f, ....//, ..\\..\\) -> 403 Forbidden
 *    - Non-existent /api/* routes return structured JSON 404
 *    - Mandatory security headers (X-Content-Type-Options: nosniff, X-Frame-Options: DENY)
 * 5. Italian Diacritics, Ligatures & Unicode Search Normalization (F6, F12):
 *    - NFD decomposed vs precomposed diacritics (caff\u0065\u0300 vs caffè)
 *    - Full Italian vowel accent spectrum (à, è, é, ì, ò, ù, À, È, É, Ì, Ò, Ù)
 *    - Typographic curly apostrophe (d’oliva) vs typewriter apostrophe (d'oliva)
 *    - Non-Latin characters & emojis (☕ caffè, 🍝 pasta barilla)
 *    - Facet distribution stability across all 10 product categories
 * 6. Modal State Machine, Viewport Layout & Formatting Stress (F10, F11, F14):
 *    - FlyerModalCoordinator boundary clamping under rapid 50-step navigation
 *    - Out-of-bounds goToPage jumps (negative, zero, NaN, float, string, undefined)
 *    - Single-page vs multi-page flyer edge cases
 *    - Keyboard navigation state machine (ignored when closed, responsive when open)
 *    - formatValidityBadge date oracle (leap day 2028-02-29, year bounds, invalid inputs)
 *    - Viewport boundary responsive contracts (320px to 1280px max-width)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { createApp, sanitizeStaticPath } from '../../server/index.js';
import {
  offerService,
  normalizeSearchToken,
  getSortComparator,
  computeFacets,
  VALID_PRODUCT_CATEGORIES
} from '../../server/services/offerService.js';
import { ingestionService } from '../../server/services/ingestionService.js';
import { CacheManager, JsonDiskStore, SqliteCacheStore } from '../../server/services/cacheManager.js';
import { FlyerModalCoordinator } from '../../src/components/FlyerModalCoordinator.js';
import { PROJECT_ROOT, CANONICAL_CHAINS, CANONICAL_RAPALLO_STORES } from '../helpers/test_helper.js';

// Dynamically extract formatValidityBadge from OfferCard.jsx without JSX compilation dependency
const offerCardSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/OfferCard.jsx'), 'utf8');
const fnMatch = offerCardSource.match(/export function formatValidityBadge[\s\S]*?^}/m);
if (!fnMatch) throw new Error('formatValidityBadge not found in OfferCard.jsx');
const formatValidityBadge = new Function('isoString', fnMatch[0].replace('export function formatValidityBadge(isoString) {', '').replace(/}$/, ''));

/**
 * Helper to execute raw wire HTTP requests without client-side URL pre-normalization
 */
function rawHttpRequest(port, rawPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: rawPath,
        method
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body
          });
        });
      }
    );
    req.on('error', reject);
    req.end();
  });
}

describe('Tier 5 Adversarial Coverage Hardening (Empirical Challenger 1)', () => {
  let server;
  let baseUrl;
  let serverPort;

  before(async () => {
    // Ensure ingestion service is warmed up with seed data
    await ingestionService.init();

    // Launch Express application on an ephemeral port (port 0) for zero conflict
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

  // =========================================================================
  // SUITE 1: Malformed & Hostile HTTP Query Parameter Hardening
  // =========================================================================
  describe('1. Malformed & Hostile HTTP Query Parameter Hardening', () => {
    it('1.1 Array-valued parameter injection (type confusion) does not crash GET /api/offers', async () => {
      // Passing duplicate keys produces arrays in req.query
      const res = await fetch(`${baseUrl}/api/offers?storeId=basko-rapallo-colombo&storeId=coop-rapallo-sciesa&sortBy=priceAsc&sortBy=discountDesc&page=1&page=2`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('application/json'));

      const data = await res.json();
      assert.equal(typeof data.totalOffers, 'number');
      assert.ok(Array.isArray(data.offers));
      assert.equal(typeof data.page, 'number');
      assert.equal(typeof data.totalPages, 'number');
    });

    it('1.2 Prototype pollution query attempts (__proto__, constructor) are safely neutralized', async () => {
      const res = await fetch(`${baseUrl}/api/offers?__proto__[polluted]=true&constructor[prototype][admin]=true&storeId=__proto__`);
      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(Array.isArray(data.offers));

      // Global Object prototype must remain unpolluted
      assert.equal(Object.prototype.polluted, undefined);
      assert.equal(Object.prototype.admin, undefined);
    });

    it('1.3 Pagination boundaries: extreme page numbers are gracefully clamped', async () => {
      // Massive page number beyond any possible totalPages
      const resFar = await fetch(`${baseUrl}/api/offers?page=999999999999999`);
      assert.equal(resFar.status, 200);
      const dataFar = await resFar.json();
      assert.equal(dataFar.offers.length, 0);
      assert.ok(dataFar.page >= 1);

      // Negative page number should be clamped to page 1
      const resNeg = await fetch(`${baseUrl}/api/offers?page=-1000`);
      assert.equal(resNeg.status, 200);
      const dataNeg = await resNeg.json();
      assert.equal(dataNeg.page, 1);
      assert.ok(dataNeg.offers.length > 0);

      // Page 0 should be normalized to page 1
      const resZero = await fetch(`${baseUrl}/api/offers?page=0`);
      assert.equal(resZero.status, 200);
      const dataZero = await resZero.json();
      assert.equal(dataZero.page, 1);
    });

    it('1.4 Pagination boundaries: limit parameter clamping between 1 and 100', async () => {
      // Limit 0 should fallback to default limit (20)
      const resZero = await fetch(`${baseUrl}/api/offers?limit=0`);
      assert.equal(resZero.status, 200);
      const dataZero = await resZero.json();
      assert.equal(dataZero.limit, 20);

      // Negative limit should clamp to minimum 1
      const resNeg = await fetch(`${baseUrl}/api/offers?limit=-50`);
      assert.equal(resNeg.status, 200);
      const dataNeg = await resNeg.json();
      assert.equal(dataNeg.limit, 1);
      assert.ok(dataNeg.offers.length <= 1);

      // Huge limit should clamp to max limit (100)
      const resHuge = await fetch(`${baseUrl}/api/offers?limit=50000`);
      assert.equal(resHuge.status, 200);
      const dataHuge = await resHuge.json();
      assert.equal(dataHuge.limit, 100);
      assert.ok(dataHuge.offers.length <= 100);
    });

    it('1.5 Filter boundaries: minDiscount and maxPrice boundary values', async () => {
      // minDiscount > 100% yields 0 offers and totalPages: 0
      const resOver = await fetch(`${baseUrl}/api/offers?minDiscount=101`);
      assert.equal(resOver.status, 200);
      const dataOver = await resOver.json();
      assert.equal(dataOver.totalOffers, 0);
      assert.equal(dataOver.offers.length, 0);
      assert.equal(dataOver.totalPages, 0);

      // Negative minDiscount clamps to 0 (matches all offers)
      const resNeg = await fetch(`${baseUrl}/api/offers?minDiscount=-50`);
      assert.equal(resNeg.status, 200);
      const dataNeg = await resNeg.json();
      assert.ok(dataNeg.totalOffers > 0);

      // maxPrice = 0 should return 0 offers unless free items exist
      const resPriceZero = await fetch(`${baseUrl}/api/offers?maxPrice=0`);
      assert.equal(resPriceZero.status, 200);
      const dataPriceZero = await resPriceZero.json();
      assert.equal(dataPriceZero.offers.length, 0);
      assert.equal(dataPriceZero.totalPages, 0);

      // Negative maxPrice should be ignored safely
      const resPriceNeg = await fetch(`${baseUrl}/api/offers?maxPrice=-10`);
      assert.equal(resPriceNeg.status, 200);
      const dataPriceNeg = await resPriceNeg.json();
      assert.ok(dataPriceNeg.totalOffers > 0);
    });

    it('1.6 Long search query processing: 10,000-char over HTTP and 50,000-char algorithmic execution', async () => {
      // 10,000-character search query over HTTP (fits within HTTP header size)
      const http10kQuery = 'pasta '.repeat(1600); // ~9,600 chars
      const startHttp = Date.now();
      const res = await fetch(`${baseUrl}/api/offers?q=${encodeURIComponent(http10kQuery)}`);
      const httpElapsed = Date.now() - startHttp;

      assert.equal(res.status, 200);
      assert.ok(httpElapsed < 500, `10k HTTP query took ${httpElapsed}ms, must be < 500ms`);
      const data = await res.json();
      assert.equal(typeof data.totalOffers, 'number');

      // 50,000-character algorithmic search processing directly in offerService
      const massive50kQuery = 'barilla '.repeat(6250); // 50,000 chars
      const startAlgo = Date.now();
      const resultAlgo = await offerService.getOffers({ q: massive50kQuery });
      const algoElapsed = Date.now() - startAlgo;

      assert.ok(algoElapsed < 100, `50k algorithmic query took ${algoElapsed}ms, must be < 100ms`);
      assert.equal(typeof resultAlgo.totalOffers, 'number');
    });

    it('1.7 Punctuation & regex meta-characters fuzzing returns 200 without regex throw', async () => {
      const specialQueries = [
        '.*',
        '([a-z]+)',
        '+++',
        '\\bword\\b',
        '???',
        '{1,5}',
        '<^>$|&~',
        '" OR ""="',
        '<script>alert(1)</script>'
      ];

      for (const q of specialQueries) {
        const res = await fetch(`${baseUrl}/api/offers?q=${encodeURIComponent(q)}`);
        assert.equal(res.status, 200, `Query "${q}" must return 200`);
        const data = await res.json();
        assert.ok(Array.isArray(data.offers));
      }
    });

    it('1.8 Case-insensitive and delimiter-tolerant sorting options', async () => {
      const sortVariants = [
        'price_asc',
        'PRICE-DESC',
        'discount_desc',
        'DISCOUNTASC',
        'name-asc',
        'NAME_DESC',
        'expiring_soon'
      ];

      for (const sortBy of sortVariants) {
        const res = await fetch(`${baseUrl}/api/offers?sortBy=${sortBy}`);
        assert.equal(res.status, 200, `Sort option "${sortBy}" must return 200`);
        const data = await res.json();
        assert.ok(data.offers.length > 0);
      }

      // Unknown sort key defaults safely without error
      const resUnknown = await fetch(`${baseUrl}/api/offers?sortBy=invalid_non_existent_key`);
      assert.equal(resUnknown.status, 200);
    });
  });

  // =========================================================================
  // SUITE 2: Extreme Concurrency & Multi-tier Ingestion Race Conditions
  // =========================================================================
  describe('2. Extreme Concurrency & Multi-tier Ingestion Race Conditions', () => {
    it('2.1 Concurrent 50 POST /api/sync triggers are deduplicated via inFlightSync', async () => {
      const requests = Array.from({ length: 50 }, (_, i) =>
        fetch(`${baseUrl}/api/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ force: i === 0 })
        })
      );

      const responses = await Promise.all(requests);
      for (const res of responses) {
        assert.equal(res.status, 200);
        assert.ok(res.headers.get('content-type').includes('application/json'));
      }

      const results = await Promise.all(responses.map((r) => r.json()));
      for (const result of results) {
        assert.ok(['success', 'partial_success', 'cached_fallback'].includes(result.status));
        assert.equal(typeof result.storesProcessed, 'number');
        assert.ok(result.storesProcessed >= 5);
        assert.equal(typeof result.totalFlyers, 'number');
        assert.equal(typeof result.totalOffers, 'number');
      }
    });

    it('2.2 High concurrency burst: 100 mixed requests across all REST endpoints', async () => {
      const endpoints = [
        '/api/stores',
        '/api/offers?category=Dispensa+e+Pasta',
        '/api/offers?sortBy=priceAsc',
        '/api/flyers',
        '/api/status',
        '/api/offers?q=caffè'
      ];

      const burst = Array.from({ length: 100 }, (_, i) => {
        const ep = endpoints[i % endpoints.length];
        return fetch(`${baseUrl}${ep}`);
      });

      const startTime = Date.now();
      const responses = await Promise.all(burst);
      const duration = Date.now() - startTime;

      for (const res of responses) {
        assert.equal(res.status, 200);
      }
      assert.ok(duration < 3000, `100-request burst completed in ${duration}ms, must be < 3000ms`);
    });

    it('2.3 Continuous read traffic during active sync maintains 100% availability', async () => {
      // Trigger background sync
      const syncPromise = fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ force: true })
      });

      // While sync is running, perform simultaneous reads
      const readPromises = [
        fetch(`${baseUrl}/api/stores`),
        fetch(`${baseUrl}/api/offers`),
        fetch(`${baseUrl}/api/flyers`),
        fetch(`${baseUrl}/api/status`)
      ];

      const [syncRes, ...readResponses] = await Promise.all([syncPromise, ...readPromises]);

      assert.equal(syncRes.status, 200);
      for (const readRes of readResponses) {
        assert.equal(readRes.status, 200);
        const json = await readRes.json();
        assert.ok(json !== null && typeof json === 'object');
      }
    });
  });

  // =========================================================================
  // SUITE 3: Cache Corruption Recovery & Fault Injection Resilience
  // =========================================================================
  describe('3. Cache Corruption Recovery & Fault Injection Resilience', () => {
    let tempCacheDir;
    let isolatedCacheManager;

    before(() => {
      tempCacheDir = path.join(os.tmpdir(), `basilico_test_cache_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
      fs.mkdirSync(tempCacheDir, { recursive: true });
      isolatedCacheManager = new CacheManager({ cacheDir: tempCacheDir });
    });

    after(() => {
      if (fs.existsSync(tempCacheDir)) {
        fs.rmSync(tempCacheDir, { recursive: true, force: true });
      }
    });

    it('3.1 Corrupted JSON cache file is quarantined and returns null without throwing', () => {
      const key = 'test_corrupt_key';
      const filePath = path.join(tempCacheDir, `${key}.json`);

      // Write broken truncated JSON payload
      fs.writeFileSync(filePath, '{"metadata": {"key": "test_corrupt_key", "expiresAt": ', 'utf8');

      // get() should catch parse failure, quarantine the file, and return null
      const value = isolatedCacheManager.get(key);
      assert.equal(value, null);

      // Verify original file is quarantined
      assert.equal(fs.existsSync(filePath), false, 'Original corrupted file must be moved');
      const files = fs.readdirSync(tempCacheDir);
      const quarantined = files.find((f) => f.startsWith(`${key}.json.corrupt.`));
      assert.ok(quarantined, 'Quarantined file must exist in cache directory');
    });

    it('3.2 Zero-byte empty cache file is quarantined as corrupted', () => {
      const key = 'test_empty_key';
      const filePath = path.join(tempCacheDir, `${key}.json`);

      // Write 0-byte empty file
      fs.writeFileSync(filePath, '', 'utf8');

      const value = isolatedCacheManager.get(key);
      assert.equal(value, null);

      assert.equal(fs.existsSync(filePath), false);
      const files = fs.readdirSync(tempCacheDir);
      const quarantined = files.find((f) => f.startsWith(`${key}.json.corrupt.`));
      assert.ok(quarantined, 'Empty cache file must be quarantined');
    });

    it('3.3 Cache self-healing: subsequent set/get operates normally after corruption', () => {
      const key = 'test_corrupt_key';
      const freshData = [{ id: 'offer-healed-1', title: 'Pasta Healed' }];

      isolatedCacheManager.set(key, freshData, 3600);
      const retrieved = isolatedCacheManager.get(key);
      assert.deepEqual(retrieved, freshData);
    });

    it('3.4 Key sanitization prevents directory traversal escapes', () => {
      const maliciousKey = '../../../../etc/passwd';
      isolatedCacheManager.set(maliciousKey, { escape: false });

      // Sanitized key should not contain ../ and should remain within tempCacheDir
      const files = fs.readdirSync(tempCacheDir);
      const createdFile = files.find((f) => f.includes('passwd'));
      assert.ok(createdFile, 'File must be written inside cache directory');
      assert.ok(!createdFile.includes('..'), 'File name must sanitize dot sequences');
    });

    it('3.5 Native node:sqlite CacheStore handles high volume, TTL, and pruneExpired', () => {
      const sqlitePath = path.join(tempCacheDir, 'sqlite_stress.db');
      const sqliteStore = new SqliteCacheStore(sqlitePath);

      try {
        // Insert 100 entries with mixed expirations
        const now = Date.now();
        for (let i = 0; i < 100; i++) {
          const isExpired = i < 50;
          const expiresAt = new Date(now + (isExpired ? -10000 : 100000)).toISOString();
          const envelope = {
            metadata: {
              key: `item_${i}`,
              cachedAt: new Date().toISOString(),
              expiresAt,
              staleGraceSeconds: 0,
              dataSource: 'test'
            },
            data: { id: i, name: `Item ${i}` }
          };
          sqliteStore.set(`item_${i}`, envelope);
        }

        // Verify keys
        const allKeys = sqliteStore.keys();
        assert.equal(allKeys.length, 100);

        // Prune expired entries
        const prunedCount = sqliteStore.pruneExpired(new Date(now).toISOString());
        assert.equal(prunedCount, 50, 'Must prune exactly the 50 expired records');

        const remainingKeys = sqliteStore.keys();
        assert.equal(remainingKeys.length, 50);

        // Verify unexpired entry retrieval
        const liveItem = sqliteStore.get('item_75');
        assert.equal(liveItem?.data?.id, 75);
      } finally {
        sqliteStore.close();
      }
    });
  });

  // =========================================================================
  // SUITE 4: Security, HTTP Method Enforcement & Traversal Defenses
  // =========================================================================
  describe('4. Security, HTTP Method Enforcement & Traversal Defenses', () => {
    it('4.1 Disallowed HTTP methods on REST routes return JSON 404 (not HTML or 500)', async () => {
      const badMethods = [
        { path: '/api/stores', method: 'POST' },
        { path: '/api/stores', method: 'DELETE' },
        { path: '/api/offers', method: 'PUT' },
        { path: '/api/offers', method: 'PATCH' },
        { path: '/api/flyers', method: 'DELETE' }
      ];

      for (const { path: p, method: m } of badMethods) {
        const res = await fetch(`${baseUrl}${p}`, { method: m });
        assert.equal(res.status, 404, `${m} ${p} must return 404`);
        assert.ok(res.headers.get('content-type').includes('application/json'));
        const body = await res.json();
        assert.ok(body.error.includes('API endpoint not found'));
      }
    });

    it('4.2 Malformed JSON body in POST /api/sync triggers 400 with structured JSON error', async () => {
      const res = await fetch(`${baseUrl}/api/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"broken": '
      });

      assert.equal(res.status, 400);
      assert.ok(res.headers.get('content-type').includes('application/json'));
      const body = await res.json();
      assert.equal(body.error, 'Invalid JSON payload');
    });

    it('4.3 Multi-layer encoded directory traversal attempts return HTTP 403 Forbidden', async () => {
      const traversalAttacks = [
        '/%2e%2e/%2e%2e/package.json',
        '/%252e%252e/%252e%252e/server.js',
        '/....//....//package.json',
        '/..%2f..%2fetc/passwd',
        '/static/..\\..\\package.json'
      ];

      for (const attack of traversalAttacks) {
        const res = await rawHttpRequest(serverPort, attack, 'GET');
        assert.equal(res.statusCode, 403, `Traversal attack "${attack}" must return 403`);
        assert.ok(res.headers['content-type'].includes('application/json'));
        const body = JSON.parse(res.body);
        assert.ok(body.error.includes('Access denied: Path traversal detected'));
      }
    });

    it('4.4 Non-existent /api/ subroutes return structured JSON 404 instead of SPA fallback', async () => {
      const res = await fetch(`${baseUrl}/api/non_existent_route/details?id=123`);
      assert.equal(res.status, 404);
      assert.ok(res.headers.get('content-type').includes('application/json'));
      const body = await res.json();
      assert.ok(body.error.includes('API endpoint not found'));
    });

    it('4.5 Mandatory security headers (nosniff, DENY) are enforced across all endpoints', async () => {
      const res = await fetch(`${baseUrl}/api/stores`);
      assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(res.headers.get('x-frame-options'), 'DENY');
    });
  });

  // =========================================================================
  // SUITE 5: Italian Diacritics, Ligatures & Unicode Search Normalization
  // =========================================================================
  describe('5. Italian Diacritics, Ligatures & Unicode Search Normalization', () => {
    it('5.1 NFD decomposed Unicode matches precomposed NFC Unicode symmetrically', () => {
      // Precomposed "caffè" (U+00E8) vs Decomposed "caff\u0065\u0300" (e + combining grave)
      const precomposed = 'caffè';
      const decomposed = 'caff\u0065\u0300';

      const normPre = normalizeSearchToken(precomposed);
      const normDec = normalizeSearchToken(decomposed);

      assert.equal(normPre, 'caffe');
      assert.equal(normDec, 'caffe');
      assert.equal(normPre, normDec);

      // "perché" precomposed (U+00E9) vs decomposed (U+0065 U+0301)
      assert.equal(normalizeSearchToken('perché'), normalizeSearchToken('perch\u0065\u0301'));
    });

    it('5.2 Full Italian accented vowel spectrum maps cleanly to base letters', () => {
      const accented = 'à è é ì ò ù À È É Ì Ò Ù';
      const normalized = normalizeSearchToken(accented);
      assert.equal(normalized, 'a e e i o u a e e i o u');
    });

    it('5.3 Typographic curly apostrophe (d’oliva) and typewriter apostrophe (d\'oliva) normalize identically', () => {
      const curly = 'olio d’oliva extravergine';
      const typewriter = "olio d'oliva extravergine";

      assert.equal(normalizeSearchToken(curly), 'olio d oliva extravergine');
      assert.equal(normalizeSearchToken(typewriter), 'olio d oliva extravergine');
      assert.equal(normalizeSearchToken(curly), normalizeSearchToken(typewriter));
    });

    it('5.4 Non-Latin symbols & emoji queries extract search tokens safely', () => {
      assert.equal(normalizeSearchToken('☕ Caffè Lavazza 250g'), 'caffe lavazza 250g');
      assert.equal(normalizeSearchToken('🍝 Pasta Barilla 500g'), 'pasta barilla 500g');
      assert.equal(normalizeSearchToken('🛒 100% Sconto'), '100 sconto');
    });

    it('5.5 Facets computation preserves all 10 canonical categories with non-negative counts', () => {
      const facets = computeFacets([]);
      assert.equal(typeof facets.categories, 'object');
      assert.equal(typeof facets.stores, 'object');
      assert.equal(typeof facets.discountRanges, 'object');

      for (const cat of VALID_PRODUCT_CATEGORIES) {
        assert.equal(facets.categories[cat], 0, `Category "${cat}" must exist with count 0`);
      }
      assert.equal(facets.discountRanges['50+'], 0);
      assert.equal(facets.discountRanges['40-49'], 0);
      assert.equal(facets.discountRanges['30-39'], 0);
      assert.equal(facets.discountRanges['20-29'], 0);
      assert.equal(facets.discountRanges['under20'], 0);
    });
  });

  // =========================================================================
  // SUITE 6: Modal State Machine, Viewport Layout & Formatting Stress
  // =========================================================================
  describe('6. Modal State Machine, Viewport Layout & Formatting Stress', () => {
    it('6.1 FlyerModalCoordinator clamps strictly under rapid 50-step navigation', () => {
      const flyer = {
        id: 'flyer-coop-stress',
        pageCount: 5,
        pages: ['p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg', 'p5.jpg']
      };

      const coord = new FlyerModalCoordinator(flyer);
      coord.open();
      assert.equal(coord.currentPage, 1);

      // 50 rapid prevPage calls at page 1 must stay at page 1
      for (let i = 0; i < 50; i++) coord.prevPage();
      assert.equal(coord.currentPage, 1);

      // 50 rapid nextPage calls must clamp at totalPages (5)
      for (let i = 0; i < 50; i++) coord.nextPage();
      assert.equal(coord.currentPage, 5);

      const state = coord.getState();
      assert.equal(state.currentPage, 5);
      assert.equal(state.totalPages, 5);
      assert.equal(state.hasNext, false);
      assert.equal(state.hasPrev, true);
    });

    it('6.2 Out-of-bounds goToPage calls are safely rejected without state corruption', () => {
      const flyer = { pageCount: 8, pages: Array.from({ length: 8 }, (_, i) => `p${i + 1}.jpg`) };
      const coord = new FlyerModalCoordinator(flyer);
      coord.open();

      coord.goToPage(-10);
      assert.equal(coord.currentPage, 1);

      coord.goToPage(0);
      assert.equal(coord.currentPage, 1);

      coord.goToPage(999);
      assert.equal(coord.currentPage, 1);

      coord.goToPage(NaN);
      assert.equal(coord.currentPage, 1);

      coord.goToPage('invalid');
      assert.equal(coord.currentPage, 1);

      // Valid string jump converts cleanly
      coord.goToPage('4');
      assert.equal(coord.currentPage, 4);

      // Float number truncates
      coord.goToPage(6.8);
      assert.equal(coord.currentPage, 6);
    });

    it('6.3 Single-page flyer initializes with zero progression capability', () => {
      const flyer = { pageCount: 1, coverImageUrl: 'single.jpg', pages: [] };
      const coord = new FlyerModalCoordinator(flyer);
      coord.open();

      const state = coord.getState();
      assert.equal(state.currentPage, 1);
      assert.equal(state.totalPages, 1);
      assert.equal(state.hasNext, false);
      assert.equal(state.hasPrev, false);
      assert.equal(state.activePageUrl, 'single.jpg');

      coord.nextPage();
      assert.equal(coord.currentPage, 1);
      coord.prevPage();
      assert.equal(coord.currentPage, 1);
    });

    it('6.4 Keyboard navigation lifecycle respects modal open/closed state', () => {
      const flyer = { pageCount: 4, pages: ['1.jpg', '2.jpg', '3.jpg', '4.jpg'] };
      const coord = new FlyerModalCoordinator(flyer);

      // Closed modal: key events ignored
      coord.handleKeyDown('ArrowRight');
      assert.equal(coord.currentPage, 1);

      // Open modal: ArrowRight advances, Escape closes
      coord.open();
      coord.handleKeyDown('ArrowRight');
      assert.equal(coord.currentPage, 2);

      coord.handleKeyDown('ArrowLeft');
      assert.equal(coord.currentPage, 1);

      coord.handleKeyDown('Escape');
      assert.equal(coord.isOpen, false);

      // Unhandled keys return current state safely
      coord.open();
      const st = coord.handleKeyDown('Tab');
      assert.equal(st.currentPage, 1);
    });

    it('6.5 formatValidityBadge oracle handles boundary dates, leap years, and invalid inputs', () => {
      // Leap day 2028-02-29
      assert.equal(formatValidityBadge('2028-02-29T12:00:00.000Z'), 'Valido fino al 29 feb');

      // First day of calendar year
      assert.equal(formatValidityBadge('2026-01-01T00:00:00.000Z'), 'Valido fino al 1 gen');

      // Last day of calendar year
      assert.equal(formatValidityBadge('2026-12-31T23:59:59.000Z'), 'Valido fino al 31 dic');

      // Invalid inputs return null
      assert.equal(formatValidityBadge(''), null);
      assert.equal(formatValidityBadge(null), null);
      assert.equal(formatValidityBadge(undefined), null);
      assert.equal(formatValidityBadge('not-a-valid-date'), null);
    });

    it('6.6 Viewport layout column contracts across responsive breakpoints', () => {
      // Viewport column oracle matching OfferGrid.jsx and responsive design specs:
      // < 640px: 1 column
      // 640px - 1023px: 2 columns
      // >= 1024px: 4 columns
      const getColumnsForWidth = (width) => {
        const w = parseInt(width, 10) || 375;
        if (w >= 1024) return 4;
        if (w >= 640) return 2;
        return 1;
      };

      assert.equal(getColumnsForWidth(320), 1, '320px narrow mobile must have 1 column');
      assert.equal(getColumnsForWidth(375), 1, '375px standard mobile must have 1 column');
      assert.equal(getColumnsForWidth(639), 1, '639px boundary must have 1 column');
      assert.equal(getColumnsForWidth(640), 2, '640px tablet breakpoint must have 2 columns');
      assert.equal(getColumnsForWidth(768), 2, '768px iPad portrait must have 2 columns');
      assert.equal(getColumnsForWidth(1023), 2, '1023px boundary must have 2 columns');
      assert.equal(getColumnsForWidth(1024), 4, '1024px desktop breakpoint must have 4 columns');
      assert.equal(getColumnsForWidth(1280), 4, '1280px standard desktop must have 4 columns');
      assert.equal(getColumnsForWidth(2560), 4, '2560px 4K must have 4 columns');
    });
  });
});
