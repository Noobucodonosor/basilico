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
const DEFAULT_CACHE_DIR = path.resolve(__dirname, '../../data/cache');
export const AGENTATION_JSON_PATH = path.join(DEFAULT_CACHE_DIR, 'agentation_inbox.json');
export const AGENTATION_MD_PATH = path.join(DEFAULT_CACHE_DIR, 'agentation_inbox.md');

const MAX_BATCH_ANNOTATIONS = 100;
const MAX_STORED_ANNOTATIONS = 500;
const MAX_MARKDOWN_BYTES = 50 * 1024;
const MAX_COMMENT_LENGTH = 4000;

function resolveInboxPaths(options = {}) {
  const jsonPath =
    options.jsonPath || process.env.BASILICO_AGENTATION_JSON_PATH || AGENTATION_JSON_PATH;
  const mdPath =
    options.mdPath ||
    process.env.BASILICO_AGENTATION_MD_PATH ||
    path.join(path.dirname(jsonPath), 'agentation_inbox.md');
  return { jsonPath, mdPath, dir: path.dirname(jsonPath) };
}

function writeAtomicFileSync(targetPath, content) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const nonce = Math.random().toString(36).slice(2, 8);
  const tmpPath = `${targetPath}.tmp.${process.pid}.${Date.now()}.${nonce}`;
  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
    fs.renameSync(tmpPath, targetPath);
  } catch (err) {
    try {
      if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    } catch (_) {}
    throw err;
  }
}

export function readAgentationInbox(options = {}) {
  const { jsonPath } = resolveInboxPaths(options);
  try {
    if (fs.existsSync(jsonPath)) {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
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
    const cleanComment = String(item.comment || '(Senza commento)').slice(0, MAX_COMMENT_LENGTH);
    lines.push(`## ${idx + 1}. [${String(item.intent || 'change').toUpperCase()}] ${cleanComment}`);
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

export function writeAgentationInbox(items = [], options = {}) {
  const { jsonPath, mdPath } = resolveInboxPaths(options);
  const boundedItems = Array.isArray(items) ? items.slice(-MAX_STORED_ANNOTATIONS) : [];
  const payload = {
    updatedAt: new Date().toISOString(),
    pendingCount: boundedItems.filter((i) => i.status !== 'resolved').length,
    items: boundedItems
  };
  writeAtomicFileSync(jsonPath, JSON.stringify(payload, null, 2));
  writeAtomicFileSync(mdPath, renderMarkdownInbox(boundedItems));
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
router.post('/', (req, res, next) => {
  try {
    const body = req.body || {};

    if (Array.isArray(body.annotations) && body.annotations.length > MAX_BATCH_ANNOTATIONS) {
      return res.status(413).json({
        error: `Troppe annotazioni in un singolo invio (max ${MAX_BATCH_ANNOTATIONS})`
      });
    }
    if (typeof body.markdown === 'string' && Buffer.byteLength(body.markdown, 'utf8') > MAX_MARKDOWN_BYTES) {
      return res.status(413).json({
        error: `Payload markdown troppo grande (max ${MAX_MARKDOWN_BYTES} bytes)`
      });
    }

    const inbox = readAgentationInbox();
    const incoming = Array.isArray(body.annotations)
      ? body.annotations
      : body.annotation
        ? [body.annotation]
        : body.id && body.comment !== undefined
          ? [body]
          : [];

    const pageUrl = body.url ? String(body.url).slice(0, 512) : null;
    const byId = new Map(inbox.items.map((item) => [String(item.id), item]));

    for (const raw of incoming) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || `ag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`).slice(0, 128);
      const prev = byId.get(id) || {};
      byId.set(id, {
        ...prev,
        ...raw,
        id,
        comment: raw.comment !== undefined ? String(raw.comment).slice(0, MAX_COMMENT_LENGTH) : prev.comment,
        url: String(raw.url || pageUrl || prev.url || '/').slice(0, 512),
        status: raw.status || prev.status || 'pending',
        savedAt: new Date().toISOString()
      });
    }

    const saved = writeAgentationInbox(Array.from(byId.values()));
    if (typeof body.markdown === 'string' && body.markdown.trim()) {
      const { dir } = resolveInboxPaths();
      writeAtomicFileSync(path.join(dir, 'agentation_last_submit.md'), body.markdown);
    }

    return res.status(201).json({
      ok: true,
      pendingCount: saved.pendingCount,
      totalCount: saved.items.length
    });
  } catch (err) {
    return next(err);
  }
});

// POST /api/agentation/resolve — mark one or all annotations as resolved after agent applies changes
router.post('/resolve', (req, res, next) => {
  try {
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
    return res.json({ ok: true, pendingCount: saved.pendingCount });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/agentation/:id — remove a deleted annotation
router.delete('/:id', (req, res, next) => {
  try {
    const targetId = String(req.params.id || '');
    const inbox = readAgentationInbox();
    const filtered = inbox.items.filter((i) => String(i.id) !== targetId);
    const saved = writeAgentationInbox(filtered);
    return res.json({ ok: true, pendingCount: saved.pendingCount });
  } catch (err) {
    return next(err);
  }
});

export default router;
