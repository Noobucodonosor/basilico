/**
 * Basilico — Physical Kitchen Inventory & Cookware ROI Service (ADR-0010 / TASK-M4-01)
 * Location: server/services/kitchenInventoryService.js
 *
 * Manages:
 *  1. Active stove/heat source ('gas', 'induction', 'electric_radiant', 'boat_no_stove')
 *  2. Owned cookware and knives with ferromagnetic induction validation
 *  3. Under-sink cleaning supplies inventory
 *  4. Gap Analysis & Recipe Unlock ROI for missing cookware archetypes
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARCHETYPES_PATH = path.resolve(__dirname, '../../data/seed/cookware_archetypes.json');
const DISHES_SEED_PATH = path.resolve(__dirname, '../../data/seed/recipes_and_dishes.json');
const DEFAULT_KITCHEN_STATE_PATH = path.resolve(__dirname, '../../data/cache/kitchen_inventory.json');

export const VALID_HEAT_SOURCES = ['gas', 'induction', 'electric_radiant', 'boat_no_stove'];

/**
 * Canonical 1:1 mapper between dish `cookwareRequired` entries and Stanza 4 `cookware_archetypes.json` IDs.
 * Eliminates orphaned IDs (`mortaio_marmo` -> `mortaio`, `bistecchiera_ghisa` -> `bistecchiera`) and
 * filters legacy noise (e.g. `mortaio` only required on genuine pounded sauces/pesto, never on tartare/vongole).
 */
export function normalizeDishCookwareIds(rawTools = [], dishContext = null) {
  const mapped = new Set();
  const titleAndBom = dishContext
    ? `${dishContext.title || ''} ${(dishContext.bom || []).map((b) => b.name || '').join(' ')}`.toLowerCase()
    : '';
  const isTrueMortarDish = !dishContext || /\b(pesto|salsa\s+di\s+noci|agliata|salsa\s+verde)\b/i.test(titleAndBom);
  const isPureColdAssembly =
    dishContext &&
    (dishContext.course === 'piatto_unico_barca' ||
      /\b(crud[oi]|tartare|carpaccio|ceviche|ostrich\w*)\b/i.test(String(dishContext.title || '')));

  for (const t of rawTools || []) {
    const norm = String(t || '').toLowerCase().trim();
    if (!norm) continue;

    if (norm === 'pentola_rame_non_induzione' || norm.includes('rame')) {
      if (!isPureColdAssembly) mapped.add('pentola_rame_non_induzione');
    } else if (norm === 'wok' || norm.includes('wok') || norm.includes('saltapasta')) {
      if (!isPureColdAssembly) mapped.add('wok');
    } else if (norm === 'casseruola_inox' || norm.includes('casseruola')) {
      if (!isPureColdAssembly) mapped.add('casseruola_inox');
    } else if (norm.includes('padella')) {
      if (!isPureColdAssembly) mapped.add('padella_antiaderente');
    } else if (norm.includes('pentola') || norm === 'moka') {
      if (!isPureColdAssembly) mapped.add('pentola');
    } else if (norm.includes('forno') || norm.includes('teglia') || norm.includes('pirofila')) {
      if (!isPureColdAssembly) mapped.add('teglia_forno');
    } else if (norm.includes('mortaio')) {
      if (isTrueMortarDish) mapped.add('mortaio');
      else mapped.add('coltello_chef');
    } else if (norm.includes('bistecchiera') || norm.includes('griglia')) {
      if (!isPureColdAssembly) mapped.add('bistecchiera');
    } else {
      mapped.add('coltello_chef');
    }
  }

  if (mapped.size === 0) mapped.add('coltello_chef');
  return Array.from(mapped);
}

