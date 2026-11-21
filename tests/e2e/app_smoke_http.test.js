import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../../server/index.js';

describe('Wave C: Live Express HTTP & PWA Smoke Verification (TASK-QA-02)', () => {
  let server;
  let baseUrl;

  before(async () => {
    const app = createApp();
    await new Promise((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('serves built SPA index.html, manifest.webmanifest, sw.js, icon.svg, and /api/status cleanly', async () => {
    const homeRes = await fetch(`${baseUrl}/`);
    assert.equal(homeRes.status, 200);
    assert.match(homeRes.headers.get('content-type') || '', /text\/html/i);
    const html = await homeRes.text();
    assert.match(html, /manifest\.webmanifest/);
    assert.match(html, /<div id="root"><\/div>/);

    const manifestRes = await fetch(`${baseUrl}/manifest.webmanifest`);
    assert.equal(manifestRes.status, 200);
    const manifest = await manifestRes.json();
    assert.equal(manifest.short_name, 'Basilico');
    assert.equal(manifest.start_url, '/');

    const swRes = await fetch(`${baseUrl}/sw.js`);
    assert.equal(swRes.status, 200);
    const swText = await swRes.text();
    assert.match(swText, /basilico-api-v1/);
    assert.match(swText, /\/api\/shopping-list/);

    const iconRes = await fetch(`${baseUrl}/icon.svg`);
    assert.equal(iconRes.status, 200);
    const iconText = await iconRes.text();
    assert.match(iconText, /<svg/);

    const statusRes = await fetch(`${baseUrl}/api/status`);
    assert.equal(statusRes.status, 200);
    const statusJson = await statusRes.json();
    assert.ok(statusJson.seedHealth, '/api/status should expose seedHealth telemetry');
  });
});
