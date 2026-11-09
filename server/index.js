/**
 * Basilico — Supermarket Offers Application
 * Location: server/index.js
 *
 * Master Express application factory, middleware configuration, security guards,
 * API route orchestration, and SPA fallback handling.
 */

import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Route modules (M2 + ADR-0007..0012)
import storesRouter from './routes/stores.js';
import offersRouter from './routes/offers.js';
import flyersRouter from './routes/flyers.js';
import statusRouter from './routes/status.js';
import pricesRouter from './routes/prices.js';
import profilesRouter from './routes/profiles.js';
import creaRouter from './routes/crea.js';
import pantryRouter from './routes/pantry.js';
import receiptsRouter from './routes/receipts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const PROJECT_ROOT = path.resolve(__dirname, '..');
export const DEFAULT_DIST_DIR = path.resolve(PROJECT_ROOT, 'dist');

/**
 * Sanitizes and normalizes requested static file paths to prevent directory traversal.
 * Complies with Contract 9.7 in tests/integration/startup_verification.test.js.
 */
export function sanitizeStaticPath(requestedPath, baseDir) {
  let normalizedReq = String(requestedPath || '').replace(/\\/g, '/');

  // Iteratively decode to uncover multi-layer URL encoding (%252e -> %2e -> .)
  let prev = '';
  let iterations = 0;
  while (normalizedReq !== prev && iterations < 5) {
    prev = normalizedReq;
    iterations++;
    try {
      normalizedReq = decodeURIComponent(normalizedReq);
    } catch (_) {
      break;
    }
  }

  // Reject paths containing sequences of 2 or more dots (directory traversal or dot-collapse)
  if (/\.{2,}/.test(normalizedReq) || /\.{2,}/.test(String(requestedPath || ''))) {
    throw new Error('Access denied: Path traversal detected');
  }

  const safePath = path.normalize(path.join(baseDir, normalizedReq));
  if (!safePath.startsWith(baseDir)) {
    throw new Error('Access denied: Path traversal detected');
  }
  return safePath;
}

/**
 * Validates whether a request path is an SPA frontend route rather than an API route.
 * Complies with Contract 9.6 in tests/integration/startup_verification.test.js.
 */
export function isSpaRoute(reqPath) {
  return !reqPath.startsWith('/api/') && !reqPath.startsWith('/api');
}

/**
 * Central JSON error handling middleware.
 * Traps syntax errors from express.json() and generic runtime faults.
 * Dual-mode: acts as Express middleware (err, req, res, next) and test oracle (returns { status, body }).
 * Complies with Contract 9.9 in tests/integration/startup_verification.test.js.
 */
export function errorHandler(err, req, res, next) {
  if (err instanceof SyntaxError && (err.status === 400 || err.statusCode === 400) && 'body' in err) {
    if (res && typeof res.status === 'function') {
      return res.status(400).json({ error: 'Invalid JSON payload' });
    }
    return { status: 400, body: { error: 'Invalid JSON payload' } };
  }

  const status = typeof err?.status === 'number'
    ? err.status
    : (typeof err?.statusCode === 'number' ? err.statusCode : 500);
  const message = status === 500 ? 'Internal Server Error' : (err?.message || 'Error');

  if (res && typeof res.status === 'function') {
    return res.status(status).json({ error: message });
  }
  return { status, body: { error: message } };
}

/**
 * Responsive fallback HTML template served when dist/index.html is not yet built.
 * Contains standard mobile viewport meta configuration (F10 / Scenario 6).
 */
