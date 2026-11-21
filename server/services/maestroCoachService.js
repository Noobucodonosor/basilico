/**
 * Basilico 2.0 — Hybrid 5-Souls Maestro & "⚡ Oggi" Pareto Co-Pilot Service
 * Location: server/services/maestroCoachService.js (ADR-0015 / TASK-V2-04)
 *
 * Unifies the 5 Souls of Basilico:
 *  1. Nutrizione (CREA, LARN, Zero-Dairy Calcium, Bioavailability Synergies)
 *  2. Arte Culinaria (Science & Cooking, Ratios, Emulsions, SOS Fornelli)
 *  3. Fisica degli Strumenti (Stove × Pan Thermodynamics, PTFE/Tin/Inox Guards)
 *  4. Chimica della Casa (Soil × Surface × Active Molecule, P0 Lethal Mix Blocks)
 *  5. Economia Domestica (`VaR_48h`, Shadow Price `w_t`, `C_full`, `€/h` Store Yield, TCO)
 *
 * Guarantees:
 *  - Non-bypassable Preliminary P0 Deterministic Guardrail BEFORE any response;
 *  - Grounded Read-Only LLM Synthesis (`GEMINI_API_KEY` or `OPENAI_API_KEY`, 8s timeout, native fetch)
 *    strictly anchored to `buildHouseholdContextSnapshot()`;
 *  - Complete Offline Deterministic Scientific Engine always active without API keys or in tests.
 */

import { pantryService } from './pantryService.js';
import { kitchenInventoryService, normalizeDishCookwareIds } from './kitchenInventoryService.js';
import { userProfileService } from './userProfileService.js';
import { recipeAndArbitrageService } from './recipeAndArbitrageService.js';
import {
  offerService,
  enrichOfferRecord,
  filterActiveAndDeduplicateOffers,
  normalizeSearchToken
} from './offerService.js';
import { shoppingListService } from './shoppingListService.js';
import { householdEconomicsService } from './householdEconomicsService.js';

function throwBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

const HEAT_SOURCE_LABELS = {
  gas: 'piano a gas',
  induction: 'piano a induzione',
  electric: 'piastra elettrica',
  boat_no_stove: 'cambusa senza fornelli'
};

/**
 * Extracts a clean display title and optional technical subtitle when a dish title
 * ends with a descriptive parenthetical clause, preserving `dish.title` unchanged.
 */
function splitDishTitleAndSubtitle(rawTitle) {
  const title = String(rawTitle || '').trim();
  if (!title) return { cleanTitle: '', cleanSubtitle: null };
  const match = title.match(/^(.*?)\s*\(([^()]+)\)\s*$/);
  if (!match) {
    return { cleanTitle: title, cleanSubtitle: null };
  }
  const baseTitle = match[1].trim();
  const parenText = match[2].trim();
  const isPortionOrShortMeta =
    parenText.length < 18 &&
    !/\b(senza|zero|estrazione|riduzione|mantecatura|emulsione|frittura|latticini|formaggi|barca|cambusa)\b/i.test(
      parenText
    );
  if (!baseTitle || isPortionOrShortMeta) {
    return { cleanTitle: title, cleanSubtitle: null };
  }
  const cleanSubtitle = parenText.replace(/\s*&\s*/g, ' e ').replace(/\s+/g, ' ').trim();
  return {
    cleanTitle: baseTitle,
    cleanSubtitle: cleanSubtitle || null
  };
}

/**
 * Classifies cooking technique, thermal regime, post-cooking soil & cleaning time deterministically
 * from a dish record + owned cookware + active heat source.
 */
