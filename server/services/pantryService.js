/**
 * Basilico — Three-Zone Physical Pantry & T_open Perishable Clock Service (ADR-0009 / TASK-M3-01)
 * Location: server/services/pantryService.js
 *
 * Manages the user's physical inventory across 3 real locations:
 *  1. 'dry_pantry'     — Dispensa Secca Casa (pasta, riso, legumi, conserve, olio)
 *  2. 'fridge_freezer' — Frigo / Freezer Casa (freschi, pesce, carne, verdure)
 *  3. 'boat_cooler'    — Dotazione Barca / Borsa Termica (cambusa, conserve nobili, zero-forno)
 *
 * Enforces real-time T_open conservation windows on opened perishables:
 *  - When a package is opened (`consumeOrOpenItem(id, { gramsUsed })`), state becomes 'opened',
 *    `openedAt` is stamped, and `expiresAt` is set to `min(closedExpiresAt, openedAt + T_open_hours)`.
 *  - Opened perishables are sorted at the top so the meal planner and user consume them first.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSearchToken } from './offerService.js';
import { extractPackMetrics } from './unitPriceExtractor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PANTRY_PATH = path.resolve(__dirname, '../../data/cache/user_pantry.json');

export const VALID_PANTRY_ZONES = ['dry_pantry', 'fridge_freezer', 'boat_cooler'];

const CANNED_FISH_CREA_IDS = new Set(['123610', '123550', '123010', '120020']);

const STOP_WORDS_BOM = new Set([
  'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'in', 'con', 'da', 'per', 'su', 'o', 'e', 'fresco', 'fresca', 'freschi', 'fresche', 'crudo', 'cruda',
  'cotto', 'cotta', 'ligure', 'genovese', 'tigullio', 'riviera', 'italiano', 'italiana', 'dop', 'igp',
  'filetto', 'filetti', 'trancio', 'tranci', 'cuori', 'fette', 'bocconcini', 'spicchi', 'cubetti',
  'scolati', 'scolate', 'lessati', 'lessate', 'sgocciolato', 'sgocciolati', 'pulito', 'puliti'
]);

function throwValidationError(message) {
  const err = new Error(message);
  err.status = 400;
  throw err;
}

// Typical conservation window T_open (in hours) once a package is opened
export function resolveDefaultTOpenHours(title = '', zone = 'dry_pantry') {
  const norm = normalizeSearchToken(title);

  // Canned/jarred/oil fish once opened in fridge (~72-96h)
  if (
    /\b(tonno|sgombro|acciug\w*|alici|sardine|salmone)\b/.test(norm) &&
    /\b(in\s+scatola|sott\s*olio|all\s*olio|in\s+olio|al\s+naturale|in\s+vetro|sgocciolat\w*|vasetto|lattina)\b/.test(norm)
  ) {
    return 72;
  }

  // Fresh/raw fish & shellfish: 36h
  if (
    /\b(pesce|orata|branzino|spigola|acciug\w*|alici|salmone|sgombro|palamita|tonno|tartare|merluzzo|nasello|baccala|gamber\w*|scamp\w*|cozz\w*|vongol\w*|calamar\w*|seppi\w*|polpo)\b/.test(
      norm
    )
  ) {
    return 36;
  }

  // Cured meats & aged cheeses once opened: 96h
  if (
    /\b(prosciutt\w*|bresaola|salame|mortadella|pancetta|guanciale|speck|affettat\w*|salum\w*|parmigiano|grana|pecorino|trofie|pansot\w*|raviol\w*|gnocchi\s+freschi|pasta\s+fresca)\b/.test(
      norm
    )
  ) {
    return 96;
  }

  // Fresh meat & poultry: 48h
  if (
    /\b(pollo|tacchino|macinat\w*|bovino|manzo|vitell\w*|maiale|suino|agnello|coniglio|salsicci\w*|hamburger|bistecc\w*|carne)\b/.test(
      norm
    )
  ) {
    return 48;
  }

  // Fresh dairy/cheeses & cut greens/produce: 72h
  if (
    /\b(mozzarell\w*|ricotta|stracchino|crescenza|gorgonzola|mascarpone|formagg\w*|panna|insalat\w*|rucola|misticanza|spinac\w*|bietol\w*|borragine|zucchin\w*|pomodor\w*|carot\w*|finocch\w*|broccol\w*|cavolfior\w*|melanzan\w*|peperon\w*|carciof\w*|asparag\w*|mirtill\w*|fragol\w*|lampon\w*|verdura)\b/.test(
      norm
    )
  ) {
    return 72;
  }

  // Opened sauces, milk, yogurt, cooked legumes: 96h
  if (/\b(passata|polpa|pelat\w*|pesto|sugo|latte|yogurt|kefir|skyr|burro|uov\w*|albume|ceci|fagiol\w*|lenticchi\w*)\b/.test(norm)) {
    return 96;
  }

  if (zone === 'fridge_freezer' || zone === 'boat_cooler') {
    return 72;
  }
  return 720; // 30 days for dry pantry items (pasta, rice, oil, biscuits)
}

export function inferDefaultZone(title = '', category = '') {
  const norm = normalizeSearchToken(`${title} ${category}`);
  const isExplicitFreshOrFrozen = /\b(fresc\w*|surgelat\w*|crud\w*)\b/.test(norm);

  // 1. Explicit boat cambusa or canned/jarred boat fish -> 'boat_cooler'
  if (
    /\b(barca|cambusa|gallett\w*)\b/.test(norm) ||
    (!isExplicitFreshOrFrozen &&
      /\b(tonno\s+(?:in\s+scatola|all\s*olio|sott\s*olio|in\s+olio|in\s+vetro|al\s+naturale|sgocciolat\w*)|sgombro\s+(?:in\s+scatola|all\s*olio|sott\s*olio|in\s+olio|in\s+vetro|al\s+naturale|sgocciolat\w*)|filett\w*\s+di\s+(?:tonno|sgombro)\s+(?:in\s+vetro|all\s*olio|sott\s*olio|al\s+naturale))\b/.test(
        norm
      ))
  ) {
    return 'boat_cooler';
  }

  // 2. Shelf-stable dry bakery, confectionery, canned/bottled tomatoes & UHT goods -> 'dry_pantry'
  // Prevents "Biscotti al Latte", "Cioccolato al Latte", "Pomodori Pelati", "Passata di Pomodoro" from landing in fridge_freezer!
  if (
    !isExplicitFreshOrFrozen &&
    /\b(biscott\w*|cioccolat\w*|fette\s+biscottate|merendin\w*|cracker\w*|grissin\w*|wafer|cereali|crostat\w*|plumcake|panetton\w*|pandoro|tarall\w*|patatin\w*|pelat\w*|passata|polpa\s+di\s+pomodor\w*|salsa\s+di\s+pomodor\w*|concentrato\s+di\s+pomodor\w*|pomodor\w*\s+secch\w*|legumi\s+secchi|in\s+scatola|lattina|sott\s*olio|all\s*olio|in\s+olio|sott\s*aceto|a\s+lunga\s+conservazione|\buht\b|farina|spaghett\w*|penne|fusilli|rigatoni|riso\s+carnaroli|olio\s+extra|olio\s+evo|aceto|caffe|zucchero|miele|confettura|marmellata)\b/.test(
      norm
    )
  ) {
    return 'dry_pantry';
  }

  // 3. Perishable fresh/frozen fish, fresh & cured meats, dairy/eggs, fresh pasta & produce -> 'fridge_freezer'
  if (
    /\b(fresc\w*|surgelat\w*|pesce|orata|branzino|spigola|salmone|acciug\w*|alici|sgombro|palamita|merluzzo|nasello|baccala|tonno|tartare|gamber\w*|scamp\w*|cozz\w*|vongol\w*|calamar\w*|seppi\w*|polpo|carne|pollo|tacchino|bovino|manzo|vitell\w*|maiale|suino|agnello|coniglio|macinat\w*|salsicci\w*|hamburger|bistecc\w*|prosciutt\w*|bresaola|salame|mortadella|pancetta|guanciale|speck|affettat\w*|salum\w*|wurstel|uov\w*|albume|latte|yogurt|kefir|skyr|burro|panna|mozzarell\w*|ricotta|stracchino|crescenza|gorgonzola|mascarpone|parmigiano|grana|pecorino|formagg\w*|trofie|pansot\w*|raviol\w*|gnocchi|pasta\s+fresca|spinac\w*|insalat\w*|rucola|misticanza|bietol\w*|borragine|zucchin\w*|pomodor\w*|carot\w*|finocch\w*|broccol\w*|cavolfior\w*|melanzan\w*|peperon\w*|carciof\w*|asparag\w*|mirtill\w*|fragol\w*|lampon\w*)\b/.test(
      norm
    )
  ) {
    return 'fridge_freezer';
  }

  return 'dry_pantry';
}

/**
 * Strict CREA-ID + physical-state compatibility check between a recipe BOM item and a physical pantry package.
 * Prevents raw/fresh fish (e.g. Tartare di tonno 120600) from matching canned/oil/jarred fish (123610),
 * fresh meat from matching cured meats, or fresh vegetables from matching canned/dried items.
 */
