/**
 * Basilico — Multi-Level User Profile & Dietary Exclusion Service (ADR-0007 / TASK-M1-02)
 * Location: server/services/userProfileService.js
 *
 * Manages customizable dietary profiles (Dany, Barca, Ospiti, custom) with 4-level exclusions:
 * 1. dietaryRegime ('omnivore', 'pescatarian', 'vegetarian', 'vegan')
 * 2. excludedCategories (e.g., ['Latticini e Formaggi'])
 * 3. excludedAllergens (EU 1169/2011 14 allergens)
 * 4. excludedIngredients (free keywords with exceptions, e.g., exclude cheese/dairy except butter/milk if desired)
 *
 * Supports 'hard_ban' (completely hides/blocks incompatible products) and 'soft_flag' (dims with warning badge)
 * plus portable JSON export/import.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSearchToken } from './offerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROFILES_PATH = path.resolve(__dirname, '..', '..', 'data', 'cache', 'user_profiles.json');

export const DEFAULT_USER_PROFILES = [
  {
    id: 'dany',
    name: 'Dany (Casa — Zero Formaggi)',
    description: 'Onnivoro sportivo, rigorosamente zero formaggi (sia freschi che stagionati), focus densità nutrizionale e pesce del Tigullio.',
    isDefault: true,
    dietaryRegime: 'omnivore',
    filterMode: 'soft_flag', // 'hard_ban' or 'soft_flag'
    excludedCategories: [],
    excludedAllergens: [],
    excludedIngredients: [
      'formaggio',
      'formaggi',
      'mozzarella',
      'parmigiano',
      'grana padano',
      'pecorino',
      'gorgonzola',
      'stracchino',
      'crescenza',
      'taleggio',
      'scamorza',
      'provola',
      'provolone',
      'ricotta',
      'mascarpone',
      'burrata',
      'feta',
      'brie',
      'fontina',
      'asiago',
      'emmental',
      'caciotta',
      'fiocchi di latte',
      'robiola',
      'certosa',
      'galbanino',
      'sottilette',
      'philadelphia'
    ],
    allowedExceptions: ['latte', 'yogurt greco', 'burro chiarificato'],
    logisticsMode: 'land_kitchen',
    preferredMaxStores: 2
  },
  {
    id: 'barca',
    name: 'Dany In Barca (Borsa Termica & Cambusa)',
    description: 'Zero formaggi + vincolo logistico cambusa/borsa termica: privilegiati piatti one-pot, conserve nobili, zero forno.',
    isDefault: false,
    dietaryRegime: 'omnivore',
    filterMode: 'hard_ban',
    excludedCategories: ['Surgelati'],
    excludedAllergens: [],
    excludedIngredients: [
      'formaggio',
      'formaggi',
      'mozzarella',
      'parmigiano',
      'grana padano',
      'pecorino',
      'gorgonzola',
      'stracchino',
      'crescenza',
      'ricotta',
      'burrata',
      'scamorza',
      'surgelato',
      'gelato'
    ],
    allowedExceptions: [],
    logisticsMode: 'boat_cooler',
    preferredMaxStores: 1
  },
  {
    id: 'ospiti',
    name: 'Cena con Ospiti (Tutto Abilitato)',
    description: 'Nessuna esclusione automatica per quando cucini anche per amici o ospiti a Rapallo.',
    isDefault: false,
    dietaryRegime: 'omnivore',
    filterMode: 'soft_flag',
    excludedCategories: [],
    excludedAllergens: [],
    excludedIngredients: [],
    allowedExceptions: [],
    logisticsMode: 'land_kitchen',
    preferredMaxStores: 2
  }
];

const REGIME_FORBIDDEN_KEYWORDS = {
  pescatarian: ['manzo', 'bovino', 'vitello', 'maiale', 'suino', 'pollo', 'tacchino', 'salame', 'prosciutto', 'mortadella', 'bresaola', 'pancetta', 'guanciale', 'speck', 'wurstel', 'salsiccia'],
  vegetarian: ['manzo', 'bovino', 'vitello', 'maiale', 'suino', 'pollo', 'tacchino', 'salame', 'prosciutto', 'mortadella', 'bresaola', 'pancetta', 'guanciale', 'speck', 'tonno', 'salmone', 'merluzzo', 'acciughe', 'alici', 'gamberi', 'orata', 'branzino', 'pesce', 'cozze', 'vongole', 'polpo', 'calamari'],
  vegan: ['manzo', 'bovino', 'vitello', 'maiale', 'suino', 'pollo', 'tacchino', 'salame', 'prosciutto', 'mortadella', 'bresaola', 'pancetta', 'guanciale', 'speck', 'tonno', 'salmone', 'merluzzo', 'acciughe', 'alici', 'gamberi', 'orata', 'branzino', 'pesce', 'latte', 'yogurt', 'burro', 'formaggio', 'mozzarella', 'parmigiano', 'grana', 'pecorino', 'ricotta', 'uova', 'miele', 'panna']
};

export class UserProfileService {
  constructor(options = {}) {
    this.storagePath = options.storagePath || process.env.BASILICO_PROFILES_PATH || DEFAULT_PROFILES_PATH;
    this._state = null;
  }

  _load() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (raw && Array.isArray(raw.profiles) && raw.profiles.length > 0) {
          this._state = raw;
          return this._state;
        }
      }
    } catch (_) {
      // Fallback to defaults
    }
    this._state = {
      activeProfileId: 'dany',
      profiles: DEFAULT_USER_PROFILES.map((p) => ({ ...p }))
    };
    return this._state;
  }

  _save() {
    try {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const tmp = `${this.storagePath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._state, null, 2), 'utf8');
      fs.renameSync(tmp, this.storagePath);
    } catch (_) {
      // Ignore write errors in read-only sandboxes
    }
  }

  getProfilesState() {
    const state = this._load();
    const activeProfile = state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    return {
      activeProfileId: activeProfile.id,
      activeProfile,
      profiles: state.profiles
    };
  }

  getProfileById(profileId) {
    const state = this._load();
    if (!profileId) {
      return state.profiles.find((p) => p.id === state.activeProfileId) || state.profiles[0];
    }
    return state.profiles.find((p) => p.id === profileId) || state.profiles[0];
  }

  setActiveProfile(profileId) {
    const state = this._load();
    const found = state.profiles.find((p) => p.id === profileId);
    if (!found) {
      const err = new Error(`Profilo non trovato: ${profileId}`);
      err.status = 404;
      throw err;
    }
    state.activeProfileId = found.id;
    this._save();
    return this.getProfilesState();
  }

  upsertProfile(profilePayload = {}) {
    const state = this._load();
    const id = String(profilePayload.id || `profile-${Date.now()}`).trim().toLowerCase();
    const name = String(profilePayload.name || id).trim();

    const updated = {
      id,
      name,
      description: String(profilePayload.description || '').trim(),
      isDefault: Boolean(profilePayload.isDefault),
      dietaryRegime: profilePayload.dietaryRegime || 'omnivore',
      filterMode: profilePayload.filterMode === 'hard_ban' ? 'hard_ban' : 'soft_flag',
      excludedCategories: Array.isArray(profilePayload.excludedCategories) ? profilePayload.excludedCategories : [],
      excludedAllergens: Array.isArray(profilePayload.excludedAllergens) ? profilePayload.excludedAllergens : [],
      excludedIngredients: Array.isArray(profilePayload.excludedIngredients) ? profilePayload.excludedIngredients : [],
      allowedExceptions: Array.isArray(profilePayload.allowedExceptions) ? profilePayload.allowedExceptions : [],
      logisticsMode: profilePayload.logisticsMode || 'land_kitchen',
      preferredMaxStores: Number(profilePayload.preferredMaxStores) || 2
    };

    const idx = state.profiles.findIndex((p) => p.id === id);
    if (idx >= 0) {
      state.profiles[idx] = { ...state.profiles[idx], ...updated };
    } else {
      state.profiles.push(updated);
    }
    this._save();
    return updated;
  }

  exportProfilesJson() {
    return {
      schemaVersion: '1.0',
      exportedAt: new Date().toISOString(),
      ...this.getProfilesState()
    };
  }

  importProfilesJson(payload = {}) {
    if (!payload || !Array.isArray(payload.profiles) || payload.profiles.length === 0) {
      const err = new Error('Payload JSON profili non valido: array profiles mancante');
      err.status = 400;
      throw err;
    }
    const sanitized = payload.profiles.map((p) => this.upsertProfile(p));
    if (payload.activeProfileId && sanitized.some((p) => p.id === payload.activeProfileId)) {
      this._state.activeProfileId = payload.activeProfileId;
    }
    this._save();
    return this.getProfilesState();
  }

  /**
   * Evaluates whether an offer or food item complies with a given profile.
   */
  checkItemCompatibility(item = {}, profileOrId = null) {
    const profile = typeof profileOrId === 'object' && profileOrId !== null
      ? profileOrId
      : this.getProfileById(profileOrId);

    // Non-food domains are not subject to dietary exclusions
    if (item.domain && item.domain !== 'food_human') {
      return {
        isCompatible: true,
        action: 'allow',
        reasons: [],
        matchedExclusions: [],
        profileId: profile.id
      };
    }

    const haystack = normalizeSearchToken(`${item.title || item.name || ''} ${item.brand || ''} ${item.subcategory || ''}`);
    const category = String(item.category || '').trim();
    const reasons = [];
    const matchedExclusions = [];

    // Check explicit allowed exceptions first, unless an explicit excludedIngredient also matches
    const hasExplicitExcludedIngredient = (profile.excludedIngredients || []).some((ing) => {
      const normIng = normalizeSearchToken(ing);
      return normIng && new RegExp(`\\b${normIng}\\b`, 'i').test(haystack);
    });

    const isException = !hasExplicitExcludedIngredient && (profile.allowedExceptions || []).some((exc) => {
      const normExc = normalizeSearchToken(exc);
      return normExc && new RegExp(`\\b${normExc}\\b`, 'i').test(haystack);
    });

    if (!isException) {
      // 1. Category check
      if (category && (profile.excludedCategories || []).includes(category)) {
        reasons.push(`Categoria esclusa: ${category}`);
        matchedExclusions.push(category);
      }

      // 2. Dietary regime check
      const regimeForbidden = REGIME_FORBIDDEN_KEYWORDS[profile.dietaryRegime] || [];
      for (const kw of regimeForbidden) {
        const normKw = normalizeSearchToken(kw);
        const regex = new RegExp(`\\b${normKw}\\b`, 'i');
        if (regex.test(haystack)) {
          reasons.push(`Regime ${profile.dietaryRegime}: contiene "${kw}"`);
          matchedExclusions.push(kw);
          break;
        }
      }

      // 3. Excluded ingredients check
      for (const ing of profile.excludedIngredients || []) {
        const normIng = normalizeSearchToken(ing);
        if (!normIng) continue;
        const regex = new RegExp(`\\b${normIng}\\b`, 'i');
        if (regex.test(haystack)) {
          reasons.push(`Escluso dal profilo (${profile.name}): "${ing}"`);
          matchedExclusions.push(ing);
        }
      }
    }

    const isCompatible = reasons.length === 0;
    const action = isCompatible
      ? 'allow'
      : (profile.filterMode === 'hard_ban' ? 'hide' : 'flag');

    return {
      isCompatible,
      action,
      reasons,
      matchedExclusions,
      profileId: profile.id,
      profileName: profile.name
    };
  }
}

export const userProfileService = new UserProfileService();
export default userProfileService;
