/**
 * Basilico — Receipt Cent-Exact Reconciliation & Price Feed Service (ADR-0009 / TASK-M3-01)
 * Location: server/services/receiptService.js
 *
 * Enforces mandatory accounting cent-exact reconciliation before any receipt can be confirmed:
 *   sum(lineTotalCents) - sum(discountCents) === declaredTotalCents (delta === 0 cents)
 *
 * Upon confirmation, triggers two decoupled effects:
 *   1. Effect A (Shared Price Catalog): records each line's real price in `priceHistoryService`
 *      for that Rapallo store (feeding ordinary off-flyer price benchmarks and "È un vero sconto?").
 *   2. Effect B (Personal Pantry): idempotently transfers selected food lines into `pantryService`.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyProductDomain } from './domainClassifier.js';
import { extractPackMetrics } from './unitPriceExtractor.js';
import { priceHistoryService } from './priceHistoryService.js';
import { pantryService, inferDefaultZone } from './pantryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_RECEIPTS_PATH = path.resolve(__dirname, '../../data/cache/user_receipts.json');

export function toCents(amount) {
  const num = typeof amount === 'string' ? parseFloat(amount.replace(',', '.')) : Number(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromCents(cents) {
  return Number((cents / 100).toFixed(2));
}

/**
 * Pure deterministic cent-exact reconciliation validator.
 */
export function validateReceiptCentReconciliation(receiptPayload = {}) {
  const rawLines = Array.isArray(receiptPayload.lines) ? receiptPayload.lines : [];
  const rawDiscounts = Array.isArray(receiptPayload.discounts) ? receiptPayload.discounts : [];
  const declaredTotalCents = toCents(receiptPayload.declaredTotal ?? receiptPayload.total ?? 0);

  const normalizedLines = rawLines.map((line, idx) => {
    const qty = Math.max(1, Number(line.quantity || 1));
    const unitPriceCents = line.unitPrice != null ? toCents(line.unitPrice) : null;
    const lineTotalCents = line.lineTotal != null
      ? toCents(line.lineTotal)
      : (unitPriceCents !== null ? Math.round(unitPriceCents * qty) : toCents(line.price || 0));

    const domain = line.domain || classifyProductDomain({ title: line.title || '', category: line.category || '' });
    const metrics = extractPackMetrics({ title: `${line.title || ''} ${line.unitString || ''}` });

    return {
      lineIndex: idx + 1,
      title: String(line.title || `Riga ${idx + 1}`).trim(),
      brand: line.brand ? String(line.brand).trim() : null,
      quantity: qty,
      unitString: line.unitString || (metrics.packWeightGrams ? `${metrics.packWeightGrams} g` : '1 pz'),
      packWeightGrams: metrics.packWeightGrams ? metrics.packWeightGrams * qty : 250 * qty,
      packVolumeMl: metrics.packVolumeMl ? metrics.packVolumeMl * qty : null,
      lineTotalCents,
      lineTotalEuro: fromCents(lineTotalCents),
      unitPriceEuro: fromCents(Math.round(lineTotalCents / qty)),
      domain,
      targetZone: line.targetZone || inferDefaultZone(line.title || '', ''),
      addToPantry: line.addToPantry !== false && domain === 'food_human'
    };
  });

  const normalizedDiscounts = rawDiscounts.map((d, idx) => {
    const amountCents = Math.abs(toCents(d.amount ?? d.value ?? 0));
    return {
      discountIndex: idx + 1,
      label: String(d.label || 'Sconto / Buono').trim(),
      amountCents,
      amountEuro: fromCents(amountCents)
    };
  });

  const linesSubtotalCents = normalizedLines.reduce((acc, l) => acc + l.lineTotalCents, 0);
  const discountsTotalCents = normalizedDiscounts.reduce((acc, d) => acc + d.amountCents, 0);
  const computedTotalCents = linesSubtotalCents - discountsTotalCents;
  const deltaCents = computedTotalCents - declaredTotalCents;
  const isReconciled = normalizedLines.length > 0 && declaredTotalCents > 0 && deltaCents === 0;

  return {
    isReconciled,
    linesSubtotalCents,
    linesSubtotalEuro: fromCents(linesSubtotalCents),
    discountsTotalCents,
    discountsTotalEuro: fromCents(discountsTotalCents),
    computedTotalCents,
    computedTotalEuro: fromCents(computedTotalCents),
    declaredTotalCents,
    declaredTotalEuro: fromCents(declaredTotalCents),
    deltaCents,
    deltaEuro: fromCents(deltaCents),
    lines: normalizedLines,
    discounts: normalizedDiscounts,
    message: isReconciled
      ? 'Quadratura contabile perfetta al centesimo (scarto € 0,00).'
      : `Scarto di quadratura: ${deltaCents > 0 ? '+' : ''}€ ${fromCents(deltaCents).toFixed(2)} (${deltaCents} centesimi). Correggi le righe o il totale prima di confermare.`
  };
}

