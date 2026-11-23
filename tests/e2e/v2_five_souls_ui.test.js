/**
 * Basilico — E2E Rendering & Shell Contracts for Consumer Editorial Shell, Home "Oggi" & Dish Drawer
 * Location: tests/e2e/v2_five_souls_ui.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

let tmpDir;
let React;
let renderToString;
const bundled = {};

async function bundleComponent(relPath) {
  const outfile = path.join(tmpDir, `${path.basename(relPath, '.jsx')}-${Object.keys(bundled).length}.mjs`);
  await build({
    entryPoints: [path.join(ROOT, relPath)],
    bundle: true,
    platform: 'node',
    format: 'esm',
    jsx: 'automatic',
    outfile,
    logLevel: 'silent',
    external: ['react', 'react-dom', 'react/jsx-runtime', 'agentation'],
    nodePaths: [path.join(ROOT, 'node_modules')]
  });
  return import(pathToFileURL(outfile).href);
}

function installFakeWindow(search = '') {
  globalThis.window = {
    location: { search, hostname: 'ssr-test', pathname: '/', href: `http://ssr-test/${search}` },
    history: { replaceState() {} },
    addEventListener() {},
    removeEventListener() {},
    scrollTo() {}
  };
}

function removeFakeWindow() {
  delete globalThis.window;
}

describe('E2E: Basilico Consumer Editorial Shell, Home Oggi, Dish Drawer & Maestro', () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.basilico-ssr-'));
    React = await import('react');
    ({ renderToString } = await import('react-dom/server'));

    bundled.App = (await bundleComponent('src/App.jsx')).App;
    bundled.CycleOverviewView = (await bundleComponent('src/components/cycle/CycleOverviewView.jsx')).default;
    bundled.DishDetailDrawer = (await bundleComponent('src/components/cycle/DishDetailDrawer.jsx')).default;
    bundled.MaestroDrawer = (await bundleComponent('src/components/maestro/MaestroDrawer.jsx')).default;
    bundled.HomeChemistryView = (await bundleComponent('src/components/home/HomeChemistryView.jsx')).default;
    bundled.RoomNav = await bundleComponent('src/components/RoomNavigation.jsx');
  });

  after(() => {
    removeFakeWindow();
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. RoomNavigation preserves causal phase and 7 rooms taxonomy exports', () => {
    const { BASILICO_PHASES, BASILICO_ROOMS } = bundled.RoomNav;
    assert.deepEqual(
      BASILICO_PHASES.map((p) => p.id),
      ['overview', 'phase-1', 'phase-2', 'phase-3', 'phase-4']
    );
    assert.equal(BASILICO_ROOMS.length, 7);
    const room4 = BASILICO_ROOMS.find((r) => r.id === 'room-4-cucina');
    assert.match(room4.fullTitle, /Officina Cucina/);
    const room7 = BASILICO_ROOMS.find((r) => r.id === 'room-7-chimica');
    assert.equal(room7.number, 7);
    assert.equal(room7.shortTitle, 'Chimica Casa');
    assert.equal(room7.fullTitle, '7. Chimica & Cura della Casa/Barca');
  });

  it('2. Bare "/" renders single minimal consumer header (Oggi, Offerte, Ricette, Lista, Chiedi, Altro) and editorial Home', () => {
    installFakeWindow('');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="consumer-header"/);
    assert.match(html, /data-testid="cycle-overview-view"/);
    assert.match(html, /Cosa cucini stasera\?/);
    assert.match(html, /Stasera in tavola/);
    assert.match(html, /Oggi/);
    assert.match(html, /Offerte/);
    assert.match(html, /Ricette/);
    assert.match(html, /Lista/);
    assert.match(html, /data-testid="header-open-maestro"/);
    assert.match(html, /data-testid="header-alt-menu-btn"/);
    // Double/triple navigation clutter removed from shell
    assert.doesNotMatch(html, /data-testid="causal-phase-navigation"/);
    assert.doesNotMatch(html, /data-testid="phase-sub-navigation"/);
    assert.doesNotMatch(html, /data-testid="room-navigation"/);
    assert.doesNotMatch(html, /data-testid="today-copilot-view"/);
  });

  it('3. "?phase=1" opens CREA tool and "?phase=1&section=nutrition" preserves Nutrition Coach on reload', () => {
    installFakeWindow('?phase=1');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="tool-breadcrumb-bar"/);
    assert.match(html, /Torna a Oggi/);
    assert.match(html, /Database Nutrizionale CREA/);
    assert.doesNotMatch(html, /data-testid="cycle-overview-view"/);
    assert.doesNotMatch(html, /data-testid="phase-sub-navigation"/);

    installFakeWindow('?phase=1&section=nutrition');
    const nutritionHtml = renderToString(React.createElement(bundled.App));
    assert.match(nutritionHtml, /Coach Nutrizionale/);
  });

  it('4. "?phase=2" opens Offerte Rapallo cleanly without secondary stacked nav bars', () => {
    installFakeWindow('?phase=2');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /Offerte promozionali/);
    assert.doesNotMatch(html, /data-testid="room-navigation"/);
  });

  it('5. Deep-link "?room=room-7-chimica" opens Stanza 7 Chimica Casa cleanly with breadcrumb', () => {
    installFakeWindow('?room=room-7-chimica');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="tool-breadcrumb-bar"/);
    assert.match(html, /Chimica e Cura della Casa/);
    assert.match(html, /Sincronizzazione profilo attivo|room-7-home-chemistry/);

    const roomHtml = renderToString(
      React.createElement(bundled.HomeChemistryView, { activeProfileId: 'casa' })
    );
    assert.match(roomHtml, /data-testid="room-7-home-chemistry"/);
  });

  it('6. Legacy deep-link "?room=room-1-negozi" still opens Offerte Rapallo', () => {
    installFakeWindow('?room=room-1-negozi');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /Offerte promozionali/);
    assert.doesNotMatch(html, /data-testid="today-copilot-view"/);
  });

  it('7. MaestroDrawer renders the hybrid grounded chat with 5 Soul chips when open, and nothing when closed', () => {
    removeFakeWindow();
    const closedHtml = renderToString(
      React.createElement(bundled.MaestroDrawer, { isOpen: false, onClose() {} })
    );
    assert.equal(closedHtml, '');

    const openHtml = renderToString(
      React.createElement(bundled.MaestroDrawer, {
        isOpen: true,
        onClose() {},
        activeProfileId: 'casa',
        rhythmPreset: 'sera_stanca'
      })
    );
    assert.match(openHtml, /data-testid="maestro-drawer"/);
    assert.match(openHtml, /Basilico Maestro/);
    assert.match(openHtml, /Motore locale verificato/);
    assert.doesNotMatch(openHtml, /VaR_48h|ADR-0006/);
    for (const chip of ['Nutrizione', 'Arte Culinaria', 'Fisica Strumenti', 'Chimica Casa', 'Economia Rapallo']) {
      assert.match(openHtml, new RegExp(chip));
    }
  });

  it('8. CycleOverviewView & DishDetailDrawer render editorial copy, 3-data cards, and collapsed details accordions', () => {
    const overviewHtml = renderToString(
      React.createElement(bundled.CycleOverviewView, {
        activeProfileId: 'ospiti',
        onChangeProfile() {},
        onNavigateRoom() {},
        onAddToShoppingList() {}
      })
    );
    assert.match(overviewHtml, /data-testid="cycle-overview-view"/);
    assert.match(overviewHtml, /Cosa cucini stasera\?/);
    assert.match(overviewHtml, /Vedi le 3 proposte/);
    assert.match(overviewHtml, /Esplora le offerte di oggi/);
    assert.match(overviewHtml, /Stasera in tavola/);
    assert.match(overviewHtml, /Tutti i piatti/);
    assert.match(overviewHtml, /Senza latticini/);

    const drawerHtml = renderToString(
      React.createElement(bundled.DishDetailDrawer, {
        dish: {
          dishId: 'test-dish-1',
          cleanTitle: 'Trofie al Pesto Ligure',
          badge: 'Pronto subito',
          totalHandsOnMinutes: 18,
          purePortionCostEur: 3.4,
          menuPriceEuro: 15,
          fiveSoulsChain: {
            strumenti: 'Pentola capiente in acciaio inox.',
            casa: 'Risciacquo rapido.'
          }
        },
        activeProfileId: 'ospiti',
        onClose() {},
        onAddToShoppingList() {}
      })
    );
    assert.match(drawerHtml, /data-testid="dish-detail-drawer"/);
    assert.match(drawerHtml, /Trofie al Pesto Ligure/);
    assert.match(drawerHtml, /€ 3,40/);
    assert.match(drawerHtml, /Aggiungi ingredienti alla lista/);
    assert.match(drawerHtml, /Preparazione passo dopo passo/);
    assert.match(drawerHtml, /Valori nutrizionali \(CREA\)/);
    assert.match(drawerHtml, /Pentola e cottura/);
  });
});