export function isPantryItemCompatibleWithBom(bomItem = {}, pantryItem = {}) {
  if (!bomItem || !pantryItem) return false;
  if (!(Number(pantryItem.remainingWeightGrams) > 0)) return false;
  if (bomItem.isSubstitutedComposite) return false;

  const bCrea = bomItem.creaId ? String(bomItem.creaId).trim() : '';
  const pCrea = pantryItem.creaFoodId ? String(pantryItem.creaFoodId).trim() : '';

  // Hard CREA-ID guard: if both carry explicit CREA IDs and they differ, they are distinct foods/states!
  if (bCrea && pCrea && bCrea !== pCrea) {
    return false;
  }

  const itemNorm = normalizeSearchToken(bomItem.name || '');
  const pNorm = normalizeSearchToken(pantryItem.title || '');
  if (!itemNorm || !pNorm) return false;

  const wantsCannedFish =
    /\b(sott\s*olio|all\s*olio|in\s+olio|al\s+naturale|sgocciolat\w*|scatola|vetro|vasetto|lattina)\b/.test(itemNorm) ||
    CANNED_FISH_CREA_IDS.has(bCrea);
  const wantsRawOrFreshFish =
    !wantsCannedFish &&
    /\b(tonno|sgombro|salmone|acciug\w*|alici|orata|branzino|spigola|merluzzo|nasello|baccala|polpo|calamar\w*|seppi\w*|gamber\w*|scamp\w*|cozz\w*|vongol\w*|pesce)\b/.test(
      itemNorm
    );

  const pIsCannedOrDryFish =
    pantryItem.zone === 'dry_pantry' ||
    pantryItem.zone === 'boat_cooler' ||
    /\b(vetro|scatola|sott\s*olio|all\s*olio|in\s+olio|al\s+naturale|sgocciolat\w*|vasetto|lattina)\b/.test(pNorm) ||
    CANNED_FISH_CREA_IDS.has(pCrea);

  if (wantsRawOrFreshFish && pIsCannedOrDryFish) return false;
  if (wantsCannedFish && !pIsCannedOrDryFish && /\b(fresc\w*|crud\w*|tartare|carpaccio)\b/.test(pNorm)) return false;

  // Smoked vs non-smoked guard
  const bSmoked = /\baffumicat\w*\b/.test(itemNorm) || bCrea === '122410';
  const pSmoked = /\baffumicat\w*\b/.test(pNorm) || pCrea === '122410';
  if (bSmoked !== pSmoked) return false;

  // Fresh meat vs cured meats guard
  const curedRx = /\b(prosciutt\w*|bresaola|salame|mortadella|pancetta|guanciale|speck|affettat\w*|salum\w*)\b/;
  const freshMeatRx = /\b(carne|manzo|bovino|vitell\w*|pollo|tacchino|maiale|suino|coniglio|agnello|macinat\w*)\b/;
  if (freshMeatRx.test(itemNorm) && !curedRx.test(itemNorm) && curedRx.test(pNorm)) return false;
  if (curedRx.test(itemNorm) && !curedRx.test(pNorm) && freshMeatRx.test(pNorm)) return false;

  // Fresh vegetables/tomatoes vs processed passata/pelati/dried guard
  const processedVegRx = /\b(passata|polpa|pelat\w*|concentrato|secch\w*|disidratat\w*|sott\s*olio|sott\s*aceto)\b/;
  if (!processedVegRx.test(itemNorm) && /\b(pomodor\w*|frutta|fungh\w*|verdura)\b/.test(itemNorm) && processedVegRx.test(pNorm)) {
    return false;
  }
  if (processedVegRx.test(itemNorm) && !processedVegRx.test(pNorm) && /\bfresc\w*\b/.test(pNorm)) {
    return false;
  }

  // Wine vs vinegar guard
  if (/\bvino\b/.test(itemNorm) && /\baceto\b/.test(pNorm)) return false;
  if (/\baceto\b/.test(itemNorm) && /\bvino\b/.test(pNorm) && !/\baceto\b/.test(pNorm)) return false;

  if (bCrea && pCrea && bCrea === pCrea) {
    return true;
  }

  const headToken =
    itemNorm.split(' ').find((w) => w.length >= 4 && !STOP_WORDS_BOM.has(w)) || itemNorm.split(' ')[0];
  const headWordRegex = headToken && headToken.length >= 4 ? new RegExp(`\\b${headToken}\\b`, 'i') : null;
  if (headWordRegex && headWordRegex.test(pNorm)) {
    return true;
  }

  return false;
}

