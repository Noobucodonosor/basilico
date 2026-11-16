/**
 * Basilico 2.0 — Universal Home & Boat Chemistry Engine (ADR-0015 / ADR-0006 / TASK-V2-01)
 * Location: server/services/homeChemistryService.js
 *
 * Deterministic 4-Axis Applied Chemistry Solver:
 *   Axis 1: Soil Reactivity (8 classes: lipids, polymerized lipids, biopolymers, limescale/soap-scum,
 *           metal oxides/Al3+, chromophores, biofilm/mold/amines, sebum/cationic buildup)
 *   Axis 2: Household, Textile & Marine Substrates (Carrara marble/Ligurian slate, porcelain gres,
 *           18/10 stainless, chrome, shower glass, silicone, amphoteric Al, PTFE, cast iron, tin-lined copper,
 *           wood, cotton, wool/silk, microfiber/sailing tech, boat AISI 316/gelcoat)
 *   Axis 3: Reg. (EC) No 648/2004 Active Principles & 7-Pillar Minimal Chemical Kit
 *   Axis 4: Sinner's Circle (Chemistry + Temperature + Time + Mechanical = 100%)
 *
 * Strict ADR-0006 Honesty Guarantees:
 *   - Zero invented scalar active-% on commercial detergents (uses official Reg. 648/2004 intervals & lower-bound dominance).
 *   - Zero invented wash counts or ml when omitted on PromoQui flyers (`null` preserved).
 *   - Non-bypassable P0 safety locks (Cl2 gas, chloramines, peracetic acid, Al+NaOH->H2, anionic+cationic inactivation,
 *     plus pure-powder P0-PRESSURE-BURST, P0-CAV-INGESTION, and P0-DUST-AEROSOL).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyProductDomain } from './domainClassifier.js';
import { extractPackMetrics } from './unitPriceExtractor.js';
import { evaluateQualityLens } from './qualityLensService.js';
import { offerService } from './offerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CHEMISTRY_MATRIX_PATH = path.resolve(__dirname, '../../data/seed/home_chemistry_matrix.json');

function normalizeText(input = '') {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

const SURFACE_ALIASES = [
  { id: 'marmo_ardesia_graniglia', rx: /\b(marmo|carrara|mortaio|ardesia|graniglia|travertino|pietra\s+naturale|pietra\s+ligure|fughe\s+cement\w*)\b/i },
  { id: 'barca_aisi316_gelcoat', rx: /\b(barca|aisi\s*316|gelcoat|vetroresina|gavon\w*|cambusa|candelieri|coperta\s+barca|boat|nautic\w*)\b/i },
  { id: 'alluminio_anfotero', rx: /\b(alluminio|moka|caffettiera\s+moka|filtro\s+cappa\s+alluminio|filtri\s+alluminio|spartifiamma)\b/i },
  { id: 'ptfe_antiaderente', rx: /\b(ptfe|teflon|antiaderente|padella_antiaderente)\b/i },
  { id: 'ghisa_stagionata', rx: /\b(ghisa|ferro\s+blu|acciaio\s+al\s+carbonio|bistecchiera)\b/i },
  { id: 'rame_stagnato', rx: /\b(rame|stagnat\w*|testo\s+farinata|pentola_rame)\b/i },
  { id: 'cromature_rubinetteria', rx: /\b(cromat\w*|rubinett\w*|soffione|rompigetto|miscelatore|ottone\s+cromato)\b/i },
  { id: 'cristallo_doccia_vetro', rx: /\b(box\s+doccia|cristallo|vetr[oi]|specchi\w*|finestr\w*)\b/i },
  { id: 'silicone_fughe_sanitari', rx: /\b(silicone|sanitari|wc\b|bidet|lavabo|piatto\s+doccia|fughe\s+bagno|ceramica\s+bagno)\b/i },
  { id: 'gres_porcellanato', rx: /\b(gres|porcellanato|piastrell\w*|pavimento\s+gres|pavimento)\b/i },
  { id: 'parquet_legno', rx: /\b(parquet|legno|rovere|ulivo|tagliere\s+legno|mobil[ei]\s+legno)\b/i },
  { id: 'lana_seta_delicati', rx: /\b(lana|cashmere|merino|seta|maglione|delicati\s+animali)\b/i },
  { id: 'microfibra_sintetici_vela', rx: /\b(microfibra|poliestere|elastan|lycra|gore[\s-]?tex|sintetic\w*|sportiv\w*|tecnic\w*|cerata|vela)\b/i },
  { id: 'cotone_lino_resistenti', rx: /\b(cotone|lino|canapa|tovaglia|lenzuol\w*|camicia|maglietta|jeans|asciugaman\w*|accappatoi\w*|bucato)\b/i },
  { id: 'acciaio_inox_satinato', rx: /\b(inox|acciaio|lavello|casseruola|pentola|piano\s+cucina|coltello_chef)\b/i }
];

const SOIL_ALIASES = [
  { id: 'biopolymer_protein_starch', rx: /\b(sangue|uov[ao]|albume|latte|gelato|proteine?|amido|pasta|farinata|erba)\b/i },
  { id: 'metal_oxides_rust_verdigris', rx: /\b(ruggine|ossid[oi]|verderame|deodorante|alone\s+giallo|aloni\s+gialli|ascell\w*|alluminio\s+sudore)\b/i },
  { id: 'inorganic_limescale_soapscum', rx: /\b(calcare|anticalcare|caco3|incrostazion\w*\s+bianc\w*|soap\s*scum|stearat\w*|etching|aloni\s+acqua|salsedine|sale\s+marino)\b/i },
  { id: 'oxidizable_chromophores', rx: /\b(vino|caffe|t[eè]\b|tannin\w*|frutti\s+di\s+bosco|mirtill\w*|curcuma|pomodoro|sugo|pesto|ragu|licopene|cioccolato)\b/i },
  { id: 'biofilm_mold_malodor_amines', rx: /\b(muff\w*|cladosporium|aspergillus|biofilm|puzz\w*|odore|pesce|alici|trimetilammina|scarico\s+lento|fogna)\b/i },
  { id: 'sebum_sweat_cationic_buildup', rx: /\b(appiccicos\w*|opac[oa]\s+pavimento|sebo|sudore\s+sintetic\w*|non\s+assorbe|ammorbidente\s+accumul\w*|cer[ae])\b/i },
  { id: 'lipid_polymerized', rx: /\b(polimerizzat\w*|bruciat\w*|carbonizzat\w*|incrostazion\w*\s+forno|grasso\s+cotto|maillard|frittura\s+vecchia|resinoso)\b/i },
  { id: 'lipid_fresh', rx: /\b(olio|burro|unto|grasso\s+fresco|lipidi|emulsion\w*|macchia\s+grassa)\b/i }
];

const SEVERITY_RANK = {
  NONE: 0,
  'P1-DAMAGE': 1,
  'P0-CRITICAL': 2,
  'P0-LETHAL': 3
};

export class HomeChemistryService {
  constructor() {
    this._matrix = null;
  }

  getMatrix() {
    if (!this._matrix) {
      this._matrix = JSON.parse(fs.readFileSync(CHEMISTRY_MATRIX_PATH, 'utf8'));
    }
    return this._matrix;
  }

  getRapalloHardnessBand(waterHardnessF = null) {
    const matrix = this.getMatrix();
    const effectiveF =
      Number.isFinite(Number(waterHardnessF)) && Number(waterHardnessF) > 0
        ? Number(waterHardnessF)
        : matrix.waterHardnessRapallo.defaultFrenchDegrees;
    const bands = matrix.waterHardnessRapallo.dosageBands;
    const matched =
      bands.find((b) => effectiveF >= b.minF && effectiveF <= b.maxF) ||
      (effectiveF < 15 ? bands[0] : bands[bands.length - 1]);
    return {
      frenchDegrees: effectiveF,
      municipality: matrix.waterHardnessRapallo.municipality,
      utilityProvider: matrix.waterHardnessRapallo.utilityProvider,
      rapalloReferenceRange: matrix.waterHardnessRapallo.frenchDegreesRange,
      ...matched
    };
  }

  resolveSurfaceId(rawSurface = '', boatMode = false) {
    if (boatMode && !rawSurface) return 'barca_aisi316_gelcoat';
    const norm = normalizeText(rawSurface);
    const matrix = this.getMatrix();
    const direct = matrix.surfacesAndFabrics.find((s) => s.id === norm);
    if (direct) return direct.id;
    for (const alias of SURFACE_ALIASES) {
      if (alias.rx.test(norm)) return alias.id;
    }
    return boatMode ? 'barca_aisi316_gelcoat' : 'acciaio_inox_satinato';
  }

  resolveSoilId(rawSoil = '', peakTempC = null) {
    const norm = normalizeText(rawSoil);
    const matrix = this.getMatrix();
    const direct = matrix.soilTaxonomy.find((s) => s.id === norm);
    let resolved = direct ? direct.id : null;
    if (!resolved) {
      for (const alias of SOIL_ALIASES) {
        if (alias.rx.test(norm)) {
          resolved = alias.id;
          break;
        }
      }
    }
    if (!resolved) {
      resolved = Number(peakTempC) >= 180 ? 'lipid_polymerized' : 'lipid_fresh';
    }
    if (resolved === 'lipid_fresh' && Number(peakTempC) >= 180) {
      resolved = 'lipid_polymerized';
    }
    return resolved;
  }

  /**
   * Non-bypassable deterministic P0/P1 chemical & handling safety verifier.
   * Accepts a string query OR structured object `{ reagents, surface, containerType, applicationMethod, waterTempC, queryText, boatMode }`.
   */
  checkChemicalSafetyP0(input = {}) {
    const matrix = this.getMatrix();
    const rulesById = new Map(matrix.chemicalSafetyMatrixP0.map((r) => [r.id, r]));

    const opts = typeof input === 'string' ? { queryText: input } : input || {};
    const reagentsText = Array.isArray(opts.reagents) ? opts.reagents.join(' + ') : String(opts.reagents || '');
    const surfaceText = String(opts.surface || '');
    const containerText = String(opts.containerType || '');
    const methodText = String(opts.applicationMethod || '');
    const queryText = String(opts.queryText || '');
    const waterTempC = opts.waterTempC !== undefined && opts.waterTempC !== null ? Number(opts.waterTempC) : null;
    const boatMode = Boolean(opts.boatMode);

    const combined = normalizeText(`${reagentsText} ${surfaceText} ${containerText} ${methodText} ${queryText}`);

    const hasBleach =
      /\b(candeggina(?!\s+(?:delicata|gentile))|ipoclorito|naclo|cloro\s+attivo|euclorina|amuchina|\bace\b(?!\s+(?:gentile|delicata|lavatrice|detersivo)))\b/i.test(
        combined
      );
    const hasAcid =
      /\b(acid\w*|citrico|aceto|acetico|viakal|anticalcare|muriatico|cloridrico|hcl\b|limone|disincrostant\w*|sulfammico|fosforico|lattico|wc\s+net)\b/i.test(
        combined
      );
    const hasHydrochloric = /\b(muriatico|acido\s+cloridrico|\bhcl\b)\b/i.test(combined);
    const hasAmmonia = /\b(ammoniaca|ammoniacal\w*|\bnh3\b|urina)\b/i.test(combined);
    const hasPeroxideOrPercarbonate =
      /\b(percarbonato|perossido|acqua\s+ossigenata|h2o2|candeggina\s+(?:delicata|gentile)|ossigeno\s+attivo)\b/i.test(
        combined
      );
    const hasVinegarOrConcentratedAcid =
      /\b(aceto|acetico|muriatico|cloridrico|anticalcare|viakal|citrico)\b/i.test(combined);
    const hasStrongAlkaliOrDishwasher =
      /\b(soda\s+caustica|idrossido\s+di\s+sodio|\bnaoh\b|soda\s+solvay|carbonato\s+di\s+sodio|lavastoviglie|tabs\b|fornet|disgorgant\w*|sgrassator\w*\s+caustic\w*)\b/i.test(
        combined
      );
    const hasAnionicSoap =
      /\b(detersivo\s+piatti|sapone\s+piatti|svelto|nelsen|fairy|tensioattiv\w*\s+anion\w*|sles\b|las\b)\b/i.test(
        combined
      );
    const hasCationicQuatBiocide =
      /\b(benzalconio|sali\s+quaternari|quaternari\s+d['’]?ammonio|ddac\b|didecildimetilammonio|lysoform\s+disinfettante|disinfettante\s+cationico)\b/i.test(
        combined
      );

    const isClosedBottleOrSpray =
      /\b(bottiglia\s+chiusa|flacone\s+chiuso|spray\s+chiuso|spruzzino\s+chiuso|chiudere\s+in\s+(?:bottiglia|flacone|spray)|conservare\s+in\s+(?:bottiglia|spray|spruzzino)|ermetic\w*|pre-?preparare\s+spray)\b/i.test(
        combined
      ) ||
      (/\b(spray|spruzzino|bottiglia)\b/i.test(normalizeText(`${containerText} ${queryText}`)) &&
        hasPeroxideOrPercarbonate &&
        !/\b(vaso\s+aperto|bacinella\s+aperta|non\s+chiudere|vietato)\b/i.test(combined));

    const isFoodOrWaterBottle =
      /\b(bottigli\w*\s+(?:dell['’]?acqua|d['’]?acqua|acqua\s+minerale|bibita|coca|plastica\s+alimentare|pet\s+acqua)|vasett\w*\s+(?:marmellata|alimentare)|bicchiere\s+da\s+tavola|senza\s+etichetta|contenitore\s+anonimo)\b/i.test(
        combined
      );

    const isFineAerosolOrBoilOver =
      /\b(aerosol\s+fine|nebulizzazion\w*\s+fine|nube\s+di\s+polvere|acqua\s+bollente|100\s*°?\s*c|90\s*°?\s*c)\b/i.test(
        combined
      ) ||
      (waterTempC !== null && waterTempC > 60 && hasPeroxideOrPercarbonate);

    const isCalcareousStone =
      /\b(marmo|carrara|mortaio|ardesia|graniglia|travertino|pietra\s+naturale|fughe\s+cement\w*)\b/i.test(combined);
    const isAluminum = /\b(alluminio|moka|caffettiera\s+moka|filtri?\s+alluminio|spartifiamma)\b/i.test(combined);
    const isStainlessOrChrome = /\b(inox|acciaio\s+18\/10|acciaio\s+inossidabile|cromat\w*|rubinett\w*)\b/i.test(combined);
    const isWoolOrSilk = /\b(lana|cashmere|merino|seta)\b/i.test(combined);
    const isMicrofiberOrTech = /\b(microfibra|gore[\s-]?tex|tecnic\w*\s+vela|cerata)\b/i.test(combined);
    const hasProtease = /\b(proteasi|subtilisin|detersivo\s+universale)\b/i.test(combined);
    const hasCationicSoftenerOrMarseille = /\b(ammorbidente|esterquat|coccolino|lenor|vernel|sapone\s+di\s+marsiglia)\b/i.test(combined);
    const isBoatContext = boatMode || /\b(barca|mare|rada|scarico\s+a\s+mare|sentina|aisi\s*316)\b/i.test(combined);

    const violations = [];
    const pushRule = (ruleId, customOverride = null) => {
      const base = rulesById.get(ruleId);
      if (base && !violations.some((v) => v.id === base.id)) {
        violations.push(customOverride ? { ...base, ...customOverride } : base);
      } else if (customOverride && !violations.some((v) => v.id === customOverride.id)) {
        violations.push(customOverride);
      }
    };

    if (hasBleach && hasAcid) pushRule('p0-bleach-acid');
    if (hasBleach && hasAmmonia) pushRule('p0-bleach-ammonia');
    if (hasPeroxideOrPercarbonate && (hasVinegarOrConcentratedAcid || hasBleach)) {
      pushRule('p0-peroxide-acetic');
    }
    if (hasStrongAlkaliOrDishwasher && isAluminum) pushRule('p0-alkali-aluminum-h2');
    if (hasAnionicSoap && hasCationicQuatBiocide) pushRule('p0-anionic-cationic-inactivation');
    if (hasPeroxideOrPercarbonate && isClosedBottleOrSpray) pushRule('p0-pressure-burst');
    if (isFoodOrWaterBottle && (hasAcid || hasStrongAlkaliOrDishwasher || hasPeroxideOrPercarbonate || hasBleach || combined.length > 0)) {
      pushRule('p0-cav-ingestion');
    }
    if (
      isFineAerosolOrBoilOver &&
      (hasPeroxideOrPercarbonate || hasStrongAlkaliOrDishwasher || hasAcid)
    ) {
      pushRule('p0-dust-aerosol');
    }
    if (hasAcid && isCalcareousStone) pushRule('p1-acid-ligurian-stone');
    if ((hasBleach || hasHydrochloric) && isStainlessOrChrome) pushRule('p1-bleach-stainless-pitting');

    if (isWoolOrSilk && (hasProtease || hasPeroxideOrPercarbonate || hasStrongAlkaliOrDishwasher || hasBleach)) {
      pushRule('p1-protease-alkali-wool', {
        id: 'p1-protease-alkali-wool',
        code: 'P1-WOOL-SILK-HYDROLYSIS',
        severity: 'P1-DAMAGE',
        category: 'substrate_reaction',
        reagentA: 'Proteasi (Subtilisin), Percarbonato, Alcali o Candeggina',
        reagentB: 'Fibre Proteiche (Lana, Cashmere, Seta)',
        hazardFormula: 'Cheratina/Fibroina + OH- / Subtilisin -> idrolisi legami peptidici e infeltrimento',
        toxicProduct: 'Buchi enzimatici e restringimento irreversibile del capo',
        clinicalRisk: 'Distruzione immediata di capi in lana/seta di alto valore.',
        mandatoryRule: 'Usare SOLO detersivo specifico Lana/Seta a pH neutro privo di Proteasi/Subtilisin a <= 30°C.'
      });
    }

    if (isMicrofiberOrTech && hasCationicSoftenerOrMarseille) {
      pushRule('p1-microfiber-softener', {
        id: 'p1-microfiber-softener',
        code: 'P1-CAPILLARY-OCCLUSION',
        severity: 'P1-DAMAGE',
        category: 'substrate_reaction',
        reagentA: 'Ammorbidente Cationico (Esterquat) o Sapone di Marsiglia',
        reagentB: 'Panni in Microfibra o Abbigliamento Tecnico/Vela',
        hazardFormula: 'Esterquat / Stearato di Calcio -> rivestimento idrofobico dei micro-capillari',
        toxicProduct: 'Perdita di assorbenza e intrappolamento degli odori batterici',
        clinicalRisk: 'Inefficacia permanente dei panni tecnici e delle membrane traspiranti.',
        mandatoryRule: 'Lavare senza ammorbidente usando 50 ml di Acido Citrico al 15% come risciacquo acido.'
      });
    }

    if (isBoatContext && (hasBleach || hasHydrochloric)) {
      pushRule('p0-marine-bleach', {
        id: 'p0-marine-bleach',
        code: 'P0-MARINE-TOXICITY',
        severity: 'P0-CRITICAL',
        category: 'marine_safety',
        reagentA: 'Ipoclorito di Sodio (Candeggina H400) o Acido Muriatico',
        reagentB: 'Ambiente Marino / Scarico a Mare (Golfo del Tigullio)',
        hazardFormula: 'NaClO + composti organici marini -> composti organoclorurati persistenti (AOX)',
        toxicProduct: 'Tossicità acuta per la fauna marina (CLP H400) e corrosione AISI 316',
        clinicalRisk: 'Danno ambientale marino severo e innesco di corrosione interstiziale sulle attrezzature di coperta.',
        mandatoryRule: 'In barca usare solo Acido Citrico E330, Percarbonato a terra/vaso aperto e tensioattivi biodegradabili Reg. CE 648/2004.'
      });
    }

    let highestSeverity = 'NONE';
    for (const v of violations) {
      if ((SEVERITY_RANK[v.severity] || 0) > SEVERITY_RANK[highestSeverity]) {
        highestSeverity = v.severity;
      }
    }

    const blockedByP0 = violations.some((v) => String(v.severity).startsWith('P0'));
    const blockedByP1 = violations.some((v) => String(v.severity).startsWith('P1'));

    return {
      safe: violations.length === 0,
      blockedByP0,
      blockedByP1,
      highestSeverity,
      violations,
      safeAlternative:
        violations.length > 0
          ? violations.map((v) => v.mandatoryRule).join(' | ')
          : 'Combinazione chimicamente compatibile. Rispettare sempre aerazione e dosaggi per 18 °f.'
    };
  }

  /**
   * Resolves the optimal deterministic cleaning/stain protocol (`Surface x Soil x Active x Sinner's Circle`),
   * calibrated on Rapallo's water hardness and user's owned Minimal Kit items.
   */
  resolveStainOrSoil({
    surface = 'acciaio_inox_satinato',
    soil = 'lipid_fresh',
    ownedKitKeys = [],
    waterHardnessF = 18,
    peakTempC = null,
    boatMode = false
  } = {}) {
    const matrix = this.getMatrix();
    const surfaceId = this.resolveSurfaceId(surface, boatMode);
    const soilId = this.resolveSoilId(soil, peakTempC);

    const surfaceSpec =
      matrix.surfacesAndFabrics.find((s) => s.id === surfaceId) || matrix.surfacesAndFabrics[0];
    const soilSpec =
      matrix.soilTaxonomy.find((s) => s.id === soilId) || matrix.soilTaxonomy[0];
    const hardnessInfo = this.getRapalloHardnessBand(waterHardnessF);

    let proto = matrix.sinnerProtocols.find(
      (p) => p.surfaceId === surfaceId && p.soilId === soilId
    );

    if (!proto) {
      proto = this._synthesizeFallbackProtocol(surfaceSpec, soilSpec);
    }

    const ownedSet = new Set(Array.isArray(ownedKitKeys) ? ownedKitKeys : []);
    const kitByKey = new Map(matrix.minimalChemicalKit.map((k) => [k.key, k]));
    const rulesById = new Map(matrix.chemicalSafetyMatrixP0.map((r) => [r.id, r]));

    const requiredKitPillars = proto.recommendedKitKeys
      .map((k) => kitByKey.get(k))
      .filter(Boolean)
      .map((item) => ({
        key: item.key,
        name: item.name,
        chemicalClass: item.chemicalClass,
        referencePriceEuro: item.referencePriceEuro,
        owned: ownedSet.has(item.key),
        allowedInClosedSprayBottle: item.preparedSolutionRecipe.allowedInClosedSprayBottle,
        formula: item.preparedSolutionRecipe.formula
      }));

    const activeP0Locks = [];
    for (const k of proto.recommendedKitKeys) {
      const kitItem = kitByKey.get(k);
      for (const lockId of kitItem?.p0Locks || []) {
        const rule = rulesById.get(lockId);
        if (rule && !activeP0Locks.some((r) => r.id === rule.id)) {
          activeP0Locks.push(rule);
        }
      }
    }

    const sinnerSum =
      proto.sinnerCircle.chemistryPct +
      proto.sinnerCircle.tempPct +
      proto.sinnerCircle.timePct +
      proto.sinnerCircle.mechanicalPct;

    return {
      protocolId: proto.id,
      title: proto.title,
      surface: {
        id: surfaceSpec.id,
        name: surfaceSpec.name,
        safePhRange: surfaceSpec.safePhRange,
        forbiddenClasses: surfaceSpec.forbiddenClasses,
        materialNote: surfaceSpec.materialNote
      },
      soil: {
        id: soilSpec.id,
        code: soilSpec.code,
        name: soilSpec.name,
        chemicalMechanism: soilSpec.chemicalMechanism
      },
      sinnerCircle: {
        ...proto.sinnerCircle,
        totalPct: sinnerSum
      },
      doNotDoFirst: proto.doNotDoFirst,
      steps: proto.steps,
      rapalloWaterCalibration: hardnessInfo,
      requiredKitPillars,
      missingKitKeys: requiredKitPillars.filter((p) => !p.owned).map((p) => p.key),
      p0SafetyLocks: activeP0Locks
    };
  }

  _synthesizeFallbackProtocol(surfaceSpec, soilSpec) {
    const forbidsAcid = surfaceSpec.forbiddenClasses.includes('acid');
    const forbidsAlkali =
      surfaceSpec.forbiddenClasses.includes('alkaline') ||
      surfaceSpec.forbiddenClasses.includes('strong_alkali');
    const forbidsAbrasive = surfaceSpec.forbiddenClasses.includes('mechanical_abrasive');
    const isProteinFiber = surfaceSpec.id === 'lana_seta_delicati';

    let recommendedKitKeys = ['detersivo_piatti_neutro', 'disinfettante_pmc_e_microfibra'];
    let doNotDoFirst = `Rispettare il range pH sicuro [${surfaceSpec.safePhRange[0]} – ${surfaceSpec.safePhRange[1]}] per ${surfaceSpec.name}.`;
    let steps = [
      `Rimuovere lo sporco grossolano a tiepido senza abrasivi su ${surfaceSpec.name}.`,
      `Applicare detergente compatibile lasciando agire il tempo necessario (Cerchio di Sinner) e risciacquare.`,
      `Asciugare con panno in microfibra dedicato.`
    ];

    if (forbidsAcid && soilSpec.id === 'inorganic_limescale_soapscum') {
      doNotDoFirst =
        'ALT P1! VIETATO usare acido citrico, aceto, limone o anticalcare su questa superficie calcarea (corrosione immediata del CaCO3!).';
      steps = [
        'Pulire solo con panno in microfibra inumidito in acqua tiepida (o demineralizzata) e 1 goccia di detergente neutro.',
        'Asciugare subito con microfibra asciutta per prevenire il deposito di nuovo carbonato.'
      ];
    } else if (!forbidsAcid && soilSpec.id === 'inorganic_limescale_soapscum') {
      recommendedKitKeys = ['acido_citrico_puro', 'disinfettante_pmc_e_microfibra'];
      doNotDoFirst = 'NON grattare meccanicamente la crosta minerale e NON usare candeggina (pH 12, inefficace sul calcare!).';
      steps = [
        'Applicare soluzione di Acido Citrico al 15% tramite panno o impacco di carta.',
        'Attendere 10 minuti per chelare il Ca2+ senza sfregare.',
        'Risciacquare con acqua fredda e asciugare con microfibra.'
      ];
    } else if (isProteinFiber) {
      recommendedKitKeys = ['set_enzimatico_mirato'];
      doNotDoFirst =
        'ALT P1! VIETATI detersivi con Proteasi (Subtilisin), Percarbonato, Soda e acqua calda > 30°C su lana e seta!';
      steps = [
        'Tamponare delicatamente a freddo senza mai strofinare le fibre.',
        'Lavare a <= 30°C esclusivamente con detersivo liquido specifico Lana/Seta privo di enzimi proteolitici.'
      ];
    } else if (!forbidsAlkali && soilSpec.id === 'lipid_polymerized') {
      recommendedKitKeys = ['sgrassatore_alcalino_foamer', 'detersivo_piatti_neutro'];
      doNotDoFirst = 'NON usare candeggina sui grassi cotti e NON nebulizzare aerosol caustici fini.';
      steps = [
        'Applicare Sgrassatore Foamer alcalino a superficie tiepida (< 50°C).',
        'Lasciare saponificare per 5–10 minuti, rimuovere con spugna morbida e risciacquare.'
      ];
    } else if (soilSpec.id === 'biopolymer_protein_starch') {
      recommendedKitKeys = ['detersivo_piatti_neutro', 'set_enzimatico_mirato'];
      doNotDoFirst = 'FERMO! NON usare acqua calda (> 35°C) all\'inizio: cuoce e fissa le proteine al substrato!';
      steps = [
        'Sciacquare immediatamente con sola acqua FREDDA (< 30°C) per allontanare le proteine solubili.',
        'Trattare a tiepido con detergente neutro o enzimatico per 15 minuti e risciacquare.'
      ];
    } else if (soilSpec.id === 'oxidizable_chromophores' && !forbidsAlkali && !isProteinFiber) {
      recommendedKitKeys = ['sodio_percarbonato', 'detersivo_piatti_neutro'];
      doNotDoFirst = 'NON chiudere mai soluzioni di percarbonato in bottiglie spray (P0-PRESSURE-BURST)!';
      steps = [
        'Preparare in bacinella o ciotola APERTA acqua a 45°C con 1 cucchiaio di Sodio Percarbonato + TAED.',
        'Lasciare agire l\'ossigeno attivo per 20–30 minuti, risciacquare a fondo e smaltire il liquido residuo.'
      ];
    }

    const mechanicalPct = forbidsAbrasive ? 5 : 20;
    const timePct = forbidsAbrasive ? 40 : 25;
    return {
      id: `proto-synth-${surfaceSpec.id}-${soilSpec.id}`,
      surfaceId: surfaceSpec.id,
      soilId: soilSpec.id,
      title: `${soilSpec.name} su ${surfaceSpec.name}`,
      sinnerCircle: {
        chemistryPct: 40,
        tempPct: 15,
        timePct,
        mechanicalPct
      },
      doNotDoFirst,
      recommendedKitKeys,
      steps
    };
  }

  /**
   * Returns the 7-Pillar Minimal Chemical Kit calibrated to Rapallo's water hardness (14–22 °f)
   * and mandatory P0 pure-powder handling locks.
   */
  getMinimalKitGuide({ waterHardnessF = 18, ownedKitKeys = [] } = {}) {
    const matrix = this.getMatrix();
    const hardness = this.getRapalloHardnessBand(waterHardnessF);
    const ownedSet = new Set(Array.isArray(ownedKitKeys) ? ownedKitKeys : []);
    const purePowderLocks = matrix.chemicalSafetyMatrixP0.filter(
      (r) => r.category === 'pure_powder_handling'
    );

    const pillars = matrix.minimalChemicalKit.map((item) => ({
      ...item,
      owned: ownedSet.has(item.key),
      calibratedMultiplierRapallo: hardness.detergentMultiplierVsEu25F
    }));

    const totalReplacedCount = pillars.reduce(
      (acc, p) => acc + (p.replacedCommercialProducts?.length || 0),
      0
    );
    const fullKitReferenceCostEuro = Number(
      pillars.reduce((acc, p) => acc + Number(p.referencePriceEuro || 0), 0).toFixed(2)
    );

    return {
      waterHardness: hardness,
      pillarCount: pillars.length,
      totalCommercialBottlesReplaced: totalReplacedCount,
      fullKitReferenceCostEuro,
      purePowderSafetyLocksP0: purePowderLocks,
      pillars
    };
  }

  /**
   * Returns stoichiometric Myth-Busters (optionally filtered by search topic).
   */
  getMythBusters({ topic = null } = {}) {
    const matrix = this.getMatrix();
    const myths = matrix.mythBusters;
    if (!topic) return myths;
    const q = normalizeText(topic);
    return myths.filter((m) =>
      normalizeText(`${m.mythTitle} ${m.stoichiometry} ${m.chemicalTruth}`).includes(q)
    );
  }

  /**
   * Returns anti-breakdown maintenance schedules for household appliances and the Tigullio Boat module.
   */
  getApplianceMaintenancePlan({ applianceId = null, waterHardnessF = 18, includeBoat = true } = {}) {
    const matrix = this.getMatrix();
    const hardness = this.getRapalloHardnessBand(waterHardnessF);
    let plans = matrix.applianceMaintenancePlans;
    if (applianceId) {
      const q = normalizeText(applianceId);
      plans = plans.filter(
        (p) => normalizeText(p.id).includes(q) || normalizeText(p.applianceName).includes(q)
      );
    }
    const boatProtocol = includeBoat
      ? matrix.sinnerProtocols.find((p) => p.id === 'proto-boat-marine-care') || null
      : null;

    return {
      waterHardness: hardness,
      appliances: plans,
      boatCareModule: boatProtocol
    };
  }

  /**
   * Decodes Reg. (EC) 648/2004 INCI / IUPAC ingredient lists into chemical roles & greenwashing alerts.
   */
  decodeDetergentInci(inciText = '') {
    const norm = normalizeText(inciText);
    const matrix = this.getMatrix();
    const detectedActives = [];

    for (const active of matrix.activePrinciplesReg648) {
      if (active.inciTokens.some((tok) => norm.includes(normalizeText(tok)))) {
        detectedActives.push({
          id: active.id,
          name: active.name,
          primaryFunction: active.primaryFunction,
          clpHazards: active.clpHazards
        });
      }
    }

    const warnings = [];
    if (/\b(subtilisin|protease)\b/i.test(norm)) {
      warnings.push('Contiene Proteasi (Subtilisin): ottimo su sangue/uovo su cotone, VIETATO su Lana e Seta!');
    }
    if (/\b(esterquat|dihydrogenated\s+palmoylethyl)\b/i.test(norm)) {
      warnings.push('Contiene Esterquat cationico: VIETATO su panni in microfibra e abbigliamento tecnico/vela!');
    }
    if (/\b(sodium\s+hypochlorite)\b/i.test(norm)) {
      warnings.push('Contiene Ipoclorito di Sodio: MAI miscelare con acidi o ammoniaca; VIETATO su Acciaio Inox 18/10!');
    }
    if (/\b(bicarbonat\w*|vinegar|acetic\s+acid)\b/i.test(norm) && /\b(sodium\s+laureth\s+sulfate|laureth)\b/i.test(norm)) {
      warnings.push('Alert Marketing: la detersione reale deriva dai tensioattivi sintetici primari; bicarbonato/aceto in tracce hanno funzione puramente commerciale.');
    }

    return {
      detectedActives,
      warnings
    };
  }

  /**
   * Synchronous single-item evaluator enforcing ADR-0006 (`null` when pack/washes omitted)
   * and Reg. (EC) 648/2004 Interval Dominance (`[min%, max%]` conservative lower-bound).
   */
  evaluateDetergentOfferItem(offer = {}, { waterHardnessF = 18 } = {}) {
    const matrix = this.getMatrix();
    const hardness = this.getRapalloHardnessBand(waterHardnessF);
    const promoPrice = Number(offer.promoPrice ?? offer.discountPrice ?? offer.price ?? 0);
    const lens = evaluateQualityLens({ ...offer, domain: 'home_cleaning' });
    const metrics = extractPackMetrics({ ...offer, domain: 'home_cleaning' });

    const txt = normalizeText(`${offer.title || ''} ${offer.brand || ''} ${offer.description || ''}`);

    // Determine benchmark class & equivalent Minimal Kit pillar
    let benchmarkKey = null;
    let mappedKitKey = 'set_enzimatico_mirato';
    if (/\b(anticalcare|viakal|disincrostant\w*|quasar\s+bagno|winni.*bagno)\b/i.test(txt)) {
      benchmarkKey = 'descaler_spray';
      mappedKitKey = 'acido_citrico_puro';
    } else if (/\b(smacchiator\w*|ossigeno\s+attivo|vanish|omino\s+bianco\s+additivo|napisan\s+additivo)\b/i.test(txt)) {
      benchmarkKey = 'oxygen_stain_remover';
      mappedKitKey = 'sodio_percarbonato';
    } else if (/\b(sgrassator\w*|chanteclair|fornet|pulitore\s+forno)\b/i.test(txt)) {
      benchmarkKey = 'alkaline_degreaser_spray';
      mappedKitKey = 'sgrassatore_alcalino_foamer';
    } else if (/\b(piatti|stoviglie(?!\s+lavastoviglie)|svelto|nelsen|fairy\s+piatti)\b/i.test(txt)) {
      mappedKitKey = 'detersivo_piatti_neutro';
    } else if (/\b(ammorbident\w*|coccolino|lenor|vernel)\b/i.test(txt)) {
      mappedKitKey = 'acido_citrico_puro';
    } else if (/\b(candeggina|ipoclorito|disinfettant\w*|lysoform)\b/i.test(txt)) {
      mappedKitKey = 'disinfettante_pmc_e_microfibra';
    } else if (/\b(microfibra|panno|spugn\w*)\b/i.test(txt)) {
      mappedKitKey = 'disinfettante_pmc_e_microfibra';
    }

    const hasExplicitFormat = Boolean(
      (metrics.washCount && metrics.washCount > 0) ||
        (metrics.packVolumeMl && metrics.packVolumeMl > 0) ||
        (metrics.packWeightGrams && metrics.packWeightGrams > 0)
    );

    let costPerStandardCycleEur = null;
    let costPerRapalloCycleEur = null;
    if (promoPrice > 0 && metrics.washCount && metrics.washCount > 0) {
      costPerStandardCycleEur = Number((promoPrice / metrics.washCount).toFixed(4));
      costPerRapalloCycleEur = Number(
        (costPerStandardCycleEur * hardness.detergentMultiplierVsEu25F).toFixed(4)
      );
    }

    // ADR-0006 Interval Dominance: ONLY computed when pack mass/volume is explicitly known (never guessed!)
    let intervalDominanceComparison = null;
    const explicitMassGrams = metrics.packWeightGrams || metrics.packVolumeMl || null;
    if (promoPrice > 0 && explicitMassGrams && explicitMassGrams > 0 && benchmarkKey) {
      const bench = matrix.reg648IntervalBenchmarks[benchmarkKey];
      if (bench) {
        // Conservative lower-bound cost for the commercial bottle: grant it the MAXIMUM active % of its Reg. 648/2004 band!
        const maxCommercialActiveGrams = explicitMassGrams * bench.favorableCommercialUpperBound;
        const commercialBestCaseEuroPerKgActive = Number(
          ((promoPrice / maxCommercialActiveGrams) * 1000).toFixed(2)
        );
        const kitPureEuroPerKgActive = Number(
          (bench.kitReferencePricePerKgEuro / bench.kitPureActiveFraction).toFixed(2)
        );
        const dominanceProven = commercialBestCaseEuroPerKgActive > kitPureEuroPerKgActive;
        const certifiedMinSavingsPct = dominanceProven
          ? Number(
              ((1 - kitPureEuroPerKgActive / commercialBestCaseEuroPerKgActive) * 100).toFixed(1)
            )
          : 0;

        intervalDominanceComparison = {
          benchmarkType: benchmarkKey,
          reg648BandLabel: bench.reg648Band,
          commercialActivePctRange: [
            Number((bench.commercialActiveFractionInterval[0] * 100).toFixed(1)),
            Number((bench.commercialActiveFractionInterval[1] * 100).toFixed(1))
          ],
          assumedCommercialUpperBoundPct: Number((bench.favorableCommercialUpperBound * 100).toFixed(1)),
          commercialBestCaseEuroPerKgActive,
          kitAlternativeKey: bench.kitPillarKey,
          kitPureEuroPerKgActive,
          dominanceProven,
          certifiedMinSavingsPct
        };
      }
    }

    return {
      id: offer.id || null,
      storeId: offer.storeId || null,
      storeName: offer.storeName || offer.chainId || null,
      title: offer.title || '',
      brand: offer.brand || null,
      promoPrice: promoPrice > 0 ? promoPrice : null,
      packSizeStatus: hasExplicitFormat ? 'explicit_verified' : 'omitted_on_flyer',
      packWeightGrams: metrics.packWeightGrams,
      packVolumeMl: metrics.packVolumeMl,
      washCount: metrics.washCount,
      costPerStandardCycleEur,
      costPerRapalloCycleEur,
      rapalloWaterHardnessF: hardness.frenchDegrees,
      phClass: lens.technicalSpec?.phClass || null,
      qualityBadges: lens.badges,
      safetyWarnings: lens.warnings,
      mappedMinimalKitKey: mappedKitKey,
      intervalDominanceComparison
    };
  }

  /**
   * Evaluates active Rapallo detergent/home_cleaning offers with strict ADR-0006 honesty
   * (`null` when format omitted on flyer, Reg. 648/2004 Interval Dominance when format known).
   */
  async evaluateDetergentOffersRapallo(offers = null, options = {}) {
    const sourceOffers = Array.isArray(offers) ? offers : await offerService.getRawOffers();
    const hardness = this.getRapalloHardnessBand(options.waterHardnessF);

    const genuineCleaning = sourceOffers.filter((o) => {
      if (!o || !o.title) return false;
      if (/^(al\s*kg|all['’\s]?etto|offerta|solo)$/i.test(String(o.title).trim())) return false;
      return classifyProductDomain(o) === 'home_cleaning';
    });

    const evaluated = genuineCleaning.map((o) =>
      this.evaluateDetergentOfferItem(o, { waterHardnessF: hardness.frenchDegrees })
    );

    return {
      waterHardness: hardness,
      totalCleaningOffers: evaluated.length,
      explicitFormatCount: evaluated.filter((e) => e.packSizeStatus === 'explicit_verified').length,
      omittedFormatCount: evaluated.filter((e) => e.packSizeStatus === 'omitted_on_flyer').length,
      offers: evaluated
    };
  }
}

export const homeChemistryService = new HomeChemistryService();

export function resolveStainOrSoil(params = {}) {
  return homeChemistryService.resolveStainOrSoil(params);
}

export function checkChemicalSafetyP0(input = {}) {
  return homeChemistryService.checkChemicalSafetyP0(input);
}

export function getMinimalKitGuide(params = {}) {
  return homeChemistryService.getMinimalKitGuide(params);
}

export function getApplianceMaintenancePlan(params = {}) {
  return homeChemistryService.getApplianceMaintenancePlan(params);
}

export function getMythBusters(params = {}) {
  return homeChemistryService.getMythBusters(params);
}

export async function evaluateDetergentOffersRapallo(offers = null, options = {}) {
  return homeChemistryService.evaluateDetergentOffersRapallo(offers, options);
}

export function decodeDetergentInci(inciText = '') {
  return homeChemistryService.decodeDetergentInci(inciText);
}

export default homeChemistryService;
