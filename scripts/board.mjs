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
import {
  formatInt,
  getDefaultLedgerMarkdownPath,
  getTaskLiveStatus
} from './tokenLedger.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const SPECS_DIR = path.join(ROOT_DIR, 'specs');

const ROOMS = [
  { room: 1, key: 'room-1-negozi', name: 'Negozi & Offerte Rapallo', spec: '01-negozi.spec.md', issue: 28 },
  { room: 2, key: 'room-2-crea', name: 'Scienza & CREA', spec: '02-crea.spec.md', issue: 29 },
  { room: 3, key: 'room-3-ricette', name: 'Ricette, Ristoranti & Fornelli', spec: '03-ricette.spec.md', issue: 30 },
  { room: 4, key: 'room-4-cucina', name: 'Officina Cucina (Pentole/Lame)', spec: '04-cucina.spec.md', issue: 31 },
  { room: 5, key: 'room-5-dispensa', name: 'Dispensa & Scontrini', spec: '05-dispensa.spec.md', issue: 32 },
  { room: 6, key: 'room-6-pianificatore', name: 'Pianificatore & Lista Spesa', spec: '06-pianificatore.spec.md', issue: 33 },
  { room: 7, key: 'room-7-chimica', name: 'Chimica & Cura della Casa/Barca', spec: '07-chimica-casa.spec.md', issue: 39 }
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
      ['issue', 'list', '--state', 'all', '--limit', '100', '--json', 'number,title,state,labels'],
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
  console.log(`  📂 ${B}Living Specs:${X}      ${D}specs/01-negozi.spec.md .. specs/07-chimica-casa.spec.md${X}`);

  // ADR-0016 Roadmap Pianificata (ciclo-causale / status:planned / status:in-progress / status:taste-check)
  if (ghMap) {
    const roadmapIssues = Array.from(ghMap.values())
      .filter((iss) => {
        if (iss.state !== 'OPEN') return false;
        const lbls = (iss.labels || []).map((l) => l.name);
        return (
          lbls.includes('ciclo-causale') ||
          lbls.includes('status:planned') ||
          lbls.includes('status:in-progress')
        );
      })
      .sort((a, b) => Number(a.number) - Number(b.number));

    if (roadmapIssues.length > 0) {
      console.log('─'.repeat(92));
      console.log(`  🗺️  ${B}Roadmap GitHub Pianificata (ADR-0016 — 1 Issue = 1 Agente Singolo):${X}`);
      for (const iss of roadmapIssues) {
        const lbls = (iss.labels || []).map((l) => l.name);
        const budgetLbl = lbls.find((l) => l.startsWith('budget:')) || 'budget:M';
        const stateLbl = lbls.includes('status:in-progress')
          ? `${C}▶ in-progress${X}`
          : lbls.includes('status:taste-check')
            ? `${Y}👁 taste-check${X}`
            : lbls.includes('status:planned')
              ? `${G}⏳ planned${X}`
              : `${D}open${X}`;
        const shortTitle = String(iss.title || '').slice(0, 62);
        console.log(`     #${String(iss.number).padEnd(3, ' ')} [${budgetLbl}] ${stateLbl}  ${shortTitle}`);
      }
    }
  }

  // Contabilità Token Attiva & Ultima Registrazione Storica
  console.log('─'.repeat(92));
  try {
    const liveTok = getTaskLiveStatus();
    if (liveTok.active) {
      const pctColor = liveTok.overBudget ? R : G;
      console.log(
        `  ⏱️  ${B}Token Task Attivo:${X} #${liveTok.task.issueNumber} (${liveTok.task.taskId}, budget:${liveTok.task.tier}) → ${pctColor}${formatInt(liveTok.delta.input_tokens)} input nuovi (${liveTok.budgetPct}%)${X} · ${formatInt(liveTok.delta.output_tokens)} out · ${liveTok.delta.steps} step`
      );
    } else {
      console.log(`  ⏱️  ${B}Token Task Attivo:${X} ${D}nessuno (usa 'npm run task:start -- <issue> --tier S|M|L')${X}`);
    }
  } catch (_) {}

  try {
    const ledgerPath = getDefaultLedgerMarkdownPath();
    if (fs.existsSync(ledgerPath)) {
      const ledgerRows = fs
        .readFileSync(ledgerPath, 'utf8')
        .split(/\r?\n/)
        .filter((l) => /^\| \[\#\d+\]/.test(l));
      if (ledgerRows.length > 0) {
        console.log(`  🧾 ${B}Ultimo Rendiconto (${path.basename(ledgerPath)}):${X}`);
        console.log(`     ${D}${ledgerRows[ledgerRows.length - 1]}${X}`);
      }
    }
  } catch (_) {}

  console.log('═'.repeat(92) + '\n');
}

const args = process.argv.slice(2);
if (args.includes('--inbox')) {
  printInboxOnly(readAgentationInbox());
} else {
  printMissionControl();
}
