/**
 * Basilico — Unit Tests for Receipt Cent-Exact Reconciliation & 3-Zone Pantry (ADR-0009 / TASK-M3-01)
 * Location: tests/unit/receipt_reconciliation.test.js
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ReceiptService, validateReceiptCentReconciliation } from '../../server/services/receiptService.js';
import { PantryService, inferDefaultZone } from '../../server/services/pantryService.js';
import { PriceHistoryService } from '../../server/services/priceHistoryService.js';

describe('ADR-0009 / TASK-M3-01: Receipt Cent-Exact Reconciliation & Three-Zone Pantry', () => {
  let tmpDir;
  let pantryService;
  let priceService;
  let receiptService;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-m3-01-'));
    pantryService = new PantryService({
      storagePath: path.join(tmpDir, 'pantry.json')
    });
    priceService = new PriceHistoryService({
      storagePath: path.join(tmpDir, 'prices.json')
    });
    receiptService = new ReceiptService({
      storagePath: path.join(tmpDir, 'receipts.json'),
      priceHistoryService: priceService,
      pantryService
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. should reject receipt confirmation when cent reconciliation delta !== 0', () => {
    const check = validateReceiptCentReconciliation({
      declaredTotal: 10.00,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Olio EVO 1L', lineTotal: 8.50 }
      ],
      discounts: []
    });
    assert.equal(check.isReconciled, false);
    assert.equal(check.deltaCents, -1); // 9.99 vs 10.00 -> -1 cent

    assert.throws(() => {
      receiptService.confirmReceipt({
        declaredTotal: 10.00,
        lines: [
          { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
          { title: 'Olio EVO 1L', lineTotal: 8.50 }
        ]
      });
    }, /Scarto di quadratura/);
  });

  it('2. should confirm receipt when sum(lines) - sum(discounts) === declaredTotal to the exact cent', () => {
    const res = receiptService.confirmReceipt({
      id: 'rcpt-test-101',
      storeId: 'rapallo-basko-colombo',
      storeName: 'Basko Rapallo',
      declaredTotal: 8.79,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Filetti di Orata Fresca 400g', lineTotal: 6.50 },
        { title: 'Detersivo Piatti Svelto 1L', lineTotal: 2.00 }
      ],
      discounts: [
        { label: 'Buono Prima Card Basko', amount: 1.20 }
      ],
      revisionKey: 'v1'
    });

    assert.equal(res.reconciliation.isReconciled, true);
    assert.equal(res.reconciliation.deltaCents, 0);
    assert.equal(res.recordedObservationsCount, 3);
    // Only the 2 food_human items enter the pantry (Svelto detergent is excluded by domain guardrail)
    assert.equal(res.pantryTransfer.addedItems.length, 2);
    assert.equal(res.receipt.pantryItemsAddedCount, 2);
  });

  it('3. should guarantee strict idempotency on BOTH pantry AND priceHistoryService, keeping pantryItemsAddedCount intact (M-P0-03)', () => {
    const obsCountBeforeRetry = priceService.getAllObservations().length;

    const secondCall = receiptService.confirmReceipt({
      id: 'rcpt-test-101',
      storeId: 'rapallo-basko-colombo',
      declaredTotal: 8.79,
      lines: [
        { title: 'Spaghetti Rummo 500g', lineTotal: 1.49 },
        { title: 'Filetti di Orata Fresca 400g', lineTotal: 6.50 },
        { title: 'Detersivo Piatti Svelto 1L', lineTotal: 2.00 }
      ],
      discounts: [{ label: 'Buono Prima Card Basko', amount: 1.20 }],
      revisionKey: 'v1'
    });

    assert.equal(secondCall.pantryTransfer.alreadyApplied, true);
    assert.equal(secondCall.pantryTransfer.addedItems.length, 0);
    assert.equal(secondCall.recordedObservationsCount, 0, 'Must NOT record duplicate price observations on retry');
    assert.equal(priceService.getAllObservations().length, obsCountBeforeRetry);
    assert.equal(secondCall.receipt.pantryItemsAddedCount, 2, 'Must preserve original pantryItemsAddedCount=2');
    assert.equal(receiptService.getReceipts()[0].pantryItemsAddedCount, 2);
  });

  it('4. should manage 3 pantry zones, persist closedExpiresAt, and clamp opened expiresAt <= closedExpiresAt (M-P1-15)', () => {
    const added = pantryService.addItem({
      title: 'Trancio di Salmone Fresco',
      zone: 'fridge_freezer',
      initialWeightGrams: 300,
      status: 'closed'
    });
    assert.equal(added.status, 'closed');
    assert.equal(added.expiresAt, null);

    // Consume 150g -> automatically transitions to 'opened' and sets expiresAt = openedAt + 36h
    const opened = pantryService.consumeOrOpenItem(added.id, { gramsUsed: 150 });
    assert.equal(opened.status, 'opened');
    assert.equal(opened.remainingWeightGrams, 150);
    assert.ok(opened.openedAt);
    assert.ok(opened.expiresAt);
    assert.ok(opened.hoursRemaining > 30 && opened.hoursRemaining <= 36);

    // SPEC-05 T_open clamp: closed milk expiring in 6h must clamp to +6h (NOT +96h) when opened!
    const sixHoursFromNow = new Date(Date.now() + 6 * 3600 * 1000).toISOString();
    const closedMilk = pantryService.addItem({
      title: 'Latte Fresco Alta Qualità 1L',
      zone: 'fridge_freezer',
      initialWeightGrams: 1000,
      unit: 'ml',
      status: 'closed',
      expiresAt: sixHoursFromNow
    });
    assert.equal(closedMilk.closedExpiresAt, sixHoursFromNow);
    assert.equal(closedMilk.expiresAt, sixHoursFromNow);

    const openedMilk = pantryService.consumeOrOpenItem(closedMilk.id, { openNow: true });
    assert.equal(openedMilk.status, 'opened');
    assert.equal(openedMilk.expiresAt, sixHoursFromNow, 'Opened expiry must never exceed commercial closed expiry');
    assert.ok(openedMilk.hoursRemaining <= 6);
  });

  it('5. should harden receipt OCR parser against IVA DI CUI / TOTALE COMPLESSIVO while keeping CASSA ACQUA & 1L volumes (M-P1-16)', () => {
    const rawSlip = [
      'DOCUMENTO COMMERCIALE DI VENDITA',
      'CASSA 02 OPERATORE 14',
      '2 X 1,49',
      'SPAGHETTI RUMMO 500G 2,98 A',
      '0,340 kg x 15,00',
      'ORATA FRESCA DEL GOLFO 5,10 A',
      'OLIO EXTRA VERGINE MONINI 1L 9,99 A',
      'CASSA ACQUA SANT ANNA 6X1,5L 2,40 A',
      'CAMPIONE OMAGGIO PROMO 0,00 A',
      'SCONTO PRIMA CARD -0,50',
      'SUBTOTALE 19,97',
      'IVA DI CUI 0,80',
      'DI CUI IVA 4% 0,29',
      'TOTALE IVA 1,09',
      'TOTALE COMPLESSIVO EURO 19,97',
      'PAGAMENTO BANCOMAT 19,97',
      'CONTANTI 0,00',
      'RESTO 0,00',
      'PUNTI SALDO 142'
    ].join('\n');

    const parsed = receiptService.parseRawReceiptText(rawSlip);
    assert.equal(parsed.isReconciled, true, 'Must reconcile cleanly ignoring IVA DI CUI & TOTALE IVA');
    assert.equal(parsed.lines.length, 5, 'Must keep CASSA ACQUA & free 0,00 € promo line while dropping Cassa 02 & IVA');
    assert.equal(parsed.lines[0].quantity, 2);
    assert.equal(parsed.lines[0].packWeightGrams, 1000);
    assert.equal(parsed.lines[1].packWeightGrams, 340);
    assert.equal(parsed.lines[2].packVolumeMl, 1000);
    assert.equal(parsed.lines[2].packWeightGrams, 1000);
    assert.equal(parsed.lines[3].packVolumeMl, 9000);
    assert.equal(parsed.declaredTotalEuro, 19.97);

    // Confirming receipt with 1L oil and 0,00 € promo line must succeed without 400 and load 1000 ml into pantry
    const confirmed = receiptService.confirmReceipt({
      id: 'rcpt-liquid-promo-1',
      declaredTotal: parsed.declaredTotalEuro,
      lines: parsed.lines,
      discounts: parsed.discounts
    });
    assert.equal(confirmed.receipt.storeId, 'rapallo-basko-colombo');
    assert.equal(confirmed.recordedObservationsCount, 4, '0,00 € promo line must not trigger priceHistory 400');
    const addedOil = confirmed.pantryTransfer.addedItems.find((i) => /Olio Extra Vergine/i.test(i.title));
    assert.ok(addedOil);
    assert.equal(addedOil.initialWeightGrams, 1000, '1L olive oil must load 1000 ml, never 250 ml');
    assert.equal(addedOil.unit, 'ml');
  });

  it('6. should enforce strict CREA-ID + physical-state guards in consumeDishIngredients and fix Spaghetti seed CREA ID (M-P0-09, M-P1-13)', () => {
    const freshPantry = new PantryService({
      storagePath: path.join(tmpDir, 'pantry-seed-check.json')
    });
    const seedState = freshPantry.getPantryState();
    const spaghettiSeed = seedState.items.find((i) => i.id === 'pantry-seed-1');
    assert.equal(spaghettiSeed.creaFoodId, '000800', 'Spaghetti seed must map to Pasta di semola (000800), not Miglio (000080)');

    // Raw fresh tuna tartare (120600) MUST NOT deduct canned tuna in oil in boat_cooler (123610)
    const rawTartareAttempt = freshPantry.consumeDishIngredients({
      dishId: 'tartare-test',
      dishTitle: 'Tartare di Tonno Rosso Crudo',
      servings: 1,
      bom: [
        { creaId: '120600', name: 'Tonno rosso fresco crudo', rawGramsPerServing: 150, rawGramsTotal: 150 },
        { creaId: null, name: 'Emulsione vegetale sostitutiva', rawGramsTotal: 40, isSubstitutedComposite: true }
      ]
    });
    assert.equal(rawTartareAttempt.deductedCount, 0, 'Raw tuna BOM must NEVER deduct canned tuna in oil');
    const cannedTunaAfter = freshPantry.getPantryState().items.find((i) => i.id === 'pantry-seed-4');
    assert.equal(cannedTunaAfter.remainingWeightGrams, 250);
    assert.equal(cannedTunaAfter.status, 'closed');

    // Canned tuna recipe (123610) DOES deduct canned tuna in boat_cooler and starts T_open
    const boatDeduction = freshPantry.consumeDishIngredients({
      dishId: 'boat-test-1',
      dishTitle: 'Insalata di Tonno e Ceci in Barca',
      servings: 1,
      bom: [{ creaId: '123610', name: 'Tonno all\'olio sgocciolato', rawGramsPerServing: 80, rawGramsTotal: 80 }]
    });
    assert.equal(boatDeduction.deductedCount, 1);
    const openedTuna = boatDeduction.items.find((i) => i.id === 'pantry-seed-4');
    assert.equal(openedTuna.status, 'opened');
    assert.equal(openedTuna.remainingWeightGrams, 170);
    assert.ok(openedTuna.expiresAt);
  });

  it('7. should reject NaN/non-numeric inputs with 400 and classify inferDefaultZone accurately (M-P0-02, M-P2-08)', () => {
    assert.throws(
      () => pantryService.addItem({ title: 'Pane', initialWeightGrams: 'abc' }),
      (err) => err.status === 400
    );
    assert.throws(
      () => validateReceiptCentReconciliation({ declaredTotal: 'abc', lines: [{ title: 'Pane', lineTotal: 1.5 }] }),
      (err) => err.status === 400
    );

    assert.equal(inferDefaultZone('Macinato di Bovino 400g'), 'fridge_freezer');
    assert.equal(inferDefaultZone('Mozzarella Vaccina 125g'), 'fridge_freezer');
    assert.equal(inferDefaultZone('Prosciutto Crudo di Parma 100g'), 'fridge_freezer');
    assert.equal(inferDefaultZone('Sgombro Fresco Intero'), 'fridge_freezer');
    assert.equal(inferDefaultZone('Biscotti al Latte 500g'), 'dry_pantry');
    assert.equal(inferDefaultZone('Pomodori Pelati Italiani 400g'), 'dry_pantry');
    assert.equal(inferDefaultZone('Tonno all\'Olio di Oliva in Vetro'), 'boat_cooler');
  });
});