const DEFAULT_SEED_PANTRY = [
  {
    id: 'pantry-seed-1',
    title: 'Spaghetti di Semola Rummo',
    brand: 'Rummo',
    zone: 'dry_pantry',
    status: 'closed',
    weightGrams: 500,
    initialWeightGrams: 500,
    remainingWeightGrams: 500,
    remainingFraction: 1.0,
    weightStatus: 'weighed',
    unit: 'g',
    lineTotalEuro: 1.49,
    unitPriceEuro: 1.49,
    tOpenHours: 720,
    openedAt: null,
    closedExpiresAt: null,
    expiresAt: null,
    creaFoodId: '000800',
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  },
  {
    id: 'pantry-seed-2',
    title: 'Olio Extra Vergine di Oliva 100% Italiano',
    brand: 'Monini',
    zone: 'dry_pantry',
    status: 'opened',
    weightGrams: 1000,
    initialWeightGrams: 1000,
    remainingWeightGrams: 650,
    remainingFraction: 0.65,
    weightStatus: 'weighed',
    unit: 'ml',
    lineTotalEuro: 9.9,
    unitPriceEuro: 9.9,
    tOpenHours: 1440,
    openedAt: '2026-10-25T12:00:00.000Z',
    closedExpiresAt: null,
    expiresAt: '2026-12-24T12:00:00.000Z',
    creaFoodId: '009210',
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  },
  {
    id: 'pantry-seed-3',
    title: 'Filetti di Acciughe del Mar Ligure Fresche',
    brand: 'Pescheria Rapallo',
    zone: 'fridge_freezer',
    status: 'opened',
    weightGrams: 300,
    initialWeightGrams: 300,
    remainingWeightGrams: 150,
    remainingFraction: 0.5,
    weightStatus: 'weighed',
    unit: 'g',
    lineTotalEuro: 5.4,
    unitPriceEuro: 5.4,
    tOpenHours: 36,
    openedAt: new Date(Date.now() - 12 * 3600 * 1000).toISOString(),
    closedExpiresAt: null,
    expiresAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
    creaFoodId: '120010',
    sourceReceiptId: null,
    updatedAt: new Date().toISOString()
  },
  {
    id: 'pantry-seed-4',
    title: 'Tonno all\'Olio di Oliva in Vetro',
    brand: 'As do Mar',
    zone: 'boat_cooler',
    status: 'closed',
    weightGrams: 250,
    initialWeightGrams: 250,
    remainingWeightGrams: 250,
    remainingFraction: 1.0,
    weightStatus: 'weighed',
    unit: 'g',
    lineTotalEuro: 4.5,
    unitPriceEuro: 4.5,
    tOpenHours: 72,
    openedAt: null,
    closedExpiresAt: null,
    expiresAt: null,
    creaFoodId: '123610',
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  },
  {
    id: 'pantry-seed-5',
    title: 'Ceci Lessati al Vapore',
    brand: 'Valfrutta',
    zone: 'boat_cooler',
    status: 'closed',
    weightGrams: 400,
    initialWeightGrams: 400,
    remainingWeightGrams: 400,
    remainingFraction: 1.0,
    weightStatus: 'weighed',
    unit: 'g',
    lineTotalEuro: 1.29,
    unitPriceEuro: 1.29,
    tOpenHours: 72,
    openedAt: null,
    closedExpiresAt: null,
    expiresAt: null,
    creaFoodId: null,
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  }
];

function resolveFreshHygieneHoursFromPurchase(title = '', zone = 'dry_pantry') {
  if (zone !== 'fridge_freezer') return null;
  const norm = normalizeSearchToken(title);
  if (
    /\b(pesce|orata|branzino|spigola|acciug\w*|alici|salmone|sgombro|palamita|tonno|tartare|merluzzo|nasello|gamber\w*|scamp\w*|cozz\w*|vongol\w*|calamar\w*|seppi\w*|polpo)\b/.test(
      norm
    ) &&
    !/\b(affumicat\w*|surgelat\w*|sott\s*olio|all\s*olio|in\s+scatola|in\s+vetro)\b/.test(norm)
  ) {
    return 36;
  }
  if (/\b(macinat\w*|hamburger|salsicci\w*|pollo|tacchino)\b/.test(norm) && !/\bsurgelat\w*\b/.test(norm)) {
    return 48;
  }
  return null;
}

function isPantryItemActive(item) {
  if (!item || item.status === 'finished') return false;
  if (item.initialWeightGrams === null || item.weightStatus === 'unweighed') {
    const frac = item.remainingFraction !== undefined && item.remainingFraction !== null ? Number(item.remainingFraction) : 1.0;
    return Number.isFinite(frac) && frac > 0;
  }
  return Number.isFinite(Number(item.remainingWeightGrams)) && Number(item.remainingWeightGrams) > 0;
}

