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
 *  - When a package is opened (`openPackage(id, gramsUsed)`), state becomes 'opened',
 *    `openedAt` is stamped, and `expiresAt` is set to `openedAt + T_open_hours`.
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

// Typical conservation window T_open (in hours) once a package is opened
export function resolveDefaultTOpenHours(title = '', zone = 'dry_pantry') {
  const norm = normalizeSearchToken(title);
  if (/\b(pesce|orata|branzino|acciughe|alici|salmone|merluzzo|gamberi|cozze|vongole)\b/.test(norm)) {
    return 36; // 36h for fresh fish
  }
  if (/\b(pollo|tacchino|macinato|bovino|manzo|carne)\b/.test(norm)) {
    return 48; // 48h for fresh meat
  }
  if (/\b(insalata|spinaci|bietole|zucchine|pomodor\w*|verdura|broccol\w*)\b/.test(norm)) {
    return 72; // 72h for fresh greens/cut vegetables
  }
  if (/\b(passata|pesto|sugo|latte|yogurt|tonno|ceci|fagioli|lenticchie)\b/.test(norm)) {
    return 96; // 4 days in fridge once opened
  }
  if (zone === 'fridge_freezer' || zone === 'boat_cooler') {
    return 72;
  }
  return 720; // 30 days for dry pantry items (pasta, rice, oil)
}

export function inferDefaultZone(title = '', category = '') {
  const norm = normalizeSearchToken(`${title} ${category}`);
  if (/\b(barca|cambusa| galletta|gallette|sgombro|tonno in scatola|tonno all olio)\b/.test(norm)) {
    return 'boat_cooler';
  }
  if (/\b(fresc\w*|pesce|carne|pollo|tacchino|orata|branzino|salmone|acciughe|spinaci|insalata|zucchine|pomodori|uova|latte|yogurt|surgelat\w*)\b/.test(norm)) {
    return 'fridge_freezer';
  }
  return 'dry_pantry';
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
    expiresAt: null,
    creaFoodId: '000080',
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
    expiresAt: '2026-12-24T12:00:00.000Z',
    creaFoodId: '009010',
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
    expiresAt: null,
    creaFoodId: null,
    sourceReceiptId: null,
    updatedAt: '2026-11-08T10:00:00.000Z'
  }
];

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
          this._state = parsed;
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
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
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
      hoursRemaining = Math.round((expMs - now) / (3600 * 1000));
      if (hoursRemaining <= 0) urgencyLevel = 'expired';
      else if (hoursRemaining <= 24) urgencyLevel = 'critical_24h';
      else if (hoursRemaining <= 72) urgencyLevel = 'consume_soon';
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
      .filter((i) => i.remainingWeightGrams > 0)
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
      const err = new Error('Titolo articolo dispensa obbligatorio');
      err.status = 400;
      throw err;
    }
    const zone = VALID_PANTRY_ZONES.includes(payload.zone)
      ? payload.zone
      : inferDefaultZone(title, payload.category || '');
    const initialWeightGrams = Math.max(1, Number(payload.initialWeightGrams ?? payload.weightGrams ?? 250));
    const remainingWeightGrams = Math.max(
      0,
      Number(payload.remainingWeightGrams ?? initialWeightGrams)
    );
    const tOpenHours = Number(payload.tOpenHours) > 0
      ? Number(payload.tOpenHours)
      : resolveDefaultTOpenHours(title, zone);

    const status = payload.status === 'opened' ? 'opened' : 'closed';
    const nowIso = new Date().toISOString();
    const openedAt = status === 'opened' ? (payload.openedAt || nowIso) : null;
    const expiresAt = status === 'opened'
      ? (payload.expiresAt || new Date(new Date(openedAt).getTime() + tOpenHours * 3600 * 1000).toISOString())
      : null;

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

  /**
   * Opens a package or consumes a specific weight in grams (`gramsUsed`).
   * Automatically transitions a closed package to 'opened' and starts the T_open clock.
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
    const gramsUsed = Number(options.gramsUsed || 0);
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
    }

    if (item.remainingWeightGrams > 0 && (item.status === 'closed' || options.openNow)) {
      item.status = 'opened';
      if (!item.openedAt) {
        item.openedAt = now.toISOString();
        const tOpen = item.tOpenHours || resolveDefaultTOpenHours(item.title, item.zone);
        item.expiresAt = new Date(now.getTime() + tOpen * 3600 * 1000).toISOString();
      }
    }

    if (options.targetZone && VALID_PANTRY_ZONES.includes(options.targetZone)) {
      item.zone = options.targetZone;
    }

    item.updatedAt = now.toISOString();
    this._save();
    return this._enrichUrgency(item);
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

      const added = this.addItem({
        title: line.title,
        brand: line.brand || null,
        zone: line.targetZone || inferDefaultZone(line.title, line.category || ''),
        initialWeightGrams: line.packWeightGrams || 250,
        remainingWeightGrams: line.packWeightGrams || 250,
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
}

export const pantryService = new PantryService();
export default pantryService;
