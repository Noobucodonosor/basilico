/**
 * ADR-0018 / TASK-DATA-04 — Offline Seed Freshness Telemetry Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { IngestionService } from '../../server/services/ingestionService.js';
import { CacheManager } from '../../server/services/cacheManager.js';
import { createApp } from '../../server/index.js';
import statusRouter from '../../server/routes/status.js';

test('ADR-0018: getSeedHealth counts active vs expired flyers accurately without altering dates', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-seed-health-'));
  try {
    const cache = new CacheManager({ cacheDir: tmpDir, backend: 'json' });
    const service = new IngestionService({ cacheManager: cache });
    const now = Date.parse('2026-11-21T12:00:00.000Z');
    const health = await service.getSeedHealth(now);

    assert.equal(health.totalSeedFlyers, 25);
    assert.equal(health.activeSeedFlyers + health.expiredSeedFlyers, 25);
    assert.equal(health.seedNeedsRefresh, true);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('ADR-0018: GET /api/status exposes seedHealth telemetry', async () => {
  const app = createApp({ statusRouter });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/status`);
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.ok(json.seedHealth && typeof json.seedHealth.totalSeedFlyers === 'number');
    assert.equal(typeof json.seedHealth.seedNeedsRefresh, 'boolean');
  } finally {
    server.close();
  }
});
