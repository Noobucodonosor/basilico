/**
 * Basilico — Supermarket Offers Application
 * Location: server/services/cacheManager.js
 *
 * Resilient, atomic local persistence manager with TTL and Stale Grace Period handling.
 * Dual-backend support:
 * - JsonDiskStore: High-performance atomic JSON file store under data/cache/*.json
 * - SqliteCacheStore: Native Node.js node:sqlite database backing store
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

/**
 * Storage Adapter 1: Atomic JSON File Store
 */
export class JsonDiskStore {
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

  get(key) {
    return this.getSync(key);
  }

  getSync(key) {
    const filePath = this._getFilePath(key);
    if (!fs.existsSync(filePath)) {
      return null;
    }

    try {
      const raw = fs.readFileSync(filePath, 'utf8');
      if (!raw || !raw.trim()) {
        this._quarantineCorrupted(filePath, 'Empty file content');
        return null;
      }
      return JSON.parse(raw);
    } catch (err) {
      this._quarantineCorrupted(filePath, err.message);
      return null;
    }
  }

  set(key, envelope) {
    return this.setSync(key, envelope);
  }

  setSync(key, envelope) {
    this.ensureDirectory();
    const filePath = this._getFilePath(key);
    const tempPath = this._getTempPath(key);
    const serialized = JSON.stringify(envelope, null, 2);

    try {
      // Step 1: Write to unique temp file
      fs.writeFileSync(tempPath, serialized, 'utf8');
      // Step 2: Atomic rename (replaces target atomically on POSIX)
      fs.renameSync(tempPath, filePath);
      return true;
    } catch (err) {
      // Step 3: Cleanup orphan temp file on failure
      try {
        if (fs.existsSync(tempPath)) {
          fs.unlinkSync(tempPath);
        }
      } catch (_) {}
      throw new Error(`Failed to write cache for key "${key}": ${err.message}`);
    }
  }

  delete(key) {
    return this.deleteSync(key);
  }

  deleteSync(key) {
    const filePath = this._getFilePath(key);
    if (fs.existsSync(filePath)) {
      try {
        fs.unlinkSync(filePath);
        return true;
      } catch (_) {
        return false;
      }
    }
    return false;
  }

  has(key) {
    return this.hasSync(key);
  }

  hasSync(key) {
    return fs.existsSync(this._getFilePath(key));
  }

  clear() {
    return this.clearSync();
  }

  clearSync() {
    if (!fs.existsSync(this.cacheDir)) return;
    const files = fs.readdirSync(this.cacheDir);
    for (const file of files) {
      if (file.endsWith('.json') || file.endsWith('.tmp')) {
        try {
          fs.unlinkSync(path.join(this.cacheDir, file));
        } catch (_) {}
      }
    }
  }

  keys() {
    return this.keysSync();
  }

  keysSync() {
    if (!fs.existsSync(this.cacheDir)) return [];
    return fs.readdirSync(this.cacheDir)
      .filter(f => f.endsWith('.json'))
      .map(f => f.slice(0, -5));
  }

  _quarantineCorrupted(filePath, reason) {
    const timestamp = Date.now();
    const corruptPath = `${filePath}.corrupt.${timestamp}`;
    console.warn(`[CacheManager:JsonDiskStore] Corrupted cache detected at ${filePath} (${reason}). Quarantining to ${corruptPath}`);
    try {
      fs.renameSync(filePath, corruptPath);
    } catch (_) {
      try {
        fs.unlinkSync(filePath);
      } catch (__) {}
    }
  }
}

/**
 * Storage Adapter 2: Native node:sqlite Store
 */
export class SqliteCacheStore {
  constructor(dbPath = ':memory:') {
    this.dbPath = dbPath;
    this.db = null;
    this._init();
  }