export class KitchenInventoryService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_KITCHEN_PATH || DEFAULT_KITCHEN_STATE_PATH;
    this._archetypes = null;
    this._dishes = null;
    this._state = null;
  }

  getArchetypes() {
    if (!this._archetypes) {
      this._archetypes = JSON.parse(fs.readFileSync(ARCHETYPES_PATH, 'utf8'));
    }
    return this._archetypes;
  }

  getDishesCatalog() {
    if (!this._dishes) {
      try {
        this._dishes = JSON.parse(fs.readFileSync(DISHES_SEED_PATH, 'utf8'));
      } catch (_) {
        this._dishes = [];
      }
    }
    return this._dishes;
  }

  _load() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const parsed = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (parsed && typeof parsed === 'object' && Array.isArray(parsed.ownedToolIds)) {
          this._state = parsed;
          return this._state;
        }
      }
    } catch (_) {}

    this._state = {
      heatSource: 'gas',
      ownedToolIds: ['padella_antiaderente', 'pentola', 'coltello_chef'],
      ownedCleaningKeys: ['spugna_delicata', 'detersivo_piatti', 'panno_microfibra'],
      toolConditionMap: {
        padella_antiaderente: 'optimal',
        pentola: 'optimal',
        coltello_chef: 'optimal'
      }
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

  getKitchenState() {
    const state = this._load();
    const archetypes = this.getArchetypes();
    const allDishes = this.getDishesCatalog();
    const isInduction = state.heatSource === 'induction';
    const isBoat = state.heatSource === 'boat_no_stove';

    // Precompute normalized cookware sets for every dish in the real catalog
    const dishRequirements = allDishes.map((d) => ({
      id: d.id,
      rawTools: (d.cookwareRequired || []).map((t) => String(t).toLowerCase()),
      normalizedTools: normalizeDishCookwareIds(d.cookwareRequired || [], d)
    }));

    const countDishesUsingTool = (toolId) =>
      dishRequirements.filter((dr) => dr.normalizedTools.includes(toolId)).length;

    const effectiveTools = [];
    const disqualifiedTools = [];
    const missingCandidates = [];

    for (const arch of archetypes) {
      const dynamicToolDishesCount = countDishesUsingTool(arch.id);
      const isOwned = state.ownedToolIds.includes(arch.id);
      if (isOwned) {
        if (isInduction && arch.category === 'cookware' && !arch.inductionCompatible) {
          disqualifiedTools.push({
            ...arch,
            unlockedDishesCount: dynamicToolDishesCount,
            disqualificationReason:
              'Materiale non ferromagnetico privo di piastra ferritica: non chiude il circuito magnetico (correnti di Foucault) sul piano a induzione e resta freddo.'
          });
        } else if (isBoat && arch.id === 'teglia_forno') {
          disqualifiedTools.push({
            ...arch,
            unlockedDishesCount: dynamicToolDishesCount,
            disqualificationReason: 'Non utilizzabile in modalità Barca / Borsa Termica (assenza forno).'
          });
        } else {
          effectiveTools.push({
            ...arch,
            unlockedDishesCount: dynamicToolDishesCount,
            condition: state.toolConditionMap?.[arch.id] || 'optimal'
          });
        }
      } else {
        const stoveCompatible =
          !(isInduction && arch.category === 'cookware' && !arch.inductionCompatible) &&
          !(isBoat && arch.id === 'teglia_forno');
        if (stoveCompatible) {
          missingCandidates.push({
            ...arch,
            unlockedDishesCount: dynamicToolDishesCount
          });
        }
      }
    }

    // Exact set-union of dishes 100% cookable right now (NEVER exceeds totalCatalogDishes!)
    const effectiveSet = new Set(effectiveTools.map((t) => t.id));
    const totalCatalogDishes = dishRequirements.length;
    const currentlyCookableDishes = dishRequirements.filter((dr) =>
      dr.normalizedTools.every((tid) => effectiveSet.has(tid))
    );
    const totalUnlockedDishes = currentlyCookableDishes.length;

    const missingRoiOpportunities = missingCandidates.map((arch) => {
      const hypSet = new Set([...effectiveSet, arch.id]);
      const hypCookable = dishRequirements.filter((dr) =>
        dr.normalizedTools.every((tid) => hypSet.has(tid))
      ).length;
      const marginalNewlyCookableCount = Math.max(0, hypCookable - totalUnlockedDishes);
      const avgRestaurantSavingEuro = 14.5;
      const paybackUses = Math.max(1, Math.ceil((arch.referencePriceEuro || 20) / avgRestaurantSavingEuro));
      return {
        ...arch,
        marginalNewlyCookableCount,
        paybackUses,
        roiSummary:
          marginalNewlyCookableCount > 0
            ? `Usato in ${arch.unlockedDishesCount} ricette (+${marginalNewlyCookableCount} piatti sbloccati subito col tuo set attuale; si ripaga in ~${paybackUses} cene a casa).`
            : `Usato in ${arch.unlockedDishesCount} ricette del catalogo (si ripaga in ~${paybackUses} cene preparate a casa invece che al ristorante).`
      };
    });

    missingRoiOpportunities.sort(
      (a, b) => b.marginalNewlyCookableCount - a.marginalNewlyCookableCount || b.unlockedDishesCount - a.unlockedDishesCount
    );

    return {
      heatSource: state.heatSource,
      availableHeatSources: VALID_HEAT_SOURCES,
      ownedToolIds: state.ownedToolIds,
      ownedCleaningKeys: state.ownedCleaningKeys,
      effectiveTools,
      disqualifiedTools,
      missingRoiOpportunities,
      totalCatalogDishes,
      totalUnlockedDishes
    };
  }

  updateKitchenConfig(payload = {}) {
    const state = this._load();
    if (payload.heatSource && VALID_HEAT_SOURCES.includes(payload.heatSource)) {
      state.heatSource = payload.heatSource;
    }
    if (Array.isArray(payload.ownedToolIds)) {
      state.ownedToolIds = Array.from(new Set(payload.ownedToolIds));
    }
    if (payload.toggleToolId) {
      const tid = String(payload.toggleToolId);
      if (state.ownedToolIds.includes(tid)) {
        state.ownedToolIds = state.ownedToolIds.filter((i) => i !== tid);
      } else {
        state.ownedToolIds.push(tid);
      }
    }
    if (payload.toggleCleaningKey) {
      const ck = String(payload.toggleCleaningKey);
      if (state.ownedCleaningKeys.includes(ck)) {
        state.ownedCleaningKeys = state.ownedCleaningKeys.filter((i) => i !== ck);
      } else {
        state.ownedCleaningKeys.push(ck);
      }
    }
    this._save();
    return this.getKitchenState();
  }
}

export const kitchenInventoryService = new KitchenInventoryService();
export default kitchenInventoryService;
