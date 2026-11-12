/**
 * Basilico — Recipes, Tigullio Restaurants, Live Arbitrage, 80/20 Solver & Science Cooking Coach (ADR-0011 / TASK-M5-01)
 * Location: server/services/recipeAndArbitrageService.js
 *
 * Implements:
 *  1. Certified catalog loading: 234 dishes (Base Single School + 32 Tigullio Restaurants + Starred Author Studies) & 1,134 BOM lines
 *  2. Automatic Profile-Adapted Variant Engine (e.g. scientific Ligurian dairy-free substitution for 'dany' profile)
 *  3. Dual Cost & Live Gastronomic Arbitrage (`purePortionCostEur` vs `checkoutCashCostEur` vs `menuPriceEuro`)
 *  4. 80/20 Submodular Max-Coverage Basket Solver (`computeMaxCoverage8020`)
 *  5. Harvard "Science & Cooking" Step Generator & Lab Notebook Persistence (`data/cache/lab_notebook.json`)
 *  6. On-demand Restaurant Menu Dish Deconstruction (`deconstructCustomMenuDish`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { offerService, normalizeSearchToken } from './offerService.js';
import { creaService } from './creaService.js';
import { pantryService } from './pantryService.js';
import { kitchenInventoryService } from './kitchenInventoryService.js';
import { kitchenResetService } from './kitchenResetService.js';
import { userProfileService } from './userProfileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISHES_SEED_PATH = path.resolve(__dirname, '../../data/seed/recipes_and_dishes.json');
const RESTAURANTS_SEED_PATH = path.resolve(__dirname, '../../data/seed/restaurants_tigullio.json');
const DEFAULT_LAB_NOTEBOOK_PATH = path.resolve(__dirname, '../../data/cache/lab_notebook.json');

// Reference standard supermarket pack sizes (g) & baseline Rapallo prices (€/kg) when no active offer is matched
const DEFAULT_INGREDIENT_PACK_AND_PRICE = {
  fish_seafood: { packGrams: 300, euroPerKg: 18.5 },
  meat_poultry: { packGrams: 400, euroPerKg: 13.8 },
  pasta_grains: { packGrams: 500, euroPerKg: 2.6 },
  legumes: { packGrams: 400, euroPerKg: 3.2 },
  vegetables: { packGrams: 500, euroPerKg: 3.4 },
  oil_fats: { packGrams: 1000, euroPerKg: 9.8 },
  nuts_seeds: { packGrams: 200, euroPerKg: 19.5 },
  dairy_cheese: { packGrams: 250, euroPerKg: 16.0 },
  default: { packGrams: 300, euroPerKg: 7.5 }
};

function classifyIngredientFamily(name = '') {
  const norm = normalizeSearchToken(name);
  if (/\b(acciug\w*|alici|orata|branzino|spigola|salmone|tonno|sgombro|palamita|seppi\w*|calamar\w*|polpo|gamber\w*|scamp\w*|cozz\w*|vongol\w*|pesce|baccala|stoccafisso|merluzzo|capesante|astice|aragosta)\b/.test(norm)) {
    return 'fish_seafood';
  }
  if (/\b(manzo|bovino|vitello|pollo|tacchino|coniglio|maiale|agnello|anatra|prosciutto|pancetta|guanciale)\b/.test(norm)) {
    return 'meat_poultry';
  }
  if (/\b(spaghett\w*|pasta|trofie|trenette|linguine|pansot\w*|raviol\w*|gnocch\w*|riso|farina|pane|crostin\w*|focaccia|sfoglia|tagliolini|paccheri)\b/.test(norm)) {
    return 'pasta_grains';
  }
  if (/\b(ceci|fagiol\w*|lenticchi\w*|fave|piselli)\b/.test(norm)) {
    return 'legumes';
  }
  if (/\b(olio)\b/.test(norm)) {
    return 'oil_fats';
  }
  if (/\b(pinoli|mandorl\w*|noci|nocciole|pistacch\w*)\b/.test(norm)) {
    return 'nuts_seeds';
  }
  if (/\b(parmigiano|grana|pecorino|mozzarella|stracchino|crescenza|ricotta|formaggio|burro|panna|mascarpone|prescinseua)\b/.test(norm)) {
    return 'dairy_cheese';
  }
  if (/\b(pomodor\w*|passata|zucchin\w*|spinac\w*|bietol\w*|borragine|sedano|cipoll\w*|aglio|patat\w*|carciof\w*|melanzan\w*|peperon\w*|basilico|limon\w*|insalata|asparag\w*|fungh\w*)\b/.test(norm)) {
    return 'vegetables';
  }
  return 'default';
}

/**
 * Classifies every dish with canonical culinary metadata (`dishFamily`, `dairyRole`,
 * `boatSafeCold`, `lightDinnerSuitable`, `canonicalTwinKey`) so Stanza 3 and Stanza 6
 * enforce real culinary variety, cold-boat safety, and 3-tier Zero-Cheese rules.
 */
