/**
 * Basilico — Visual Point-to-Agent Inbox Bridge (`Agentation` v3.1+ Integration)
 * Location: server/routes/agentation.js
 *
 * Persists structured visual DOM/React annotations captured by the `Agentation` toolbar
 * directly into `data/cache/agentation_inbox.json` and `data/cache/agentation_inbox.md`
 * so any coding agent can read exact selectors, React component stacks, nearby text,
 * bounding boxes, and active room URLs without manual copy-paste.
 */

import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, '../../data/cache');
export const AGENTATION_JSON_PATH = path.join(CACHE_DIR, 'agentation_inbox.json');
export const AGENTATION_MD_PATH = path.join(CACHE_DIR, 'agentation_inbox.md');

function ensureCacheDir() {
  if (!fs.existsSync(CACHE_DIR)) {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  }
}

export function readAgentationInbox() {
  try {
    if (fs.existsSync(AGENTATION_JSON_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(AGENTATION_JSON_PATH, 'utf8'));
      if (parsed && Array.isArray(parsed.items)) return parsed;
    }
  } catch (_) {}
  return { updatedAt: null, items: [] };
}

function renderMarkdownInbox(items = []) {
  const pending = items.filter((i) => i.status !== 'resolved');
  const lines = [
    '# Basilico — Agentation Visual Inbox',
    '',
    `Annotazioni in coda da processare: **${pending.length}** (Totale storico: ${items.length})`,
    ''
  ];

  if (pending.length === 0) {
    lines.push('_Nessuna annotazione visiva in attesa._');
    return lines.join('\n');
  }

  for (const [idx, item] of pending.entries()) {
    lines.push(`## ${idx + 1}. [${(item.intent || 'change').toUpperCase()}] ${item.comment || '(Senza commento)'}`);
    lines.push(`- **ID:** \`${item.id}\``);
    lines.push(`- **URL / Stanza:** \`${item.url || '/'}\``);
    lines.push(`- **Elemento:** \`${item.element || 'unknown'}\``);
    lines.push(`- **Path DOM:** \`${item.elementPath || item.fullPath || '-'}\``);
    if (item.reactComponents) {
      lines.push(`- **Stack React:** \`${item.reactComponents}\``);
    }
    if (item.sourceFile) {
      lines.push(`- **Source File:** \`${item.sourceFile}\``);
    }
    if (item.cssClasses) {
      lines.push(`- **Classi CSS:** \`${item.cssClasses}\``);
    }
    if (item.nearbyText) {
      lines.push(`- **Testo vicino:** ${String(item.nearbyText).slice(0, 220)}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function writeAgentationInbox(items = []) {
  ensureCacheDir();
  const payload = {
    updatedAt: new Date().toISOString(),
    pendingCount: items.filter((i) => i.status !== 'resolved').length,
    items
  };
  const tmpPath = `${AGENTATION_JSON_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(payload, null, 2), 'utf8');
  fs.renameSync(tmpPath, AGENTATION_JSON_PATH);
  fs.writeFileSync(AGENTATION_MD_PATH, renderMarkdownInbox(items), 'utf8');
  return payload;
}

const router = express.Router();

// GET /api/agentation — inspect queued visual annotations
router.get('/', (req, res) => {
  const inbox = readAgentationInbox();
  const pendingOnly = req.query.status === 'pending';
  const items = pendingOnly ? inbox.items.filter((i) => i.status !== 'resolved') : inbox.items;
  res.json({
    updatedAt: inbox.updatedAt,
    pendingCount: inbox.items.filter((i) => i.status !== 'resolved').length,
    totalCount: inbox.items.length,
    items
  });
});

// POST /api/agentation — upsert single annotation or batch submission from Agentation toolbar
router.post('/', (req, res) => {
  const body = req.body || {};
  const inbox = readAgentationInbox();
  const incoming = Array.isArray(body.annotations)
    ? body.annotations
    : body.annotation
      ? [body.annotation]
      : body.id && body.comment !== undefined
        ? [body]
        : [];

  const pageUrl = body.url || null;
  const byId = new Map(inbox.items.map((item) => [String(item.id), item]));

  for (const raw of incoming) {
    if (!raw || typeof raw !== 'object') continue;
    const id = String(raw.id || `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`);
    const prev = byId.get(id) || {};
    byId.set(id, {
      ...prev,
      ...raw,
      id,
      url: raw.url || pageUrl || prev.url || '/',
      status: raw.status || prev.status || 'pending',
      savedAt: new Date().toISOString()
    });
  }

  const saved = writeAgentationInbox(Array.from(byId.values()));
  if (typeof body.markdown === 'string' && body.markdown.trim()) {
    ensureCacheDir();
    fs.writeFileSync(path.join(CACHE_DIR, 'agentation_last_submit.md'), body.markdown, 'utf8');
  }

  res.status(201).json({
    ok: true,
    pendingCount: saved.pendingCount,
    totalCount: saved.items.length
  });
});

// POST /api/agentation/resolve — mark one or all annotations as resolved after agent applies changes
router.post('/resolve', (req, res) => {
  const { ids, all } = req.body || {};
  const inbox = readAgentationInbox();
  const targetIds = Array.isArray(ids) ? new Set(ids.map(String)) : null;
  const now = new Date().toISOString();

  const updated = inbox.items.map((item) => {
    if (all === true || (targetIds && targetIds.has(String(item.id)))) {
      return { ...item, status: 'resolved', resolvedAt: now, resolvedBy: 'agent' };
    }
    return item;
  });

  const saved = writeAgentationInbox(updated);
  res.json({ ok: true, pendingCount: saved.pendingCount });
});

// DELETE /api/agentation/:id — remove a deleted annotation
router.delete('/:id', (req, res) => {
  const targetId = String(req.params.id || '');
  const inbox = readAgentationInbox();
  const filtered = inbox.items.filter((i) => String(i.id) !== targetId);
  const saved = writeAgentationInbox(filtered);
  res.json({ ok: true, pendingCount: saved.pendingCount });
});

export default router;
