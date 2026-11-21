/**
 * Comprehensive Unit Test Suite for CacheManager
 * Location: tests/unit/cache-manager.test.js
 */

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { CacheManager, JsonDiskStore, SqliteCacheStore } from '../../server/services/cacheManager.js';

describe('CacheManager Unit & Integration Test Suite', () => {
  let tempDir;
  let cache;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-cache-test-'));
    cache = new CacheManager({
      cacheDir: tempDir,
      defaultTtlSeconds: 3600, // 1 hour
      defaultStaleGraceSeconds: 86400, // 1 day
      backend: 'json'
    });
  });

  afterEach(() => {
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ==========================================
  // Test Category 1: Roundtrip Serialization
  // ==========================================
  describe('Roundtrip Serialization & Integrity', () => {
    test('serializes and deserializes complex supermarket dataset faithfully', async () => {
      const storesData = [
        {
          id: 'coop-rapallo',
          name: 'Coop Liguria',
          brand: 'Coop',
          address: 'Via Amatore Sciesa, 15',
          city: 'Rapallo',
          postalCode: '16035',
          coordinates: { latitude: 44.3541, longitude: 9.2274 },
          activeOffers: 24,
          specialFeatures: ['parcheggio', 'banco gastronomia', 'bio/vegan']
        },
        {
          id: 'carrefour-rapallo',
          name: 'Carrefour Market',
          brand: 'Carrefour',
          address: 'Corso Giuseppe Assereto, 37/51',
          city: 'Rapallo',
          postalCode: '16035',
          coordinates: { latitude: 44.3512, longitude: 9.2315 },
          activeOffers: 18,
          specialFeatures: ['aperto domenica', 'h24']
        }
      ];

      await cache.set('stores', storesData, { dataSource: 'live' });

      // Verify physical disk file exists
      const targetFile = path.join(tempDir, 'stores.json');
      assert.ok(fs.existsSync(targetFile), 'stores.json should exist on disk');

      // Verify retrieved data
      const retrieved = await cache.get('stores');
      assert.deepStrictEqual(retrieved, storesData);

      // Verify envelope metadata
      const envelope = await cache.getEnvelope('stores');
      assert.strictEqual(envelope.metadata.key, 'stores');
      assert.strictEqual(envelope.metadata.dataSource, 'live');
      assert.strictEqual(envelope.metadata.ttlSeconds, 3600);
      assert.strictEqual(envelope.metadata.staleGraceSeconds, 86400);
      assert.ok(envelope.metadata.cachedAt);
      assert.ok(envelope.metadata.expiresAt);
    });

    test('preserves floating point precision, unicode accents and special chars', async () => {
      const offersData = [
        {
          id: 'offer-1',
          title: 'Caffè Qualità Oro Lavazza 2x250g',
          originalPrice: 7.99,
          discountPrice: 4.49,
          discountPercentage: 44,
          unitPrice: '8.98 €/kg',
          isBio: false,
          notes: 'Offerta speciale sottocosto!'
        }
      ];

      await cache.set('offers', offersData);
      const retrieved = await cache.get('offers');

      assert.strictEqual(retrieved[0].title, 'Caffè Qualità Oro Lavazza 2x250g');
      assert.strictEqual(retrieved[0].originalPrice, 7.99);
      assert.strictEqual(retrieved[0].discountPrice, 4.49);
      assert.strictEqual(retrieved[0].discountPercentage, 44);
      assert.strictEqual(retrieved[0].unitPrice, '8.98 €/kg');
    });

    test('sanitizes unsafe keys with directory traversal patterns', async () => {
      await cache.set('../../../etc/passwd', { test: true });
      // Key should be sanitized into cacheDir, not written to /etc
      const files = fs.readdirSync(tempDir);
      assert.ok(files.some(f => f.includes('passwd')), 'Sanitized file created in cacheDir');
      const retrieved = await cache.get('../../../etc/passwd');
      assert.deepStrictEqual(retrieved, { test: true });
    });
  });

  // ==========================================
  // Test Category 2: TTL & Stale Grace Handling
  // ==========================================
  describe('TTL & Stale Grace Handling', () => {
    test('fresh cache returns data and false for isStale and isExpired', async () => {
      await cache.set('fresh_key', { status: 'ok' }, { ttlSeconds: 10 });

      assert.strictEqual(await cache.isStale('fresh_key'), false);
      assert.strictEqual(await cache.isExpired('fresh_key'), false);
      assert.deepStrictEqual(await cache.get('fresh_key'), { status: 'ok' });
    });

    test('stale cache (within grace period) serves data by default but flags isStale=true', async () => {
      // Create an envelope manually simulating past TTL but within grace
      const pastTime = new Date(Date.now() - 5000); // 5s ago
      const expiredTime = new Date(Date.now() - 1000); // 1s ago (past TTL)
      const envelope = {
        metadata: {
          key: 'stale_key',
          cachedAt: pastTime.toISOString(),
          expiresAt: expiredTime.toISOString(),
          ttlSeconds: 4,
          staleGraceSeconds: 60, // 60s grace, so 59s remaining in grace
          dataSource: 'cache',
          version: '1.0.0'
        },
        data: { staleData: true }
      };

      cache.store.setSync('stale_key', envelope);

      // Verify stale / expired flags
      assert.strictEqual(await cache.isStale('stale_key'), true, 'Should be stale');
      assert.strictEqual(await cache.isExpired('stale_key'), false, 'Should not be fully expired (in grace)');

      // Default get() should return data during grace period
      assert.deepStrictEqual(await cache.get('stale_key'), { staleData: true });

      // get() with allowStale: false should return null
      assert.strictEqual(await cache.get('stale_key', { allowStale: false }), null);

      // get() with includeMeta should include isStale: true
      const resultWithMeta = await cache.get('stale_key', { includeMeta: true });
      assert.strictEqual(resultWithMeta.metadata.isStale, true);
      assert.strictEqual(resultWithMeta.metadata.isExpired, false);
      assert.deepStrictEqual(resultWithMeta.data, { staleData: true });
    });

    test('expired cache (beyond grace period) returns null and flags isExpired=true', async () => {
      // Past TTL and past staleGraceSeconds
      const pastCachedAt = new Date(Date.now() - 20000);
      const pastExpiresAt = new Date(Date.now() - 15000); // 15s ago
      const envelope = {
        metadata: {
          key: 'expired_key',
          cachedAt: pastCachedAt.toISOString(),
          expiresAt: pastExpiresAt.toISOString(),
          ttlSeconds: 5,
          staleGraceSeconds: 10, // grace expired 5s ago (15s ago + 10s = 5s ago)
          dataSource: 'cache',
          version: '1.0.0'
        },
        data: { oldData: true }
      };

      cache.store.setSync('expired_key', envelope);

      assert.strictEqual(await cache.isStale('expired_key'), true);
      assert.strictEqual(await cache.isExpired('expired_key'), true);
      assert.strictEqual(await cache.get('expired_key'), null, 'Should return null for hard-expired data');
    });

    test('getStatus returns structured health metadata', async () => {
      await cache.set('status_key', { val: 123 }, { ttlSeconds: 7200, dataSource: 'live' });
      const status = await cache.getStatus('status_key');

      assert.strictEqual(status.key, 'status_key');
      assert.strictEqual(status.exists, true);
      assert.strictEqual(status.isStale, false);
      assert.strictEqual(status.isExpired, false);
      assert.strictEqual(status.ttlSeconds, 7200);
      assert.strictEqual(status.dataSource, 'live');
      assert.strictEqual(typeof status.ageSeconds, 'number');
    });
  });

  // ==========================================
  // Test Category 3: Corrupted File Handling
  // ==========================================
  describe('Corrupted File Handling & Resilience', () => {
    test('handles empty file without crashing and returns null', async () => {
      const filePath = path.join(tempDir, 'empty_test.json');
      fs.writeFileSync(filePath, '', 'utf8');

      const result = await cache.get('empty_test');
      assert.strictEqual(result, null);
      // Verify corrupted file was quarantined
      const files = fs.readdirSync(tempDir);
      assert.ok(files.some(f => f.includes('empty_test.json.corrupt')), 'Empty file should be quarantined');
    });

    test('handles truncated JSON syntax error without crashing', async () => {
      const filePath = path.join(tempDir, 'truncated_test.json');
      fs.writeFileSync(filePath, '{"metadata": {"key": "truncated"', 'utf8');

      const result = await cache.get('truncated_test');
      assert.strictEqual(result, null);
    });

    test('handles random non-JSON binary garbage and recovers on next set', async () => {
      const filePath = path.join(tempDir, 'garbage_test.json');
      fs.writeFileSync(filePath, '\x00\xFF\xFE\xAA\xBB\xCC\xDD GARBAGE', 'utf8');

      // First read: should gracefully return null
      assert.strictEqual(await cache.get('garbage_test'), null);

      // Next set: should successfully write valid data over the key
      await cache.set('garbage_test', { recovered: true });
      const recovered = await cache.get('garbage_test');
      assert.deepStrictEqual(recovered, { recovered: true });
    });
  });

  // ==========================================
  // Test Category 4: Atomic Overwrite & Concurrency
  // ==========================================
  describe('Atomic Overwrite & Race-Condition Safety', () => {
    test('survives rapid concurrent writes to the same key without file corruption', async () => {
      const iterations = 30;
      const promises = [];

      for (let i = 0; i < iterations; i++) {
        promises.push(
          cache.set('concurrent_key', {
            iteration: i,
            payload: `Data payload index ${i}`.repeat(50)
          })
        );
      }

      // Execute all concurrent writes simultaneously
      await Promise.all(promises);

      // Target file must be completely valid JSON
      const targetFile = path.join(tempDir, 'concurrent_key.json');
      assert.ok(fs.existsSync(targetFile), 'Target file must exist');

      const raw = fs.readFileSync(targetFile, 'utf8');
      let parsed;
      assert.doesNotThrow(() => {
        parsed = JSON.parse(raw);
      }, 'Saved file must be 100% valid parseable JSON');

      assert.ok(parsed.data.iteration >= 0 && parsed.data.iteration < iterations);

      // Verify NO orphaned .tmp files remain in directory
      const remainingFiles = fs.readdirSync(tempDir);
      const tmpFiles = remainingFiles.filter(f => f.endsWith('.tmp'));
      assert.strictEqual(tmpFiles.length, 0, `No temporary files should be left behind, found: ${tmpFiles.join(', ')}`);
    });
  });

  // ==========================================
  // Test Category 5: Native SQLite Storage Parity
  // ==========================================
  describe('SqliteCacheStore Backing Store Parity', () => {
    let sqliteCache;
    let sqliteDbPath;

    beforeEach(() => {
      sqliteDbPath = path.join(tempDir, 'sqlite_cache.db');
      sqliteCache = new CacheManager({
        cacheDir: tempDir,
        backend: 'sqlite',
        sqlitePath: sqliteDbPath,
        defaultTtlSeconds: 1800
      });
    });

    afterEach(() => {
      if (sqliteCache && sqliteCache.store.close) {
        sqliteCache.store.close();
      }
    });

    test('performs roundtrip serialization via native node:sqlite', async () => {
      const data = { store: 'basko-rapallo', offers: [1, 2, 3] };
      await sqliteCache.set('basko', data, { dataSource: 'seed' });

      assert.ok(fs.existsSync(sqliteDbPath), 'SQLite database file should exist on disk');

      const retrieved = await sqliteCache.get('basko');
      assert.deepStrictEqual(retrieved, data);

      const status = await sqliteCache.getStatus('basko');
      assert.strictEqual(status.exists, true);
      assert.strictEqual(status.dataSource, 'seed');
    });

    test('supports delete, clear, and key enumeration in SQLite store', async () => {
      await sqliteCache.set('key1', { a: 1 });
      await sqliteCache.set('key2', { b: 2 });

      assert.strictEqual(await sqliteCache.has('key1'), true);
      assert.strictEqual(await sqliteCache.has('key2'), true);

      const keys = await sqliteCache.keys();
      assert.ok(keys.includes('key1'));
      assert.ok(keys.includes('key2'));

      await sqliteCache.delete('key1');
      assert.strictEqual(await sqliteCache.has('key1'), false);
      assert.strictEqual(await sqliteCache.get('key1'), null);

      await sqliteCache.clear();
      assert.strictEqual((await sqliteCache.keys()).length, 0);
    });
  });

  // ==========================================
  // Test Category 6: Management & Helper Methods
  // ==========================================
  describe('Management API (has, delete, clear, keys)', () => {
    test('has() accurately reports key presence', async () => {
      assert.strictEqual(await cache.has('non_existent'), false);
      await cache.set('exists_key', { hello: 'world' });
      assert.strictEqual(await cache.has('exists_key'), true);
    });

    test('delete() removes file and key', async () => {
      await cache.set('to_delete', { val: 1 });
      assert.strictEqual(await cache.has('to_delete'), true);
      assert.strictEqual(await cache.delete('to_delete'), true);
      assert.strictEqual(await cache.has('to_delete'), false);
      assert.strictEqual(await cache.get('to_delete'), null);
    });

    test('clear() purges all cache files in cache directory', async () => {
      await cache.set('k1', 1);
      await cache.set('k2', 2);
      await cache.set('k3', 3);

      assert.strictEqual((await cache.keys()).length, 3);
      await cache.clear();
      assert.strictEqual((await cache.keys()).length, 0);
    });
  });
});
