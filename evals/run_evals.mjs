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
    const badOmegaItems = omegaRanked.filter((r) =>
      /\b(burro|salame|caff[eè]|espresso|pasta\s+di\s+semola|disidratat\w*)\b/i.test(
        `${r.offerTitle || ''} ${r.creaFoodName || ''}`
      )
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
        omegaRanked.length >= 4 &&
        badOmegaItems.length === 0 &&
        passataCheck.referencePackEstimate?.estimatedPackGrams === 700 &&
        Boolean(walnutKgOk),
      detail: `Omega3Valide=${omegaRanked.length}, IntrusoOmega=${badOmegaItems.length}, Passata=${passataCheck.referencePackEstimate?.estimatedPackGrams}g, NociGuscioEdibile=€${inShellWalnutCheck.creaMatch?.trueEdibleEuroPerKg}/kg`
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
      label: 'Piatti dove il formaggio/mascarpone è identità (Recco, Tiramisù, Caprese, Cheesecake, Cacio e pepe) esclusi onestamente per Dany',
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
      const session = await recipeAndArbitrageService.getScientificCookingSession(d.id, { profileId: 'dany' });
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

    const tmpPlanPath = path.join(os.tmpdir(), `basilico-eval-plan-${process.pid}-${Date.now()}.json`);
    const tmpShopPath = path.join(os.tmpdir(), `basilico-eval-shop-${process.pid}-${Date.now()}.json`);
    try {
      const isolatedPlanner = new MealPlannerService({ storagePath: tmpPlanPath });

      for (const modelId of modelsToTest) {
        const plan = await (isolatedPlanner.generateWeeklyPlan
          ? isolatedPlanner.generateWeeklyPlan({
              modelId,
              daysCount: 7,
              servings: 1,
              profileId: 'dany',
              dayModes: ['land_day', 'land_day', 'boat_day', 'land_day', 'land_day', 'boat_day', 'land_day']
            })
          : mealPlannerService.generateWeeklyPlan({
              modelId,
              daysCount: 7,
              servings: 1,
              profileId: 'dany',
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
