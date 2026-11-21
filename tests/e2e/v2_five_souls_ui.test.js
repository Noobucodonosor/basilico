/**
 * Basilico 2.0 — E2E Rendering & Shell Contracts for the 3 Rhythms, 7 Rooms & Maestro Drawer
 * Location: tests/e2e/v2_five_souls_ui.test.js (ADR-0015 / TASK-V2-05 / TASK-V2-06)
 *
 * Bundles the real React 19 components with esbuild and renders them server-side (react-dom/server),
 * verifying the actual markup of: ⚡ Oggi (default entry), 🧭 Regia Settimanale, 🎓 Accademia & Atlante,
 * Stanza 7 Chimica Casa (deep-link `?room=room-7-chimica`) and the open MaestroDrawer.
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
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
  // Symlink node_modules next to the bundle so bare `react` imports resolve from the project
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

describe('E2E: Basilico 2.0 — 3 Rhythms Shell, 7 Rooms Atlas & Maestro Drawer (ADR-0015)', () => {
  before(async () => {
    tmpDir = fs.mkdtempSync(path.join(ROOT, 'node_modules', '.basilico-ssr-'));
    React = await import('react');
    ({ renderToString } = await import('react-dom/server'));

    bundled.App = (await bundleComponent('src/App.jsx')).App;
    bundled.CycleOverviewView = (await bundleComponent('src/components/cycle/CycleOverviewView.jsx')).default;
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

  it('1. RoomNavigation exposes the 4 Causal Phases (+ Panoramica) and the 7 Rooms', () => {
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
    assert.equal(room7.icon, '🧪');
    assert.equal(room7.shortTitle, 'Chimica Casa');
    assert.equal(room7.fullTitle, '7. Chimica & Cura della Casa/Barca');
  });

  it('2. Bare "/" opens Panoramica del Ciclo Causale (zero "Cosa cucinare stasera" at top) with single 4-Phase bar', () => {
    installFakeWindow('');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="causal-phase-navigation"/);
    assert.match(html, /data-testid="cycle-overview-view"/);
    assert.match(html, /1\. Sapere &amp; Obiettivi/);
    assert.match(html, /2\. Mercato &amp; Spesa/);
    assert.match(html, /3\. Dispensa &amp; Casa/);
    assert.match(html, /4\. Cucina &amp; Pulizie/);
    assert.match(html, /data-testid="header-open-maestro"/);
    assert.match(html, /Vai alla Stanza/);
    assert.doesNotMatch(html, /data-testid="rhythm-navigation"/);
    assert.doesNotMatch(html, /data-testid="today-copilot-view"/);
    assert.doesNotMatch(html, /Cosa cucinare stasera/);
  });

  it('3. "?phase=1" opens Fase 1 Sapere & Obiettivi with CREA, Coach Nutrizionale and Scuola Culinaria sub-tabs', () => {
    installFakeWindow('?phase=1');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="phase-sub-navigation"/);
    assert.match(html, /Scienza &amp; CREA/);
    assert.match(html, /Coach Nutrizionale/);
    assert.match(html, /Scuola Culinaria &amp; SOS/);
    assert.doesNotMatch(html, /data-testid="cycle-overview-view"/);
  });

  it('4. "?phase=2" opens Fase 2 Mercato & Spesa with Negozi & Offerte Rapallo and Pianificatore & Spesa', () => {
    installFakeWindow('?phase=2');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="room-navigation"/);
    assert.match(html, /Offerte promozionali/);
    assert.match(html, /Pianificatore &amp; Spesa/);
  });

  it('5. Deep-link "?room=room-7-chimica" opens Stanza 7 Chimica Casa (HomeChemistryView) inside the Atlante', () => {
    installFakeWindow('?room=room-7-chimica');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /Navigazione 7 Stanze/);
    // profiles are not ready during SSR -> room shell renders sync placeholder; verify standalone view separately
    assert.match(html, /Sincronizzazione profilo attivo|room-7-home-chemistry/);

    const roomHtml = renderToString(
      React.createElement(bundled.HomeChemistryView, { activeProfileId: 'dany' })
    );
    assert.match(roomHtml, /data-testid="room-7-home-chemistry"/);
  });

  it('6. Legacy deep-link "?room=room-1-negozi" still opens Stanza 1 Negozi & Offerte', () => {
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
        activeProfileId: 'dany',
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

  it('8. CycleOverviewView renders standalone with all 4 Causal Cycle Phases and zero obsolete Oggi/Regia wrappers', () => {
    const overviewHtml = renderToString(
      React.createElement(bundled.CycleOverviewView, {
        status: { offerCount: 243, storeCount: 14, dataSource: 'seed' },
        activeProfile: { id: 'dany', name: 'Dany' },
        shoppingCount: 0,
        onSelectPhase() {},
        onNavigateRoom() {},
        onOpenMaestro() {}
      })
    );
    assert.match(overviewHtml, /data-testid="cycle-overview-view"/);
    assert.match(overviewHtml, /243 offerte attive/);
    assert.match(overviewHtml, /1\. Sapere &amp; Obiettivi/);
    assert.match(overviewHtml, /2\. Mercato &amp; Spesa/);
    assert.match(overviewHtml, /3\. Dispensa &amp; Casa/);
    assert.match(overviewHtml, /4\. Cucina &amp; Pulizie/);
    assert.doesNotMatch(overviewHtml, /Cosa cucinare stasera/);
  });
});
