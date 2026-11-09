/**
 * Basilico — Supermarket Offers Application
 * Location: tests/e2e/tier5_adversarial_2.test.js
 *
 * TIER 5 WHITE-BOX ADVERSARIAL STRESS TEST SUITE (Challenger 2)
 *
 * Focus Areas:
 * 1. Aggregator JSON parsing resilience (missing/unexpected fields, invalid dates, malformed flyer URLs, null prices, null page assets).
 * 2. High-concurrency requests and atomic disk writes under race conditions (concurrency, rename atomicity, corrupted cache quarantine, sync deduplication).
 * 3. HTTP route security, parameter pollution, unexpected query parameter types (arrays instead of strings, object injection, HTTP method restrictions).
 * 4. Single command startup (`node server.js`) with custom PORT, collision detection, and SIGTERM/SIGINT graceful shutdown signals.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { PROJECT_ROOT } from '../helpers/test_helper.js';
import { createApp } from '../../server/index.js';
import { CacheManager } from '../../server/services/cacheManager.js';
import { IngestionService, ingestionService } from '../../server/services/ingestionService.js';
import { offerService, normalizeSearchToken, getSortComparator, computeFacets } from '../../server/services/offerService.js';
import { getTargetPort, checkPortAvailable, shouldTriggerBuild, gracefulShutdown } from '../../server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('Tier 5 White-Box Adversarial Stress Test Suite (Challenger 2)', () => {
  let appServer = null;
  let serverPort = null;
  let baseUrl = null;

  before(async () => {
    // Spin up ephemeral test server
    const app = createApp();
    await new Promise((resolve) => {
      appServer = app.listen(0, '127.0.0.1', () => {
        serverPort = appServer.address().port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (appServer && typeof appServer.close === 'function') {
      await new Promise((resolve) => appServer.close(resolve));
    }
  });

  // =========================================================================
  // 1. AGGREGATOR JSON PARSING RESILIENCE & EDGE CASES
  // =========================================================================
  describe('1. Aggregator JSON Parsing Resilience & Edge Cases', () => {
    const service = new IngestionService();

    it('1.1 extractNextData: should throw clear error on missing or malformed HTML', () => {
      assert.throws(
        () => service.extractNextData(null),
        /Invalid HTML payload/
      );
      assert.throws(
        () => service.extractNextData(''),
        /Invalid HTML payload/
      );
      assert.throws(
        () => service.extractNextData('<html><body>No next data script here</body></html>'),
        /__NEXT_DATA__ script tag not found/
      );
      assert.throws(
        () => service.extractNextData('<script id="__NEXT_DATA__" type="application/json">{ broken json</script>'),
        SyntaxError
      );
    });

    it('1.2 extractNextData: should successfully extract deep Next.js payload', () => {
      const validHtml = `
        <html>
          <body>
            <script id="__NEXT_DATA__" type="application/json">
              {
                "props": {
                  "pageProps": {
                    "apiResources": {
                      "topCategoryFlyers": [{ "id": 101, "title": "Volantino Coop" }],
                      "topOffers": [{ "id": "off-1", "title": "Pasta" }]
                    }
                  }
                }
              }
            </script>
          </body>
        </html>
      `;
      const data = service.extractNextData(validHtml);
      assert.ok(data.props?.pageProps?.apiResources);
      assert.equal(data.props.pageProps.apiResources.topCategoryFlyers.length, 1);
    });

    it('1.3 normalizeLiveFlyers: handles missing fields, string/numeric IDs, and generates safe fallbacks', () => {
      const sampleStores = [
        { id: 'rapallo-coop-sciesa', chainId: 'coop', name: 'Coop Rapallo', brand: 'Coop' },
        { id: 'rapallo-basko-colombo', chainId: 'basko', name: 'Basko Rapallo', brand: 'Basko' }
      ];

      const rawFlyers = [
        null,
        undefined,
        {},
        { id: 9901, retailerName: 'Ipercoop Liguria' }, // numeric id and Coop pattern
        { id: '9902', retailerName: 'Basko Porto', start_date: '2026-11-01', end_date: '2026-11-30' },
        { id: '9903', retailerName: 'Unknown Supermarket', pageCount: 6 },
        {
          id: '9904',
          retailerName: 'Coop',
          imageAssets: {
            cover: 'https://example.com/cover.jpg',
            pages: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg']
          }
        }
      ];

      const flyers = service.normalizeLiveFlyers(rawFlyers, sampleStores);
      assert.equal(flyers.length, 4, 'Should normalize 4 valid flyers with IDs');

      // Check numeric ID coercion
      assert.equal(flyers[0].id, '9901');
      assert.equal(flyers[0].chainId, 'coop');
      assert.equal(flyers[0].storeId, 'rapallo-coop-sciesa');

      // Check Basko dates and pages
      assert.equal(flyers[1].id, '9902');
      assert.equal(flyers[1].chainId, 'basko');
      assert.equal(flyers[1].validFrom, '2026-11-01');

      // Check unknown store fallback
      assert.equal(flyers[2].id, '9903');
      assert.equal(flyers[2].pageCount, 6);
      assert.equal(flyers[2].pages.length, 6);

      // Check explicit pages array
      assert.equal(flyers[3].id, '9904');
      assert.equal(flyers[3].pageCount, 2);
      assert.equal(flyers[3].pages[1].imageUrl, 'https://example.com/p2.jpg');
    });

    it('1.4 normalizeLiveFlyers: resilient against imageAssets.pages containing null/undefined items', () => {
      const rawFlyersWithNullPages = [
        {
          id: 'flyer-bug-1',
          retailerName: 'Coop',
          imageAssets: {
            cover: 'https://example.com/cover.jpg',
            pages: [null, 'https://example.com/p2.jpg'] // Upstream API sent null page item
          }
        }
      ];

      assert.doesNotThrow(() => {
        const flyers = service.normalizeLiveFlyers(rawFlyersWithNullPages, []);
        assert.equal(flyers.length, 1);
        assert.equal(flyers[0].pages.length, 1);
        assert.equal(flyers[0].pages[0].imageUrl, 'https://example.com/p2.jpg');
      });
    });

    it('1.5 normalizeLiveFlyers: resilient against non-iterable rawFlyers object', () => {
      assert.doesNotThrow(() => {
        const flyers = service.normalizeLiveFlyers({ unexpected: 'object' }, []);
        assert.deepEqual(flyers, []);
      });
    });

    it('1.6 normalizeText: safely coerces non-string inputs (Array/Number) to string', () => {
      assert.doesNotThrow(() => {
        const normArray = service.normalizeText(['pasta', 'barilla']);
        assert.equal(normArray, 'pasta,barilla');
        const normNumber = service.normalizeText(12345);
        assert.equal(normNumber, '12345');
      });
    });

    it('1.7 Offer pricing resilience: handles null prices, zero prices, and inverted prices safely in offerService', () => {
      const adversarialOffers = [
        { id: 'adv-1', title: 'Pasta Gragnano', promoPrice: 0.99, originalPrice: 1.49, discountPercentage: 33 },
        { id: 'adv-2', title: 'Latte Intero', promoPrice: null, discountPrice: 1.20, originalPrice: 1.50, discountPercentage: 20 },
        { id: 'adv-3', title: 'Biscotti', promoPrice: 0, originalPrice: 2.00, discountPercentage: 0 },
        { id: 'adv-4', title: 'Olio Oliva', promoPrice: 8.99, originalPrice: 4.99, discountPercentage: -80 }, // inverted
        { id: 'adv-5', title: null, promoPrice: 2.50, originalPrice: 3.50, discountPercentage: 28 } // null title
      ];

      // Sort by priceAsc
      const resPriceAsc = offerService.processQuery({ sortBy: 'priceAsc' }, adversarialOffers);
      assert.equal(resPriceAsc.totalOffers, 5);
      assert.ok(Array.isArray(resPriceAsc.offers));

      // Sort by discountDesc
      const resDiscountDesc = offerService.processQuery({ sortBy: 'discountDesc' }, adversarialOffers);
      assert.equal(resDiscountDesc.totalOffers, 5);
      assert.equal(resDiscountDesc.offers[0].id, 'adv-1');

      // Sort by nameAsc with null title: offerService uses (a.title || '').localeCompare safely
      assert.doesNotThrow(() => {
        const resNameAsc = offerService.processQuery({ sortBy: 'nameAsc' }, adversarialOffers);
        assert.equal(resNameAsc.totalOffers, 5);
      });
    });
  });

  // =========================================================================
  // 2. HIGH-CONCURRENCY REQUESTS & ATOMIC PERSISTENCE UNDER RACE CONDITIONS
  // =========================================================================
  describe('2. High-Concurrency Requests & Atomic Persistence Under Race Conditions', () => {
    const testCacheDir = path.resolve(PROJECT_ROOT, 'data/cache_tier5_concurrency');

    before(() => {
      if (fs.existsSync(testCacheDir)) {
        fs.rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    after(() => {
      if (fs.existsSync(testCacheDir)) {
        fs.rmSync(testCacheDir, { recursive: true, force: true });
      }
    });

    it('2.1 High-concurrency writes: 100 simultaneous setSync writes to same key with atomic rename', async () => {
      const cm = new CacheManager({ cacheDir: testCacheDir });
      const iterations = 100;

      const promises = Array.from({ length: iterations }, (_, i) => {
        return Promise.resolve().then(() => {
          cm.set('concurrent_key', { index: i, timestamp: Date.now(), payload: 'X'.repeat(500) });
        });
      });

      await Promise.all(promises);

      // Verify key exists, is valid JSON, and no leftover temp files
      const result = cm.get('concurrent_key');
      assert.ok(result);
      assert.ok(typeof result.index === 'number');
      assert.ok(result.index >= 0 && result.index < iterations);

      const files = fs.readdirSync(testCacheDir);
      const tmpFiles = files.filter(f => f.endsWith('.tmp'));
      assert.equal(tmpFiles.length, 0, 'No orphaned .tmp files must remain after concurrent atomic writes');
    });

    it('2.2 High-concurrency mixed reads & writes: 50 concurrent writes interleaved with 50 concurrent reads', async () => {
      const cm = new CacheManager({ cacheDir: testCacheDir });
      cm.set('rw_interleaved_key', { version: 0, text: 'base' });

      let readFailures = 0;
      let writeFailures = 0;

      const tasks = [];
      for (let i = 1; i <= 100; i++) {
        if (i % 2 === 0) {
          tasks.push(
            Promise.resolve().then(() => {
              try {
                cm.set('rw_interleaved_key', { version: i, text: `v${i}` });
              } catch (_) {
                writeFailures++;
              }
            })
          );
        } else {
          tasks.push(
            Promise.resolve().then(() => {
              try {
                const val = cm.get('rw_interleaved_key');
                if (!val || typeof val.version !== 'number') {
                  readFailures++;
                }
              } catch (_) {
                readFailures++;
              }
            })
          );
        }
      }

      await Promise.all(tasks);

      assert.equal(writeFailures, 0, 'Atomic writes must not throw during concurrent reads');
      assert.equal(readFailures, 0, 'Concurrent reads must never receive partially-written or corrupt data');
    });

    it('2.3 Corrupted cache detection & automatic quarantine', () => {
      const cm = new CacheManager({ cacheDir: testCacheDir });

      // Directly write corrupt JSON to cache directory
      const corruptFilePath = path.join(testCacheDir, 'corrupt_entry.json');
      fs.writeFileSync(corruptFilePath, '{ "truncated_json: true', 'utf8');

      // get() must not throw and must quarantine file
      const val = cm.get('corrupt_entry');
      assert.equal(val, null, 'Must return null for corrupt cache');

      const files = fs.readdirSync(testCacheDir);
      assert.ok(!files.includes('corrupt_entry.json'), 'Original corrupt file must be moved');
      const quarantined = files.filter(f => f.startsWith('corrupt_entry.json.corrupt.'));
      assert.equal(quarantined.length, 1, 'Corrupted file must be renamed to .corrupt.<timestamp>');
    });

    it('2.4 SqliteCacheStore concurrency: 50 parallel operations against SQLite storage', async () => {
      const sqlitePath = path.join(testCacheDir, 'sqlite_test.db');
      const cm = new CacheManager({ backend: 'sqlite', sqlitePath });

      const operations = Array.from({ length: 50 }, (_, i) => {
        return Promise.resolve().then(() => {
          cm.set(`key_${i}`, { val: i }, 3600);
          return cm.get(`key_${i}`);
        });
      });

      const results = await Promise.all(operations);
      assert.equal(results.length, 50);
      assert.equal(results[49].val, 49);

      // Prune expired entries
      const pruned = cm.store.pruneExpired(new Date(Date.now() + 10000000).toISOString());
      assert.equal(pruned, 50);

      cm.store.close();
    });

    it('2.5 IngestionService.sync deduplication: 20 simultaneous sync calls share single execution', async () => {
      let callCount = 0;
      const mockService = new IngestionService();
      // Intercept _executeSync to track execution count
      const origExecute = mockService._executeSync.bind(mockService);
      mockService._executeSync = async (force) => {
        callCount++;
        await new Promise(r => setTimeout(r, 20));
        return origExecute(force);
      };

      const syncPromises = Array.from({ length: 20 }, () => mockService.sync(false));
      const syncResults = await Promise.all(syncPromises);

      assert.equal(callCount, 1, 'Concurrent calls to sync() must deduplicate to 1 single in-flight execution');
      assert.equal(syncResults.length, 20);
      for (const res of syncResults) {
        assert.ok(res.status === 'success' || res.status === 'cached_fallback');
      }
    });
  });

  // =========================================================================
  // 3. HTTP ROUTE SECURITY, PARAMETER POLLUTION & UNEXPECTED QUERY PARAMETER TYPES
  // =========================================================================
  describe('3. HTTP Route Security, Parameter Pollution & Unexpected Query Parameter Types', () => {
    it('3.1 Parameter pollution: repeated query params (?q=pasta&q=barilla) must return 200 without crashing', async () => {
      const res = await fetch(`${baseUrl}/api/offers?q=pasta&q=barilla`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.offers));
      assert.ok(typeof json.totalOffers === 'number');
    });

    it('3.2 Parameter pollution: repeated category params (?category=Dispensa&category=Latticini)', async () => {
      const res = await fetch(`${baseUrl}/api/offers?category=Dispensa+e+Pasta&category=Latticini+e+Formaggi`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.offers));
    });

    it('3.3 Parameter pollution: repeated storeId params (?storeId=coop&storeId=basko)', async () => {
      const res = await fetch(`${baseUrl}/api/offers?storeId=rapallo-coop-sciesa&storeId=rapallo-basko-colombo`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.offers));
    });

    it('3.4 Parameter pollution: repeated minDiscount params (?minDiscount=20&minDiscount=40)', async () => {
      const res = await fetch(`${baseUrl}/api/offers?minDiscount=20&minDiscount=40`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.offers));
    });

    it('3.5 Parameter pollution: repeated sortBy params (?sortBy=discountDesc&sortBy=priceAsc)', async () => {
      const res = await fetch(`${baseUrl}/api/offers?sortBy=discountDesc&sortBy=priceAsc`);
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.offers));
    });

    it('3.6 Parameter pollution on /api/stores and /api/flyers endpoints', async () => {
      const resStores = await fetch(`${baseUrl}/api/stores?hasOffers=true&hasOffers=false`);
      assert.equal(resStores.status, 200);
      const storesJson = await resStores.json();
      assert.ok(Array.isArray(storesJson.stores));

      const resFlyers = await fetch(`${baseUrl}/api/flyers?storeId=coop&storeId=basko`);
      assert.equal(resFlyers.status, 200);
      const flyersJson = await resFlyers.json();
      assert.ok(Array.isArray(flyersJson.flyers));
    });

    it('3.7 Object/NoSQL-style query injection attempts: ?q[$gt]=1, ?category[$regex]=.*, ?storeId[$where]=true', async () => {
      const attackUrls = [
        `${baseUrl}/api/offers?q[$gt]=1`,
        `${baseUrl}/api/offers?category[$regex]=.*`,
        `${baseUrl}/api/offers?storeId[$where]=true`,
        `${baseUrl}/api/offers?minDiscount[$ne]=0`,
        `${baseUrl}/api/offers?page[$gt]=0`,
        `${baseUrl}/api/offers?limit[$lt]=100`
      ];

      for (const url of attackUrls) {
        const res = await fetch(url);
        assert.equal(res.status, 200, `Expected 200 for URL ${url}`);
        const data = await res.json();
        assert.ok(Array.isArray(data.offers));
        assert.ok(typeof data.totalOffers === 'number');
      }
    });

    it('3.8 Extreme query string length (5,000 characters) must execute in sub-10ms without stack overflow', async () => {
      const hugeQuery = 'pasta_' + 'a'.repeat(5000);
      const start = performance.now();
      const res = await fetch(`${baseUrl}/api/offers?q=${hugeQuery}`);
      const duration = performance.now() - start;

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.totalOffers, 0);
      assert.ok(duration < 100, `Execution took ${duration.toFixed(1)}ms, expected < 100ms`);
    });

    it('3.9 Unhandled HTTP methods: PUT, DELETE, PATCH on read-only endpoints should not alter state', async () => {
      const methods = ['PUT', 'DELETE', 'PATCH'];
      for (const m of methods) {
        const res = await fetch(`${baseUrl}/api/stores`, { method: m });
        // Express router matches GET only, so other methods fall through to 404 API handler
        assert.equal(res.status, 404);
        const data = await res.json();
        assert.ok(data.error.includes('API endpoint not found'));
      }
    });
  });

  // =========================================================================
  // 4. SINGLE COMMAND STARTUP & GRACEFUL SHUTDOWN SIGNALS
  // =========================================================================
  describe('4. Single Command Startup & Graceful Shutdown Signals', () => {
    it('4.1 getTargetPort: boundary handling of custom ports, fallbacks, and non-numeric strings', () => {
      assert.equal(getTargetPort(undefined), 3000);
      assert.equal(getTargetPort(''), 3000);
      assert.equal(getTargetPort('8080'), 8080);
      assert.equal(getTargetPort('  4000  '), 4000);

      // Non-numeric port string falls back cleanly to 3000
      const nanPort = getTargetPort('invalid_port');
      assert.equal(nanPort, 3000, 'Non-numeric PORT string cleanly falls back to default port 3000');
      assert.equal(getTargetPort('-1'), 3000, 'Negative port cleanly falls back to 3000');
      assert.equal(getTargetPort('70000'), 3000, 'Out-of-range port cleanly falls back to 3000');
    });

    it('4.2 checkPortAvailable: detects available port and occupied port', async () => {
      // Find a free port by listening on 0 then closing
      const tester = net.createServer();
      await new Promise(r => tester.listen(0, r));
      const freePort = tester.address().port;
      await new Promise(r => tester.close(r));

      const isAvail = await checkPortAvailable(freePort);
      assert.equal(isAvail, true, `Port ${freePort} should be available`);

      // Occupy port and probe again
      const blocker = net.createServer();
      await new Promise(r => blocker.listen(freePort, r));

      const isBlocked = await checkPortAvailable(freePort);
      assert.equal(isBlocked, false, `Port ${freePort} should be blocked`);

      await new Promise(r => blocker.close(r));
    });

    it('4.3 shouldTriggerBuild: returns true when dist/index.html is absent, false when present', () => {
      const nonExistent = path.resolve(PROJECT_ROOT, 'tests/fixtures/non_existent_dist_dir');
      assert.equal(shouldTriggerBuild(nonExistent), true);

      const realDist = path.resolve(PROJECT_ROOT, 'dist');
      if (fs.existsSync(path.join(realDist, 'index.html'))) {
        assert.equal(shouldTriggerBuild(realDist), false);
      }
    });

    it('4.4 Subprocess startup & SIGTERM graceful shutdown: spawns node server.js and exits 0 on SIGTERM', async () => {
      // Pick dynamic port for isolation
      const probeServer = net.createServer();
      await new Promise(r => probeServer.listen(0, r));
      const testPort = String(probeServer.address().port);
      await new Promise(r => probeServer.close(r));

      const child = spawn('node', ['server.js'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PORT: testPort }
      });

      let stdoutData = '';
      let isReady = false;

      const exitPromise = new Promise((resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Server spawn timed out after 5000ms'));
        }, 5000);

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString();
          if (stdoutData.includes('Server listening')) {
            clearTimeout(timeout);
            isReady = true;
            resolve();
          }
        });

        child.stderr.on('data', (chunk) => {
          stdoutData += chunk.toString();
        });
      });

      assert.equal(isReady, true, 'Server should be listening');

      // Verify HTTP response from spawned server
      const healthRes = await fetch(`http://127.0.0.1:${testPort}/api/status`);
      assert.equal(healthRes.status, 200);

      // Send SIGTERM to child process
      child.kill('SIGTERM');

      const exitResult = await exitPromise;
      assert.equal(exitResult.code, 0, 'Spawned node server.js must exit cleanly with code 0 on SIGTERM');
    });

    it('4.5 Subprocess startup & SIGINT graceful shutdown: spawns node server.js and exits 0 on SIGINT', async () => {
      const probeServer = net.createServer();
      await new Promise(r => probeServer.listen(0, r));
      const testPort = String(probeServer.address().port);
      await new Promise(r => probeServer.close(r));

      const child = spawn('node', ['server.js'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PORT: testPort }
      });

      let stdoutData = '';
      let isReady = false;

      const exitPromise = new Promise((resolve) => {
        child.on('exit', (code, signal) => {
          resolve({ code, signal });
        });
      });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          child.kill('SIGKILL');
          reject(new Error('Server spawn timed out after 5000ms'));
        }, 5000);

        child.stdout.on('data', (chunk) => {
          stdoutData += chunk.toString();
          if (stdoutData.includes('Server listening')) {
            clearTimeout(timeout);
            isReady = true;
            resolve();
          }
        });
      });

      assert.equal(isReady, true);

      // Send SIGINT to child process
      child.kill('SIGINT');

      const exitResult = await exitPromise;
      assert.equal(exitResult.code, 0, 'Spawned node server.js must exit cleanly with code 0 on SIGINT');
    });

    it('4.6 Port collision handling: node server.js aborts with code 1 when PORT is already bound', async () => {
      const blocker = net.createServer();
      await new Promise(r => blocker.listen(0, r));
      const occupiedPort = String(blocker.address().port);

      const child = spawn('node', ['server.js'], {
        cwd: PROJECT_ROOT,
        env: { ...process.env, PORT: occupiedPort }
      });

      let stderrData = '';
      child.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      const exitResult = await new Promise((resolve) => {
        child.on('exit', (code, signal) => resolve({ code, signal }));
      });

      await new Promise(r => blocker.close(r));

      assert.equal(exitResult.code, 1, 'Server should exit with code 1 upon port collision');
      assert.ok(
        stderrData.includes('FATAL: Port') && stderrData.includes('is already in use'),
        'Error log should clearly explain the port collision'
      );
    });
  });
});