function sanitizeLoadedPantryItem(raw = {}) {
  const title = String(raw.title || 'Articolo Dispensa').trim() || 'Articolo Dispensa';
  const zone = VALID_PANTRY_ZONES.includes(raw.zone) ? raw.zone : inferDefaultZone(title, '');
  const isExplicitlyUnweighed =
    raw.weightStatus === 'unweighed' ||
    (raw.initialWeightGrams === null && (raw.weightGrams === null || raw.weightGrams === undefined));

  let initialWeightGrams = null;
  let remainingWeightGrams = null;
  if (!isExplicitlyUnweighed) {
    const initRaw = Number(raw.initialWeightGrams ?? raw.weightGrams);
    initialWeightGrams = Number.isFinite(initRaw) && initRaw > 0 ? initRaw : null;
    if (initialWeightGrams !== null) {
      const remRaw = Number(raw.remainingWeightGrams);
      remainingWeightGrams =
        raw.remainingWeightGrams !== null && raw.remainingWeightGrams !== undefined && Number.isFinite(remRaw) && remRaw >= 0
          ? remRaw
          : raw.status === 'finished'
            ? 0
            : initialWeightGrams;
    }
  }

  const rawFrac = Number(raw.remainingFraction);
  const remainingFraction =
    raw.status === 'finished'
      ? 0
      : Number.isFinite(rawFrac) && rawFrac >= 0 && rawFrac <= 1
        ? Number(rawFrac.toFixed(2))
        : initialWeightGrams && remainingWeightGrams !== null
          ? Number(Math.min(1, Math.max(0, remainingWeightGrams / initialWeightGrams)).toFixed(2))
          : 1.0;

  const tOpenRaw = Number(raw.tOpenHours);
  const tOpenHours = Number.isFinite(tOpenRaw) && tOpenRaw > 0 ? tOpenRaw : resolveDefaultTOpenHours(title, zone);

  const lineTotalRaw = raw.lineTotalEuro !== undefined && raw.lineTotalEuro !== null ? Number(raw.lineTotalEuro) : NaN;
  const unitPriceRaw = raw.unitPriceEuro !== undefined && raw.unitPriceEuro !== null ? Number(raw.unitPriceEuro) : NaN;

  return {
    ...raw,
    id: String(raw.id || `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    title,
    zone,
    status: raw.status === 'opened' ? 'opened' : raw.status === 'finished' ? 'finished' : 'closed',
    weightGrams: initialWeightGrams,
    initialWeightGrams,
    remainingWeightGrams,
    remainingFraction,
    weightStatus: initialWeightGrams === null ? 'unweighed' : 'weighed',
    unit: raw.unit || (initialWeightGrams === null ? 'pz' : 'g'),
    lineTotalEuro: Number.isFinite(lineTotalRaw) && lineTotalRaw >= 0 ? Number(lineTotalRaw.toFixed(2)) : null,
    unitPriceEuro: Number.isFinite(unitPriceRaw) && unitPriceRaw >= 0 ? Number(unitPriceRaw.toFixed(2)) : null,
    tOpenHours,
    openedAt: raw.openedAt || null,
    closedExpiresAt: raw.closedExpiresAt ?? (raw.status === 'closed' && raw.expiresAt ? raw.expiresAt : null),
    expiresAt: raw.expiresAt || null
  };
}

function parseOptionalIsoTimestamp(val, fieldName) {
  if (val === null || val === undefined || val === '') return null;
  const ms = new Date(val).getTime();
  if (!Number.isFinite(ms)) {
    throwValidationError(`Data non valida per ${fieldName}`);
  }
  return new Date(ms).toISOString();
}

function computeEffectiveOpenedExpiry(openedAtIso, tOpenHours, closedExpiresAtIso = null) {
  const openedMs = new Date(openedAtIso).getTime();
  const openDeadlineMs = openedMs + tOpenHours * 3600 * 1000;
  if (closedExpiresAtIso) {
    const closedMs = new Date(closedExpiresAtIso).getTime();
    if (Number.isFinite(closedMs)) {
      return new Date(Math.min(closedMs, openDeadlineMs)).toISOString();
    }
  }
  return new Date(openDeadlineMs).toISOString();
}

export class PantryService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_PANTRY_PATH || DEFAULT_PANTRY_PATH;
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && Array.isArray(parsed.items)) {
          this._state = {
            appliedReceiptRevisions: Array.isArray(parsed.appliedReceiptRevisions)
              ? parsed.appliedReceiptRevisions
              : [],
            items: parsed.items.filter(Boolean).map((item) => sanitizeLoadedPantryItem(item))
          };
          return this._state;
        }
      }
    } catch (_) {}
    this._state = {
      appliedReceiptRevisions: [],
      items: DEFAULT_SEED_PANTRY.map((i) => ({ ...i }))
    };
    return this._state;
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {}
  }

  _computeRemainingRatio(item) {
    if (!item || item.status === 'finished') return 0;
    if (
      item.initialWeightGrams !== null &&
      item.initialWeightGrams > 0 &&
      item.remainingWeightGrams !== null &&
      item.remainingWeightGrams !== undefined
    ) {
      return Math.min(1, Math.max(0, Number(item.remainingWeightGrams) / Number(item.initialWeightGrams)));
    }
    const frac = item.remainingFraction !== undefined && item.remainingFraction !== null ? Number(item.remainingFraction) : 1.0;
    return Number.isFinite(frac) ? Math.min(1, Math.max(0, frac)) : 1.0;
  }

  _enrichUrgency(item, now = Date.now()) {
    let hoursRemaining = null;
    let urgencyLevel = 'normal';
    let effectiveDeadline = null;
    let deadlineBasis = null;

    if (item.status === 'opened' && item.expiresAt) {
      effectiveDeadline = item.expiresAt;
      deadlineBasis = 'opened_t_open';
    } else if (item.status === 'closed') {
      if (item.closedExpiresAt || item.expiresAt) {
        effectiveDeadline = item.closedExpiresAt || item.expiresAt;
        deadlineBasis = 'commercial_expiry';
      } else if (item.hygieneWindowExpiresAt) {
        effectiveDeadline = item.hygieneWindowExpiresAt;
        deadlineBasis = 'hygiene_purchase_window';
      }
    }

    if (effectiveDeadline) {
      const expMs = new Date(effectiveDeadline).getTime();
      if (Number.isFinite(expMs)) {
        hoursRemaining = Math.round((expMs - now) / (3600 * 1000));
        if (hoursRemaining < -48) urgencyLevel = 'stale_unverified';
        else if (hoursRemaining <= 0) urgencyLevel = 'expired';
        else if (hoursRemaining <= 24) urgencyLevel = 'critical_24h';
        else if (hoursRemaining <= 48) urgencyLevel = 'at_risk_48h';
        else if (hoursRemaining <= 72) urgencyLevel = 'consume_soon';
      }
    }

    const remainingRatio = Number(this._computeRemainingRatio(item).toFixed(4));
    const baseEuro =
      item.lineTotalEuro !== null && item.lineTotalEuro !== undefined && Number.isFinite(Number(item.lineTotalEuro))
        ? Number(item.lineTotalEuro)
        : null;
    const currentValueEuro =
      baseEuro !== null && baseEuro > 0 ? Number((baseEuro * remainingRatio).toFixed(2)) : baseEuro === 0 ? 0 : null;

    return {
      ...item,
      remainingFraction: Number(remainingRatio.toFixed(2)),
      currentValueEuro,
      effectiveDeadline,
      deadlineBasis,
      hoursRemaining,
      urgencyLevel
    };
  }

  /**
   * Computes deterministic Value-at-Risk within 48h (`VaR_48h`) across BOTH `opened` items
   * (`T_open`) AND `closed` fresh perishables (`closedExpiresAt` or `hygieneWindowExpiresAt`).
   * Strictly respects ADR-0006: zero synthetic prices and zero synthetic `250g` weights!
   */
  getValueAtRisk48h(options = {}) {
    const horizonHours = Number.isFinite(Number(options.horizonHours)) && Number(options.horizonHours) > 0
      ? Number(options.horizonHours)
      : 48;
    const now = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const state = this._load();

    const activeEnriched = state.items
      .filter((i) => isPantryItemActive(i))
      .map((i) => this._enrichUrgency(i, now));

    const atRiskItems = [];
    const staleUnverifiedItems = [];
    let totalAtRiskEuro = 0;
    let expiredAtRiskEuro = 0;
    let imminentAtRiskEuro = 0;
    let unpricedAtRiskCount = 0;

    for (const item of activeEnriched) {
      if (item.hoursRemaining === null) continue;

      if (item.hoursRemaining < -48) {
        staleUnverifiedItems.push({
          id: item.id,
          title: item.title,
          zone: item.zone,
          status: item.status,
          weightGrams: item.remainingWeightGrams,
          remainingFraction: item.remainingFraction,
          currentValueEuro: item.currentValueEuro,
          hoursRemaining: item.hoursRemaining,
          deadlineBasis: item.deadlineBasis
        });
        continue;
      }

      if (item.hoursRemaining <= horizonHours) {
        const atRiskEuro = item.currentValueEuro;
        if (atRiskEuro !== null && atRiskEuro > 0) {
          totalAtRiskEuro += atRiskEuro;
          if (item.hoursRemaining <= 0) {
            expiredAtRiskEuro += atRiskEuro;
          } else {
            imminentAtRiskEuro += atRiskEuro;
          }
        } else if (atRiskEuro === null) {
          unpricedAtRiskCount += 1;
        }

        atRiskItems.push({
          id: item.id,
          title: item.title,
          brand: item.brand || null,
          zone: item.zone,
          status: item.status,
          creaFoodId: item.creaFoodId || null,
          weightStatus: item.weightStatus || (item.initialWeightGrams === null ? 'unweighed' : 'weighed'),
          remainingWeightGrams: item.remainingWeightGrams,
          remainingFraction: item.remainingFraction,
          unit: item.unit,
          lineTotalEuro: item.lineTotalEuro ?? null,
          atRiskEuro,
          hoursRemaining: item.hoursRemaining,
          urgencyLevel: item.urgencyLevel,
          effectiveDeadline: item.effectiveDeadline,
          deadlineBasis: item.deadlineBasis
        });
      }
    }

    atRiskItems.sort((a, b) => {
      const aVal = a.atRiskEuro ?? -1;
      const bVal = b.atRiskEuro ?? -1;
      if (bVal !== aVal) return bVal - aVal;
      return (a.hoursRemaining ?? 999) - (b.hoursRemaining ?? 999);
    });

    return {
      horizonHours,
      totalAtRiskEuro: Number(totalAtRiskEuro.toFixed(2)),
      expiredAtRiskEuro: Number(expiredAtRiskEuro.toFixed(2)),
      imminentAtRiskEuro: Number(imminentAtRiskEuro.toFixed(2)),
      atRiskItemsCount: atRiskItems.length,
      unpricedAtRiskCount,
      atRiskItems,
      staleUnverifiedItems
    };
  }

  getPantryState(filters = {}) {
    const state = this._load();
    let items = state.items
      .filter((i) => isPantryItemActive(i))
      .map((i) => this._enrichUrgency(i));

    if (filters.zone && VALID_PANTRY_ZONES.includes(filters.zone)) {
      items = items.filter((i) => i.zone === filters.zone);
    }

    // Sort urgent items (opened or expiring closed perishables) with shortest remaining window first
    items.sort((a, b) => {
      const aUrgent = a.hoursRemaining !== null && a.hoursRemaining >= -48 && a.hoursRemaining <= 96 ? 0 : 1;
      const bUrgent = b.hoursRemaining !== null && b.hoursRemaining >= -48 && b.hoursRemaining <= 96 ? 0 : 1;
      if (aUrgent !== bUrgent) return aUrgent - bUrgent;
      if (a.hoursRemaining !== null && b.hoursRemaining !== null) {
        return a.hoursRemaining - b.hoursRemaining;
      }
      return a.title.localeCompare(b.title, 'it');
    });

    const openedPriorityAlerts = items.filter(
      (i) =>
        (i.status === 'opened' || i.zone === 'fridge_freezer') &&
        i.hoursRemaining !== null &&
        i.hoursRemaining >= -48 &&
        i.hoursRemaining <= 96
    );

    const byZone = {
      dry_pantry: items.filter((i) => i.zone === 'dry_pantry'),
      fridge_freezer: items.filter((i) => i.zone === 'fridge_freezer'),
      boat_cooler: items.filter((i) => i.zone === 'boat_cooler')
    };

    return {
      items,
      byZone,
      openedPriorityAlerts,
      valueAtRisk48h: this.getValueAtRisk48h(),
      totalItems: items.length
    };
  }

  addItem(payload = {}) {
    const title = String(payload.title || '').trim();
    if (!title) {
      throwValidationError('Titolo articolo dispensa obbligatorio');
    }
    const zone = VALID_PANTRY_ZONES.includes(payload.zone)
      ? payload.zone
      : inferDefaultZone(title, payload.category || '');

    const hasExplicitNullWeight =
      (payload.weightGrams === null && payload.initialWeightGrams === undefined) ||
      payload.initialWeightGrams === null ||
      payload.weightStatus === 'unweighed';

    let initialWeightGrams = null;
    const rawInitWeight = payload.initialWeightGrams ?? payload.weightGrams;
    if (!hasExplicitNullWeight) {
      if (rawInitWeight !== undefined && rawInitWeight !== null && rawInitWeight !== '') {
        const parsedInit = Number(rawInitWeight);
        if (!Number.isFinite(parsedInit) || parsedInit <= 0) {
          throwValidationError('Peso iniziale dispensa non valido: inserire un numero > 0');
        }
        initialWeightGrams = Number(parsedInit.toFixed(1));
      } else {
        const extracted = extractPackMetrics({ title });
        const fromTitle = extracted.packVolumeMl || extracted.packWeightGrams || null;
        initialWeightGrams = fromTitle && fromTitle > 0 ? Number(fromTitle.toFixed(1)) : null;
      }
    }

    let remainingWeightGrams = initialWeightGrams;
    if (
      initialWeightGrams !== null &&
      payload.remainingWeightGrams !== undefined &&
      payload.remainingWeightGrams !== null &&
      payload.remainingWeightGrams !== ''
    ) {
      const parsedRem = Number(payload.remainingWeightGrams);
      if (!Number.isFinite(parsedRem) || parsedRem < 0) {
        throwValidationError('Peso residuo dispensa non valido: inserire un numero >= 0');
      }
      remainingWeightGrams = Number(parsedRem.toFixed(1));
    }

    let remainingFraction = 1.0;
    if (payload.remainingFraction !== undefined && payload.remainingFraction !== null && payload.remainingFraction !== '') {
      const parsedFrac = Number(payload.remainingFraction);
      if (!Number.isFinite(parsedFrac) || parsedFrac < 0 || parsedFrac > 1) {
        throwValidationError('Frazione residua (remainingFraction) non valida: inserire un valore tra 0 e 1');
      }
      remainingFraction = Number(parsedFrac.toFixed(2));
    } else if (initialWeightGrams !== null && initialWeightGrams > 0 && remainingWeightGrams !== null) {
      remainingFraction = Number(Math.min(1, Math.max(0, remainingWeightGrams / initialWeightGrams)).toFixed(2));
    }

    let lineTotalEuro = null;
    const rawLineEur = payload.lineTotalEuro ?? payload.purchasePriceEur;
    if (rawLineEur !== undefined && rawLineEur !== null && rawLineEur !== '') {
      const parsedEur = Number(rawLineEur);
      if (!Number.isFinite(parsedEur) || parsedEur < 0) {
        throwValidationError('Importo riga dispensa (lineTotalEuro) non valido');
      }
      lineTotalEuro = Number(parsedEur.toFixed(2));
    }

    let unitPriceEuro = null;
    const rawUnitEur = payload.unitPriceEuro;
    if (rawUnitEur !== undefined && rawUnitEur !== null && rawUnitEur !== '') {
      const parsedUnitEur = Number(rawUnitEur);
      if (!Number.isFinite(parsedUnitEur) || parsedUnitEur < 0) {
        throwValidationError('Prezzo unitario dispensa (unitPriceEuro) non valido');
      }
      unitPriceEuro = Number(parsedUnitEur.toFixed(2));
    } else if (lineTotalEuro !== null) {
      unitPriceEuro = lineTotalEuro;
    }

    let tOpenHours = resolveDefaultTOpenHours(title, zone);
    if (payload.tOpenHours !== undefined && payload.tOpenHours !== null && payload.tOpenHours !== '') {
      const parsedTOpen = Number(payload.tOpenHours);
      if (!Number.isFinite(parsedTOpen) || parsedTOpen <= 0) {
        throwValidationError('Finestra T_open non valida: inserire ore > 0');
      }
      tOpenHours = parsedTOpen;
    }

    const status = payload.status === 'opened' ? 'opened' : payload.status === 'finished' ? 'finished' : 'closed';
    const nowIso = new Date().toISOString();
    const explicitClosedExpiry = parseOptionalIsoTimestamp(
      payload.closedExpiresAt ?? (status === 'closed' ? payload.expiresAt : null),
      'closedExpiresAt'
    );
    const explicitOpenedExpiry =
      status === 'opened' && payload.expiresAt && !payload.closedExpiresAt
        ? parseOptionalIsoTimestamp(payload.expiresAt, 'expiresAt')
        : null;
    const hygieneWindowExpiresAt = parseOptionalIsoTimestamp(
      payload.hygieneWindowExpiresAt || null,
      'hygieneWindowExpiresAt'
    );

    const openedAt = status === 'opened' ? parseOptionalIsoTimestamp(payload.openedAt, 'openedAt') || nowIso : null;

    // SPEC-05: closed items retain their commercial expiry (`closedExpiresAt` & `expiresAt` if provided);
    // opened items enforce min(closedExpiresAt, openedAt + T_open).
    let expiresAt = null;
    if (status === 'opened') {
      if (explicitOpenedExpiry && explicitClosedExpiry) {
        expiresAt = new Date(
          Math.min(new Date(explicitOpenedExpiry).getTime(), new Date(explicitClosedExpiry).getTime())
        ).toISOString();
      } else if (explicitOpenedExpiry) {
        expiresAt = explicitOpenedExpiry;
      } else {
        expiresAt = computeEffectiveOpenedExpiry(openedAt, tOpenHours, explicitClosedExpiry);
      }
    } else {
      expiresAt = explicitClosedExpiry;
    }

    const newItem = {
      id: payload.id || `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      brand: payload.brand ? String(payload.brand).trim() : null,
      zone,
      status,
      weightGrams: initialWeightGrams,
      initialWeightGrams,
      remainingWeightGrams,
      remainingFraction,
      weightStatus: initialWeightGrams === null ? 'unweighed' : 'weighed',
      unit: payload.unit || (initialWeightGrams === null ? 'pz' : 'g'),
      lineTotalEuro,
      unitPriceEuro,
      tOpenHours,
      openedAt,
      closedExpiresAt: explicitClosedExpiry,
      hygieneWindowExpiresAt,
      expiresAt,
      creaFoodId: payload.creaFoodId || null,
      sourceReceiptId: payload.sourceReceiptId || null,
      updatedAt: nowIso
    };

    const state = this._load();
    state.items.unshift(newItem);
    this._save();
    return this._enrichUrgency(newItem);
  }

  upsertItem(payload = {}) {
    return this.addItem(payload);
  }

  /**
   * Opens a package or consumes a specific weight in grams (`gramsUsed` / `consumedGrams`).
   * Automatically transitions a closed package to 'opened' and starts the T_open clock
   * clamped to `min(closedExpiresAt, openedAt + T_open)` (`SPEC-05`).
   */
  consumeOrOpenItem(itemId, options = {}) {
    const state = this._load();
    const item = state.items.find((i) => i.id === itemId);
    if (!item) {
      const err = new Error(`Articolo dispensa non trovato: ${itemId}`);
      err.status = 404;
      throw err;
    }

    const now = new Date();
    let gramsUsed = 0;
    const rawGramsInput = options.gramsUsed ?? options.consumedGrams;
    if (rawGramsInput !== undefined && rawGramsInput !== null && rawGramsInput !== '') {
      const parsedGrams = Number(rawGramsInput);
      if (!Number.isFinite(parsedGrams) || parsedGrams < 0) {
        throwValidationError('Quantità consumata (gramsUsed) non valida: inserire un numero >= 0');
      }
      gramsUsed = parsedGrams;
    }

    const markFinished = Boolean(options.markFinished);

    if (markFinished) {
      if (item.initialWeightGrams !== null) {
        item.remainingWeightGrams = 0;
      }
      item.remainingFraction = 0;
      item.status = 'finished';
      item.updatedAt = now.toISOString();
      this._save();
      return this._enrichUrgency(item);
    }

    if (gramsUsed > 0 && item.initialWeightGrams !== null && item.remainingWeightGrams !== null) {
      item.remainingWeightGrams = Math.max(0, Number((item.remainingWeightGrams - gramsUsed).toFixed(1)));
      item.remainingFraction = Number(
        Math.min(1, Math.max(0, item.remainingWeightGrams / item.initialWeightGrams)).toFixed(2)
      );
      if (item.remainingWeightGrams <= 0) {
        item.remainingFraction = 0;
        item.status = 'finished';
        item.updatedAt = now.toISOString();
        this._save();
        return this._enrichUrgency(item);
      }
    }

    const stillHasStock =
      item.initialWeightGrams === null
        ? Number(item.remainingFraction ?? 1) > 0
        : Number(item.remainingWeightGrams) > 0;

    if (stillHasStock && (item.status === 'closed' || options.openNow)) {
      const priorClosedExpiry =
        item.closedExpiresAt || (item.status === 'closed' && item.expiresAt ? item.expiresAt : null);
      if (priorClosedExpiry && !item.closedExpiresAt) {
        item.closedExpiresAt = priorClosedExpiry;
      }
      item.status = 'opened';
      if (!item.openedAt) {
        item.openedAt = now.toISOString();
      }
      const tOpen = item.tOpenHours || resolveDefaultTOpenHours(item.title, item.zone);
      item.expiresAt = computeEffectiveOpenedExpiry(item.openedAt, tOpen, item.closedExpiresAt);
    }

    if (options.targetZone && VALID_PANTRY_ZONES.includes(options.targetZone)) {
      item.zone = options.targetZone;
    }

    item.updatedAt = now.toISOString();
    this._save();
    return this._enrichUrgency(item);
  }

  openItem(itemId, options = {}) {
    return this.consumeOrOpenItem(itemId, { ...options, openNow: true });
  }

  /**
   * 5-second Swipe Check updater (`1.0` = Integro, `0.5` = Aperto/Metà, `0` = Finito/Smaltito).
   * Works seamlessly on BOTH weighed and unweighed (`weightGrams: null`) pantry items!
   */
  applyQuickFractionUpdate(itemId, fraction, options = {}) {
    const parsedFrac = Number(fraction);
    if (!Number.isFinite(parsedFrac) || parsedFrac < 0 || parsedFrac > 1) {
      throwValidationError('Frazione (fraction) non valida: inserire un numero compreso tra 0 e 1 (es. 1.0, 0.5, 0)');
    }

    const state = this._load();
    const item = state.items.find((i) => i.id === itemId);
    if (!item) {
      const err = new Error(`Articolo dispensa non trovato: ${itemId}`);
      err.status = 404;
      throw err;
    }

    const now = new Date();
    const normFrac = Number(parsedFrac.toFixed(2));
    const prevFrac = this._computeRemainingRatio(item);
    item.remainingFraction = normFrac;

    if (item.initialWeightGrams !== null && item.initialWeightGrams > 0) {
      item.remainingWeightGrams = Number((item.initialWeightGrams * normFrac).toFixed(1));
    }

    if (normFrac === 0) {
      item.status = 'finished';
      item.disposalReason = options.reason === 'discarded_waste' ? 'discarded_waste' : 'consumed';
      if (item.disposalReason === 'discarded_waste' && item.lineTotalEuro != null) {
        item.wastedEuro = Number((Number(item.lineTotalEuro) * prevFrac).toFixed(2));
      }
    } else if (normFrac < 1.0) {
      const priorClosedExpiry =
        item.closedExpiresAt || (item.status === 'closed' && item.expiresAt ? item.expiresAt : null);
      if (priorClosedExpiry && !item.closedExpiresAt) {
        item.closedExpiresAt = priorClosedExpiry;
      }
      item.status = 'opened';
      if (!item.openedAt) {
        item.openedAt = now.toISOString();
      }
      const tOpen = item.tOpenHours || resolveDefaultTOpenHours(item.title, item.zone);
      item.expiresAt = computeEffectiveOpenedExpiry(item.openedAt, tOpen, item.closedExpiresAt);
    }

    item.updatedAt = now.toISOString();
    this._save();
    return {
      item: this._enrichUrgency(item),
      valueAtRisk48h: this.getValueAtRisk48h()
    };
  }

  /**
   * Idempotent batch transfer of confirmed receipt lines into the user's pantry.
   * Preserves real `lineTotalEuro` & `unitPriceEuro` for VaR accounting and eliminates synthetic `: 250` fallback (`ADR-0006`).
   */
  transferReceiptLinesToPantry(receiptId, revisionKey, lines = [], options = {}) {
    const state = this._load();
    const rev = `${receiptId}:${revisionKey || 'v1'}`;
    if (state.appliedReceiptRevisions.includes(rev)) {
      return {
        alreadyApplied: true,
        revisionKey: rev,
        addedItems: []
      };
    }

    const purchasedMs = options.purchasedAt ? new Date(options.purchasedAt).getTime() : Date.now();
    const basePurchaseMs = Number.isFinite(purchasedMs) ? purchasedMs : Date.now();

    const addedItems = [];
    for (const line of lines) {
      if (line.addToPantry === false) continue;
      // Only add human food items to pantry
      if (line.domain && line.domain !== 'food_human') continue;

      const qty = Number.isFinite(Number(line.quantity)) && Number(line.quantity) > 0 ? Number(line.quantity) : 1;
      const titleMetrics = extractPackMetrics({ title: String(line.title || '') });
      const unitStr = String(line.unitString || '').trim();

      // Detect whether `packWeightGrams === 250 * qty` came solely from `receiptService`'s legacy '1 pz' fallback
      const isLegacySynthetic250 =
        unitStr === '1 pz' &&
        !line.explicitWeightGrams &&
        !titleMetrics.packWeightGrams &&
        !titleMetrics.packVolumeMl &&
        Number(line.packWeightGrams) === Math.round(250 * qty);

      let parsedWeight = null;
      if (Number.isFinite(Number(line.packVolumeMl)) && Number(line.packVolumeMl) > 0) {
        parsedWeight = Number(line.packVolumeMl);
      } else if (Number.isFinite(Number(line.explicitWeightGrams)) && Number(line.explicitWeightGrams) > 0) {
        parsedWeight = Number(line.explicitWeightGrams);
      } else if (
        !isLegacySynthetic250 &&
        Number.isFinite(Number(line.packWeightGrams)) &&
        Number(line.packWeightGrams) > 0
      ) {
        parsedWeight = Number(line.packWeightGrams);
      } else if (titleMetrics.packVolumeMl || titleMetrics.packWeightGrams) {
        parsedWeight = (titleMetrics.packVolumeMl || titleMetrics.packWeightGrams) * qty;
      }

      const targetZone = line.targetZone || inferDefaultZone(line.title, line.category || '');
      const freshHygieneHours = resolveFreshHygieneHoursFromPurchase(line.title || '', targetZone);
      const hygieneWindowExpiresAt =
        freshHygieneHours && !line.closedExpiresAt
          ? new Date(basePurchaseMs + freshHygieneHours * 3600 * 1000).toISOString()
          : null;

      const rawLineTotal = line.lineTotalEuro ?? line.lineTotal;
      const rawUnitPrice = line.unitPriceEuro ?? line.unitPrice;
      const lineTotalEuro =
        rawLineTotal !== undefined && rawLineTotal !== null && Number.isFinite(Number(rawLineTotal))
          ? Number(Number(rawLineTotal).toFixed(2))
          : null;
      const unitPriceEuro =
        rawUnitPrice !== undefined && rawUnitPrice !== null && Number.isFinite(Number(rawUnitPrice))
          ? Number(Number(rawUnitPrice).toFixed(2))
          : lineTotalEuro !== null
            ? Number((lineTotalEuro / qty).toFixed(2))
            : null;

      const added = this.addItem({
        title: line.title,
        brand: line.brand || null,
        zone: targetZone,
        weightGrams: parsedWeight || null,
        initialWeightGrams: parsedWeight || null,
        remainingWeightGrams: parsedWeight || null,
        remainingFraction: 1.0,
        unit: line.packVolumeMl ? 'ml' : parsedWeight ? 'g' : 'pz',
        lineTotalEuro,
        unitPriceEuro,
        closedExpiresAt: line.closedExpiresAt || null,
        hygieneWindowExpiresAt,
        sourceReceiptId: receiptId
      });
      addedItems.push(added);
    }

    state.appliedReceiptRevisions.push(rev);
    this._save();

    return {
      alreadyApplied: false,
      revisionKey: rev,
      addedItems
    };
  }

  /**
   * Post-cooking pantry deduction ("Ho cucinato questo piatto"):
   * Deducts the dish BOM weights from matching pantry items (prioritizing already-opened packages)
   * with strict CREA-ID and raw-vs-canned physical state guards, and automatically starts
   * the T_open perishable conservation clock on newly opened packages.
   */
  consumeDishIngredients(payload = {}) {
    const state = this._load();

    let servings = 1;
    if (payload.servings !== undefined && payload.servings !== null && payload.servings !== '') {
      const parsedServings = Number(payload.servings);
      if (!Number.isFinite(parsedServings) || parsedServings <= 0) {
        throwValidationError('Numero porzioni (servings) non valido: inserire un numero > 0');
      }
      servings = parsedServings;
    }

    const bom = Array.isArray(payload.bom) ? payload.bom : [];
    const deductedItems = [];
    const missingIngredients = [];

    for (const b of bom) {
      if (!b || b.isSubstitutedComposite) continue;

      let remainingNeed = Number(
        b.rawGramsTotal != null ? b.rawGramsTotal : Number(b.rawGramsPerServing || 0) * servings
      );
      if (!Number.isFinite(remainingNeed) || remainingNeed <= 0) continue;

      // Sort candidates so already-opened packages are consumed before closed packages
      const candidates = state.items
        .filter((p) => isPantryItemCompatibleWithBom(b, p))
        .sort((x, y) => (x.status === 'opened' ? -1 : 1) - (y.status === 'opened' ? -1 : 1));

      for (const cand of candidates) {
        if (remainingNeed <= 0) break;
        const wasClosed = cand.status === 'closed';
        const takeGrams = Number(Math.min(cand.remainingWeightGrams, remainingNeed).toFixed(1));
        if (takeGrams <= 0) continue;
        const willFinish = takeGrams >= cand.remainingWeightGrams;
        const updated = this.consumeOrOpenItem(cand.id, {
          gramsUsed: takeGrams,
          markFinished: willFinish
        });
        remainingNeed = Number(Math.max(0, remainingNeed - takeGrams).toFixed(1));
        deductedItems.push({
          pantryItemId: updated.id,
          title: updated.title,
          zone: updated.zone,
          ingredientName: b.name,
          gramsDeducted: takeGrams,
          remainingAfterGrams: updated.remainingWeightGrams,
          statusAfter: updated.status,
          tOpenNewlyActivated: wasClosed && updated.status === 'opened',
          expiresAt: updated.expiresAt,
          hoursRemaining: updated.hoursRemaining
        });
      }

      if (remainingNeed > 0.5) {
        missingIngredients.push({
          name: b.name,
          creaId: b.creaId || null,
          unmatchedGrams: remainingNeed
        });
      }
    }

    return {
      dishId: payload.dishId || null,
      dishTitle: payload.dishTitle || null,
      servings,
      deductedCount: deductedItems.length,
      deductedItems,
      missingIngredients,
      ...this.getPantryState()
    };
  }
}

export const pantryService = new PantryService();
export default pantryService;
