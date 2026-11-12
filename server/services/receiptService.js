/**
 * Basilico — Receipt Cent-Exact Reconciliation & Price Feed Service (ADR-0009 / TASK-M3-01)
 * Location: server/services/receiptService.js
 *
 * Enforces mandatory accounting cent-exact reconciliation before any receipt can be confirmed:
 *   sum(lineTotalCents) - sum(discountCents) === declaredTotalCents (delta === 0 cents)
 *
 * Upon confirmation, triggers two decoupled effects:
 *   1. Effect A (Shared Price Catalog): records each line's real price (> 0) in `priceHistoryService`
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

function throwBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function parseLocaleDecimal(amount) {
  if (typeof amount === 'number') return amount;
  if (typeof amount === 'string') {
    const cleaned = amount.trim().replace(',', '.');
    if (!cleaned) return NaN;
    if (!/^[+-]?\d+(?:\.\d+)?$/.test(cleaned)) return NaN;
    return Number(cleaned);
  }
  return Number(amount);
}

export function toCents(amount) {
  const num = parseLocaleDecimal(amount);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

export function fromCents(cents) {
  const safeCents = Number.isFinite(Number(cents)) ? Number(cents) : 0;
  return Number((safeCents / 100).toFixed(2));
}

function parseStrictNonNegativeCents(val, fieldName, fallbackCents = 0) {
  if (val === undefined || val === null || val === '') return fallbackCents;
  const num = parseLocaleDecimal(val);
  if (!Number.isFinite(num) || num < 0) {
    throwBadRequest(`Importo non valido per ${fieldName}: inserire un valore numerico >= 0`);
  }
  return Math.round(num * 100);
}

function parseStrictPositiveNumber(val, fieldName, fallbackVal = null) {
  if (val === undefined || val === null || val === '') return fallbackVal;
  const num = parseLocaleDecimal(val);
  if (!Number.isFinite(num) || num <= 0) {
    throwBadRequest(`Valore numerico non valido per ${fieldName}: inserire un numero > 0`);
  }
  return num;
}

/**
 * Pure deterministic cent-exact reconciliation validator.
 */
