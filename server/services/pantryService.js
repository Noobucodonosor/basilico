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
    initialWeightGrams: 500,
    remainingWeightGrams: 500,
    unit: 'g',
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
    initialWeightGrams: 1000,
    remainingWeightGrams: 650,
    unit: 'ml',
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
    initialWeightGrams: 300,
    remainingWeightGrams: 150,
    unit: 'g',
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
    initialWeightGrams: 250,
    remainingWeightGrams: 250,
    unit: 'g',
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
    initialWeightGrams: 400,
    remainingWeightGrams: 400,
    unit: 'g',
    tOpenHours: 72,
    openedAt: null,
    closedExpiresAt: null,
    expiresAt: null,
    creaFoodId: null,
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  }
];

function sanitizeLoadedPantryItem(raw = {}) {
  const title = String(raw.title || 'Articolo Dispensa').trim() || 'Articolo Dispensa';
  const zone = VALID_PANTRY_ZONES.includes(raw.zone) ? raw.zone : inferDefaultZone(title, '');
  const initRaw = Number(raw.initialWeightGrams);
  const initialWeightGrams = Number.isFinite(initRaw) && initRaw > 0 ? initRaw : 250;
  const remRaw = Number(raw.remainingWeightGrams);
  const remainingWeightGrams =
    raw.remainingWeightGrams !== null && raw.remainingWeightGrams !== undefined && Number.isFinite(remRaw) && remRaw >= 0
      ? remRaw
      : raw.status === 'finished'
        ? 0
        : initialWeightGrams;
  const tOpenRaw = Number(raw.tOpenHours);
  const tOpenHours = Number.isFinite(tOpenRaw) && tOpenRaw > 0 ? tOpenRaw : resolveDefaultTOpenHours(title, zone);

  return {
    ...raw,
    id: String(raw.id || `pantry-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`),
    title,
    zone,
    status: raw.status === 'opened' ? 'opened' : raw.status === 'finished' ? 'finished' : 'closed',
    initialWeightGrams,
    remainingWeightGrams,
    unit: raw.unit || 'g',
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

  _enrichUrgency(item) {
    const now = Date.now();
    let hoursRemaining = null;
    let urgencyLevel = 'normal';

    if (item.status === 'opened' && item.expiresAt) {
      const expMs = new Date(item.expiresAt).getTime();
      if (Number.isFinite(expMs)) {
        hoursRemaining = Math.round((expMs - now) / (3600 * 1000));
        if (hoursRemaining <= 0) urgencyLevel = 'expired';
        else if (hoursRemaining <= 24) urgencyLevel = 'critical_24h';
        else if (hoursRemaining <= 72) urgencyLevel = 'consume_soon';
      }
    }

    return {
      ...item,
      hoursRemaining,
      urgencyLevel
    };
  }

  getPantryState(filters = {}) {
    const state = this._load();
    let items = state.items
      .filter((i) => Number.isFinite(Number(i.remainingWeightGrams)) && Number(i.remainingWeightGrams) > 0)
      .map((i) => this._enrichUrgency(i));

    if (filters.zone && VALID_PANTRY_ZONES.includes(filters.zone)) {
      items = items.filter((i) => i.zone === filters.zone);
    }

    // Sort opened items with shortest remaining window first
    items.sort((a, b) => {
      const aOpen = a.status === 'opened' && a.hoursRemaining !== null && a.hoursRemaining <= 96 ? 0 : 1;
      const bOpen = b.status === 'opened' && b.hoursRemaining !== null && b.hoursRemaining <= 96 ? 0 : 1;
      if (aOpen !== bOpen) return aOpen - bOpen;
      if (a.hoursRemaining !== null && b.hoursRemaining !== null) {
        return a.hoursRemaining - b.hoursRemaining;
      }
      return a.title.localeCompare(b.title, 'it');
    });

    const openedPriorityAlerts = items.filter(
      (i) => i.status === 'opened' && i.hoursRemaining !== null && i.hoursRemaining <= 96
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

    let initialWeightGrams = 250;
    const rawInitWeight = payload.initialWeightGrams ?? payload.weightGrams;
    if (rawInitWeight !== undefined && rawInitWeight !== null && rawInitWeight !== '') {
      const parsedInit = Number(rawInitWeight);
      if (!Number.isFinite(parsedInit) || parsedInit <= 0) {
        throwValidationError('Peso iniziale dispensa non valido: inserire un numero > 0');
      }
      initialWeightGrams = Number(parsedInit.toFixed(1));
    }

    let remainingWeightGrams = initialWeightGrams;
    if (payload.remainingWeightGrams !== undefined && payload.remainingWeightGrams !== null && payload.remainingWeightGrams !== '') {
      const parsedRem = Number(payload.remainingWeightGrams);
      if (!Number.isFinite(parsedRem) || parsedRem < 0) {
        throwValidationError('Peso residuo dispensa non valido: inserire un numero >= 0');
      }
      remainingWeightGrams = Number(parsedRem.toFixed(1));
    }

    let tOpenHours = resolveDefaultTOpenHours(title, zone);
    if (payload.tOpenHours !== undefined && payload.tOpenHours !== null && payload.tOpenHours !== '') {
      const parsedTOpen = Number(payload.tOpenHours);
      if (!Number.isFinite(parsedTOpen) || parsedTOpen <= 0) {
        throwValidationError('Finestra T_open non valida: inserire ore > 0');
      }
      tOpenHours = parsedTOpen;
    }

    const status = payload.status === 'opened' ? 'opened' : 'closed';
    const nowIso = new Date().toISOString();
    const explicitClosedExpiry = parseOptionalIsoTimestamp(
      payload.closedExpiresAt ?? (status === 'closed' ? payload.expiresAt : null),
      'closedExpiresAt'
    );
    const explicitOpenedExpiry =
      status === 'opened' && payload.expiresAt && !payload.closedExpiresAt
        ? parseOptionalIsoTimestamp(payload.expiresAt, 'expiresAt')
        : null;

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
      initialWeightGrams,
      remainingWeightGrams,
      unit: payload.unit || 'g',
      tOpenHours,
      openedAt,
      closedExpiresAt: explicitClosedExpiry,
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
   * Opens a package or consumes a specific weight in grams (`gramsUsed`).
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
    if (options.gramsUsed !== undefined && options.gramsUsed !== null && options.gramsUsed !== '') {
      const parsedGrams = Number(options.gramsUsed);
      if (!Number.isFinite(parsedGrams) || parsedGrams < 0) {
        throwValidationError('Quantità consumata (gramsUsed) non valida: inserire un numero >= 0');
      }
      gramsUsed = parsedGrams;
    }

    const markFinished = Boolean(options.markFinished);

    if (markFinished) {
      item.remainingWeightGrams = 0;
      item.status = 'finished';
      item.updatedAt = now.toISOString();
      this._save();
      return this._enrichUrgency(item);
    }

    if (gramsUsed > 0) {
      item.remainingWeightGrams = Math.max(0, Number((item.remainingWeightGrams - gramsUsed).toFixed(1)));
      if (item.remainingWeightGrams <= 0) {
        item.status = 'finished';
        item.updatedAt = now.toISOString();
        this._save();
        return this._enrichUrgency(item);
      }
    }

    if (item.remainingWeightGrams > 0 && (item.status === 'closed' || options.openNow)) {
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
   * Idempotent batch transfer of confirmed receipt lines into the user's pantry.
   */
  transferReceiptLinesToPantry(receiptId, revisionKey, lines = []) {
    const state = this._load();
    const rev = `${receiptId}:${revisionKey || 'v1'}`;
    if (state.appliedReceiptRevisions.includes(rev)) {
      return {
        alreadyApplied: true,
        revisionKey: rev,
        addedItems: []
      };
    }

    const addedItems = [];
    for (const line of lines) {
      if (line.addToPantry === false) continue;
      // Only add human food items to pantry
      if (line.domain && line.domain !== 'food_human') continue;

      const resolvedQtyWeight =
        Number.isFinite(Number(line.packVolumeMl)) && Number(line.packVolumeMl) > 0
          ? Number(line.packVolumeMl)
          : Number.isFinite(Number(line.packWeightGrams)) && Number(line.packWeightGrams) > 0
            ? Number(line.packWeightGrams)
            : 250;

      const added = this.addItem({
        title: line.title,
        brand: line.brand || null,
        zone: line.targetZone || inferDefaultZone(line.title, line.category || ''),
        initialWeightGrams: resolvedQtyWeight,
        remainingWeightGrams: resolvedQtyWeight,
        unit: line.packVolumeMl ? 'ml' : 'g',
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
