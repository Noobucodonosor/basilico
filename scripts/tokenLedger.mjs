#!/usr/bin/env node
/**
 * Basilico — GitHub & Exact Conversation Token Accounting (`ADR-0016 / TASK-GOV-01`)
 * Location: scripts/tokenLedger.mjs
 *
 * Reads exact `input_tokens`, `cache_read_tokens` and `output_tokens` directly from
 * conversation `transcript.jsonl` logs (including any spawned subagent transcripts),
 * tracks per-Issue deltas against S/M/L single-agent budgets, updates
 * `docs/adr/TOKEN_LEDGER.md`, and publishes structured reports onto GitHub Issues.
 *
 * Usage:
 *   npm run task:start -- <issueNumber> [--tier S|M|L] [--task TASK-XXX-01] [--conv <uuid>]
 *   npm run task:status -- [<issueNumber>]
 *   npm run task:close -- <issueNumber> [--commit <sha>] [--summary "<testo>"]
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const ROOT_DIR = path.resolve(__dirname, '..');

export const BUDGET_TIERS = Object.freeze({
  S: {
    tier: 'S',
    label: 'S (Piccolo)',
    maxNewInputTokens: 150000,
    maxOutputTokens: 15000,
    description: '<=150k input nuovi (1 agente singolo, zero swarm)'
  },
  M: {
    tier: 'M',
    label: 'M (Medio)',
    maxNewInputTokens: 400000,
    maxOutputTokens: 35000,
    description: '<=400k input nuovi (1 agente singolo, zero swarm)'
  },
  L: {
    tier: 'L',
    label: 'L (Grande)',
    maxNewInputTokens: 800000,
    maxOutputTokens: 60000,
    description: '<=800k input nuovi (1 agente singolo, zero swarm)'
  }
});

export function getDefaultBrainDir() {
  return process.env.BASILICO_BRAIN_DIR || path.join(os.homedir(), '.gemini/antigravity/brain');
}

export function getDefaultLedgerStatePath() {
  return process.env.BASILICO_LEDGER_STATE_PATH || path.join(ROOT_DIR, 'data/cache/token_ledger.json');
}

export function getDefaultLedgerMarkdownPath() {
  return process.env.BASILICO_LEDGER_MD_PATH || path.join(ROOT_DIR, 'docs/adr/TOKEN_LEDGER.md');
}

function writeFileAtomic(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, content, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

export function formatInt(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('it-IT');
}

/**
 * Extracts child subagent conversation UUIDs referenced inside a transcript log.
 */
export function extractChildConversationIds(rawContent, excludeConvId = null) {
  if (!rawContent) return [];
  const normalized = String(rawContent).replace(/\\"/g, '"');
  const found = new Set();
  const patterns = [
    /"conversation_id"\s*:\s*"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"/gi,
    /subagent[^"\n]{0,80}?id\s*(?:=|:)?\s*"?([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})"?/gi,
    /\bsender=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/gi
  ];
  for (const rx of patterns) {
    let m;
    while ((m = rx.exec(normalized)) !== null) {
      const candidate = String(m[1]).toLowerCase();
      if (!excludeConvId || candidate !== String(excludeConvId).toLowerCase()) {
        found.add(candidate);
      }
    }
  }
  return Array.from(found).sort();
}

/**
 * Reads exact token counters from one `transcript.jsonl` file.
 */
export function readSingleTranscriptUsage(jsonlPath) {
  const result = {
    steps: 0,
    input_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 0
  };
  if (!jsonlPath || !fs.existsSync(jsonlPath)) {
    return result;
  }

  const raw = fs.readFileSync(jsonlPath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed);
      if ('input_tokens' in entry || 'output_tokens' in entry) {
        result.steps += 1;
        result.input_tokens += Number(entry.input_tokens) || 0;
        result.cache_read_tokens += Number(entry.cache_read_tokens) || 0;
        result.output_tokens += Number(entry.output_tokens) || 0;
      }
    } catch (_) {
      // Ignore malformed/partial trailing JSONL line cleanly
    }
  }
  return result;
}

/**
 * Aggregates exact token usage across a conversation and any child subagent transcripts
 * discovered in its log (deduplicated via `visited` set).
 */
