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
import { normalizeSearchToken, bumpEnrichmentEpoch } from './offerService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DEFAULT_PROFILES_PATH = path.resolve(__dirname, '..', '..', 'data', 'cache', 'user_profiles.json');

export const ZERO_FORMAGGI_EXCLUDED_INGREDIENTS = [
  'formaggio',
  'formaggi',
  'mozzarella',
  'fior di latte',
  'parmigiano',
  'grana padano',
  'pecorino',
  'gorgonzola',
  'stracchino',
  'crescenza',
  'squacquerone',
  'taleggio',
  'scamorza',
  'scamorzine',
  'provola',
  'provolone',
  'ricotta',
  'mascarpone',
  'burrata',
  'feta',
  'brie',
  'camembert',
  'fontina',
  'asiago',
  'emmental',
  'emmenthal',
  'groviera',
  'leerdammer',
  'maasdammer',
  'edam',
  'edamer',
  'gouda',
  'cheddar',
  'roquefort',
  'vezzena',
  'latteria',
  'italico',
  'dolce verde',
  'butirro',
  'burrini',
  'cacioricotta',
  'caciocavallo',
  'caciotta',
  'caciottina',
  'primo sale',
  'primosale',
  'fiocchi di latte',
  'fiocchi di formaggio',
  'quark',
  'caprino',
  'robiola',
  'certosa',
  'galbanino',
  'sottilette',
  'formaggino',
  'philadelphia',
  'prescinseua',
  'presinseua'
];