export function validateReceiptCentReconciliation(receiptPayload = {}) {
  const rawLines = Array.isArray(receiptPayload.lines) ? receiptPayload.lines : [];
  const rawDiscounts = Array.isArray(receiptPayload.discounts) ? receiptPayload.discounts : [];
  const rawDeclared = receiptPayload.declaredTotal ?? receiptPayload.total;
  const declaredTotalCents = parseStrictNonNegativeCents(rawDeclared, 'declaredTotal', 0);

  const normalizedLines = rawLines.map((line, idx) => {
    const qty = parseStrictPositiveNumber(line.quantity, `lines[${idx}].quantity`, 1);
    const hasUnitPrice = line.unitPrice !== undefined && line.unitPrice !== null && line.unitPrice !== '';
    const hasLineTotal =
      (line.lineTotal !== undefined && line.lineTotal !== null && line.lineTotal !== '') ||
      (line.lineTotalEuro !== undefined && line.lineTotalEuro !== null && line.lineTotalEuro !== '');
    const rawLineTotalVal = line.lineTotal ?? line.lineTotalEuro;
    const hasPrice = line.price !== undefined && line.price !== null && line.price !== '';

    const unitPriceCents = hasUnitPrice
      ? parseStrictNonNegativeCents(line.unitPrice, `lines[${idx}].unitPrice`, 0)
      : null;
    const lineTotalCents = hasLineTotal
      ? parseStrictNonNegativeCents(rawLineTotalVal, `lines[${idx}].lineTotal`, 0)
      : unitPriceCents !== null
        ? Math.round(unitPriceCents * qty)
        : hasPrice
          ? parseStrictNonNegativeCents(line.price, `lines[${idx}].price`, 0)
          : 0;

    const explicitPackWeight = parseStrictPositiveNumber(
      line.packWeightGrams,
      `lines[${idx}].packWeightGrams`,
      null
    );
    const explicitCounterWeight = parseStrictPositiveNumber(
      line.explicitWeightGrams,
      `lines[${idx}].explicitWeightGrams`,
      null
    );
    const explicitPackVolume = parseStrictPositiveNumber(
      line.packVolumeMl,
      `lines[${idx}].packVolumeMl`,
      null
    );

    const domain = line.domain || classifyProductDomain({ title: line.title || '', category: line.category || '' });
    const metrics = extractPackMetrics({ title: `${line.title || ''} ${line.unitString || ''}` });

    const resolvedVolumeMl =
      explicitPackVolume !== null
        ? Math.round(explicitPackVolume)
        : metrics.packVolumeMl
          ? Math.round(metrics.packVolumeMl * qty)
          : null;

    const perUnitVolumeMl =
      resolvedVolumeMl !== null
        ? Math.max(1, Math.round(resolvedVolumeMl / qty))
        : null;

    const resolvedPackGrams =
      explicitPackWeight !== null
        ? Math.round(explicitPackWeight)
        : explicitCounterWeight !== null
          ? Math.round(explicitCounterWeight * (line.explicitWeightIsTotal ? 1 : qty))
          : metrics.packWeightGrams
            ? Math.round(metrics.packWeightGrams * qty)
            : resolvedVolumeMl !== null
              ? resolvedVolumeMl
              : Math.round(250 * qty);

    const perUnitWeightGrams = Math.max(1, Math.round(resolvedPackGrams / qty));

    const unitString =
      (line.unitString && String(line.unitString).trim()) ||
      (explicitCounterWeight !== null
        ? `${Math.round(explicitCounterWeight)} g`
        : explicitPackWeight !== null
          ? `${perUnitWeightGrams} g`
          : metrics.packWeightGrams
            ? `${metrics.packWeightGrams} g`
            : perUnitVolumeMl !== null
              ? `${perUnitVolumeMl} ml`
              : '1 pz');

    return {
      lineIndex: idx + 1,
      title: String(line.title || `Riga ${idx + 1}`).trim(),
      brand: line.brand ? String(line.brand).trim() : null,
      quantity: qty,
      unitString,
      packWeightGrams: resolvedPackGrams,
      packVolumeMl: resolvedVolumeMl,
      lineTotalCents,
      lineTotalEuro: fromCents(lineTotalCents),
      unitPriceEuro: fromCents(Math.round(lineTotalCents / qty)),
      domain,
      targetZone: line.targetZone || inferDefaultZone(line.title || '', line.category || ''),
      addToPantry: line.addToPantry !== false && domain === 'food_human'
    };
  });

  const normalizedDiscounts = rawDiscounts.map((d, idx) => {
    const rawDisc = d.amount ?? d.amountEuro ?? d.value;
    let amountCents = 0;
    if (rawDisc !== undefined && rawDisc !== null && rawDisc !== '') {
      const parsed = parseLocaleDecimal(rawDisc);
      if (!Number.isFinite(parsed)) {
        throwBadRequest(`Importo sconto non valido per discounts[${idx}].amount`);
      }
      amountCents = Math.abs(Math.round(parsed * 100));
    }
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

function sanitizeLoadedReceipt(raw = {}) {
  const safeNum = (v, fb = 0) => (Number.isFinite(Number(v)) ? Number(v) : fb);
  return {
    ...raw,
    id: String(raw.id || `rcpt-${Date.now()}`),
    storeId: String(raw.storeId || 'rapallo-basko-colombo'),
    storeName: String(raw.storeName || raw.storeId || 'Basko Rapallo'),
    declaredTotalEuro: safeNum(raw.declaredTotalEuro, 0),
    discountsTotalEuro: safeNum(raw.discountsTotalEuro, 0),
    linesCount: safeNum(raw.linesCount, Array.isArray(raw.lines) ? raw.lines.length : 0),
    pantryItemsAddedCount: safeNum(raw.pantryItemsAddedCount, 0),
    priceObservationsCount: safeNum(raw.priceObservationsCount, 0),
    lines: Array.isArray(raw.lines) ? raw.lines : [],
    discounts: Array.isArray(raw.discounts) ? raw.discounts : []
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
          this._receipts = parsed.filter(Boolean).map((r) => sanitizeLoadedReceipt(r));
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
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(this._receipts, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  getReceipts() {
    return this._load();
  }

  /**
   * Parses raw receipt text (from OCR or pasted slip) into a draft receipt ready for cent-reconciliation.
   * Filters out fiscal/payment/VAT/footer lines and supports multipliers ("2 X") & counter weights ("0,340 kg").
   */
  parseRawReceiptText(rawText = '', storeId = 'rapallo-basko-colombo', storeName = 'Basko Rapallo') {
    const lines = [];
    const discounts = [];
    let declaredTotal = 0;
    let pendingQty = null;
    let pendingWeightGrams = null;

    // Note: match cashier register numbers (`^cassa\s*(?:\d+|n\.|nr|:|$)`) WITHOUT eating "CASSA ACQUA ..."
    const NON_ITEM_FISCAL_REGEX =
      /^(?:subtotale|totale\s+(?:merce|iva|imposta|sconti|complessivo)|contant[ei]|resto\b|pagamento|bancomat|pagobancomat|carta\s+(?:di\s+)?(?:credito|debito|fedelt\w*)|contactless|pos\b|di\s+cui\s+iva|iva\s+di\s+cui|aliquota|riepilogo\s+iva|iva\s+\d+|imponibile|imposta|documento\s+commerciale|scontrino|cassa\s*(?:\d+|n\.?\b|nr\.?\b|:|$)|operatore|data\b|ora\b|punti\b|saldo\s+punti|prima\s+card|arrivederci|grazie|p\.?\s*iva|partita\s+iva|cod\.?\s*fisc|aut\.?\s*n)/i;

    const textLines = String(rawText || '')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    for (const rawRow of textLines) {
      // Strip trailing VAT department letters or inline VAT % markers ("1,49 A", "2,50 IVA 4%")
      const row = rawRow.replace(/\s+(?:IVA\s*\d+%?|[A-D]\*?|#\d+)$/i, '').trim();
      if (!row) continue;

      // 1. Check total line ("TOTALE EURO 14,50", "TOTALE COMPLESSIVO EURO 14,50", "TOTALE COMPLESSIVO € 14,50", "IMPORTO DOVUTO 14.50")
      const totMatch = row.match(
        /^(?:totale(?:\s+complessivo)?(?:\s+euro|\s+documento)?|importo\s+(?:pagato|dovuto))\s*[:€]?\s*(?:(?:euro|eur|€)\s*)?(\d+[.,]\d{2})$/i
      );
      if (totMatch) {
        declaredTotal = parseFloat(totMatch[1].replace(',', '.'));
        pendingQty = null;
        pendingWeightGrams = null;
        continue;
      }

      // 2. Check discount line ("SCONTO SOCIO -0,50", "BUONO -2.00", "PROMO FIDATY - 1,20")
      const discMatch = row.match(/^(?:sconto|buono|promo|offerta|ribasso)\b.*?-\s*(?:€\s*)?(\d+[.,]\d{2})$/i);
      if (discMatch) {
        discounts.push({
          label: row.replace(/-\s*(?:€\s*)?\d+[.,]\d{2}$/, '').trim() || 'Sconto',
          amount: parseFloat(discMatch[1].replace(',', '.'))
        });
        pendingQty = null;
        pendingWeightGrams = null;
        continue;
      }

      // 3. Ignore accounting / payment / VAT / loyalty footer lines
      if (NON_ITEM_FISCAL_REGEX.test(row)) {
        continue;
      }

      // 4. Standalone quantity multiplier prefix line ("2 X 1,49" or "3 x € 0,99")
      const standaloneQtyMatch = row.match(/^(\d{1,2})\s*[xX*]\s*(?:€\s*)?\d+[.,]\d{2}$/);
      if (standaloneQtyMatch) {
        pendingQty = parseInt(standaloneQtyMatch[1], 10);
        continue;
      }

      // 5. Standalone counter weight prefix line ("0,340 kg x 12,90" or "0.450 KG X 14,90 €/kg")
      const standaloneWeightMatch = row.match(/^(\d+[.,]\d{1,3})\s*kg\s*[xX*]\s*(?:€\s*)?\d+[.,]\d{2}(?:\s*€\/kg)?$/i);
      if (standaloneWeightMatch) {
        pendingWeightGrams = Math.round(parseFloat(standaloneWeightMatch[1].replace(',', '.')) * 1000);
        continue;
      }

      // 6. Standard or inline-multiplied item line ("2 X SPAGHETTI RUMMO 500G 2,98" or "ORATA 0,340 kg 5,10")
      const itemMatch = row.match(/^(.+?)\s+(?:€\s*)?(\d+[.,]\d{2})$/);
      if (itemMatch) {
        let cleanTitle = itemMatch[1].trim();
        const lineTotal = parseFloat(itemMatch[2].replace(',', '.'));
        let qty = pendingQty || 1;
        let explicitWeightGrams = pendingWeightGrams || null;
        const explicitWeightIsTotal = pendingWeightGrams !== null;

        const inlinePrefixQty = cleanTitle.match(/^(\d{1,2})\s*[xX*]\s+(.+)$/);
        if (inlinePrefixQty) {
          qty = parseInt(inlinePrefixQty[1], 10);
          cleanTitle = inlinePrefixQty[2].trim();
        } else {
          const inlineSuffixQty = cleanTitle.match(/^(.+?)\s+[xX*](\d{1,2})$/);
          if (inlineSuffixQty) {
            cleanTitle = inlineSuffixQty[1].trim();
            qty = parseInt(inlineSuffixQty[2], 10);
          }
        }

        const inlineKgMatch = cleanTitle.match(/\b(\d+[.,]\d{1,3})\s*kg\b/i);
        if (inlineKgMatch && !explicitWeightGrams) {
          // Only use inline weight as per-item explicitWeightGrams if extractPackMetrics won't handle multipack "6x1,5kg"
          if (!/\d+\s*[xX*]\s*\d+(?:[.,]\d+)?\s*kg\b/i.test(cleanTitle)) {
            explicitWeightGrams = Math.round(parseFloat(inlineKgMatch[1].replace(',', '.')) * 1000);
          }
        }

        // Guard against pure numeric/date garbage titles
        if (/[a-zA-ZÀ-ÿ]{2,}/.test(cleanTitle)) {
          lines.push({
            title: cleanTitle,
            lineTotal,
            quantity: qty,
            explicitWeightGrams,
            explicitWeightIsTotal
          });
        }

        pendingQty = null;
        pendingWeightGrams = null;
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
   * Enforces strict `(id, revisionKey)` idempotency BEFORE Effect A (price history feed)
   * and Effect B (pantry transfer), preserving original `pantryItemsAddedCount` (`SPEC-05`).
   */
  confirmReceipt(payload = {}) {
    const validation = validateReceiptCentReconciliation(payload);
    if (!validation.isReconciled) {
      const err = new Error(validation.message);
      err.status = 422;
      err.reconciliation = validation;
      throw err;
    }

    const receiptId = payload.id ? String(payload.id).trim() : `rcpt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const revisionKey = String(payload.revisionKey || 'v1').trim();
    const expectedTransferRev = `${receiptId}:${revisionKey}`;

    // SPEC-05 Top-of-Function Strict Idempotency Check:
    // Never duplicate priceHistory observations or overwrite pantryItemsAddedCount on retry!
    const all = this._load();
    const existingReceipt = all.find(
      (r) => r.id === receiptId && (r.revisionKey === revisionKey || r.pantryTransferRevision === expectedTransferRev)
    );
    if (existingReceipt) {
      return {
        receipt: existingReceipt,
        reconciliation: validation,
        pantryTransfer: {
          alreadyApplied: true,
          revisionKey: existingReceipt.pantryTransferRevision || expectedTransferRev,
          addedItems: []
        },
        recordedObservationsCount: 0
      };
    }

    const storeId = String(payload.storeId || 'rapallo-basko-colombo').trim();
    const storeName = String(payload.storeName || storeId).trim();
    const purchasedAt = payload.purchasedAt || new Date().toISOString();

    // Effect B first (atomic idempotency check in pantryService as secondary guard)
    const pantryTransfer = this.pantryService.transferReceiptLinesToPantry(
      receiptId,
      revisionKey,
      validation.lines
    );

    // Effect A: Record ordinary / receipt observed prices (> 0) in Rapallo price history
    const recordedObservations = [];
    if (!pantryTransfer.alreadyApplied) {
      for (const line of validation.lines) {
        if (line.lineTotalCents <= 0 || line.unitPriceEuro <= 0) {
          continue; // Allow €0.00 free promo/gift lines without throwing 400 in priceHistoryService
        }
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
    }

    const savedReceipt = {
      id: receiptId,
      revisionKey,
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