function analyzeDishCausalChain(dish, kitchenState, varReport, economicsSvc, rhythmPreset) {
  const titleNorm = normalizeSearchToken(dish.title || '');
  const bomText = normalizeSearchToken((dish.bom || []).map((b) => b.name || '').join(' '));
  const heatSource = kitchenState.heatSource || 'gas';
  const heatSourceLabel = HEAT_SOURCE_LABELS[heatSource] || 'fornelli di casa';
  const reqTools = normalizeDishCookwareIds(dish.cookwareRequired || [], dish);
  const ownedMap = new Map((kitchenState.effectiveTools || []).map((t) => [t.id, t]));

  // Choose primary active pan/tool (preferring inox for high-heat searing if owned, else dish's mapped tool)
  let primaryTool = reqTools.map((id) => ownedMap.get(id)).find(Boolean) || kitchenState.effectiveTools?.[0] || {
    id: 'padella_antiaderente',
    name: 'Padella antiaderente',
    material: 'alluminio_rivestito_ptfe',
    maxTempC: 200
  };

  let cookingMethod = 'stovetop_medium';
  let cleaningResetMinutes = 2.0;
  let cleaningProtocolSummary = 'Lavaggio rapido (90s): acqua tiepida e poco detersivo neutro sul lato morbido della spugna.';
  let culinaryTechniqueLabel = 'Cottura espressa con mantecatura fuori fuoco sotto i 65°C per legare i succhi senza latticini.';

  if (dish.boatSafeCold || dish.course === 'piatto_unico_barca' || /\b(crud[oi]|insalat\w*|carpaccio|tartare)\b/.test(titleNorm)) {
    cookingMethod = 'cold_no_cook';
    cleaningResetMinutes = 1.0;
    cleaningProtocolSummary = 'Risciacquo veloce a freddo (45s): acqua e una goccia di sapone neutro su ciotola e coltello, zero grassi cotti.';
    culinaryTechniqueLabel = 'Assemblaggio a freddo senza fornelli: condimento equilibrato tra parte acida e olio extravergine.';
  } else if (reqTools.includes('teglia_forno') || /\b(forno|farinata|torta|gratin|ligure\s+al\s+forno)\b/.test(titleNorm)) {
    cookingMethod = 'oven_bake';
    cleaningResetMinutes = 3.5;
    cleaningProtocolSummary = 'Ammollo tiepido di 5 minuti per ammorbidire i residui, poi spugna morbida e detersivo neutro (sgrassatore solo su acciaio o vetro se i bordi sono molto bruniti).';
    culinaryTechniqueLabel = 'Cottura uniforme in forno (180–200°C) fino a doratura leggera in superficie.';
  } else if (/\b(scottat\w*|tagliata|arrosto|rosolat\w*|brace|grigli\w*|bistecc\w*)\b/.test(titleNorm)) {
    cookingMethod = primaryTool.material === 'alluminio_rivestito_ptfe' ? 'stovetop_medium' : 'stovetop_high';
    cleaningResetMinutes = primaryTool.material === 'alluminio_rivestito_ptfe' ? 1.5 : 3.0;
    cleaningProtocolSummary =
      primaryTool.material === 'alluminio_rivestito_ptfe'
        ? 'Lascia intiepidire la padella sotto gli 80°C, poi lava in 90 secondi con spugna morbida e detersivo neutro (niente pagliette o sgrassatori forti).'
        : 'Sfuma il fondo ancora caldo con poca acqua per sciogliere subito i succhi di cottura, poi lava la padella in circa 2 minuti.';
    culinaryTechniqueLabel =
      primaryTool.material === 'alluminio_rivestito_ptfe'
        ? 'Scottatura controllata sotto i 190°C su padella antiaderente ben asciutta, senza usare la funzione Boost.'
        : 'Rosolatura vivace sopra i 165°C su padella ben calda, poi recupero dei succhi sul fondo.';
  } else if (/\b(vapore|lessat\w*|bollito|minestr\w*|zuppa|vellutat\w*)\b/.test(titleNorm)) {
    cookingMethod = 'stovetop_gentle';
    cleaningResetMinutes = 1.5;
    cleaningProtocolSummary = 'Risciacquo immediato prima che l’amido si fissi, poi passata veloce con detersivo neutro (60–90 secondi).';
    culinaryTechniqueLabel = 'Cottura dolce a vapore o sobbollitura leggera per preservare sapore, consistenza e vitamine.';
  }

  // Stove × Pan Physics Guardrail Note
  let physicsNote = `${primaryTool.name} su ${heatSourceLabel}: calore stabile e facile da dosare.`;
  if (cookingMethod === 'cold_no_cook') {
    physicsNote =
      heatSource === 'boat_no_stove'
        ? 'Ideale in cambusa: nessuna fiamma a bordo, si conserva al sicuro in borsa termica.'
        : 'Nessuna pentola sul fuoco: ti bastano tagliere, coltello e ciotola.';
  } else if (heatSource === 'boat_no_stove') {
    physicsNote = 'Ideale in cambusa: nessuna fiamma a bordo, si conserva al sicuro in borsa termica.';
  } else if (heatSource === 'induction' && primaryTool.material === 'alluminio_rivestito_ptfe') {
    physicsNote = 'Su induzione fermati al livello 6 su 9 (niente Boost) per proteggere il rivestimento antiaderente.';
  } else if (primaryTool.material === 'acciaio_inox_18_10') {
    physicsNote =
      cookingMethod === 'stovetop_high'
        ? 'Su acciaio inox scalda la padella finché una goccia d’acqua scivola via intera (~190°C), poi aggiungi un velo d’olio.'
        : 'Pentola o padella in acciaio inox: scalda con moderazione e sala l’acqua solo a bollore per proteggere il fondo.';
  } else if (cookingMethod === 'oven_bake') {
    physicsNote = 'Forno preriscaldato con teglia ben distanziata per una cottura uniforme.';
  }

  // Nutrition Synergy & Zero-Dairy Note
  const kcal = dish.nutritionPerServing?.energyKcal ?? null;
  const prot = dish.nutritionPerServing?.proteinG ?? null;
  const nutritionHighlights = [];
  if (/\b(acciug\w*|alici|sgombro|sard\w*|salmone|tonno|orata|branzino)\b/.test(`${titleNorm} ${bomText}`)) {
    nutritionHighlights.push('Grassi buoni marini (Omega-3): la cottura dolce li protegge dall’ossidazione.');
  }
  if (/\b(acciug\w*|alici|cavolo|broccol\w*|rucola|mandorl\w*|ceci|sesamo)\b/.test(`${titleNorm} ${bomText}`)) {
    nutritionHighlights.push('Buon apporto di calcio naturale senza bisogno di formaggi.');
  }
  if (/\b(lenticchi\w*|ceci|fagiol\w*|spinac\w*|bietol\w*|acciug\w*)\b/.test(`${titleNorm} ${bomText}`)) {
    nutritionHighlights.push('Assorbimento del ferro potenziato: aggiungi succo di limone fresco a crudo a fine cottura.');
  }
  if (nutritionHighlights.length === 0) {
    nutritionHighlights.push('Piatto mediterraneo equilibrato con grassi buoni da olio extravergine a crudo.');
  }

  // Match expiring VaR_48h items rescued by this dish!
  let vaRSavedEuro = 0;
  const rescuedVarTitles = [];
  for (const riskItem of varReport.atRiskItems || []) {
    const riskHead = normalizeSearchToken(riskItem.title)
      .split(' ')
      .find((w) => w.length >= 4 && !['filetti', 'filetto', 'fresco', 'fresca', 'freschi', 'ligure'].includes(w));
    const creaMatch =
      riskItem.creaFoodId &&
      (dish.bom || []).some((b) => b.creaId && String(b.creaId) === String(riskItem.creaFoodId));
    const lexicalMatch = riskHead && new RegExp(`\\b${riskHead}\\b`, 'i').test(`${titleNorm} ${bomText}`);
    if (creaMatch || lexicalMatch) {
      if (riskItem.atRiskEuro && riskItem.atRiskEuro > 0) {
        vaRSavedEuro += riskItem.atRiskEuro;
      }
      rescuedVarTitles.push(riskItem.title);
    }
  }
  vaRSavedEuro = Number(vaRSavedEuro.toFixed(2));

  const totalPrep = Math.max(5, Number(dish.prepMinutes) || 18);
  const activePrepMinutes =
    cookingMethod === 'cold_no_cook'
      ? Math.min(10, totalPrep)
      : cookingMethod === 'oven_bake'
        ? Math.max(8, Math.round(totalPrep * 0.35))
        : Math.max(6, Math.round(totalPrep * 0.7));
  const passiveCookMinutes = Math.max(0, totalPrep - activePrepMinutes);

  const purePortionCostEur = Number(dish.costAndArbitrage?.purePortionCostEur ?? 2.8);
  const fullCost = economicsSvc.computeGeneralizedMealCost({
    ingredientsEdibleCostEur: purePortionCostEur,
    activePrepMinutes,
    passiveCookMinutes,
    cleaningResetMinutes,
    vaRSavedEuro,
    heatSource,
    cookingMethod,
    cookwareMaterial: primaryTool.material || 'acciaio_inox_18_10',
    rhythmPreset
  });

  const craftScore =
    (dish.costAndArbitrage?.savingsVsRestaurantPct || 0) * 0.5 +
    (dish.sourceType === 'tigullio_restaurant' || dish.sourceType === 'starred_author' ? 35 : 15) +
    (reqTools.includes('mortaio') || cookingMethod === 'stovetop_high' ? 20 : 0);

  const { cleanTitle, cleanSubtitle } = splitDishTitleAndSubtitle(dish.title);
  const totalActiveMinutes = Math.round(activePrepMinutes + cleaningResetMinutes);

  return {
    dishId: dish.id,
    title: dish.title,
    cleanTitle,
    cleanSubtitle,
    course: dish.course,
    dishFamily: dish.dishFamily,
    sourceType: dish.sourceType,
    restaurantName: dish.restaurantName || null,
    menuPriceEuro: dish.menuPriceEuro || null,
    activePrepMinutes,
    passiveCookMinutes,
    cleaningResetMinutes,
    totalHandsOnMinutes: Number((activePrepMinutes + cleaningResetMinutes).toFixed(1)),
    purePortionCostEur,
    energyCostEur: fullCost.breakdown.energyCostEur,
    timeShadowCostEur: fullCost.breakdown.timeShadowCostEur,
    vaRSavedEuro,
    rescuedVarTitles,
    grossGeneralizedCostEur: fullCost.grossGeneralizedCostEur,
    netGeneralizedCostEur: fullCost.netGeneralizedCostEur,
    craftScore: Number(craftScore.toFixed(1)),
    nutritionSummary: {
      energyKcal: kcal,
      proteinG: prot,
      highlights: nutritionHighlights
    },
    fiveSoulsChain: {
      nutrizione: nutritionHighlights.join(' '),
      culinaria: culinaryTechniqueLabel,
      strumenti: physicsNote.trim(),
      casa: cleaningProtocolSummary,
      economia:
        vaRSavedEuro > 0
          ? `Ingredienti €${purePortionCostEur.toFixed(2)} + energia €${fullCost.breakdown.energyCostEur.toFixed(2)} + tuo tempo (${totalActiveMinutes} min: €${fullCost.breakdown.timeShadowCostEur.toFixed(2)}) − €${vaRSavedEuro.toFixed(2)} recuperati dal frigo = €${fullCost.netGeneralizedCostEur.toFixed(2)} netti.`
          : `Ingredienti €${purePortionCostEur.toFixed(2)} + energia €${fullCost.breakdown.energyCostEur.toFixed(2)} + tuo tempo (${totalActiveMinutes} min: €${fullCost.breakdown.timeShadowCostEur.toFixed(2)}) = €${fullCost.grossGeneralizedCostEur.toFixed(2)} totali.`
    }
  };
}

