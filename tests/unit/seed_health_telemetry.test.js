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

test('TASK-SEC-04: getStatus responds in < 500ms without blocking while inFlightSync is pending', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-nonblock-status-'));
  let releaseSync;
  try {
    const cache = new CacheManager({ cacheDir: tmpDir, backend: 'json' });
    const service = new IngestionService({ cacheManager: cache });
    service.inFlightSync = new Promise((resolve) => {
      releaseSync = resolve;
    });

    const started = Date.now();
    const status = await service.getStatus();
    const elapsedMs = Date.now() - started;

    assert.ok(elapsedMs < 500, `Expected non-blocking getStatus < 500ms, got ${elapsedMs}ms`);
    assert.equal(status.syncInProgress, true);
    assert.ok(status.offerCount > 0, 'Cold cache should fall back cleanly to seed counts while syncing');
  } finally {
    if (releaseSync) releaseSync({ status: 'done' });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('TASK-GOV-02: getSeedHealth treats missing/invalid validTo as expired and routers delegate 500 to errorHandler without raw err.message', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-seed-missing-date-'));
  const tmpSeedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-seed-fixtures-'));
  try {
    fs.writeFileSync(
      path.join(tmpSeedDir, 'rapallo_flyers.json'),
      JSON.stringify([
        { id: 'f-valid', validTo: '2099-01-01T00:00:00.000Z' },
        { id: 'f-missing' },
        { id: 'f-invalid', validTo: 'not-a-date' }
      ]),
      'utf8'
    );
    const cache = new CacheManager({ cacheDir: tmpDir, backend: 'json' });
    const service = new IngestionService({ cacheManager: cache, seedDir: tmpSeedDir });
    const health = await service.getSeedHealth(Date.parse('2026-11-21T12:00:00.000Z'));
    assert.equal(health.totalSeedFlyers, 3);
    assert.equal(health.activeSeedFlyers, 1);
    assert.equal(health.expiredSeedFlyers, 2);

    const express = (await import('express')).default;
    const { errorHandler } = await import('../../server/index.js');
    const app = express();
    app.get('/boom', (_req, _res, next) => next(new Error('SECRET_INTERNAL_STACK')));
    app.use(errorHandler);
    const srv = app.listen(0, '127.0.0.1');
    await new Promise((r) => srv.once('listening', r));
    try {
      const { port } = srv.address();
      const res = await fetch(`http://127.0.0.1:${port}/boom`);
      assert.equal(res.status, 500);
      const body = await res.json();
      assert.equal(body.error, 'Internal Server Error');
      assert.ok(!JSON.stringify(body).includes('SECRET_INTERNAL_STACK'));
    } finally {
      srv.close();
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    fs.rmSync(tmpSeedDir, { recursive: true, force: true });
  }
});
