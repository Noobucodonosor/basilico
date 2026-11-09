import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createIsolatedTempDir } from '../helpers/test_helper.js';

describe('Integration Tests: Local Persistent Cache & Atomic Persistence (F4)', () => {
  /**
   * Reference Atomic Cache Implementation (Oracle for F4 disk persistence)
   */
  class AtomicDiskCache {
    constructor(cacheDir) {
      this.cacheDir = cacheDir;
      this.ensureDirectory();
    }

    ensureDirectory() {
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
    }

    _sanitizeKey(key) {
      return String(key).replace(/[^a-zA-Z0-9_-]/g, '_');
    }

    _getFilePath(key) {
      return path.join(this.cacheDir, `${this._sanitizeKey(key)}.json`);
    }

    _getTempPath(key) {
      const cleanKey = this._sanitizeKey(key);
      const nonce = Math.random().toString(36).slice(2, 8);
      return path.join(this.cacheDir, `${cleanKey}.${Date.now()}.${process.pid}.${nonce}.tmp`);
    }

    setSync(key, envelope) {
      this.ensureDirectory();
      const targetPath = this._getFilePath(key);
      const tempPath = this._getTempPath(key);
      const serialized = JSON.stringify(envelope, null, 2);

      try {
        fs.writeFileSync(tempPath, serialized, 'utf8');
        fs.renameSync(tempPath, targetPath);
        return true;
      } catch (err) {
        try {
          if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
        } catch (_) {}
        throw err;
      }
    }

    getSync(key) {
      const filePath = this._getFilePath(key);
      if (!fs.existsSync(filePath)) return null;

      try {
        const raw = fs.readFileSync(filePath, 'utf8');
        if (!raw || !raw.trim()) {
          this._quarantine(filePath);
          return null;
        }
        return JSON.parse(raw);
      } catch (err) {
        this._quarantine(filePath);
        return null;
      }
    }

    deleteSync(key) {
      const filePath = this._getFilePath(key);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    }

    clearSync() {
      if (!fs.existsSync(this.cacheDir)) return;
      const files = fs.readdirSync(this.cacheDir);
      for (const f of files) {
        fs.unlinkSync(path.join(this.cacheDir, f));
      }
    }

    _quarantine(filePath) {
      try {
        const corruptedPath = `${filePath}.corrupted.${Date.now()}`;
        fs.renameSync(filePath, corruptedPath);
      } catch (_) {}
    }
  }

  describe('F4: Atomic File Persistence (Tier 1)', () => {
    it('4.1 should write and read cache entry to isolated disk directory', () => {
      const temp = createIsolatedTempDir('cache-t1-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        const payload = { stores: ['coop', 'basko'], updated: true };
        
        cache.setSync('stores_overview', payload);
        const retrieved = cache.getSync('stores_overview');

        assert.deepEqual(retrieved, payload);
        assert.ok(fs.existsSync(path.join(temp.path, 'stores_overview.json')));
      } finally {
        temp.cleanup();
      }
    });

    it('4.2 should verify atomic persistence creates no orphan .tmp files on success', () => {
      const temp = createIsolatedTempDir('cache-tmp-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        cache.setSync('item-key', { id: 1, title: 'Basko offerta' });

        const files = fs.readdirSync(temp.path);
        assert.equal(files.length, 1);
        assert.equal(files[0], 'item-key.json');
        assert.ok(!files.some((f) => f.endsWith('.tmp')));
      } finally {
        temp.cleanup();
      }
    });

    it('4.3 should return null for non-existent cache keys', () => {
      const temp = createIsolatedTempDir('cache-miss-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        const result = cache.getSync('non_existent_key');
        assert.equal(result, null);
      } finally {
        temp.cleanup();
      }
    });

    it('4.4 should delete specified cache key and remove file from disk', () => {
      const temp = createIsolatedTempDir('cache-del-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        cache.setSync('to_delete', { temp: true });
        assert.ok(fs.existsSync(path.join(temp.path, 'to_delete.json')));

        const deleted = cache.deleteSync('to_delete');
        assert.equal(deleted, true);
        assert.ok(!fs.existsSync(path.join(temp.path, 'to_delete.json')));
      } finally {
        temp.cleanup();
      }
    });

    it('4.5 should clear entire cache directory while preserving folder existence', () => {
      const temp = createIsolatedTempDir('cache-clear-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        cache.setSync('key1', { a: 1 });
        cache.setSync('key2', { b: 2 });
        cache.setSync('key3', { c: 3 });

        assert.equal(fs.readdirSync(temp.path).length, 3);
        cache.clearSync();
        assert.equal(fs.readdirSync(temp.path).length, 0);
        assert.ok(fs.existsSync(temp.path), 'Cache directory must still exist after clear');
      } finally {
        temp.cleanup();
      }
    });
  });

  describe('F4: Cache Persistence Boundary & Corner Cases (Tier 2)', () => {
    it('4.6 should safely quarantine and recover from corrupted 0-byte cache file', () => {
      const temp = createIsolatedTempDir('cache-corrupt-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        const filePath = path.join(temp.path, 'corrupted_file.json');
        fs.writeFileSync(filePath, '', 'utf8'); // 0 bytes

        const result = cache.getSync('corrupted_file');
        assert.equal(result, null, 'Should return null instead of throwing');
        // Original corrupted file is quarantined
        assert.ok(!fs.existsSync(filePath));
        const files = fs.readdirSync(temp.path);
        assert.ok(files.some((f) => f.includes('.corrupted.')));
      } finally {
        temp.cleanup();
      }
    });

    it('4.7 should safely quarantine invalid malformed JSON file', () => {
      const temp = createIsolatedTempDir('cache-badjson-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        const filePath = path.join(temp.path, 'bad_json.json');
        fs.writeFileSync(filePath, '{"unterminated: string', 'utf8');

        const result = cache.getSync('bad_json');
        assert.equal(result, null);
        assert.ok(!fs.existsSync(filePath));
      } finally {
        temp.cleanup();
      }
    });

    it('4.8 should sanitize special characters in cache key to safe filename', () => {
      const temp = createIsolatedTempDir('cache-sanitize-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        cache.setSync('store/rapallo:basko*offer?id=1', { data: 123 });

        const files = fs.readdirSync(temp.path);
        assert.equal(files.length, 1);
        assert.ok(!files[0].includes('/'));
        assert.ok(!files[0].includes(':'));
        assert.ok(!files[0].includes('*'));
        assert.ok(!files[0].includes('?'));
        assert.equal(files[0], 'store_rapallo_basko_offer_id_1.json');

        const retrieved = cache.getSync('store/rapallo:basko*offer?id=1');
        assert.deepEqual(retrieved, { data: 123 });
      } finally {
        temp.cleanup();
      }
    });

    it('4.9 should execute rapid consecutive writes without file collision or lockup', () => {
      const temp = createIsolatedTempDir('cache-rapid-');
      try {
        const cache = new AtomicDiskCache(temp.path);
        for (let i = 0; i < 50; i++) {
          cache.setSync('consecutive_key', { iteration: i });
        }
        const finalVal = cache.getSync('consecutive_key');
        assert.equal(finalVal.iteration, 49);
      } finally {
        temp.cleanup();
      }
    });

    it('4.10 should auto-create nested cache directories on demand', () => {
      const temp = createIsolatedTempDir('cache-nested-');
      const deepPath = path.join(temp.path, 'nested', 'level2', 'cache');
      try {
        assert.ok(!fs.existsSync(deepPath));
        const cache = new AtomicDiskCache(deepPath);
        cache.setSync('deep_key', { deep: true });

        assert.ok(fs.existsSync(deepPath));
        assert.equal(cache.getSync('deep_key').deep, true);
      } finally {
        temp.cleanup();
      }
    });
  });
});