/**
 * Preliminary Deterministic P0 Safety Engine:
 * Non-bypassable check for lethal chemical mixes, pure powder burst/ingestion hazards,
 * surface destruction, PTFE/Tin thermal hazards, and active dietary profile exclusions.
 */
export function evaluateMaestroSafetyP0(message = '', snapshot = null) {
  const norm = normalizeSearchToken(message);
  const alerts = [];

  if (!norm) return alerts;

  const mentionsBleach = /\b(candeggin\w*|ipoclorit\w*|cloro|ace\b|varichina|euclorina)\b/.test(norm);
  const mentionsAcid = /\b(acet[oi]\b|acido\s+citric\w*|citric\w*|anticalcar\w*|viakal|wc\s*net|muriatic\w*|cloridric\w*|limon\w*|disincrostant\w*)\b/.test(
    norm
  );
  const mentionsAmmonia = /\b(ammoniac\w*|lysoform|urin\w*)\b/.test(norm);
  const mentionsPercarbonateOrPeroxide = /\b(percarbonat\w*|acqua\s+ossigenat\w*|perossid\w*|ossigeno\s+attivo|oxi\b)\b/.test(
    norm
  );
  const mentionsClosedBottleOrSpray = /\b(spruzzin\w*|spray|bottigli\w*\s+chius\w*|flacon\w*\s+chius\w*|conserv\w*\s+in\s+bottigli\w*|prepar\w*\s+uno\s+spray)\b/.test(
    norm
  );
  const mentionsBeverageBottle = /\b(bottigli\w*\s+(?:dell\s+)?acqua|bottigliett\w*|bibit\w*|pet\s+trasparent\w*)\b/.test(
    norm
  );
  const mentionsCausticOrStrongAlkali = /\b(soda\s+caustic\w*|idrossido\s+di\s+sodio|disgorgant\w*|fornet|sgrassator\w*\s+forte|lavastovigli\w*)\b/.test(
    norm
  );
  const mentionsAluminum = /\b(alluminio|moka|bialetti|caffettier\w*\s+alluminio|filtro\s+cappa\s+alluminio)\b/.test(
    norm
  );
  const mentionsInox = /\b(inox|acciaio)\b/.test(norm);
  const mentionsMarbleOrSlate = /\b(marmo|carrara|mortaio|ardesia|graniglia|travertino|pietra\s+naturale)\b/.test(norm);
  const mentionsPtfe = /\b(antiaderent\w*|ptfe|teflon)\b/.test(norm);
  const mentionsHighBoost = /\b(boost|livello\s+9|massima\s+potenza|fiamma\s+altissima|rosolare\s+a\s+secco|a\s+vuoto|250\s*gradi|300\s*gradi)\b/.test(
    norm
  );
  const mentionsTinCopper = /\b(rame\s+stagnat\w*|paiolo\s+stagnat\w*|stagno)\b/.test(norm);

  if (mentionsBleach && mentionsAcid) {
    alerts.push({
      code: 'P0-CHEM-CHLORINE-GAS',
      severity: 'P0-LETHAL',
      domain: 'casa',
      title: 'PERICOLO CHIMICO P0: MAI mescolare Candeggina (Ipoclorito) e Acidi!',
      scientificWarning:
        'NaClO + H+ libera istantaneamente gas Cloro (Cl2↑) verde-giallastro altamente tossico per gli alveoli polmonari. Usa SOLO acido citrico per il calcare (risciacquando a fondo prima di qualsiasi altro prodotto).'
    });
  }

  if (mentionsBleach && mentionsAmmonia) {
    alerts.push({
      code: 'P0-CHEM-CHLORAMINES',
      severity: 'P0-LETHAL',
      domain: 'casa',
      title: 'PERICOLO CHIMICO P0: MAI mescolare Candeggina e Ammoniaca!',
      scientificWarning:
        'Ipoclorito di sodio + ammoniaca genera clorammine volatili (NH2Cl / NCl3) gravemente irritanti e tossiche per le vie respiratorie.'
    });
  }

  if (mentionsPercarbonateOrPeroxide && /\bacet[oi]\b/.test(norm)) {
    alerts.push({
      code: 'P0-CHEM-PERACETIC',
      severity: 'P0-CRITICAL',
      domain: 'casa',
      title: 'BLOCCO CHIMICO P0: Non mescolare Percarbonato / Acqua Ossigenata con Aceto!',
      scientificWarning:
        'La reazione forma acido peracetico corrosivo per mucose, pelle e guarnizioni elastomeriche.'
    });
  }

  if (mentionsPercarbonateOrPeroxide && mentionsClosedBottleOrSpray) {
    alerts.push({
      code: 'P0-PRESSURE-BURST',
      severity: 'P0-CRITICAL',
      domain: 'casa',
      title: 'BLOCCO P0 SOVRAPRESSIONE: VIETATO chiudere il Percarbonato disciolto in spruzzini o bottiglie!',
      scientificWarning:
        'Il percarbonato rilascia H2O2 che si decompone in 2H2O + O2↑ gassoso: una bottiglia o spray chiuso va in sovrapressione ed esplode proiettando soluzione alcalino-ossidante (H318 danno oculare grave). Usalo SOLO al momento in bacinella/vaschetta aperta.'
    });
  }

  if (
    (mentionsPercarbonateOrPeroxide || mentionsAcid || mentionsCausticOrStrongAlkali || mentionsBleach) &&
    mentionsBeverageBottle
  ) {
    alerts.push({
      code: 'P0-CAV-INGESTION',
      severity: 'P0-CRITICAL',
      domain: 'casa',
      title: 'BLOCCO P0 ANTIVELENI: MAI travasare soluzioni chimiche in bottiglie d\'acqua o bibite!',
      scientificWarning:
        'È la prima causa domestica di ingestione accidentale grave segnalata dai Centri Antiveleni. Usa esclusivamente flaconi opachi ex-detergente con tappo child-proof ed etichetta chiara.'
    });
  }

  if (mentionsCausticOrStrongAlkali && mentionsAluminum) {
    alerts.push({
      code: 'P0-CHEM-ALUMINUM-CORROSION',
      severity: 'P0-CRITICAL',
      domain: 'casa',
      title: 'DANNO IRREVERSIBILE P0: Niente alcali forti o lavastoviglie su Alluminio / Moka!',
      scientificWarning:
        'L\'alluminio è anfotero: a pH > 9,5 lo strato protettivo Al2O3 si dissolve formando alluminati neri solubili (con sviluppo di H2↑ se soda caustica). Lava la moka solo con acqua calda (e acido citrico per il calcare della caldaia).'
    });
  }

  if (mentionsBleach && mentionsInox) {
    alerts.push({
      code: 'P0-SURFACE-INOX-PITTING',
      severity: 'P0-HIGH',
      domain: 'casa',
      title: 'GUARDIA MATERIALI P0: Vietata la Candeggina sull\'Acciaio Inox 18/10!',
      scientificWarning:
        'L\'ipoclorito NON è uno sgrassante e gli ioni ClO-/Cl- perforano il film passivante di ossido di cromo (Cr2O3), innescando corrosione puntiforme irreversibile (pitting).'
    });
  }

  if (mentionsAcid && mentionsMarbleOrSlate) {
    alerts.push({
      code: 'P0-SURFACE-MARBLE-ETCHING',
      severity: 'P0-HIGH',
      domain: 'casa',
      title: 'GUARDIA MATERIALI P0: Vietati Acidi (Aceto, Citrico, Limone, Anticalcare) su Marmo, Mortaio o Ardesia!',
      scientificWarning:
        'Qualsiasi soluzione a pH < 6 attacca il carbonato di calcio (CaCO3 + 2H+ → Ca2+ + CO2↑ + H2O), opacizzando e corrodendo per sempre il marmo di Carrara, la graniglia e l\'ardesia ligure.'
    });
  }

  if (mentionsPtfe && mentionsHighBoost) {
    alerts.push({
      code: 'P0-PHYSICS-PTFE-DEGRADATION',
      severity: 'P0-CRITICAL',
      domain: 'strumenti',
      title: 'BLOCCO TERMICO P0: MAI usare Boost Induzione o preriscaldamento a secco su PTFE (Antiaderente)!',
      scientificWarning:
        'Su induzione Boost una padella rivestita PTFE a vuoto supera 260–300°C in <40 secondi, oltre la soglia di sicurezza del polimero (200°C), degradando il rivestimento e imbarcando il fondo.'
    });
  }

  if (mentionsTinCopper && /\b(a\s+secco|a\s+vuoto|fiamma\s+alta|boost)\b/.test(norm)) {
    alerts.push({
      code: 'P0-PHYSICS-TIN-MELTING',
      severity: 'P0-CRITICAL',
      domain: 'strumenti',
      title: 'BLOCCO TERMICO P0: Lo Stagno del Rame Stagnato fonde a 231,9°C!',
      scientificWarning:
        'Non scaldare mai una pentola in rame stagnato vuota: metti sempre prima un liquido o grasso di conduzione.'
    });
  }

  // Active Profile Hard-Ban Check (e.g., Dany Zero Formaggi)
  const excluded = snapshot?.profile?.excludedIngredients || [];
  const isZeroDairyProfile =
    snapshot?.profile?.id === 'dany' ||
    excluded.some((x) => /formagg|latticin|mascarpone|mozzarella|parmigiano/i.test(String(x)));
  if (
    isZeroDairyProfile &&
    /\b(parmigiano|grana\s+padano|pecorino|mozzarella|burrata|stracchino|gorgonzola|mascarpone|ricotta|cacio\s+e\s+pepe|quattro\s+formaggi)\b/.test(
      norm
    ) &&
    !/\b(senza|sostituir\w*|alternativ\w*|al\s+posto)\b/.test(norm)
  ) {
    alerts.push({
      code: 'P0-PROFILE-ZERO-DAIRY',
      severity: 'P0-PROFILE',
      domain: 'nutrizione',
      title: `GUARDIA PROFILO ATTIVO (${snapshot?.profile?.name || 'Zero Formaggi'}): Ingrediente caseario escluso!`,
      scientificWarning:
        'Il profilo attivo vieta formaggi e latticini strutturali. Per legare e dare umami alla ligure uso Pinoli/Mandorle pestati + emulsione di acqua d\'amido e Olio EVO fuori fuoco (<65°C).'
    });
  }

  return alerts;
}

