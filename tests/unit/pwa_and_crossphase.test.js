import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

describe('Wave B: PWA Manifest, Service Worker & 1-Tap Cross-Phase Flows (TASK-PWA-01)', () => {
  it('validates public/manifest.webmanifest structure and verifies icon files exist in public/', () => {
    const manifestPath = path.join(ROOT, 'public/manifest.webmanifest');
    assert.ok(fs.existsSync(manifestPath), 'public/manifest.webmanifest must exist');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.short_name, 'Basilico');
    assert.equal(manifest.start_url, '/');
    assert.equal(manifest.display, 'standalone');
    assert.equal(manifest.theme_color, '#1B5E3A');
    assert.equal(manifest.background_color, '#FAF9F6');
    assert.ok(Array.isArray(manifest.icons) && manifest.icons.length >= 2, 'manifest should declare at least 2 icons');

    for (const icon of manifest.icons) {
      assert.ok(icon.src.startsWith('/'), `icon src must be root-relative: ${icon.src}`);
      const diskPath = path.join(ROOT, 'public', icon.src.replace(/^\/+/, ''));
      assert.ok(fs.existsSync(diskPath), `icon asset must exist on disk: ${diskPath}`);
    }
  });

  it('validates public/sw.js caches shopping/pantry/stores offline while bypassing mutations and live AI endpoints', () => {
    const swPath = path.join(ROOT, 'public/sw.js');
    assert.ok(fs.existsSync(swPath), 'public/sw.js must exist');
    const swSource = fs.readFileSync(swPath, 'utf8');

    assert.match(swSource, /request\.method\s*!==\s*'GET'/, 'SW must ignore non-GET requests');
    for (const endpoint of ['/api/shopping-list', '/api/pantry', '/api/stores', '/api/status']) {
      assert.ok(swSource.includes(endpoint), `SW must support offline fallback for ${endpoint}`);
    }
    for (const bypassed of ['/api/maestro', '/api/agentation', '/api/sync']) {
      assert.ok(swSource.includes(bypassed), `SW must bypass cache for ${bypassed}`);
    }
    assert.match(swSource, /trimCache\(/, 'SW must apply bounded FIFO eviction');
    assert.match(swSource, /MAX_API_ENTRIES\s*=\s*50/);
    assert.match(swSource, /MAX_STATIC_ENTRIES\s*=\s*80/);
  });

  it('links manifest in index.html and restricts service worker registration to production in src/main.jsx', () => {
    const indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const mainJsx = fs.readFileSync(path.join(ROOT, 'src/main.jsx'), 'utf8');

    assert.match(indexHtml, /<link[^>]+rel="manifest"[^>]+href="\/manifest\.webmanifest"/);
    assert.match(indexHtml, /<meta[^>]+name="theme-color"[^>]+content="#1B5E3A"/);
    assert.match(mainJsx, /import\.meta\.env\.PROD/, 'SW registration must be gated to PROD builds');
    assert.match(mainJsx, /navigator\.serviceWorker\.register\('\/sw\.js'\)/);
  });

  it('wires 1-tap cross-phase callbacks across Overview, Pantry, Recipes and CREA -> Market', () => {
    const appSource = fs.readFileSync(path.join(ROOT, 'src/App.jsx'), 'utf8');
    const creaModalSource = fs.readFileSync(path.join(ROOT, 'src/components/crea/CreaFoodModal.jsx'), 'utf8');
    const creaExplorerSource = fs.readFileSync(path.join(ROOT, 'src/components/crea/CreaExplorerView.jsx'), 'utf8');
    const pantrySource = fs.readFileSync(path.join(ROOT, 'src/components/pantry/PantryAndReceiptsView.jsx'), 'utf8');
    const recipesSource = fs.readFileSync(
      path.join(ROOT, 'src/components/recipes/RecipesAndRestaurantsView.jsx'),
      'utf8'
    );

    assert.match(appSource, /onCookWithIngredient=\{handleCookWithIngredient\}/);
    assert.match(appSource, /initialSearchQuery=\{initialRecipeSearch\}/);
    assert.match(appSource, /onSearchMarketOffer=\{handleSearchMarketOffer\}/);

    assert.match(creaModalSource, /onSearchMarketOffer/);
    assert.match(creaModalSource, /Cerca a Rapallo/);
    assert.match(creaExplorerSource, /onSearchMarketOffer=\{onSearchMarketOffer\}/);
    assert.match(pantrySource, /onCookWithIngredient\(item\.title\)/);
    assert.match(recipesSource, /initialSearchQuery\s*=/);

    for (const [label, src] of [
      ['CreaFoodModal.jsx', creaModalSource],
      ['PantryAndReceiptsView.jsx', pantrySource],
      ['RecipesAndRestaurantsView.jsx', recipesSource]
    ]) {
      assert.doesNotMatch(src, /(?:violet|indigo)-/, `${label} must remain free of prohibited violet/indigo classes`);
    }
  });
});