export function readConversationTokenUsage(convId, brainDir = getDefaultBrainDir()) {
  const empty = {
    convId: convId || null,
    steps: 0,
    input_tokens: 0,
    cache_read_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    subagentIds: [],
    perAgent: {}
  };
  if (!convId || !brainDir) return empty;

  const queue = [String(convId)];
  const visited = new Set();
  const subagentIds = [];
  const perAgent = {};

  while (queue.length > 0) {
    const currentId = queue.shift();
    const normId = currentId.toLowerCase();
    if (visited.has(normId)) continue;

    const logsDir = path.join(brainDir, currentId, '.system_generated', 'logs');
    const compactPath = path.join(logsDir, 'transcript.jsonl');
    const fullPath = path.join(logsDir, 'transcript_full.jsonl');

    if (!fs.existsSync(compactPath)) {
      continue;
    }

    visited.add(normId);
    if (normId !== String(convId).toLowerCase()) {
      subagentIds.push(currentId);
    }

    const usage = readSingleTranscriptUsage(compactPath);
    perAgent[currentId] = usage;
    empty.steps += usage.steps;
    empty.input_tokens += usage.input_tokens;
    empty.cache_read_tokens += usage.cache_read_tokens;
    empty.output_tokens += usage.output_tokens;

    // Scan compact and (if present) full log for any referenced child subagent UUIDs
    const scanFiles = [compactPath];
    if (fs.existsSync(fullPath)) scanFiles.push(fullPath);
    for (const scanFile of scanFiles) {
      try {
        const rawText = fs.readFileSync(scanFile, 'utf8');
        for (const childId of extractChildConversationIds(rawText, currentId)) {
          if (!visited.has(childId.toLowerCase())) {
            queue.push(childId);
          }
        }
      } catch (_) {}
    }
  }

  empty.subagentIds = subagentIds.sort();
  empty.perAgent = perAgent;
  empty.total_tokens = empty.input_tokens + empty.cache_read_tokens + empty.output_tokens;
  return empty;
}

/**
 * Finds the most recently updated conversation directory inside `brainDir`.
 */