export class MaestroCoachService {
  constructor(options = {}) {
    this.pantryService = options.pantryService || pantryService;
    this.kitchenInventoryService = options.kitchenInventoryService || kitchenInventoryService;
    this.userProfileService = options.userProfileService || userProfileService;
    this.recipeAndArbitrageService = options.recipeAndArbitrageService || recipeAndArbitrageService;
    this.offerService = options.offerService || offerService;
    this.shoppingListService = options.shoppingListService || shoppingListService;
    this.householdEconomicsService = options.householdEconomicsService || householdEconomicsService;
    this._dishPoolCache = new Map();
  }

  async _getEvaluatedDishesCached(profileId = 'dany') {
    const key = String(profileId || 'dany');
    const now = Date.now();
    const hit = this._dishPoolCache.get(key);
    if (hit && now - hit.ts < 30000) {
      return hit.dishes;
    }
    const res = await this.recipeAndArbitrageService.queryDishes({
      profileId: key,
      includeExcluded: false,
      limit: 120
    });
    const dishes = res.dishes || [];
    this._dishPoolCache.set(key, { ts: now, dishes });
    return dishes;
  }

  /**
   * Builds the deterministic, <15ms read-only `HouseholdContextSnapshot` across all 5 Souls.
   * Zero synthetic fields (`ADR-0006`).
   */
  async buildHouseholdContextSnapshot(options = {}) {
    const profile = this.userProfileService.getProfileById(options.profileId || undefined);
    const calibration = this.householdEconomicsService.getCalibration(options.rhythmPreset || null);
    const pantryState = this.pantryService.getPantryState();
    const var48h = pantryState.valueAtRisk48h || this.pantryService.getValueAtRisk48h();
    const kitchenState = this.kitchenInventoryService.getKitchenState();
    const shoppingState = this.shoppingListService.getShoppingListState();
    const storeYield = this.householdEconomicsService.evaluateMultiStoreTimeYield({
      storeSimulations: shoppingState.storeSimulations,
      rhythmPreset: options.rhythmPreset || null
    });

    const rawOffers = await this.offerService.getRawOffers();
    const activeOffers = filterActiveAndDeduplicateOffers(rawOffers).map((o) => enrichOfferRecord(o));

    const topFoodOffers = activeOffers
      .filter(
        (o) =>
          o.domain === 'food_human' &&
          !o.isNamelessTile &&
          o.profileCompatibility?.isCompatible !== false &&
          (o.discountVerification?.status === 'verified_best' ||
            o.discountVerification?.status === 'verified_good' ||
            (o.discountPercentage || 0) >= 25)
      )
      .slice(0, 6)
      .map((o) => ({
        id: o.id,
        title: o.title,
        storeName: o.storeName || o.chainName || o.chainId,
        promoPrice: o.promoPrice ?? o.price,
        ediblePricePerKg: o.ediblePricePerKg ?? o.pricePerKg ?? null,
        discountBadge: o.discountVerification?.badge || null
      }));

    const topCleaningOffers = activeOffers
      .filter((o) => o.domain === 'home_cleaning' && !o.isNamelessTile)
      .slice(0, 4)
      .map((o) => ({
        id: o.id,
        title: o.title,
        storeName: o.storeName || o.chainName || o.chainId,
        promoPrice: o.promoPrice ?? o.price
      }));

    const snapshot = {
      generatedAt: new Date().toISOString(),
      profile: {
        id: profile.id,
        name: profile.name,
        description: profile.description,
        excludedIngredients: profile.excludedIngredients || [],
        excludedAllergens: profile.excludedAllergens || []
      },
      rhythm: {
        activeRhythmPreset: calibration.activeRhythmPreset,
        label: calibration.preset.label,
        hourlyValueEuro: calibration.effectiveParameters.hourlyValueEuro,
        maxActiveMinutes: calibration.effectiveParameters.maxActiveMinutes,
        electricityEurPerKwh: calibration.effectiveParameters.electricityEurPerKwh,
        gasEurPerSmc: calibration.effectiveParameters.gasEurPerSmc,
        transportMode: calibration.effectiveParameters.transportMode
      },
      pantry: {
        totalItems: pantryState.totalItems,
        valueAtRisk48h: var48h,
        fridgeItems: (pantryState.byZone?.fridge_freezer || []).slice(0, 10).map((i) => ({
          id: i.id,
          title: i.title,
          status: i.status,
          remainingWeightGrams: i.remainingWeightGrams,
          remainingFraction: i.remainingFraction,
          currentValueEuro: i.currentValueEuro,
          hoursRemaining: i.hoursRemaining
        })),
        dryAndBoatHighlights: [
          ...(pantryState.byZone?.dry_pantry || []).slice(0, 5),
          ...(pantryState.byZone?.boat_cooler || []).slice(0, 4)
        ].map((i) => ({
          id: i.id,
          title: i.title,
          zone: i.zone,
          remainingWeightGrams: i.remainingWeightGrams
        }))
      },
      kitchen: {
        heatSource: kitchenState.heatSource,
        effectiveTools: (kitchenState.effectiveTools || []).map((t) => ({
          id: t.id,
          name: t.name,
          material: t.material,
          maxTempC: t.maxTempC,
          inductionCompatible: t.inductionCompatible
        })),
        disqualifiedTools: (kitchenState.disqualifiedTools || []).map((t) => ({
          id: t.id,
          name: t.name,
          reason: t.disqualificationReason
        })),
        ownedCleaningKeys: kitchenState.ownedCleaningKeys || [],
        totalUnlockedDishes: kitchenState.totalUnlockedDishes,
        totalCatalogDishes: kitchenState.totalCatalogDishes
      },
      shoppingAndRapallo: {
        cartItemsCount: shoppingState.subtotals?.totalItemsCount || 0,
        cartGrandTotalEur: shoppingState.subtotals?.grandTotalEur || 0,
        optimalStoreStrategyId: storeYield.optimalStrategyId,
        optimalStoreSummary: storeYield.optimalSummary,
        incrementalYields: storeYield.incrementalYields,
        topFoodOffersRapallo: topFoodOffers,
        topCleaningOffersRapallo: topCleaningOffers
      }
    };

    if (options.contextOverride && typeof options.contextOverride === 'object') {
      return {
        ...snapshot,
        ...options.contextOverride,
        profile: { ...snapshot.profile, ...(options.contextOverride.profile || {}) },
        rhythm: { ...snapshot.rhythm, ...(options.contextOverride.rhythm || {}) },
        pantry: { ...snapshot.pantry, ...(options.contextOverride.pantry || {}) },
        kitchen: { ...snapshot.kitchen, ...(options.contextOverride.kitchen || {}) }
      };
    }

    return snapshot;
  }

