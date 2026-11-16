/**
 * Basilico 2.0 — Cookware Thermophysics, P0 Material Guards & Closed-Loop Stove Calibration Engine
 * (`ADR-0006`, `ADR-0010`, `ADR-0015` / `TASK-V2-02`)
 * Location: server/services/cookwarePhysicsEngine.js
 *
 * Implements:
 *  1. Certified thermophysical materials & geometry catalog (`materials_physics.json`, zero synthetic numbers)
 *  2. Zero-friction discrete inertia bands (`light/medium/heavy`) + optional 1-time kitchen scale exact capacity `C = M * cp`
 *  3. Pan batching & immersion thermal-drop solver (`1 vs 2+ batches` to prevent dropping below 140°C Maillard threshold)
 *  4. Stove power translator with non-bypassable P0 safety blocks:
 *       - `P0-PTFE-NO-BOOST` (blocks Induction Boost / >200°C / dry preheat on PTFE)
 *       - `P0-TIN-NO-DRY-PREHEAT` (blocks dry preheat / >215°C on tinned copper — Sn melts at 231.9°C)
 *       - `P0-RAW-COPPER-ACID-TOXICITY` (blocks acidic foods on unlined copper)
 *       - `P0-SEASONING-ACID-STRIP` & `P0-FERRO-PROGRESSIVE-PREHEAT` (alerts/caps long acid & dry Boost on cast iron / carbon steel)
 *       - `P0-INOX-COLD-SALT-PITTING` (blocks salting cold unboiled water on 18/10 stainless steel)
 *       - `P0-INDUCTION-NON-FERROMAGNETIC` (blocks diamagnetic/insulator cookware on induction)
 *  5. 1-Tap Lab Notebook closed-loop calibration (`perfect | overcooked_dry | pale_boiled | stuck_or_broken`)
 *  6. Knife metallurgy (`56–58 HRC` vs `60–63 HRC` + cutting boards) & storage container chemistry (`Borosilicate`, `Marine AISI 316`, `PP #5`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MATERIALS_SEED_PATH = path.resolve(__dirname, '../../data/seed/materials_physics.json');
const ARCHETYPES_SEED_PATH = path.resolve(__dirname, '../../data/seed/cookware_archetypes.json');
const DEFAULT_CALIBRATION_PATH = path.resolve(__dirname, '../../data/cache/cookware_calibration.json');

export const VALID_VISUAL_OUTCOMES = ['perfect', 'overcooked_dry', 'pale_boiled', 'stuck_or_broken'];
export const VALID_WEIGHT_CLASSES = ['light', 'medium', 'heavy'];

const LEGACY_MATERIAL_TO_PHYSICS_ID = {
  alluminio_rivestito_ptfe: 'aluminum_ptfe',
  acciaio_inox_18_10: 'stainless_triply_18_10',
  ghisa_stagionata: 'cast_iron_seasoned',
  marmo_naturale: 'marble_carrara',
  rame_puro: 'copper_unlined',
  rame_stagnato_gres: 'terracotta_glazed',
  acciaio_inossidabile_martensitico: 'stainless_triply_18_10'
};

const GAS_STEPS = [
  'Spento (Fuori fuoco <65°C)',
  'Fiamma minima su bruciatore piccolo (~75–90°C)',
  'Fiamma dolce-media su bruciatore piccolo (~105–125°C)',
  'Fiamma media su bruciatore medio (~140–165°C)',
  'Fiamma medio-alta su bruciatore medio-grande (~170–190°C)',
  'Fiamma viva su bruciatore grande / corona ampia (~195–220°C)'
];

const INDUCTION_STEPS = [
  'Zona spenta / Pentola spostata fuori bobina (<65°C)',
  'Induzione Livello 2–3 su 9 (Infusione/Sobbollizione dolce ~80–90°C)',
  'Induzione Livello 4–5 su 9 (Cottura delicata ~115–135°C)',
  'Induzione Livello 6 su 9 (Conduzione controllata ~155–180°C)',
  'Induzione Livello 7–8 su 9 (Rosolatura Maillard sostenuta ~185–210°C, NO Boost)',
  'Induzione Livello 8–9 / Boost liquido controllato (Alta potenza con carico acquoso)'
];

const RADIANT_STEPS = [
  'Fuori dalla piastra calda (alta inerzia vetroceramica!)',
  'Piastra Elettrica Livello 1–2 su 6',
  'Piastra Elettrica Livello 3 su 6',
  'Piastra Elettrica Livello 4 su 6 (preriscaldata 3 min)',
  'Piastra Elettrica Livello 5 su 6 (preriscaldata 4 min)',
  'Piastra Elettrica Livello 6 su 6 (preriscaldata 5 min)'
];

const LEVEL_TO_BASE_INDEX = {
  off_heat: 0,
  low: 1,
  medium_low: 2,
  medium: 3,
  medium_high: 4,
  high: 5,
  boost: 5
};

export class CookwarePhysicsEngine {
  constructor(options = {}) {
    this.storagePath =
      options.storagePath || process.env.BASILICO_COOKWARE_CALIBRATION_PATH || DEFAULT_CALIBRATION_PATH;
    this._materialsData = null;
    this._archetypes = null;
    this._state = null;
  }

  getMaterialsCatalog() {
    if (!this._materialsData) {
      this._materialsData = JSON.parse(fs.readFileSync(MATERIALS_SEED_PATH, 'utf8'));
    }
    return this._materialsData;
  }

  getArchetypesCatalog() {
    if (!this._archetypes) {
      this._archetypes = JSON.parse(fs.readFileSync(ARCHETYPES_SEED_PATH, 'utf8'));
    }
    return this._archetypes;
  }

  _loadState() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && typeof parsed === 'object') {
          this._state = {
            calibrations: parsed.calibrations || {},
            measuredPanMassesGrams: parsed.measuredPanMassesGrams || {},
            history: Array.isArray(parsed.history) ? parsed.history : []
          };
          return this._state;
        }
      }
    } catch (_) {}
    this._state = {
      calibrations: {},
      measuredPanMassesGrams: {},
      history: []
    };
    return this._state;
  }

  _saveState() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  resolveToolAndMaterial({ toolId = null, materialId = null } = {}) {
    const catalog = this.getMaterialsCatalog();
    const archetypes = this.getArchetypesCatalog();
    const arch = toolId ? archetypes.find((a) => a.id === toolId) || null : null;

    const resolvedMatId =
      materialId ||
      arch?.materialId ||
      (arch?.material ? LEGACY_MATERIAL_TO_PHYSICS_ID[arch.material] : null) ||
      'stainless_triply_18_10';

    const materialSpec =
      catalog.materials[resolvedMatId] || catalog.materials.stainless_triply_18_10;
    const geometryId = arch?.geometryType || 'flared_skillet';
    const geometrySpec = catalog.geometries[geometryId] || catalog.geometries.flared_skillet;

    return { arch, materialSpec, geometrySpec };
  }

  /**
   * Builds the honest thermophysical profile of a pan (`ADR-0006`):
   *  - With `measuredMassGrams`: exact physical heat capacity `C = M_eff * cp` (J/K).
   *  - Without `measuredMassGrams`: certified discrete band `[min, max]` kJ/(m²·K), zero fake decimals.
   */
  getCookwarePhysicsProfile(options = {}) {
    const state = this._loadState();
    const { arch, materialSpec, geometrySpec } = this.resolveToolAndMaterial(options);
    const catalog = this.getMaterialsCatalog();

    const diameterCm = Number(options.diameterCm || arch?.defaultDiameterCm || 26);
    const weightClass = VALID_WEIGHT_CLASSES.includes(options.weightClass)
      ? options.weightClass
      : arch?.defaultWeightClass || 'medium';

    const storedMass = options.toolId ? state.measuredPanMassesGrams[options.toolId] : null;
    const measuredMassGrams =
      options.measuredMassGrams !== undefined && options.measuredMassGrams !== null
        ? Number(options.measuredMassGrams)
        : storedMass || null;

    const topRadiusM = diameterCm / 200;
    const effectiveFlatRadiusM = topRadiusM * Math.sqrt(geometrySpec.effectiveFlatBottomRatio || 0.8);
    const flatBottomAreaM2 = Math.PI * effectiveFlatRadiusM * effectiveFlatRadiusM;
    const flatBottomAreaCm2 = Math.round(flatBottomAreaM2 * 10000);

    const handleFraction =
      arch?.category === 'bakeware' || geometrySpec.id === 'shallow_baking_pan'
        ? catalog.metadata.scaleUpgradeFormula.handlelessBakewareFraction
        : catalog.metadata.scaleUpgradeFormula.defaultSkilletHandleFraction;

    const bandRangeKJm2K =
      materialSpec.arealHeatCapacityBandsKJm2K?.[weightClass] ||
      materialSpec.arealHeatCapacityBandsKJm2K?.medium || [6.0, 9.0];

    let confidenceMode = 'certified_discrete_band';
    let exactHeatCapacityJK = null;
    let exactArealHeatCapacityKJm2K = null;

    if (measuredMassGrams && measuredMassGrams > 50) {
      confidenceMode = 'measured_scale_exact';
      const effectiveBodyMassKg = (measuredMassGrams / 1000) * (1 - handleFraction);
      exactHeatCapacityJK = Math.round(effectiveBodyMassKg * materialSpec.specificHeatJKgK);
      if (flatBottomAreaM2 > 0) {
        exactArealHeatCapacityKJm2K = Number((exactHeatCapacityJK / 1000 / flatBottomAreaM2).toFixed(2));
      }
    }

    const lowerBoundKJm2K = exactArealHeatCapacityKJm2K ?? bandRangeKJm2K[0];
    const thermalInertiaBand =
      lowerBoundKJm2K >= 11.5 ? 'high' : lowerBoundKJm2K >= 6.5 ? 'medium' : 'low';

    return {
      toolId: arch?.id || options.toolId || null,
      toolName: arch?.name || materialSpec.label,
      materialId: materialSpec.id,
      materialLabel: materialSpec.label,
      geometryId: geometrySpec.id,
      geometryLabel: geometrySpec.label,
      diameterCm,
      flatBottomAreaCm2,
      weightClass,
      confidenceMode,
      measuredMassGrams: measuredMassGrams || null,
      handleTareFractionApplied: measuredMassGrams ? handleFraction : null,
      exactHeatCapacityJK,
      arealHeatCapacityRangeKJm2K: exactArealHeatCapacityKJm2K
        ? [exactArealHeatCapacityKJm2K, exactArealHeatCapacityKJm2K]
        : bandRangeKJm2K,
      thermalDiffusivityMm2S: materialSpec.thermalDiffusivityMm2S,
      thermalEffusivityJm2Ks05: materialSpec.thermalEffusivityJm2Ks05,
      thermalInertiaBand,
      evaporationFactor: geometrySpec.evaporationFactor,
      maxSafeTempC: materialSpec.maxSafeTempC,
      criticalFailureTempC: materialSpec.criticalFailureTempC,
      inductionCompatible: materialSpec.inductionCompatible,
      inductionBoostAllowed: materialSpec.inductionBoostAllowed,
      fondCapable: materialSpec.fondCapable,
      acidReactive: materialSpec.acidReactive,
      buyItForLife: materialSpec.buyItForLife,
      lifespanCyclesRange: materialSpec.lifespanCyclesRange,
      p0SafetyRule: materialSpec.p0SafetyRule
    };
  }

  /**
   * Computes optimal pan batching (`1 vs 2+ turni`) so cold food neither crowds out steam escape
   * nor drags the pan interface below the 140°C Maillard threshold.
   */
  computeBatchingAndThermalDrop(options = {}) {
    const profile = this.getCookwarePhysicsProfile(options);
    const foodMassGrams = Math.max(10, Number(options.foodMassGrams) || 200);
    const foodInitialTempC = Number.isFinite(Number(options.foodInitialTempC))
      ? Number(options.foodInitialTempC)
      : 4;
    const technique = String(options.technique || 'sear_maillard').toLowerCase();

    if (technique === 'boil_pasta' || technique === 'cold_assembly' || profile.flatBottomAreaCm2 <= 0) {
      return {
        profile,
        foodMassGrams,
        recommendedBatches: 1,
        maxGramsPerBatch: foodMassGrams,
        crowdingRisk: false,
        willDropBelowMaillardThreshold: false,
        evaporationRateFactor: profile.evaporationFactor,
        guidance: 'Nessun limite di rosolatura per contatto secco su questa tecnica.'
      };
    }

    // 1. Geometric Steam-Escape Constraint: max ~0.62 g/cm² of flat bottom to leave ~35% open metal for H2O vapor escape
    const maxGeometricGrams = Math.max(90, Math.round(profile.flatBottomAreaCm2 * 0.62));

    // 2. Thermophysical Energy Constraint above 140°C Maillard floor:
    // Pan thermal energy stored between initial preheat T_init and 142°C floor:
    // Using exact C_pan (if weighed) or conservative lower bound of certified areal band * flat area.
    const preheatTempC = Math.min(profile.maxSafeTempC, Number(options.targetSearTempC) || 185);
    const panAreaM2 = profile.flatBottomAreaCm2 / 10000;
    const conservativePanCapacityJK =
      profile.exactHeatCapacityJK ?? Math.round(profile.arealHeatCapacityRangeKJm2K[0] * 1000 * panAreaM2);

    // Effective surface layer of food coupled during the first 45s (~28% of total mass at cp_food ~ 3.55 J/gK + surface moisture latent heat)
    const availablePanJoulesAbove140 = Math.max(
      4000,
      conservativePanCapacityJK * Math.max(18, preheatTempC - 138) + 8500 // includes active burner input in first 25s
    );
    const joulesDemandedPerGramFood = 0.28 * 3.55 * (140 - foodInitialTempC) + 38;
    const maxThermalGrams = Math.max(80, Math.round(availablePanJoulesAbove140 / joulesDemandedPerGramFood));

    // Apply calibration factor if user previously logged `pale_boiled`
    const cal = this.getCalibrationProfile({
      heatSource: options.heatSource || 'gas',
      toolId: profile.toolId || profile.materialId
    });
    const batchCalibrationFactor = cal.batchReductionFactor || 1.0;

    const rawMaxPerBatch = Math.min(maxGeometricGrams, maxThermalGrams);
    const maxGramsPerBatch = Math.max(80, Math.round(rawMaxPerBatch * batchCalibrationFactor));
    const recommendedBatches = Math.max(1, Math.ceil(foodMassGrams / maxGramsPerBatch));
    const crowdingRisk = foodMassGrams > maxGeometricGrams;
    const willDropBelowMaillardThreshold = foodMassGrams > maxThermalGrams;

    const limitingReason =
      crowdingRisk && willDropBelowMaillardThreshold
        ? 'sia per spazio fisico anti-vapore sia per inerzia termica del fondo'
        : crowdingRisk
          ? 'per lasciare il 35% di fondo libero alla fuga del vapore (2.260 J/g)'
          : 'per non far crollare la temperatura del metallo sotto i 140°C (soglia di Maillard)';

    return {
      profile,
      foodMassGrams,
      foodInitialTempC,
      preheatTempC,
      conservativePanCapacityJK,
      maxGeometricGrams,
      maxThermalGrams,
      maxGramsPerBatch,
      recommendedBatches,
      crowdingRisk,
      willDropBelowMaillardThreshold,
      evaporationRateFactor: profile.evaporationFactor,
      guidance:
        recommendedBatches === 1
          ? `1 turno unico (${foodMassGrams}g <= limite sicuro ${maxGramsPerBatch}g per ${profile.toolName}).`
          : `Dividi in ${recommendedBatches} turni da ~${Math.ceil(foodMassGrams / recommendedBatches)}g (${limitingReason}; ri-scalda 45s tra i turni).`
    };
  }

  /**
   * Translates stove settings while enforcing non-bypassable P0 material/chemical safety rules
   * and exposing the 2 Multi-Soul Regimes (`weekday_health_fast` vs `maestro_gastronomic`).
   */
  translateStovePowerAndValidateP0(options = {}) {
    const heatSource = String(options.heatSource || 'gas').toLowerCase();
    const requestedLevel = String(options.requestedLevel || 'medium').toLowerCase();
    const isDryPreheat = Boolean(options.isDryPreheat);
    const hasAcidicIngredients = Boolean(options.hasAcidicIngredients);
    const acidDurationMinutes = Number(options.acidDurationMinutes) || 0;
    const coldWaterSaltingAttempt = Boolean(options.coldWaterSaltingAttempt);

    const profile = this.getCookwarePhysicsProfile(options);
    const cal = this.getCalibrationProfile({
      heatSource,
      toolId: profile.toolId || profile.materialId
    });

    const p0Blocks = [];
    const warnings = [];
    let baseIdx = LEVEL_TO_BASE_INDEX[requestedLevel] ?? 3;
    let adjustedIdx = Math.max(0, Math.min(5, baseIdx + (baseIdx > 0 ? cal.powerStepDelta : 0)));

    // 1. P0: Non-ferromagnetic cookware on Induction
    if (heatSource === 'induction' && !profile.inductionCompatible) {
      p0Blocks.push({
        code: 'P0-INDUCTION-NON-FERROMAGNETIC',
        severity: 'P0-BLOCK',
        message: `${profile.toolName} (${profile.materialLabel}) è priva di suscettività ferromagnetica: non innesca correnti di Foucault sull'induzione.`,
        safeAction: 'Sostituisci con Casseruola/Padella Inox Tri-Ply, Ghisa o Ferro Blu.'
      });
    }

    // 2. P0: PTFE on Boost / High heat / Dry preheat (>200°C)
    if (
      profile.materialId === 'aluminum_ptfe' &&
      (requestedLevel === 'boost' ||
        (heatSource === 'induction' && (requestedLevel === 'high' || adjustedIdx >= 4)) ||
        isDryPreheat)
    ) {
      p0Blocks.push({
        code: 'P0-PTFE-NO-BOOST',
        severity: 'P0-BLOCK',
        message:
          'BLOCCO P0 PTFE: Vietato usare Boost/Livello 8–9 su induzione o preriscaldare a vuoto una padella antiaderente PTFE (supera 260°C in <40s degradando il polimero!).',
        safeAction:
          'Potenza limitata automaticamente a Livello 6/9 (<=190–200°C) con 1 cucchiaino d\'Olio EVO messo fin da freddo come spia termica.'
      });
      adjustedIdx = Math.min(adjustedIdx, 3);
    }

    // 3. P0: Tinned Copper (`testo_rame_stagnato`) dry preheat / >215°C (Tin melts at 231.9°C!)
    if (
      profile.materialId === 'copper_tinned' &&
      (isDryPreheat || requestedLevel === 'boost' || Number(options.targetTempC) > 215)
    ) {
      p0Blocks.push({
        code: 'P0-TIN-NO-DRY-PREHEAT',
        severity: 'P0-BLOCK',
        message:
          'BLOCCO P0 RAME STAGNATO: Lo stagno alimentare (Sn) fonde a 231,9°C! Vietato preriscaldare a vuoto su fiamma o in forno il testo/tegame stagnato.',
        safeAction:
          'Inserisci sempre olio/pastella/umido a recipiente freddo prima di accendere o infornare a <=215°C.'
      });
      adjustedIdx = Math.min(adjustedIdx, 3);
    }

    // 4. P0: Raw Unlined Copper (`pentola_rame_non_induzione`) + Acidic foods (Cu2+ toxicity)
    if (profile.materialId === 'copper_unlined' && hasAcidicIngredients) {
      p0Blocks.push({
        code: 'P0-RAW-COPPER-ACID-TOXICITY',
        severity: 'P0-BLOCK',
        message:
          'BLOCCO P0 RAME NUDO: Vietato cuocere ingredienti acidi (pomodoro, limone, vino, aceto) in rame non rivestito per solubilizzazione tossica di ioni Cu2+.',
        safeAction: 'Usa immediatamente Acciaio Inox 18/10 o Gres/Terracotta smaltata.'
      });
    }

    // 5. P0/P1: Seasoned Cast Iron / Carbon Steel + Long Acid OR Dry Induction Boost
    if (profile.materialId === 'cast_iron_seasoned' || profile.materialId === 'carbon_steel_seasoned') {
      const maxAcidMin = profile.materialId === 'carbon_steel_seasoned' ? 8 : 10;
      if (hasAcidicIngredients && acidDurationMinutes > maxAcidMin) {
        p0Blocks.push({
          code: 'P0-SEASONING-ACID-STRIP',
          severity: 'P0-MATERIAL-DAMAGE',
          message: `ALERT CHIMICO SUPERFICIE: ${acidDurationMinutes} min di riduzione acida su ${profile.materialLabel} idrolizzano il polimero di stagionatura e cedono sapore ferroso (Fe2+).`,
          safeAction: 'Trasferisci la fase acida su Acciaio Inox 18/10 o limita la sfumata acida a <60 secondi finali.'
        });
      }
      if (heatSource === 'induction' && (requestedLevel === 'boost' || (isDryPreheat && adjustedIdx >= 4))) {
        p0Blocks.push({
          code: 'P0-FERRO-NO-DRY-BOOST',
          severity: 'P0-BLOCK',
          message:
            'BLOCCO P0 GRADIENTE TERMICO: Mai dare Boost a freddo su Ghisa o Ferro Blu (bassa diffusività ~14 mm²/s -> imbarcamento permanente del fondo o cricca!).',
          safeAction: 'Preriscaldamento progressivo imposto: 90s a Livello 4/9, poi sali a Livello 7/9.'
        });
        adjustedIdx = Math.min(adjustedIdx, 4);
      }
    }

    // 6. P0: Cold water salting on 18/10 Stainless Steel (Cl- pitting)
    if (profile.materialId === 'stainless_triply_18_10' && coldWaterSaltingAttempt) {
      p0Blocks.push({
        code: 'P0-INOX-COLD-SALT-PITTING',
        severity: 'P0-BLOCK',
        message:
          'BLOCCO P0 VAIOLATURA INOX: Non versare il sale nell\'acqua fredda! I cristalli sul fondo concentrano ioni Cl- che bucano il film passivo di Cr2O3.',
        safeAction: 'Porta prima l\'acqua a ebollizione viva (100°C) e aggiungi il sale solo allora.'
      });
    }

    // Terracotta direct flame warning
    if (profile.materialId === 'terracotta_glazed' && heatSource === 'gas' && adjustedIdx >= 4) {
      warnings.push(
        'Terracotta su gas: obbligatoria retina spargifiamma e salita termica dolce (diffusività 0.62 mm²/s).'
      );
      adjustedIdx = Math.min(adjustedIdx, 3);
    }

    const stepTable =
      heatSource === 'induction'
        ? INDUCTION_STEPS
        : heatSource === 'electric_radiant'
          ? RADIANT_STEPS
          : heatSource === 'boat_no_stove'
            ? [
                'Cambusa Barca a freddo (4–8°C in borsa termica)',
                'Cambusa Barca (fornelletto basculante al minimo solo in rada calma)',
                'Cambusa Barca (fiamma dolce protetta dal vento)',
                'Cambusa Barca (cottura one-pot coperta)',
                'Cambusa Barca (scottatura rapida one-pot)',
                'Cambusa Barca (ebollizione coperta in poca acqua)'
              ]
            : GAS_STEPS;

    const translatedInstruction = stepTable[adjustedIdx] || stepTable[3];

    // Multi-Soul Trade-off Regimes (bridges to `nutrizione`, `casa`, `economia`)
    const regimes = {
      weekday_health_fast: {
        id: 'weekday_health_fast',
        label: 'Modalità Feriale · Salute & Reset 45s',
        targetTempC: Math.min(165, profile.maxSafeTempC),
        conductiveFatGrams: profile.materialId === 'aluminum_ptfe' ? 4 : 8,
        soilGeneratedForCasa: {
          materialId: profile.materialId,
          peakTempC: Math.min(165, profile.maxSafeTempC),
          soilClass: 'light_unpolymerized_lipids_and_proteins',
          polymerizedLipids: false,
          estimatedResetSeconds: 45
        }
      },
      maestro_gastronomic: {
        id: 'maestro_gastronomic',
        label: 'Modalità Maestro · Maillard & Deglassatura Ristorante',
        supportedByPan: profile.fondCapable && profile.maxSafeTempC >= 215,
        targetTempC: profile.fondCapable ? Math.min(195, profile.maxSafeTempC) : profile.maxSafeTempC,
        conductiveFatGrams: profile.fondCapable ? 12 : 5,
        soilGeneratedForCasa: {
          materialId: profile.materialId,
          peakTempC: profile.fondCapable ? 195 : profile.maxSafeTempC,
          soilClass: profile.fondCapable ? 'maillard_fond_and_heated_lipids' : 'light_unpolymerized_lipids',
          polymerizedLipids: profile.fondCapable,
          estimatedResetSeconds: profile.fondCapable ? 180 : 60
        }
      }
    };

    return {
      heatSource,
      requestedLevel,
      effectiveStepIndex: adjustedIdx,
      stoveInstruction: translatedInstruction,
      isBlockedP0: p0Blocks.length > 0,
      p0Blocks,
      warnings,
      calibrationApplied: cal,
      multiSoulRegimes: regimes
    };
  }

  _calKey(heatSource, toolId) {
    return `${String(heatSource || 'gas').toLowerCase()}::${String(toolId || 'default').toLowerCase()}`;
  }

  getCalibrationProfile({ heatSource = 'gas', toolId = 'default' } = {}) {
    const state = this._loadState();
    const key = this._calKey(heatSource, toolId);
    const existing = state.calibrations[key];
    return (
      existing || {
        key,
        heatSource,
        toolId,
        powerStepDelta: 0,
        timeMultiplier: 1.0,
        batchReductionFactor: 1.0,
        enforceLeidenfrostCue: false,
        sessionsCount: 0,
        lastVisualOutcome: null
      }
    );
  }

  /**
   * Closed-loop 1-Tap calibration from the Lab Notebook (`perfect | overcooked_dry | pale_boiled | stuck_or_broken`)
   * plus optional 1-time kitchen scale pan weighing (`measuredPanMassGrams`).
   */
  recordOneTapCalibration(payload = {}) {
    const state = this._loadState();
    const heatSource = String(payload.heatSource || 'gas').toLowerCase();
    const toolId = String(payload.toolId || 'padella_antiaderente');
    const outcome = VALID_VISUAL_OUTCOMES.includes(payload.visualOutcome)
      ? payload.visualOutcome
      : 'perfect';

    if (payload.measuredPanMassGrams && Number(payload.measuredPanMassGrams) > 50) {
      state.measuredPanMassesGrams[toolId] = Math.round(Number(payload.measuredPanMassGrams));
    }

    const key = this._calKey(heatSource, toolId);
    const cur = this.getCalibrationProfile({ heatSource, toolId });
    const { materialSpec } = this.resolveToolAndMaterial({ toolId });

    let nextPowerDelta = cur.powerStepDelta;
    let nextTimeMult = cur.timeMultiplier;
    let nextBatchFactor = cur.batchReductionFactor;
    let enforceLeidenfrostCue = cur.enforceLeidenfrostCue;

    if (outcome === 'overcooked_dry') {
      nextPowerDelta = Math.max(-2, cur.powerStepDelta - 1);
      nextTimeMult = Number(Math.max(0.75, cur.timeMultiplier * 0.88).toFixed(2));
    } else if (outcome === 'pale_boiled') {
      // Never push PTFE above its P0 cap! Instead shrink batch size so pan keeps heat.
      if (materialSpec.id !== 'aluminum_ptfe') {
        nextPowerDelta = Math.min(2, cur.powerStepDelta + 1);
      }
      nextBatchFactor = Number(Math.max(0.6, cur.batchReductionFactor * 0.82).toFixed(2));
    } else if (outcome === 'stuck_or_broken') {
      enforceLeidenfrostCue = true;
      if (materialSpec.id === 'aluminum_ptfe') {
        nextPowerDelta = Math.min(0, cur.powerStepDelta);
      }
    }

    const updated = {
      key,
      heatSource,
      toolId,
      powerStepDelta: nextPowerDelta,
      timeMultiplier: nextTimeMult,
      batchReductionFactor: nextBatchFactor,
      enforceLeidenfrostCue,
      sessionsCount: (cur.sessionsCount || 0) + 1,
      lastVisualOutcome: outcome,
      updatedAt: new Date().toISOString()
    };

    state.calibrations[key] = updated;
    state.history.unshift({
      ...updated,
      dishId: payload.dishId || null,
      measuredPanMassGrams: state.measuredPanMassesGrams[toolId] || null
    });
    if (state.history.length > 50) state.history = state.history.slice(0, 50);

    this._saveState();
    return {
      calibration: updated,
      measuredPanMassGrams: state.measuredPanMassesGrams[toolId] || null
    };
  }

  adviseKnifeAndBoard({ knifeId = 'western_stainless_56_58hrc', boardId = 'end_grain_wood', task = '' } = {}) {
    const knives = this.getMaterialsCatalog().knivesMetallurgy;
    const knife = knives[knifeId] || knives.western_stainless_56_58hrc;
    const board = knives.cuttingBoards[boardId] || knives.cuttingBoards.end_grain_wood;
    const taskNorm = String(task || '').toLowerCase();

    const alerts = [];
    if (board.id === 'glass_marble_ceramic') {
      alerts.push(
        'BLOCCO P1 FILO LAMA: Vietato tagliare su vetro, marmo o piatti in ceramica! Durezza superiore a 63 HRC: piega o scheggia il bisello ai primi tagli.'
      );
    }
    if (
      knife.id === 'japanese_hard_60_63hrc' &&
      /\b(ossa|lisch\w*|surgelat\w*|zucca\s+dura|acciaino\s+rigato)\b/.test(taskNorm)
    ) {
      alerts.push(
        'RISCHIO CHIPPING (60–63 HRC): Non usare lame giapponesi dure su ossa, surgelati o con acciaino metallico rigato; passa al trinciante europeo 56–58 HRC.'
      );
    }

    return {
      knife,
      board,
      isSafePairing: alerts.length === 0,
      alerts
    };
  }

  adviseStorageContainer({
    context = 'home_fridge',
    isHot = false,
    isFatty = false,
    isAcidicOrTomato = false
  } = {}) {
    const containers = this.getMaterialsCatalog().storageContainers;
    const isBoat = context === 'boat_cooler' || context === 'boat_no_stove';

    const recommended = isBoat
      ? containers.stainless_aisi_316_marine
      : containers.borosilicate_glass;

    const pp5Warnings = [];
    if (isHot && isFatty) {
      pp5Warnings.push(
        'Evita contenitori in plastica PP #5 con cibi caldi e grassi (>70°C): rischio di migrazione oligomerica nel lipide (usa Vetro Borosilicato o fai raffreddare prima).'
      );
    }
    if (isAcidicOrTomato) {
      pp5Warnings.push(
        'Il Polipropilene (PP #5) è lipofilo e assorbe permanentemente il licopene rosso dei sughi e i composti solforati.'
      );
    }

    return {
      context,
      recommendedContainer: recommended,
      alternatives: Object.values(containers),
      pp5Warnings
    };
  }
}

export const cookwarePhysicsEngine = new CookwarePhysicsEngine();
export default cookwarePhysicsEngine;
