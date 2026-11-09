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

const router = express.Router();

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
    const result = await ingestionService.sync(force);

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

// Support both direct mount (app.use('/api/status', statusRouter), app.use('/api/sync', statusRouter))
// and grouped mount (app.use('/api', statusRouter))
router.get('/', getStatusHandler);
router.get('/status', getStatusHandler);
router.post('/', postSyncHandler);
router.post('/sync', postSyncHandler);

export default router;
