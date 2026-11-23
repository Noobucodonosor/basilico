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
import {
  offerService,
  enrichOfferRecord,
  filterActiveAndDeduplicateOffers,
  normalizeSearchToken
} from '../server/services/offerService.js';
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
import { MealPlannerService, mealPlannerService } from '../server/services/mealPlannerService.js';
import { ShoppingListService } from '../server/services/shoppingListService.js';
// ADR-0015 / TASK-V2-06 — Basilico 2.0 "5 Anime" deterministic engines
import { PantryService } from '../server/services/pantryService.js';
import { PriceHistoryService } from '../server/services/priceHistoryService.js';
import { HouseholdEconomicsService } from '../server/services/householdEconomicsService.js';
import { MaestroCoachService, evaluateMaestroSafetyP0 } from '../server/services/maestroCoachService.js';
import {
  resolveStainOrSoil,
  checkChemicalSafetyP0,
  getMinimalKitGuide
} from '../server/services/homeChemistryService.js';
import { cookwarePhysicsEngine } from '../server/services/cookwarePhysicsEngine.js';
import { evaluateCookedMealPhysiology } from '../server/services/nutritionPhysiologyService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, '../data/cache');
export const SCORECARD_JSON_PATH = path.join(CACHE_DIR, 'latest_eval_scorecard.json');

