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
    bundled.TodayCopilotView = (await bundleComponent('src/components/today/TodayCopilotView.jsx')).default;
    bundled.WeeklyRegiaView = (await bundleComponent('src/components/today/WeeklyRegiaView.jsx')).default;
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

  it('1. RoomNavigation exposes the 3 Rhythms and the 7 Rooms (Officina Cucina + Stanza 7 Chimica Casa)', () => {
    const { BASILICO_RHYTHMS, BASILICO_ROOMS } = bundled.RoomNav;
    assert.deepEqual(
      BASILICO_RHYTHMS.map((r) => r.id),
      ['oggi', 'regia', 'atlante']
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

  it('2. Bare "/" opens ⚡ Oggi (Co-pilota) by default with rhythm bar, global Maestro button and quick jump to 7 Rooms', () => {
    installFakeWindow('');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="rhythm-navigation"/);
    assert.match(html, /data-testid="today-copilot-view"/);
    assert.match(html, /data-testid="header-open-maestro"/);
    assert.match(html, /Vai alla Stanza/);
    assert.match(html, /Chimica Casa/);
    assert.doesNotMatch(html, /data-testid="weekly-regia-view"/);
    assert.doesNotMatch(html, /Offerte promozionali/);
  });

  it('3. "?rhythm=regia" renders the 4-step 🧭 Regia Settimanale tunnel', () => {
    installFakeWindow('?rhythm=regia');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="weekly-regia-view"/);
    assert.match(html, /1\. Prezzi &amp; Strumenti/);
    assert.match(html, /2\. Controllo Frigo/);
    assert.match(html, /3\. Basi &amp; Barca/);
    assert.match(html, /4\. Giro Spesa/);
    assert.doesNotMatch(html, /data-testid="today-copilot-view"/);
  });

  it('4. "?rhythm=atlante&section=academy" renders 🎓 Accademia with the Atlante section switcher', () => {
    installFakeWindow('?rhythm=atlante&section=academy');
    const html = renderToString(React.createElement(bundled.App));
    assert.match(html, /data-testid="atlante-section-switcher"/);
    assert.match(html, /Scuola Culinaria &amp; SOS Fornelli/);
    assert.match(html, /Coach Nutrizionale/);
    assert.match(html, /Atlante delle 7 Stanze/);
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

  it('8. TodayCopilotView & WeeklyRegiaView render standalone with rhythm presets and the 4 Regia steps', () => {
    const todayHtml = renderToString(
      React.createElement(bundled.TodayCopilotView, { activeProfileId: 'dany', rhythmPreset: 'sera_stanca' })
    );
    assert.match(todayHtml, /Cosa cucinare stasera/);
    assert.match(todayHtml, /Sera Stanca/);
    assert.match(todayHtml, /Feriale/);
    assert.match(todayHtml, /Weekend/);
    assert.match(todayHtml, /SOS Fornelli/);
    assert.match(todayHtml, /SOS Macchia/);
    assert.match(todayHtml, /Le tre proposte per cena/);
    assert.match(todayHtml, /\/assets\/img\/photo-m61660576\.jpg/);
    assert.match(todayHtml, /\/assets\/img\/photo-m61663250-960\.jpg/);
    assert.doesNotMatch(todayHtml, /Scelte di Pareto|Zero Punteggi Magici|CO-PILOTA OGGI|lipidico_emulsionato/i);

    const regiaHtml = renderToString(
      React.createElement(bundled.WeeklyRegiaView, { activeProfileId: 'dany' })
    );
    for (const step of ['1\\. Prezzi &amp; Strumenti', '2\\. Controllo Frigo', '3\\. Basi &amp; Barca', '4\\. Giro Spesa']) {
      assert.match(regiaHtml, new RegExp(step));
    }
  });
});
