/**
 * Basilico — E2E & Structural Verification for Stanza 3 (Ricette, Ristoranti & Fornelli) (ADR-0011 / TASK-M5-02)
 * Location: tests/e2e/recipes_cooking_ui.test.js
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

test('Stanza 3 UI Components — Structural & Contract Verification (ADR-0011 / TASK-M5-02)', () => {
  const viewPath = path.join(ROOT, 'src/components/recipes/RecipesAndRestaurantsView.jsx');
  const cookingModalPath = path.join(ROOT, 'src/components/recipes/CookingModeModal.jsx');
  const labModalPath = path.join(ROOT, 'src/components/recipes/LabNotebookModal.jsx');
  const appPath = path.join(ROOT, 'src/App.jsx');

  assert.ok(fs.existsSync(viewPath), 'RecipesAndRestaurantsView.jsx must exist');
  assert.ok(fs.existsSync(cookingModalPath), 'CookingModeModal.jsx must exist');
  assert.ok(fs.existsSync(labModalPath), 'LabNotebookModal.jsx must exist');

  const viewSrc = fs.readFileSync(viewPath, 'utf8');
  assert.match(viewSrc, /32 Ristoranti del Tigullio/i);
  assert.match(viewSrc, /Costo Porzione Pura/i);
  assert.match(viewSrc, /Analisi 80\/20 Max-Coverage/i);
  assert.match(viewSrc, /De-costruisci Menu/i);
  assert.match(viewSrc, /Quaderno Lab/i);

  const cookingSrc = fs.readFileSync(cookingModalPath, 'utf8');
  assert.match(cookingSrc, /Harvard Science & Cooking/i);
  assert.match(cookingSrc, /Check Mise en Place/i);
  assert.match(cookingSrc, /KitchenResetCard/i);

  const appSrc = fs.readFileSync(appPath, 'utf8');
  assert.match(appSrc, /room-3-ricette/);
  assert.match(appSrc, /RecipesAndRestaurantsView/);
});