  /**
   * Computes the 3 Non-Dominated Pareto Cards for "⚡ Oggi — Stasera in Cucina":
   *  1. `min_friction`   — ⚡ Minimo Attrito & Reset Rapido
   *  2. `save_var_value` — 💶 Salva-Frigo `VaR_48h` & Nutrizione
   *  3. `maestro_craft`  — 👨‍🍳 Gesto da Maestro (Tecnica & Arbitraggio)
   */
  async computeTonightParetoFrontier(snapshot, options = {}) {
    const profileId = snapshot?.profile?.id || options.profileId || 'dany';
    const rhythmPreset = snapshot?.rhythm?.activeRhythmPreset || options.rhythmPreset || 'feriale';
    const heatSource = snapshot?.kitchen?.heatSource || 'gas';
    const effectiveToolIds = new Set((snapshot?.kitchen?.effectiveTools || []).map((t) => t.id));

    const allEvaluatedDishes = await this._getEvaluatedDishesCached(profileId);

    const eligibleDishes = allEvaluatedDishes.filter((d) => {
      if (!d || d.isExcludedByProfileIdentity) return false;
      if (['colazione', 'dolce', 'gelato', 'merenda', 'aperitivo'].includes(d.course)) return false;
      if (heatSource === 'boat_no_stove' && !d.boatSafeCold) return false;
      const reqTools = normalizeDishCookwareIds(d.cookwareRequired || [], d);
      if (effectiveToolIds.size > 0 && !reqTools.every((tid) => effectiveToolIds.has(tid))) {
        return false;
      }
      return true;
    });

    const varReport = snapshot?.pantry?.valueAtRisk48h || { totalAtRiskEuro: 0, atRiskItems: [] };
    const analyzed = eligibleDishes.map((d) =>
      analyzeDishCausalChain(d, snapshot.kitchen, varReport, this.householdEconomicsService, rhythmPreset)
    );

    if (analyzed.length === 0) {
      return { paretoCards: [], candidatePoolCount: 0 };
    }

    // True Pareto Non-Dominated Set on (totalHandsOnMinutes ASC, netGeneralizedCostEur ASC, vaRSavedEuro DESC, craftScore DESC)
    const nonDominated = analyzed.filter((cand) => {
      return !analyzed.some((other) => {
        if (other.dishId === cand.dishId) return false;
        const noWorse =
          other.totalHandsOnMinutes <= cand.totalHandsOnMinutes &&
          other.netGeneralizedCostEur <= cand.netGeneralizedCostEur &&
          other.vaRSavedEuro >= cand.vaRSavedEuro &&
          other.craftScore >= cand.craftScore;
        const strictlyBetter =
          other.totalHandsOnMinutes < cand.totalHandsOnMinutes ||
          other.netGeneralizedCostEur < cand.netGeneralizedCostEur ||
          other.vaRSavedEuro > cand.vaRSavedEuro ||
          other.craftScore > cand.craftScore;
        return noWorse && strictlyBetter;
      });
    });

    const pool = nonDominated.length >= 3 ? nonDominated : analyzed;
    const usedIds = new Set();

    // 1. ⚡ Minimo Attrito (lowest active + cleaning minutes, breaking ties on net cost)
    const sortedFriction = [...pool].sort(
      (a, b) => a.totalHandsOnMinutes - b.totalHandsOnMinutes || a.netGeneralizedCostEur - b.netGeneralizedCostEur
    );
    const pickFriction = sortedFriction[0];
    if (pickFriction) usedIds.add(pickFriction.dishId);

    // 2. 💶 Salva-Frigo VaR_48h & Valore (highest rescued VaR euro, then lowest net generalized cost)
    const sortedVar = [...analyzed]
      .filter((d) => !usedIds.has(d.dishId))
      .sort(
        (a, b) =>
          b.vaRSavedEuro - a.vaRSavedEuro ||
          a.netGeneralizedCostEur - b.netGeneralizedCostEur ||
          a.purePortionCostEur - b.purePortionCostEur
      );
    const pickVar = sortedVar[0] || sortedFriction[1] || pickFriction;
    if (pickVar) usedIds.add(pickVar.dishId);

    // 3. 👨‍🍳 Gesto da Maestro (highest culinary/arbitrage craft score)
    const sortedCraft = [...pool]
      .filter((d) => !usedIds.has(d.dishId))
      .sort((a, b) => b.craftScore - a.craftScore || b.purePortionCostEur - a.purePortionCostEur);
    const pickCraft =
      sortedCraft[0] ||
      analyzed.find((d) => !usedIds.has(d.dishId)) ||
      pickFriction;

    const paretoCards = [];
    if (pickFriction) {
      paretoCards.push({
        slotId: 'min_friction',
        badge: 'Pronto subito',
        recommendedForRhythm: rhythmPreset === 'sera_stanca',
        whyThisWins: `In tavola in ${Math.round(pickFriction.totalHandsOnMinutes)} minuti lavaggio compreso, zero pentole impegnative.`,
        ...pickFriction
      });
    }
    if (pickVar && pickVar.dishId !== pickFriction?.dishId) {
      paretoCards.push({
        slotId: 'save_var_value',
        badge: pickVar.vaRSavedEuro > 0 ? 'Salva i freschi in frigo' : 'Spesa intelligente',
        recommendedForRhythm: rhythmPreset === 'feriale',
        whyThisWins:
          pickVar.vaRSavedEuro > 0
            ? `Recuperi €${pickVar.vaRSavedEuro.toFixed(2)} di ingredienti in scadenza (${pickVar.rescuedVarTitles.join(', ')}) evitando sprechi.`
            : `Ottimo equilibrio tra dispensa e offerte attive a Rapallo con soli €${pickVar.purePortionCostEur.toFixed(2)} a porzione.`,
        ...pickVar
      });
    }
    if (pickCraft && !paretoCards.some((c) => c.dishId === pickCraft.dishId)) {
      paretoCards.push({
        slotId: 'maestro_craft',
        badge: 'Piatto d’autore a casa',
        recommendedForRhythm: rhythmPreset === 'weekend_relax',
        whyThisWins: pickCraft.menuPriceEuro
          ? `Al ristorante €${Number(pickCraft.menuPriceEuro).toFixed(2)}, a casa €${pickCraft.purePortionCostEur.toFixed(2)} di ingredienti (${Math.round(pickCraft.totalHandsOnMinutes)} min tra cottura e riordino).`
          : `Ricetta curata con tecnica precisa, €${pickCraft.purePortionCostEur.toFixed(2)} di ingredienti (${Math.round(pickCraft.totalHandsOnMinutes)} min tra cottura e riordino).`,
        ...pickCraft
      });
    }

    return {
      paretoCards,
      nonDominatedCount: nonDominated.length,
      candidatePoolCount: analyzed.length
    };
  }