export function detectActiveConversationId(brainDir = getDefaultBrainDir()) {
  if (!brainDir || !fs.existsSync(brainDir)) return null;
  let bestId = null;
  let bestMtime = -1;

  for (const entry of fs.readdirSync(brainDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const logPath = path.join(brainDir, entry.name, '.system_generated', 'logs', 'transcript.jsonl');
    if (!fs.existsSync(logPath)) continue;
    try {
      const stat = fs.statSync(logPath);
      if (stat.mtimeMs > bestMtime) {
        bestMtime = stat.mtimeMs;
        bestId = entry.name;
      }
    } catch (_) {}
  }

  return bestId;
}

export function loadLedgerState(ledgerStatePath = getDefaultLedgerStatePath()) {
  try {
    if (fs.existsSync(ledgerStatePath)) {
      const parsed = JSON.parse(fs.readFileSync(ledgerStatePath, 'utf8'));
      return {
        activeTask: parsed.activeTask || null,
        completedTasks: Array.isArray(parsed.completedTasks) ? parsed.completedTasks : []
      };
    }
  } catch (_) {}
  return { activeTask: null, completedTasks: [] };
}

function normalizeTier(tier) {
  const upper = String(tier || 'M').trim().toUpperCase();
  if (!BUDGET_TIERS[upper]) {
    throw new Error(`Fascia budget non valida "${tier}". Usa S, M o L.`);
  }
  return upper;
}

function normalizeBaseline(raw) {
  const steps = Number(raw?.steps) || 0;
  const input_tokens = Number(raw?.input_tokens) || 0;
  const cache_read_tokens = Number(raw?.cache_read_tokens) || 0;
  const output_tokens = Number(raw?.output_tokens) || 0;
  const subagentIds = Array.isArray(raw?.subagentIds) ? raw.subagentIds : [];
  const subagentsCount =
    typeof raw?.subagentsCount === 'number'
      ? raw.subagentsCount
      : typeof raw?.subagents === 'number'
        ? raw.subagents
        : subagentIds.length;
  return {
    steps,
    input_tokens,
    cache_read_tokens,
    output_tokens,
    subagentIds,
    subagentsCount
  };
}

function runGh(args) {
  return execFileSync('gh', args, {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 12000
  });
}

function updateGithubIssueLabels(issueNumber, { add = [], remove = [] } = {}) {
  try {
    for (const lbl of remove) {
      try {
        runGh(['issue', 'edit', String(issueNumber), '--remove-label', lbl]);
      } catch (_) {}
    }
    if (add.length > 0) {
      runGh(['issue', 'edit', String(issueNumber), '--add-label', add.join(',')]);
    }
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Starts token tracking for one GitHub Issue (`npm run task:start -- <issue>`).
 */
export function startTaskTracking(options = {}) {
  const issueNumber = Number(options.issueNumber);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
    throw new Error('Numero GitHub Issue non valido (es. 46).');
  }

  const tier = normalizeTier(options.tier || 'M');
  const brainDir = options.brainDir || getDefaultBrainDir();
  const ledgerStatePath = options.ledgerStatePath || getDefaultLedgerStatePath();
  const convId = options.convId || detectActiveConversationId(brainDir);

  if (!convId) {
    throw new Error(`Nessuna conversazione trovata in ${brainDir}`);
  }

  const baseline = options.baselineOverride
    ? normalizeBaseline(options.baselineOverride)
    : normalizeBaseline(readConversationTokenUsage(convId, brainDir));

  const taskId = String(options.taskId || `ISSUE-${issueNumber}`).trim();
  const state = loadLedgerState(ledgerStatePath);

  const activeTask = {
    issueNumber,
    taskId,
    tier,
    convId,
    startedAt: new Date().toISOString(),
    baseline
  };

  state.activeTask = activeTask;
  writeFileAtomic(ledgerStatePath, JSON.stringify(state, null, 2));

  let githubUpdated = false;
  if (!options.skipGithub) {
    githubUpdated = updateGithubIssueLabels(issueNumber, {
      remove: ['status:planned'],
      add: ['status:in-progress']
    });
  }

  return {
    activeTask,
    tierInfo: BUDGET_TIERS[tier],
    githubUpdated
  };
}

/**
 * Computes live token delta for the currently tracked task.
 */
export function getTaskLiveStatus(options = {}) {
  const brainDir = options.brainDir || getDefaultBrainDir();
  const ledgerStatePath = options.ledgerStatePath || getDefaultLedgerStatePath();
  const state = loadLedgerState(ledgerStatePath);

  const task = state.activeTask;
  if (!task) {
    return { active: false, task: null };
  }
  if (options.issueNumber != null && Number(options.issueNumber) !== Number(task.issueNumber)) {
    throw new Error(
      `Il task attivo è #${task.issueNumber} (${task.taskId}), non #${options.issueNumber}.`
    );
  }

  const current = readConversationTokenUsage(task.convId, brainDir);
  const base = normalizeBaseline(task.baseline);

  const delta = {
    steps: Math.max(0, current.steps - base.steps),
    input_tokens: Math.max(0, current.input_tokens - base.input_tokens),
    cache_read_tokens: Math.max(0, current.cache_read_tokens - base.cache_read_tokens),
    output_tokens: Math.max(0, current.output_tokens - base.output_tokens),
    newSubagents: Math.max(0, current.subagentIds.length - base.subagentsCount)
  };
  delta.total_tokens = delta.input_tokens + delta.cache_read_tokens + delta.output_tokens;

  const tierInfo = BUDGET_TIERS[task.tier] || BUDGET_TIERS.M;
  const budgetPct = Number(((delta.input_tokens / tierInfo.maxNewInputTokens) * 100).toFixed(1));

  return {
    active: true,
    task,
    baseline: base,
    current,
    delta,
    tierInfo,
    budgetPct,
    overBudget: delta.input_tokens > tierInfo.maxNewInputTokens
  };
}

const DEFAULT_LEDGER_HEADER = `# Registro Storico Consumi Token (Token Ledger) — Basilico

Questo file traccia in modo trasparente e riproducibile i **token reali consumati** per ciascun intervento su GitHub, letti direttamente dai log \`transcript.jsonl\` tramite \`scripts/tokenLedger.mjs\`.

## Riferimento Storico Pre-Governance (Sessione \`/swarm\`)

| Periodo / Scope | Modalità | Sub-agenti | Steps | Input Nuovi | Cache Read | Output | Note |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| Issues \`#39\`–\`#45\` (Wave V2 + Restyling Oggi) | \`/swarm\` multi-agente | 11 | 742 | 12.863.646 | 115.890.324 | 911.622 | Baseline storica da non ripetere (\`ADR-0016\`) |

---

## Consumi per Singola GitHub Issue (Protocollo \`ADR-0016\`: 1 Issue = 1 Agente Singolo)

| Issue | Task ID | Taglia | Steps | Input Nuovi | Cache Read | Output | % Budget Input | Sub-agenti Extra | Commit | Data |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
`;

export function upsertMarkdownLedgerRow(ledgerMarkdownPath, rowObj) {
  let content = fs.existsSync(ledgerMarkdownPath)
    ? fs.readFileSync(ledgerMarkdownPath, 'utf8')
    : DEFAULT_LEDGER_HEADER;

  if (!content.includes('| Issue | Task ID |')) {
    content = `${content.trimEnd()}\n\n${DEFAULT_LEDGER_HEADER}`;
  }

  const issueLink = `[#${rowObj.issueNumber}](https://github.com/Noobucodonosor/basilico/issues/${rowObj.issueNumber})`;
  const commitCell = rowObj.commitHash ? `\`${rowObj.commitHash.slice(0, 7)}\`` : '—';
  const dateStr = (rowObj.closedAt || new Date().toISOString()).slice(0, 10);
  const newRow = `| ${issueLink} | \`${rowObj.taskId}\` | \`budget:${rowObj.tier}\` | ${formatInt(rowObj.steps)} | ${formatInt(rowObj.input_tokens)} | ${formatInt(rowObj.cache_read_tokens)} | ${formatInt(rowObj.output_tokens)} | ${rowObj.budgetPct}% | ${rowObj.newSubagents} | ${commitCell} | ${dateStr} |`;

  const lines = content.split(/\r?\n/);
  const issuePattern = new RegExp(`^\\|\\s*(?:\\[#${rowObj.issueNumber}\\]|#${rowObj.issueNumber}\\b)`);
  const existingIdx = lines.findIndex((l) => issuePattern.test(l));
  if (existingIdx !== -1) {
    lines[existingIdx] = newRow;
    content = lines.join('\n');
  } else {
    content = `${content.trimEnd()}\n${newRow}\n`;
  }

  writeFileAtomic(ledgerMarkdownPath, content);
  return newRow;
}

export function formatGithubTokenReport(closure) {
  const { task, delta, tierInfo, budgetPct, overBudget, commitHash, summary } = closure;
  const statusTag = overBudget ? '⚠️ Sopra soglia stimata' : '✅ Entro budget';
  const lines = [
    `## 📊 Rendiconto Reale Token & Chiusura Task (\`${task.taskId}\`)`,
    '',
    summary ? `**Sintesi intervento:** ${summary}` : '',
    summary ? '' : '',
    `| Metrica | Valore Misurato (da \`transcript.jsonl\`) |`,
    `| :--- | :--- |`,
    `| **Conversazione** | \`${task.convId}\` |`,
    `| **Taglia Budget** | \`budget:${task.tier}\` — ${tierInfo.description} |`,
    `| **Esito Budget Input** | **${budgetPct}%** utilizzato (${statusTag}) |`,
    `| **Steps Esecutivi** | ${formatInt(delta.steps)} |`,
    `| **Input Nuovi** | **${formatInt(delta.input_tokens)}** / ${formatInt(tierInfo.maxNewInputTokens)} |`,
    `| **Cache Read** | ${formatInt(delta.cache_read_tokens)} |`,
    `| **Output Generato** | **${formatInt(delta.output_tokens)}** (riferimento <= ${formatInt(tierInfo.maxOutputTokens)}) |`,
    `| **Sub-agenti Extra** | ${delta.newSubagents} |`,
    commitHash ? `| **Commit Locale** | \`${commitHash}\` |` : '',
    '',
    `_Misurazione deterministica eseguita da \`scripts/tokenLedger.mjs\` (` +
      `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC)._`
  ].filter((l) => l !== null && l !== undefined);

  // Collapse consecutive empty strings cleanly
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}

/**
 * Closes tracking for an Issue, records exact deltas in `TOKEN_LEDGER.md`
 * and (unless `skipGithub`) posts the report onto the GitHub Issue.
 */
export function closeTaskTracking(options = {}) {
  const brainDir = options.brainDir || getDefaultBrainDir();
  const ledgerStatePath = options.ledgerStatePath || getDefaultLedgerStatePath();
  const ledgerMarkdownPath = options.ledgerMarkdownPath || getDefaultLedgerMarkdownPath();

  const live = getTaskLiveStatus({
    issueNumber: options.issueNumber,
    brainDir,
    ledgerStatePath
  });
  if (!live.active) {
    throw new Error('Nessun task attivo in data/cache/token_ledger.json. Esegui prima `npm run task:start -- <issue>`.');
  }

  const commitHash = String(options.commitHash || '').trim();
  const summary = String(options.summary || '').trim();
  const closedAt = new Date().toISOString();

  const rowObj = {
    issueNumber: live.task.issueNumber,
    taskId: live.task.taskId,
    tier: live.task.tier,
    steps: live.delta.steps,
    input_tokens: live.delta.input_tokens,
    cache_read_tokens: live.delta.cache_read_tokens,
    output_tokens: live.delta.output_tokens,
    budgetPct: live.budgetPct,
    newSubagents: live.delta.newSubagents,
    commitHash,
    closedAt
  };

  const markdownRow = upsertMarkdownLedgerRow(ledgerMarkdownPath, rowObj);
  const reportBody = formatGithubTokenReport({
    ...live,
    commitHash,
    summary
  });

  let githubCommented = false;
  let githubLabelsUpdated = false;
  if (!options.skipGithub) {
    try {
      runGh(['issue', 'comment', String(live.task.issueNumber), '--body', reportBody]);
      githubCommented = true;
    } catch (_) {
      githubCommented = false;
    }
    githubLabelsUpdated = updateGithubIssueLabels(live.task.issueNumber, {
      remove: ['status:in-progress'],
      add: ['status:taste-check']
    });
  }

  const state = loadLedgerState(ledgerStatePath);
  state.completedTasks.push({
    ...rowObj,
    convId: live.task.convId,
    startedAt: live.task.startedAt,
    summary
  });
  state.activeTask = null;
  writeFileAtomic(ledgerStatePath, JSON.stringify(state, null, 2));

  return {
    ...live,
    commitHash,
    summary,
    closedAt,
    markdownRow,
    reportBody,
    githubCommented,
    githubLabelsUpdated
  };
}

function parseCliArgs(argv) {
  const args = argv.slice(2);
  const cmd = args[0];
  const flags = {};
  const positional = [];

  for (let i = 1; i < args.length; i++) {
    const tok = args[i];
    if (tok.startsWith('--')) {
      const key = tok.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(tok);
    }
  }
  return { cmd, positional, flags };
}

function runCli() {
  const { cmd, positional, flags } = parseCliArgs(process.argv);
  const skipGithub = Boolean(flags['skip-github']);

  if (cmd === 'start') {
    const issueNumber = Number(positional[0] || flags.issue);
    const res = startTaskTracking({
      issueNumber,
      tier: flags.tier || 'M',
      taskId: flags.task || `ISSUE-${issueNumber}`,
      convId: flags.conv,
      skipGithub
    });
    console.log(
      `✅ Tracking avviato su Issue #${res.activeTask.issueNumber} (${res.activeTask.taskId}, budget:${res.activeTask.tier} <= ${formatInt(res.tierInfo.maxNewInputTokens)} input nuovi)`
    );
    console.log(
      `   Baseline (${res.activeTask.convId}): ${formatInt(res.activeTask.baseline.steps)} steps · ${formatInt(res.activeTask.baseline.input_tokens)} input · ${formatInt(res.activeTask.baseline.cache_read_tokens)} cache · ${formatInt(res.activeTask.baseline.output_tokens)} output`
    );
    return;
  }

  if (cmd === 'status') {
    const issueArg = positional[0] ? Number(positional[0]) : undefined;
    const res = getTaskLiveStatus({ issueNumber: issueArg });
    if (!res.active) {
      console.log('ℹ️  Nessun task con contatore token attivo. Usa `npm run task:start -- <issue> --tier S|M|L --task TASK-XXX-01`.');
      return;
    }
    console.log(
      `⏱️  Task attivo: #${res.task.issueNumber} (${res.task.taskId}) · Taglia: budget:${res.task.tier} (${res.budgetPct}% usato)`
    );
    console.log(
      `   Delta reale: ${formatInt(res.delta.steps)} steps · ${formatInt(res.delta.input_tokens)} input nuovi · ${formatInt(res.delta.cache_read_tokens)} cache · ${formatInt(res.delta.output_tokens)} output · ${res.delta.newSubagents} subagent extra`
    );
    return;
  }

  if (cmd === 'close') {
    const issueNumber = positional[0] ? Number(positional[0]) : undefined;
    const res = closeTaskTracking({
      issueNumber,
      commitHash: flags.commit || '',
      summary: flags.summary || '',
      skipGithub
    });
    console.log(`🏁 Task #${res.task.issueNumber} (${res.task.taskId}) chiuso.`);
    console.log(
      `   Consumo esatto: ${formatInt(res.delta.steps)} steps · ${formatInt(res.delta.input_tokens)} input nuovi (${res.budgetPct}% di budget:${res.task.tier}) · ${formatInt(res.delta.cache_read_tokens)} cache · ${formatInt(res.delta.output_tokens)} output`
    );
    console.log(`   Ledger aggiornato: ${getDefaultLedgerMarkdownPath()}`);
    console.log(`   GitHub comment: ${res.githubCommented ? 'PUBBLICATO' : 'saltato/offline'}`);
    return;
  }

  console.error('Uso: node scripts/tokenLedger.mjs <start|status|close> <issueNumber> [--tier S|M|L] [--task ID] [--commit SHA] [--summary "..."]');
  process.exit(1);
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  try {
    runCli();
  } catch (err) {
    console.error(`Errore tokenLedger: ${err.message}`);
    process.exit(1);
  }
}
