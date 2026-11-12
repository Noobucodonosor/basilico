/**
 * ADR-0014 / TASK-AIENG-01 — AI-Native Product Engineering Stack Verification
 * Tests Living Specs integrity (`specs/`), Domain Evals runner (`evals/run_evals.mjs`),
 * and Visual Point-to-Agent Inbox API (`/api/agentation`).
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from '../../server/index.js';
import {
  AGENTATION_JSON_PATH,
  AGENTATION_MD_PATH,
  readAgentationInbox,
  writeAgentationInbox
} from '../../server/routes/agentation.js';
import { runAllDomainEvals } from '../../evals/run_evals.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SPECS_DIR = path.resolve(__dirname, '../../specs');

test('ADR-0014: All 6 Living Specs exist and follow the 4-section human contract', () => {
  const expectedSpecs = [
    '01-negozi.spec.md',
    '02-crea.spec.md',
    '03-ricette.spec.md',
    '04-cucina.spec.md',
    '05-dispensa.spec.md',
    '06-pianificatore.spec.md'
  ];

  assert.ok(fs.existsSync(path.join(SPECS_DIR, 'README.md')), 'specs/README.md must exist');

  for (const file of expectedSpecs) {
    const full = path.join(SPECS_DIR, file);
    assert.ok(fs.existsSync(full), `Missing living spec: ${file}`);
    const content = fs.readFileSync(full, 'utf8');
    assert.match(content, /## 1\./, `${file} missing section 1`);
    assert.match(content, /## 2\./, `${file} missing section 2`);
    assert.match(content, /## 3\./, `${file} missing section 3`);
    assert.match(content, /## 4\./, `${file} missing section 4`);
  }
});

test('ADR-0014: Domain & Common-Sense Evals Suite passes 100% across all 6 Rooms', async () => {
  const scorecard = await runAllDomainEvals({ quiet: true });
  assert.equal(scorecard.suites.length, 6, 'Must evaluate all 6 Rooms');
  assert.equal(scorecard.allPassed, true, `Expected 100% eval score, got ${scorecard.overallScorePct}%`);
  assert.equal(scorecard.overallScorePct, 100);
});

test('ADR-0014: /api/agentation persists, lists, resolves and deletes visual annotations cleanly', async () => {
  const backup = readAgentationInbox();
  const app = createApp({ serveStatic: false });
  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    writeAgentationInbox([]);

    // 1. Upsert annotation from Agentation toolbar
    const postRes = await fetch(`${baseUrl}/api/agentation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: 'http://localhost:3000/?room=room-1-negozi',
        annotation: {
          id: 'test-ann-01',
          comment: 'Riduci il numero di badge sulla card offerta',
          element: 'article.offer-card',
          elementPath: 'main > div > article:nth-child(1)',
          reactComponents: 'App > OfferGrid > OfferCard',
          intent: 'change',
          severity: 'suggestion'
        }
      })
    });
    assert.equal(postRes.status, 201);
    const postJson = await postRes.json();
    assert.equal(postJson.pendingCount, 1);

    // 2. Verify Markdown mirror is generated for AI agents
    assert.ok(fs.existsSync(AGENTATION_MD_PATH));
    const md = fs.readFileSync(AGENTATION_MD_PATH, 'utf8');
    assert.match(md, /Riduci il numero di badge sulla card offerta/);
    assert.match(md, /App > OfferGrid > OfferCard/);

    // 3. Resolve annotation
    const resolveRes = await fetch(`${baseUrl}/api/agentation/resolve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['test-ann-01'] })
    });
    assert.equal(resolveRes.status, 200);
    const resolveJson = await resolveRes.json();
    assert.equal(resolveJson.pendingCount, 0);

    // 4. Delete annotation
    const delRes = await fetch(`${baseUrl}/api/agentation/test-ann-01`, { method: 'DELETE' });
    assert.equal(delRes.status, 200);
  } finally {
    server.close();
    if (backup && Array.isArray(backup.items) && backup.items.length > 0) {
      writeAgentationInbox(backup.items);
    } else {
      writeAgentationInbox([]);
    }
    assert.ok(fs.existsSync(AGENTATION_JSON_PATH));
  }
});
