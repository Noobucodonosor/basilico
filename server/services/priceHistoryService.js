/**
 * Basilico — Price History & Counter Observations Service (ADR-0007 / TASK-M1-02)
 * Location: server/services/priceHistoryService.js
 *
 * Tracks normalized price observations across flyers, receipts, and quick counter entries
 * ("Prezzo visto al banco") in Rapallo (16035).
 * Provides honest "È un vero sconto?" verification against historical observations.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSearchToken } from './offerService.js';
import { normalizeUnitPricing } from './unitPriceExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_HISTORY_PATH = path.resolve(__dirname, '..', '..', 'data', 'cache', 'price_history.json');

    // Baseline reference observations in Rapallo (ordinary off-flyer benchmark prices)
const SEED_BASELINE_OBSERVATIONS = [
  {
    id: 'obs-seed-barilla-500g',
    productKey: 'pasta di semola barilla',
    stapleKey: 'pasta_semola',
    title: 'Pasta di Semola Barilla 500 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 1.39,
    unitString: '500 g',
    normalizedPricePerKgOrL: 2.78,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-01T10:00:00.000Z'
  },
  {
    id: 'obs-seed-mutti-passata-700g',
    productKey: 'passata di pomodoro mutti',
    stapleKey: 'passata_pomodoro',
    title: 'Passata di Pomodoro Mutti 700 g',
    storeId: 'rapallo-coop-sciesa',
    storeName: 'Coop Rapallo',
    price: 1.85,
    unitString: '700 g',
    normalizedPricePerKgOrL: 2.64,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-05T10:00:00.000Z'
  },
  {
    id: 'obs-seed-lavazza-qualita-rossa',
    productKey: 'caffe macinato qualita rossa lavazza',
    stapleKey: 'caffe_macinato',
    title: 'Caffè Macinato Qualità Rossa Lavazza 2x250 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 7.49,
    unitString: '2 x 250 g',
    normalizedPricePerKgOrL: 14.98,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-10T10:00:00.000Z'
  },
  {
    id: 'obs-seed-olio-evo-monini',
    productKey: 'olio extra vergine di oliva classico monini',
    stapleKey: 'olio_evo',
    title: 'Olio Extra Vergine di Oliva Classico Monini 1 l',
    storeId: 'rapallo-gulliver-mameli',
    storeName: 'Gulliver Rapallo',
    price: 9.90,
    unitString: '1 l',
    normalizedPricePerKgOrL: 9.90,
    referenceUnit: 'L',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-12T10:00:00.000Z'
  },
  {
    id: 'obs-seed-tonno-rio-mare',
    productKey: 'tonno all olio di oliva rio mare',
    stapleKey: 'tonno_conserva',
    title: 'Tonno all\'Olio di Oliva Rio Mare 3 x 80 g',
    storeId: 'rapallo-carrefour-assereto',
    storeName: 'Carrefour Market Rapallo',
    price: 4.99,
    unitString: '3 x 80 g',
    normalizedPricePerKgOrL: 31.99,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-15T10:00:00.000Z'
  },
  {
    id: 'obs-seed-uova-fresche-10',
    productKey: '10 uova fresche fiordovo latte tigullio',
    stapleKey: 'uova_fresche',
    title: 'Uova Fresche Allevamento a Terra 10 pz',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 3.69,
    unitString: '10 uova',
    normalizedPricePerKgOrL: 6.96,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-16T10:00:00.000Z'
  },
  {
    id: 'obs-seed-banane-sfuse',
    productKey: 'banane',
    stapleKey: 'banane',
    title: 'Banane Sfuse 1 kg',
    storeId: 'rapallo-coop-sciesa',
    storeName: 'Coop Rapallo',
    price: 1.99,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 1.99,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-16T10:00:00.000Z'
  },
  {
    id: 'obs-seed-mele-fuji',
    productKey: 'mele fuji',
    stapleKey: 'mele',
    title: 'Mele Fuji 1 kg',
    storeId: 'rapallo-gulliver-mameli',
    storeName: 'Gulliver Rapallo',
    price: 2.39,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 2.39,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-17T10:00:00.000Z'
  },
  {
    id: 'obs-seed-finocchi',
    productKey: 'finocchi',
    stapleKey: 'finocchi',
    title: 'Finocchi Freschi 1 kg',
    storeId: 'rapallo-coop-sciesa',
    storeName: 'Coop Rapallo',
    price: 2.49,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 2.49,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-18T10:00:00.000Z'
  },
  {
    id: 'obs-seed-ananas',
    productKey: 'ananas',
    stapleKey: 'ananas',
    title: 'Ananas Maturo 1 kg',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 1.99,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 1.99,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-18T10:00:00.000Z'
  },
  {
    id: 'obs-seed-arance',
    productKey: 'arance navel',
    stapleKey: 'arance',
    title: 'Arance Navel 1 kg',
    storeId: 'rapallo-eurospin-aurelia',
    storeName: 'Eurospin Rapallo',
    price: 1.89,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 1.89,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-19T10:00:00.000Z'
  },
  {
    id: 'obs-seed-avocado',
    productKey: 'avocado hass',
    stapleKey: 'avocado',
    title: 'Avocado Hass 500 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 2.49,
    unitString: '500 g',
    normalizedPricePerKgOrL: 4.98,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-19T10:00:00.000Z'
  },
  {
    id: 'obs-seed-cavolfiori',
    productKey: 'cavolfiori',
    stapleKey: 'cavolfiori',
    title: 'Cavolfiori Bianchi 1 kg',
    storeId: 'rapallo-eurospin-aurelia',
    storeName: 'Eurospin Rapallo',
    price: 1.99,
    unitString: '1 kg',
    normalizedPricePerKgOrL: 1.99,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-20T10:00:00.000Z'
  },
  {
    id: 'obs-seed-orata-filetto',
    productKey: 'filetto di orata',
    stapleKey: 'filetto_orata',
    title: 'Filetto di Orata 250 g',
    storeId: 'rapallo-coop-sciesa',
    storeName: 'Coop Rapallo',
    price: 6.49,
    unitString: '250 g',
    normalizedPricePerKgOrL: 25.96,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-20T10:00:00.000Z'
  },
  {
    id: 'obs-seed-baccala-filetto',
    productKey: 'filetto di baccala',
    stapleKey: 'filetto_baccala',
    title: 'Filetto di Baccalà Dissalato 400 g',
    storeId: 'rapallo-coop-sciesa',
    storeName: 'Coop Rapallo',
    price: 9.90,
    unitString: '400 g',
    normalizedPricePerKgOrL: 24.75,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-21T10:00:00.000Z'
  },
  {
    id: 'obs-seed-petto-pollo',
    productKey: 'petto di pollo a fette',
    stapleKey: 'petto_pollo',
    title: 'Petto di Pollo a Fette 400 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 4.99,
    unitString: '400 g',
    normalizedPricePerKgOrL: 12.48,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-21T10:00:00.000Z'
  },
  {
    id: 'obs-seed-prosciutto-cotto',
    productKey: 'prosciutto cotto alta qualita',
    stapleKey: 'prosciutto_cotto',
    title: 'Prosciutto Cotto Alta Qualità 100 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 2.69,
    unitString: '100 g',
    normalizedPricePerKgOrL: 26.90,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-22T10:00:00.000Z'
  },
  {
    id: 'obs-seed-noci-sgusciate',
    productKey: 'noci secche',
    stapleKey: 'noci',
    title: 'Noci in Guscio / Sgusciate 200 g',
    storeId: 'rapallo-dpiu-fioria',
    storeName: 'Doro / DPiù Rapallo',
    price: 2.99,
    unitString: '200 g',
    normalizedPricePerKgOrL: 14.95,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-22T10:00:00.000Z'
  },
  {
    id: 'obs-seed-pan-bauletto',
    productKey: 'pan bauletto bianco mulino bianco',
    stapleKey: 'pan_bauletto',
    title: 'Pan Bauletto Bianco Mulino Bianco 400 g',
    storeId: 'rapallo-carrefour-assereto',
    storeName: 'Carrefour Market Rapallo',
    price: 1.29,
    unitString: '400 g',
    normalizedPricePerKgOrL: 3.23,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-23T10:00:00.000Z'
  },
  {
    id: 'obs-seed-ricotta-vaccina',
    productKey: 'ricotta latte tigullio',
    stapleKey: 'ricotta',
    title: 'Ricotta Fresca Vaccina 250 g',
    storeId: 'rapallo-basko-colombo',
    storeName: 'Basko Rapallo',
    price: 1.99,
    unitString: '250 g',
    normalizedPricePerKgOrL: 7.96,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-23T10:00:00.000Z'
  },
  {
    id: 'obs-seed-mozzarella-fresca',
    productKey: 'mozzarella fresca',
    stapleKey: 'mozzarella',
    title: 'Mozzarella Vaccina 125 g sgocc.',
    storeId: 'rapallo-gulliver-mameli',
    storeName: 'Gulliver Rapallo',
    price: 1.49,
    unitString: '125 g',
    normalizedPricePerKgOrL: 11.92,
    referenceUnit: 'kg',
    channel: 'ordinary_shelf',
    observedAt: '2026-10-24T10:00:00.000Z'
  }
];

const STAPLE_BENCHMARK_RULES = [
  { key: 'pasta_semola', regex: /\b(pasta di semola|spaghetti|penne|fusilli|rigatoni)\b/ },
  { key: 'passata_pomodoro', regex: /\b(passata di pomodoro|passata classica)\b/ },
  { key: 'caffe_macinato', regex: /\b(caffe macinato|qualita rossa|qualita oro)\b/ },
  { key: 'olio_evo', regex: /\b(olio extra\s*vergine|olio evo)\b/ },
  { key: 'tonno_conserva', regex: /\b(tonno all olio|tonno in olio|tonno leggero)\b/ },
  { key: 'uova_fresche', regex: /\b(\d+\s*uova|uova fresche)\b/ },
  { key: 'banane', regex: /\b(banane|bananito)\b/ },
  { key: 'mele', regex: /\b(mele fuji|mele golden|mele gala|mele)\b/ },
  { key: 'finocchi', regex: /\b(finocchi)\b/ },
  { key: 'ananas', regex: /\b(ananas)\b/ },
  { key: 'arance', regex: /\b(arance)\b/ },
  { key: 'avocado', regex: /\b(avocado)\b/ },
  { key: 'cavolfiori', regex: /\b(cavolfiori)\b/ },
  { key: 'filetto_orata', regex: /\b(filetto di orata|filetti di orata)\b/ },
  { key: 'filetto_baccala', regex: /\b(filetto di baccala|filetti di baccala)\b/ },
  { key: 'petto_pollo', regex: /\b(petto di pollo|filetti di pollo)\b/ },
  { key: 'prosciutto_cotto', regex: /\b(prosciutto cotto)\b/ },
  { key: 'noci', regex: /^(?:.*\s)?(noci)$/ },
  { key: 'pan_bauletto', regex: /\b(pan bauletto)\b/ },
  { key: 'ricotta', regex: /\b(ricotta)\b/ },
  { key: 'mozzarella', regex: /\b(mozzarella)\b/ }
];

export function resolveStapleKey(text = '') {
  const norm = normalizeSearchToken(text);
  for (const r of STAPLE_BENCHMARK_RULES) {
    if (r.regex.test(norm)) return r.key;
  }
  return null;
}

/**
 * Generates a canonical normalized product key for matching price history.
 */
