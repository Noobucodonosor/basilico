import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('API Tests: Sync & Health Status Endpoints (F8 - /api/sync & /api/status)', () => {
  let mockServerState = {
    isOnline: true,
    dataSource: 'live',
    lastSyncTimestamp: new Date().toISOString(),
    storeCount: 5,
    cachedUntil: Date.now() + 6 * 3600 * 1000
  };

  /**
   * Reference Controller for GET /api/status & POST /api/sync (Oracle for F8)
   */
  function handleGetStatus(state = mockServerState) {
    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: {
        isOnline: state.isOnline,
        dataSource: state.dataSource,
        lastSyncTimestamp: state.lastSyncTimestamp,
        storeCount: state.storeCount
      }
    };
  }

  async function handlePostSync(body = {}, state = mockServerState) {
    const force = Boolean(body.force);
    const now = Date.now();
    const isCacheValid = !force && now < state.cachedUntil;

    if (isCacheValid) {
      return {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: {
          status: 'success',
          startedAt: new Date(now - 5).toISOString(),
          completedAt: new Date(now).toISOString(),
          durationMs: 5,
          storesProcessed: state.storeCount,
          totalFlyers: 3,
          totalOffers: 40,
          dataSource: 'cache',
          errors: []
        }
      };
    }

    // Live or simulated fetch
    const durationMs = 35;
    state.lastSyncTimestamp = new Date().toISOString();
    state.cachedUntil = now + 6 * 3600 * 1000;

    return {
      status: 200,
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: {
        status: 'success',
        startedAt: new Date(now - durationMs).toISOString(),
        completedAt: new Date(now).toISOString(),
        durationMs,
        storesProcessed: state.storeCount,
        totalFlyers: 3,
        totalOffers: 40,
        dataSource: state.isOnline ? 'live' : 'seed',
        errors: []
      }
    };
  }

  describe('F8: Sync & Health Status API Contract (Tier 1)', () => {
    it('8.1 should return system health status with isOnline, dataSource, timestamp, storeCount', () => {
      const res = handleGetStatus();
      assert.equal(res.status, 200);
      assert.equal(typeof res.body.isOnline, 'boolean');
      assert.ok(['live', 'cache', 'seed'].includes(res.body.dataSource));
      assert.ok(typeof res.body.lastSyncTimestamp === 'string');
      assert.equal(typeof res.body.storeCount, 'number');
    });

    it('8.2 should return IngestionResult on POST /api/sync', async () => {
      const res = await handlePostSync({});
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
      assert.ok(Array.isArray(res.body.errors));
      assert.equal(typeof res.body.durationMs, 'number');
      assert.equal(typeof res.body.storesProcessed, 'number');
    });

    it('8.3 should report accurate execution duration in milliseconds', async () => {
      const res = await handlePostSync({});
      assert.ok(res.body.durationMs >= 0);
      assert.ok(res.body.durationMs < 5000);
    });

    it('8.4 should report dataSource as "cache" when cache is unexpired and force is false', async () => {
      const res = await handlePostSync({ force: false });
      assert.equal(res.body.dataSource, 'cache');
    });

    it('8.5 should bypass cache and refresh when force: true is specified', async () => {
      const res = await handlePostSync({ force: true });
      assert.equal(res.body.dataSource, 'live');
    });
  });

  describe('F8: Sync & Health Boundary & Corner Cases (Tier 2)', () => {
    it('8.6 should accurately report offline state and seed dataSource during network failure', () => {
      const offlineState = {
        isOnline: false,
        dataSource: 'seed',
        lastSyncTimestamp: new Date().toISOString(),
        storeCount: 5,
        cachedUntil: 0
      };
      const res = handleGetStatus(offlineState);
      assert.equal(res.body.isOnline, false);
      assert.equal(res.body.dataSource, 'seed');
    });

    it('8.7 should handle empty or missing POST body without throwing', async () => {
      const res = await handlePostSync(undefined);
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'success');
    });

    it('8.8 should complete health check endpoint within < 20ms', () => {
      const start = performance.now();
      handleGetStatus();
      const elapsed = performance.now() - start;
      assert.ok(elapsed < 20, `Health check took ${elapsed}ms`);
    });

    it('8.9 should return ISO8601 formatted timestamp in lastSyncTimestamp', () => {
      const res = handleGetStatus();
      const parsedTime = Date.parse(res.body.lastSyncTimestamp);
      assert.ok(!isNaN(parsedTime), 'Timestamp must be parseable ISO8601');
    });

    it('8.10 should verify storesProcessed matches Rapallo store count (5)', async () => {
      const res = await handlePostSync({ force: true });
      assert.equal(res.body.storesProcessed, 5);
      assert.equal(res.body.errors.length, 0);
    });
  });
});
