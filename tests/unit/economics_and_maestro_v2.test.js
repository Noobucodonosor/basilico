/**
 * Basilico 2.0 — Unit & Router Tests for Anima 5 (`HouseholdEconomicsService`) & Hybrid `MaestroCoachService`
 * Location: tests/unit/economics_and_maestro_v2.test.js (ADR-0015 / TASK-V2-04)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';

import { PantryService } from '../../server/services/pantryService.js';
import { ReceiptService } from '../../server/services/receiptService.js';
import { PriceHistoryService } from '../../server/services/priceHistoryService.js';
import { KitchenInventoryService } from '../../server/services/kitchenInventoryService.js';
import { ShoppingListService } from '../../server/services/shoppingListService.js';
import {
  HouseholdEconomicsService,
  RHYTHM_PRESETS
} from '../../server/services/householdEconomicsService.js';
import {
  MaestroCoachService,
  evaluateMaestroSafetyP0
} from '../../server/services/maestroCoachService.js';
import maestroRouter from '../../server/routes/maestro.js';

describe('TASK-V2-04: Household Economics (VaR_48h, w_t, C_full, €/h Rapallo, TCO, Laspeyres) & Hybrid Maestro', () => {
  let tmpDir;
  let pantrySvc;
  let priceSvc;
  let receiptSvc;
  let kitchenSvc;
  let shopSvc;
  let econSvc;
  let maestroSvc;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-v2-04-'));
    pantrySvc = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
    priceSvc = new PriceHistoryService({ storagePath: path.join(tmpDir, 'prices.json') });
    receiptSvc = new ReceiptService({
      storagePath: path.join(tmpDir, 'receipts.json'),
      priceHistoryService: priceSvc,
      pantryService: pantrySvc
    });
    kitchenSvc = new KitchenInventoryService({ storagePath: path.join(tmpDir, 'kitchen.json') });
    shopSvc = new ShoppingListService({
      storagePath: path.join(tmpDir, 'shopping.json'),
      pantryService: pantrySvc
    });
    econSvc = new HouseholdEconomicsService({
      storagePath: path.join(tmpDir, 'economics.json'),
      receiptService: receiptSvc,
      priceHistoryService: priceSvc,
      shoppingListService: shopSvc,
      kitchenInventoryService: kitchenSvc
    });
    maestroSvc = new MaestroCoachService({
      pantryService: pantrySvc,
      kitchenInventoryService: kitchenSvc,
      shoppingListService: shopSvc,
      householdEconomicsService: econSvc
    });
  });

  after(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  });

  it('1. PantryService abolishes synthetic 250g fallback on unweighed receipt items, persists lineTotalEuro, and reloads cleanly (ADR-0006)', () => {
    const confirmed = receiptSvc.confirmReceipt({
      id: 'rcpt-v2-unweighed-1',
      storeId: 'rapallo-basko-colombo',
      storeName: 'Basko Rapallo',
      declaredTotal: 11.2,
      lines: [
        { title: 'Filetto di Branzino Fresco al Banco', lineTotal: 8.4, quantity: 1 },
        { title: 'Pane Casereccio Ligure', lineTotal: 2.8, quantity: 1 }
      ],
      discounts: []
    });

    assert.equal(confirmed.pantryTransfer.addedItems.length, 2);
    const seaBass = confirmed.pantryTransfer.addedItems.find((i) => /Branzino/i.test(i.title));
    assert.ok(seaBass);
    assert.equal(seaBass.weightGrams, null, 'Unweighed receipt line MUST NOT get synthetic 250g');
    assert.equal(seaBass.initialWeightGrams, null);
    assert.equal(seaBass.remainingWeightGrams, null);
    assert.equal(seaBass.weightStatus, 'unweighed');
    assert.equal(seaBass.remainingFraction, 1.0);
    assert.equal(seaBass.lineTotalEuro, 8.4);
    assert.equal(seaBass.unitPriceEuro, 8.4);
    assert.ok(seaBass.hygieneWindowExpiresAt, 'Fresh counter fish gets 36h hygiene purchase window');

    // Reload from disk to verify sanitizeLoadedPantryItem never turns null back into 250g
    const reloadedPantry = new PantryService({ storagePath: path.join(tmpDir, 'pantry.json') });
    const reloadedSeaBass = reloadedPantry
      .getPantryState()
      .items.find((i) => i.id === seaBass.id);
    assert.ok(reloadedSeaBass, 'Unweighed active item must remain visible in getPantryState()');
    assert.equal(reloadedSeaBass.initialWeightGrams, null);
    assert.equal(reloadedSeaBass.lineTotalEuro, 8.4);
  });

  it('2. PantryService computes VaR_48h across opened + closed expiring items, separates >48h stale items, and updates Swipe Check fractions', () => {
    // Add a closed ricotta expiring in 18h (€2.20) and an old forgotten item expired 72h ago
    const in18h = new Date(Date.now() + 18 * 3600 * 1000).toISOString();
    const ago72h = new Date(Date.now() - 72 * 3600 * 1000).toISOString();

    const closedFresh = pantrySvc.addItem({
      title: 'Calamari Freschi Puliti 300g',
      zone: 'fridge_freezer',
      initialWeightGrams: 300,
      lineTotalEuro: 6.0,
      status: 'closed',
      closedExpiresAt: in18h
    });

    pantrySvc.addItem({
      title: 'Insalata in Busta Dimenticata 150g',
      zone: 'fridge_freezer',
      initialWeightGrams: 150,
      lineTotalEuro: 1.5,
      status: 'opened',
      openedAt: new Date(Date.now() - 120 * 3600 * 1000).toISOString(),
      expiresAt: ago72h
    });

    const varBefore = pantrySvc.getValueAtRisk48h();
    // Includes seed opened anchovies (€2.70) + unweighed counter sea bass (€8.40, 36h hygiene window) + closed calamari (€6.00, 18h) = €17.10
    assert.equal(varBefore.totalAtRiskEuro, 17.1);
    assert.equal(varBefore.staleUnverifiedItems.length, 1, 'Item expired >48h ago moves to stale Swipe Check queue');
    assert.match(varBefore.staleUnverifiedItems[0].title, /Insalata in Busta/i);

    // 5-second Swipe Check: mark Calamari half-consumed (0.5 -> €3.00 left)
    const halfRes = pantrySvc.applyQuickFractionUpdate(closedFresh.id, 0.5);
    assert.equal(halfRes.item.status, 'opened');
    assert.equal(halfRes.item.remainingFraction, 0.5);
    assert.equal(halfRes.item.remainingWeightGrams, 150);
    assert.equal(halfRes.valueAtRisk48h.totalAtRiskEuro, 14.1);

    // Swipe Check: discard remaining half as waste (0 -> €3.00 wasted recorded)
    const zeroRes = pantrySvc.applyQuickFractionUpdate(closedFresh.id, 0, {
      reason: 'discarded_waste'
    });
    assert.equal(zeroRes.item.status, 'finished');
    assert.equal(zeroRes.item.wastedEuro, 3.0);
    assert.equal(zeroRes.valueAtRisk48h.totalAtRiskEuro, 11.1);
  });

  it('3. HouseholdEconomicsService manages Rhythm Presets + Overrides, C_full, and Batch Cooking thermal/time scale economies', () => {
    const baseCal = econSvc.getCalibration();
    assert.equal(baseCal.activeRhythmPreset, 'feriale');
    assert.equal(baseCal.effectiveParameters.hourlyValueEuro, RHYTHM_PRESETS.feriale.hourlyValueEuro);

    // Reject invalid preset or negative override
    assert.throws(() => econSvc.updateCalibration({ activeRhythmPreset: 'inventato' }), (e) => e.status === 400);
    assert.throws(() => econSvc.updateCalibration({ hourlyValueEuro: -5 }), (e) => e.status === 400);

    const tiredCal = econSvc.updateCalibration({
      activeRhythmPreset: 'sera_stanca',
      electricityEurPerKwh: 0.30
    });
    assert.equal(tiredCal.effectiveParameters.hourlyValueEuro, 30);
    assert.equal(tiredCal.effectiveParameters.electricityEurPerKwh, 0.3);

    // Oven single portion vs Batch Cooking 4 portions
    const singleOven = econSvc.computeGeneralizedMealCost({
      ingredientsEdibleCostEur: 3.5,
      activePrepMinutes: 15,
      passiveCookMinutes: 35,
      cleaningResetMinutes: 4,
      vaRSavedEuro: 0,
      heatSource: 'induction',
      cookingMethod: 'oven_bake',
      batchServings: 1,
      rhythmPreset: 'feriale'
    });

    const batch4Oven = econSvc.computeGeneralizedMealCost({
      ingredientsEdibleCostEur: 3.5,
      activePrepMinutes: 15,
      passiveCookMinutes: 35,
      cleaningResetMinutes: 4,
      vaRSavedEuro: 0,
      heatSource: 'induction',
      cookingMethod: 'oven_bake',
      batchServings: 4,
      rhythmPreset: 'feriale'
    });

    assert.ok(
      batch4Oven.breakdown.energyCostEur < singleOven.breakdown.energyCostEur * 0.4,
      'Batch cooking 4 portions shares the 0.42 kWh oven preheat ramp and cuts per-serving energy by >60%'
    );
    assert.ok(
      batch4Oven.grossGeneralizedCostEur < singleOven.grossGeneralizedCostEur,
      'Batch cooking lowers generalized cost per serving'
    );
    assert.ok(batch4Oven.batchScaleEconomy.savedPerServingViaBatchEur > 3.0);

    // Reset back to feriale
    econSvc.updateCalibration({ activeRhythmPreset: 'feriale', resetAdvancedOverrides: true });
  });

  it('4. HouseholdEconomicsService evaluates Rapallo multi-store €/h yield with parkingEase penalties & TCO ranges', () => {
    const mockSimulations = [
      {
        strategyId: '1_store_express',
        title: '1 Solo Negozio',
        storesVisited: ['Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)'],
        estimatedTotalEur: 42.0,
        estimatedTotalMinutes: 22
      },
      {
        strategyId: '2_stores_optimal',
        title: '2 Negozi Rapallo',
        storesVisited: [
          'Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)',
          'Carrefour Express - Rapallo Centro (Corso Goffredo Mameli, 102R / 234)'
        ],
        estimatedTotalEur: 39.5, // €2.50 saving, but Mameli has parkingEase='low' (+10 min by car!)
        estimatedTotalMinutes: 36
      },
      {
        strategyId: '3_stores_cherry_picking',
        title: '3 Negozi Rapallo',
        storesVisited: [
          'Basko - Rapallo Porto (Corso Cristoforo Colombo, 4-6)',
          'Coop Liguria - Rapallo (Via Amatore Sciesa, 15)',
          'Tigotà - Rapallo (Via Lamarmora, 23)'
        ],
        estimatedTotalEur: 38.2,
        estimatedTotalMinutes: 52
      }
    ];

    // On 'sera_stanca' (w_t = 30 €/h) by car: €2.50 saved in +24 min (14m route + 10m Mameli parking) = €6.25/h < €30/h -> SKIP!
    const yieldTiredCar = econSvc.evaluateMultiStoreTimeYield({
      storeSimulations: mockSimulations,
      rhythmPreset: 'sera_stanca',
      transportMode: 'car'
    });
    assert.equal(yieldTiredCar.optimalStrategyId, '1_store_express');
    assert.equal(yieldTiredCar.incrementalYields[0].verdict, 'skip_false_saving');
    assert.ok(yieldTiredCar.incrementalYields[0].impliedHourlyYieldEur < 10);

    // On 'weekend_relax' (w_t = 8 €/h) on foot: Mameli parking penalty = 1m -> €2.50 in 15m = €10.00/h >= €8/h -> RECOMMENDED!
    const yieldWeekendFoot = econSvc.evaluateMultiStoreTimeYield({
      storeSimulations: mockSimulations,
      rhythmPreset: 'weekend_relax',
      transportMode: 'foot'
    });
    assert.equal(yieldWeekendFoot.optimalStrategyId, '2_stores_optimal');
    assert.equal(yieldWeekendFoot.incrementalYields[0].verdict, 'recommended');

    // TCO evaluation: Inox BIFL vs PTFE coated abuse penalty
    const tco = econSvc.evaluateCookwareTco({ usesPerWeek: 4 });
    const inox = tco.toolsTco.find((t) => t.id === 'casseruola_inox');
    const ptfe = tco.toolsTco.find((t) => t.id === 'padella_antiaderente');
    assert.equal(inox.capExClass, 'buy_it_for_life');
    assert.equal(ptfe.capExClass, 'consumable_coated');
    assert.ok(ptfe.tenYearAbuseWasteMidpointEur > 200, 'Abusing PTFE on Boost/alkali destroys >€200 over 10 years');
  });

  it('5. HouseholdEconomicsService computes Personal Laspeyres Inflation & Shrinkflation Watchdog without synthetic fallbacks', () => {
    // Empty history -> null index (strict ADR-0006!)
    const emptyInf = econSvc.computePersonalInflationAndShrinkflation({ observations: [], receipts: [] });
    assert.equal(emptyInf.status, 'insufficient_history');
    assert.equal(emptyInf.laspeyresIndex, null);
    assert.equal(emptyInf.personalInflationPct, null);

    // Real longitudinal series with 1 regular price hike + 1 classic shrinkflation (500g -> 400g at same €1.49 pack price!)
    const realSeries = [
      {
        id: 'o1',
        title: 'Olio Extra Vergine Ligure 1L',
        price: 9.0,
        unitString: '1 l',
        packVolumeMl: 1000,
        normalizedPricePerKgOrL: 9.0,
        referenceUnit: 'L',
        observedAt: '2026-09-01T10:00:00Z'
      },
      {
        id: 'o2',
        title: 'Olio Extra Vergine Ligure 1L',
        price: 10.35,
        unitString: '1 l',
        packVolumeMl: 1000,
        normalizedPricePerKgOrL: 10.35,
        referenceUnit: 'L',
        observedAt: '2026-11-10T10:00:00Z'
      },
      {
        id: 's1',
        title: 'Pasta Artigianale Bronzo 500g',
        brand: 'Antico Pastificio',
        price: 1.5,
        unitString: '500 g',
        packWeightGrams: 500,
        normalizedPricePerKgOrL: 3.0,
        referenceUnit: 'kg',
        observedAt: '2026-09-01T10:00:00Z'
      },
      {
        id: 's2',
        title: 'Pasta Artigianale Bronzo 400g',
        brand: 'Antico Pastificio',
        price: 1.5,
        unitString: '400 g',
        packWeightGrams: 400,
        normalizedPricePerKgOrL: 3.75,
        referenceUnit: 'kg',
        observedAt: '2026-11-10T10:00:00Z'
      }
    ];

    const computed = econSvc.computePersonalInflationAndShrinkflation({
      observations: realSeries,
      receipts: []
    });
    assert.equal(computed.status, 'computed');
    assert.equal(computed.comparableItemsCount, 2);
    assert.ok(computed.laspeyresIndex > 110 && computed.laspeyresIndex < 120);
    assert.equal(computed.shrinkflationAlerts.length, 1);
    assert.equal(computed.shrinkflationAlerts[0].previousPackGramsOrMl, 500);
    assert.equal(computed.shrinkflationAlerts[0].newPackGramsOrMl, 400);
    assert.equal(computed.shrinkflationAlerts[0].hiddenUnitPriceIncreasePct, 25);
  });

  it('6. MaestroCoachService builds Today Copilot Pareto Frontier (3 distinct cards, Zero-Dairy safe, VaR rescue & 5-Souls chain)', async () => {
    const copilot = await maestroSvc.getTodayCopilot({
      profileId: 'dany',
      rhythmPreset: 'feriale'
    });

    assert.equal(copilot.activeProfile.id, 'dany');
    assert.ok(copilot.valueAtRisk48h.totalAtRiskEuro > 0);
    assert.equal(copilot.tonightParetoCards.length, 3, 'Must expose 3 distinct Pareto cards for ⚡ Oggi');

    const ids = new Set(copilot.tonightParetoCards.map((c) => c.dishId));
    assert.equal(ids.size, 3, 'All 3 Pareto cards must be distinct dishes');

    const varCard = copilot.tonightParetoCards.find((c) => c.slotId === 'save_var_value');
    assert.ok(varCard);
    assert.ok(varCard.vaRSavedEuro > 0, 'Salva-Frigo Pareto card must rescue real expiring euros in fridge');
    assert.ok(varCard.fiveSoulsChain.nutrizione);
    assert.ok(varCard.fiveSoulsChain.culinaria);
    assert.ok(varCard.fiveSoulsChain.strumenti);
    assert.ok(varCard.fiveSoulsChain.casa);
    assert.ok(varCard.fiveSoulsChain.economia);

    // Zero structural dairy dishes (no Focaccia di Recco, Tiramisù, Caprese) for Dany
    for (const card of copilot.tonightParetoCards) {
      assert.doesNotMatch(card.title, /\b(tiramis[uù]|focaccia\s+di\s+recco|quattro\s+formaggi)\b/i);
    }
  });

  it('7. MaestroCoachService askMaestro enforces P0 deterministic blocks, answers offline across 5 Souls, and grounds LLM mode safely', async () => {
    // A. Lethal chemical mix P0: Bleach + Vinegar/Citric
    const bleachMix = await maestroSvc.askMaestro({
      message: 'Posso mescolare candeggina e aceto caldo per togliere il calcare e la muffa in doccia?',
      forceOffline: true
    });
    assert.equal(bleachMix.hasP0Block, true);
    assert.ok(bleachMix.p0Alerts.some((a) => a.code === 'P0-CHEM-CHLORINE-GAS'));
    assert.match(bleachMix.reply, /Cl2/i);

    // B. Pure powder P0: Percarbonate closed in spray bottle + water bottle
    const burstCheck = evaluateMaestroSafetyP0(
      'Sciolgo il percarbonato in uno spruzzino spray o in una bottiglietta dell\'acqua per averlo pronto?'
    );
    assert.ok(burstCheck.some((a) => a.code === 'P0-PRESSURE-BURST'));
    assert.ok(burstCheck.some((a) => a.code === 'P0-CAV-INGESTION'));

    // C. PTFE + Induction Boost P0 & Marble + Acid P0
    const ptfeBoost = await maestroSvc.askMaestro({
      message: 'Metto la padella antiaderente PTFE sul Boost livello 9 per scottare il pesce e poi lavo il mortaio di marmo col limone?',
      forceOffline: true
    });
    assert.ok(ptfeBoost.p0Alerts.some((a) => a.code === 'P0-PHYSICS-PTFE-DEGRADATION'));
    assert.ok(ptfeBoost.p0Alerts.some((a) => a.code === 'P0-SURFACE-MARBLE-ETCHING'));

    // D. Grounded LLM mode with mock fetch: verifies P0 banner can NEVER be omitted by LLM!
    const prevKey = process.env.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY = 'test-mock-gemini-key';
    try {
      let capturedBody = null;
      const mockFetch = async (_url, opts) => {
        capturedBody = JSON.parse(opts.body);
        return {
          ok: true,
          json: async () => ({
            candidates: [
              {
                content: {
                  parts: [{ text: 'Risposta didattica del Maestro ancorata ai dati reali di Rapallo.' }]
                }
              }
            ]
          })
        };
      };

      const groundedRes = await maestroSvc.askMaestro({
        message: 'Candeggina sull\'acciaio inox va bene? E cosa cucino stasera?',
        fetchImpl: mockFetch
      });

      assert.equal(groundedRes.mode, 'gemini_grounded');
      assert.ok(capturedBody.systemInstruction.parts[0].text.includes('JSON_CONTESTO_CERTIFICATO'));
      assert.ok(groundedRes.p0Alerts.some((a) => a.code === 'P0-SURFACE-INOX-PITTING'));
      assert.match(groundedRes.reply, /PITTING|Cr2O3|Vietata la Candeggina/i, 'P0 header must always be enforced');
    } finally {
      if (prevKey === undefined) delete process.env.GEMINI_API_KEY;
      else process.env.GEMINI_API_KEY = prevKey;
    }
  });

  it('8. Express Router /api/maestro serves /today-copilot, /chat, /calibration, /economics/* and validates 400 errors', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/maestro', maestroRouter);
    app.use((err, _req, res, _next) => {
      res.status(err.status || 500).json({ error: err.message });
    });

    const server = await new Promise((resolve) => {
      const s = app.listen(0, '127.0.0.1', () => resolve(s));
    });
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/maestro`;

    try {
      const copilotRes = await fetch(`${baseUrl}/today-copilot?profileId=dany&rhythmPreset=sera_stanca`);
      assert.equal(copilotRes.status, 200);
      const copilotBody = await copilotRes.json();
      assert.equal(copilotBody.activeRhythm.hourlyValueEuro, 30);
      assert.ok(Array.isArray(copilotBody.tonightParetoCards));

      const badChat = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: '   ' })
      });
      assert.equal(badChat.status, 400);

      const goodChat = await fetch(`${baseUrl}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: 'Si è slegata l\'emulsione della pasta, come la salvo?' })
      });
      assert.equal(goodChat.status, 200);
      const chatBody = await goodChat.json();
      assert.ok(chatBody.detectedIntents.includes('culinary_sos'));
      assert.match(chatBody.reply, /fuori dal fuoco/i);

      const tcoRes = await fetch(`${baseUrl}/economics/tco`);
      assert.equal(tcoRes.status, 200);
      const tcoBody = await tcoRes.json();
      assert.ok(tcoBody.toolsTco.length >= 8);

      const infRes = await fetch(`${baseUrl}/economics/inflation`);
      assert.equal(infRes.status, 200);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  });
});
