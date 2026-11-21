/**
 * Basilico — E2E & Structural Verification for Stanza 6 (Pianificatore & Lista Spesa) (ADR-0012 / TASK-M6-02)
 * Location: tests/e2e/planner_shopping_ui.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

test('Stanza 6 UI Components — Structural & Contract Verification (ADR-0012 / TASK-M6-02)', () => {
  const viewPath = path.join(ROOT, 'src/components/planner/PlannerAndShoppingView.jsx');
  const modalPath = path.join(ROOT, 'src/components/planner/AisleChecklistModal.jsx');
  const appPath = path.join(ROOT, 'src/App.jsx');

  assert.ok(fs.existsSync(viewPath), 'PlannerAndShoppingView.jsx must exist');
  assert.ok(fs.existsSync(modalPath), 'AisleChecklistModal.jsx must exist');

  const viewSrc = fs.readFileSync(viewPath, 'utf8');
  assert.match(viewSrc, /6 Modelli Neo-Dieta/i);
  assert.match(viewSrc, /Giornata in Barca/i);
  assert.match(viewSrc, /Tracciabilità Confezioni Condivise/i);
  assert.match(viewSrc, /1 Solo Negozio vs 2 Negozi vs 3 Negozi/i);
  assert.match(viewSrc, /Spunta tutto e carica in Dispensa/i);

  const modalSrc = fs.readFileSync(modalPath, 'utf8');
  assert.match(modalSrc, /Modalità In Corsia/i);
  assert.match(modalSrc, /Piano B sullo Scaffale/i);
  assert.match(modalSrc, /Copia WhatsApp \/ Telegram/i);

  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert.match(appSrc, /room-6-pianificatore/);
  assert.match(appSrc, /PlannerAndShoppingView/);
  assert.match(appSrc, /handleAddToShoppingList/);

  const headerSrc = fs.readFileSync(path.join(ROOT, 'src/components/Header.jsx'), 'utf8');
  assert.match(headerSrc, /onOpenShoppingList/);

  const cardSrc = fs.readFileSync(path.join(ROOT, 'src/components/OfferCard.jsx'), 'utf8');
  assert.match(cardSrc, /onAddToShoppingList/);
});
