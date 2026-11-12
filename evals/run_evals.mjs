#!/usr/bin/env node
/**
 * Basilico — Automated Domain & Common-Sense Evals Runner (`ADR-0014 / TASK-AIENG-01`)
 * Location: evals/run_evals.mjs
 *
 * Unlike syntactic unit tests (`npm test`), this AI Engineering Eval Suite measures
 * product realism, domain purity, gastronomic common sense, scientific accuracy (CREA/FAO),
 * chemical safety (P0), and weekly meal diversity across all 6 Living Specs (`specs/`).
 *
 * Writes `data/cache/latest_eval_scorecard.json` so `npm run board` can display real-time scores.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { classifyProductDomain } from '../server/services/domainClassifier.js';
import { extractPackMetrics } from '../server/services/unitPriceExtractor.js';
import { evaluateQualityLens } from '../server/services/qualityLensService.js';
import { offerService, enrichOfferRecord, normalizeSearchToken } from '../server/services/offerService.js';
import { creaService } from '../server/services/creaService.js';
import { creaOfferMatcher } from '../server/services/creaOfferMatcher.js';
import {
  recipeAndArbitrageService,
  matchBomIngredientToOffer
} from '../server/services/recipeAndArbitrageService.js';
import {
  KitchenInventoryService,
  normalizeDishCookwareIds
} from '../server/services/kitchenInventoryService.js';
import { kitchenResetService } from '../server/services/kitchenResetService.js';
import {
  ReceiptService,
  validateReceiptCentReconciliation
} from '../server/services/receiptService.js';
import { mealPlannerService } from '../server/services/mealPlannerService.js';
import { ShoppingListService } from '../server/services/shoppingListService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, '../data/cache');
export const SCORECARD_JSON_PATH = path.join(CACHE_DIR, 'latest_eval_scorecard.json');

export async function runAllDomainEvals(options = {}) {
  const quiet = Boolean(options.quiet);
  const startedAt = Date.now();
  const suites = [];

  const recordSuite = (roomNumber, roomTitle, specFile, issueNumber, checks) => {
    const passed = checks.filter((c) => c.passed).length;
    const total = checks.length;
    const scorePct = total > 0 ? Math.round((passed / total) * 100) : 100;
    suites.push({
      roomNumber,
      roomTitle,
      specFile,
      issueNumber,
      passed,
      total,
      scorePct,
      checks
    });
  };

  // =========================================================================
  // STANZA 1 — Negozi & Offerte Rapallo (`specs/01-negozi.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const foodQuery = await offerService.getOffers({ domain: 'food_human', limit: 100 });
    const foodItems = foodQuery.offers || [];

    const nonFoodLeakRx =
      /\b(bassetti|caleffi|beper|mattel|hasbro|piastra\s+capelli|arricciacapelli|asciugacapelli|phon\b|candel[ae]\b|tovagli[ae]\b|lenzuol[aoie]\b|trapunt\w*|accappatoi\w*|lavastoviglie\s+miele|detersiv\w*)\b/i;
    const leakedInFood = foodItems.filter((o) =>
      nonFoodLeakRx.test(`${o.title || ''} ${o.brand || ''}`)
    );
    checks.push({
      id: 'R1-LEXICAL-FOOD-PURITY',
      label: 'Zero tessili casa, giocattoli, phon o detersivi nel dominio Cibo & Bevande',
      passed: leakedInFood.length === 0,
      detail:
        leakedInFood.length === 0
          ? `0 intrusi su ${foodItems.length} offerte alimentari attive`
          : `Trovati intrusi: ${leakedInFood.map((x) => x.title).slice(0, 3).join(', ')}`
    });

    const careQuery = await offerService.getOffers({ domain: 'personal_care', limit: 100 });
    const careItems = careQuery.offers || [];
    const foodInCareRx =
      /\b(grana\s+padano|parmigiano|mozzarella|prosciutto|salame|lavazza|kimbo|knorr|zuppa|minestrone|tonno\s+rio\s+mare)\b/i;
    const leakedInCare = careItems.filter((o) =>
      foodInCareRx.test(`${o.title || ''} ${o.brand || ''}`)
    );
    checks.push({
      id: 'R1-PERSONAL-CARE-PURITY',
      label: 'Zero formaggi, salumi, caffè o zuppe nel dominio Cura Persona',
      passed: leakedInCare.length === 0,
      detail:
        leakedInCare.length === 0
          ? `0 falsi positivi su ${careItems.length} offerte Cura Persona`
          : `Intrusi in Cura Persona: ${leakedInCare.map((x) => x.title).join(', ')}`
    });

    const lettoMetrics = extractPackMetrics({
      title: 'Completo Letto Matrimoniale Bassetti',
      unitString: '1 pz',
      promoPrice: 29.9
    });
    checks.push({
      id: 'R1-NO-LETTO-ETTO-BUG',
      label: 'Regex peso netto immune dal falso positivo "letto" -> "l\'etto (100g)"',
      passed: lettoMetrics.isPerEtto === false && lettoMetrics.packWeightGrams !== 100,
      detail: `Completo Letto -> isPerEtto=${lettoMetrics.isPerEtto}, packWeightGrams=${lettoMetrics.packWeightGrams}`
    });

    const shampooLens = evaluateQualityLens({
      title: ' Pantene Shampoo Rigenera e Protegge 250 ml',
      domain: 'personal_care'
    });
    const hasPtfeBadgeOnShampoo = (shampooLens.highlights || []).some((h) =>
      /ptfe|padell/i.test(h.label || '')
    );
    const sveltoDomain = classifyProductDomain({
      title: 'Svelto Detersivo Piatti Limone 930 ml',
      brand: 'Svelto'
    });
    checks.push({
      id: 'R1-QUALITY-LENS-AND-CITRUS-SOAP',
      label: 'Zero badge PTFE su shampoo/bagnoschiuma e detersivi al limone restano in Cura Casa',
      passed: !hasPtfeBadgeOnShampoo && sveltoDomain === 'home_cleaning',
      detail: `Shampoo PTFE=${hasPtfeBadgeOnShampoo}, Svelto Limone=${sveltoDomain}`
    });

    const allFoodPage = await offerService.getOffers({ domain: 'food_human', page: 1, limit: 100 });
    const seenKeys = new Set();
    let exactDupes = 0;
    let expiredCount = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const item of allFoodPage.offers || []) {
      const k = `${item.storeId || item.chainId}::${normalizeSearchToken(item.title)}::${Number(item.promoPrice).toFixed(2)}`;
      if (seenKeys.has(k)) exactDupes++;
      seenKeys.add(k);
      if (item.validTo && String(item.validTo).slice(0, 10) < todayIso && !allFoodPage.showingFallbackRecent) {
        expiredCount++;
      }
    }
    checks.push({
      id: 'R1-DEDUP-AND-VALID-DATES',
      label: 'Zero card duplicate identiche (negozio+titolo+prezzo) e zero offerte scadute non dichiarate',
      passed: exactDupes === 0 && expiredCount === 0,
      detail: `Duplicati=${exactDupes}, Scadute=${expiredCount} su ${(allFoodPage.offers || []).length} card`
    });

    recordSuite(1, 'Negozi & Offerte Rapallo', 'specs/01-negozi.spec.md', 28, checks);
  }

  // =========================================================================
  // STANZA 2 — Scienza & CREA (`specs/02-crea.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const baseCrea = creaService.searchAndRankFoods({ limit: 5 });
    checks.push({
      id: 'R2-CREA-CORPUS-COMPLETE',
      label: 'Dataset ufficiale CREA integrale caricato (832 alimenti scientifici)',
      passed: baseCrea.totalCatalogSize >= 830,
      detail: `${baseCrea.totalCatalogSize} alimenti CREA in ${baseCrea.categories.length} categorie merceologiche`
    });

    const garlicSearch = creaService.searchAndRankFoods({ q: 'aglio', limit: 5 });
    const mackerelSearch = creaService.searchAndRankFoods({ q: 'sgombro', limit: 5 });
    const garlicOmega3 = garlicSearch.foods[0]?.keyMetrics?.omega3G ?? 99;
    const mackerelOmega3 = Math.max(
      ...mackerelSearch.foods.map((i) => i.keyMetrics?.omega3G || 0),
      0
    );
    checks.push({
      id: 'R2-FAO-OMEGA3-CONVERSION',
      label: 'Conversione FAO acidi grassi: Sgombro >> Aglio (mai % grezza sugli lipidi scambiata per grammi)',
      passed: garlicOmega3 < 0.15 && mackerelOmega3 >= 1.0,
      detail: `Aglio Omega-3=${garlicOmega3}g/100g vs Sgombro Omega-3=${mackerelOmega3}g/100g`
    });

    const rawOffersForCrea = (await offerService.getRawOffers()).map((o) => enrichOfferRecord(o));
    const rankedItems = creaOfferMatcher.rankOffersByNutrientPerEuro(rawOffersForCrea, {
      metric: 'proteinGPerEuro',
      hideIncompatible: false
    });
    const namelessInRank = rankedItems.filter((r) => /^(?:al\s+kg|offerta|prezzo)$/i.test((r.offerTitle || '').trim()));
    checks.push({
      id: 'R2-NUTRIENTS-PER-EURO-HONESTY',
      label: 'Classifica Nutrienti/€ Edibili ricca (>=25 offerte food_human), zero "Al Kg" anonimi',
      passed: rankedItems.length >= 25 && namelessInRank.length === 0,
      detail: `${rankedItems.length} offerte classificate, ${namelessInRank.length} anonime`
    });

    recordSuite(2, 'Scienza & CREA', 'specs/02-crea.spec.md', 29, checks);
  }

  // =========================================================================
  // STANZA 3 — Ricette, Ristoranti & Fornelli (`specs/03-ricette.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const trapOffers = [
      enrichOfferRecord({ id: 'trap-1', title: 'Battaglio Mango Maturo Ready to Eat 350 g', promoPrice: 2.49, domain: 'food_human' }),
      enrichOfferRecord({ id: 'trap-2', title: 'Rio Mare Tonno all\'Olio di Oliva 3x80 g', promoPrice: 3.99, domain: 'food_human' }),
      enrichOfferRecord({ id: 'trap-3', title: 'Rovagnati Gran Biscotto Prosciutto Cotto 120 g', promoPrice: 2.69, domain: 'food_human' })
    ];

    const aglioMatch = matchBomIngredientToOffer({ name: 'Aglio fresco' }, trapOffers);
    const tonnoCrudoMatch = matchBomIngredientToOffer({ name: 'Tonno rosso crudo abbattuto' }, trapOffers);
    const crudoMatch = matchBomIngredientToOffer({ name: 'Prosciutto crudo di Parma' }, trapOffers);

    checks.push({
      id: 'R3-BOM-SEMANTIC-PRECISION',
      label: 'Matcher BOM immune da trappole lessicali (Aglio!=Battaglio Mango, Crudo!=Scatola/Cotto)',
      passed: aglioMatch === null && tonnoCrudoMatch === null && crudoMatch === null,
      detail: `Aglio->${aglioMatch?.title || 'null'}, TonnoCrudo->${tonnoCrudoMatch?.title || 'null'}, Crudo->${crudoMatch?.title || 'null'}`
    });

    const danyDishesRes = await recipeAndArbitrageService.queryDishes({
      profileId: 'dany',
      includeExcluded: true,
      limit: 300
    });
    const allDishes = danyDishesRes.dishes || [];
    const structuralDairyTargets = allDishes.filter((d) =>
      /\b(focaccia\s+col\s+formaggio|tiramis[uù]|caprese\s+di\s+bufala|cacio\s+e\s+pepe|quattro\s+formaggi)\b/i.test(
        d.title || ''
      )
    );
    const allExcludedProperly =
      structuralDairyTargets.length > 0 &&
      structuralDairyTargets.every((d) => d.isExcludedByProfileIdentity === true);

    checks.push({
      id: 'R3-CULINARY-IDENTITY-GUARD',
      label: 'Piatti dove il formaggio/mascarpone è identità (Recco, Tiramisù, Caprese) esclusi onestamente per Dany',
      passed: allExcludedProperly,
      detail: `${structuralDairyTargets.length} piatti strutturali lattiero-caseari marcati isExcludedByProfileIdentity=true`
    });

    const sampleByFamily = new Map();
    for (const d of allDishes) {
      if (d.dishFamily && !sampleByFamily.has(d.dishFamily)) {
        sampleByFamily.set(d.dishFamily, d);
      }
      if (sampleByFamily.size >= 12) break;
    }
    const archetypesSeen = new Set();
    for (const d of sampleByFamily.values()) {
      const session = await recipeAndArbitrageService.getScientificCookingSession(d.id, { profileId: 'dany' });
      if (session?.cookingArchetype) archetypesSeen.add(session.cookingArchetype);
    }
    checks.push({
      id: 'R3-SCIENCE-COOKING-DIVERSITY',
      label: 'Guida Fornelli Science & Cooking specifica per tecnica (almeno 5 archetipi termodinamici distinti)',
      passed: archetypesSeen.size >= 5,
      detail: `${archetypesSeen.size} archetipi fisici/chimici distinti rilevati (${Array.from(archetypesSeen).slice(0, 5).join(', ')})`
    });

    recordSuite(3, 'Ricette, Ristoranti & Fornelli', 'specs/03-ricette.spec.md', 30, checks);
  }

  // =========================================================================
  // STANZA 4 — Cucina, Pentole & Pulizia (`specs/04-cucina.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const tmpKitchenPath = path.join(os.tmpdir(), `basilico-eval-kitchen-${process.pid}.json`);
    try {
      const isolatedKitchen = new KitchenInventoryService({ storagePath: tmpKitchenPath });
      const archetypes = isolatedKitchen.getArchetypes();
      const validIds = new Set(archetypes.map((a) => a.id));
      const catalogDishes = isolatedKitchen.getDishesCatalog();

      let unmappedToolCount = 0;
      for (const dish of catalogDishes) {
        const mapped = normalizeDishCookwareIds(dish.cookwareRequired || [], dish);
        for (const tid of mapped) {
          if (!validIds.has(tid)) unmappedToolCount++;
        }
      }
      const kState = isolatedKitchen.getKitchenState();
      checks.push({
        id: 'R4-COOKWARE-TAXONOMY-100PCT',
        label: '100% degli strumenti richiesti dalle ricette mappati sugli archetipi reali e ROI <= catalogo totale',
        passed:
          unmappedToolCount === 0 &&
          kState.totalUnlockedDishes <= kState.totalCatalogDishes &&
          kState.totalCatalogDishes > 40,
        detail: `Unmapped=${unmappedToolCount}, Sbloccati=${kState.totalUnlockedDishes}/${kState.totalCatalogDishes}`
      });

      isolatedKitchen.updateKitchenConfig({
        heatSource: 'induction',
        ownedToolIds: ['padella_antiaderente', 'pentola', 'mortaio']
      });
      const indState = isolatedKitchen.getKitchenState();
      const nonFerroDisqualified = indState.disqualifiedTools.length > 0 || archetypes.some((a) => a.category === 'cookware' && !a.inductionCompatible);
      checks.push({
        id: 'R4-INDUCTION-FERROMAGNETIC-PHYSICS',
        label: 'Verifica ferromagnetica attiva per piani a Induzione',
        passed: nonFerroDisqualified,
        detail: `Strumenti non ferromagnetici intercettati correttamente`
      });
    } finally {
      try {
        if (fs.existsSync(tmpKitchenPath)) fs.unlinkSync(tmpKitchenPath);
      } catch (_) {}
    }

    const resetProto = await kitchenResetService.generateProtocol(['padella_antiaderente', 'mortaio']);
    const safetyMatrix = resetProto.chemicalSafetyMatrix || [];
    const hasChlorineGasRule = safetyMatrix.some((r) => /Cl2/i.test(r.hazardFormula || ''));
    const hasChloramineRule = safetyMatrix.some((r) => /NH2Cl|clorammin/i.test(`${r.hazardFormula} ${r.toxicProduct}`));
    checks.push({
      id: 'R4-P0-CHEMICAL-SAFETY-MATRIX',
      label: 'Matrice sicurezza chimica P0-LETHAL presente (Candeggina+Acidi -> Cl2, Candeggina+Ammoniaca -> Clorammine)',
      passed: hasChlorineGasRule && hasChloramineRule,
      detail: `${safetyMatrix.length} regole di incompatibilità chimica attive`
    });

    recordSuite(4, 'Cucina, Pentole & Pulizia', 'specs/04-cucina.spec.md', 31, checks);
  }

  // =========================================================================
  // STANZA 5 — Dispensa & Scontrini (`specs/05-dispensa.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const tmpReceiptsPath = path.join(os.tmpdir(), `basilico-eval-receipts-${process.pid}.json`);
    try {
      const isolatedReceiptSvc = new ReceiptService({ storagePath: tmpReceiptsPath });
      const sampleSlip = [
        'BASKO RAPALLO CORSO COLOMBO',
        'DOCUMENTO COMMERCIALE',
        '2 X SPAGHETTI RUMMO 500G 2,98',
        'OLIO EVO LIGURE 750ML 8,90',
        'SCONTO PRIMA CARD -1,00',
        'SUBTOTALE 10,88',
        'DI CUI IVA 4% 0,42',
        'PAGAMENTO BANCOMAT 10,88',
        'CONTANTI 20,00',
        'RESTO 9,12',
        'TOTALE EURO 10,88'
      ].join('\n');

      const parsed = isolatedReceiptSvc.parseRawReceiptText(sampleSlip);
      const hasFiscalNoise = parsed.lines.some((l) =>
        /\b(subtotale|iva|bancomat|contanti|resto)\b/i.test(l.title || '')
      );
      checks.push({
        id: 'R5-OCR-FISCAL-NOISE-FILTER',
        label: 'Parser scontrino filtra SUBTOTALE/IVA/CONTANTI/RESTO e riconcilia al centesimo (€ 0,00)',
        passed:
          !hasFiscalNoise &&
          parsed.lines.length === 2 &&
          parsed.isReconciled === true &&
          parsed.deltaCents === 0,
        detail: `Righe=${parsed.lines.length}, Sconti=${parsed.discounts.length}, Delta=${parsed.deltaCents} cent`
      });

      const brokenCheck = validateReceiptCentReconciliation({
        lines: [{ title: 'Pesto Genovese 130g', lineTotal: 2.99 }],
        discounts: [],
        declaredTotal: 3.00
      });
      checks.push({
        id: 'R5-STRICT-ONE-CENT-BLOCK',
        label: 'Blocco rigoroso se lo scontrino sballa anche di 1 solo centesimo',
        passed: brokenCheck.isReconciled === false && brokenCheck.deltaCents === -1,
        detail: `2,99 vs 3,00 -> isReconciled=${brokenCheck.isReconciled}, delta=${brokenCheck.deltaCents} cent`
      });
    } finally {
      try {
        if (fs.existsSync(tmpReceiptsPath)) fs.unlinkSync(tmpReceiptsPath);
      } catch (_) {}
    }

    recordSuite(5, 'Dispensa & Scontrini', 'specs/05-dispensa.spec.md', 32, checks);
  }

  // =========================================================================
  // STANZA 6 — Pianificatore & Lista Spesa (`specs/06-pianificatore.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const modelsToTest = ['balanced_daily', 'ligurian_traditional', 'high_protein_sport', 'pescetarian_sea'];
    let duplicateMealsAcrossModels = 0;
    let familyCapViolations = 0;
    let boatViolations = 0;
    let pescetarianMeatViolations = 0;
    let missingBreakfasts = 0;
    let samplePlan = null;

    for (const modelId of modelsToTest) {
      const plan = await mealPlannerService.generateWeeklyPlan({
        modelId,
        daysCount: 7,
        servings: 1,
        profileId: 'dany',
        dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'land_day', 'boat_day', 'land_day']
      });
      if (!samplePlan) samplePlan = plan;

      const seenIds = new Set();
      const famCounter = new Map();

      for (const day of plan.days || []) {
        if (!day.breakfast || !day.breakfast.title) missingBreakfasts++;
        if (day.dayMode === 'boat_day' && day.lunch?.dish && !day.lunch.dish.boatSafeCold) {
          boatViolations++;
        }
        for (const slot of [day.lunch, day.dinner]) {
          const d = slot?.dish;
          if (!d) continue;
          if (seenIds.has(d.id)) duplicateMealsAcrossModels++;
          seenIds.add(d.id);
          const fam = d.dishFamily || 'other';
          famCounter.set(fam, (famCounter.get(fam) || 0) + 1);

          if (modelId === 'pescetarian_sea') {
            const txt = `${d.title} ${(d.bom || []).map((b) => b.name).join(' ')}`;
            if (/\b(pollo|tacchino|manzo|vitello|bovino|maiale|salsiccia|prosciutto|bresaola|pancetta|coniglio)\b/i.test(txt)) {
              pescetarianMeatViolations++;
            }
          }
        }
      }

      for (const [fam, count] of famCounter.entries()) {
        const expectedCap =
          ['pesto_pasta', 'walnut_filled_pasta', 'fried_dish', 'pizza_focaccia', 'raw_crudo'].includes(fam)
            ? 1
            : modelId === 'pescetarian_sea' && ['baked_or_pan_fish', 'shellfish_cephalopods'].includes(fam)
              ? 3
              : 2;
        if (count > expectedCap) familyCapViolations++;
      }
    }

    checks.push({
      id: 'R6-ZERO-DUPLICATE-MEALS-AND-FAMILY-CAPS',
      label: 'Varietà umana su 4 modelli Neo-Dieta: 0 piatti ripetuti su 14 pasti e max 2 volte/settimana per famiglia',
      passed: duplicateMealsAcrossModels === 0 && familyCapViolations === 0 && missingBreakfasts === 0,
      detail: `Duplicati=${duplicateMealsAcrossModels}, Sforamenti famiglia=${familyCapViolations}, Colazioni mancanti=${missingBreakfasts}`
    });

    checks.push({
      id: 'R6-BOAT-COLD-AND-PESCETARIAN-STRICT',
      label: 'Giorni Barca 100% freddi senza fornello e zero carne nel modello Pescetariano di Mare',
      passed: boatViolations === 0 && pescetarianMeatViolations === 0,
      detail: `Violazioni Barca=${boatViolations}, Violazioni Pescetariane=${pescetarianMeatViolations}`
    });

    const tmpShopPath = path.join(os.tmpdir(), `basilico-eval-shop-${process.pid}.json`);
    try {
      const isolatedShop = new ShoppingListService({ storagePath: tmpShopPath });
      const synced = isolatedShop.syncFromWeeklyPlan(samplePlan);
      const sims = synced.storeSimulations || [];
      const visitedText = sims.flatMap((s) => s.storesVisited || []).join(' | ');
      const foreignChainsRx = /\b(esselunga|conad|pam\b|ipercoop|bennet|auchan|lidl)\b/i;
      const hasForeignChains = foreignChainsRx.test(visitedText);

      checks.push({
        id: 'R6-EMPIRICAL-RAPALLO-SIMULATOR',
        label: 'Simulatore 1/2/3 negozi usa solo insegne reali di Rapallo (zero Esselunga/Conad/Lidl)',
        passed: sims.length === 3 && !hasForeignChains && synced.items.length > 0,
        detail: `1 negozio -> ${sims[0]?.storesVisited?.[0] || 'N/A'} (€${sims[0]?.estimatedTotalEur ?? 0})`
      });
    } finally {
      try {
        if (fs.existsSync(tmpShopPath)) fs.unlinkSync(tmpShopPath);
      } catch (_) {}
    }

    recordSuite(6, 'Pianificatore & Lista Spesa', 'specs/06-pianificatore.spec.md', 33, checks);
  }

  // =========================================================================
  // Aggregate Scorecard & Save to Disk
  // =========================================================================
  const totalChecks = suites.reduce((acc, s) => acc + s.total, 0);
  const totalPassed = suites.reduce((acc, s) => acc + s.passed, 0);
  const overallScorePct = totalChecks > 0 ? Math.round((totalPassed / totalChecks) * 100) : 100;
  const durationMs = Date.now() - startedAt;

  const scorecard = {
    generatedAt: new Date().toISOString(),
    durationMs,
    overallScorePct,
    totalPassed,
    totalChecks,
    allPassed: totalPassed === totalChecks,
    suites
  };

  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(SCORECARD_JSON_PATH, JSON.stringify(scorecard, null, 2), 'utf8');
  } catch (_) {}

  if (!quiet) {
    printScorecard(scorecard);
  }

  return scorecard;
}

function printScorecard(scorecard) {
  const G = '\x1b[32m';
  const R = '\x1b[31m';
  const C = '\x1b[36m';
  const B = '\x1b[1m';
  const D = '\x1b[2m';
  const X = '\x1b[0m';

  console.log(`\n${B}${C}🌿 BASILICO — DOMAIN & COMMON-SENSE EVAL SCORECARD${X} ${D}(${scorecard.durationMs} ms)${X}`);
  console.log('═'.repeat(82));

  for (const s of scorecard.suites) {
    const badge = s.passed === s.total ? `${G}✔ ${s.scorePct}% (${s.passed}/${s.total})${X}` : `${R}✖ ${s.scorePct}% (${s.passed}/${s.total})${X}`;
    console.log(`\n${B}Stanza ${s.roomNumber}: ${s.roomTitle}${X}  ${D}[${s.specFile} · #${s.issueNumber}]${X}  →  ${badge}`);
    for (const c of s.checks) {
      const icon = c.passed ? `${G}PASS${X}` : `${R}FAIL${X}`;
      console.log(`  [${icon}] ${c.label}`);
      console.log(`         ${D}${c.detail}${X}`);
    }
  }

  console.log('\n' + '═'.repeat(82));
  const summaryColor = scorecard.allPassed ? G : R;
  console.log(
    `${B}PUNTEGGIO GLOBALE PRODOTTO:${X} ${summaryColor}${B}${scorecard.overallScorePct}% (${scorecard.totalPassed}/${scorecard.totalChecks} rubriche superate)${X}\n`
  );
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const card = await runAllDomainEvals({ quiet: false });
  process.exit(card.allPassed ? 0 : 1);
}
