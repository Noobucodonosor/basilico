/**
 * Basilico — Supermarket Offers Application
 * Location: server.js
 *
 * Root executable entrypoint for single standard command startup:
 * npm start -> node server.js
 *
 * Responsibilities:
 * - Cold-checkout automated build verification check
 * - Port binding with fallback to 3000
 * - Port collision detection
 * - Background warm-up of local cache / seed data
 * - Clean SIGTERM / SIGINT shutdown
 */

import net from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createApp, PROJECT_ROOT, DEFAULT_DIST_DIR } from './server/index.js';
import { ingestionService } from './server/services/ingestionService.js';

/**
 * Resolves target port with default fallback to 3000.
 * Complies with Contract 9.2 & 9.3 in tests/integration/startup_verification.test.js.
 */
export const getTargetPort = (envPort = process.env.PORT) => {
  const parsed = parseInt(envPort, 10);
  return (Number.isFinite(parsed) && parsed >= 0 && parsed < 65536) ? parsed : 3000;
};

/**
 * Verifies if dist/index.html exists.
 * Complies with Contract 9.4.
 */
export const distIndexExists = (distDir = DEFAULT_DIST_DIR) => {
  return fs.existsSync(path.join(distDir, 'index.html'));
};

/**
 * Determines whether automated build should be triggered on cold checkout.
 * Complies with Contract 9.4.
 */
export const shouldTriggerBuild = (distDir = DEFAULT_DIST_DIR) => {
  return !distIndexExists(distDir);
};

/**
 * Probes whether a port is currently available or occupied.
 * Complies with Contract 9.8.
 */
export function checkPortAvailable(port) {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', (err) => {
        if (err.code === 'EADDRINUSE') resolve(false);
        else resolve(true);
      })
      .once('listening', () => {
        tester.close();
        resolve(true);
      })
      .listen(port);
  });
}

/**
 * Automated build verification check on clean checkouts.
 * If dist/index.html is missing and package.json has a build script, run it.
 */
export function checkAndPrepareBuild(distDir = DEFAULT_DIST_DIR) {
  if (shouldTriggerBuild(distDir)) {
    const pkgPath = path.join(PROJECT_ROOT, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        if (pkg.scripts && pkg.scripts.build) {
          console.log('[server] Missing dist/index.html. Running automated build (npm run build)...');
          execSync('npm run build', { stdio: 'inherit', cwd: PROJECT_ROOT });
        } else {
          console.log('[server] No build script configured. Serving responsive UI shell fallback.');
        }
      } catch (err) {
        console.warn('[server] Automated build step failed or skipped:', err.message);
      }
    }
  }
}

export let isClosing = false;

/**
 * Clean shutdown handler for termination signals.
 * Complies with Contract 9.10.
 */
export function gracefulShutdown(signal, server) {
  isClosing = true;
  console.log(`[server] Received ${signal}. Shutting down gracefully...`);

  if (server && typeof server.close === 'function') {
    server.close((err) => {
      if (err) {
        console.error('[server] Error during server close:', err);
        process.exit(1);
      }
      console.log('[server] HTTP listener closed cleanly.');
      process.exit(0);
    });

    // Force exit if connections do not close in 5s
    setTimeout(() => {
      console.error('[server] Forcing shutdown after timeout.');
      process.exit(1);
    }, 5000).unref();
  }

  return { closed: true, signal };
}

/**
 * Main application bootstrapper.
 */
export async function startServer() {
  const port = getTargetPort();

  // 1. Run pre-flight build check for cold checkouts
  checkAndPrepareBuild();

  // 2. Check port availability
  const isAvailable = await checkPortAvailable(port);
  if (!isAvailable) {
    console.error(`[server] FATAL: Port ${port} is already in use by another process.`);
    process.exit(1);
  }

  // 3. Initialize Express app
  const app = createApp();

  // 4. Start HTTP listener
  const server = app.listen(port, () => {
    console.log(`===================================================`);
    console.log(`🌿 Basilico — Supermarket Offers Application`);
    console.log(`📍 Rapallo (GE) Supermarket Promo Engine Online`);
    console.log(`🚀 Server listening: http://localhost:${port}`);
    console.log(`   - Stores API:   http://localhost:${port}/api/stores`);
    console.log(`   - Offers API:   http://localhost:${port}/api/offers`);
    console.log(`   - Flyers API:   http://localhost:${port}/api/flyers`);
    console.log(`   - Status API:   http://localhost:${port}/api/status`);
    console.log(`===================================================`);
  });

  // 5. Warm up ingestion cache asynchronously in the background
  ingestionService.init().catch((err) => {
    console.warn('[server] Background ingestion cache warm-up error:', err.message);
  });

  // 6. Register termination signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM', server));
  process.on('SIGINT', () => gracefulShutdown('SIGINT', server));

  process.on('unhandledRejection', (reason) => {
    console.error('[server] Unhandled Promise Rejection:', reason);
  });

  process.on('uncaughtException', (err) => {
    console.error('[server] Uncaught Exception:', err);
    gracefulShutdown('uncaughtException', server);
  });

  return server;
}

// Automatically start server when executed directly as entrypoint
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  startServer().catch((err) => {
    console.error('[server] Startup failure:', err);
    process.exit(1);
  });
}
