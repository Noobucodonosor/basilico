/**
 * Basilico — Receipt Cent-Reconciliation Router (ADR-0009 / TASK-M3-01)
 * Location: server/routes/receipts.js
 */

import express from 'express';
import { receiptService, validateReceiptCentReconciliation } from '../services/receiptService.js';

const router = express.Router();

router.get('/', (req, res, next) => {
  try {
    const receipts = receiptService.getReceipts();
    res.status(200).json({
      receipts,
      totalReceipts: receipts.length
    });
  } catch (err) {
    next(err);
  }
});

router.post('/parse', (req, res, next) => {
  try {
    const { rawText, storeId, storeName } = req.body || {};
    const draft = receiptService.parseRawReceiptText(rawText, storeId, storeName);
    res.status(200).json(draft);
  } catch (err) {
    next(err);
  }
});

router.post('/validate', (req, res, next) => {
  try {
    const validation = validateReceiptCentReconciliation(req.body || {});
    res.status(200).json(validation);
  } catch (err) {
    next(err);
  }
});

router.post('/confirm', (req, res, next) => {
  try {
    const result = receiptService.confirmReceipt(req.body || {});
    res.status(201).json(result);
  } catch (err) {
    if (err.status === 422 && err.reconciliation) {
      return res.status(422).json({
        error: err.message,
        reconciliation: err.reconciliation
      });
    }
    next(err);
  }
});

export default router;