export function getFallbackHtml() {
  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Basilico — Rapallo Volantini & Promozioni</title>
  <style>
    :root {
      --primary: #15803d;
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --text: #0f172a;
      --muted: #64748b;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: var(--bg);
      color: var(--text);
      line-height: 1.5;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      min-height: 100vh;
    }
    .container {
      max-width: 680px;
      width: 100%;
      margin: 2rem auto;
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 1rem;
      padding: 2rem;
      box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
    }
    .header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      margin-bottom: 1rem;
    }
    .badge {
      display: inline-block;
      background: #dcfce7;
      color: #166534;
      font-size: 0.75rem;
      font-weight: 700;
      padding: 0.25rem 0.6rem;
      border-radius: 9999px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    h1 { font-size: 1.5rem; font-weight: 700; color: var(--primary); }
    p { color: var(--muted); margin-bottom: 1.25rem; font-size: 0.95rem; }
    .status-panel {
      background: #f1f5f9;
      border-radius: 0.5rem;
      padding: 1rem;
      margin-bottom: 1.5rem;
      font-size: 0.875rem;
    }
    .endpoints {
      display: grid;
      grid-template-columns: 1fr;
      gap: 0.5rem;
      margin-top: 1rem;
    }
    .endpoint-link {
      display: flex;
      justify-content: space-between;
      padding: 0.5rem 0.75rem;
      background: #ffffff;
      border: 1px solid var(--border);
      border-radius: 0.375rem;
      text-decoration: none;
      color: var(--text);
      font-family: monospace;
      font-size: 0.85rem;
      transition: border-color 0.15s;
    }
    .endpoint-link:hover { border-color: var(--primary); color: var(--primary); }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <span class="badge">Rapallo 16035</span>
      <h1>🌱 Basilico — Supermercati & Volantini</h1>
    </div>
    <p>Applicazione per il monitoraggio delle offerte e dei volantini dei supermercati di Rapallo (Coop, Carrefour, Conad, Basko, Doro).</p>
    <div class="status-panel">
      <strong>Stato Server:</strong> Online (Porta attiva)<br/>
      <strong>Modalità:</strong> Backend REST API attivo & UI Shell pronta
    </div>
    <h3>API Endpoints Rapallo:</h3>
    <div class="endpoints">
      <a class="endpoint-link" href="/api/stores"><span>GET /api/stores</span> <span>Supermercati</span></a>
      <a class="endpoint-link" href="/api/offers"><span>GET /api/offers</span> <span>Promozioni</span></a>
      <a class="endpoint-link" href="/api/flyers"><span>GET /api/flyers</span> <span>Volantini</span></a>
      <a class="endpoint-link" href="/api/status"><span>GET /api/status</span> <span>Stato Ingestion</span></a>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Creates and configures the Express application instance.
 */
export function createApp(options = {}) {
  const app = express();
  const distDir = options.distDir || DEFAULT_DIST_DIR;

  // 1. Core Parsers & Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Security headers & path traversal guard for static requests
  app.use((req, res, next) => {
    // Basic security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');

    // Test for directory traversal attempts in URL path
    try {
      const pathname = (req.path || '').split('?')[0];
      const rawPathname = (req.originalUrl || req.url || req.path || '').split('?')[0];

      // Decode iteratively until fully decoded to catch multi-encoding (%252e%252e -> %2e%2e -> ..)
      let decoded = rawPathname;
      let prev = '';
      let iterations = 0;
      while (decoded !== prev && iterations < 5) {
        prev = decoded;
        iterations++;
        try {
          decoded = decodeURIComponent(decoded);
        } catch (_) {
          break;
        }
      }

      let decodedReqPath = pathname;
      prev = '';
      iterations = 0;
      while (decodedReqPath !== prev && iterations < 5) {
        prev = decodedReqPath;
        iterations++;
        try {
          decodedReqPath = decodeURIComponent(decodedReqPath);
        } catch (_) {
          break;
        }
      }

      // Detect sequences of 2 or more dots (../, ...., dot-collapse, etc.)
      if (
        /\.{2,}/.test(pathname) ||
        /\.{2,}/.test(rawPathname) ||
        /\.{2,}/.test(decoded) ||
        /\.{2,}/.test(decodedReqPath)
      ) {
        return res.status(403).json({ error: 'Access denied: Path traversal detected' });
      }

      // Check path normalization against distDir
      sanitizeStaticPath(decoded, distDir);

      next();
    } catch (err) {
      return res.status(403).json({ error: 'Access denied: Path traversal detected' });
    }
  });

  // 2. Mount REST API Routes on /api prefix
  // Contract 9.5: /api/stores, /api/offers, /api/flyers, /api/status, /api/sync
  if (storesRouter) app.use('/api/stores', storesRouter);
  if (offersRouter) app.use('/api/offers', offersRouter);
  if (flyersRouter) app.use('/api/flyers', flyersRouter);
  if (pricesRouter) app.use('/api/prices', pricesRouter);
  if (profilesRouter) app.use('/api/profiles', profilesRouter);
  if (creaRouter) app.use('/api/crea', creaRouter);
  if (pantryRouter) app.use('/api/pantry', pantryRouter);
  if (receiptsRouter) app.use('/api/receipts', receiptsRouter);
  if (statusRouter) {
    app.use('/api/status', statusRouter);
    app.use('/api/sync', statusRouter);
  }

  // API 404 Handler (ensures /api/* unhandled requests return JSON, not HTML)
  app.all('/api/*', (req, res) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`
    });
  });
  app.all('/api', (req, res) => {
    res.status(404).json({
      error: `API endpoint not found: ${req.method} ${req.path}`
    });
  });

  // 3. Static Asset Serving (dist/)
  if (fs.existsSync(distDir)) {
    app.use(express.static(distDir, { index: false, fallthrough: true }));
  }

  // 4. SPA Fallback Handler
  // Any GET request not matching /api is routed to index.html or fallback UI shell
  app.get('*', (req, res, next) => {
    if (!isSpaRoute(req.path)) {
      return next();
    }

    const indexHtmlPath = path.join(distDir, 'index.html');
    if (fs.existsSync(indexHtmlPath)) {
      try {
        const safePath = sanitizeStaticPath('index.html', distDir);
        return res.sendFile(safePath);
      } catch (err) {
        return next(err);
      }
    }

    // Serve graceful responsive UI shell if dist/index.html is not present
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(getFallbackHtml());
  });

  // 5. Central Error Handling Middleware (Contract 9.9)
  app.use(errorHandler);

  return app;
}

export const app = createApp();
export default app;