export class ReceiptService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_RECEIPTS_PATH || DEFAULT_RECEIPTS_PATH;
    this.priceHistoryService = options.priceHistoryService || priceHistoryService;
    this.pantryService = options.pantryService || pantryService;
    this._receipts = null;
  }

  _load() {
    if (this._receipts) return this._receipts;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (Array.isArray(parsed)) {
          this._receipts = parsed;
          return this._receipts;
        }
      }
    } catch (_) {}
    this._receipts = [];
    return this._receipts;
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._receipts, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  getReceipts() {
    return this._load();
  }

  /**
   * Parses raw receipt text (from OCR or pasted slip) into a draft receipt ready for cent-reconciliation.
   */
  parseRawReceiptText(rawText = '', storeId = 'basko-rapallo-colombo', storeName = 'Basko Rapallo') {
    const lines = [];
    const discounts = [];
    let declaredTotal = 0;

    const textLines = String(rawText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const row of textLines) {
      // Check total line ("TOTALE EURO 14,50" or "TOTALE 14.50")
      const totMatch = row.match(/^(?:totale(?:\s+euro|\s+complessivo)?|importo\s+pagato)\s*[:€]?\s*(\d+[.,]\d{2})$/i);
      if (totMatch) {
        declaredTotal = parseFloat(totMatch[1].replace(',', '.'));
        continue;
      }

      // Check discount line ("SCONTO SOCIO -0,50" or "BUONO -2.00")
      const discMatch = row.match(/^(?:sconto|buono|promo)\b.*?-\s*(\d+[.,]\d{2})$/i);
      if (discMatch) {
        discounts.push({
          label: row.replace(/-\s*\d+[.,]\d{2}$/, '').trim() || 'Sconto',
          amount: parseFloat(discMatch[1].replace(',', '.'))
        });
        continue;
      }

      // Standard item line ("SPAGHETTI RUMMO 500G 1,49")
      const itemMatch = row.match(/^(.+?)\s+(\d+[.,]\d{2})$/);
      if (itemMatch) {
        lines.push({
          title: itemMatch[1].trim(),
          lineTotal: parseFloat(itemMatch[2].replace(',', '.')),
          quantity: 1
        });
      }
    }

    if (declaredTotal === 0 && lines.length > 0) {
      const sum = lines.reduce((a, b) => a + b.lineTotal, 0) - discounts.reduce((a, b) => a + b.amount, 0);
      declaredTotal = Number(sum.toFixed(2));
    }

    return validateReceiptCentReconciliation({
      storeId,
      storeName,
      declaredTotal,
      lines,
      discounts
    });
  }

  /**
   * Confirms and commits a receipt ONLY if `deltaCents === 0`.
   * Executes Effect A (price history feed) and Effect B (idempotent pantry transfer).
   */
  confirmReceipt(payload = {}) {
    const validation = validateReceiptCentReconciliation(payload);
    if (!validation.isReconciled) {
      const err = new Error(validation.message);
      err.status = 422;
      err.reconciliation = validation;
      throw err;
    }

    const receiptId = payload.id || `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const storeId = String(payload.storeId || 'basko-rapallo-colombo').trim();
    const storeName = String(payload.storeName || storeId).trim();
    const purchasedAt = payload.purchasedAt || new Date().toISOString();
    const revisionKey = payload.revisionKey || 'v1';

    // Effect A: Record ordinary / receipt observed prices in Rapallo price history
    const recordedObservations = [];
    for (const line of validation.lines) {
      const obs = this.priceHistoryService.recordObservation({
        title: line.title,
        brand: line.brand,
        price: line.unitPriceEuro,
        unitString: line.unitString,
        storeId,
        storeName,
        channel: 'receipt_verified',
        observedAt: purchasedAt
      });
      recordedObservations.push(obs);
    }

    // Effect B: Idempotent transfer of selected food lines into 3-zone Pantry
    const pantryTransfer = this.pantryService.transferReceiptLinesToPantry(
      receiptId,
      revisionKey,
      validation.lines
    );

    const savedReceipt = {
      id: receiptId,
      storeId,
      storeName,
      purchasedAt,
      declaredTotalEuro: validation.declaredTotalEuro,
      discountsTotalEuro: validation.discountsTotalEuro,
      linesCount: validation.lines.length,
      lines: validation.lines,
      discounts: validation.discounts,
      pantryTransferRevision: pantryTransfer.revisionKey,
      pantryItemsAddedCount: pantryTransfer.addedItems.length,
      priceObservationsCount: recordedObservations.length
    };

    const all = this._load();
    const existingIdx = all.findIndex((r) => r.id === receiptId);
    if (existingIdx >= 0) {
      all[existingIdx] = savedReceipt;
    } else {
      all.unshift(savedReceipt);
    }
    this._save();

    return {
      receipt: savedReceipt,
      reconciliation: validation,
      pantryTransfer,
      recordedObservationsCount: recordedObservations.length
    };
  }
}

export const receiptService = new ReceiptService();
export default receiptService;