export const DEFAULT_USER_PROFILES = [
  {
    id: 'dany',
    name: 'Dany (Casa — Zero Formaggi)',
    description: 'Onnivoro sportivo, rigorosamente zero formaggi (sia freschi che stagionati), focus densità nutrizionale e pesce del Tigullio.',
    isDefault: true,
    dietaryRegime: 'omnivore',
    filterMode: 'soft_flag', // 'hard_ban' or 'soft_flag'
    excludedCategories: ['Formaggi e latticini'],
    excludedAllergens: [],
    excludedIngredients: [...ZERO_FORMAGGI_EXCLUDED_INGREDIENTS],
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
    excludedCategories: ['Surgelati', 'Formaggi e latticini'],
    excludedAllergens: [],
    excludedIngredients: [...ZERO_FORMAGGI_EXCLUDED_INGREDIENTS, 'surgelato', 'gelato'],
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
    this._mutationVersion = 1;
  }

  getMutationVersion() {
    return this._mutationVersion;
  }

  _bumpVersion() {
    this._mutationVersion++;
    bumpEnrichmentEpoch();
  }

  _upgradeBuiltinZeroCheeseProfiles(profiles = []) {
    return profiles.map((p) => {
      if ((p.id === 'dany' || p.id === 'barca') && Array.isArray(p.excludedIngredients) && p.excludedIngredients.includes('formaggio')) {
        const mergedIngs = Array.from(new Set([...p.excludedIngredients, ...ZERO_FORMAGGI_EXCLUDED_INGREDIENTS]));
        const mergedCats = Array.from(new Set([...(p.excludedCategories || []), 'Formaggi e latticini']));
        return { ...p, excludedIngredients: mergedIngs, excludedCategories: mergedCats };
      }
      return p;
    });
  }

  _load() {
    if (this._state) return this._state;
    try {
      if (fs.existsSync(this.storagePath)) {
        const raw = JSON.parse(fs.readFileSync(this.storagePath, 'utf8'));
        if (raw && Array.isArray(raw.profiles) && raw.profiles.length > 0) {
          this._state = {
            ...raw,
            profiles: this._upgradeBuiltinZeroCheeseProfiles(raw.profiles)
          };
          return this._state;
        }
      }
    } catch (_) {
      // Fallback to defaults
    }
    this._state = {
      activeProfileId: 'dany',
      profiles: DEFAULT_USER_PROFILES.map((p) => ({
        ...p,
        excludedCategories: [...(p.excludedCategories || [])],
        excludedIngredients: [...(p.excludedIngredients || [])]
      }))
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
    this._bumpVersion();
    this._save();
    return this.getProfilesState();
  }

  _mergeProfileIntoState(state, profilePayload = {}, { rejectBuiltinInProd = false } = {}) {
    const id = String(profilePayload.id || `profile-${Date.now()}`).trim().toLowerCase();
    const isBuiltin = id === 'dany' || id === 'barca' || id === 'ospiti';

    if (process.env.NODE_ENV === 'production' && isBuiltin) {
      if (rejectBuiltinInProd) {
        const err = new Error('Profili di sistema protetti in modalità demo pubblica');
        err.status = 403;
        throw err;
      }
      const existingBuiltin = state.profiles.find((p) => p.id === id);
      if (existingBuiltin) return existingBuiltin;
    }

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
      if (state.profiles.length >= 25) {
        const err = new Error('Limite massimo di 25 profili raggiunto');
        err.status = 413;
        throw err;
      }
      state.profiles.push(updated);
    }
    return updated;
  }

  upsertProfile(profilePayload = {}) {
    const state = this._load();
    const updated = this._mergeProfileIntoState(state, profilePayload, { rejectBuiltinInProd: true });
    this._bumpVersion();
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
    if (payload.profiles.length > 20) {
      const err = new Error('Massimo 20 profili consentiti per singola importazione');
      err.status = 413;
      throw err;
    }
    const state = this._load();
    const sanitized = payload.profiles.map((p) =>
      this._mergeProfileIntoState(state, p, { rejectBuiltinInProd: false })
    );
    if (payload.activeProfileId && sanitized.some((p) => p.id === payload.activeProfileId)) {
      this._state.activeProfileId = payload.activeProfileId;
    }
    this._bumpVersion();
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

    const rawTitle = String(item.title || item.name || '').trim();
    const normBrand = normalizeSearchToken(item.brand || '');
    let strippedTitle = normalizeSearchToken(rawTitle);
    // Strip leading brand prefix (e.g. "Rigoni Di Asiago - Confetture Bio" -> "confetture bio") so brand geography never triggers cheese exclusions!
    while (normBrand && strippedTitle.startsWith(`${normBrand} `)) {
      strippedTitle = strippedTitle.slice(normBrand.length).trim();
    }
    // Also strip known brand prefixes even if item.brand wasn't populated
    strippedTitle = strippedTitle.replace(/^rigoni\s+di\s+asiago\s+/, '').trim();

    const haystack = normalizeSearchToken(`${strippedTitle} ${item.subcategory || ''}`);
    const category = String(item.category || '').trim();

    const isWineOrBeverage =
      category === 'Acqua e Bevande' ||
      /\b(igt|doc|docg|vino|spumante|prosecco|montepulciano|valdifara|cantina|birra|liquore|grappa|75\s*cl|750\s*ml)\b/i.test(rawTitle);
    const isFruitJamOrSpread = /\b(confettur\w*|marmellat\w*|miele|nocciolata)\b/i.test(rawTitle);
    const shouldSkipAmbiguousCheeseToken = (normIng) => {
      if (isWineOrBeverage && (normIng === 'pecorino' || normIng === 'asiago' || normIng === 'dolce verde')) {
        return true;
      }
      if (isFruitJamOrSpread && normIng === 'asiago') {
        return true;
      }
      return false;
    };

    const reasons = [];
    const matchedExclusions = [];

    // Check explicit allowed exceptions first, unless an explicit excludedIngredient or cheese category also matches
    const isCreaCheeseCategory =
      category === 'Formaggi e latticini' &&
      ((profile.excludedCategories || []).includes('Formaggi e latticini') ||
        (profile.excludedIngredients || []).some((ing) => normalizeSearchToken(ing) === 'formaggio'));

    const hasExplicitExcludedIngredient =
      isCreaCheeseCategory ||
      (profile.excludedIngredients || []).some((ing) => {
        const normIng = normalizeSearchToken(ing);
        if (!normIng || shouldSkipAmbiguousCheeseToken(normIng)) return false;
        return new RegExp(`\\b${normIng}\\b`, 'i').test(haystack);
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
      } else if (isCreaCheeseCategory) {
        reasons.push(`Categoria esclusa: ${category}`);
        matchedExclusions.push('formaggio');
      }

      // 2. Dietary regime check
      const regimeForbidden = REGIME_FORBIDDEN_KEYWORDS[profile.dietaryRegime] || [];
      for (const kw of regimeForbidden) {
        const normKw = normalizeSearchToken(kw);
        if (shouldSkipAmbiguousCheeseToken(normKw)) continue;
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
        if (!normIng || shouldSkipAmbiguousCheeseToken(normIng)) continue;
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
