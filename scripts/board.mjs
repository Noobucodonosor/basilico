#!/usr/bin/env node
/**
 * Basilico — AI Product Engineer Mission Control CLI (`ADR-0014 / TASK-AIENG-01`)
 * Location: scripts/board.mjs
 *
 * Commands:
 *   npm run board   -> 1-screen radar across all 6 Rooms (GitHub state + Living Specs notes + Eval Score + Agentation Inbox)
 *   npm run inbox   -> Detailed view of pending visual annotations captured by `<Agentation />` in the browser
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readAgentationInbox } from '../server/routes/agentation.js';
import { SCORECARD_JSON_PATH } from '../evals/run_evals.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPECS_DIR = path.join(ROOT_DIR, 'specs');

const ROOMS = [
  { room: 1, key: 'room-1-negozi', name: 'Negozi & Offerte Rapallo', spec: '01-negozi.spec.md', issue: 28 },
  { room: 2, key: 'room-2-crea', name: 'Scienza & CREA', spec: '02-crea.spec.md', issue: 29 },
  { room: 3, key: 'room-3-ricette', name: 'Ricette, Ristoranti & Fornelli', spec: '03-ricette.spec.md', issue: 30 },
  { room: 4, key: 'room-4-cucina', name: 'Cucina, Pentole & Pulizia', spec: '04-cucina.spec.md', issue: 31 },
  { room: 5, key: 'room-5-dispensa', name: 'Dispensa & Scontrini', spec: '05-dispensa.spec.md', issue: 32 },
  { room: 6, key: 'room-6-pianificatore', name: 'Pianificatore & Lista Spesa', spec: '06-pianificatore.spec.md', issue: 33 }
];

function extractDirectorNotes(specFilename) {
  const full = path.join(SPECS_DIR, specFilename);
  if (!fs.existsSync(full)) return [];
  const raw = fs.readFileSync(full, 'utf8');
  const idx = raw.indexOf('## 4.');
  if (idx === -1) return [];
  const tail = raw.slice(idx).split(/\r?\n/).slice(1);
  return tail
    .map((l) => l.trim())
    .filter((l) => l.startsWith('-') || l.startsWith('*'))
    .filter((l) => !/\(Vuoto\s*[—-]/i.test(l));
}

function fetchGithubRoomIssues() {
  try {
    const out = execFileSync(
      'gh',
      ['issue', 'list', '--search', '[ROOM-', '--state', 'all', '--limit', '20', '--json', 'number,title,state,labels'],
      { cwd: ROOT_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 4500 }
    );
    const parsed = JSON.parse(out);
    const map = new Map();
    for (const iss of parsed) {
      map.set(Number(iss.number), iss);
    }
    return map;
  } catch (_) {
    return null;
  }
}

function readLatestScorecard() {
  try {
    if (fs.existsSync(SCORECARD_JSON_PATH)) {
      return JSON.parse(fs.readFileSync(SCORECARD_JSON_PATH, 'utf8'));
    }
  } catch (_) {}
  return null;
}

function formatStatusBadge(ghIssue) {
  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const C = '\x1b[36m';
  const D = '\x1b[2m';
  const X = '\x1b[0m';

  if (!ghIssue) return `${D}offline${X}`;
  if (ghIssue.state === 'CLOSED') return `${G}✔ sigillata (DONE)${X}`;
  const labels = (ghIssue.labels || []).map((l) => l.name);
  if (labels.includes('status:taste-check')) return `${C}👁 taste-check (collaudo tuo)${X}`;
  if (labels.includes('status:agent-ready')) return `${G}🤖 agent-ready${X}`;
  if (labels.includes('status:spec-review')) return `${Y}📝 spec-review${X}`;
  return `${D}open${X}`;
}

function printInboxOnly(inbox) {
  const B = '\x1b[1m';
  const C = '\x1b[36m';
  const Y = '\x1b[33m';
  const D = '\x1b[2m';
  const G = '\x1b[32m';
  const X = '\x1b[0m';

  const pending = (inbox.items || []).filter((i) => i.status !== 'resolved');
  console.log(`\n${B}${C}🎯 BASILICO — AGENTATION VISUAL INBOX${X}`);
  console.log('═'.repeat(80));
  if (pending.length === 0) {
    console.log(`${G}✔ Nessuna annotazione visiva in sospeso.${X}`);
    console.log(
      `${D}Apri http://localhost:3000, clicca la toolbar Agentation in basso a destra, punta un elemento UI e premi Send.${X}\n`
    );
    return;
  }

  console.log(`${Y}${B}${pending.length} annotazioni visive pronte per l'Agente:${X}\n`);
  for (const [idx, item] of pending.entries()) {
    console.log(`${B}${idx + 1}. [${(item.intent || 'change').toUpperCase()}] ${item.comment || '(Senza commento)'}${X}`);
    console.log(`   • Stanza/URL : ${item.url || '/'}`);
    console.log(`   • Elemento   : ${item.element || '-'}  ${D}(${item.elementPath || '-'}) 
    ${X}`.trimEnd());
    if (item.reactComponents) {
      console.log(`   • React Stack: ${item.reactComponents}`);
    }
    if (item.nearbyText) {
      console.log(`   • Contesto   : "${String(item.nearbyText).slice(0, 140)}"`);
    }
    console.log('');
  }
  console.log(`${D}Scrivi in chat all'agente: "smaltisci inbox" per farle implementare e verificare tutte in un colpo.${X}\n`);
}

function printMissionControl() {
  const B = '\x1b[1m';
  const C = '\x1b[36m';
  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const R = '\x1b[31m';
  const D = '\x1b[2m';
  const X = '\x1b[0m';

  const ghMap = fetchGithubRoomIssues();
  const scorecard = readLatestScorecard();
  const inbox = readAgentationInbox();
  const pendingAnnotations = (inbox.items || []).filter((i) => i.status !== 'resolved');

  console.log(`\n${B}${C}🧭 BASILICO — MISSION CONTROL BOARD (ADR-0014)${X}`);
  console.log('═'.repeat(92));

  for (const r of ROOMS) {
    const ghIssue = ghMap ? ghMap.get(r.issue) : null;
    const statusStr = formatStatusBadge(ghIssue);
    const suite = scorecard?.suites?.find((s) => s.roomNumber === r.room);
    const evalStr = suite
      ? suite.passed === suite.total
        ? `${G}Eval ${suite.scorePct}% (${suite.passed}/${suite.total})${X}`
        : `${R}Eval ${suite.scorePct}% (${suite.passed}/${suite.total})${X}`
      : `${D}Eval n/d${X}`;

    const notes = extractDirectorNotes(r.spec);
    const roomInboxCount = pendingAnnotations.filter((a) => {
      const u = String(a.url || '');
      if (r.room === 1 && (!u.includes('room=') || u.includes(r.key))) return true;
      return u.includes(r.key);
    }).length;

    const signals = [];
    if (notes.length > 0) signals.push(`${Y}${notes.length} note in spec${X}`);
    if (roomInboxCount > 0) signals.push(`${Y}${roomInboxCount} pin Agentation${X}`);
    const signalStr = signals.length > 0 ? `  [${signals.join(' · ')}]` : '';

    console.log(
      `  ${B}Stanza ${r.room}${X} ${D}(#${r.issue})${X}  ${r.name.padEnd(32, ' ')} │ ${evalStr} │ ${statusStr}${signalStr}`
    );
  }

  console.log('─'.repeat(92));
  const globalEval = scorecard
    ? scorecard.allPassed
      ? `${G}${B}${scorecard.overallScorePct}% (${scorecard.totalPassed}/${scorecard.totalChecks})${X}`
      : `${R}${B}${scorecard.overallScorePct}% (${scorecard.totalPassed}/${scorecard.totalChecks})${X}`
    : `${Y}Esegui 'npm run eval'${X}`;

  const inboxSummary =
    pendingAnnotations.length === 0
      ? `${G}0 in coda (pulita)${X}`
      : `${Y}${B}${pendingAnnotations.length} annotazioni visive da smaltire${X} ${D}(vedi 'npm run inbox')${X}`;

  console.log(`  📊 ${B}Domain Eval Score:${X} ${globalEval}    🎯 ${B}Agentation Inbox:${X} ${inboxSummary}`);
  console.log(`  📂 ${B}Living Specs:${X}      ${D}specs/01-negozi.spec.md .. specs/06-pianificatore.spec.md${X}`);
  console.log('═'.repeat(92) + '\n');
}

const args = process.argv.slice(2);
if (args.includes('--inbox')) {
  printInboxOnly(readAgentationInbox());
} else {
  printMissionControl();
}