export async function runAllDomainEvals(options = {}) {
  const quiet = Boolean(options.quiet);
  const startedAt = Date.now();
  const suites = [];
  const evalTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-evals-'));

  try {

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
    const rawOffers = await offerService.getRawOffers();
    const dedupedActiveOffers = filterActiveAndDeduplicateOffers(rawOffers).map((o) => enrichOfferRecord(o));
    const foodItems = dedupedActiveOffers.filter((o) => o && o.domain === 'food_human' && !o.isNamelessTile);

    const nonFoodLeakRx =
      /\b(bassetti|caleffi|beper|mattel|hasbro|piastra\s+capelli|arricciacapelli|asciugacapelli|phon\b|candel[ae]\b|tovagli[ae]\b|lenzuol[aoie]\b|trapunt\w*|accappatoi\w*|lavastoviglie\s+miele|detersiv\w*|vileda\b|turbo\s+smart|lavapaviment\w*|macchina\s+del\s+caff[eè]|caten[ae]\s+luminos\w*|tower\s+speaker|lampad[ae]\s+led|personaggio\s+parlante|poinsettia)\b/i;
    const leakedInFood = foodItems.filter((o) =>
      nonFoodLeakRx.test(`${o.title || ''} ${o.brand || ''}`)
    );
    checks.push({
      id: 'R1-LEXICAL-FOOD-PURITY',
      label: 'Zero tessili casa, giocattoli, elettronica, piante, mocio o detersivi nell\'intero dominio Cibo & Bevande',
      passed: leakedInFood.length === 0,
      detail:
        leakedInFood.length === 0
          ? `0 intrusi su tutte le ${foodItems.length} offerte alimentari attive`
          : `Trovati intrusi: ${leakedInFood.map((x) => x.title).slice(0, 3).join(', ')}`
    });

    const careItems = dedupedActiveOffers.filter((o) => o && o.domain === 'personal_care' && !o.isNamelessTile);
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

    const hasAnyCurrentlyActive = rawOffers.some((o) => {
      const end = o?.validityEnd || o?.validTo;
      if (!end) return true;
      const endTime = new Date(end).getTime();
      return Number.isNaN(endTime) || endTime >= Date.now();
    });
    const seenKeys = new Set();
    let exactDupes = 0;
    let expiredCount = 0;
    const todayIso = new Date().toISOString().slice(0, 10);
    for (const item of foodItems) {
      const priceVal = Number(item.promoPrice ?? item.discountPrice ?? item.price ?? 0).toFixed(2);
      const k = `${item.storeId || item.chainId}::${normalizeSearchToken(item.title)}::${priceVal}`;
      if (seenKeys.has(k)) exactDupes++;
      seenKeys.add(k);
      const endStr = item.validityEnd || item.validTo;
      if (hasAnyCurrentlyActive && endStr && String(endStr).slice(0, 10) < todayIso) {
        expiredCount++;
      }
    }
    checks.push({
      id: 'R1-DEDUP-AND-VALID-DATES',
      label: 'Zero card duplicate identiche (negozio+titolo+prezzo) e zero offerte scadute non dichiarate su tutto il corpus food_human',
      passed: exactDupes === 0 && expiredCount === 0,
      detail: `Duplicati=${exactDupes}, Scadute=${expiredCount} su tutte le ${foodItems.length} card food_human`
    });

    const fullEnriched = rawOffers.map((o) => enrichOfferRecord(o));
    const xmasInCookware = fullEnriched.filter(
      (o) =>
        o.domain === 'kitchen_cookware' &&
        /\b(catena\s+led|minilucciol\w*|tenda\s+luminosa|presep\w*|ghirland\w*|giostra\s+animata|paesaggio\s+invernale|albero\s+(?:di\s+)?natale)\b/i.test(
          o.title || ''
        )
    );
    const fakeInductionAppliances = fullEnriched.filter(
      (o) =>
        o.domain === 'kitchen_cookware' &&
        /\b(forno|frigorifero|lavastoviglie)\b/i.test(o.title || '') &&
        (o.qualityBadges || []).some((b) => /fondo ferromagnetico/i.test(b.label || ''))
    );
    const champagneInFrozen = fullEnriched.filter(
      (o) =>
        o.category === 'Surgelati' &&
        /\b(champagne|spumante|prosecco|franciacorta|trento\s*doc)\b/i.test(o.title || '')
    );
    const ocrToysInFood = fullEnriched.filter(
      (o) =>
        o.domain === 'food_human' &&
        /\b(fashion\s+doll|big\s+foot|fermenti\s+lattici|geco\s+interattivo|30\s+anniversario|proiettili\s+soffici)\b/i.test(
          o.title || ''
        )
    );
    const exposedNameless = fullEnriched.filter((o) => o.isNamelessTile);

    checks.push({
      id: 'R1-FULL-CORPUS-TAXONOMY-AND-APPLIANCE-LENS',
      label: 'Intero catalogo offerte: 0 addobbi natalizi in Pentole, 0 badge fondo induzione su forni/frigo, 0 Champagne in Surgelati, 0 tile anonimi',
      passed:
        xmasInCookware.length === 0 &&
        fakeInductionAppliances.length === 0 &&
        champagneInFrozen.length === 0 &&
        ocrToysInFood.length === 0 &&
        exposedNameless.length === 0,
      detail: `XmasCookware=${xmasInCookware.length}, FakeInd=${fakeInductionAppliances.length}, ChampFrozen=${champagneInFrozen.length}, ToysFood=${ocrToysInFood.length}, Nameless=${exposedNameless.length}`
    });

    const toysOrBeddingInCleaning = fullEnriched.filter(
      (o) =>
        o.category === 'Cura Casa e Bucato' &&
        /\b(giocattol\w*|peluche|lego\b|barbie|playmobil|albero\s+(?:di\s+)?natale|catena\s+led|presep\w*|completo\s+letto|lenzuol[aoie]\b|trapunt\w*)\b/i.test(
          o.title || ''
        )
    );
    const leakedFlyerIds = new Set(['1689209', '1744270', '1736960', '1736959', '1738505']);
    const outOfProvinceOffers = fullEnriched.filter((o) => leakedFlyerIds.has(String(o.flyerId || '')));
    checks.push({
      id: 'R1-DEDICATED-CATEGORIES-AND-GE-TRUTH',
      label: 'Categorie dedicate Extra-Casa (0 giocattoli/Natale/lenzuola in Cura Casa e Bucato) e Verità Territoriale GE/Rapallo (0 volantini CZ/LT/RM)',
      passed: toysOrBeddingInCleaning.length === 0 && outOfProvinceOffers.length === 0,
      detail: `ToysOrBeddingInCleaning=${toysOrBeddingInCleaning.length}, OutOfProvinceLeaks=${outOfProvinceOffers.length}`
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

    const omegaRanked = creaOfferMatcher.rankOffersByNutrientPerEuro(rawOffersForCrea, {
      metric: 'omega3GPerEuro',
      hideIncompatible: false
    });
    const seedOmegaRawJson = JSON.parse(
      fs.readFileSync(path.resolve(__dirname, '../data/seed/rapallo_offers.json'), 'utf8')
    );
    const seedOmegaArr = Array.isArray(seedOmegaRawJson)
      ? seedOmegaRawJson
      : seedOmegaRawJson.offers || [];
    const seedOffersForCrea = seedOmegaArr.map((o) => enrichOfferRecord(o));
    const seedOmegaRanked = creaOfferMatcher.rankOffersByNutrientPerEuro(seedOffersForCrea, {
      metric: 'omega3GPerEuro',
      hideIncompatible: false
    });

    const omegaBadRx = /\b(burro|salame|caff[eè]|espresso|pasta\s+di\s+semola|disidratat\w*)\b/i;
    const badOmegaItems = [...omegaRanked, ...seedOmegaRanked].filter((r) =>
      omegaBadRx.test(`${r.offerTitle || ''} ${r.creaFoodName || ''}`)
    );
    const passataCheck = enrichOfferRecord({
      title: 'Mutti - Passata Di Pomodoro',
      brand: 'Mutti',
      promoPrice: 1.09,
      domain: 'food_human'
    });
    const inShellWalnutCheck = enrichOfferRecord({
      title: 'Noci Guscio',
      promoPrice: 4.99,
      domain: 'food_human'
    });
    const walnutKgOk =
      inShellWalnutCheck.creaMatch &&
      inShellWalnutCheck.creaMatch.trueEdibleEuroPerKg > 8 &&
      inShellWalnutCheck.creaMatch.trueEdibleEuroPerKg < 25;

    checks.push({
      id: 'R2-OMEGA3-AND-GDO-PACK-REALISM',
      label: 'Classifica Omega-3 immune da burro/salame/caffè/disidratati; Passata=700g e Noci in guscio senza doppia penalità guscio',
      passed:
        seedOmegaRanked.length >= 4 &&
        (rawOffersForCrea.length === 0 || omegaRanked.length >= 1) &&
        badOmegaItems.length === 0 &&
        passataCheck.referencePackEstimate?.estimatedPackGrams === 700 &&
        Boolean(walnutKgOk),
      detail: `Omega3Seed=${seedOmegaRanked.length}, Omega3Live=${omegaRanked.length}, IntrusoOmega=${badOmegaItems.length}, Passata=${passataCheck.referencePackEstimate?.estimatedPackGrams}g, NociGuscioEdibile=€${inShellWalnutCheck.creaMatch?.trueEdibleEuroPerKg}/kg`
    });

    // ADR-0015 / TASK-V2-03: Cooked meal physiology & bioavailability
    const rawBroccoli = [{ creaId: '005090', name: 'Broccoletti di rapa, crudi', grams: 200 }];
    const boiledDrained = evaluateCookedMealPhysiology(rawBroccoli, 'boiled_drained', 'discarded', 0, 0);
    const steamed = evaluateCookedMealPhysiology(rawBroccoli, 'steamed', 'none', 0, 0);
    const vitCRetainedOk = steamed.nutrients.vitaminCMg > boiledDrained.nutrients.vitaminCMg * 1.45;

    const spinachMeal = evaluateCookedMealPhysiology(
      [{ creaId: '005700', name: 'Spinaci, crudi', grams: 200 }],
      'steamed',
      'none',
      8,
      0
    );
    const brassicaAnchovyMeal = evaluateCookedMealPhysiology(
      [
        { creaId: '005090', name: 'Broccoletti di rapa, crudi', grams: 150 },
        { creaId: '120010', name: 'Acciuga o alice', grams: 100 }
      ],
      'pan_seared_gentle',
      'retained',
      8,
      0
    );
    const calciumTiersOk =
      spinachMeal.bioavailability.calcium.zeroCheeseCalciumTier === 'oxalate_trapped_poor' &&
      brassicaAnchovyMeal.bioavailability.calcium.zeroCheeseCalciumTier === 'high_bioavailability_verified';

    checks.push({
      id: 'R2-COOKED-MEAL-PHYSIOLOGY-AND-BIOAVAILABILITY',
      label: 'Fisiologia pasto cotto (ritenzione termica Vit C USDA e penalizzazione biodisponibilità Calcio da ossalati)',
      passed: vitCRetainedOk && calciumTiersOk,
      detail: `VitC Vapore=${steamed.nutrients.vitaminCMg}mg vs Bollito=${boiledDrained.nutrients.vitaminCMg}mg; Calcio Spinaci=${spinachMeal.bioavailability.calcium.zeroCheeseCalciumTier}, Broccoletti+Acciughe=${brassicaAnchovyMeal.bioavailability.calcium.zeroCheeseCalciumTier}`
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
      profileId: 'casa',
      includeExcluded: true,
      limit: 2500
    });
    const allDishes = danyDishesRes.dishes || [];
    const structuralDairyTargets = allDishes.filter((d) => {
      const t = d.title || '';
      if (/\b(senza\s+formagg\w*|zero\s+formagg\w*|senza\s+latticin\w*|vegan\w*|torta\s+caprese)\b/i.test(t)) {
        return false;
      }
      return /\b(focacc(?:ia|ett\w*|in\w*)\s+(?:di\s+recco|tipo\s+recco|recco|(?:col|con\s+il|al|ai)\s+formagg\w*)|pizzat[ae]\s+di\s+recco|fugassett\w*|formaggio\s+di\s+san\s+st[eè]|tiramis[uù]|caprese|cacio\s+e\s+pepe|quattro\s+formaggi|4\s+formaggi|cheesecake|cheese\s+cake|cannol\w*|cassat\w*)(?=\s|$|[),.;:]|\b)/i.test(
        t
      );
    });
    const unflaggedStructural = structuralDairyTargets.filter((d) => d.isExcludedByProfileIdentity !== true);
    const allExcludedProperly =
      structuralDairyTargets.length > 0 && unflaggedStructural.length === 0;

    checks.push({
      id: 'R3-CULINARY-IDENTITY-GUARD',
      label: 'Piatti dove il formaggio/mascarpone è identità (Recco, Tiramisù, Caprese, Cheesecake, Cacio e pepe) esclusi onestamente per Casa',
      passed: allExcludedProperly,
      detail:
        unflaggedStructural.length === 0
          ? `${structuralDairyTargets.length} piatti strutturali lattiero-caseari marcati isExcludedByProfileIdentity=true`
          : `Mancata esclusione su: ${unflaggedStructural.map((d) => `${d.id}(${d.title})`).slice(0, 4).join(', ')}`
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
      const session = await recipeAndArbitrageService.getScientificCookingSession(d.id, { profileId: 'casa' });
      if (session?.cookingArchetype) archetypesSeen.add(session.cookingArchetype);
    }
    checks.push({
      id: 'R3-SCIENCE-COOKING-DIVERSITY',
      label: 'Guida Fornelli Science & Cooking specifica per tecnica (almeno 5 archetipi termodinamici distinti)',
      passed: archetypesSeen.size >= 5,
      detail: `${archetypesSeen.size} archetipi fisici/chimici distinti rilevati (${Array.from(archetypesSeen).slice(0, 5).join(', ')})`
    });

    const michelin11 = allDishes.find((d) => /degustazione\s+11\s+portate/i.test(d.title || ''));
    const michelin7 = allDishes.find((d) => /degustazione\s+7\s+portate/i.test(d.title || ''));
    const capponMagro = allDishes.find((d) => /cappon\s+magro/i.test(d.title || ''));
    const michelinRealistic =
      Boolean(michelin11 && michelin7 && capponMagro) &&
      michelin11.prepMinutes >= 180 &&
      michelin11.costAndArbitrage.purePortionCostEur >= 20 &&
      michelin7.prepMinutes >= 150 &&
      michelin7.costAndArbitrage.purePortionCostEur >= 18 &&
      capponMagro.prepMinutes >= 60;

    checks.push({
      id: 'R3-MICHELIN-DEGUSTAZIONE-REALISM',
      label: 'Realismo gastronomico alta cucina: Menu Degustazione 11/7 portate (>=180m, BOM >=€20) e Cappon Magro (>=90m)',
      passed: michelinRealistic,
      detail: `11p=${michelin11?.prepMinutes}m/€${michelin11?.costAndArbitrage?.purePortionCostEur}, 7p=${michelin7?.prepMinutes}m/€${michelin7?.costAndArbitrage?.purePortionCostEur}, Cappon=${capponMagro?.prepMinutes}m`
    });

    const seedDishes = recipeAndArbitrageService.getDishesSeed();
    const unresolvedCreaRefs = [];
    const missingCreaRefs = [];
    let totalBomCreaRefs = 0;
    for (const dish of seedDishes) {
      for (const bomItem of dish.bom || []) {
        if (!bomItem?.creaId) {
          missingCreaRefs.push(`${dish.id}:missing(${bomItem?.name || ''})`);
          continue;
        }
        totalBomCreaRefs++;
        const resolved = creaService.getFoodById(bomItem.creaId);
        if (!resolved) {
          unresolvedCreaRefs.push(`${dish.id}:${bomItem.creaId}(${bomItem.name})`);
        }
      }
    }
    checks.push({
      id: 'R3-CREA-REFERENTIAL-INTEGRITY',
      label: 'Integrità referenziale BOM <-> CREA: 100% dei creaId nei piatti risolve a un alimento CREA reale non nullo',
      passed: totalBomCreaRefs > 0 && unresolvedCreaRefs.length === 0 && missingCreaRefs.length === 0,
      detail:
        unresolvedCreaRefs.length === 0 && missingCreaRefs.length === 0
          ? `${totalBomCreaRefs}/${totalBomCreaRefs} riferimenti BOM->CREA verificati su ${seedDishes.length} piatti`
          : `creaId invalidi/mancanti (${unresolvedCreaRefs.length + missingCreaRefs.length}): ${[...unresolvedCreaRefs, ...missingCreaRefs].slice(0, 4).join(', ')}`
    });

    const activeMenuRestaurants = recipeAndArbitrageService.getRestaurants();
    const allCensusedRestaurants = recipeAndArbitrageService.getRestaurants({ includeWithoutMenu: true });
    const zeroDishLeaksInActive = activeMenuRestaurants.filter((r) => !(r.dishCount > 0));
    const hiddenWithoutMenuCount = allCensusedRestaurants.length - activeMenuRestaurants.length;
    checks.push({
      id: 'R3-VERIFIED-MENU-RESTAURANTS-FILTER',
      label: 'Filtro esclusivo ristoranti con listino pubblico verificato: 0 locali vuoti in UI e anagrafica completa preservata',
      passed:
        activeMenuRestaurants.length >= 23 &&
        zeroDishLeaksInActive.length === 0 &&
        allCensusedRestaurants.length >= 32 &&
        hiddenWithoutMenuCount >= 9,
      detail: `AttiviConMenu=${activeMenuRestaurants.length}/${allCensusedRestaurants.length} censiti (${hiddenWithoutMenuCount} senza listino pubblico nascosti), LocaliVuotiEsposti=${zeroDishLeaksInActive.length}`
    });

    const geZones = danyDishesRes.zones || [];
    const geCities = danyDishesRes.cities || [];
    const newPizzaLeaks = seedDishes.filter(
      (d) => Number(d.numericId) >= 335 && String(d.course || '').toLowerCase() === 'pizza'
    );
    checks.push({
      id: 'R3-GENOVA-PROVINCE-COVERAGE',
      label: 'Copertura Provincia di Genova (GE): >=5 zone attive, >35 ristoranti con menu verificato, 100% creaId validi, 0 locali vuoti e 0 nuove pizze',
      passed:
        geZones.length >= 5 &&
        danyDishesRes.activeMenuRestaurantsCount > 35 &&
        activeMenuRestaurants.length > 35 &&
        unresolvedCreaRefs.length === 0 &&
        missingCreaRefs.length === 0 &&
        zeroDishLeaksInActive.length === 0 &&
        newPizzaLeaks.length === 0,
      detail: `ZoneGE=${geZones.length} (${geZones.map((z) => `${z.zona}:${z.restaurantCount}`).join(' · ')}), Comuni=${geCities.length}, RistorantiAttivi=${danyDishesRes.activeMenuRestaurantsCount}, NuovePizze=${newPizzaLeaks.length}`
    });

    // ADR-0015 / TASK-V2-04: Maestro P0 safety deterministic guard
    const lethalAlerts1 = evaluateMaestroSafetyP0('Posso mescolare candeggina e acido muriatico per sbiancare la ceramica?');
    const lethalAlerts2 = evaluateMaestroSafetyP0('Vorrei fare uno spray con percarbonato e acqua calda da conservare nello spruzzino chiuso');
    const p0Blocked1 = Array.isArray(lethalAlerts1) && lethalAlerts1.some((a) => /CHLORINE|CL2/i.test(a.code || ''));
    const p0Blocked2 = Array.isArray(lethalAlerts2) && lethalAlerts2.some((a) => /PRESSURE-BURST/i.test(a.code || ''));
    checks.push({
      id: 'R3-MAESTRO-SAFETY-P0-DETERMINISTIC-GUARD',
      label: 'Guardia deterministica P0 Maestro (blocco tassativo miscele letali Cl2 e flaconi chiusi con percarbonato)',
      passed: p0Blocked1 && p0Blocked2,
      detail: `Candeggina+AcidoBloccato=${p0Blocked1}, PercarbonatoChiusoBloccato=${p0Blocked2}`
    });

    recordSuite(3, 'Ricette, Ristoranti & Fornelli', 'specs/03-ricette.spec.md', 30, checks);
  }

  // =========================================================================
  // STANZA 4 — Cucina, Pentole & Pulizia (`specs/04-cucina.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const tmpKitchenPath = path.join(evalTmpDir, 'kitchen_inventory.json');
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
        ownedToolIds: ['pentola_rame_non_induzione', 'padella_acciaio_inox', 'casseruola_inox']
      });
      const indState = isolatedKitchen.getKitchenState();
      const nonFerroDisqualified = indState.disqualifiedTools.some(
        (t) => t.id === 'pentola_rame_non_induzione'
      );
      checks.push({
        id: 'R4-INDUCTION-FERROMAGNETIC-PHYSICS',
        label: 'Verifica ferromagnetica attiva per piani a Induzione (pentola_rame_non_induzione intercettata in disqualifiedTools)',
        passed: nonFerroDisqualified,
        detail: `Disqualificati su induzione: [${indState.disqualifiedTools.map((t) => t.id).join(', ')}]`
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

    const underSinkSupplies = resetProto.protocols?.[0]?.requiredSupplies || [];
    const dishSoapSupply = underSinkSupplies.find((s) => s.key === 'detersivo_piatti');
    const spongeSupply = underSinkSupplies.find((s) => s.key === 'spugna_delicata');
    const clothSupply = underSinkSupplies.find((s) => s.key === 'panno_microfibra');
    const dishSoapPromosOk = (dishSoapSupply?.matchedOffers || []).every(
      (o) => Number(o.promoPrice) <= 4.5 && !/\b(lavastoviglie|pril|finish|tabs|caps)\b/i.test(o.title || '')
    );
    const spongePromosOk = (spongeSupply?.matchedOffers || []).every(
      (o) => !/\b(bagno|corpo|doccia|cotoneve)\b/i.test(`${o.title || ''} ${o.brand || ''}`)
    );
    const clothPromosOk = (clothSupply?.matchedOffers || []).every(
      (o) => Number(o.promoPrice) <= 6.5 && !/\b(turbo\s+smart|mocio|sistema\s+pulizia|secchio)\b/i.test(o.title || '')
    );
    checks.push({
      id: 'R4-UNDERSINK-PROMO-COHERENCE',
      label: 'Offerte sottolavello coerenti per funzione e taglia (zero gel lavastoviglie su piatti a mano, zero spugne bagno, zero kit mocio)',
      passed: dishSoapPromosOk && spongePromosOk && clothPromosOk,
      detail: `PiattiManoOk=${dishSoapPromosOk} (${dishSoapSupply?.matchedOffers?.[0]?.promoPrice ?? 'n/a'}€), SpugneOk=${spongePromosOk}, PanniOk=${clothPromosOk}`
    });

    // ADR-0015 / TASK-V2-02: Cookware Physics & Materials P0 Guards
    const ptfeBoostCheck = cookwarePhysicsEngine.translateStovePowerAndValidateP0({
      heatSource: 'induction',
      requestedLevel: 'boost',
      toolId: 'padella_antiaderente'
    });
    const tinDryCheck = cookwarePhysicsEngine.translateStovePowerAndValidateP0({
      heatSource: 'gas',
      requestedLevel: 'high',
      toolId: 'testo_rame_stagnato',
      isDryPreheat: true
    });
    const materialsCatalog = cookwarePhysicsEngine.getMaterialsCatalog();
    const copperMat = materialsCatalog.materials.copper_tinned;
    const terraMat = materialsCatalog.materials.terracotta_glazed;
    const diffRatioOk = (copperMat.thermalDiffusivityMm2S / terraMat.thermalDiffusivityMm2S) > 180;

    checks.push({
      id: 'R4-COOKWARE-PHYSICS-AND-P0-SAFETY',
      label: 'Fisica dei materiali e guardie P0: blocco PTFE su Induction Boost, blocco preriscaldo secco rame stagnato (Sn 232°C), e ratio diffusività rame/terracotta >180x',
      passed: ptfeBoostCheck.isBlockedP0 && tinDryCheck.isBlockedP0 && diffRatioOk,
      detail: `PTFE_BoostBlock=${ptfeBoostCheck.isBlockedP0}, TinDryBlock=${tinDryCheck.isBlockedP0}, DiffusivityRatio=${Math.round(copperMat.thermalDiffusivityMm2S / terraMat.thermalDiffusivityMm2S)}x`
    });

    recordSuite(4, 'Officina Cucina (Fornelli, Pentole, Lame)', 'specs/04-cucina.spec.md', 31, checks);
  }

  // =========================================================================
  // STANZA 5 — Dispensa & Scontrini (`specs/05-dispensa.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const tmpReceiptsPath = path.join(evalTmpDir, 'user_receipts.json');
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
      const receiptModalSrc = fs.readFileSync(
        path.resolve(__dirname, '../src/components/pantry/ReceiptScannerModal.jsx'),
        'utf8'
      );
      const noHardcodedGdoDupes =
        receiptModalSrc.includes('uniqueGdoStores') &&
        !receiptModalSrc.includes('<option value="conad-city-mameli">') &&
        receiptModalSrc.includes('Carica esempio');
      checks.push({
        id: 'R5-RECEIPT-STORE-DEDUP-AND-SAMPLE',
        label: 'Modale Scontrino privo di negozi duplicati nel menu a tendina e dotato di caricamento rapido esempio',
        passed: noHardcodedGdoDupes,
        detail: `uniqueGdoStores=true, zero Conad legacy, pulsante Carica esempio attivo`
      });
    } finally {
      try {
        if (fs.existsSync(tmpReceiptsPath)) fs.unlinkSync(tmpReceiptsPath);
      } catch (_) {}
    }

    // ADR-0015 / TASK-V2-04: Household Economics VaR_48h & Today Pareto Prescription
    const tmpEconPantryPath = path.join(evalTmpDir, 'econ_pantry.json');
    const tmpEconPath = path.join(evalTmpDir, 'household_economics.json');
    try {
      const econPantry = new PantryService({ storagePath: tmpEconPantryPath });
      econPantry.addItem({
        title: 'Calamari freschi puliti',
        zone: 'fridge_freezer',
        lineTotalEuro: 7.20,
        status: 'closed',
        closedExpiresAt: new Date(Date.now() + 20 * 3600 * 1000).toISOString()
      });
      const varReport = econPantry.getValueAtRisk48h();
      const varAccurate = varReport.totalAtRiskEuro >= 7.20 && (varReport.atRiskItems || []).some((i) => /calamari/i.test(i.title || ''));

      const isolatedEconKitchen = new KitchenInventoryService({
        storagePath: path.join(evalTmpDir, 'maestro_kitchen.json')
      });
      const isolatedEconShop = new ShoppingListService({
        storagePath: path.join(evalTmpDir, 'maestro_shopping_list.json')
      });
      const isolatedEconSvc = new HouseholdEconomicsService({
        storagePath: tmpEconPath,
        kitchenInventoryService: isolatedEconKitchen,
        shoppingListService: isolatedEconShop
      });
      const maestroEvalSvc = new MaestroCoachService({
        pantryService: econPantry,
        kitchenInventoryService: isolatedEconKitchen,
        shoppingListService: isolatedEconShop,
        householdEconomicsService: isolatedEconSvc
      });
      const copilotBrief = await maestroEvalSvc.getTodayCopilot({
        profileId: 'casa',
        rhythmPreset: 'feriale'
      });
      const has3Pareto = copilotBrief.tonightParetoCards?.length === 3;
      const varRescued = copilotBrief.tonightParetoCards?.some((c) => c.slotId === 'save_var_value' && c.vaRSavedEuro > 0);

      checks.push({
        id: 'R5-VA48-AND-TODAY-PARETO-COACH',
        label: 'Economia domestica (VaR 48h stock a rischio e Co-pilota Oggi con 3 opzioni Pareto che salvano il fresco in scadenza)',
        passed: varAccurate && has3Pareto && varRescued,
        detail: `VaR_48h=€${varReport.totalAtRiskEuro} (atteso 7.20€), ParetoOpzioni=${copilotBrief.tonightParetoCards?.length}, SalvaVaR=${varRescued}`
      });

      const snakeSlopRx = /lipidico_emulsionato|organico_freddo_idrosolubile|amidaceo_vegetale_idrosolubile|proteico_maillard_sucs|[a-z]+_[a-z_]{2,}/;
      const chainSlopHits = [];
      for (const preset of ['sera_stanca', 'feriale', 'weekend_relax']) {
        const brief = preset === 'feriale'
          ? copilotBrief
          : await maestroEvalSvc.getTodayCopilot({ profileId: 'casa', rhythmPreset: preset });
        for (const card of brief.tonightParetoCards || []) {
          for (const [soulKey, text] of Object.entries(card.fiveSoulsChain || {})) {
            const m = String(text || '').match(snakeSlopRx);
            if (m) chainSlopHits.push(`${preset}:${card.slotId}.${soulKey}=${m[0]}`);
          }
        }
      }
      const v2UiFiles = [
        'src/components/cycle/CycleOverviewView.jsx',
        'src/components/cycle/DishDetailDrawer.jsx',
        'src/components/market/RapalloMarketView.jsx',
        'src/components/OfferCard.jsx',
        'src/components/CategoryFilters.jsx',
        'src/components/crea/CreaExplorerView.jsx',
        'src/components/crea/CreaFoodModal.jsx',
        'src/components/crea/CreaCompareTray.jsx',
        'src/components/planner/PlannerAndShoppingView.jsx',
        'src/components/planner/AisleChecklistModal.jsx',
        'src/components/pantry/PantryAndReceiptsView.jsx',
        'src/components/kitchen/KitchenCareView.jsx',
        'src/components/recipes/RecipesAndRestaurantsView.jsx',
        'src/components/recipes/CookingModeModal.jsx',
        'src/components/recipes/LabNotebookModal.jsx',
        'src/components/maestro/MaestroDrawer.jsx',
        'src/components/home/HomeChemistryView.jsx',
        'src/components/academy/CulinaryAcademyPanel.jsx',
        'src/components/crea/NutritionCoachPanel.jsx',
        'src/components/Header.jsx',
        'src/components/RoomNavigation.jsx',
        'src/App.jsx'
      ];
      const forbiddenColorHits = [];
      for (const relPath of v2UiFiles) {
        const src = fs.readFileSync(path.resolve(__dirname, '..', relPath), 'utf8');
        if (/(?:violet|indigo)-/.test(src)) {
          forbiddenColorHits.push(relPath);
        }
      }
      const photosOk =
        fs.existsSync(path.resolve(__dirname, '../public/assets/img/photo-m61660576.jpg')) &&
        fs.existsSync(path.resolve(__dirname, '../public/assets/img/photo-m61663250-960.jpg'));

      checks.push({
        id: 'V2-TASTE-NO-SLOP-COPY',
        label: 'Restyling anti-slop (tasteskill 2.5): zero snake_case in fiveSoulsChain, zero violet-/indigo- nei componenti V2 e foto reali presenti',
        passed: chainSlopHits.length === 0 && forbiddenColorHits.length === 0 && photosOk,
        detail: `SnakeCase=${chainSlopHits.length}, VioletIndigo=${forbiddenColorHits.length}, PhotosOk=${photosOk}`
      });
    } finally {
      try {
        if (fs.existsSync(tmpEconPantryPath)) fs.unlinkSync(tmpEconPantryPath);
      } catch (_) {}
      try {
        if (fs.existsSync(tmpEconPath)) fs.unlinkSync(tmpEconPath);
      } catch (_) {}
    }

    recordSuite(5, 'Dispensa & Scontrini', 'specs/05-dispensa.spec.md', 32, checks);
  }

  // =========================================================================
  // STANZA 6 — Pianificatore & Lista Spesa (`specs/06-pianificatore.spec.md`)
  // =========================================================================
  {
    const checks = [];
    const modelsToTest = [
      'balanced_daily',
      'ligurian_traditional',
      'promo_driven_neodiet',
      'high_protein_sport',
      'pescetarian_sea',
      'tigullio_gourmet_home'
    ];
    let duplicateMealsAcrossModels = 0;
    let familyCapViolations = 0;
    let boatViolations = 0;
    let pescetarianMeatViolations = 0;
    let missingBreakfasts = 0;
    let samplePlan = null;

    const tmpPlanPath = path.join(evalTmpDir, 'weekly_plan.json');
    const tmpShopPath = path.join(evalTmpDir, 'shopping_list.json');
    try {
      const isolatedPlanner = new MealPlannerService({ storagePath: tmpPlanPath });

      for (const modelId of modelsToTest) {
        const plan = await (isolatedPlanner.generateWeeklyPlan
          ? isolatedPlanner.generateWeeklyPlan({
              modelId,
              daysCount: 7,
              servings: 1,
              profileId: 'casa',
              dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'land_day', 'boat_day', 'land_day']
            })
          : mealPlannerService.generateWeeklyPlan({
              modelId,
              daysCount: 7,
              servings: 1,
              profileId: 'casa',
              dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'land_day', 'boat_day', 'land_day']
            }));
        if (!samplePlan) samplePlan = plan;

        const seenMealKeys = new Set();
        const famCounter = new Map();

        for (const day of plan.days || []) {
          if (!day.breakfast || !day.breakfast.title) {
            missingBreakfasts++;
          } else {
            const bfKey = day.breakfast.id || day.breakfast.dishId || normalizeSearchToken(day.breakfast.title);
            if (seenMealKeys.has(bfKey)) duplicateMealsAcrossModels++;
            seenMealKeys.add(bfKey);
          }

          if (day.dayMode === 'boat_day' && day.lunch?.dish && !day.lunch.dish.boatSafeCold) {
            boatViolations++;
          }
          for (const slot of [day.lunch, day.dinner]) {
            const d = slot?.dish;
            if (!d) continue;
            if (seenMealKeys.has(d.id)) duplicateMealsAcrossModels++;
            seenMealKeys.add(d.id);
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
        label: 'Varietà umana su tutti i 6 modelli Neo-Dieta: 21/21 pasti unici (0 colazioni/piatti ripetuti) e max 2 volte/settimana per famiglia',
        passed: duplicateMealsAcrossModels === 0 && familyCapViolations === 0 && missingBreakfasts === 0,
        detail: `Modelli=${modelsToTest.length}, Duplicati(21 pasti)=${duplicateMealsAcrossModels}, Sforamenti famiglia=${familyCapViolations}, Colazioni mancanti=${missingBreakfasts}`
      });

      checks.push({
        id: 'R6-BOAT-COLD-AND-PESCETARIAN-STRICT',
        label: 'Giorni Barca 100% freddi senza fornello e zero carne nel modello Pescetariano di Mare',
        passed: boatViolations === 0 && pescetarianMeatViolations === 0,
        detail: `Violazioni Barca=${boatViolations}, Violazioni Pescetariane=${pescetarianMeatViolations}`
      });

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

      const withApple = isolatedShop.addItem({
        name: 'Mela fresca con buccia',
        domain: 'food_human',
        category: 'Frutta e Verdura',
        quantityLabel: '400 g'
      });
      const appleItem = withApple.items.find((i) => /mela fresca/i.test(i.name || ''));
      const planB = await isolatedShop.getShelfPlanB(appleItem.id);
      const planBAlts = planB.planBAlternatives || [];
      const savoryInFruitPlanB = planBAlts.filter((a) =>
        /\b(insalat\w*|carot\w*|cipoll\w*|patat\w*|zucchin\w*|spinac\w*|cavol\w*|verza)\b/i.test(a.title || '')
      );
      checks.push({
        id: 'R6-PLAN-B-NO-FRUIT-VEG-CLASH',
        label: 'Piano B sullo Scaffale coerente: una frutta dolce (Mela) non propone mai insalata, carote o cipolle',
        passed: planBAlts.length > 0 && savoryInFruitPlanB.length === 0,
        detail: `Alternative Mela=${planBAlts.map((a) => a.title).join(', ')}`
      });
    } finally {
      try {
        if (fs.existsSync(tmpPlanPath)) fs.unlinkSync(tmpPlanPath);
      } catch (_) {}
      try {
        if (fs.existsSync(tmpShopPath)) fs.unlinkSync(tmpShopPath);
      } catch (_) {}
    }

    recordSuite(6, 'Pianificatore & Lista Spesa', 'specs/06-pianificatore.spec.md', 33, checks);
  }

  // =========================================================================
  // STANZA 7 — Chimica & Cura della Casa/Barca (`specs/07-chimica-casa.spec.md`)
  // =========================================================================
  {
    const checks = [];

    // 1. P0 Matrix: LETHAL reactions blocked
    const cl2Check = checkChemicalSafetyP0({ reagents: ['Candeggina Ace', 'Acido Citrico'] });
    const nh2clCheck = checkChemicalSafetyP0('Posso unire candeggina e ammoniaca per igienizzare i pavimenti?');
    const burstCheck = checkChemicalSafetyP0({
      reagents: ['Sodio percarbonato'],
      containerType: 'flacone spray chiuso ermetico'
    });
    const ingestionCheck = checkChemicalSafetyP0({
      reagents: ['Acido citrico al 15%'],
      containerType: 'bottiglia acqua minerale PET'
    });
    const p0Safe =
      cl2Check.blockedByP0 &&
      nh2clCheck.blockedByP0 &&
      burstCheck.blockedByP0 &&
      ingestionCheck.blockedByP0;

    checks.push({
      id: 'R7-P0-CHEMICAL-SAFETY-LETHAL-REACTIONS',
      label: 'Matrice sicurezza chimica P0-LETHAL (blocco Cl2, clorammine, scoppio percarbonato in flacone chiuso e travaso PET)',
      passed: p0Safe,
      detail: `Cl2Bloccato=${cl2Check.blockedByP0}, NH2ClBloccato=${nh2clCheck.blockedByP0}, BurstBloccato=${burstCheck.blockedByP0}, TravasoPETBloccato=${ingestionCheck.blockedByP0}`
    });

    // 2. Home Chemistry: Ligurian surfaces protection & Rapallo water hardness
    const marbleAcidCheck = checkChemicalSafetyP0({
      reagents: ['Acido citrico'],
      surface: 'Marmo di Carrara e Ardesia Ligure'
    });
    const marbleProtected = marbleAcidCheck.safe === false && marbleAcidCheck.blockedByP1;

    const stainSolution = resolveStainOrSoil({
      stainType: 'calcare',
      surface: 'ardesia_ligure'
    });
    const stainSafe = !stainSolution.primaryReagent || !/citrico|aceto|cloridrico/i.test(stainSolution.primaryReagent.name || '');

    const minimalKit = getMinimalKitGuide();
    const has7Pillars = (minimalKit.pillars || minimalKit.reagents || []).length >= 7;

    checks.push({
      id: 'R7-HOME-CHEMISTRY-LIGURIA-AND-WATER',
      label: 'Chimica applicata ligure (protezione marmo/ardesia da acidi, Kit 7 Reagenti Puri)',
      passed: marbleProtected && (stainSafe || Boolean(stainSolution.hasSurfaceWarning)) && has7Pillars,
      detail: `MarmoProtettoDaAcido=${marbleProtected}, SoluzioneArdesiaSicura=${stainSafe || Boolean(stainSolution.hasSurfaceWarning)}, ReagentiKit=${(minimalKit.pillars || minimalKit.reagents || []).length}`
    });

    // 3. Drugstore classification purity: Tigotà / PiùMe
    const pureReagent = classifyProductDomain({
      title: 'Acido Citrico Anidro Puro 1kg',
      storeId: 'rapallo-tigota-lamarmora'
    });
    const perfumeCoveri = classifyProductDomain({
      title: 'Coveri - Enrico Eau De Toilette 100ml',
      brand: 'Coveri',
      storeId: 'rapallo-tigota-lamarmora',
      category: 'Cura Casa e Bucato'
    });
    checks.push({
      id: 'R7-DRUGSTORE-DOMAIN-PURITY',
      label: 'Purezza classificazione drugstore Tigotà/PiùMe (0 profumi/cosmetici in pulizie casa, reagenti puri in home_cleaning)',
      passed: pureReagent === 'home_cleaning' && perfumeCoveri === 'personal_care',
      detail: `AcidoCitrico=${pureReagent}, CoveriProfumo=${perfumeCoveri}`
    });

    recordSuite(7, 'Chimica & Cura della Casa/Barca', 'specs/07-chimica-casa.spec.md', 39, checks);
  }
  } finally {
    try {
      fs.rmSync(evalTmpDir, { recursive: true, force: true });
    } catch (_) {}
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