export function classifyDishMetadata(dish = {}) {
  const titleNorm = normalizeSearchToken(dish.title || '');
  const course = String(dish.course || 'secondo').toLowerCase();
  const bomText = normalizeSearchToken((dish.bom || []).map((b) => b.name).join(' '));
  const combined = `${titleNorm} ${bomText}`;

  // 1. Canonical Twin Key for grouping homologous dishes across Tigullio restaurants
  let canonicalTwinKey = titleNorm
    .replace(/\b(alla|al|alle|ai|con|del|dello|della|dei|degli|delle|in|su|di|da|il|lo|la|i|gli|le|fatto|fatti|fatta|fatte|casa|nostra|nostro|tradizionale|ligure|genovese|tigullio)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (/\b(trofie|trenette|linguine|mandilli|testaroli|gnocchi)\b.*\b(pesto)\b/.test(titleNorm)) {
    canonicalTwinKey = 'pasta fresca al pesto ligure';
  } else if (/\b(pansot\w*)\b.*\b(noc\w*)\b/.test(titleNorm)) {
    canonicalTwinKey = 'pansotti con salsa di noci';
  } else if (/\b(spaghett\w*|linguine)\b.*\b(vongol\w*|arsell\w*)\b/.test(titleNorm)) {
    canonicalTwinKey = 'spaghetti alle vongole';
  } else if (/\b(fritt\w*\s+mist\w*|frittura)\b.*\b(mare|golfo|pesce|paranza|calamar\w*)?\b/.test(titleNorm)) {
    canonicalTwinKey = 'fritto misto di mare del golfo';
  } else if (/\b(cappon\s+magro)\b/.test(titleNorm)) {
    canonicalTwinKey = 'cappon magro ligure';
  } else if (/\b(focaccia)\b.*\b(formaggio|recco)\b/.test(titleNorm)) {
    canonicalTwinKey = 'focaccia col formaggio tipo recco';
  }

  // 2. Dish Family (used by Stanza 6 anti-monotony solver: max 2/week per family)
  let dishFamily = dish.dishFamily || null;
  if (!dishFamily) {
    if (course === 'colazione' || (dish.mealContexts || []).includes('breakfast')) {
      dishFamily = /\b(uov\w*|salat\w*|focaccia)\b/.test(titleNorm) ? 'breakfast_savory' : 'breakfast_sweet';
    } else if (course === 'dolce' || /\b(tiramisu|gelat\w*|sorbett\w*|panna cotta|torta dolce|crostata|semifreddo|cannol\w*|profiterol\w*|meringata|cheesecake|bunet|crema catalana|zabaione|dolce)\b/.test(titleNorm)) {
      dishFamily = 'dessert_gelato';
    } else if (/\b(pizz\w*|focaccia\s+col\s+formaggio|focaccia\s+al\s+formaggio|pinsa)\b/.test(titleNorm)) {
      dishFamily = 'pizza_focaccia';
    } else if (/\b(pesto)\b/.test(titleNorm)) {
      dishFamily = 'pesto_pasta';
    } else if (/\b(pansot\w*|salsa\s+di\s+noci)\b/.test(titleNorm)) {
      dishFamily = 'walnut_filled_pasta';
    } else if (/\b(raviol\w*|tortell\w*|agnolott\w*|cappellacc\w*)\b/.test(titleNorm)) {
      dishFamily = /\b(pesce|mare|orata|branzino|gamber\w*)\b/.test(combined) ? 'seafood_filled_pasta' : 'land_filled_pasta';
    } else if (/\b(risott\w*)\b/.test(titleNorm)) {
      dishFamily = /\b(mare|pescator\w*|gamber\w*|scamp\w*|seppi\w*)\b/.test(combined) ? 'seafood_risotto' : 'land_risotto';
    } else if (course === 'primo' && /\b(vongol\w*|cozz\w*|scoglio|mare|pescator\w*|gamber\w*|astice|granchio|bottarga|acciug\w*|tonno|calamar\w*|seppi\w*)\b/.test(combined)) {
      dishFamily = 'seafood_pasta';
    } else if (course === 'primo' && /\b(pomodor\w*|arrabbiata|amatriciana|norma)\b/.test(combined)) {
      dishFamily = 'tomato_pasta';
    } else if (course === 'primo' && /\b(ragu| tuccu|coniglio|carni|cinghiale|bolognese)\b/.test(combined)) {
      dishFamily = 'meat_ragu_pasta';
    } else if (/\b(fritt\w*|frittura|cotolett\w*)\b/.test(titleNorm)) {
      dishFamily = 'fried_dish';
    } else if (/\b(crud[oi]|tartare|carpaccio|ceviche|ostrich\w*)\b/.test(titleNorm)) {
      dishFamily = 'raw_crudo';
    } else if (/\b(panissa|farinata|ceci|lenticchi\w*|fagiol\w*)\b/.test(titleNorm)) {
      dishFamily = 'legumes_grains';
    } else if (/\b(cozz\w*|vongol\w*|polpo|seppi\w*|calamar\w*|moscardin\w*|gamber\w*|scamp\w*|cappon\s+magro)\b/.test(titleNorm)) {
      dishFamily = 'shellfish_cephalopods';
    } else if (/\b(orata|branzino|spigola|rombo|pescato|acciug\w*|alici|sgombro|tonno|salmone|merluzzo|baccala|stoccafisso|pesce)\b/.test(combined)) {
      dishFamily = 'baked_or_pan_fish';
    } else if (/\b(pollo|tacchino|coniglio|faraona)\b/.test(combined)) {
      dishFamily = 'white_meat';
    } else if (/\b(manzo|vitello|bovino|filetto|tagliata|cima|maiale|agnello)\b/.test(combined)) {
      dishFamily = 'red_meat';
    } else if (/\b(uov\w*|frittata)\b/.test(combined)) {
      dishFamily = 'eggs_savory';
    } else {
      dishFamily = 'mediterranean_vegetable';
    }
  }

  // 3. 3-Tier Dairy Role Classification (for honest Zero Formaggi handling)
  const hasCheeseOrHeavyDairyInBom = /\b(formagg\w*|mozzarell\w*|parmigian\w*|grana|pecorin\w*|stracchin\w*|crescenza|prescinseu\w*|presinseu\w*|ricott\w*|mascarpon\w*|gorgonzol\w*|burrata|taleggio|scamorza|fontina|feta)\b/.test(bomText);
  let dairyRole = dish.dairyRole || 'none';
  if (!dish.dairyRole) {
    if (
      /\b(focaccia\s+(?:col|al)\s+formaggio|quattro\s+formaggi|4\s+formaggi|cacio\s+e\s+pepe|fonduta|sformatin\w*\s+al\s+parmigiano|caprese|mozzarella|burrata|stracciatella|tagliere\s+di\s+formaggi|tiramisu|panna\s+cotta|cheesecake|gelat\w*|semifreddo|crema\s+di\s+formagg\w*|crema\s+al\s+parmigiano)\b/.test(titleNorm) ||
      (dishFamily === 'pizza_focaccia' && /\b(mozzarella|stracchino|formaggio|gorgonzola|burrata)\b/.test(bomText))
    ) {
      dairyRole = 'structural_unsubstitutable';
    } else if (hasCheeseOrHeavyDairyInBom && /\b(pansot\w*|raviol\w*\s+di\s+magro|raviol\w*\s+di\s+borragine|pasqualina|ripien\w*)\b/.test(titleNorm)) {
      dairyRole = 'savory_herb_binder';
    } else if (hasCheeseOrHeavyDairyInBom) {
      dairyRole = 'secondary_umami_finisher';
    }
  }

  // 4. Cold Boat / Cooler Safety (zero onboard flame, zero raw unmarinated seafood, zero hot soup/fry/pasta)
  const boatSafeCold =
    dish.boatSafeCold !== undefined
      ? Boolean(dish.boatSafeCold)
      : Boolean(
          (course === 'piatto_unico_barca' ||
            ((dish.mealContexts || []).includes('boat_cooler') &&
              !/\b(crud[oi]|tartare|carpaccio|ostrich\w*|fritt\w*|frittura|cozze\s+alla\s+marinara|zuppa|brodetto|vellutata|spaghett\w*|trofie|trenette|raviol\w*|pansot\w*|risott\w*|gelat\w*|tiramisu|pizz\w*)\b/.test(titleNorm)))
        );

  // 5. Light Dinner Suitability (savory protein/veg dish, non-fried, non-dessert, non-pizza)
  const lightDinnerSuitable =
    dish.lightDinnerSuitable !== undefined
      ? Boolean(dish.lightDinnerSuitable)
      : Boolean(
          !['colazione', 'dolce', 'primo'].includes(course) &&
            dishFamily !== 'dessert_gelato' &&
            dishFamily !== 'pizza_focaccia' &&
            dishFamily !== 'fried_dish' &&
            !/\b(fritt\w*|frittura|pizz\w*|gelat\w*|tiramisu|dolce)\b/.test(titleNorm)
        );

  return {
    dishFamily,
    dairyRole,
    boatSafeCold,
    lightDinnerSuitable,
    canonicalTwinKey
  };
}

/**
 * Generates a scientific Ligurian substitution when an ingredient violates the active user profile
 * (e.g. substituting Parmigiano/Pecorino/Stracchino/Burro for a cheese-free profile while keeping
 * lipid mouthfeel, umami/sapidity, and structural emulsion).
 */
export function buildProfileSubstitution(bomItem, profileCompat) {
  const norm = normalizeSearchToken(bomItem.name || '');

  if (/\b(parmigiano|grana|pecorino|formaggio grattugiato)\b/.test(norm)) {
    return {
      substituted: true,
      originalName: bomItem.name,
      originalCreaId: bomItem.creaId,
      creaId: '008150', // Pinoli / Frutta secca lipidica
      name: 'Emulsione Ligure di Pinoli/Mandorle Tostate, Lievito Alimentare & Olio EVO (Variante Senza Formaggio)',
      rawGramsPerServing: bomItem.rawGramsPerServing,
      scientificRationale:
        'Sostituzione isocalorica e isostrutturale: i lipidi insaturi dei pinoli/mandorle finemente pestati + glutammato naturale replicano la sapidità umami e la legatura dell\'emulsione senza caseine.'
    };
  }

  if (/\b(stracchino|crescenza|prescinseua|ricotta|mozzarella|burro|panna|mascarpone)\b/.test(norm)) {
    return {
      substituted: true,
      originalName: bomItem.name,
      originalCreaId: bomItem.creaId,
      creaId: '009010',
      name: 'Crema Emulsionata di Mandorle Pelate, Acqua Amidacea & Olio EVO Riviera Ligure (Senza Latticini)',
      rawGramsPerServing: Math.max(10, Math.round(bomItem.rawGramsPerServing * 0.75)),
      scientificRationale:
        'Emulsione olio-in-acqua stabilizzata da proteine vegetali di mandorla e amilosio: sostituisce la fase grassa del latticino mantenendo cremosità e punto di fusione al palato.'
    };
  }

  return {
    substituted: true,
    originalName: bomItem.name,
    originalCreaId: bomItem.creaId,
    creaId: '009010',
    name: `Alternativa Compatibile Profilo (${bomItem.name} rimosso — ${profileCompat.reasons?.[0] || 'esclusione profilo'})`,
    rawGramsPerServing: bomItem.rawGramsPerServing,
    scientificRationale: 'Adattamento automatico per rispettare le esclusioni del profilo attivo.'
  };
}

const HEAT_SOURCE_TRANSLATION = {
  gas: {
    low: 'Fiamma dolce su bruciatore piccolo (corona minima, ~75–90°C)',
    medium: 'Fiamma media su bruciatore medio (~130–160°C)',
    high: 'Fiamma viva su bruciatore grande / tripla corona (180–210°C)',
    off_heat: 'Fuori dal fuoco (spostare la padella su griglia fredda, <65°C)'
  },
  induction: {
    low: 'Piano Induzione Livello 3–4 su 9 (Potenza impulsiva dolce, ~80–90°C)',
    medium: 'Piano Induzione Livello 6 su 9 (Conduzione magnetica stabile, ~145–165°C)',
    high: 'Piano Induzione Livello 8 / Boost iniziale 45s (Correnti di Foucault ad alta densità, 185–205°C)',
    off_heat: 'Fuori dalla zona attiva a induzione (azzeramento istantaneo dell\'isteresi magnetica, <65°C)'
  },
  electric_radiant: {
    low: 'Piastra Elettrica Livello 2 su 6 (preriscaldata 3 min)',
    medium: 'Piastra Elettrica Livello 4 su 6 (attenzione all\'inerzia termica residua)',
    high: 'Piastra Elettrica Livello 5–6 su 6 (preriscaldata 5 min)',
    off_heat: 'Spostare immediatamente fuori dalla piastra calda (alta inerzia termica della vetroceramica)'
  },
  boat_no_stove: {
    low: 'Modalità Cambusa Barca (assemblaggio a freddo / marinatura acida a temperatura controllata)',
    medium: 'Modalità Cambusa Barca (nessun fornello richiesto — rigenerazione o servizio in borsa termica)',
    high: 'Modalità Cambusa Barca (se in rada con fornelletto a gas basculante: fiamma media protetta dal vento)',
    off_heat: 'Assemblaggio a freddo in ciotola / contenitore ermetico da barca'
  }
};

export class RecipeAndArbitrageService {
  constructor(options = {}) {
    this.labNotebookPath = options.labNotebookPath || process.env.BASILICO_LAB_PATH || DEFAULT_LAB_NOTEBOOK_PATH;
    this._dishes = null;
    this._restaurants = null;
    this._customDishes = [];
    this._labNotes = null;
  }

  getDishesSeed() {
    if (!this._dishes) {
      this._dishes = JSON.parse(fs.readFileSync(DISHES_SEED_PATH, 'utf8'));
    }
    return [...this._customDishes, ...this._dishes];
  }

  getRestaurantsSeed() {
    if (!this._restaurants) {
      this._restaurants = JSON.parse(fs.readFileSync(RESTAURANTS_SEED_PATH, 'utf8'));
    }
    return this._restaurants;
  }

  _loadLabNotes() {
    if (this._labNotes) return this._labNotes;
    try {
      if (fs.existsSync(this.labNotebookPath)) {
        const parsed = JSON.parse(fs.readFileSync(this.labNotebookPath, 'utf8'));
        if (parsed && Array.isArray(parsed.entries)) {
          this._labNotes = parsed;
          return this._labNotes;
        }
      }
    } catch (_) {}
    this._labNotes = { entries: [] };
    return this._labNotes;
  }

  _saveLabNotes() {
    try {
      const dir = path.dirname(this.labNotebookPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const tmp = `${this.labNotebookPath}.tmp.${process.pid}.${Date.now()}`;
      fs.writeFileSync(tmp, JSON.stringify(this._labNotes, null, 2), 'utf8');
      fs.renameSync(tmp, this.labNotebookPath);
    } catch (_) {}
  }

  /**
   *Normalizes cookware IDs from dish seed (`padella`, `pentola`, `tagliere`, etc.)
   * to canonical Stanza 4 archetype IDs (`padella_antiaderente`, `pentola`, `coltello_chef`, `mortaio_marmo`, etc.).
   */
  _normalizeCookwareIds(rawTools = []) {
    const mapped = new Set();
    for (const t of rawTools) {
      const norm = normalizeSearchToken(t);
      if (norm.includes('padella') || norm.includes('wok') || norm.includes('casseruola')) {
        mapped.add('padella_antiaderente');
      } else if (norm.includes('pentola')) {
        mapped.add('pentola');
      } else if (norm.includes('forno') || norm.includes('teglia') || norm.includes('pirofila')) {
        mapped.add('teglia_forno');
      } else if (norm.includes('mortaio')) {
        mapped.add('mortaio_marmo');
      } else if (norm.includes('bistecchiera') || norm.includes('griglia')) {
        mapped.add('bistecchiera_ghisa');
      } else if (norm.includes('pentola_pressione') || norm.includes('pressione')) {
        mapped.add('pentola_pressione');
      } else {
        mapped.add('coltello_chef');
      }
    }
    if (mapped.size === 0) mapped.add('coltello_chef');
    return Array.from(mapped);
  }

  /**
   * Evaluates a dish with:
   *  - Profile-Adapted Variant (substituting excluded ingredients like cheese)
   *  - Dual Cost (`purePortionCostEur` & `checkoutCashCostEur`) scaled by `servings`
   *  - Live Arbitrage against `menuPriceEuro * servings`
   *  - CREA Nutritional Aggregation per serving
   *  - Pantry & Cookware Feasibility Traffic Light
   */
  async evaluateDish(dish, context = {}) {
    const servings = Math.max(1, Math.min(12, Number(context.servings) || 1));
    const activeOffers = context.activeOffers || (await offerService.getOffers({ domain: 'food_human', limit: 100 })).offers || [];
    const pantryItems = context.pantryItems || pantryService.getPantryState().items || [];
    const kitchenState = context.kitchenState || kitchenInventoryService.getKitchenState();
    const ownedToolSet = new Set(kitchenState.effectiveTools.map((t) => t.id));
    const profileId = context.profileId || userProfileService.getProfileById().id;

    let hasProfileSubstitution = false;
    const substitutionsApplied = [];
    const enrichedBom = [];

    let purePortionCostEur = 0;
    let checkoutCashCostEur = 0;
    let inPantryCount = 0;
    let onPromoCount = 0;

    let totalKcalPerServing = 0;
    let totalProteinGPerServing = 0;
    let totalLipidsGPerServing = 0;
    let totalCarbsGPerServing = 0;

    for (const rawItem of dish.bom || []) {
      const compat = userProfileService.checkItemCompatibility(
        { title: rawItem.name, category: '' },
        profileId
      );

      let workingItem = { ...rawItem };
      let substitutionInfo = null;

      if (!compat.isCompatible) {
        hasProfileSubstitution = true;
        substitutionInfo = buildProfileSubstitution(rawItem, compat);
        workingItem = {
          ...rawItem,
          creaId: substitutionInfo.creaId,
          name: substitutionInfo.name,
          rawGramsPerServing: substitutionInfo.rawGramsPerServing
        };
        substitutionsApplied.push(substitutionInfo);
      }

      const rawGramsTotal = Number((workingItem.rawGramsPerServing * servings).toFixed(1));
      const cookedGramsTotal = Number(
        (rawGramsTotal * (Number(workingItem.yieldFactor) || 1.0)).toFixed(1)
      );

      // 1. Check Pantry availability (by CREA ID or head token)
      const itemNorm = normalizeSearchToken(workingItem.name);
      const headToken = itemNorm.split(' ').find((w) => w.length >= 4) || itemNorm;

      const pantryMatch = pantryItems.find(
        (p) =>
          p.remainingWeightGrams > 0 &&
          ((workingItem.creaId && p.creaFoodId === workingItem.creaId) ||
            (headToken && normalizeSearchToken(p.title).includes(headToken)))
      );

      const gramsInPantry = pantryMatch ? Math.min(rawGramsTotal, pantryMatch.remainingWeightGrams) : 0;
      const netMissingGrams = Math.max(0, Number((rawGramsTotal - gramsInPantry).toFixed(1)));
      if (gramsInPantry >= rawGramsTotal * 0.8) {
        inPantryCount += 1;
      }

      // 2. Match Active Rapallo Offer (by CREA ID or head token)
      const matchedOffer = activeOffers.find((off) => {
        const offNorm = normalizeSearchToken(`${off.title} ${off.category || ''}`);
        return headToken && headToken.length >= 4 && offNorm.includes(headToken);
      });

      const family = classifyIngredientFamily(workingItem.name);
      const refSpec = DEFAULT_INGREDIENT_PACK_AND_PRICE[family] || DEFAULT_INGREDIENT_PACK_AND_PRICE.default;

      let euroPerKg = refSpec.euroPerKg;
      let packSizeGrams = refSpec.packGrams;
      let packPriceEur = Number(((euroPerKg * packSizeGrams) / 1000).toFixed(2));
      let priceSource = 'historical_rapallo_baseline';
      let matchedOfferBrief = null;

      if (matchedOffer) {
        onPromoCount += 1;
        priceSource = 'live_rapallo_offer';
        const extractedKg = matchedOffer.unitPriceExtraction?.ediblePricePerKg || matchedOffer.pricePerKg;
        if (extractedKg && extractedKg > 0.5 && extractedKg < 180) {
          euroPerKg = Number(extractedKg);
        } else if (matchedOffer.price > 0) {
          euroPerKg = Number(((matchedOffer.price / refSpec.packGrams) * 1000).toFixed(2));
        }
        packPriceEur = Number(matchedOffer.price || packPriceEur);
        packSizeGrams = matchedOffer.unitPriceExtraction?.netWeightGrams || refSpec.packGrams;
        matchedOfferBrief = {
          id: matchedOffer.id,
          title: matchedOffer.title,
          chainName: matchedOffer.chainName || matchedOffer.chainId,
          price: matchedOffer.price,
          euroPerKg
        };
      }

      const linePureCostEur = Number(((rawGramsTotal / 1000) * euroPerKg).toFixed(2));
      purePortionCostEur += linePureCostEur;

      const packsToBuy = netMissingGrams > 0 ? Math.ceil(netMissingGrams / packSizeGrams) : 0;
      const lineCheckoutCostEur = Number((packsToBuy * packPriceEur).toFixed(2));
      checkoutCashCostEur += lineCheckoutCostEur;

      // 3. CREA Nutrition lookup per serving
      const creaFood = workingItem.creaId ? creaService.getFoodById(workingItem.creaId) : null;
      const factor100 = (workingItem.rawGramsPerServing * ((creaFood?.ediblePartPct || 100) / 100)) / 100;
      const kcal = creaFood?.keyMetrics?.kcal ? Number((creaFood.keyMetrics.kcal * factor100).toFixed(1)) : 0;
      const prot = creaFood?.keyMetrics?.proteinG ? Number((creaFood.keyMetrics.proteinG * factor100).toFixed(1)) : 0;
      const lip = creaFood?.keyMetrics?.fatG ? Number((creaFood.keyMetrics.fatG * factor100).toFixed(1)) : 0;
      const carb = creaFood?.keyMetrics?.carbsG ? Number((creaFood.keyMetrics.carbsG * factor100).toFixed(1)) : 0;

      totalKcalPerServing += kcal;
      totalProteinGPerServing += prot;
      totalLipidsGPerServing += lip;
      totalCarbsGPerServing += carb;

      enrichedBom.push({
        creaId: workingItem.creaId,
        creaName: creaFood?.name || workingItem.name,
        name: workingItem.name,
        rawGramsPerServing: workingItem.rawGramsPerServing,
        rawGramsTotal,
        cookedGramsTotal,
        yieldFactor: workingItem.yieldFactor || 1.0,
        notes: workingItem.notes || '',
        substitutionInfo,
        inPantryGrams: gramsInPantry,
        netMissingGrams,
        packsToBuy,
        packSizeGrams,
        euroPerKg: Number(euroPerKg.toFixed(2)),
        linePureCostEur,
        lineCheckoutCostEur,
        priceSource,
        matchedOffer: matchedOfferBrief,
        nutritionPerServing: {
          kcal,
          proteinG: prot,
          lipidsG: lip,
          carbsG: carb
        }
      });
    }

    purePortionCostEur = Number(purePortionCostEur.toFixed(2));
    checkoutCashCostEur = Number(checkoutCashCostEur.toFixed(2));
    const purePortionCostPerServingEur = Number((purePortionCostEur / servings).toFixed(2));
    const totalMenuPriceEur = Number(((dish.menuPriceEuro || 15) * servings).toFixed(2));
    const arbitrageSavingsEur = Number((totalMenuPriceEur - purePortionCostEur).toFixed(2));
    const arbitrageSavingsPct =
      totalMenuPriceEur > 0 ? Math.round((arbitrageSavingsEur / totalMenuPriceEur) * 100) : 0;

    const canonicalTools = this._normalizeCookwareIds(dish.cookwareRequired || []);
    const missingCookware = canonicalTools.filter((tid) => !ownedToolSet.has(tid));
    const bomCount = Math.max(1, enrichedBom.length);
    const pantryCoveragePct = Math.round((inPantryCount / bomCount) * 100);

    let feasibilityStatus = 'ready';
    if (missingCookware.length > 0) {
      feasibilityStatus = 'missing_cookware';
    } else if (pantryCoveragePct < 50) {
      feasibilityStatus = 'needs_shopping';
    }

    const meta = classifyDishMetadata(dish);

    return {
      ...dish,
      ...meta,
      servings,
      canonicalCookwareIds: canonicalTools,
      hasProfileSubstitution,
      substitutionsApplied,
      bom: enrichedBom,
      costAndArbitrage: {
        menuPricePerServingEur: Number(dish.menuPriceEuro || 15),
        totalMenuPriceEur,
        purePortionCostPerServingEur,
        purePortionCostEur,
        checkoutCashCostEur,
        arbitrageSavingsEur,
        arbitrageSavingsPct,
        onPromoIngredientsCount: onPromoCount
      },
      feasibility: {
        status: feasibilityStatus,
        pantryCoveragePct,
        inPantryIngredientsCount: inPantryCount,
        totalIngredientsCount: enrichedBom.length,
        missingCookware,
        cookwareReady: missingCookware.length === 0
      },
      nutritionPerServing: {
        energyKcal: Math.round(totalKcalPerServing),
        proteinG: Number(totalProteinGPerServing.toFixed(1)),
        lipidsG: Number(totalLipidsGPerServing.toFixed(1)),
        carbsG: Number(totalCarbsGPerServing.toFixed(1))
      }
    };
  }

  /**
   * Lists and filters dishes with real-time arbitrage, profile variants, and restaurants metadata.
   */
  async queryDishes(filters = {}) {
    const allDishes = this.getDishesSeed();
    const restaurants = this.getRestaurantsSeed();
    const activeOffers = (await offerService.getOffers({ domain: 'food_human', limit: 100 })).offers || [];
    const pantryItems = pantryService.getPantryState().items || [];
    const kitchenState = kitchenInventoryService.getKitchenState();
    const profileId = filters.profileId || userProfileService.getProfileById().id;
    const servings = Math.max(1, Math.min(12, Number(filters.servings) || 1));

    // Precompute homologous restaurant twin groups across the full catalog
    const twinGroups = new Map();
    for (const rawD of allDishes) {
      const m = classifyDishMetadata(rawD);
      if (rawD.sourceType === 'tigullio_restaurant' && m.canonicalTwinKey) {
        if (!twinGroups.has(m.canonicalTwinKey)) twinGroups.set(m.canonicalTwinKey, []);
        twinGroups.get(m.canonicalTwinKey).push({
          dishId: rawD.id,
          title: rawD.title,
          restaurantId: rawD.restaurantId,
          restaurantName: rawD.restaurantName,
          city: rawD.city,
          menuPriceEuro: Number(rawD.menuPriceEuro || 0)
        });
      }
    }

    let filtered = allDishes.map((d) => ({ ...d, ...classifyDishMetadata(d) }));

    if (filters.sourceType && filters.sourceType !== 'all') {
      filtered = filtered.filter((d) => d.sourceType === filters.sourceType);
    }
    if (filters.restaurantId && filters.restaurantId !== 'all') {
      filtered = filtered.filter((d) => d.restaurantId === filters.restaurantId);
    }
    if (filters.course && filters.course !== 'all') {
      filtered = filtered.filter((d) => d.course === filters.course);
    }
    if (filters.mealContext && filters.mealContext !== 'all') {
      if (filters.mealContext === 'boat_cooler') {
        filtered = filtered.filter((d) => d.boatSafeCold || (d.mealContexts || []).includes('boat_cooler'));
      } else {
        filtered = filtered.filter((d) => (d.mealContexts || []).includes(filters.mealContext));
      }
    }
    if (filters.q && String(filters.q).trim()) {
      const qNorm = normalizeSearchToken(filters.q);
      filtered = filtered.filter((d) => {
        const hay = normalizeSearchToken(
          `${d.title} ${d.restaurantName || ''} ${d.city || ''} ${(d.bom || []).map((b) => b.name).join(' ')}`
        );
        return hay.includes(qNorm);
      });
    }

    const deduplicateTwins = filters.deduplicateTwins === true || filters.deduplicateTwins === 'true';
    if (deduplicateTwins) {
      const seenTwinKeys = new Set();
      filtered = filtered.filter((d) => {
        if (d.sourceType !== 'tigullio_restaurant' || !d.canonicalTwinKey) return true;
        if (seenTwinKeys.has(d.canonicalTwinKey)) return false;
        seenTwinKeys.add(d.canonicalTwinKey);
        return true;
      });
    }

    const totalMatching = filtered.length;
    const limit = Math.max(1, Math.min(350, Number(filters.limit) || 80));
    const offset = Math.max(0, Number(filters.offset) || 0);

    const evaluated = [];
    for (const d of filtered.slice(offset, offset + limit)) {
      const ev = await this.evaluateDish(d, {
        servings,
        activeOffers,
        pantryItems,
        kitchenState,
        profileId
      });
      const twins = d.sourceType === 'tigullio_restaurant' ? twinGroups.get(d.canonicalTwinKey) || [] : [];
      if (twins.length > 1) {
        const prices = twins.map((t) => t.menuPriceEuro).filter((p) => p > 0);
        ev.comparableRestaurants = twins;
        ev.restaurantPriceRangeEur = {
          count: twins.length,
          minEur: prices.length ? Math.min(...prices) : ev.menuPriceEuro,
          maxEur: prices.length ? Math.max(...prices) : ev.menuPriceEuro
        };
      } else {
        ev.comparableRestaurants = [];
        ev.restaurantPriceRangeEur = null;
      }
      evaluated.push(ev);
    }

    if (filters.sortBy === 'arbitrage_desc') {
      evaluated.sort((a, b) => b.costAndArbitrage.arbitrageSavingsEur - a.costAndArbitrage.arbitrageSavingsEur);
    } else if (filters.sortBy === 'cost_asc') {
      evaluated.sort((a, b) => a.costAndArbitrage.purePortionCostPerServingEur - b.costAndArbitrage.purePortionCostPerServingEur);
    } else if (filters.sortBy === 'pantry_desc') {
      evaluated.sort((a, b) => b.feasibility.pantryCoveragePct - a.feasibility.pantryCoveragePct);
    }

    return {
      totalDishesInCatalog: allDishes.length,
      totalMatching,
      servings,
      activeProfileId: profileId,
      restaurants,
      dishes: evaluated
    };
  }

  /**
   * 80/20 Submodular Maximum Coverage Solver (`computeMaxCoverage8020`):
   * Finds the top `budgetIngredientsCount` (default 12) ingredients that unlock the maximum
   * number of complete dishes in the catalog, weighted by active Rapallo promotions and pantry presence.
   */
  async computeMaxCoverage8020(options = {}) {
    const topK = Math.max(3, Math.min(25, Number(options.topK) || 12));
    const allDishes = this.getDishesSeed();
    const activeOffers = (await offerService.getOffers({ domain: 'food_human', limit: 100 })).offers || [];
    const pantryItems = pantryService.getPantryState().items || [];

    // Build ingredient universe keyed by canonical CREA ID or normalized name
    const ingredientMap = new Map();
    const dishSets = [];

    for (const dish of allDishes) {
      const reqKeys = new Set();
      for (const b of dish.bom || []) {
        const key = b.creaId || normalizeSearchToken(b.name);
        reqKeys.add(key);
        if (!ingredientMap.has(key)) {
          const normName = normalizeSearchToken(b.name);
          const head = normName.split(' ').find((w) => w.length >= 4) || normName;
          const inPantry = pantryItems.some(
            (p) => p.remainingWeightGrams > 0 && (p.creaFoodId === b.creaId || normalizeSearchToken(p.title).includes(head))
          );
          const promoOffer = activeOffers.find((off) =>
            head && head.length >= 4 && normalizeSearchToken(off.title).includes(head)
          );
          ingredientMap.set(key, {
            key,
            creaId: b.creaId || null,
            name: b.name,
            dishFrequency: 0,
            inPantry,
            onPromoInRapallo: Boolean(promoOffer),
            promoChain: promoOffer ? promoOffer.chainName || promoOffer.chainId : null,
            promoPrice: promoOffer ? promoOffer.price : null
          });
        }
        ingredientMap.get(key).dishFrequency += 1;
      }
      dishSets.push({
        id: dish.id,
        title: dish.title,
        restaurantName: dish.restaurantName,
        menuPriceEuro: dish.menuPriceEuro,
        reqKeys
      });
    }

    // Seed selected set with items already in user pantry
    const selectedKeys = new Set();
    for (const [k, info] of ingredientMap.entries()) {
      if (info.inPantry) selectedKeys.add(k);
    }

    const greedySteps = [];
    while (greedySteps.length < topK) {
      let bestCandidate = null;
      let bestScore = -1;
      let bestNewlyUnlocked = 0;

      for (const [key, info] of ingredientMap.entries()) {
        if (selectedKeys.has(key)) continue;

        let newlyUnlocked = 0;
        let partialProgressScore = 0;

        for (const ds of dishSets) {
          if (!ds.reqKeys.has(key)) continue;
          let missingCount = 0;
          for (const rk of ds.reqKeys) {
            if (!selectedKeys.has(rk)) missingCount += 1;
          }
          if (missingCount === 1) {
            newlyUnlocked += 1;
            partialProgressScore += 3.0;
          } else if (missingCount === 2) {
            partialProgressScore += 1.0;
          } else {
            partialProgressScore += 0.25;
          }
        }

        const promoBonus = info.onPromoInRapallo ? 1.25 : 1.0;
        const score = (partialProgressScore + info.dishFrequency * 0.15) * promoBonus;

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = info;
          bestNewlyUnlocked = newlyUnlocked;
        }
      }

      if (!bestCandidate) break;
      selectedKeys.add(bestCandidate.key);

      const cumulativeUnlockedDishes = dishSets.filter((ds) =>
        Array.from(ds.reqKeys).every((rk) => selectedKeys.has(rk))
      );

      greedySteps.push({
        rank: greedySteps.length + 1,
        ...bestCandidate,
        newlyUnlockedDishesCount: bestNewlyUnlocked,
        cumulativeUnlockedDishesCount: cumulativeUnlockedDishes.length,
        cumulativeUnlockedPct: Math.round((cumulativeUnlockedDishes.length / Math.max(1, dishSets.length)) * 100)
      });
    }

    const finalUnlockedDishes = dishSets
      .filter((ds) => Array.from(ds.reqKeys).every((rk) => selectedKeys.has(rk)))
      .slice(0, 30)
      .map((d) => ({
        id: d.id,
        title: d.title,
        restaurantName: d.restaurantName,
        menuPriceEuro: d.menuPriceEuro
      }));

    return {
      totalCatalogDishes: dishSets.length,
      alreadyInPantryCount: Array.from(ingredientMap.values()).filter((i) => i.inPantry).length,
      topK,
      paretoBasket: greedySteps,
      unlockedDishesCount: finalUnlockedDishes.length,
      unlockedDishesSample: finalUnlockedDishes
    };
  }

  /**
   * Generates a complete Harvard "Science & Cooking" step-by-step interactive session
   * adapted to the user's active stove (`gas`, `induction`, `electric_radiant`, `boat_no_stove`),
   * plus embedded Kitchen Reset protocols for the cookware used.
   */
  async getScientificCookingSession(dishId, options = {}) {
    const allDishes = this.getDishesSeed();
    const dish = allDishes.find((d) => d.id === dishId || String(d.numericId) === String(dishId));
    if (!dish) {
      const err = new Error(`Piatto non trovato: ${dishId}`);
      err.status = 404;
      throw err;
    }

    const kitchenState = kitchenInventoryService.getKitchenState();
    const heatSource = options.heatSource || kitchenState.heatSource || 'gas';
    const heatDict = HEAT_SOURCE_TRANSLATION[heatSource] || HEAT_SOURCE_TRANSLATION.gas;
    const evaluated = await this.evaluateDish(dish, {
      servings: options.servings || 1,
      kitchenState,
      profileId: options.profileId
    });

    // Build structured scientific steps from BOM + dish course
    const isColdBoat = (dish.mealContexts || []).includes('boat_cooler') && dish.course === 'piatto_unico_barca';

    const steps = [];
    // Step 1: Mise en place & osmotic/thermal preparation
    steps.push({
      stepNumber: 1,
      phase: 'Mise en Place & Preparazione Fisico-Chimica',
      title: 'Pesatura di precisione e preparazione delle superfici cellulari',
      heatLevel: 'off_heat',
      stoveInstruction: heatDict.off_heat,
      durationSeconds: 180,
      timerType: 'active',
      scientificPrinciple:
        'Controllo dell\'acqua superficiale e della granulometria: tamponare proteine e pesci con carta assorbente elimina il calore latente di evaporazione (2.260 J/g) che altrimenti bloccherebbe la temperatura a 100°C impedendo la reazione di Maillard.',
      instructions: evaluated.bom.map((b) => `${b.name}: ${b.rawGramsTotal}g — ${b.notes || 'preparare sul tagliere'}`).join(' · '),
      sensoryCues: {
        visual: 'Superfici proteiche asciutte e tagli regolari di uguale sezione termica',
        acoustic: 'Silenzio operativo (nessun contatto prematuro con pentola fredda)',
        olfactory: 'Profumo fresco delle materie prime crude'
      }
    });

    if (isColdBoat) {
      steps.push({
        stepNumber: 2,
        phase: 'Chelazione Acida & Emulsione a Freddo per Cambusa Barca',
        title: 'Assemblaggio osmotico e protezione lipidica per borsa termica',
        heatLevel: 'off_heat',
        stoveInstruction: heatDict.off_heat,
        durationSeconds: 120,
        timerType: 'active',
        scientificPrinciple:
          'Acido ascorbico/citrico + lipidi monoinsaturi dell\'Olio EVO Ligure: l\'acidificazione a pH ~4.6 inibisce l\'ossidazione enzimatica (polifenolossidasi) e aumenta la biodisponibilità del ferro non-eme durante la conservazione in barca.',
        instructions:
          'Unire prima la componente proteica e i legumi/ortaggi ben scolati, emulsionare a parte olio EVO e succo di limone battendo per creare micro-micelle, quindi condire e chiudere in contenitore ermetico.',
        sensoryCues: {
          visual: 'Velo lucido uniforme sugli ingredienti senza separazione acquosa sul fondo',
          acoustic: 'Suono vellutato durante il mescolamento',
          olfactory: 'Bouquet agrumato-erbaceo netto'
        }
      });
    } else {
      steps.push({
        stepNumber: 2,
        phase: 'Trattamento Termico Primario (Cinetica di Denaturazione / Gelatinizzazione)',
        title:
          dish.course === 'primo'
            ? 'Idratazione e gelatinizzazione controllata degli amidi (65–85°C) + base aromatica'
            : 'Reazione di Maillard controllata (>140°C) e denaturazione proteica dolce al cuore',
        heatLevel: dish.course === 'primo' ? 'medium' : 'high',
        stoveInstruction: dish.course === 'primo' ? heatDict.medium : heatDict.high,
        durationSeconds: Math.max(240, (dish.prepMinutes || 15) * 35),
        timerType: 'passive',
        scientificPrinciple:
          dish.course === 'primo'
            ? 'I granuli di amido assorbono acqua calda gonfiandosi e rilasciando amilosio lineare nell\'acqua di cottura: questo biopolimero agirà da tensioattivo naturale per stabilizzare l\'emulsione con l\'Olio EVO senza bisogno di panna o formaggi.'
            : 'Sopra i 140°C gli zuccheri riducenti reagiscono con i gruppi amminici delle proteine (Maillard) generando pirazine e composti tostati, mentre al cuore la temperatura resta tra 52°C e 62°C preservando i succhi miofibrillari.',
        instructions:
          dish.course === 'primo'
            ? 'Scolare al dente (2 minuti prima del tempo nominale) conservando una tazza di acqua amidacea biancastra e trasferire nella padella del condimento.'
            : 'Adagiare l\'ingrediente principale solo a metallo in temperatura; non muovere nei primi 90 secondi per non lacerare la crosta proteica in formazione.',
        sensoryCues: {
          visual:
            dish.course === 'primo'
              ? 'Acqua di cottura leggermente opalescente e bordo esterno della pasta traslucido'
              : 'Doratura ambrata uniforme sui bordi e contrazione elastica controllata',
          acoustic: 'Sfrigolio vivo e regolare (100–120 Hz, bolle fini di vapore)',
          olfactory: 'Note calde di nocciola tostata, mare e composti aromatici liposolubili'
        }
      });

      steps.push({
        stepNumber: 3,
        phase: 'Mantecatura / Emulsione Fuori Fuoco (<65°C) & Riposo dei Succhi',
        title: 'Legatura dell\'emulsione e ridistribuzione dei gradienti di pressione',
        heatLevel: 'off_heat',
        stoveInstruction: heatDict.off_heat,
        durationSeconds: 90,
        timerType: 'active',
        scientificPrinciple:
          'Fuori dal fuoco (<65°C) i polifenoli volatili dell\'Olio EVO Ligure non evaporano e le proteine non coagulano: il movimento meccanico disperde i lipidi in micro-goccioline stabili (per le carni/pesci: il riposo di 90s rilassa le fibre muscolari trattenendo fino al +12% di succhi).',
        instructions:
          'Spostare la pentola fuori dalla sorgente di calore, aggiungere l\'Olio EVO a filo (o la variante ligure senza latticini) ed emulsionare energicamente prima di impiattare.',
        sensoryCues: {
          visual: 'Salsa lucida, cremosa e velante sul cucchiaio senza gocce d\'olio separate',
          acoustic: 'Suono cremoso ("onda" morbida in padella)',
          olfactory: 'Esplosione di olio extravergine crudo ed erbe fresche'
        }
      });
    }

    const kitchenReset = await kitchenResetService.generateProtocol(evaluated.canonicalCookwareIds);
    const labNotes = this.getLabNotesForDish(dish.id);

    return {
      dish: evaluated,
      heatSource,
      availableHeatSources: ['gas', 'induction', 'electric_radiant', 'boat_no_stove'],
      scientificSteps: steps,
      kitchenReset,
      labNotes
    };
  }

  getLabNotesForDish(dishId = null) {
    const state = this._loadLabNotes();
    if (!dishId) return state.entries;
    return state.entries.filter((e) => e.dishId === dishId);
  }

  saveLabNote(dishId, payload = {}) {
    const state = this._loadLabNotes();
    const entry = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dishId: String(dishId),
      dishTitle: payload.dishTitle || String(dishId),
      rating: Math.max(1, Math.min(5, Number(payload.rating) || 5)),
      actualCookedWeightGrams: payload.actualCookedWeightGrams ? Number(payload.actualCookedWeightGrams) : null,
      saltAndHydrationNotes: String(payload.saltAndHydrationNotes || '').trim(),
      heatSourceUsed: payload.heatSourceUsed || 'gas',
      createdAt: new Date().toISOString()
    };
    state.entries.unshift(entry);
    this._saveLabNotes();
    return entry;
  }

  /**
   * Deconstructs a user-submitted restaurant dish/menu description into a scientific BOM + CREA + Arbitrage dish.
   */
  async deconstructCustomMenuDish(payload = {}) {
    const title = String(payload.title || '').trim();
    if (!title) {
      const err = new Error('Titolo del piatto ristorante obbligatorio per la de-costruzione');
      err.status = 400;
      throw err;
    }

    const restaurantName = String(payload.restaurantName || 'Ristorante del Tigullio (De-costruzione Live)').trim();
    const city = String(payload.city || 'Rapallo / Tigullio').trim();
    const menuPriceEuro = Math.max(4, Number(payload.menuPriceEuro) || 20);
    const rawIngredientsText = String(payload.ingredientsText || title);

    // Match tokens against CREA foods
    const tokens = normalizeSearchToken(rawIngredientsText)
      .split(/[,;.\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);

    const bom = [];
    const searchCandidates = tokens.length > 0 ? tokens : [title];

    for (const chunk of searchCandidates.slice(0, 6)) {
      const creaRes = creaService.searchAndRankFoods({ q: chunk, limit: 1 });
      const topFood = creaRes.foods?.[0];
      if (topFood) {
        bom.push({
          creaId: topFood.id,
          name: topFood.name,
          rawGramsPerServing: 90,
          yieldFactor: 1.0,
          cookwareRequired: 'padella_antiaderente',
          notes: 'Ingrediente estratto e mappato automaticamente su tabella CREA'
        });
      }
    }

    // Always ensure Ligurian EVO oil if BOM is sparse
    if (bom.length === 0) {
      bom.push(
        {
          creaId: '120010',
          name: 'Pesce fresco / Ingrediente principale del Golfo',
          rawGramsPerServing: 160,
          yieldFactor: 0.85,
          cookwareRequired: 'padella_antiaderente',
          notes: 'Cottura millimetrica sulla pelle'
        },
        {
          creaId: '009010',
          name: 'Olio extra vergine di oliva ligure',
          rawGramsPerServing: 15,
          yieldFactor: 1.0,
          cookwareRequired: 'padella_antiaderente',
          notes: 'Emulsione fuori fuoco'
        }
      );
    }

    const customDish = {
      id: `custom-dish-${Date.now()}`,
      title,
      sourceType: 'tigullio_restaurant',
      authenticityLevel: 'live_menu_deconstruction',
      restaurantId: 'custom-tigullio',
      restaurantName,
      city,
      course: payload.course || 'secondo',
      menuPriceEuro,
      mealContexts: ['lunch_home', 'sunday_lab'],
      prepMinutes: 20,
      cookwareRequired: ['padella_antiaderente', 'coltello_chef'],
      bom
    };

    this._customDishes.unshift(customDish);
    return this.evaluateDish(customDish, { servings: payload.servings || 1 });
  }
}

export const recipeAndArbitrageService = new RecipeAndArbitrageService();
export default recipeAndArbitrageService;
