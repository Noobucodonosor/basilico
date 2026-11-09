/**
 * Challenger Stress Harness: Milestone 1 Deep Stress & Robustness Tests
 * 
 * Empirically stress-tests:
 * 1. CacheManager:
 *    - 50 rapid concurrent writes (same key & distinct keys)
 *    - Corrupted file injection (0-byte, truncated JSON, binary garbage, non-envelope)
 *    - Key sanitization & directory traversal defense (../../etc/passwd, null bytes, symbols)
 * 2. IngestionService:
 *    - Network blackout (ECONNREFUSED), timeout, abort, HTTP 500/502/404, corrupted __NEXT_DATA__
 *    - Multi-tier fallback cascade (Live -> Cache Grace -> Seed -> Empty Shield)
 *    - Italian accent normalization and case folding edge cases ("Caffè", "CAFFE", "caffe", "latte", "pò", ReDoS)
 */

import { describe, it, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { JsonDiskStore, SqliteCacheStore, CacheManager } from '../../server/services/cacheManager.js';
import { IngestionService } from '../../server/services/ingestionService.js';

describe('CHALLENGER EMPIRICAL STRESS HARNESS (Milestone 1)', () => {
  let testCacheDir;
  let testSeedDir;

  before(() => {
    testCacheDir = path.join(os.tmpdir(), `basilico_challenger_cache_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`);
    testSeedDir = path.resolve(process.cwd(), 'data/seed');
    fs.mkdirSync(testCacheDir, { recursive: true });
  });

  after(() => {
    try {
      fs.rmSync(testCacheDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('1. CacheManager Concurrency & Stress Testing', () => {
    let cache;

    beforeEach(() => {
      // Clean cache directory
      const files = fs.readdirSync(testCacheDir);
      for (const f of files) {
        fs.rmSync(path.join(testCacheDir, f), { recursive: true, force: true });
      }
      cache = new CacheManager({ cacheDir: testCacheDir });
    });

    it('1.1 should survive 50 rapid concurrent writes to the SAME key with zero corruption', async () => {
      const concurrency = 50;
      const key = 'hot_spot_key';

      // Launch 50 parallel writes with distinct payloads
      const writePromises = Array.from({ length: concurrency }, (_, idx) => {
        return Promise.resolve().then(() => {
          return cache.set(key, { iteration: idx, timestamp: Date.now(), payload: `payload_${idx}`.repeat(20) });
        });
      });

      const results = await Promise.all(writePromises);
      assert.equal(results.length, concurrency);

      // Verify final state
      const envelope = cache.getEnvelope(key);
      assert.ok(envelope, 'Envelope must exist after concurrent writes');
      assert.ok(envelope.metadata, 'Envelope must possess valid metadata');
      assert.ok(envelope.data, 'Envelope must possess valid data');
      assert.ok(typeof envelope.data.iteration === 'number', 'Payload iteration must be a valid number');
      assert.ok(envelope.data.payload.startsWith('payload_'), 'Payload must match written string');

      // Verify file on disk is valid JSON
      const targetFile = path.join(testCacheDir, `${key}.json`);
      assert.ok(fs.existsSync(targetFile), 'Target file must exist');
      const content = fs.readFileSync(targetFile, 'utf8');
      const parsed = JSON.parse(content);
      assert.equal(parsed.metadata.key, key);

      // Verify NO orphaned .tmp files remain
      const remainingTmp = fs.readdirSync(testCacheDir).filter(f => f.endsWith('.tmp'));
      assert.equal(remainingTmp.length, 0, `No leftover .tmp files should exist, found: ${remainingTmp.join(', ')}`);
    });

    it('1.2 should handle 50 rapid concurrent writes to 50 DISTINCT keys without locking issues', async () => {
      const count = 50;
      const writePromises = Array.from({ length: count }, (_, idx) => {
        return Promise.resolve().then(() => {
          return cache.set(`distinct_key_${idx}`, { idx, value: `val_${idx}` });
        });
      });

      await Promise.all(writePromises);

      // Verify all 50 keys can be read back cleanly
      for (let i = 0; i < count; i++) {
        const val = cache.get(`distinct_key_${i}`);
        assert.ok(val, `Key distinct_key_${i} must exist`);
        assert.equal(val.idx, i);
        assert.equal(val.value, `val_${i}`);
      }

      // Verify keys() returns all 50 keys
      const keys = cache.keys();
      assert.equal(keys.length, count);
    });

    it('1.3 should safely support interleaved concurrent reads and writes without partial reads', async () => {
      const key = 'race_test_key';
      cache.set(key, { version: 0, array: [1, 2, 3] });

      const totalOps = 60;
      const readResults = [];

      // Interleave writes and reads
      const ops = Array.from({ length: totalOps }, (_, idx) => {
        if (idx % 2 === 0) {
          // Write op
          return Promise.resolve().then(() => {
            cache.set(key, { version: idx, array: Array.from({ length: 50 }, () => idx) });
          });
        } else {
          // Read op
          return Promise.resolve().then(() => {
            const data = cache.get(key);
            readResults.push(data);
          });
        }
      });

      await Promise.all(ops);

      // Assert that EVERY read returned an uncorrupted, fully formed object
      assert.ok(readResults.length > 0);
      for (const res of readResults) {
        assert.ok(res !== null, 'Reader should never observe null during concurrent atomic replacement');
        assert.ok(typeof res.version === 'number', 'Version must be numeric');
        assert.ok(Array.isArray(res.array), 'Array must be an array');
        assert.ok(res.array.length >= 3, 'Array must not be truncated');
      }
    });

    it('1.4 should support SqliteCacheStore concurrent atomic operations', async () => {
      const sqlitePath = path.join(testCacheDir, 'stress_test.db');
      const sqliteCache = new CacheManager({
        cacheDir: testCacheDir,
        backend: 'sqlite',
        sqlitePath
      });

      const count = 50;
      const ops = Array.from({ length: count }, (_, idx) => {
        return Promise.resolve().then(() => {
          sqliteCache.set(`sqlite_key_${idx}`, { idx, test: true });
        });
      });

      await Promise.all(ops);

      for (let i = 0; i < count; i++) {
        const data = sqliteCache.get(`sqlite_key_${i}`);
        assert.ok(data);
        assert.equal(data.idx, i);
      }

      assert.equal(sqliteCache.keys().length, count);
      sqliteCache.store.close();
    });
  });

  describe('2. Corrupted File Injection, Quarantine & Auto-Recovery', () => {
    let cache;

    beforeEach(() => {
      const files = fs.readdirSync(testCacheDir);
      for (const f of files) {
        fs.rmSync(path.join(testCacheDir, f), { recursive: true, force: true });
      }
      cache = new CacheManager({ cacheDir: testCacheDir });
    });

    it('2.1 should quarantine 0-byte empty file and auto-recover cleanly on next write', () => {
      const key = 'zero_byte_entry';
      const filePath = path.join(testCacheDir, `${key}.json`);

      // 1. Inject 0-byte file
      fs.writeFileSync(filePath, '', 'utf8');
      assert.equal(fs.statSync(filePath).size, 0);

      // 2. Read should catch, quarantine, and return null
      const res = cache.get(key);
      assert.equal(res, null, 'Must return null for empty file');
      assert.ok(!fs.existsSync(filePath), 'Corrupted original file must be renamed/moved away');

      // 3. Verify quarantined file exists
      const corruptFiles = fs.readdirSync(testCacheDir).filter(f => f.startsWith(`${key}.json.corrupt.`));
      assert.equal(corruptFiles.length, 1, 'Exactly one quarantined file must exist');

      // 4. Auto-recovery: subsequent write succeeds
      cache.set(key, { recovered: true, code: 200 });
      const recoveredVal = cache.get(key);
      assert.deepEqual(recoveredVal, { recovered: true, code: 200 });
      assert.ok(fs.existsSync(filePath), 'Clean file should now exist at original path');
    });

    it('2.2 should quarantine truncated JSON and recover cleanly on next write', () => {
      const key = 'truncated_json_entry';
      const filePath = path.join(testCacheDir, `${key}.json`);

      // 1. Inject truncated JSON syntax
      fs.writeFileSync(filePath, '{"metadata": {"key": "truncated"}, "data": [1, 2, ', 'utf8');

      // 2. Read should return null and quarantine
      const res = cache.get(key);
      assert.equal(res, null);
      assert.ok(!fs.existsSync(filePath));

      const corruptFiles = fs.readdirSync(testCacheDir).filter(f => f.startsWith(`${key}.json.corrupt.`));
      assert.equal(corruptFiles.length, 1);

      // 3. Auto-recovery
      cache.set(key, { ok: 1 });
      assert.deepEqual(cache.get(key), { ok: 1 });
    });

    it('2.3 should quarantine random binary garbage bytes and recover cleanly', () => {
      const key = 'garbage_binary_entry';
      const filePath = path.join(testCacheDir, `${key}.json`);

      // 1. Inject binary garbage
      const garbage = Buffer.from([0x00, 0xff, 0xfe, 0x12, 0x34, 0x89, 0xab, 0xcd, 0xef]);
      fs.writeFileSync(filePath, garbage);

      // 2. Read should return null and quarantine
      const res = cache.get(key);
      assert.equal(res, null);
      assert.ok(!fs.existsSync(filePath));

      const corruptFiles = fs.readdirSync(testCacheDir).filter(f => f.startsWith(`${key}.json.corrupt.`));
      assert.equal(corruptFiles.length, 1);

      // 3. Auto-recovery
      cache.set(key, { binaryRecovered: true });
      assert.deepEqual(cache.get(key), { binaryRecovered: true });
    });

    it('2.4 should handle valid JSON with invalid envelope schema without crashing', () => {
      const key = 'non_envelope_entry';
      const filePath = path.join(testCacheDir, `${key}.json`);

      // Non-envelope valid JSON (primitive, or array, or missing metadata)
      fs.writeFileSync(filePath, JSON.stringify([1, 2, 3, "foo"]), 'utf8');
      let res = cache.get(key);
      assert.equal(res, null, 'Must return null for non-envelope array');

      fs.writeFileSync(filePath, JSON.stringify("plain string"), 'utf8');
      res = cache.get(key);
      assert.equal(res, null, 'Must return null for non-envelope string');

      fs.writeFileSync(filePath, JSON.stringify(12345), 'utf8');
      res = cache.get(key);
      assert.equal(res, null, 'Must return null for non-envelope number');

      fs.writeFileSync(filePath, JSON.stringify(null), 'utf8');
      res = cache.get(key);
      assert.equal(res, null, 'Must return null for null JSON');
    });

    it('2.5 should handle repeated corruption injections on the same key without filename collisions', () => {
      const key = 'repeat_corrupt_entry';
      const filePath = path.join(testCacheDir, `${key}.json`);

      // First corruption
      fs.writeFileSync(filePath, '{bad1', 'utf8');
      assert.equal(cache.get(key), null);

      // Second corruption shortly after
      fs.writeFileSync(filePath, '{bad2', 'utf8');
      assert.equal(cache.get(key), null);

      const corruptFiles = fs.readdirSync(testCacheDir).filter(f => f.startsWith(`${key}.json.corrupt.`));
      assert.ok(corruptFiles.length >= 1, 'Quarantine files must be recorded');
    });
  });

  describe('3. Key Sanitization & Path Traversal Attack Defense', () => {
    let cache;

    beforeEach(() => {
      const files = fs.readdirSync(testCacheDir);
      for (const f of files) {
        fs.rmSync(path.join(testCacheDir, f), { recursive: true, force: true });
      }
      cache = new CacheManager({ cacheDir: testCacheDir });
    });

    const maliciousKeys = [
      '../../etc/passwd',
      '../../../var/log/system.log',
      '..\\..\\windows\\win.ini',
      '/tmp/evil_file',
      'subdir/nested_file',
      'subdir\\nested_file',
      '~/.ssh/id_rsa',
      'foo\0bar',
      '*.json',
      'foo?bar=baz',
      'key with spaces & special characters: < > | : " / \\ ? * \n \r \t',
      '',
      '.',
      '..'
    ];

    for (const evilKey of maliciousKeys) {
      it(`3.x should prevent path traversal for key: "${evilKey.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}"`, () => {
        // Set value
        cache.set(evilKey, { sanitized: true, key: evilKey });

        // Verify that NO files were created outside testCacheDir
        const parentDir = path.dirname(testCacheDir);
        const parentFiles = fs.readdirSync(parentDir);
        assert.ok(!parentFiles.includes('evil_file'));
        assert.ok(!parentFiles.includes('passwd'));
        assert.ok(!parentFiles.includes('win.ini'));

        // All files created MUST reside strictly inside testCacheDir
        const cacheFiles = fs.readdirSync(testCacheDir);
        for (const file of cacheFiles) {
          const resolvedPath = path.resolve(testCacheDir, file);
          assert.ok(
            resolvedPath.startsWith(path.resolve(testCacheDir)),
            `File ${resolvedPath} must be within ${testCacheDir}`
          );
          // Filename must match sanitized pattern
          assert.ok(
            /^[a-zA-Z0-9_.-]+$/.test(file),
            `Filename "${file}" must only contain alphanumeric, underscore, dot or dash`
          );
        }

        // Must be readable back via the same key
        const readVal = cache.get(evilKey);
        assert.ok(readVal, 'Sanitized key must be retrievable');
        assert.equal(readVal.sanitized, true);
      });
    }
  });

  describe('4. IngestionService Resilience under Network Blackout, Timeout & HTTP Errors', () => {
    let originalFetch;
    let ingestion;
    let isolatedCache;

    beforeEach(() => {
      originalFetch = globalThis.fetch;
      // Clean test cache directory before each test
      const files = fs.readdirSync(testCacheDir);
      for (const f of files) {
        fs.rmSync(path.join(testCacheDir, f), { recursive: true, force: true });
      }
      isolatedCache = new CacheManager({ cacheDir: testCacheDir });
      ingestion = new IngestionService({
        cacheManager: isolatedCache,
        seedDir: testSeedDir
      });
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
    });

    it('4.1 should smoothly fall back to seed data on complete network blackout (ECONNREFUSED) when cache is empty', async () => {
      // Mock fetch rejection (connection refused)
      globalThis.fetch = async () => {
        const err = new TypeError('fetch failed');
        err.cause = { code: 'ECONNREFUSED', syscall: 'connect' };
        throw err;
      };

      const result = await ingestion.sync(true);

      // Verify zero crash, graceful fallback to seed
      assert.ok(result);
      assert.equal(result.status, 'cached_fallback');
      assert.equal(result.dataSource, 'seed');
      assert.equal(result.storesProcessed, 11);
      assert.equal(result.totalFlyers, 13);
      assert.equal(result.totalOffers, 49);
      assert.ok(result.errors.length > 0, 'Error log must capture upstream failure');

      // Verify all query methods operate flawlessly on seed fallback
      const stores = await ingestion.getStores();
      assert.equal(stores.length, 11);

      const flyers = await ingestion.getFlyers();
      assert.equal(flyers.length, 13);

      const offers = await ingestion.getOffers();
      assert.equal(offers.totalOffers, 49);

      const status = await ingestion.getStatus();
      assert.equal(status.isOnline, false);
      assert.ok(['seed', 'cache'].includes(status.dataSource));
      assert.equal(status.storeCount, 11);
    });

    it('4.2 should fall back to cached data (Tier 2) when cache contains prior data and network drops', async () => {
      // 1. Populate cache with known prior state
      isolatedCache.set('stores', [{ id: 'prior-store', name: 'Prior Store', chainId: 'coop' }], 21600, { dataSource: 'cache' });
      isolatedCache.set('flyers', [{ id: 'prior-flyer', storeId: 'prior-store', validTo: '2099-01-01T00:00:00Z', isCurrent: true }], 21600, { dataSource: 'cache' });
      isolatedCache.set('offers', [{ id: 'prior-offer', storeId: 'prior-store', title: 'Prior Offer', category: 'Dispensa e Pasta' }], 21600, { dataSource: 'cache' });

      // 2. Network drops
      globalThis.fetch = async () => {
        throw new Error('Connection reset by peer');
      };

      const result = await ingestion.sync(true);
      assert.equal(result.status, 'cached_fallback');
      assert.equal(result.dataSource, 'cache');
      assert.equal(result.storesProcessed, 1);
      assert.equal(result.totalFlyers, 1);
      assert.equal(result.totalOffers, 1);
    });

    it('4.3 should smoothly fall back to seed data on network timeout / abort', async () => {
      // Mock fetch with AbortError
      globalThis.fetch = async (_url, options) => {
        const err = new Error('The operation was aborted');
        err.name = 'AbortError';
        throw err;
      };

      const result = await ingestion.sync(true);
      assert.equal(result.dataSource, 'seed');
      assert.equal(result.storesProcessed, 11);
      assert.equal(result.totalFlyers, 13);
      assert.equal(result.totalOffers, 49);
    });

    it('4.4 should smoothly fall back on HTTP 500, 502, 503, 404 responses', async () => {
      const httpStatusCodes = [500, 502, 503, 404];

      for (const code of httpStatusCodes) {
        // Clear cache so each iteration tests clean fallback from cold start
        isolatedCache.clear();

        globalThis.fetch = async () => {
          return new Response(`Error ${code}`, {
            status: code,
            statusText: `HTTP ${code}`
          });
        };

        const result = await ingestion.sync(true);
        assert.ok(result);
        assert.equal(result.status, 'cached_fallback');
        assert.equal(result.dataSource, 'seed', `Cold start fallback for HTTP status ${code} should be seed`);
        assert.equal(result.storesProcessed, 11);
        assert.equal(result.totalFlyers, 13);
        assert.equal(result.totalOffers, 49);
      }
    });

    it('4.5 should handle corrupted HTML payload without crashing', async () => {
      const corruptPayloads = [
        '<html><body>No next data script tag here</body></html>',
        '<script id="__NEXT_DATA__" type="application/json">INVALID_JSON_HERE{{{</script>',
        '<script id="__NEXT_DATA__" type="application/json">{"props": {"pageProps": {}}}</script>' // missing apiResources
      ];

      for (const html of corruptPayloads) {
        isolatedCache.clear();

        globalThis.fetch = async () => {
          return new Response(html, {
            status: 200,
            headers: { 'Content-Type': 'text/html' }
          });
        };

        const result = await ingestion.sync(true);
        assert.ok(result);
        assert.equal(result.dataSource, 'seed');
        assert.equal(result.storesProcessed, 11);
        assert.equal(result.totalFlyers, 13);
        assert.equal(result.totalOffers, 49);
      }
    });

    it('4.6 should deduplicate concurrent sync() calls under network failure', async () => {
      let callCount = 0;
      globalThis.fetch = async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 20));
        throw new Error('Network down');
      };

      // Fire 10 simultaneous sync() requests
      const promises = Array.from({ length: 10 }, () => ingestion.sync(true));
      const results = await Promise.all(promises);

      // Must have executed only 2 fetch calls (primary + fallback URL in a single sync execution)
      assert.equal(callCount, 2, 'Concurrent sync() calls must share the in-flight promise');
      for (const res of results) {
        assert.equal(res.dataSource, 'seed');
        assert.equal(res.storesProcessed, 11);
      }
    });

    it('4.7 should activate Tier 4 defensive shield and never throw even if seed data path is missing', async () => {
      const emptyIngestion = new IngestionService({
        cacheManager: isolatedCache,
        seedDir: '/nonexistent/path/nowhere'
      });

      globalThis.fetch = async () => {
        throw new Error('Network completely down');
      };

      const result = await emptyIngestion.sync(true);
      assert.ok(result);
      assert.equal(result.status, 'failed');
      assert.equal(result.storesProcessed, 0);
      assert.equal(result.totalFlyers, 0);
      assert.equal(result.totalOffers, 0);

      // Verify methods return safe empty defaults instead of throwing
      const stores = await emptyIngestion.getStores();
      assert.deepEqual(stores, []);

      const flyers = await emptyIngestion.getFlyers();
      assert.deepEqual(flyers, []);

      const offers = await emptyIngestion.getOffers();
      assert.equal(offers.totalOffers, 0);
      assert.deepEqual(offers.offers, []);
    });
  });

  describe('5. Italian Query Edge Cases & Accent Normalization', () => {
    let ingestion;

    before(() => {
      const cache = new CacheManager({ cacheDir: testCacheDir });
      ingestion = new IngestionService({
        cacheManager: cache,
        seedDir: testSeedDir
      });
    });

    it('5.1 should match "Caffè Macinato Qualità Rossa" symmetrically across Italian accent & case variants', async () => {
      const variants = [
        'caffè',
        'CAFFÈ',
        'caffe',
        'CAFFE',
        'caffé',
        'CAFFÉ',
        'qualità',
        'QUALITA',
        'qualita',
        'rossa',
        'ROSSA'
      ];

      for (const q of variants) {
        const res = await ingestion.getOffers({ query: q });
        assert.ok(res.totalOffers >= 1, `Query "${q}" should match at least 1 offer`);
        const found = res.offers.some(o => o.id === 'offer-caffe-lavazza-qualita-rossa-500g');
        assert.ok(found, `Query "${q}" must match Lavazza Caffè Qualità Rossa`);
      }
    });

    it('5.2 should match "Latte" across case variations', async () => {
      const variants = ['latte', 'LATTE', 'Latte', 'LaTtE'];
      for (const q of variants) {
        const res = await ingestion.getOffers({ query: q });
        assert.ok(res.totalOffers >= 1, `Query "${q}" should match Latte`);
        const found = res.offers.some(o => o.title.toLowerCase().includes('latte'));
        assert.ok(found);
      }
    });

    it('5.3 should handle Italian query edge cases ("pò", "po\'", "più", "perché", "è")', async () => {
      const edgeQueries = ['pò', "po'", 'più', 'perché', 'perchè', 'è', 'à', 'ì', 'ò', 'ù'];
      for (const q of edgeQueries) {
        const res = await ingestion.getOffers({ query: q });
        assert.ok(typeof res.totalOffers === 'number', `Query "${q}" should not crash`);
        assert.ok(Array.isArray(res.offers), `Offers must be an array for query "${q}"`);
      }
    });

    it('5.4 should safely handle regex meta-characters and ReDoS attack strings without crash', async () => {
      const attackQueries = [
        '.*+?^${}()|[]\\',
        '((((((((a+)+)+)+)+)+)+)+)+',
        'pasta(?!barilla)',
        '\\d+\\w+\\s+',
        'a'.repeat(2000)
      ];

      for (const q of attackQueries) {
        const start = performance.now();
        const res = await ingestion.getOffers({ query: q });
        const elapsed = performance.now() - start;

        assert.ok(elapsed < 100, `Query "${q.slice(0, 20)}" took ${elapsed}ms (potential ReDoS)`);
        assert.ok(typeof res.totalOffers === 'number');
      }
    });

    it('5.5 should handle empty, null, undefined, or whitespace-only queries by returning all offers', async () => {
      const emptyQueries = ['', '   ', '\t\n', null, undefined];
      for (const q of emptyQueries) {
        const res = await ingestion.getOffers({ query: q });
        assert.equal(res.totalOffers, 49, `Empty query "${q}" should return all 49 offers`);
      }
    });

    it('5.6 should support Italian grocery category filtering with accents', async () => {
      // Category "Colazione e Dolci"
      const resColazione = await ingestion.getOffers({ category: 'Colazione e Dolci' });
      assert.ok(resColazione.totalOffers > 0);
      for (const o of resColazione.offers) {
        assert.equal(o.category, 'Colazione e Dolci');
      }

      // Case & accent insensitive category filter
      const resLower = await ingestion.getOffers({ category: 'colazione e dolci' });
      assert.equal(resLower.totalOffers, resColazione.totalOffers);

      // "Latticini e Formaggi"
      const resLatticini = await ingestion.getOffers({ category: 'latticini e formaggi' });
      assert.ok(resLatticini.totalOffers > 0);
      for (const o of resLatticini.offers) {
        assert.equal(o.category, 'Latticini e Formaggi');
      }
    });

    it('5.7 should verify discount percentage calculation accuracy across all seed offers', async () => {
      const res = await ingestion.getOffers({ limit: 100 });
      assert.equal(res.totalOffers, 49);

      for (const offer of res.offers) {
        const { originalPrice, promoPrice, discountPrice, discountPercentage, title } = offer;
        const actualPrice = discountPrice ?? promoPrice;
        const expectedDiscount = Math.round(((originalPrice - actualPrice) / originalPrice) * 100);

        assert.equal(
          discountPercentage,
          expectedDiscount,
          `Discount mismatch on "${title}": expected ${expectedDiscount}%, got ${discountPercentage}% (original: ${originalPrice}, promo: ${actualPrice})`
        );
      }
    });
  });
});
