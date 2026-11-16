/**
 * Basilico 2.0 — Household Production Economics, Shadow Price of Time, TCO & Personal Inflation Engine
 * Location: server/services/householdEconomicsService.js (ADR-0015 / TASK-V2-04)
 *
 * Implements Anima 5 ("Scienziato di Economia Domestica & Ricerca Operativa") with 100% deterministic
 * math and strict adherence to ADR-0006 (zero synthetic prices, weights, or fabricated indices):
 *  1. Zero-friction Rhythm Presets (`sera_stanca`, `feriale`, `weekend_relax`) + Optional Advanced Overrides
 *  2. Generalized Full Meal Cost `C_full` (edible BOM + thermo-economic kWh/Smc + active/reset time * w_t - VaR saved)
 *     & Batch Cooking Thermal/Time Scale Economies
 *  3. Empirical Rapallo 1/2/3 Store Net Hourly Yield (`€/h` esentasse vs user's `w_t`, including `parkingEase`)
 *  4. Cookware CapEx vs OpEx Total Cost of Ownership (`CPU` / `10y TCO` ranges: Buy-It-For-Life vs PTFE abuse)
 *  5. Personal Laspeyres Inflation Index ("Il Tuo ISTAT a Rapallo") & Shrinkflation Watchdog on real receipts/history
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractPackMetrics } from './unitPriceExtractor.js';
import { normalizeSearchToken } from './offerService.js';
import { buildProductKey, priceHistoryService } from './priceHistoryService.js';
import { receiptService } from './receiptService.js';
import { shoppingListService } from './shoppingListService.js';
import { kitchenInventoryService } from './kitchenInventoryService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const STORES_SEED_PATH = path.resolve(__dirname, '../../data/seed/rapallo_stores.json');
const DEFAULT_ECONOMICS_CONFIG_PATH = path.resolve(
  __dirname,
  '../../data/cache/household_economics_config.json'
);

// Physical Lower Heating Value (PCI) of Italian grid natural gas (ARERA standard: ~9.94 kWh_th / Smc)
export const METHANE_KWH_PER_SMC = 9.94;

// Transparent ARERA domestic reference benchmarks (overridable in Advanced Calibration)
export const DEFAULT_ENERGY_BENCHMARKS = {
  electricityEurPerKwh: 0.28,
  gasEurPerSmc: 1.15,
  sourceLabel: 'Benchmark domestico ARERA (personalizzabile con la tua bolletta reale)'
};

export const RHYTHM_PRESETS = {
  sera_stanca: {
    id: 'sera_stanca',
    label: '⚡ Sera Stanca / Zero Attrito',
    shortLabel: 'Sera Stanca',
    hourlyValueEuro: 30,
    maxActiveMinutes: 15,
    passiveTimeWeight: 0.05,
    cleaningFrictionMultiplier: 1.35,
    batchCookingEnabled: false,
    description:
      ' Energia mentale bassa (es. Martedì 20:30): il tuo tempo libero attivo vale 30 €/h, massimo 15 min ai fornelli e 1 sola pentola a lavaggio rapido.'
  },
  feriale: {
    id: 'feriale',
    label: '🧭 Routine Feriale Equilibrata',
    shortLabel: 'Feriale',
    hourlyValueEuro: 18,
    maxActiveMinutes: 30,
    passiveTimeWeight: 0.08,
    cleaningFrictionMultiplier: 1.0,
    batchCookingEnabled: false,
    description:
      'Giornata lavorativa normale: costo opportunità del tempo a 18 €/h, equilibrio tra cucina espressa salutare, pulizia contenuta e spesa rapida.'
  },
  weekend_relax: {
    id: 'weekend_relax',
    label: '🎓 Weekend Relax / Studio & Batch',
    shortLabel: 'Weekend & Lab',
    hourlyValueEuro: 8,
    maxActiveMinutes: 90,
    passiveTimeWeight: 0.05,
    cleaningFrictionMultiplier: 0.85,
    batchCookingEnabled: true,
    description:
      'Piacere di cucinare, studiare tecniche d\'autore e fare Batch Cooking (economie di scala su forno, legumi e giro botteghe a Rapallo, w_t = 8 €/h).'
  }
};

export const VALID_TRANSPORT_MODES = ['car', 'scooter', 'foot'];

// Engineering stove & oven thermal profiles (EN 60350 reference efficiencies, never synthetic)
const STOVE_EFFICIENCY_MAP = {
  induction: { efficiency: 0.86, energyCarrier: 'electricity', powerKwByRegime: { low: 0.45, gentle: 0.65, medium: 1.1, high: 1.65 } },
  electric_radiant: { efficiency: 0.65, energyCarrier: 'electricity', powerKwByRegime: { low: 0.55, gentle: 0.8, medium: 1.35, high: 1.9 } },
  gas: { efficiency: 0.46, energyCarrier: 'gas', powerKwByRegime: { low: 0.85, gentle: 1.15, medium: 1.85, high: 2.7 } },
  boat_no_stove: { efficiency: 1.0, energyCarrier: 'none', powerKwByRegime: { low: 0, gentle: 0, medium: 0, high: 0 } }
};

// Material lifecycle bands `[minCycles, maxCycles]` from cookware materials literature (ADR-0006 range honesty)
const MATERIAL_LIFECYCLE_BANDS = {
  acciaio_inox_18_10: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2500, 5000],
    abuseCyclesRange: [1500, 3000],
    residualValueRatio: 0.2,
    annualMaintenanceEuro: 0,
    degradationVector: 'Quasi indistruttibile; teme solo corrosione per pitting da ipoclorito (candeggina) o sale versato a freddo sul fondo non bollente.',
    buyingVerdict:
      'Investi in CapEx Buy-It-For-Life (triplo fondo/multistrato): costo per utilizzo ~€0,01, dura 25+ anni e sblocca Maillard + deglassatura acida.'
  },
  ghisa_stagionata: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [1200, 2500],
    residualValueRatio: 0.25,
    annualMaintenanceEuro: 0.5,
    degradationVector: 'Eterna se asciugata a caldo con velo lipidico; lavastoviglie alcalina e bollitura acida lunga rimuovono la polimerizzazione protettiva (ripristinabile).',
    buyingVerdict:
      'Investi una sola volta nella vita: inerzia termica insuperabile per cauterizzazione >220°C a costo per uso tendente a zero.'
  },
  marmo_naturale: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [800, 1800],
    residualValueRatio: 0.3,
    annualMaintenanceEuro: 0,
    degradationVector: 'Carbonato di calcio (CaCO3) poroso: eterno con sola acqua calda, ma corroso irreversibilmente da acidi (aceto, citrico, limone) e inquinato da tensioattivi profumati.',
    buyingVerdict:
      'Bene patrimoniale ligure: zero usura meccanica, evita l\'ossidazione termica del basilico.'
  },
  acciaio_inossidabile_martensitico: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2000, 4500],
    abuseCyclesRange: [400, 900],
    residualValueRatio: 0.15,
    annualMaintenanceEuro: 2.0,
    degradationVector: 'Il filo degrada rapidamente su taglieri in vetro/ceramica/marmo o in lavastoviglie (urti + chimica alcalina + 65°C).',
    buyingVerdict:
      '1 solo coltello trinciante forgiato 20 cm + tagliere in legno/PE batte ceppi economici da 8 lame stampate.'
  },
  rame_puro: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2000, 4000],
    abuseCyclesRange: [150, 400],
    residualValueRatio: 0.35,
    annualMaintenanceEuro: 3.5,
    degradationVector: 'Se stagnato internamente, lo stagno fonde a 231,9°C se preriscaldato a secco! Richiede ristagnatura periodica decennale.',
    buyingVerdict:
      'Specialistico per gas e riduzioni: altissima conducibilità, ma inutile su induzione senza piastra ferritica.'
  },
  rame_stagnato: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2000, 4000],
    abuseCyclesRange: [150, 400],
    residualValueRatio: 0.35,
    annualMaintenanceEuro: 3.5,
    degradationVector: 'Punto di fusione dello stagno 231,9°C: vietato preriscaldare a vuoto.',
    buyingVerdict: 'Strumento d\'arte longevo su fiamma dolce/media controllata.'
  },
  rame_stagnato_gres: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [1200, 2800],
    abuseCyclesRange: [300, 700],
    residualValueRatio: 0.1,
    annualMaintenanceEuro: 0,
    degradationVector: 'Il gres/terracotta teme lo shock termico ΔT improvviso (es. acqua fredda su pirofila a 220°C).',
    buyingVerdict: 'Ottimo rapporto CapEx/durata per forno statico/ventilato (farinata, pesce alla ligure, torte verdi).'
  },
  terracotta: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [1000, 2500],
    abuseCyclesRange: [200, 500],
    residualValueRatio: 0.05,
    annualMaintenanceEuro: 0,
    degradationVector: 'Isolante refrattario poroso: teme shock termici su fiamma nuda senza spargifiamma e detersivi profumati assorbiti nei pori.',
    buyingVerdict: 'Ideale per legumi e cotture umide sub-ebollizione; costo d\'acquisto contenuto.'
  },
  terracotta_glazed: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [1000, 2500],
    abuseCyclesRange: [200, 500],
    residualValueRatio: 0.05,
    annualMaintenanceEuro: 0,
    degradationVector: 'Bassa diffusività termica (0,62 mm²/s): eccellente per sobbolliture lente, ma teme shock termici ΔT bruschi.',
    buyingVerdict: 'Specialistico economico per zuppe liguri, legumi e umidi.'
  },
  carbon_steel_seasoned: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [1000, 2200],
    residualValueRatio: 0.2,
    annualMaintenanceEuro: 0.5,
    degradationVector: 'Ferro blu stagionato: indistruttibile ad altissima temperatura (>250°C), teme ammolli in acqua e cotture acide prolungate che sciolgono la patina.',
    buyingVerdict: 'Alternativa eterna al PTFE per rosolature, uova (una volta stagionato) e pesce con pelle croccante.'
  },
  ferro_blu: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [1000, 2200],
    residualValueRatio: 0.2,
    annualMaintenanceEuro: 0.5,
    degradationVector: 'Acciaio al carbonio: teme umidità residua (ruggine) e acidi lunghi, ma la patina polimerizzata è sempre rigenerabile a costo zero.',
    buyingVerdict: 'Investimento Buy-It-For-Life ad altissimo ROI gastronomico (~€0,01/uso).'
  },
  copper_tinned: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2000, 4000],
    abuseCyclesRange: [120, 350],
    residualValueRatio: 0.35,
    annualMaintenanceEuro: 3.5,
    degradationVector: 'Stagno interno (fusione 231,9°C): vietato preriscaldare a secco o usare pagliette abrasive.',
    buyingVerdict: 'Strumento tradizionale ligure eterno (farinata/testo) se usato sempre carico e sotto 220°C.'
  },
  stainless_triply_18_10: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [2500, 5000],
    abuseCyclesRange: [1500, 3000],
    residualValueRatio: 0.2,
    annualMaintenanceEuro: 0,
    degradationVector: 'Triplo strato Inox/Al/Inox: indistruttibile salvo pitting da candeggina o sale a freddo.',
    buyingVerdict: 'Pilastro CapEx #1 della cucina scientifica (~€0,01/uso).'
  },
  cast_iron_seasoned: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [1200, 2500],
    residualValueRatio: 0.25,
    annualMaintenanceEuro: 0.5,
    degradationVector: 'Ghisa stagionata: eterna se asciugata sul fornello tiepido; lavastoviglie vietata.',
    buyingVerdict: 'CapEx eterno per grigliatura e cauterizzazione ad alta capacità termica.'
  },
  marble_carrara: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [3000, 6000],
    abuseCyclesRange: [800, 1800],
    residualValueRatio: 0.3,
    annualMaintenanceEuro: 0,
    degradationVector: 'Marmo CaCO3: vietati tutti gli acidi (pH < 6) e i detersivi profumati.',
    buyingVerdict: 'Bene ereditario ligure a costo per uso nullo.'
  },
  aluminum_ptfe: {
    capExClass: 'consumable_coated',
    properCyclesRange: [180, 350],
    abuseCyclesRange: [35, 70],
    residualValueRatio: 0,
    annualMaintenanceEuro: 0,
    degradationVector: 'Rivestimento fluoropolimerico PTFE: degrada sopra 200°C (Boost induzione vietato) e con alcali/abrasivi.',
    buyingVerdict: 'Bene OpEx a vita finita: compra fascia media spessa (€20–30) e proteggila sotto 190°C.'
  },
  elettronica_precisione: {
    capExClass: 'buy_it_for_life',
    properCyclesRange: [1500, 3500],
    abuseCyclesRange: [300, 800],
    residualValueRatio: 0.05,
    annualMaintenanceEuro: 1.5,
    degradationVector: 'Sonda termometrica NTC/termocoppia: non immergere il corpo elettronico in acqua e non esporre il cavo alla fiamma viva.',
    buyingVerdict: 'Il singolo acquisto da €15–25 col più alto ROI anti-spreco (elimina per sempre pesce/carne stracotti).'
  },
  alluminio_rivestito_ptfe: {
    capExClass: 'consumable_coated',
    properCyclesRange: [180, 350],
    abuseCyclesRange: [35, 70],
    residualValueRatio: 0,
    annualMaintenanceEuro: 0,
    degradationVector: 'Bene di consumo OpEx: il fluoropolimero PTFE degrada sopra 200-240°C (Boost induzione a vuoto lo brucia in <40s!), con utensili metallici o sgrassatori alcalini forti.',
    buyingVerdict:
      'NON spendere €120 in antiaderenti "griffati": compra un onesto alluminio forgiato spesso (€20–30) e usalo SOLO per uova/pesce delicato <180°C con spugna morbida e pH neutro.'
  }
};

export const COMMODITY_VS_BRAND_GUIDE = [
  {
    category: 'Detergenza Anticalcare & Brillantante',
    buyBaseOrPure: 'Acido Citrico Anidro Puro (E330, grado tecnico/alimentare 99,5%)',
    avoidBrandTax: 'Spray anticalcare liquidi pubblicizzati (<5% attivo + 95% acqua)',
    verifiedSavingRangePct: [80, 92],
    scientificWhy:
      'La neutralizzazione del carbonato di calcio dipende solo dalle moli di H+ e dal potere chelante del citrato: pagare €3,50 per 750ml d\'acqua profumata è pura tassa di marketing.'
  },
  {
    category: 'Smacchiatura Ossidativa & Igienizzazione Bucato Biancato',
    buyBaseOrPure: 'Percarbonato di Sodio Puro (uso estemporaneo a vaso aperto)',
    avoidBrandTax: 'Additivi smacchianti "Oxi" in barattolo con filler di solfato di sodio',
    verifiedSavingRangePct: [55, 75],
    scientificWhy:
      'A parità di ossigeno attivo rilasciato in lavatrice (>=40°C con TAED), la materia prima pura costa meno della metà per lavaggio.'
  },
  {
    category: 'Dispensa Monoingrediente (Sale, Zucchero, Legumi Secchi, Bicarbonato, Passata 100% IT)',
    buyBaseOrPure: 'Private Label GDO verificata (Coop / Basko / Eurospin) con identica origine e 0 additivi',
    avoidBrandTax: 'Brand iper-pubblicizzato con identica tabella CREA/etichetta',
    verifiedSavingRangePct: [30, 50],
    scientificWhy:
      'NaCl, saccarosio o ceci secchi calibro 9 non hanno "ricetta segreta": il differenziale di prezzo remunera lo spot TV, non i nutrienti.'
  },
  {
    category: 'Dove invece pagare il premio qualità HA ROI Reale',
    buyBaseOrPure: 'Olio EVO 100% Italiano estratto a freddo, Uova Cod. 0/1, Pescato Locale del Golfo, Casseruola Inox Tri-Ply',
    avoidBrandTax: 'Miscele oli UE/non-UE o padelle sottili deformabili da €8,90',
    verifiedSavingRangePct: null,
    scientificWhy:
      'Qui il prezzo riflette polifenoli/acido oleico non ossidato, profilo EPA/DHA reale e spessore conduttivo che dura 30 anni senza bruciare i cibi.'
  }
];

function throwBadRequest(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

function parseOptionalPositiveNumber(val, fieldName) {
  if (val === null || val === undefined || val === '') return null;
  const num = typeof val === 'string' ? Number(val.trim().replace(',', '.')) : Number(val);
  if (!Number.isFinite(num) || num <= 0) {
    throwBadRequest(`Valore non valido per ${fieldName}: inserire un numero > 0 oppure null`);
  }
  return Number(num.toFixed(3));
}

function resolveParkingPenaltyMinutes(parkingEase = 'medium', transportMode = 'car') {
  if (transportMode === 'foot' || transportMode === 'scooter') {
    return parkingEase === 'low' ? 1 : 0;
  }
  if (parkingEase === 'low') return 10; // Corso Mameli / Centro ZTL Rapallo in auto
  if (parkingEase === 'medium') return 5; // Via Sciesa / Corso Assereto
  return 2; // Parcheggio dedicato es. Basko Porto / Eurospin Via Aurelia
}

export class HouseholdEconomicsService {
  constructor(options = {}) {
    this.storagePath =
      options.storagePath || process.env.BASILICO_ECONOMICS_PATH || DEFAULT_ECONOMICS_CONFIG_PATH;
    this.receiptService = options.receiptService || receiptService;
    this.priceHistoryService = options.priceHistoryService || priceHistoryService;
    this.shoppingListService = options.shoppingListService || shoppingListService;
    this.kitchenInventoryService = options.kitchenInventoryService || kitchenInventoryService;
    this._stores = null;
    this._config = null;
  }

  getStores() {
    if (!this._stores) {
      this._stores = JSON.parse(fs.readFileSync(STORES_SEED_PATH, 'utf8'));
    }
    return this._stores;
  }

  _loadConfig() {
    if (this._config) return this._config;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && RHYTHM_PRESETS[parsed.activeRhythmPreset]) {
          this._config = {
            activeRhythmPreset: parsed.activeRhythmPreset,
            advancedOverrides: {
              hourlyValueEuro: parsed.advancedOverrides?.hourlyValueEuro ?? null,
              electricityEurPerKwh: parsed.advancedOverrides?.electricityEurPerKwh ?? null,
              gasEurPerSmc: parsed.advancedOverrides?.gasEurPerSmc ?? null,
              transportMode: VALID_TRANSPORT_MODES.includes(parsed.advancedOverrides?.transportMode)
                ? parsed.advancedOverrides.transportMode
                : 'car'
            },
            updatedAt: parsed.updatedAt || null
          };
          return this._config;
        }
      }
    } catch (_) {}

    this._config = {
      activeRhythmPreset: 'feriale',
      advancedOverrides: {
        hourlyValueEuro: null,
        electricityEurPerKwh: null,
        gasEurPerSmc: null,
        transportMode: 'car'
      },
      updatedAt: null
    };
    return this._config;
  }

  _saveConfig() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(this._config, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  getCalibration(transientPresetOverride = null) {
    const cfg = this._loadConfig();
    const presetKey =
      transientPresetOverride && RHYTHM_PRESETS[transientPresetOverride]
        ? transientPresetOverride
        : cfg.activeRhythmPreset;
    const preset = RHYTHM_PRESETS[presetKey] || RHYTHM_PRESETS.feriale;

    // If caller passed an explicit transient rhythm preset (e.g., quick 1-tap toggle on ⚡ Oggi),
    // use that preset's hourlyValueEuro unless the user explicitly pinned an override AND did not pass transientPresetOverride
    const effectiveHourlyValueEuro =
      !transientPresetOverride && cfg.advancedOverrides.hourlyValueEuro !== null
        ? cfg.advancedOverrides.hourlyValueEuro
        : preset.hourlyValueEuro;

    const effectiveElectricityEurPerKwh =
      cfg.advancedOverrides.electricityEurPerKwh ?? DEFAULT_ENERGY_BENCHMARKS.electricityEurPerKwh;
    const effectiveGasEurPerSmc =
      cfg.advancedOverrides.gasEurPerSmc ?? DEFAULT_ENERGY_BENCHMARKS.gasEurPerSmc;

    return {
      activeRhythmPreset: presetKey,
      preset,
      presetsCatalog: Object.values(RHYTHM_PRESETS),
      advancedOverrides: { ...cfg.advancedOverrides },
      effectiveParameters: {
        hourlyValueEuro: effectiveHourlyValueEuro,
        maxActiveMinutes: preset.maxActiveMinutes,
        passiveTimeWeight: preset.passiveTimeWeight,
        cleaningFrictionMultiplier: preset.cleaningFrictionMultiplier,
        batchCookingEnabled: preset.batchCookingEnabled,
        electricityEurPerKwh: effectiveElectricityEurPerKwh,
        gasEurPerSmc: effectiveGasEurPerSmc,
        transportMode: cfg.advancedOverrides.transportMode || 'car',
        energySourceNote:
          cfg.advancedOverrides.electricityEurPerKwh !== null || cfg.advancedOverrides.gasEurPerSmc !== null
            ? 'Tariffa bolletta personalizzata dall\'utente'
            : DEFAULT_ENERGY_BENCHMARKS.sourceLabel
      },
      updatedAt: cfg.updatedAt
    };
  }

  updateCalibration(payload = {}) {
    const cfg = this._loadConfig();

    if (payload.activeRhythmPreset !== undefined && payload.activeRhythmPreset !== null) {
      const key = String(payload.activeRhythmPreset).trim();
      if (!RHYTHM_PRESETS[key]) {
        throwBadRequest(
          `Preset ritmo non valido: "${key}". Valori ammessi: ${Object.keys(RHYTHM_PRESETS).join(', ')}`
        );
      }
      cfg.activeRhythmPreset = key;
    }

    const adv = payload.advancedOverrides && typeof payload.advancedOverrides === 'object'
      ? payload.advancedOverrides
      : payload;

    if ('hourlyValueEuro' in adv) {
      cfg.advancedOverrides.hourlyValueEuro = parseOptionalPositiveNumber(
        adv.hourlyValueEuro,
        'hourlyValueEuro'
      );
    }
    if ('electricityEurPerKwh' in adv) {
      cfg.advancedOverrides.electricityEurPerKwh = parseOptionalPositiveNumber(
        adv.electricityEurPerKwh,
        'electricityEurPerKwh'
      );
    }
    if ('gasEurPerSmc' in adv) {
      cfg.advancedOverrides.gasEurPerSmc = parseOptionalPositiveNumber(adv.gasEurPerSmc, 'gasEurPerSmc');
    }
    if ('transportMode' in adv && adv.transportMode !== null && adv.transportMode !== undefined) {
      const tm = String(adv.transportMode).trim();
      if (!VALID_TRANSPORT_MODES.includes(tm)) {
        throwBadRequest(`Mezzo di trasporto non valido: "${tm}". Valori ammessi: ${VALID_TRANSPORT_MODES.join(', ')}`);
      }
      cfg.advancedOverrides.transportMode = tm;
    }

    if (payload.resetAdvancedOverrides === true) {
      cfg.advancedOverrides = {
        hourlyValueEuro: null,
        electricityEurPerKwh: null,
        gasEurPerSmc: null,
        transportMode: 'car'
      };
    }

    cfg.updatedAt = new Date().toISOString();
    this._saveConfig();
    return this.getCalibration();
  }

  /**
   * Computes physical cooking energy consumption & cost across stove/oven/pressure-cooker/boat
   * and evaluates Batch Cooking thermal scale economies across `batchServings` (>= 1).
   */
  computeCookingEnergyCost(params = {}) {
    const cal = this.getCalibration(params.rhythmPreset || null).effectiveParameters;
    const heatSource = STOVE_EFFICIENCY_MAP[params.heatSource] ? params.heatSource : 'gas';
    const cookMethod = String(params.cookingMethod || 'stovetop_medium').toLowerCase();
    const cookMinutes = Math.max(0, Number(params.cookMinutes ?? 12) || 0);
    const batchServings = Math.max(1, Math.round(Number(params.batchServings) || 1));
    const elecRate = Number(params.electricityEurPerKwh ?? cal.electricityEurPerKwh);
    const gasRate = Number(params.gasEurPerSmc ?? cal.gasEurPerSmc);

    if (heatSource === 'boat_no_stove' || cookMethod === 'cold_no_cook' || cookMinutes === 0) {
      return {
        heatSource,
        cookingMethod: cookMethod,
        batchServings,
        totalBatchKwh: 0,
        totalBatchSmc: 0,
        totalBatchEnergyCostEur: 0,
        energyCostPerServingEur: 0,
        singleServingBaselineEur: 0,
        batchThermalSavingPerServingEur: 0
      };
    }

    // Electric oven includes fixed chamber preheat ramp (~0.42 kWh to reach 200°C) + steady losses (~0.85 kW)
    if (cookMethod === 'oven_bake') {
      const preheatKwh = 0.42;
      const steadyKwh = 0.85 * (cookMinutes / 60) * (1 + Math.max(0, batchServings - 1) * 0.08);
      const totalBatchKwh = Number((preheatKwh + steadyKwh).toFixed(3));
      const singleKwh = Number((preheatKwh + 0.85 * (cookMinutes / 60)).toFixed(3));
      const totalBatchEnergyCostEur = Number((totalBatchKwh * elecRate).toFixed(3));
      const singleServingBaselineEur = Number((singleKwh * elecRate).toFixed(3));
      const energyCostPerServingEur = Number((totalBatchEnergyCostEur / batchServings).toFixed(3));
      return {
        heatSource: 'electric_oven',
        cookingMethod: cookMethod,
        batchServings,
        totalBatchKwh,
        totalBatchSmc: 0,
        totalBatchEnergyCostEur,
        energyCostPerServingEur,
        singleServingBaselineEur,
        batchThermalSavingPerServingEur: Number(
          Math.max(0, singleServingBaselineEur - energyCostPerServingEur).toFixed(3)
        )
      };
    }

    const profile = STOVE_EFFICIENCY_MAP[heatSource];
    const isPressure = cookMethod === 'pressure_cooker';
    const effectiveMinutes = isPressure ? cookMinutes * 0.55 : cookMinutes;
    const regimeKey = cookMethod.includes('high')
      ? 'high'
      : cookMethod.includes('gentle') || cookMethod.includes('steam') || isPressure
        ? 'gentle'
        : 'medium';

    const basePowerKw = profile.powerKwByRegime[regimeKey] || profile.powerKwByRegime.medium;
    // Cooking N portions in 1 pot increases required thermal input only sub-linearly (+15% per extra portion, fixed water/pan ramp shared!)
    const batchScaleFactor = 1 + Math.max(0, batchServings - 1) * 0.15;
    const singleEnergyKwhInput = basePowerKw * (effectiveMinutes / 60);
    const batchEnergyKwhInput = singleEnergyKwhInput * batchScaleFactor;

    if (profile.energyCarrier === 'gas') {
      const singleSmc = singleEnergyKwhInput / METHANE_KWH_PER_SMC;
      const totalBatchSmc = Number((batchEnergyKwhInput / METHANE_KWH_PER_SMC).toFixed(4));
      const singleServingBaselineEur = Number((singleSmc * gasRate).toFixed(3));
      const totalBatchEnergyCostEur = Number((totalBatchSmc * gasRate).toFixed(3));
      const energyCostPerServingEur = Number((totalBatchEnergyCostEur / batchServings).toFixed(3));
      return {
        heatSource,
        cookingMethod: cookMethod,
        thermalEfficiency: profile.efficiency,
        batchServings,
        totalBatchKwh: 0,
        totalBatchSmc,
        totalBatchEnergyCostEur,
        energyCostPerServingEur,
        singleServingBaselineEur,
        batchThermalSavingPerServingEur: Number(
          Math.max(0, singleServingBaselineEur - energyCostPerServingEur).toFixed(3)
        )
      };
    }

    const totalBatchKwh = Number(batchEnergyKwhInput.toFixed(3));
    const singleServingBaselineEur = Number((singleEnergyKwhInput * elecRate).toFixed(3));
    const totalBatchEnergyCostEur = Number((totalBatchKwh * elecRate).toFixed(3));
    const energyCostPerServingEur = Number((totalBatchEnergyCostEur / batchServings).toFixed(3));

    return {
      heatSource,
      cookingMethod: cookMethod,
      thermalEfficiency: profile.efficiency,
      batchServings,
      totalBatchKwh,
      totalBatchSmc: 0,
      totalBatchEnergyCostEur,
      energyCostPerServingEur,
      singleServingBaselineEur,
      batchThermalSavingPerServingEur: Number(
        Math.max(0, singleServingBaselineEur - energyCostPerServingEur).toFixed(3)
      )
    };
  }

  /**
   * Generalized Household Meal Cost Function (`C_full`):
   *   C_full = C_ingredients + C_energy + C_cookware_wear + C_shadow_time - VaR_saved
   */
  computeGeneralizedMealCost(params = {}) {
    const cal = this.getCalibration(params.rhythmPreset || null).effectiveParameters;
    const hourlyValueEuro =
      params.hourlyValueEuro !== undefined && params.hourlyValueEuro !== null
        ? Number(params.hourlyValueEuro)
        : cal.hourlyValueEuro;
    if (!Number.isFinite(hourlyValueEuro) || hourlyValueEuro < 0) {
      throwBadRequest('hourlyValueEuro deve essere >= 0');
    }

    const batchServings = Math.max(1, Math.round(Number(params.batchServings) || 1));
    const ingredientsEdibleCostEur = Math.max(0, Number(params.ingredientsEdibleCostEur ?? 0) || 0);
    const activePrepMinutes = Math.max(0, Number(params.activePrepMinutes ?? 10) || 0);
    const passiveCookMinutes = Math.max(0, Number(params.passiveCookMinutes ?? 8) || 0);
    const cleaningResetMinutes = Math.max(0, Number(params.cleaningResetMinutes ?? 2) || 0);
    const vaRSavedEuro = Math.max(0, Number(params.vaRSavedEuro ?? 0) || 0);
    const cookwareMaterial = String(params.cookwareMaterial || 'acciaio_inox_18_10');

    const energy = this.computeCookingEnergyCost({
      heatSource: params.heatSource || 'gas',
      cookingMethod: params.cookingMethod || 'stovetop_medium',
      cookMinutes: activePrepMinutes * 0.4 + passiveCookMinutes,
      batchServings,
      rhythmPreset: params.rhythmPreset || null,
      electricityEurPerKwh: params.electricityEurPerKwh,
      gasEurPerSmc: params.gasEurPerSmc
    });

    // Cookware wear per use: BIFL (~€0.01) vs PTFE coated (~€0.08 proper care)
    const cookwareWearPerBatchEur = cookwareMaterial.includes('ptfe') ? 0.08 : 0.01;
    const cookwareAmortizationEur = Number((cookwareWearPerBatchEur / batchServings).toFixed(2));

    // Active prep scales sub-linearly in batch cooking (+25% per extra portion), cleaning occurs ONCE!
    const batchActivePrepMinutes = activePrepMinutes * (1 + Math.max(0, batchServings - 1) * 0.25);
    const weightedBatchMinutes =
      batchActivePrepMinutes +
      cleaningResetMinutes * cal.cleaningFrictionMultiplier +
      passiveCookMinutes * cal.passiveTimeWeight;
    const weightedSingleMinutes =
      activePrepMinutes +
      cleaningResetMinutes * cal.cleaningFrictionMultiplier +
      passiveCookMinutes * cal.passiveTimeWeight;

    const timeShadowCostPerServingEur = Number(
      (((weightedBatchMinutes / 60) * hourlyValueEuro) / batchServings).toFixed(2)
    );
    const singleTimeShadowCostEur = Number(((weightedSingleMinutes / 60) * hourlyValueEuro).toFixed(2));

    const energyCostEur = Number(energy.energyCostPerServingEur.toFixed(2));
    const grossGeneralizedCostEur = Number(
      (ingredientsEdibleCostEur + energyCostEur + cookwareAmortizationEur + timeShadowCostEurFix(timeShadowCostPerServingEur)).toFixed(2)
    );
    const vaRSavedPerServingEur = Number((vaRSavedEuro / batchServings).toFixed(2));
    const netGeneralizedCostEur = Number((grossGeneralizedCostEur - vaRSavedPerServingEur).toFixed(2));

    const singleServingGrossEur = Number(
      (
        ingredientsEdibleCostEur +
        Number(energy.singleServingBaselineEur.toFixed(2)) +
        cookwareWearPerBatchEur +
        singleTimeShadowCostEur
      ).toFixed(2)
    );

    return {
      batchServings,
      hourlyValueEuro,
      breakdown: {
        ingredientsEdibleCostEur: Number(ingredientsEdibleCostEur.toFixed(2)),
        energyCostEur,
        cookwareAmortizationEur,
        timeShadowCostEur: timeShadowCostPerServingEur,
        vaRSavedPerServingEur
      },
      minutesPerServing: {
        activePrepMinutes: Number((batchActivePrepMinutes / batchServings).toFixed(1)),
        cleaningResetMinutes: Number((cleaningResetMinutes / batchServings).toFixed(1)),
        passiveCookMinutes: Number((passiveCookMinutes / batchServings).toFixed(1)),
        totalHandsOnMinutes: Number(((batchActivePrepMinutes + cleaningResetMinutes) / batchServings).toFixed(1))
      },
      energyDetails: energy,
      grossGeneralizedCostEur,
      netGeneralizedCostEur,
      batchScaleEconomy: {
        singleServingGrossEur,
        savedPerServingViaBatchEur: Number(Math.max(0, singleServingGrossEur - grossGeneralizedCostEur).toFixed(2))
      }
    };
  }

  /**
   * Evaluates Rapallo 1-Store vs 2-Store vs 3-Store shopping routes against the user's Shadow Price of Time (`w_t`),
   * factoring in real Rapallo `logistics.parkingEase` penalties (`low` in Corso Mameli vs `high` at Porto).
   */
  evaluateMultiStoreTimeYield(options = {}) {
    const cal = this.getCalibration(options.rhythmPreset || null).effectiveParameters;
    const hourlyValueEuro =
      options.hourlyValueEuro !== undefined && options.hourlyValueEuro !== null
        ? Number(options.hourlyValueEuro)
        : cal.hourlyValueEuro;
    const transportMode = VALID_TRANSPORT_MODES.includes(options.transportMode)
      ? options.transportMode
      : cal.transportMode;

    const allStores = this.getStores();
    const rawSims =
      Array.isArray(options.storeSimulations) && options.storeSimulations.length > 0
        ? options.storeSimulations
        : this.shoppingListService.getShoppingListState().storeSimulations || [];

    const matchStoreMeta = (visitedLabel = '') => {
      const normLabel = normalizeSearchToken(visitedLabel);
      return (
        allStores.find((s) => normLabel.includes(normalizeSearchToken(s.name))) ||
        allStores.find((s) => normLabel.includes(normalizeSearchToken(s.address))) ||
        allStores.find((s) => normLabel.includes(normalizeSearchToken(s.brand))) ||
        null
      );
    };

    const enrichedStrategies = rawSims.map((sim) => {
      const matchedStores = (sim.storesVisited || []).map(matchStoreMeta);
      const parkingMinutes = matchedStores.reduce(
        (acc, st) => acc + resolveParkingPenaltyMinutes(st?.logistics?.parkingEase || 'medium', transportMode),
        0
      );
      const realisticTotalMinutes = (Number(sim.estimatedTotalMinutes) || 20) + parkingMinutes;
      const timeOpportunityCostEur = Number(((realisticTotalMinutes / 60) * hourlyValueEuro).toFixed(2));
      const fullLogisticsCostEur = Number(
        ((Number(sim.estimatedTotalEur) || 0) + timeOpportunityCostEur).toFixed(2)
      );

      return {
        ...sim,
        transportMode,
        parkingPenaltyMinutes: parkingMinutes,
        realisticTotalMinutes,
        timeOpportunityCostEur,
        fullLogisticsCostEur,
        parkingBreakdown: matchedStores.map((st, idx) => ({
          label: sim.storesVisited?.[idx] || st?.name || 'Negozio Rapallo',
          parkingEase: st?.logistics?.parkingEase || 'medium',
          addedParkingMinutes: resolveParkingPenaltyMinutes(st?.logistics?.parkingEase || 'medium', transportMode)
        }))
      };
    });

    const s1 = enrichedStrategies[0] || null;
    const s2 = enrichedStrategies[1] || null;
    const s3 = enrichedStrategies[2] || null;

    const buildStepYield = (prevStrat, nextStrat, stepLabel) => {
      if (!prevStrat || !nextStrat) return null;
      const sameStops =
        (nextStrat.storesVisited || []).length <= (prevStrat.storesVisited || []).length &&
        Number(nextStrat.estimatedTotalEur) === Number(prevStrat.estimatedTotalEur);
      const deltaSavingsEur = Number(
        Math.max(0, Number(prevStrat.estimatedTotalEur) - Number(nextStrat.estimatedTotalEur)).toFixed(2)
      );
      const deltaMinutes = Math.max(
        0,
        nextStrat.realisticTotalMinutes - prevStrat.realisticTotalMinutes
      );

      if (sameStops || deltaSavingsEur === 0) {
        return {
          stepLabel,
          deltaSavingsEur: 0,
          deltaMinutes: 0,
          impliedHourlyYieldEur: 0,
          userThresholdEurPerHour: hourlyValueEuro,
          beatsShadowPrice: false,
          verdict: 'no_extra_stop_needed',
          explanation: 'Nessun risparmio aggiuntivo dalla tappa extra: tappe ridondanti già potate.'
        };
      }

      const effectiveDeltaMins = Math.max(4, deltaMinutes);
      const impliedHourlyYieldEur = Number(((deltaSavingsEur / effectiveDeltaMins) * 60).toFixed(2));
      const beatsShadowPrice = impliedHourlyYieldEur >= hourlyValueEuro;

      return {
        stepLabel,
        deltaSavingsEur,
        deltaMinutes: effectiveDeltaMins,
        impliedHourlyYieldEur,
        userThresholdEurPerHour: hourlyValueEuro,
        beatsShadowPrice,
        verdict: beatsShadowPrice ? 'recommended' : 'skip_false_saving',
        explanation: beatsShadowPrice
          ? `Tappa economicamente razionale: risparmi €${deltaSavingsEur.toFixed(2)} in +${effectiveDeltaMins} min (parcheggio incluso) = €${impliedHourlyYieldEur.toFixed(2)}/h esentasse (>= tuoi €${hourlyValueEuro}/h).`
          : `Falso risparmio: risparmi €${deltaSavingsEur.toFixed(2)} ma perdi +${effectiveDeltaMins} min a Rapallo = €${impliedHourlyYieldEur.toFixed(2)}/h, sotto il valore del tuo tempo (€${hourlyValueEuro}/h).`
      };
    };

    const step1to2 = buildStepYield(s1, s2, '1 → 2 Negozi a Rapallo');
    const step2to3 = buildStepYield(s2, s3, '2 → 3 Negozi a Rapallo');

    // Optimal strategy minimizes fullLogisticsCostEur (checkout cash + shadow time cost)
    let optimal = s1;
    if (s2 && step1to2?.beatsShadowPrice && s2.fullLogisticsCostEur < optimal.fullLogisticsCostEur) {
      optimal = s2;
      if (s3 && step2to3?.beatsShadowPrice && s3.fullLogisticsCostEur < optimal.fullLogisticsCostEur) {
        optimal = s3;
      }
    }

    return {
      hourlyValueEuro,
      transportMode,
      optimalStrategyId: optimal?.strategyId || '1_store_express',
      optimalSummary: optimal
        ? `Strategia ottima col tuo tempo a €${hourlyValueEuro}/h: "${optimal.title}" (Cassa €${Number(optimal.estimatedTotalEur).toFixed(2)} + ${optimal.realisticTotalMinutes} min = Costo Pieno €${optimal.fullLogisticsCostEur.toFixed(2)}).`
        : 'Aggiungi articoli alla lista spesa per valutare il rendimento orario delle tappe a Rapallo.',
      incrementalYields: [step1to2, step2to3].filter(Boolean),
      strategies: enrichedStrategies
    };
  }

  /**
   * Calculates CapEx vs OpEx Total Cost of Ownership (`CPU` & `10-Year TCO` ranges) for cookware archetypes,
   * quantifying the exact financial destruction caused by thermal/chemical abuse (e.g., PTFE + Boost/alkali).
   */
  evaluateCookwareTco(options = {}) {
    const usesPerWeek = Math.max(0.5, Number(options.usesPerWeek) || 3);
    const tenYearUses = Math.round(usesPerWeek * 52 * 10);
    const kitchenState = this.kitchenInventoryService.getKitchenState();
    const archetypes = Array.isArray(options.archetypes)
      ? options.archetypes
      : this.kitchenInventoryService.getArchetypes();
    const ownedSet = new Set(kitchenState.ownedToolIds || []);

    const items = archetypes.map((arch) => {
      const price = Number(arch.referencePriceEuro) || 25;
      const band =
        MATERIAL_LIFECYCLE_BANDS[arch.material] ||
        MATERIAL_LIFECYCLE_BANDS[arch.materialId] ||
        MATERIAL_LIFECYCLE_BANDS.acciaio_inox_18_10;

      const netCapEx = price * (1 - band.residualValueRatio);
      const [minProper, maxProper] = band.properCyclesRange;
      const [minAbuse, maxAbuse] = band.abuseCyclesRange;

      // Range of Cost-Per-Use `[lowestCpuAtMaxLife, highestCpuAtMinLife]`
      const cpuProperRangeEur = [
        Number((netCapEx / maxProper).toFixed(3)),
        Number((netCapEx / minProper).toFixed(3))
      ];
      const cpuAbuseRangeEur = [
        Number((price / maxAbuse).toFixed(3)),
        Number((price / minAbuse).toFixed(3))
      ];

      const unitsNeededProperRange = [
        Math.max(1, Math.ceil(tenYearUses / maxProper)),
        Math.max(1, Math.ceil(tenYearUses / minProper))
      ];
      const unitsNeededAbuseRange = [
        Math.max(1, Math.ceil(tenYearUses / maxAbuse)),
        Math.max(1, Math.ceil(tenYearUses / minAbuse))
      ];

      const tenYearMaint = band.annualMaintenanceEuro * 10;
      const tenYearTcoProperRangeEur = [
        Number((unitsNeededProperRange[0] * price + tenYearMaint).toFixed(2)),
        Number((unitsNeededProperRange[1] * price + tenYearMaint).toFixed(2))
      ];
      const tenYearTcoAbuseRangeEur = [
        Number((unitsNeededAbuseRange[0] * price + tenYearMaint).toFixed(2)),
        Number((unitsNeededAbuseRange[1] * price + tenYearMaint).toFixed(2))
      ];

      return {
        id: arch.id,
        name: arch.name,
        material: arch.material,
        owned: ownedSet.has(arch.id),
        referencePriceEuro: price,
        capExClass: band.capExClass,
        properCyclesRange: band.properCyclesRange,
        abuseCyclesRange: band.abuseCyclesRange,
        cpuProperRangeEur,
        cpuAbuseRangeEur,
        tenYearAssumedUses: tenYearUses,
        tenYearTcoProperRangeEur,
        tenYearTcoAbuseRangeEur,
        tenYearAbuseWasteMidpointEur: Number(
          (
            (tenYearTcoAbuseRangeEur[0] + tenYearTcoAbuseRangeEur[1]) / 2 -
            (tenYearTcoProperRangeEur[0] + tenYearTcoProperRangeEur[1]) / 2
          ).toFixed(2)
        ),
        degradationVector: band.degradationVector,
        buyingVerdict: band.buyingVerdict
      };
    });

    return {
      usesPerWeekBasis: usesPerWeek,
      tenYearTotalUsesBasis: tenYearUses,
      toolsTco: items,
      commodityArbitrageGuide: COMMODITY_VS_BRAND_GUIDE
    };
  }

  /**
   * Personal Laspeyres Price Index ("Il Tuo ISTAT Personale a Rapallo") & Shrinkflation Watchdog.
   * Computed 100% deterministically on verified receipts & priceHistory observations (ADR-0006:
   * returns `laspeyresIndex: null` when fewer than 1 item has >= 2 time-ordered observations).
   */
  computePersonalInflationAndShrinkflation(options = {}) {
    const observations = Array.isArray(options.observations)
      ? options.observations
      : this.priceHistoryService.getAllObservations();
    const receipts = Array.isArray(options.receipts)
      ? options.receipts
      : this.receiptService.getReceipts();

    // Build chronological observation series per canonical productKey
    const byProductKey = new Map();

    const pushEntry = (entry) => {
      if (!entry || !entry.title) return;
      const price = Number(entry.price ?? entry.unitPriceEuro);
      if (!Number.isFinite(price) || price <= 0) return;

      const pKey = entry.productKey || buildProductKey(entry.title, entry.brand || '');
      if (!pKey || pKey === 'prodotto-generico') return;

      const metrics = extractPackMetrics({ title: `${entry.title} ${entry.unitString || ''}` });
      const packGramsOrMl =
        entry.packVolumeMl ||
        entry.packWeightGrams ||
        metrics.packVolumeMl ||
        metrics.packWeightGrams ||
        null;

      let normUnitPrice = Number(entry.normalizedPricePerKgOrL);
      if ((!Number.isFinite(normUnitPrice) || normUnitPrice <= 0) && packGramsOrMl && packGramsOrMl > 0) {
        normUnitPrice = Number(((price / packGramsOrMl) * 1000).toFixed(2));
      }
      if (!Number.isFinite(normUnitPrice) || normUnitPrice <= 0) return;

      const ts = new Date(entry.observedAt || entry.purchasedAt || 0).getTime();
      const safeTs = Number.isFinite(ts) && ts > 0 ? ts : 0;

      if (!byProductKey.has(pKey)) byProductKey.set(pKey, []);
      byProductKey.get(pKey).push({
        id: entry.id || null,
        productKey: pKey,
        title: entry.title,
        storeName: entry.storeName || entry.storeId || 'Rapallo',
        packPriceEuro: Number(price.toFixed(2)),
        packGramsOrMl: packGramsOrMl ? Math.round(packGramsOrMl) : null,
        normalizedPricePerKgOrL: Number(normUnitPrice.toFixed(2)),
        referenceUnit: entry.referenceUnit || (metrics.packVolumeMl ? 'L' : 'kg'),
        quantityWeightKg: packGramsOrMl && packGramsOrMl > 0 ? packGramsOrMl / 1000 : 1,
        timestampMs: safeTs,
        observedAt: entry.observedAt || entry.purchasedAt || null
      });
    };

    for (const obs of observations) {
      pushEntry(obs);
    }

    // Also include confirmed receipt lines if any were passed directly in isolated tests
    if (Array.isArray(options.receipts)) {
      for (const rcpt of receipts) {
        for (const line of rcpt.lines || []) {
          pushEntry({
            title: line.title,
            brand: line.brand,
            price: line.unitPriceEuro,
            unitString: line.unitString,
            packWeightGrams: line.packWeightGrams ? line.packWeightGrams / (line.quantity || 1) : null,
            packVolumeMl: line.packVolumeMl ? line.packVolumeMl / (line.quantity || 1) : null,
            storeName: rcpt.storeName,
            purchasedAt: rcpt.purchasedAt
          });
        }
      }
    }

    let baseBasketCost = 0;
    let currentBasketCost = 0;
    const itemVariations = [];
    const shrinkflationAlerts = [];

    for (const [pKey, series] of byProductKey.entries()) {
      if (series.length < 2) continue;
      // Sort oldest -> newest
      series.sort((a, b) => a.timestampMs - b.timestampMs);
      const base = series[0];
      const latest = series[series.length - 1];

      // Skip identical single-snapshot duplicate
      if (base.id && latest.id && base.id === latest.id) continue;

      const q0 = base.quantityWeightKg || 1;
      baseBasketCost += base.normalizedPricePerKgOrL * q0;
      currentBasketCost += latest.normalizedPricePerKgOrL * q0;

      const unitDeltaPct = Number(
        (((latest.normalizedPricePerKgOrL - base.normalizedPricePerKgOrL) / base.normalizedPricePerKgOrL) * 100).toFixed(2)
      );

      itemVariations.push({
        productKey: pKey,
        title: latest.title,
        baselineNormalizedPrice: base.normalizedPricePerKgOrL,
        latestNormalizedPrice: latest.normalizedPricePerKgOrL,
        referenceUnit: latest.referenceUnit,
        unitDeltaPct,
        observationsCount: series.length
      });

      // Shrinkflation detection: pack size decreased (e.g. 500g -> 400g or 250g -> 200g) while €/kg rose!
      if (
        base.packGramsOrMl &&
        latest.packGramsOrMl &&
        latest.packGramsOrMl < base.packGramsOrMl * 0.96 &&
        latest.normalizedPricePerKgOrL > base.normalizedPricePerKgOrL * 1.02
      ) {
        const weightDropPct = Number(
          (((latest.packGramsOrMl - base.packGramsOrMl) / base.packGramsOrMl) * 100).toFixed(1)
        );
        shrinkflationAlerts.push({
          productKey: pKey,
          title: latest.title,
          storeName: latest.storeName,
          previousPackGramsOrMl: base.packGramsOrMl,
          newPackGramsOrMl: latest.packGramsOrMl,
          weightDropPct,
          previousPackPriceEuro: base.packPriceEuro,
          newPackPriceEuro: latest.packPriceEuro,
          hiddenUnitPriceIncreasePct: unitDeltaPct,
          explanation: `Shrinkflation rilevata su "${latest.title}": formato ridotto da ${base.packGramsOrMl} a ${latest.packGramsOrMl} (${weightDropPct}%), con rincaro reale del +${unitDeltaPct}% al ${latest.referenceUnit}.`
        });
      }
    }

    if (itemVariations.length === 0 || baseBasketCost <= 0) {
      return {
        status: 'insufficient_history',
        comparableItemsCount: 0,
        laspeyresIndex: null,
        personalInflationPct: null,
        shrinkflationAlerts: [],
        itemVariations: [],
        summary:
          'Storico longitudinale non ancora sufficiente (servono almeno 2 rilevazioni nel tempo sulla stessa referenza da scontrini o volantini a Rapallo — zero indici inventati per ADR-0006).'
      };
    }

    const laspeyresIndex = Number(((currentBasketCost / baseBasketCost) * 100).toFixed(2));
    const personalInflationPct = Number((laspeyresIndex - 100).toFixed(2));

    itemVariations.sort((a, b) => b.unitDeltaPct - a.unitDeltaPct);

    return {
      status: 'computed',
      comparableItemsCount: itemVariations.length,
      laspeyresIndex,
      personalInflationPct,
      shrinkflationAlerts,
      itemVariations,
      summary:
        personalInflationPct >= 0
          ? `Indice di Laspeyres sul tuo paniere a Rapallo: ${laspeyresIndex} (+${personalInflationPct}% su ${itemVariations.length} referenze longitudinali; ${shrinkflationAlerts.length} alert shrinkflation).`
          : `Indice di Laspeyres sul tuo paniere a Rapallo: ${laspeyresIndex} (${personalInflationPct}% deflazione/risparmio netto su ${itemVariations.length} referenze longitudinali).`
    };
  }
}

function timeShadowCostEurFix(val) {
  return Number.isFinite(val) ? val : 0;
}

export const householdEconomicsService = new HouseholdEconomicsService();
export default householdEconomicsService;