  /**
   * Unified payload for the "⚡ Oggi (Co-pilota)" home screen.
   */
  async getTodayCopilot(options = {}) {
    const snapshot = await this.buildHouseholdContextSnapshot(options);
    const frontier = await this.computeTonightParetoFrontier(snapshot, options);

    return {
      generatedAt: snapshot.generatedAt,
      activeProfile: snapshot.profile,
      activeRhythm: snapshot.rhythm,
      valueAtRisk48h: snapshot.pantry.valueAtRisk48h,
      tonightParetoCards: frontier.paretoCards,
      paretoStats: {
        nonDominatedCount: frontier.nonDominatedCount,
        candidatePoolCount: frontier.candidatePoolCount
      },
      rapalloFlashOpportunities: snapshot.shoppingAndRapallo.topFoodOffersRapallo.slice(0, 3),
      storeRouteYieldSummary: {
        optimalStrategyId: snapshot.shoppingAndRapallo.optimalStoreStrategyId,
        summary: snapshot.shoppingAndRapallo.optimalStoreSummary,
        incrementalYields: snapshot.shoppingAndRapallo.incrementalYields
      },
      staleSwipeQueue: snapshot.pantry.valueAtRisk48h?.staleUnverifiedItems || []
    };
  }

  /**
   * Built-in Deterministic Scientific Maestro Responder (100% offline-capable, zero hallucinations).
   */
  _buildDeterministicMaestroReply(message, snapshot, paretoCards, p0Alerts) {
    const norm = normalizeSearchToken(message);
    const detectedIntents = [];
    const sections = [];
    const citations = [];

    // 1. Non-bypassable P0 Safety Banner always comes FIRST
    if (p0Alerts.length > 0) {
      detectedIntents.push('p0_safety_guard');
      for (const al of p0Alerts) {
        sections.push(`🛑 **${al.title}**\n${al.scientificWarning}`);
        citations.push({ source: 'SafetyEngineP0', code: al.code, domain: al.domain });
      }
    }

    // 2. Culinary SOS / Emulsion / Searing Diagnostics (Anima 2)
    if (
      /\b(slegat\w*|impazzit\w*|stracciat\w*|attaccat\w*|bolle|grigi\w*|amaro|bruciat\w*|emulsion\w*|mantec\w*|pesto\s+nero|ossidat\w*)\b/.test(
        norm
      )
    ) {
      detectedIntents.push('culinary_sos');
      if (/\b(slegat\w*|impazzit\w*|stracciat\w*|emulsion\w*|mantec\w*)\b/.test(norm)) {
        sections.push(
          `👨‍🍳 **Diagnosi Scientifica Emulsione (SOS Fornelli):** La salsa si è slegata per rottura dell'emulsione olio-in-acqua (temperatura >70°C sul fuoco o carenza di fase acquosa amidacea). **Recupero in 30 secondi:** sposta subito la padella *fuori dal fuoco* (<65°C), aggiungi 1–2 cucchiai di acqua di cottura tiepida (o acqua + mezzo cucchiaino d'amido) ed emulsiona vigorosamente a strappo.`
        );
      } else if (/\b(attaccat\w*|bolle|grigi\w*)\b/.test(norm)) {
        sections.push(
          `👨‍🍳 **Fisica della Rosolatura & Barriera dei 100°C:** Se il pesce o la carne diventa grigio o bolle, l'acqua superficiale sta assorbendo 2.260 J/g di calore latente d'evaporazione bloccando la superficie a 100°C (sotto i 140–160°C di Maillard), oppure hai sovraccaricato la padella. Tampona sempre a secco con carta, dividi in 2 turni e, su Inox 18/10, attendi l'effetto Leidenfrost prima di mettere l'olio e NON toccare il filetto finché la crosta proteica non si stacca naturalmente.`
        );
      } else {
        sections.push(
          `👨‍🍳 **Recupero Tecnico Immediato:** Se il fondo è diventato scuro/amaro (>190°C, pirolisi di aglio o grassi), **non deglassarlo**: trasferisci subito l'alimento in recipiente pulito per non contaminare il piatto con composti furanici amari e acroleina.`
        );
      }
      citations.push({ source: 'ScienceAndCookingEngine', heatSource: snapshot.kitchen.heatSource });
    }

    // 3. Home Cleaning & Materials Chemistry (Anima 4)
    if (
      /\b(pulir\w*|puliz\w*|macchi\w*|calcar\w*|muff\w*|odor\w*|sgrass\w*|bicarbonat\w*|acet[oi]\b|citric\w*|percarbonat\w*|candeggin\w*|doccia|vetr\w*|marmo|ardesia|inox|bucato|lavatric\w*)\b/.test(
        norm
      )
    ) {
      detectedIntents.push('home_cleaning_chemistry');
      if (/\bbicarbonat\w*\b/.test(norm) && /\bacet[oi]\b/.test(norm)) {
        sections.push(
          `🧪 **Myth-Buster Chimico (Aceto + Bicarbonato):** Mescolare aceto (acido) e bicarbonato (base debole) produce effervescenza scenografica di $\\text{CO}_2$, ma si **neutralizza a vicenda** lasciando acqua e acetato di sodio inerte: azzeri sia il potere anticalcare dell'acido sia il lieve potere alcalino! Usa **Acido Citrico al 15%** da solo per il calcare (mai su marmo/ardesia!) oppure **Soda/Sgrassatore alcalino** da solo per i grassi.`
        );
      } else if (/\b(marmo|carrara|ardesia|graniglia|mortaio)\b/.test(norm)) {
        sections.push(
          `🧼 **Protocollo Pietre Calcaree Liguri (Marmo / Mortaio / Ardesia):** Superficie sensibile agli acidi ($\\text{CaCO}_3$). Usa esclusivamente **acqua tiepida e panno in microfibra** (o sapone neutro delicatissimo sulle piastrelle, zero profumi nel mortaio alimentare). Mai aceto, limone o anticalcare.`
        );
      } else if (/\b(calcar\w*|doccia|rubinett\w*|bollitore)\b/.test(norm)) {
        sections.push(
          `🧼 **Protocollo Anticalcare Stechiometrico (Acqua Rapallo 14–22 °f):** Contro i depositi inorganici di $\\text{CaCO}_3$ usa **Acido Citrico 15%** (pH ~2,2, sicuro sulle cromature e inodore rispetto all'aceto che corrode il nichel): spruzza con *foamer*/panno, lascia agire 5 min (tempo chimico di Sinner) e risciacqua. Se sul box doccia c'è anche velo opaco di sapone calcico (*soap scum*), passa prima una goccia di detersivo piatti neutro.`
        );
      } else {
        const ownedClean = (snapshot.kitchen.ownedCleaningKeys || []).join(', ') || 'detersivo pH neutro + microfibra';
        sections.push(
          `🧼 **Protocollo Chimica Domestica Mirata:** Identifica sempre la coppia *(Natura dello Sporco × Superficie)*: grassi polimerizzati/organici richiedono **tensioattivi + alcalinità** (su superfici resistenti); incrostazioni minerali richiedono **acido citrico**; macchie ossidabili su cotone bianco richiedono **percarbonato a vaso aperto/lavatrice ≥40°C**. Nel tuo sottolavello hai già attivi: \`${ownedClean}\`.`
        );
      }
      citations.push({ source: 'HomeChemistryMatrix', ownedCleaningKeys: snapshot.kitchen.ownedCleaningKeys });
    }

    // 4. Cookware Physics & CapEx/OpEx TCO (Anima 3 + Anima 5)
    if (/\b(padell\w*|pentol\w*|casseruol\w*|wok|induzion\w*|ghisa|ptfe|antiaderent\w*|coltell\w*|compr\w*\s+una\s+padella|tco)\b/.test(norm)) {
      detectedIntents.push('cookware_and_tco');
      const toolsList = (snapshot.kitchen.effectiveTools || []).map((t) => t.name).join(', ') || 'set base';
      sections.push(
        `🍳 **Fisica degli Strumenti & CapEx Domestico (Piano attivo: \`${snapshot.kitchen.heatSource}\`):** Nella tua dotazione attiva risultano: *${toolsList}*. Regola aurea TCO: investi *Buy-It-For-Life* su **Acciaio Inox 18/10 multistrato** (~€0,01/uso su 3.000+ cicli, ideale per rosolature >170°C e deglassature acide) e considera l'**Antiaderente PTFE** un bene consumabile (€20–30, 180–350 cicli) da dedicare solo a uova e pesce bianco delicato a temperatura moderata (<190°C, lavaggio neutro).`
      );
      citations.push({
        source: 'CookwarePhysicsAndTco',
        heatSource: snapshot.kitchen.heatSource,
        unlockedDishes: `${snapshot.kitchen.totalUnlockedDishes}/${snapshot.kitchen.totalCatalogDishes}`
      });
    }

    // 5. Economics, Multi-Store Rapallo Yield & Offers (Anima 5)
    if (/\b(spesa|negoz\w*|basko|coop|tigota|eurospin|gulliver|carrefour|offert\w*|scont\w*|conviene|risparm\w*|inflazion\w*|euro|prezz\w*)\b/.test(norm)) {
      detectedIntents.push('economics_and_rapallo');
      const topPromo = snapshot.shoppingAndRapallo.topFoodOffersRapallo[0];
      const promoLine = topPromo
        ? `Tra gli sconti reali verificati oggi a Rapallo spicca **${topPromo.title}** da *${topPromo.storeName}* a **€${Number(topPromo.promoPrice).toFixed(2)}**${topPromo.ediblePricePerKg ? ` (€${Number(topPromo.ediblePricePerKg).toFixed(2)}/kg edibile)` : ''}.`
        : 'Nessuna promozione forzata: valuto solo prezzi unitari reali certificati a Rapallo.';
      sections.push(
        `💶 **Scienza dell'Economia Domestica (Ritmo attivo: ${snapshot.rhythm.label}, $w_t = €${snapshot.rhythm.hourlyValueEuro}/h$):** ${snapshot.shoppingAndRapallo.optimalStoreSummary} ${promoLine}`
      );
      citations.push({
        source: 'HouseholdEconomicsEngine',
        hourlyValueEuro: snapshot.rhythm.hourlyValueEuro,
        optimalStoreStrategyId: snapshot.shoppingAndRapallo.optimalStoreStrategyId
      });
    }

    // 6. Tonight Meal / Fridge VaR_48h / Nutrition Coaching (Anima 1 + 2 + 5 — Default if asking what to eat or general)
    if (
      sections.length === 0 ||
      /\b(stasera|cena|pranz\w*|mangi\w*|cucin\w*|frigo|scad\w*|stanc\w*|veloce|minuti|fame|ricett\w*|acciug\w*|pesce)\b/.test(
        norm
      )
    ) {
      detectedIntents.push('tonight_meal_coaching');
      const varEur = snapshot.pantry.valueAtRisk48h?.totalAtRiskEuro || 0;
      const topRisk = snapshot.pantry.valueAtRisk48h?.atRiskItems?.[0] || null;
      const bestCard =
        /\b(stanc\w*|veloce|5\s*min|10\s*min|15\s*min|zero\s+voglia)\b/.test(norm)
          ? paretoCards.find((c) => c.slotId === 'min_friction') || paretoCards[0]
          : varEur > 0
            ? paretoCards.find((c) => c.slotId === 'save_var_value') || paretoCards[0]
            : paretoCards[0];

      if (bestCard) {
        const varBanner =
          topRisk && varEur > 0
            ? `Hai **€${varEur.toFixed(2)} di valore a rischio entro 48h** in dispensa/frigo (priorità: *${topRisk.title}*, ${topRisk.hoursRemaining}h residue). `
            : '';
        sections.push(
          `🌿 **Consiglio del Maestro per ${snapshot.profile.name} (${snapshot.rhythm.label}):** ${varBanner}Ti propongo **${bestCard.title}** (${bestCard.totalHandsOnMinutes} min attivi incluso lavaggio).\n` +
            `- **Nutrizione:** ${bestCard.fiveSoulsChain.nutrizione}\n` +
            `- **Fornelli & Strumenti:** ${bestCard.fiveSoulsChain.culinaria} — ${bestCard.fiveSoulsChain.strumenti}\n` +
            `- **Reset Pulizia:** ${bestCard.fiveSoulsChain.casa}\n` +
            `- **Bilancio Economico:** ${bestCard.fiveSoulsChain.economia}`
        );
        citations.push({
          source: 'TonightParetoFrontier',
          dishId: bestCard.dishId,
          vaRSavedEuro: bestCard.vaRSavedEuro,
          netGeneralizedCostEur: bestCard.netGeneralizedCostEur
        });
      }
    }

    return {
      reply: sections.join('\n\n'),
      detectedIntents: Array.from(new Set(detectedIntents)),
      groundedCitations: citations
    };
  }

