import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BUDGET_TIERS,
  detectActiveConversationId,
  readConversationTokenUsage,
  startTaskTracking,
  getTaskLiveStatus,
  closeTaskTracking
} from '../../scripts/tokenLedger.mjs';

describe('Unit: Token Ledger & GitHub Accounting (ADR-0016 / TASK-GOV-01)', () => {
  let tmpRoot;
  let brainDir;
  let statePath;
  let mdPath;
  const parentId = '11111111-1111-4111-8111-111111111111';
  const childId = '22222222-2222-4222-8222-222222222222';
  const oldConvId = '99999999-9999-4999-8999-999999999999';

  function writeTranscript(convId, lines) {
    const logDir = path.join(brainDir, convId, '.system_generated', 'logs');
    fs.mkdirSync(logDir, { recursive: true });
    const filePath = path.join(logDir, 'transcript.jsonl');
    fs.writeFileSync(
      filePath,
      lines.map((l) => (typeof l === 'string' ? l : JSON.stringify(l))).join('\n') + '\n',
      'utf8'
    );
    return filePath;
  }

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-token-ledger-'));
    brainDir = path.join(tmpRoot, 'brain');
    statePath = path.join(tmpRoot, 'cache', 'token_ledger.json');
    mdPath = path.join(tmpRoot, 'docs', 'TOKEN_LEDGER.md');

    const oldLog = writeTranscript(oldConvId, [
      { step_index: 1, input_tokens: 500, cache_read_tokens: 1000, output_tokens: 50 }
    ]);
    const pastTime = new Date(Date.now() - 60000);
    fs.utimesSync(oldLog, pastTime, pastTime);

    writeTranscript(parentId, [
      { step_index: 1, source: 'USER_INPUT', content: 'start' },
      { step_index: 2, input_tokens: 12000, cache_read_tokens: 80000, output_tokens: 600 },
      '{corrupt-trailing-line',
      { step_index: 3, input_tokens: 8000, cache_read_tokens: 40000, output_tokens: 400 }
    ]);
  });

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('1. detectActiveConversationId picks the most recently modified conversation directory', () => {
    const detected = detectActiveConversationId(brainDir);
    assert.equal(detected, parentId);
  });

  it('2. readConversationTokenUsage sums parent + referenced child subagent tokens accurately without double-counting', () => {
    writeTranscript(childId, [
      { step_index: 1, input_tokens: 3000, cache_read_tokens: 15000, output_tokens: 250 },
      { step_index: 2, input_tokens: 2000, cache_read_tokens: 10000, output_tokens: 150 }
    ]);

    const parentLog = path.join(brainDir, parentId, '.system_generated', 'logs', 'transcript.jsonl');
    fs.appendFileSync(
      parentLog,
      JSON.stringify({
        step_index: 4,
        content: `Tool returned {"conversation_id":"${childId}","status":"done"}`
      }) + '\n'
    );

    const usage = readConversationTokenUsage(parentId, brainDir);
    assert.equal(usage.steps, 4);
    assert.equal(usage.input_tokens, 25000); // 12k + 8k + 3k + 2k
    assert.equal(usage.cache_read_tokens, 145000); // 80k + 40k + 15k + 10k
    assert.equal(usage.output_tokens, 1400); // 600 + 400 + 250 + 150
    assert.deepEqual(usage.subagentIds, [childId]);
  });

  it('3. start -> live status -> close calculates exact token delta and updates TOKEN_LEDGER.md idempotently', () => {
    const startRes = startTaskTracking({
      issueNumber: 77,
      taskId: 'TASK-CICLO-01',
      tier: 'M',
      convId: parentId,
      brainDir,
      ledgerStatePath: statePath,
      skipGithub: true
    });

    assert.equal(startRes.activeTask.baseline.steps, 2);
    assert.equal(startRes.activeTask.baseline.input_tokens, 20000);
    assert.equal(startRes.tierInfo.maxNewInputTokens, BUDGET_TIERS.M.maxNewInputTokens);

    // Simulate 2 new steps + 1 child subagent created during the task
    writeTranscript(childId, [
      { step_index: 1, input_tokens: 5000, cache_read_tokens: 20000, output_tokens: 300 }
    ]);
    const parentLog = path.join(brainDir, parentId, '.system_generated', 'logs', 'transcript.jsonl');
    fs.appendFileSync(
      parentLog,
      [
        JSON.stringify({
          step_index: 4,
          input_tokens: 10000,
          cache_read_tokens: 50000,
          output_tokens: 700,
          content: `Spawned subagent with conversation_id "${childId}"`
        }),
        JSON.stringify({
          step_index: 5,
          input_tokens: 5000,
          cache_read_tokens: 30000,
          output_tokens: 300
        })
      ].join('\n') + '\n'
    );

    const live = getTaskLiveStatus({
      issueNumber: 77,
      brainDir,
      ledgerStatePath: statePath
    });
    assert.equal(live.active, true);
    assert.equal(live.delta.steps, 3); // 2 parent steps + 1 subagent step
    assert.equal(live.delta.input_tokens, 20000); // 10k + 5k + 5k
    assert.equal(live.delta.cache_read_tokens, 100000); // 50k + 30k + 20k
    assert.equal(live.delta.output_tokens, 1300); // 700 + 300 + 300
    assert.equal(live.delta.newSubagents, 1);
    assert.equal(live.budgetPct, 5.0); // 20,000 / 400,000 = 5.0%
    assert.equal(live.overBudget, false);

    const closed = closeTaskTracking({
      issueNumber: 77,
      commitHash: 'abc1234def5678',
      summary: 'Navigazione unificata alle 4 Fasi.',
      brainDir,
      ledgerStatePath: statePath,
      ledgerMarkdownPath: mdPath,
      skipGithub: true
    });

    assert.match(closed.reportBody, /20\.000|20,000|20000/);
    assert.match(closed.reportBody, /5%|5\.0%/);
    assert.ok(fs.existsSync(mdPath));
    const mdContent = fs.readFileSync(mdPath, 'utf8');
    assert.match(mdContent, /\[#77\].*`TASK-CICLO-01`.*`budget:M`.*`abc1234`/);

    // After closing, activeTask is cleared
    const postClose = getTaskLiveStatus({ brainDir, ledgerStatePath: statePath });
    assert.equal(postClose.active, false);

    // Baseline override preserves subagents count across getTaskLiveStatus reads
    const preChildStart = startTaskTracking({
      issueNumber: 88,
      taskId: 'TASK-GOV-SUB',
      tier: 'S',
      convId: parentId,
      brainDir,
      ledgerStatePath: statePath,
      baselineOverride: {
        steps: 4,
        input_tokens: 35000,
        cache_read_tokens: 200000,
        output_tokens: 2000,
        subagents: 1
      },
      skipGithub: true
    });
    assert.equal(preChildStart.activeTask.baseline.subagentsCount, 1);
    const liveOverride = getTaskLiveStatus({
      issueNumber: 88,
      brainDir,
      ledgerStatePath: statePath
    });
    assert.equal(liveOverride.delta.newSubagents, 0);
  });
});
