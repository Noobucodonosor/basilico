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
const DEFAULT_KITCHEN_STATE_PATH = path.resolve(__dirname, '../../data/cache/kitchen_inventory.json');

export const VALID_HEAT_SOURCES = ['gas', 'induction', 'electric_radiant', 'boat_no_stove'];

export class KitchenInventoryService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_KITCHEN_PATH || DEFAULT_KITCHEN_STATE_PATH;
    this._archetypes = null;
    this._state = null;
  }

  getArchetypes() {
    if (!this._archetypes) {
      this._archetypes = JSON.parse(fs.readFileSync(ARCHETYPES_PATH, 'utf8'));
    }
    return this._archetypes;
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
    const isInduction = state.heatSource === 'induction';
    const isBoat = state.heatSource === 'boat_no_stove';

    const effectiveTools = [];
    const disqualifiedTools = [];
    const missingRoiOpportunities = [];

    for (const arch of archetypes) {
      const isOwned = state.ownedToolIds.includes(arch.id);
      if (isOwned) {
        if (isInduction && arch.category === 'cookware' && !arch.inductionCompatible) {
          disqualifiedTools.push({
            ...arch,
            disqualificationReason:
              'Materiale non ferromagnetico privo di piastra ferritica: non chiude il circuito magnetico (correnti di Foucault) sul piano a induzione e resta freddo.'
          });
        } else if (isBoat && arch.id === 'teglia_forno') {
          disqualifiedTools.push({
            ...arch,
            disqualificationReason: 'Non utilizzabile in modalità Barca / Borsa Termica (assenza forno).'
          });
        } else {
          effectiveTools.push({
            ...arch,
            condition: state.toolConditionMap?.[arch.id] || 'optimal'
          });
        }
      } else {
        // Compute ROI for missing tool if compatible with current stove
        const stoveCompatible = !(isInduction && arch.category === 'cookware' && !arch.inductionCompatible);
        if (stoveCompatible) {
          const avgRestaurantSavingEuro = 14.5;
          const paybackUses = Math.max(1, Math.ceil((arch.referencePriceEuro || 20) / avgRestaurantSavingEuro));
          missingRoiOpportunities.push({
            ...arch,
            unlockedDishesCount: arch.unlockedDishesCount || 20,
            paybackUses,
            roiSummary: `Sblocca +${arch.unlockedDishesCount} piatti del catalogo (si ripaga in ~${paybackUses} cene preparate a casa invece che al ristorante).`
          });
        }
      }
    }

    missingRoiOpportunities.sort((a, b) => b.unlockedDishesCount - a.unlockedDishesCount);

    const totalUnlockedDishes = effectiveTools.reduce((acc, t) => acc + (t.unlockedDishesCount || 0), 0);

    return {
      heatSource: state.heatSource,
      availableHeatSources: VALID_HEAT_SOURCES,
      ownedToolIds: state.ownedToolIds,
      ownedCleaningKeys: state.ownedCleaningKeys,
      effectiveTools,
      disqualifiedTools,
      missingRoiOpportunities,
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