  /**
   * Calls configured LLM (`GEMINI_API_KEY` or `OPENAI_API_KEY`) strictly grounded on the read-only snapshot,
   * using native Node 20+ `fetch` with an 8000ms timeout and zero extra dependencies.
   */
  async _tryGroundedLlmSynthesis({ message, history, snapshot, paretoCards, p0Alerts, deterministicBase, fetchImpl }) {
    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!geminiKey && !openaiKey) return null;
    if (typeof fetchImpl !== 'function') return null;

    const groundingPayload = {
      profile: snapshot.profile,
      rhythm: snapshot.rhythm,
      pantryValueAtRisk48h: snapshot.pantry.valueAtRisk48h,
      fridgeItems: snapshot.pantry.fridgeItems,
      kitchen: snapshot.kitchen,
      tonightParetoOptions: paretoCards.map((c) => ({
        slotId: c.slotId,
        title: c.title,
        totalHandsOnMinutes: c.totalHandsOnMinutes,
        purePortionCostEur: c.purePortionCostEur,
        vaRSavedEuro: c.vaRSavedEuro,
        netGeneralizedCostEur: c.netGeneralizedCostEur,
        fiveSoulsChain: c.fiveSoulsChain
      })),
      rapalloTopOffers: snapshot.shoppingAndRapallo.topFoodOffersRapallo,
      storeRouteSummary: snapshot.shoppingAndRapallo.optimalStoreSummary,
      mandatoryP0Alerts: p0Alerts
    };

