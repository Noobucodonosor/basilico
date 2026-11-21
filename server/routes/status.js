/**
 * Basilico — Supermarket Offers Application
 * Location: server/routes/status.js
 *
 * REST endpoints:
 * - GET /api/status: System health, online flag, cache dataSource, store/flyer/offer counts
 * - POST /api/sync: Ingestion refresh trigger (accepts { force?: boolean })
 */

import express from 'express';
import { ingestionService } from '../services/ingestionService.js';
import { createRateLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const syncRateLimiter = createRateLimiter({
  windowMs: 5 * 60 * 1000,
  maxRequests: 3,
  message: 'Sincronizzazione già eseguita di recente. Riprova tra qualche minuto.'
});

/**
 * Controller handler for GET /api/status
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
export async function getStatusHandler(req, res, next) {
  try {
    const status = await ingestionService.getStatus();

    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json({
      isOnline: typeof status.isOnline === 'boolean' ? status.isOnline : (status.dataSource !== 'seed'),
      dataSource: status.dataSource || 'seed',
      lastSyncTimestamp: status.lastSyncTimestamp || new Date().toISOString(),
      storeCount: typeof status.storeCount === 'number' ? status.storeCount : 5,
      flyerCount: typeof status.flyerCount === 'number' ? status.flyerCount : 0,
      offerCount: typeof status.offerCount === 'number' ? status.offerCount : 0
    });
  } catch (err) {
    console.error('[statusRoute] Error fetching status:', err);
    return res.status(500).json({
      error: 'Failed to fetch status',
      message: err.message
    });
  }
}

/**
 * Controller handler for POST /api/sync
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
export async function postSyncHandler(req, res, next) {
  try {
    const force = Boolean(req.body?.force);
    const deep = Boolean(req.body?.deep);
    const result = deep
      ? await ingestionService.deepSync()
      : await ingestionService.sync(force);

    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json(result);
  } catch (err) {
    console.error('[syncRoute] Error triggering sync:', err);
    return res.status(500).json({
      status: 'error',
      message: err.message,
      errors: [{ message: err.message }]
    });
  }
}

/**
 * Controller handler for GET /api/sync/progress
 * Returns live step-by-step telemetry for SyncStatusModal (ADR-0005)
 */
export async function getSyncProgressHandler(req, res, next) {
  try {
    const progress = ingestionService.getSyncProgress();
    res.setHeader('content-type', 'application/json; charset=utf-8');
    return res.status(200).json(progress);
  } catch (err) {
    return res.status(500).json({
      error: 'Failed to fetch sync progress',
      message: err.message
    });
  }
}

// Support both direct mount (app.use('/api/status', statusRouter), app.use('/api/sync', statusRouter))
// and grouped mount (app.use('/api', statusRouter))
router.get('/', getStatusHandler);
router.get('/status', getStatusHandler);
router.get('/progress', getSyncProgressHandler);
router.get('/sync/progress', getSyncProgressHandler);
router.post('/', syncRateLimiter, postSyncHandler);
router.post('/sync', syncRateLimiter, postSyncHandler);

export default router;