export function buildProductKey(title = '', brand = '') {
  const normTitle = normalizeSearchToken(title)
    .replace(/\b\d+(?:[.,]\d+)?\s*(?:x\s*\d+(?:[.,]\d+)?)?\s*(?:kg|g|gr|etti|etto|hg|l|lt|ml|cl|pz|pezzi|rotoli|caps|capsule|pods|lavaggi)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  const normBrand = normalizeSearchToken(brand).trim();
  if (normBrand && !normTitle.includes(normBrand)) {
    return `${normTitle} ${normBrand}`.trim();
  }
  return normTitle || normBrand || 'prodotto-generico';
}

export class PriceHistoryService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_PRICE_HISTORY_PATH || DEFAULT_HISTORY_PATH;
    this._observations = null;
  }

  _load() {
    if (this._observations) return this._observations;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = fs.readFileSync(this.storagePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          this._observations = parsed;
          return this._observations;
        }
      }
    } catch (_) {
      // Fallback to seed baseline if file is missing or unreadable
    }
    this._observations = [...SEED_BASELINE_OBSERVATIONS];
    return this._observations;
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmpPath = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(this._observations, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.storagePath);
    } catch (_) {
      // Non-fatal in read-only environments
    }
  }

  getAllObservations(filters = {}) {
    const all = this._load();
    return all.filter((obs) => {
      if (filters.storeId && obs.storeId !== filters.storeId) return false;
      if (filters.channel && obs.channel !== filters.channel) return false;
      if (filters.q) {
        const qNorm = normalizeSearchToken(filters.q);
        const hay = normalizeSearchToken(`${obs.title} ${obs.productKey} ${obs.storeName || ''}`);
        if (!hay.includes(qNorm)) return false;
      }
      return true;
    });
  }

  /**
   * Records a new price observation ("Prezzo visto al banco", receipt line, or flyer snapshot).
   */
  recordObservation(payload = {}) {
    const title = String(payload.title || '').trim();
    const price = Number(payload.price ?? payload.promoPrice);
    if (!title) {
      const err = new Error('Titolo prodotto obbligatorio per registrare il prezzo');
      err.status = 400;
      throw err;
    }
    if (!Number.isFinite(price) || price <= 0) {
      const err = new Error('Prezzo valido (> 0) obbligatorio');
      err.status = 400;
      throw err;
    }

    const unitString = String(payload.unitString || payload.unit || payload.quantity || '1 kg').trim();
    const brand = String(payload.brand || '').trim();
    const storeId = String(payload.storeId || 'bottega-locale-rapallo').trim();
    const storeName = String(payload.storeName || storeId).trim();
    const channel = payload.channel || 'counter_observed';

    const unitAnalysis = normalizeUnitPricing({
      title: `${title} ${unitString}`,
      promoPrice: price,
      unitPrice: payload.unitPrice || unitString
    });

    const normKgOrL = unitAnalysis.ediblePricePerKg ?? unitAnalysis.pricePerKg ?? unitAnalysis.pricePerLiter ?? Number(price.toFixed(2));
    const refUnit = unitAnalysis.pricePerLiter ? 'L' : 'kg';

    const obs = {
      id: `obs-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productKey: buildProductKey(title, brand),
      title,
      brand: brand || null,
      storeId,
      storeName,
      price: Number(price.toFixed(2)),
      unitString,
      normalizedPricePerKgOrL: normKgOrL,
      referenceUnit: refUnit,
      channel,
      notes: payload.notes ? String(payload.notes).trim() : null,
      observedAt: payload.observedAt || new Date().toISOString()
    };

    const list = this._load();
    list.unshift(obs);
    this._save();
    return obs;
  }

  /**
   * Evaluates "È un vero sconto?" for an offer against historical observations and declared originalPrice.
   * Strictly compares normalized €/kg or €/L against normalized historical €/kg or €/L (never pack price vs €/kg).
   */
  evaluateRealDiscount(offer = {}) {
    if (!offer || offer.isNamelessTile) {
      return {
        status: 'first_observation',
        badge: 'Prima Rilevazione',
        deltaVsHistoryPct: 0,
        historicalAvgNormalized: null,
        observationsCount: 0,
        explanation: 'Riquadro volantino privo di referenza confrontabile.'
      };
    }

    const promoVal = Number(offer.promoPrice ?? offer.price ?? 0);
    const origVal = offer.originalPrice != null ? Number(offer.originalPrice) : null;
    const key = buildProductKey(offer.title || '', offer.brand || '');
    const stapleKey = resolveStapleKey(`${offer.title || ''} ${offer.brand || ''}`);
    const all = this._load();

    // Match observations by exact productKey, full-word overlap, or canonical stapleKey
    const exactMatches = all.filter((o) => {
      if (o.productKey === key) return true;
      return key.length >= 8 && o.productKey.length >= 8 && (o.productKey.includes(key) || key.includes(o.productKey));
    });
    const matchingObs = exactMatches.length > 0
      ? exactMatches
      : (stapleKey ? all.filter((o) => (o.stapleKey || resolveStapleKey(o.title)) === stapleKey) : []);

    const offerUnitNorm =
      offer.ediblePricePerKg ??
      offer.pricePerKg ??
      offer.pricePerLiter ??
      offer.referencePackEstimate?.estimatedEdiblePricePerKg ??
      offer.unitPricing?.normalizedPricePerKgOrL ??
      null;

    if (matchingObs.length > 0 && offerUnitNorm && offerUnitNorm > 0) {
      const avgHistoricalNorm =
        matchingObs.reduce((acc, o) => acc + (Number(o.normalizedPricePerKgOrL) || o.price), 0) /
        matchingObs.length;
      const minHistoricalNorm = Math.min(
        ...matchingObs.map((o) => Number(o.normalizedPricePerKgOrL) || o.price)
      );

      const comparePrice = offerUnitNorm;
      const deltaPct = avgHistoricalNorm > 0
        ? Math.round(((avgHistoricalNorm - comparePrice) / avgHistoricalNorm) * 100)
        : 0;
      const basisNote = offer.referencePackEstimate?.isEstimatedPackSize
        ? ` (su formato standard ${offer.referencePackEstimate.formatLabel})`
        : '';

      if (comparePrice <= minHistoricalNorm * 0.95) {
        return {
          status: 'verified_best',
          badge: 'Vero Sconto Storico',
          deltaVsHistoryPct: deltaPct,
          historicalAvgNormalized: Number(avgHistoricalNorm.toFixed(2)),
          observationsCount: matchingObs.length,
          explanation: `Sotto del ${deltaPct}% rispetto alla media storica osservata a Rapallo (€ ${avgHistoricalNorm.toFixed(2)}/${matchingObs[0].referenceUnit})${basisNote}.`
        };
      }
      if (comparePrice <= avgHistoricalNorm * 0.98) {
        return {
          status: 'verified_good',
          badge: 'Sconto Reale',
          deltaVsHistoryPct: deltaPct,
          historicalAvgNormalized: Number(avgHistoricalNorm.toFixed(2)),
          observationsCount: matchingObs.length,
          explanation: `Prezzo inferiore del ${deltaPct}% rispetto allo storico ordinario a Rapallo${basisNote}.`
        };
      }
      return {
        status: 'inflated_or_ordinary',
        badge: 'Prezzo Ordinario',
        deltaVsHistoryPct: deltaPct,
        historicalAvgNormalized: Number(avgHistoricalNorm.toFixed(2)),
        observationsCount: matchingObs.length,
        explanation: `Allineato o superiore al prezzo storico medio (€ ${avgHistoricalNorm.toFixed(2)}/${matchingObs[0].referenceUnit})${basisNote}.`
      };
    }

    // Fallback when no prior history exists yet
    if (origVal && origVal > promoVal) {
      const declaredPct = Math.round(((origVal - promoVal) / origVal) * 100);
      return {
        status: 'declared_only',
        badge: `Sconto Dichiarato -${declaredPct}%`,
        deltaVsHistoryPct: declaredPct,
        historicalAvgNormalized: null,
        observationsCount: 0,
        explanation: 'Basato sul prezzo barrato a volantino (nessuno scontrino storico ancora registrato).'
      };
    }

    return {
      status: 'first_observation',
      badge: 'Prima Rilevazione',
      deltaVsHistoryPct: 0,
      historicalAvgNormalized: null,
      observationsCount: 0,
      explanation: 'Prima rilevazione a catalogo per questa referenza.'
    };
  }
}

export const priceHistoryService = new PriceHistoryService();
export default priceHistoryService;