    const systemInstruction = [
      'Sei "Basilico Maestro", scienziato domestico a 5 anime (Nutrizionista CREA/LARN, Maestro d\'Arte Culinaria, Fisico degli Strumenti, Chimico delle Pulizie, Economista Domestico) a Rapallo (GE).',
      'REGOLE INVIOLABILI (ADR-0006 & Sicurezza P0):',
      '1. Usa ESCLUSIVAMENTE prezzi, grammi, scadenze, offerte, pentole e dati presenti nel JSON_CONTESTO_CERTIFICATO. NON inventare MAI prezzi, calorie o concentrazioni chimiche.',
      '2. Se `mandatoryP0Alerts` non è vuoto, apri OBBLIGATORIAMENTE la risposta con il blocco di sicurezza P0 senza mai attenuarlo.',
      '3. Rispondi in italiano, tono caldo, autorevole, conciso e pratico (adatto anche alle 20:30 di sera).',
      `JSON_CONTESTO_CERTIFICATO:\n${JSON.stringify(groundingPayload)}`
    ].join('\n');

    const safeHistory = (Array.isArray(history) ? history : [])
      .slice(-12)
      .map((m) => ({
        role: m?.role,
        content: String(m?.content || m?.text || '').slice(0, 1500)
      }));

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      try {
        if (geminiKey) {
          const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
          const contents = [
            ...safeHistory.map((m) => ({
              role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
              parts: [{ text: m.content }]
            })),
            { role: 'user', parts: [{ text: message }] }
          ];
          const res = await fetchImpl(url, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-goog-api-key': geminiKey
            },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: systemInstruction }] },
              contents,
              generationConfig: { temperature: 0.2, maxOutputTokens: 700 }
            }),
            signal: controller.signal
          });
          if (res.ok) {
            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
            if (text) return { text, provider: 'gemini_grounded' };
          }
        } else if (openaiKey) {
          const messages = [
            { role: 'system', content: systemInstruction },
            ...safeHistory.map((m) => ({
              role: m.role === 'assistant' ? 'assistant' : 'user',
              content: String(m.content || m.text || '')
            })),
            { role: 'user', content: message }
          ];
          const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${openaiKey}`
            },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              temperature: 0.2,
              max_tokens: 700,
              messages
            }),
            signal: controller.signal
          });
          if (res.ok) {
            const data = await res.json();
            const text = data?.choices?.[0]?.message?.content?.trim();
            if (text) return { text, provider: 'openai_grounded' };
          }
        }
      } finally {
        clearTimeout(timer);
      }
    } catch (_) {
      // Fallback cleanly to deterministic scientific engine on timeout or network error
    }

    return null;
  }

  /**
   * Hybrid Conversational & Diagnostic Maestro Entrypoint (`askMaestro`).
   */
  async askMaestro(params = {}) {
    const message = String(params.message || '').trim();
    if (!message) {
      throwBadRequest('Messaggio per il Maestro obbligatorio (non vuoto)');
    }
    if (message.length > 2000) {
      throwBadRequest('Messaggio per il Maestro troppo lungo (massimo 2000 caratteri)');
    }

    const snapshot = await this.buildHouseholdContextSnapshot({
      profileId: params.profileId || null,
      rhythmPreset: params.rhythmPreset || null,
      contextOverride: params.contextOverride || null
    });

    // Step 1: Non-bypassable Preliminary Deterministic P0 Safety Check
    const p0Alerts = evaluateMaestroSafetyP0(message, snapshot);

    // Step 2: Compute deterministic Pareto context & local scientific response
    const frontier = await this.computeTonightParetoFrontier(snapshot, {
      profileId: snapshot.profile.id,
      rhythmPreset: snapshot.rhythm.activeRhythmPreset
    });
    const deterministicBase = this._buildDeterministicMaestroReply(
      message,
      snapshot,
      frontier.paretoCards,
      p0Alerts
    );

    // Step 3: Optional Grounded LLM Synthesis when API key is configured (never allowed to drop P0 alerts!)
    let finalReply = deterministicBase.reply;
    let mode = 'deterministic_scientific_engine';

    if (!params.forceOffline) {
      const llmRes = await this._tryGroundedLlmSynthesis({
        message,
        history: params.history || [],
        snapshot,
        paretoCards: frontier.paretoCards,
        p0Alerts,
        deterministicBase,
        fetchImpl: params.fetchImpl || globalThis.fetch
      });
      if (llmRes && llmRes.text) {
        mode = llmRes.provider;
        if (p0Alerts.length > 0) {
          const p0Header = p0Alerts.map((a) => `🛑 **${a.title}** — ${a.scientificWarning}`).join('\n\n');
          finalReply = llmRes.text.includes(p0Alerts[0].code) || llmRes.text.includes('PERICOLO') || llmRes.text.includes('BLOCCO')
            ? `${p0Header}\n\n${llmRes.text}`
            : `${p0Header}\n\n${llmRes.text}`;
        } else {
          finalReply = llmRes.text;
        }
      }
    }

    return {
      reply: finalReply,
      mode,
      p0Alerts,
      hasP0Block: p0Alerts.length > 0,
      detectedIntents: deterministicBase.detectedIntents,
      groundedCitations: deterministicBase.groundedCitations,
      suggestedParetoCards: frontier.paretoCards,
      contextSummary: {
        profileId: snapshot.profile.id,
        rhythmPreset: snapshot.rhythm.activeRhythmPreset,
        hourlyValueEuro: snapshot.rhythm.hourlyValueEuro,
        heatSource: snapshot.kitchen.heatSource,
        valueAtRisk48hEuro: snapshot.pantry.valueAtRisk48h?.totalAtRiskEuro || 0
      }
    };
  }
}

export const maestroCoachService = new MaestroCoachService();
export default maestroCoachService;
