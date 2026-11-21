/**
 * ADR-0017 / TASK-SEC-03 — Cloud Run Public Security & LLM Guardrails Tests
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { createRateLimiter } from '../../server/middleware/rateLimiter.js';
import { maestroCoachService } from '../../server/services/maestroCoachService.js';
import { createApp } from '../../server/index.js';
import maestroRouter from '../../server/routes/maestro.js';

test('ADR-0017: createRateLimiter returns 429 with Retry-After when limit is exceeded', async () => {
  const app = express();
  app.use(createRateLimiter({ windowMs: 60_000, maxRequests: 2, skipInTest: false }));
  app.get('/ping', (_req, res) => res.json({ ok: true }));

  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  try {
    const { port } = server.address();
    const url = `http://127.0.0.1:${port}/ping`;
    const r1 = await fetch(url);
    const r2 = await fetch(url);
    const r3 = await fetch(url);
    assert.equal(r1.status, 200);
    assert.equal(r2.status, 200);
    assert.equal(r3.status, 429);
    assert.ok(Number(r3.headers.get('retry-after')) >= 1);
  } finally {
    server.close();
  }
});

test('ADR-0017: askMaestro rejects messages longer than 2000 characters with 400', async () => {
  await assert.rejects(
    () => maestroCoachService.askMaestro({ message: 'a'.repeat(2001) }),
    (err) => (err.status === 400 || err.statusCode === 400) && /massimo 2000 caratteri/i.test(err.message)
  );
});

test('ADR-0017: _tryGroundedLlmSynthesis sends GEMINI_API_KEY via x-goog-api-key header, never in URL', async () => {
  const prevKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = 'test-gemini-secret-xyz';
  let capturedUrl = null;
  let capturedHeaders = null;

  try {
    const res = await maestroCoachService._tryGroundedLlmSynthesis({
      message: 'Cosa cucino stasera?',
      history: [],
      snapshot: {
        profile: { id: 'dany', label: 'Dany' },
        rhythm: { id: 'feriale' },
        pantry: { valueAtRisk48h: 0, fridgeItems: [] },
        kitchen: {},
        shoppingAndRapallo: { topFoodOffersRapallo: [], optimalStoreSummary: {} }
      },
      paretoCards: [],
      p0Alerts: [],
      deterministicBase: 'base',
      fetchImpl: async (url, init) => {
        capturedUrl = url;
        capturedHeaders = init?.headers || {};
        return new Response(
          JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Risposta test' }] } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    });

    assert.equal(res?.provider, 'gemini_grounded');
    assert.ok(!capturedUrl.includes('key='), 'API key must NOT be in URL query string');
    assert.equal(capturedHeaders['x-goog-api-key'], 'test-gemini-secret-xyz');
  } finally {
    if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = prevKey;
  }
});

test('ADR-0017: production mode ignores contextOverride on /api/maestro/chat and sets security headers', async () => {
  const prevEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const app = createApp({ maestroRouter });
  const server = app.listen(0);
  await new Promise((r) => server.once('listening', r));

  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/maestro/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: 'Cosa ho in frigo?',
        contextOverride: { pantry: { fridgeItems: [{ name: 'INJECTED_FAKE_ITEM' }] } }
      })
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
    assert.ok(res.headers.get('content-security-policy')?.includes("default-src 'self'"));
    const body = await res.json();
    assert.ok(!JSON.stringify(body).includes('INJECTED_FAKE_ITEM'));
  } finally {
    server.close();
    if (prevEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevEnv;
  }
});