  _init() {
    if (this.dbPath !== ':memory:') {
      const parentDir = path.dirname(this.dbPath);
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(this.dbPath);
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cache_entries (
        key TEXT PRIMARY KEY,
        envelope_json TEXT NOT NULL,
        cached_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        stale_grace_seconds INTEGER NOT NULL,
        data_source TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache_entries(expires_at);
    `);

    this._stmtGet = this.db.prepare('SELECT envelope_json FROM cache_entries WHERE key = ?');
    this._stmtSet = this.db.prepare(`
      INSERT INTO cache_entries (key, envelope_json, cached_at, expires_at, stale_grace_seconds, data_source, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET
        envelope_json = excluded.envelope_json,
        cached_at = excluded.cached_at,
        expires_at = excluded.expires_at,
        stale_grace_seconds = excluded.stale_grace_seconds,
        data_source = excluded.data_source,
        updated_at = excluded.updated_at
    `);
    this._stmtDelete = this.db.prepare('DELETE FROM cache_entries WHERE key = ?');
    this._stmtHas = this.db.prepare('SELECT 1 FROM cache_entries WHERE key = ?');
    this._stmtClear = this.db.prepare('DELETE FROM cache_entries');
    this._stmtKeys = this.db.prepare('SELECT key FROM cache_entries');
    this._stmtListExpiry = this.db.prepare('SELECT key, expires_at, stale_grace_seconds FROM cache_entries');
    this._stmtPrune = this.db.prepare(`
      DELETE FROM cache_entries
      WHERE unixepoch(expires_at) IS NULL
         OR (unixepoch(expires_at) + COALESCE(stale_grace_seconds, 0)) < unixepoch(?)
    `);
  }

  get(key) {
    return this.getSync(key);
  }

  getSync(key) {
    try {
      const row = this._stmtGet.get(key);
      if (!row || !row.envelope_json) return null;
      return JSON.parse(row.envelope_json);
    } catch (err) {
      console.warn(`[CacheManager:SqliteCacheStore] Error reading key "${key}": ${err.message}`);
      return null;
    }
  }

  set(key, envelope) {
    return this.setSync(key, envelope);
  }

  setSync(key, envelope) {
    const serialized = JSON.stringify(envelope);
    const meta = envelope.metadata || {};
    this._stmtSet.run(
      key,
      serialized,
      meta.cachedAt || new Date().toISOString(),
      meta.expiresAt || new Date().toISOString(),
      meta.staleGraceSeconds || 0,
      meta.dataSource || 'cache',
      Date.now()
    );
    return true;
  }

  delete(key) {
    return this.deleteSync(key);
  }

  deleteSync(key) {
    const result = this._stmtDelete.run(key);
    return result.changes > 0;
  }

  has(key) {
    return this.hasSync(key);
  }

  hasSync(key) {
    return !!this._stmtHas.get(key);
  }

  clear() {
    return this.clearSync();
  }

  clearSync() {
    this._stmtClear.run();
  }

  keys() {
    return this.keysSync();
  }

  keysSync() {
    return this._stmtKeys.all().map(r => r.key);
  }

  pruneExpired(cutoffIsoString = new Date().toISOString(), { honorGrace = false } = {}) {
    const cutoffMs = new Date(cutoffIsoString).getTime();
    if (Number.isNaN(cutoffMs)) return 0;
    const rows = this._stmtListExpiry.all();
    let deleted = 0;
    for (const row of rows) {
      const expiresAtMs = new Date(row.expires_at).getTime();
      const graceMs = honorGrace ? (Number(row.stale_grace_seconds) || 0) * 1000 : 0;
      if (Number.isNaN(expiresAtMs) || (expiresAtMs + graceMs) < cutoffMs) {
        deleted += this._stmtDelete.run(row.key).changes;
      }
    }
    return deleted;
  }

  cleanupExpired(cutoffIsoString = new Date().toISOString()) {
    return this.pruneExpired(cutoffIsoString, { honorGrace: true });
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

/**
 * Unified CacheManager
 */
export class CacheManager {
  /**
   * @param {Object} [options]
   * @param {string} [options.cacheDir] - Directory path for cache files (default: <cwd>/data/cache)
   * @param {number} [options.defaultTtlSeconds] - Default TTL in seconds (default: 21600s = 6h)
   * @param {number} [options.defaultStaleGraceSeconds] - Stale grace period in seconds (default: 604800s = 7d)
   * @param {'json'|'sqlite'} [options.backend] - Storage backend ('json' or 'sqlite')
   * @param {string} [options.sqlitePath] - Custom SQLite file path (default: <cacheDir>/cache.db)
   */
  constructor(options = {}) {
    const opts = typeof options === 'string' ? { cacheDir: options } : (options || {});
    this.cacheDir = opts.cacheDir || path.resolve(process.cwd(), 'data', 'cache');
    this.defaultTtlSeconds = opts.defaultTtlSeconds ?? 21600; // 6 hours
    this.defaultStaleGraceSeconds = opts.defaultStaleGraceSeconds ?? 604800; // 7 days
    this.backendType = opts.backend || 'json';

    if (this.backendType === 'sqlite') {
      const dbPath = opts.sqlitePath || path.join(this.cacheDir, 'cache.db');
      this.store = new SqliteCacheStore(dbPath);
    } else {
      this.store = new JsonDiskStore(this.cacheDir);
    }
  }

  _createEnvelope(key, data, options = {}, extraOptions = {}) {
    const now = new Date();
    let opts = {};
    if (typeof options === 'number') {
      opts = { ttlSeconds: options, ...extraOptions };
    } else if (typeof options === 'object' && options !== null) {
      opts = { ...options, ...extraOptions };
    }

    const ttlSeconds = opts.ttlSeconds ?? this.defaultTtlSeconds;
    const staleGraceSeconds = opts.staleGraceSeconds ?? this.defaultStaleGraceSeconds;
    const dataSource = opts.dataSource || 'live';
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

    return {
      metadata: {
        key,
        cachedAt: now.toISOString(),
        expiresAt,
        ttlSeconds,
        staleGraceSeconds,
        dataSource,
        version: '1.0.0',
        ...(opts.metadata || {})
      },
      data
    };
  }

  set(key, data, options = {}, extraOptions = {}) {
    const envelope = this._createEnvelope(key, data, options, extraOptions);
    this.store.set(key, envelope);
    return envelope;
  }

  setSync(key, data, options = {}, extraOptions = {}) {
    return this.set(key, data, options, extraOptions);
  }

  getEnvelope(key) {
    return this.store.get(key);
  }

  getEnvelopeSync(key) {
    return this.getEnvelope(key);
  }

  get(key, options = {}) {
    const envelope = this.getEnvelope(key);
    return this._evaluateEnvelope(envelope, options);
  }

  getSync(key, options = {}) {
    return this.get(key, options);
  }

  _evaluateEnvelope(envelope, options = {}) {
    if (!envelope || !envelope.metadata) {
      return null;
    }

    const allowStale = options.allowStale !== false; // default true
    const includeMeta = options.includeMeta === true;
    const now = Date.now();
    const expiresAt = new Date(envelope.metadata.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return null;
    }
    const staleGraceMs = (envelope.metadata.staleGraceSeconds ?? this.defaultStaleGraceSeconds) * 1000;
    const expiredCutoff = expiresAt + staleGraceMs;

    // Hard expired beyond stale grace
    if (now > expiredCutoff) {
      return null;
    }

    // Stale beyond TTL but within grace: served only if allowStale is true
    if (now > expiresAt && !allowStale) {
      return null;
    }

    if (includeMeta) {
      const cachedAtMs = new Date(envelope.metadata.cachedAt).getTime();
      return {
        data: envelope.data,
        metadata: {
          ...envelope.metadata,
          isStale: now > expiresAt,
          isExpired: now > expiredCutoff,
          ageSeconds: Number.isNaN(cachedAtMs) ? 0 : Math.floor((now - cachedAtMs) / 1000)
        }
      };
    }

    return envelope.data;
  }

  isStale(key) {
    const envelope = this.getEnvelope(key);
    return this._isEnvelopeStale(envelope);
  }

  isStaleSync(key) {
    return this.isStale(key);
  }

  _isEnvelopeStale(envelope) {
    if (!envelope || !envelope.metadata || !envelope.metadata.expiresAt) {
      return false;
    }
    const expiresAt = new Date(envelope.metadata.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return true;
    }
    return Date.now() >= expiresAt;
  }

  isExpired(key, allowGrace = true) {
    const envelope = this.getEnvelope(key);
    return this._isEnvelopeExpired(envelope, allowGrace);
  }

  isExpiredSync(key, allowGrace = true) {
    return this.isExpired(key, allowGrace);
  }

  _isEnvelopeExpired(envelope, allowGrace = true) {
    if (!envelope || !envelope.metadata || !envelope.metadata.expiresAt) {
      return true;
    }
    const expiresAt = new Date(envelope.metadata.expiresAt).getTime();
    if (Number.isNaN(expiresAt)) {
      return true;
    }
    const graceMs = allowGrace ? (envelope.metadata.staleGraceSeconds ?? this.defaultStaleGraceSeconds) * 1000 : 0;
    return Date.now() > (expiresAt + graceMs);
  }

  getStatus(key) {
    const envelope = this.getEnvelope(key);
    if (!envelope || !envelope.metadata) {
      return {
        key,
        exists: false,
        isStale: false,
        isExpired: true,
        cachedAt: null,
        expiresAt: null,
        ageSeconds: null,
        ttlSeconds: null,
        dataSource: null
      };
    }

    const now = Date.now();
    const cachedAtMs = new Date(envelope.metadata.cachedAt).getTime();
    const expiresAtMs = new Date(envelope.metadata.expiresAt).getTime();
    const graceMs = (envelope.metadata.staleGraceSeconds ?? this.defaultStaleGraceSeconds) * 1000;
    const invalidExpiry = Number.isNaN(expiresAtMs);

    return {
      key,
      exists: true,
      isStale: invalidExpiry ? true : now >= expiresAtMs,
      isExpired: invalidExpiry ? true : now > (expiresAtMs + graceMs),
      cachedAt: envelope.metadata.cachedAt,
      expiresAt: envelope.metadata.expiresAt,
      ageSeconds: Number.isNaN(cachedAtMs) ? null : Math.floor((now - cachedAtMs) / 1000),
      ttlSeconds: envelope.metadata.ttlSeconds,
      staleGraceSeconds: envelope.metadata.staleGraceSeconds,
      dataSource: envelope.metadata.dataSource || 'cache'
    };
  }

  cleanupExpired(cutoffIsoString = new Date().toISOString()) {
    if (typeof this.store.cleanupExpired === 'function') {
      return this.store.cleanupExpired(cutoffIsoString);
    }
    const cutoffMs = new Date(cutoffIsoString).getTime();
    if (Number.isNaN(cutoffMs)) return 0;
    let deleted = 0;
    for (const key of this.keys()) {
      const envelope = this.getEnvelope(key);
      if (!envelope || !envelope.metadata) continue;
      const expiresAtMs = new Date(envelope.metadata.expiresAt).getTime();
      const graceMs = (envelope.metadata.staleGraceSeconds ?? this.defaultStaleGraceSeconds) * 1000;
      if (Number.isNaN(expiresAtMs) || (expiresAtMs + graceMs) < cutoffMs) {
        if (this.delete(key)) deleted++;
      }
    }
    return deleted;
  }

  has(key) {
    return this.store.has(key);
  }

  hasSync(key) {
    return this.has(key);
  }

  delete(key) {
    return this.store.delete(key);
  }

  deleteSync(key) {
    return this.delete(key);
  }

  clear() {
    return this.store.clear();
  }

  clearSync() {
    return this.clear();
  }

  keys() {
    return this.store.keys();
  }

  keysSync() {
    return this.keys();
  }

  close() {
    if (this.store && typeof this.store.close === 'function') {
      this.store.close();
    }
  }
}

// Default singleton instance
export const cacheManager = new CacheManager();
export default cacheManager;
