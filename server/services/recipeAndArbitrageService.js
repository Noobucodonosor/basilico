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
import { offerService, enrichOfferRecord, normalizeSearchToken } from './offerService.js';
import { creaService } from './creaService.js';
import { pantryService } from './pantryService.js';
import { kitchenInventoryService, normalizeDishCookwareIds } from './kitchenInventoryService.js';
import { kitchenResetService } from './kitchenResetService.js';
import { userProfileService } from './userProfileService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DISHES_SEED_PATH = path.resolve(__dirname, '../../data/seed/recipes_and_dishes.json');
const RESTAURANTS_SEED_PATH = path.resolve(__dirname, '../../data/seed/restaurants_tigullio.json');
const DEFAULT_LAB_NOTEBOOK_PATH = path.resolve(__dirname, '../../data/cache/lab_notebook.json');

// Granular real-world commercial pack sizes (g) & baseline Rapallo prices (€/kg) when no active offer is matched
const GRANULAR_INGREDIENT_PACK_RULES = [
  { key: 'fresh_herbs', regex: /\b(basilico|prezzemolo|rosmarino|timo|maggiorana|salvia|menta|origano|erba cipollina|alloro)\b/, packGrams: 30, euroPerKg: 39.0 },
  { key: 'alliums_chili', regex: /\b(aglio|scalogno|peperoncin\w*|zenzero)\b/, packGrams: 100, euroPerKg: 11.9 },
  { key: 'citrus', regex: /\b(limon\w*|lime|succo di limone|scorza di limone)\b/, packGrams: 250, euroPerKg: 2.8 },
  { key: 'pine_bottarga', regex: /\b(pinoli|bottarga|zafferano|tartufo)\b/, packGrams: 50, euroPerKg: 58.0 },
  { key: 'olives_capers_anchovies', regex: /\b(olive|capperi|acciug\w*\s+sott\w*|acciug\w*\s+dissalat\w*|alici\s+sott\w*)\b/, packGrams: 150, euroPerKg: 18.5 },
  { key: 'nuts_seeds', regex: /\b(mandorl\w*|noci|nocciol\w*|pistacch\w*|anacard\w*|arachid\w*)\b/, packGrams: 200, euroPerKg: 17.5 },
  { key: 'honey_sweet', regex: /\b(miele|confettura|marmellata)\b/, packGrams: 250, euroPerKg: 11.5 },
  { key: 'wine_cooking', regex: /\b(vino\s+bianco|vino\s+rosso|vino\s+da\s+pasto|vermentino|pigato|barbera)\b/, packGrams: 750, euroPerKg: 7.9 },
  { key: 'pantry_micro', regex: /\b(sale|pepe|cacao|zucchero|aceto|lievito|cannella|noce moscata|cappero)\b/, packGrams: 200, euroPerKg: 6.5 },
  { key: 'yogurt_single', regex: /\b(yogurt|kefir|skyr)\b/, packGrams: 170, euroPerKg: 7.9 },
  { key: 'milk', regex: /^latte\b|\blatte\s+(?:intero|parzialmente|uht|fresco)\b/, packGrams: 1000, euroPerKg: 1.55 },
  { key: 'eggs', regex: /^(?!.*\b(?:pasta|sfoglia|tagliatell\w*|tagliolin\w*|lasagn\w*|biscott\w*|maionese)\b).*\b(uov\w*|albume|tuorlo)\b/, packGrams: 360, euroPerKg: 6.2 },
  { key: 'bread_bakery', regex: /\b(pane|focaccia|fette biscottate|gallett\w*|crostin\w*|panino|ciabatta)\b/, packGrams: 300, euroPerKg: 4.8 },
  { key: 'canned_fish', regex: /\b(tonno\s+(?:sott|al\s+naturale|in\s+olio|sgocciolat\w*)|sgombro\s+(?:al\s+naturale|sott|sgocciolat\w*)|filetti\s+di\s+sgombro\s+(?:al\s+naturale|sgocciolat\w*))\b/, packGrams: 160, euroPerKg: 21.0 },
  { key: 'smoked_cured', regex: /\b(salmone\s+affumicato|bresaola|prosciutto|speck|pancetta|guanciale|salame|mortadella)\b/, packGrams: 100, euroPerKg: 28.5 },
  { key: 'luxury_crustaceans', regex: /\b(astice|aragosta|gamber\w*\s+viol\w*|scamp\w*\s+reali)\b/, packGrams: 250, euroPerKg: 58.0 },
  { key: 'fresh_fish', regex: /\b(acciug\w*|alici|orata|branzino|spigola|salmone|tonno|sgombro|palamita|seppi\w*|calamar\w*|polpo|gamber\w*|scamp\w*|cozz\w*|vongol\w*|pesce|pescato|baccala|stoccafisso|merluzzo|nasello|capesante|rombo|sogliola)\b/, packGrams: 250, euroPerKg: 19.5 },
  { key: 'prime_beef_cuts', regex: /\b(vitellon\w*|costat\w*|entrecote|controfiletto|fiorentina|angus|fassone|chianina|agnello|filetto\s+di\s+(?:manzo|vitell\w*|bovino))\b/, packGrams: 250, euroPerKg: 31.0 },
  { key: 'meat_poultry', regex: /\b(manzo|bovino|vitell\w*|pollo|tacchino|coniglio|maiale|suino|anatra|faraona|salsiccia)\b/, packGrams: 300, euroPerKg: 13.8 },
  { key: 'fresh_pasta', regex: /\b(trofie|pansot\w*|raviol\w*|gnocch\w*|tagliolini|tagliatelle|sfoglia)\b/, packGrams: 250, euroPerKg: 7.8 },
  { key: 'dry_pasta_grains', regex: /\b(spaghett\w*|pasta|trenette|linguine|penne|fusilli|paccheri|riso|farro|avena|fiocchi\s+d\s*avena|farina)\b/, packGrams: 500, euroPerKg: 2.6 },
  { key: 'legumes_tomato', regex: /\b(ceci|fagiol\w*|lenticchi\w*|fave|piselli|passata|polpa\s+di\s+pomodoro|salsa\s+di\s+pomodoro|sugo|pelati|san\s+marzano)\b/, packGrams: 400, euroPerKg: 3.1 },
  { key: 'oil_fats', regex: /\b(olio)\b/, packGrams: 1000, euroPerKg: 9.8 },
  { key: 'dairy_cheese', regex: /\b(parmigiano|grana|pecorino|mozzarella|stracchino|crescenza|ricotta|formaggio|burro|panna|mascarpone|prescinseua|gorgonzola)\b/, packGrams: 200, euroPerKg: 16.0 },
  { key: 'fresh_fruit', regex: /\b(mele|mela|pere|pera|banan\w*|aranc\w*|mandarin\w*|clementin\w*|kiwi|fragol\w*|mirtill\w*|lampon\w*|more\b|pesch\w*|albicocch\w*|prugn\w*|susin\w*|ciliegi\w*|cachi|ananas|mango|papaya|passion\s*fruit|uva\b|agrume|frutta)\b/, packGrams: 400, euroPerKg: 3.2 },
  { key: 'fresh_vegetables', regex: /\b(pomodor\w*|zucchin\w*|spinac\w*|bietol\w*|borragine|sedano|cipoll\w*|patat\w*|carciof\w*|melanzan\w*|peperon\w*|insalat\w*|rucola|valerian\w*|misticanza|asparag\w*|fungh\w*|finocch\w*|carot\w*|broccol\w*|cavolfior\w*|cavol\w*|verza|zucca|fagiolin\w*|avocado|verdura|ortagg\w*)\b/, packGrams: 400, euroPerKg: 3.2 }
];

export function resolveIngredientPackSpec(name = '') {
  const norm = normalizeSearchToken(name);
  for (const rule of GRANULAR_INGREDIENT_PACK_RULES) {
    if (rule.regex.test(norm)) {
      return { family: rule.key, packGrams: rule.packGrams, euroPerKg: rule.euroPerKg };
    }
  }
  return { family: 'default', packGrams: 250, euroPerKg: 7.5 };
}

const COMPOSITE_OFFER_HEADS = new Set([
  'salsa', 'sugo', 'ragu', 'pesto', 'biscotti', 'biscotto', 'bis', 'baci', 'torta', 'torte', 'crostata',
  'gelato', 'gelati', 'patatine', 'chips', 'cracker', 'crackers', 'bevanda', 'succo', 'nettare',
  'liquore', 'amaro', 'vino', 'birra', 'aperitivo', 'preparato', 'dado', 'brodo', 'snack',
  'merendina', 'ravioli', 'tortellini', 'pansotti', 'pansoti', 'gnocchi', 'lasagne', 'pizza', 'pizze',
  'pinsa', 'focaccia', 'tocchetti', 'cotoletta', 'cotolette', 'polpette', 'cima', 'brandacujun', 'panissa'
]);

const LEADING_ARTICLES_SET = new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'l', 'un', 'uno', 'una']);
const STOP_WORDS_BOM = new Set([
  'di', 'del', 'dello', 'della', 'dei', 'degli', 'delle', 'al', 'allo', 'alla', 'ai', 'agli', 'alle',
  'in', 'con', 'da', 'per', 'su', 'o', 'e', 'fresco', 'fresca', 'freschi', 'fresche', 'crudo', 'cruda',
  'cotto', 'cotta', 'ligure', 'genovese', 'tigullio', 'riviera', 'italiano', 'italiana', 'dop', 'igp',
  'filetto', 'filetti', 'trancio', 'tranci', 'cuori', 'fette', 'bocconcini', 'spicchi', 'cubetti',
  'scolati', 'scolate', 'lessati', 'lessate', 'sgocciolato', 'sgocciolati', 'pulito', 'puliti'
]);

function extractOfferCoreWords(offer = {}) {
  let normTitle = normalizeSearchToken(offer.title || '');
  const normBrand = normalizeSearchToken(offer.brand || '');
  if (normBrand && normTitle.startsWith(`${normBrand} `)) {
    normTitle = normTitle.slice(normBrand.length).trim();
  }
  normTitle = normTitle.replace(/^\d+\s+(?!(?:kg|g|gr|hg|l|lt|ml|cl)\b)/, '').trim();
  const words = normTitle.split(' ').filter(Boolean);
  while (words.length > 1 && LEADING_ARTICLES_SET.has(words[0])) {
    words.shift();
  }
  return { stripped: words.join(' '), words };
}

export function findCompatiblePantryItem(workingItem = {}, pantryItems = []) {
  if (!workingItem || !Array.isArray(pantryItems) || pantryItems.length === 0) return null;
  const itemNorm = normalizeSearchToken(workingItem.name || '');
  const wantsCannedFish =
    /\b(sott\s*olio|al\s+naturale|sgocciolat\w*|scatola|vetro)\b/.test(itemNorm) ||
    ['123610', '123550', '123010', '120020'].includes(String(workingItem.creaId));
  const wantsRawOrFreshFish =
    !wantsCannedFish &&
    /\b(tonno|sgombro|salmone|acciug\w*|alici|orata|branzino|spigola|merluzzo|polpo|calamar\w*|gamber\w*)\b/.test(itemNorm);

  const headToken = itemNorm.split(' ').find((w) => w.length >= 4 && !STOP_WORDS_BOM.has(w)) || itemNorm.split(' ')[0];
  const headWordRegex = headToken && headToken.length >= 4 ? new RegExp(`\\b${headToken}\\b`, 'i') : null;

  return (
    pantryItems.find((p) => {
      if (!p || !(p.remainingWeightGrams > 0)) return false;
      const pNorm = normalizeSearchToken(p.title || '');
      const pIsCannedOrDry =
        p.zone === 'dry_pantry' ||
        /\b(vetro|scatola|sott\s*olio|al\s+naturale|sgocciolat\w*)\b/.test(pNorm) ||
        ['123610', '123550', '123010', '120020'].includes(String(p.creaFoodId));

      if (wantsRawOrFreshFish && pIsCannedOrDry) return false;
      if (wantsCannedFish && !pIsCannedOrDry && /\b(fresc\w*|crud\w*)\b/.test(pNorm)) return false;

      if (workingItem.creaId && p.creaFoodId && String(p.creaFoodId) === String(workingItem.creaId)) {
        return true;
      }
      if (!workingItem.isSubstitutedComposite && headWordRegex && headWordRegex.test(pNorm)) {
        return true;
      }
      return false;
    }) || null
  );
}

/**
 * Strict word-boundary & physical-state matcher between a recipe BOM line and active Rapallo offers.
 * Eliminates substring hallucinations ("Aglio" -> "Battaglio", "Tonno rosso crudo" -> "Rio Mare", "Latte" -> "Robiola").
 */
export function matchBomIngredientToOffer(workingItem = {}, activeOffers = []) {
  if (!workingItem || !Array.isArray(activeOffers) || activeOffers.length === 0) return null;

  const bomNorm = normalizeSearchToken(workingItem.name || '');
  if (!bomNorm) return null;

  // Reject substituted composite emulsions from matching random raw offers unless by exact CREA ID
  if (workingItem.isSubstitutedComposite) return null;

  const bomWords = bomNorm.split(' ').filter(Boolean);
  const coreNoun = bomWords.find((w) => w.length >= 4 && !STOP_WORDS_BOM.has(w)) || bomWords[0];
  const wantsCannedFish = /\b(sott\s*olio|al\s+naturale|sgocciolat\w*|scatola|vetro)\b/.test(bomNorm) || ['123610', '123550', '123010', '120020'].includes(String(workingItem.creaId));
  const wantsRawOrFreshFish = !wantsCannedFish && /\b(tonno|sgombro|salmone|acciug\w*|alici|orata|branzino|spigola|merluzzo|polpo|calamar\w*|gamber\w*)\b/.test(bomNorm);
  const wantsSmoked = /\b(affumicat\w*)\b/.test(bomNorm) || String(workingItem.creaId) === '122410';
  const wantsProsciuttoCrudo = /\bprosciutto\s+crudo\b/.test(bomNorm);
  const wantsProsciuttoCotto = /\bprosciutto\s+cotto\b/.test(bomNorm);
  const wantsPassataOrPelati = /\b(passata|polpa|pelat\w*|san\s+marzano)\b/.test(bomNorm);

  for (const off of activeOffers) {
    if (!off || off.isNamelessTile || (off.domain && off.domain !== 'food_human')) continue;

    const { stripped, words: offWords } = extractOfferCoreWords(off);
    if (!stripped || offWords.length === 0) continue;

    const offHead = offWords[0];

    // Physical-state & cured-cut incompatibilities (checked even if CREA ID is shared)
    const offIsCanned = /\b(rio\s+mare|angelo\s+parodi|asdomar|palmera|scatola|sott\s*olio|all\s*olio|in\s+olio|leggero|al\s+naturale)\b/.test(normalizeSearchToken(`${off.title} ${off.brand || ''}`));
    const offIsSmoked = /\b(affumicat\w*|norvegese)\b/.test(stripped);

    if (wantsRawOrFreshFish && !wantsSmoked && (offIsCanned || offIsSmoked)) continue;
    if (wantsCannedFish && !offIsCanned && /\b(fresc\w*|crud\w*|filetto\s+di\s+orata)\b/.test(stripped)) continue;
    if (wantsSmoked && !offIsSmoked) continue;
    if (wantsProsciuttoCrudo && (!/\bcrudo\b/.test(stripped) || /\bcotto\b/.test(stripped))) continue;
    if (wantsProsciuttoCotto && !/\bcotto\b/.test(stripped)) continue;

    // 1. Direct CREA Food ID match (highest precision)
    if (workingItem.creaId && off.creaMatch?.creaFoodId && String(off.creaMatch.creaFoodId) === String(workingItem.creaId)) {
      return off;
    }

    // 2. Reject composite processed offers when BOM asks for a raw/base ingredient
    if (COMPOSITE_OFFER_HEADS.has(offHead) && !bomWords.includes(offHead)) {
      continue;
    }

    // 3. Strict whole-word head match
    if (!coreNoun || coreNoun.length < 4) continue;

    // Special strictness for "latte", "olio", "noci", "mandorle", "pomodori"
    if (coreNoun === 'latte') {
      if (offHead === 'latte') return off;
      continue;
    }
    if (coreNoun === 'olio') {
      if (offHead === 'olio' && /\b(oliva|vergine|evo)\b/.test(stripped)) return off;
      continue;
    }
    if (['noci', 'mandorle', 'pinoli', 'nocciole'].includes(coreNoun)) {
      if (offHead === coreNoun) return off;
      continue;
    }
    if (coreNoun.startsWith('pomodor') || wantsPassataOrPelati) {
      const offIsPassata = /\b(passata|polpa|pelat\w*)\b/.test(stripped);
      if (wantsPassataOrPelati && offIsPassata) return off;
      if (!wantsPassataOrPelati && !offIsPassata && (offHead === 'pomodori' || offHead === 'pomodorini')) return off;
      continue;
    }
    if (coreNoun === 'pane' && !/\bcioccolat\w*\b/.test(bomNorm)) {
      if (/\b(cioccolat\w*|nutella|merend\w*|biscott\w*|dolc\w*)\b/.test(stripped)) continue;
    }
    if (coreNoun === 'pasta' && /\buov[oa]\b/.test(bomNorm)) {
      if (!/\b(uov[oa]|tagliatell\w*|tagliolin\w*|pappardell\w*|lasagn\w*)\b/.test(stripped)) continue;
    }

    // Exact whole-word match against offer's first 2 core tokens (after unwrapping "filetto di")
    const effectiveOffHead =
      ['filetto', 'filetti', 'trancio', 'tranci', 'cuori', 'fette', 'spicchi'].includes(offHead) && offWords[1] === 'di' && offWords[2]
        ? offWords[2]
        : offHead;

    if (effectiveOffHead === coreNoun) {
      return off;
    }
  }

  return null;
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
  } else if (/\b(farinata)\b.*\b(ceci)?\b/.test(titleNorm)) {
    canonicalTwinKey = 'farinata ligure di ceci';
  } else if (/\b(spaghett\w*)\b.*\b(pomodor\w*)\b/.test(titleNorm)) {
    canonicalTwinKey = 'spaghetti al pomodoro';
  } else if (/\b(filetto)\b.*\b(manzo|vitellon\w*|angus|bovino)\b/.test(titleNorm)) {
    canonicalTwinKey = 'filetto di manzo';
  } else if (/\b(fiorentina)\b/.test(titleNorm)) {
    canonicalTwinKey = 'fiorentina alla brace';
  }

  // 2. Dish Family (used by Stanza 6 anti-monotony solver: max 2/week per family)
  let dishFamily = dish.dishFamily || null;
  if (!dishFamily) {
    if (course === 'colazione' || (dish.mealContexts || []).includes('breakfast')) {
      dishFamily = /\b(uov\w*|salat\w*|focaccia)\b/.test(titleNorm) ? 'breakfast_savory' : 'breakfast_sweet';
    } else if (
      course === 'dolce' ||
      course === 'gelato' ||
      /\b(tiramisu|gelat\w*|sorbett\w*|panna cotta|torta dolce|crostata|semifreddo|cannol\w*|profiterol\w*|meringata|cheesecake|bunet|crema catalana|zabaione|dolce)\b/.test(titleNorm)
    ) {
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
 * Generates a scientific Ligurian substitution ONLY when dairy plays a secondary umami finishing
 * or savory herb-binding role (`dairyRole !== 'structural_unsubstitutable'`).
 */
export function buildProfileSubstitution(bomItem, profileCompat, dairyRole = 'secondary_umami_finisher') {
  const norm = normalizeSearchToken(bomItem.name || '');

  if (/\b(parmigiano|grana|pecorino|formaggio grattugiato)\b/.test(norm)) {
    return {
      substituted: true,
      originalName: bomItem.name,
      originalCreaId: bomItem.creaId,
      creaId: '008590', // Pinoli (verified CREA ID)
      name: 'Pinoli/Mandorle Tostate Pestati + Olio EVO Ligure (Finitura Sapida Senza Formaggio)',
      rawGramsPerServing: Math.max(8, Math.round(bomItem.rawGramsPerServing * 0.65)),
      isSubstitutedComposite: true,
      scientificRationale:
        'Sostituzione tradizionale ligure di magro: i lipidi insaturi dei pinoli pestati replicano la legatura dell\'emulsione senza caseine.'
    };
  }

  if (dairyRole === 'savory_herb_binder' || /\b(prescinseua|presinseua|ricotta|stracchino|crescenza)\b/.test(norm)) {
    return {
      substituted: true,
      originalName: bomItem.name,
      originalCreaId: bomItem.creaId,
      creaId: '006580', // Patate novelle (legante amidaceo ligure di magro)
      name: 'Legante Ligure "di Magro" di Patata Schiacciata, Mandorle Pelate & Maggiorana (Zero Latticini)',
      rawGramsPerServing: bomItem.rawGramsPerServing,
      isSubstitutedComposite: true,
      scientificRationale:
        'Tecnica storica ligure dei ripieni di magro: l\'amido retrogradato della patata + proteine di mandorla legano le erbe senza cagliata lattica.'
    };
  }

  if (/\b(burro|panna)\b/.test(norm)) {
    return {
      substituted: true,
      originalName: bomItem.name,
      originalCreaId: bomItem.creaId,
      creaId: '009210', // Olio di oliva extra vergine (verified CREA ID)
      name: 'Olio Extra Vergine di Oliva Riviera Ligure Emulsionato a Freddo',
      rawGramsPerServing: Math.max(8, Math.round(bomItem.rawGramsPerServing * 0.75)),
      isSubstitutedComposite: false,
      scientificRationale:
        'Mantecatura olio-acqua-amido fuori fuoco (<65°C) al posto dei grassi vaccini saturi.'
    };
  }

  return {
    substituted: true,
    originalName: bomItem.name,
    originalCreaId: bomItem.creaId,
    creaId: '009210',
    name: `Variante Ligure Compatibile (${bomItem.name} rimosso — ${profileCompat.reasons?.[0] || 'esclusione profilo'})`,
    rawGramsPerServing: Math.max(8, Math.round(bomItem.rawGramsPerServing * 0.6)),
    isSubstitutedComposite: true,
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

  _normalizeSeedDishRealism(dish) {
    if (!dish || typeof dish !== 'object') return dish;
    const titleNorm = normalizeSearchToken(dish.title || '');

    // 1. Multi-course Michelin tasting menus (11 & 7 courses): realistic brigade prep time & luxury multi-course BOM
    if (/\bmenu\s+degustazione\s+11\s+portate\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: 240,
        bom: [
          { creaId: '125100', name: 'Astice blu del Mar Ligure', rawGramsPerServing: 240, yieldFactor: 0.45, notes: 'Portate crostacei nobili e riduzione bisque' },
          { creaId: '125100', name: 'Gambero viola di Santa Margherita', rawGramsPerServing: 180, yieldFactor: 0.55, notes: 'Crudo marino e variazioni del Golfo' },
          { creaId: '123200', name: 'Filetto di branzino di lenza nostrano', rawGramsPerServing: 200, yieldFactor: 0.85, notes: 'Secondo principale alla brace / vapore' },
          { creaId: '121000', name: 'Capesante e pescato crudo del Golfo', rawGramsPerServing: 140, yieldFactor: 0.9, notes: 'Sequenza antipasti e crudi' },
          { creaId: '000800', name: 'Pasta di semola trafilata d\'autore', rawGramsPerServing: 80, yieldFactor: 2.1, notes: 'Primi piatti degustazione' },
          { creaId: '008610', name: 'Pinoli mediterranei scelti e tartufo', rawGramsPerServing: 35, yieldFactor: 1.0, notes: 'Finiture ed estrazioni aromatiche' },
          { creaId: '009210', name: 'Olio extravergine d\'oliva Riviera Ligure DOP', rawGramsPerServing: 35, yieldFactor: 1.0, notes: 'Emulsioni a freddo multi-portata' }
        ]
      };
    }

    if (/\bmenu\s+degustazione\s+7\s+portate\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: 180,
        bom: [
          { creaId: '125100', name: 'Gambero viola di Santa Margherita', rawGramsPerServing: 200, yieldFactor: 0.55, notes: 'Crudo e antipasto caldo del Golfo' },
          { creaId: '123200', name: 'Filetto di branzino di lenza nostrano', rawGramsPerServing: 180, yieldFactor: 0.85, notes: 'Portata principale ittica' },
          { creaId: '121000', name: 'Calamari e pescato crudo del Golfo', rawGramsPerServing: 130, yieldFactor: 0.85, notes: 'Sequenza mare' },
          { creaId: '000800', name: 'Pasta di semola trafilata d\'autore', rawGramsPerServing: 75, yieldFactor: 2.1, notes: 'Primo piatto degustazione' },
          { creaId: '008610', name: 'Pinoli mediterranei scelti', rawGramsPerServing: 25, yieldFactor: 1.0, notes: 'Colatura ed emulsione' },
          { creaId: '009210', name: 'Olio extravergine d\'oliva Riviera Ligure DOP', rawGramsPerServing: 25, yieldFactor: 1.0, notes: 'Finitura a crudo' }
        ]
      };
    }

    // 2. Blue Lobster & Santa Margherita Purple Shrimp signature dishes
    if (/\bastice\s+blu\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: Math.max(45, dish.prepMinutes || 25),
        bom: (dish.bom || []).map((b, idx) =>
          idx === 0 ? { ...b, name: 'Astice blu del Mar Ligure', rawGramsPerServing: 240 } : b
        )
      };
    }

    if (/\bgambero\s+viola\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: Math.max(35, dish.prepMinutes || 25),
        bom: (dish.bom || []).map((b, idx) =>
          idx === 0 ? { ...b, name: 'Gambero viola di Santa Margherita', rawGramsPerServing: 180 } : b
        )
      };
    }

    // 3. Monumental Ligurian Cappon Magro (multi-layer fish, shellfish & salsa verde)
    if (/\bcappon\s+magro\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: Math.max(90, dish.prepMinutes || 25)
      };
    }

    // 4. Fiorentina di Fassone (authentic T-bone weight & resting time)
    if (/\bfiorentina\s+di\s+fassone\b/.test(titleNorm)) {
      return {
        ...dish,
        prepMinutes: Math.max(35, dish.prepMinutes || 25),
        bom: (dish.bom || []).map((b, idx) =>
          idx === 0 ? { ...b, rawGramsPerServing: Math.max(450, b.rawGramsPerServing || 220) } : b
        )
      };
    }

    return dish;
  }

  getDishesSeed() {
    if (!this._dishes) {
      const raw = JSON.parse(fs.readFileSync(DISHES_SEED_PATH, 'utf8'));
      this._dishes = raw.map((d) => this._normalizeSeedDishRealism(d));
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
   * Normalizes cookware IDs from dish seed (`padella`, `pentola`, `tagliere`, etc.)
   * 1:1 to canonical Stanza 4 archetype IDs (`padella_antiaderente`, `casseruola_inox`, `pentola`, `mortaio`, `bistecchiera`, etc.).
   */
  _normalizeCookwareIds(rawTools = [], dishContext = null) {
    return normalizeDishCookwareIds(rawTools, dishContext);
  }

  async _getFullFoodOffers(profileId = null) {
    const raw = await offerService.getRawOffers();
    return raw
      .map((o) => enrichOfferRecord(o, profileId))
      .filter((o) => o && o.domain === 'food_human' && !o.isNamelessTile);
  }

  /**
   * Evaluates a dish with:
   *  - 3-Tier Profile-Adapted Variant (substituting secondary dairy OR flagging structural dairy dishes honestly)
   *  - Dual Cost (`purePortionCostEur` & `checkoutCashCostEur`) scaled by `servings`
   *  - Live Arbitrage against `menuPriceEuro * servings` using strict word-boundary + CREA ID matching
   *  - CREA Nutritional Aggregation per serving
   *  - Pantry & Cookware Feasibility Traffic Light
   */
  async evaluateDish(dish, context = {}) {
    const servings = Math.max(1, Math.min(12, Number(context.servings) || 1));
    const profileId = context.profileId || userProfileService.getProfileById().id;
    const activeOffers = context.activeOffers || (await this._getFullFoodOffers(profileId));
    const pantryItems = context.pantryItems || pantryService.getPantryState().items || [];
    const kitchenState = context.kitchenState || kitchenInventoryService.getKitchenState();
    const ownedToolSet = new Set(kitchenState.effectiveTools.map((t) => t.id));
    const meta = classifyDishMetadata(dish);

    let hasProfileSubstitution = false;
    let isExcludedByProfileIdentity = false;
    let profileExclusionReason = null;
    const substitutionsApplied = [];
    const enrichedBom = [];

    // Pre-check if the dish itself is structurally unsubstitutable for the active profile
    const dishTitleCompat = userProfileService.checkItemCompatibility(
      { title: dish.title, category: '' },
      profileId
    );
    const hasIncompatibleBomItem = (dish.bom || []).some(
      (b) => !userProfileService.checkItemCompatibility({ title: b.name, category: '' }, profileId).isCompatible
    );

    if (meta.dairyRole === 'structural_unsubstitutable' && (!dishTitleCompat.isCompatible || hasIncompatibleBomItem)) {
      isExcludedByProfileIdentity = true;
      profileExclusionReason =
        'Piatto strutturalmente identitario a base di formaggi/latticini non sostituibili senza snaturare la ricetta (escluso dai piani Zero Formaggi; visibile solo per studio arbitraggio o profilo Ospiti).';
    }

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

      if (!compat.isCompatible && !isExcludedByProfileIdentity) {
        hasProfileSubstitution = true;
        substitutionInfo = buildProfileSubstitution(rawItem, compat, meta.dairyRole);
        workingItem = {
          ...rawItem,
          creaId: substitutionInfo.creaId,
          name: substitutionInfo.name,
          rawGramsPerServing: substitutionInfo.rawGramsPerServing,
          isSubstitutedComposite: substitutionInfo.isSubstitutedComposite
        };
        substitutionsApplied.push(substitutionInfo);
      }

      const rawGramsTotal = Number((workingItem.rawGramsPerServing * servings).toFixed(1));
      const cookedGramsTotal = Number(
        (rawGramsTotal * (Number(workingItem.yieldFactor) || 1.0)).toFixed(1)
      );

      // 1. Check Pantry availability (by exact CREA ID or physical-state-compatible whole-word head token)
      const pantryMatch = findCompatiblePantryItem(workingItem, pantryItems);

      const gramsInPantry = pantryMatch ? Math.min(rawGramsTotal, pantryMatch.remainingWeightGrams) : 0;
      const netMissingGrams = Math.max(0, Number((rawGramsTotal - gramsInPantry).toFixed(1)));
      if (gramsInPantry >= rawGramsTotal * 0.8) {
        inPantryCount += 1;
      }

      // 2. Match Active Rapallo Offer via strict semantic & physical-state matcher
      const matchedOffer = matchBomIngredientToOffer(workingItem, activeOffers);
      const refSpec = resolveIngredientPackSpec(workingItem.name);

      let euroPerKg = refSpec.euroPerKg;
      let packSizeGrams = refSpec.packGrams;
      let packPriceEur = Number(((euroPerKg * packSizeGrams) / 1000).toFixed(2));
      let priceSource = 'historical_rapallo_baseline';
      let matchedOfferBrief = null;

      if (matchedOffer) {
        onPromoCount += 1;
        priceSource = 'live_rapallo_offer';
        const offerPromo = Number(matchedOffer.promoPrice ?? matchedOffer.price ?? 0);
        const extractedKg =
          matchedOffer.ediblePricePerKg ??
          matchedOffer.pricePerKg ??
          matchedOffer.pricePerLiter ??
          matchedOffer.referencePackEstimate?.estimatedEdiblePricePerKg ??
          matchedOffer.unitPriceExtraction?.ediblePricePerKg ??
          null;
        const extractedPackGrams =
          matchedOffer.drainedWeightGrams ??
          matchedOffer.packWeightGrams ??
          matchedOffer.packVolumeMl ??
          matchedOffer.referencePackEstimate?.estimatedEdibleGrams ??
          matchedOffer.unitPriceExtraction?.netWeightGrams ??
          refSpec.packGrams;

        if (extractedKg && extractedKg > 0.4 && extractedKg < 180) {
          euroPerKg = Number(extractedKg);
        } else if (offerPromo > 0) {
          euroPerKg = Number(((offerPromo / extractedPackGrams) * 1000).toFixed(2));
        }
        packSizeGrams = extractedPackGrams;
        packPriceEur = offerPromo > 0 ? Number(offerPromo.toFixed(2)) : packPriceEur;
        matchedOfferBrief = {
          id: matchedOffer.id,
          title: matchedOffer.title,
          storeId: matchedOffer.storeId,
          chainName: matchedOffer.storeName || matchedOffer.chainName || matchedOffer.brand || matchedOffer.chainId,
          price: packPriceEur,
          euroPerKg: Number(euroPerKg.toFixed(2))
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

    const canonicalTools = this._normalizeCookwareIds(dish.cookwareRequired || [], dish);
    const missingCookware = canonicalTools.filter((tid) => !ownedToolSet.has(tid));
    const bomCount = Math.max(1, enrichedBom.length);
    const pantryCoveragePct = Math.round((inPantryCount / bomCount) * 100);

    let feasibilityStatus = 'ready';
    if (missingCookware.length > 0) {
      feasibilityStatus = 'missing_cookware';
    } else if (pantryCoveragePct < 50) {
      feasibilityStatus = 'needs_shopping';
    }

    return {
      ...dish,
      ...meta,
      servings,
      canonicalCookwareIds: canonicalTools,
      hasProfileSubstitution,
      isExcludedByProfileIdentity,
      profileExclusionReason,
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
    const profileId = filters.profileId || userProfileService.getProfileById().id;
    const activeOffers = await this._getFullFoodOffers(profileId);
    const pantryItems = pantryService.getPantryState().items || [];
    const kitchenState = kitchenInventoryService.getKitchenState();
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

    const excludeIncompatible = filters.excludeIncompatible === true || filters.excludeIncompatible === 'true';
    if (excludeIncompatible) {
      filtered = filtered.filter((d) => {
        if (d.dairyRole !== 'structural_unsubstitutable') return true;
        const titleOk = userProfileService.checkItemCompatibility({ title: d.title, category: '' }, profileId).isCompatible;
        const bomOk = (d.bom || []).every(
          (b) => userProfileService.checkItemCompatibility({ title: b.name, category: '' }, profileId).isCompatible
        );
        return titleOk && bomOk;
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
    const activeOffers = await this._getFullFoodOffers(options.profileId || null);
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
          const head = normName.split(' ').find((w) => w.length >= 4 && !STOP_WORDS_BOM.has(w)) || normName.split(' ')[0];
          const headRegex = head && head.length >= 4 ? new RegExp(`\\b${head}\\b`, 'i') : null;
          const inPantry = pantryItems.some(
            (p) =>
              p.remainingWeightGrams > 0 &&
              ((b.creaId && String(p.creaFoodId) === String(b.creaId)) || (headRegex && headRegex.test(normalizeSearchToken(p.title))))
          );
          const promoOffer = matchBomIngredientToOffer(b, activeOffers);
          ingredientMap.set(key, {
            key,
            creaId: b.creaId || null,
            name: b.name,
            dishFrequency: 0,
            inPantry,
            onPromoInRapallo: Boolean(promoOffer),
            promoChain: promoOffer ? promoOffer.storeName || promoOffer.chainName || promoOffer.brand || promoOffer.chainId : null,
            promoPrice: promoOffer ? Number(promoOffer.promoPrice ?? promoOffer.price ?? 0) : null
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

    // Seed selected set with items already in user pantry + universal tap/salt/pepper baseline
    const selectedKeys = new Set();
    for (const [k, info] of ingredientMap.entries()) {
      if (info.inPantry || /^(sale|pepe|acqua)\b/.test(normalizeSearchToken(info.name || ''))) {
        selectedKeys.add(k);
      }
    }

    const greedySteps = [];
    while (greedySteps.length < topK) {
      let bestCandidate = null;
      let bestScore = -1;
      let bestNewlyUnlocked = 0;
      let bestNearlyUnlocked = 0;

      for (const [key, info] of ingredientMap.entries()) {
        if (selectedKeys.has(key)) continue;

        let newlyUnlocked = 0;
        let twoMissingCount = 0;
        let partialProgressScore = 0;

        for (const ds of dishSets) {
          if (!ds.reqKeys.has(key)) continue;
          let missingCount = 0;
          for (const rk of ds.reqKeys) {
            if (!selectedKeys.has(rk)) missingCount += 1;
          }
          if (missingCount === 1) {
            newlyUnlocked += 1;
            partialProgressScore += 28.0;
          } else if (missingCount === 2) {
            twoMissingCount += 1;
            partialProgressScore += 4.5;
          } else if (missingCount === 3) {
            partialProgressScore += 1.0;
          } else {
            partialProgressScore += 0.15;
          }
        }

        const promoBonus = info.onPromoInRapallo ? 1.15 : 1.0;
        const score = (partialProgressScore + info.dishFrequency * 0.1) * promoBonus;

        if (score > bestScore) {
          bestScore = score;
          bestCandidate = info;
          bestNewlyUnlocked = newlyUnlocked;
          bestNearlyUnlocked = twoMissingCount;
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
        nearlyUnlockedDishesCount: bestNearlyUnlocked,
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
   * Selects one of 8 distinct Harvard "Science & Cooking" culinary-physics archetypes
   * grounded in the dish's real BOM ingredients, weights, and `dishFamily`.
   */
  _buildScientificStepsForDish(evaluated, heatDict) {
    const bomSummary = evaluated.bom
      .map((b) => `${b.name} (${b.rawGramsTotal}g${b.notes ? ` — ${b.notes}` : ''})`)
      .join(' · ');
    const mainItem = evaluated.bom[0] || { name: evaluated.title, rawGramsTotal: 120 };
    const secondaryItem = evaluated.bom[1] || { name: 'base aromatica', rawGramsTotal: 40 };
    const fam = evaluated.dishFamily || 'mediterranean_vegetable';
    const prepSec = Math.max(180, (evaluated.prepMinutes || 15) * 30);

    // Archetype 1: Cold Osmotic Boat / Cooler Assembly
    if (evaluated.boatSafeCold && (evaluated.course === 'piatto_unico_barca' || !(evaluated.cookwareRequired || []).some((c) => /padella|pentola|forno|bistecchiera/i.test(c)))) {
      return {
        cookingArchetype: 'cold_osmotic_boat_cambusa',
        steps: [
          {
            stepNumber: 1,
            phase: 'Osmosi & Drenaggio per Cambusa',
            title: `Scolatura profonda e taglio calibrato di ${mainItem.name} (${mainItem.rawGramsTotal}g)`,
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 180,
            timerType: 'active',
            scientificPrinciple:
              'Rimuovere i liquidi di governo ad alta forza ionica evita che la pressione osmotica estragga acqua libera dagli ortaggi durante le ore in borsa termica, prevenendo il rammollimento cellulare.',
            instructions: `Preparare a freddo: ${bomSummary}. Tamponare con cura legumi o conserve ittiche prima dell'assemblaggio.`,
            sensoryCues: {
              visual: 'Ingredienti ben sgranati, asciutti in superficie e tagliati a sezione uniforme',
              acoustic: 'Nessun gocciolamento residuo nel colino',
              olfactory: 'Nota marina o vegetale pulita senza odore metallico di salamoia'
            }
          },
          {
            stepNumber: 2,
            phase: 'Chelazione Acida & Micro-Emulsione Lipidica',
            title: 'Battitura dell\'emulsione Olio EVO Ligure + agrume/aceto (pH ~4.6)',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.low,
            durationSeconds: 120,
            timerType: 'active',
            scientificPrinciple:
              'L\'acidificazione a pH ~4.6 inattiva la polifenolossidasi rallentando l\'imbrunimento enzimatico in barca, mentre i lipidi monoinsaturi dell\'Olio EVO incapsulano gli aromi liposolubili delle erbe liguri.',
            instructions:
              'Emulsionare energicamente con forchetta o barattolo chiuso la quota lipidica e acida finché diventa opalescente, poi avvolgere gli ingredienti principali.',
            sensoryCues: {
              visual: 'Velo lucido uniforme su ogni boccone senza pozzanghere acquose sul fondo',
              acoustic: 'Suono vellutato durante il mescolamento',
              olfactory: 'Bouquet fresco di agrumi ed erbe mediterranee'
            }
          },
          {
            stepNumber: 3,
            phase: 'Stabilizzazione Termica in Borsa Frigo (4–8°C)',
            title: 'Stoccaggio ermetico e maturazione aromatica controllata',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 90,
            timerType: 'passive',
            scientificPrinciple:
              'Tra 4°C e 8°C la diffusione aromatica nei lipidi prosegue lentamente mentre la cinetica batterica mesofila resta bloccata, garantendo sicurezza alimentare fino al consumo in rada.',
            instructions:
              'Chiudere in contenitore ermetico rigido (tenendo eventuali crostini/farinata separati fino al servizio per evitare migrazione di umidità) e riporre vicino ai siberini.',
            sensoryCues: {
              visual: 'Colori brillanti e struttura croccante preservata al momento dell\'apertura in barca',
              acoustic: 'Scrocchio netto della componente secca aggiunta al momento',
              olfactory: 'Esplosione balsamica all\'apertura del contenitore'
            }
          }
        ]
      };
    }

    // Archetype 2: Cold Pesto / Walnut Emulsion + Pasta
    if (fam === 'pesto_pasta' || fam === 'walnut_filled_pasta') {
      return {
        cookingArchetype: 'cold_emulsion_pesto_walnut',
        steps: [
          {
            stepNumber: 1,
            phase: 'Frantumazione a Freddo Anti-Ossidazione (<28°C)',
            title: 'Preparazione dell\'emulsione cruda di basilico/semi oleosi protetta dall\'Olio EVO',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 240,
            timerType: 'active',
            scientificPrinciple:
              'La polifenolossidasi delle foglie di basilico ossida i fenoli in chinoni bruni sopra i 30°C o a contatto con l\'aria: lavorare a freddo (<28°C) rivestendo subito le pareti cellulari rotte con Olio EVO mantiene intatta la clorofilla verde smeraldo e il linalolo.',
            instructions: `Pesare con precisione: ${bomSummary}. Lavorare a impulsi brevi con contenitore freddo o nel mortaio rotatorio senza scaldare la massa.`,
            sensoryCues: {
              visual: 'Crema verde brillante (o avorio vellutato per le noci) priva di aloni scuri ossidati',
              acoustic: 'Attrito cremoso e pastoso contro la parete del mortaio/ciotola',
              olfactory: 'Nota balsamica dolce e intensa di basilico di Pra\' / pinoli crudi (zero odore di erba cotta)'
            }
          },
          {
            stepNumber: 2,
            phase: 'Idratazione Amidacea della Pasta Fresca/Secca',
            title: `Bollitura in acqua salata (10g/L) di ${mainItem.name} (${mainItem.rawGramsTotal}g)`,
            heatLevel: 'medium',
            stoveInstruction: heatDict.medium,
            durationSeconds: Math.max(240, prepSec),
            timerType: 'passive',
            scientificPrinciple:
              'Durante l\'ebollizione i granuli di amido gelatinizzano tra 65°C e 85°C rilasciando amilosio lineare nell\'acqua: questo idrocolloide è indispensabile per legare l\'olio del pesto senza formaggi fusi o panna.',
            instructions:
              'Cuocere la pasta (e patate/fagiolini se previsti) in acqua sobbollente salata; prelevare mezzo mestolo di acqua amidacea e lasciarla intiepidire 30 secondi sotto gli 80°C.',
            sensoryCues: {
              visual: 'Acqua leggermente lattiginosa per l\'amido rilasciato; pasta elastica al morso',
              acoustic: 'Sobbollizione allegra e continua senza schiuma traboccante',
              olfactory: 'Profumo netto di grano/semola o erbe di ripieno'
            }
          },
          {
            stepNumber: 3,
            phase: 'Temperaggio Fuori Fuoco (<60°C) & Mantecatura a Freddo',
            title: 'Emulsione lontano dai fornelli per non cuocere il pesto/salsa di noci',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 90,
            timerType: 'active',
            scientificPrinciple:
              'Portare il pesto o la salsa di noci oltre i 65°C denatura le proteine dei pinoli/noci causando separazione dell\'olio ("stracciatura") e volatilizza gli oli essenziali termolabili del basilico.',
            instructions:
              'In una boule FUORI DAL FUOCO stemperare la salsa con 2 cucchiai di acqua di cottura tiepida, versare la pasta scolata e mescolare energicamente dal basso verso l\'alto.',
            sensoryCues: {
              visual: 'Velo cremoso e omogeneo avvolto attorno a ogni trofia/pansotto senza olio libero sul fondo',
              acoustic: 'Cremosità sonora ("ciac-ciac" morbido dell\'emulsione acqua-amido-olio)',
              olfactory: 'Bouquet esplosivo di basilico fresco, pinoli e Olio EVO Ligure a crudo'
            }
          }
        ]
      };
    }

    // Archetype 3: Amylopectin Risotto Kinetics
    if (fam === 'seafood_risotto' || fam === 'land_risotto') {
      return {
        cookingArchetype: 'amylopectin_risotto',
        steps: [
          {
            stepNumber: 1,
            phase: 'Tostatura Secca/Lipidica della Cariosside (110–120°C)',
            title: `Vetrificazione superficiale di ${mainItem.name} (${mainItem.rawGramsTotal}g)`,
            heatLevel: 'medium',
            stoveInstruction: heatDict.medium,
            durationSeconds: 150,
            timerType: 'active',
            scientificPrinciple:
              'Il calore moderato a secco o in velo d\'olio compatta gli strati esterni di amido della cariosside di riso, garantendo che il chicco rilasci amilopectina gradualmente senza sfaldarsi al cuore.',
            instructions: `Mise en place: ${bomSummary}. Tostare il riso mescolando finché i bordi del chicco diventano perlacei-traslucidi e caldi al tatto.`,
            sensoryCues: {
              visual: 'Bordo esterno del chicco traslucido con nucleo bianco ("perla") ben visibile',
              acoustic: 'Tintinnio cristallino dei chicchi contro il fondo della casseruola',
              olfactory: 'Aroma delicato di pane caldo e amido tostato'
            }
          },
          {
            stepNumber: 2,
            phase: 'Estrazione Meccanica dell\'Amilopectina (~92°C)',
            title: 'Cottura per assorbimento progressivo con brodo/fumetto caldo',
            heatLevel: 'medium',
            stoveInstruction: heatDict.medium,
            durationSeconds: 900,
            timerType: 'passive',
            scientificPrinciple:
              'Mantenere il liquido sempre vicino all\'ebollizione (~92°C) evita shock termici che bloccherebbero la gelatinizzazione, mentre l\'urto dolce tra i chicchi estrae l\'amilopectina ramificata creando viscosità naturale.',
            instructions:
              'Bagnare con mestoli successivi di liquido bollente man mano che il precedente viene assorbito; inserire i frutti di mare/ingredienti delicati solo negli ultimi 3–4 minuti per non indurirli.',
            sensoryCues: {
              visual: 'Bolle lente e dense ("effetto vulcano") in un fondo progressivamente legato',
              acoustic: 'Sobbollizione densa e ovattata',
              olfactory: 'Concentrazione aromatica crescente del fumetto/fondo vegetale'
            }
          },
          {
            stepNumber: 3,
            phase: 'Riposo Termico & Mantecatura all\'Onda (<65°C)',
            title: 'Emulsione viscoelastica fuori fuoco con Olio EVO freddo',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 120,
            timerType: 'active',
            scientificPrinciple:
              '60 secondi di riposo fuori fuoco abbassano la massa a ~65°C aumentando la viscosità dell\'amido; incorporando aria e Olio EVO freddo a frusta/onda si forma un\'emulsione O/W stabile senza burro né formaggio.',
            instructions:
              'Spegnere, attendere 60 secondi a pentola ferma, versare l\'Olio EVO freddo a filo (ed eventuale scorza/prezzemolo) e mantecare con colpo di polso fino a ottenere l\'onda.',
            sensoryCues: {
              visual: 'Risotto lucido che si distende piatto nel piatto formando un\'onda morbida',
              acoustic: 'Schiaffo sordo e vellutato dell\'onda durante il salto',
              olfactory: 'Profumo nitido di mare/orto bilanciato dal fruttato leggero dell\'EVO ligure'
            }
          }
        ]
      };
    }

    // Archetype 4: Starch-Emulsion Pasta (Risottatura & Amylose Surfactant)
    if (evaluated.course === 'primo') {
      return {
        cookingArchetype: 'starch_emulsion_pasta',
        steps: [
          {
            stepNumber: 1,
            phase: 'Estrazione Liposolubile & Base del Condimento',
            title: `Infusione aromatica controllata per ${evaluated.title}`,
            heatLevel: 'low',
            stoveInstruction: heatDict.low,
            durationSeconds: 210,
            timerType: 'active',
            scientificPrinciple:
              'I composti solforati dell\'aglio e i terpeni delle erbe sono liposolubili ma pirolizzano rapidamente sopra i 135°C diventando amari: l\'infusione dolce (<110°C) trasferisce l\'aroma nell\'olio senza bruciature.',
            instructions: `Pesare: ${bomSummary}. Avviare il fondo in padella ampia a calore dolce con Olio EVO e gli aromi prima di calare la pasta.`,
            sensoryCues: {
              visual: 'Micro-bollicine fini attorno ad aglio/erbe senza imbrunimento scuro',
              acoustic: 'Frigolio leggerissimo, quasi impercettibile',
              olfactory: 'Aroma dolce e rotondo di infusione mediterranea (zero note acri)'
            }
          },
          {
            stepNumber: 2,
            phase: 'Gelatinizzazione degli Amidi & Risottatura Finale',
            title: `Scolatura anticipata (-2 min) di ${mainItem.name} (${mainItem.rawGramsTotal}g) e legatura in padella`,
            heatLevel: 'medium',
            stoveInstruction: heatDict.medium,
            durationSeconds: Math.max(300, prepSec),
            timerType: 'passive',
            scientificPrinciple:
              'Finire gli ultimi 120 secondi della pasta direttamente nel sugo con acqua amidacea concentra l\'amilosio lineare sulla superficie ruvida della semola, creando un ponte anfifilico stabile tra acqua e grassi.',
            instructions:
              'Lessare la pasta in acqua ridotta del 30% per concentrare l\'amido, trasferirla al dente nella padella del condimento e ultimare con un mestolino di acqua bollente amidacea.',
            sensoryCues: {
              visual: 'Il liquido sul fondo passa da acquoso a cremina opalescente che avvolge gli spaghetti/pasta',
              acoustic: 'Sfrigolio umido che vira verso un suono denso e cremoso',
              olfactory: 'Fusione armonica tra grano duro e salsa calda'
            }
          },
          {
            stepNumber: 3,
            phase: 'Micro-Emulsione Fuori Fuoco (<65°C)',
            title: 'Salto meccanico fuori fiamma con Olio EVO Ligure a crudo',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 75,
            timerType: 'active',
            scientificPrinciple:
              'Sotto i 65°C il taglio meccanico del salto frantuma l\'Olio EVO in goccioline micrometriche stabilizzate dall\'amilosio, regalando cremosità da alta cucina e preservando i polifenoli senza latticini.',
            instructions:
              'Allontanare la padella dalla zona calda, versare un filo d\'Olio EVO crudo (ed erbe fresche finali) e saltare con energia per 30–45 secondi prima di servire subito.',
            sensoryCues: {
              visual: 'Pasta lucida, nappata al millimetro e senza pozza liquida sul piatto',
              acoustic: 'Onda cremosa durante il salto in padella',
              olfactory: 'Nota verde e fruttata dell\'extravergine ligure appena versato'
            }
          }
        ]
      };
    }

    // Archetype 5: Fish Skin Maillard / Gentle Marine Myosin Coagulation / Crudo
    if (fam === 'baked_or_pan_fish' || fam === 'shellfish_cephalopods' || fam === 'raw_crudo') {
      const isRaw = fam === 'raw_crudo';
      return {
        cookingArchetype: 'fish_skin_maillard_or_poach',
        steps: [
          {
            stepNumber: 1,
            phase: isRaw ? 'Catena del Freddo & Taglio Controfibra (0–4°C)' : 'Essiccazione Superficiale Anti-Vapore',
            title: `${isRaw ? 'Affettatura a lama fredda' : 'Tamponatura osmotica'} di ${mainItem.name} (${mainItem.rawGramsTotal}g)`,
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 180,
            timerType: 'active',
            scientificPrinciple: isRaw
              ? 'Il tessuto connettivo del pesce è a basso collagene: mantenere le fibre tra 0°C e 4°C irrigidisce temporaneamente i lipidi permettendo tagli netti senza schiacciamento cellulare.'
              : 'Ogni grammo di acqua superficiale richiede 2.260 Joule per evaporare, bloccando la pelle a 100°C (effetto bollito): tamponare a secco consente di superare subito i 145°C per la croccantezza.',
            instructions: `Preparare la linea: ${bomSummary}. ${isRaw ? 'Usare coltello affilatissimo su tagliere freddo.' : 'Tamponare perfettamente il pesce con carta assorbente e incidere leggermente la pelle.'}`,
            sensoryCues: {
              visual: isRaw ? 'Fette o cubi lucidi con spigoli netti e zero sfilacciature' : 'Pelle/superficie opaca e completamente asciutta al tatto',
              acoustic: 'Silenzio operativo in mise en place',
              olfactory: 'Odore pulitissimo di brezza marina e iodio (zero trimetilammina)'
            }
          },
          {
            stepNumber: 2,
            phase: isRaw ? 'Denaturazione Acida Superficiale Controllata' : 'Termodinamica Marina (Crosta >160°C · Cuore 50–54°C)',
            title: isRaw
              ? 'Condimento istantaneo per non "cuocere" eccessivamente la polpa nell\'acido'
              : `Cottura millimetrica di ${mainItem.name} preservando la miosina marina`,
            heatLevel: isRaw ? 'off_heat' : 'high',
            stoveInstruction: isRaw ? heatDict.off_heat : heatDict.high,
            durationSeconds: isRaw ? 90 : Math.max(240, prepSec),
            timerType: isRaw ? 'active' : 'passive',
            scientificPrinciple: isRaw
              ? 'L\'acido citrico abbassa il pH verso il punto isoelettrico delle proteine miofibrillari (~pH 5.2): applicarlo solo negli ultimi 60 secondi evita l\'opacizzazione gessosa profonda.'
              : 'La miosina ittica coagula già a 48–52°C (contro i 60°C+ dei mammiferi); oltre i 60°C le fibre espellono albumina bianca coagulata diventando stoppose.',
            instructions: isRaw
              ? 'Disporre sul piatto freddo, condire primero con Olio EVO Ligure (barriera lipidica) e solo all\'ultimo con poche gocce di agrume e sale in fiocchi.'
              : 'Cuocere per l\'80% del tempo dal lato della pelle (o a vapore/guazzetto breve per i molluschi) senza capovolgere continuamente.',
            sensoryCues: {
              visual: isRaw ? 'Polpa traslucida color rubino/perla appena velata dall\'olio' : 'Pelle dorata e croccante; polpa interna perlata e succosa senza grumi bianchi di albumina',
              acoustic: isRaw ? 'Silenzio cristallino' : 'Sfrigolio fine e continuo sulla pelle',
              olfactory: 'Note iodate nobili sposate a erbe liguri, olive o pinoli'
            }
          },
          {
            stepNumber: 3,
            phase: 'Carry-Over Termico & Nappatura Mediterranea',
            title: 'Riposo breve di 60s fuori fuoco ed emulsione al limone/EVO',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 60,
            timerType: 'active',
            scientificPrinciple:
              'L\'inerzia termica porta il cuore esattamente a 52–54°C fuori dalla fiamma senza sovracottura periferica, mentre l\'emulsione acqua-olio-limone lucida le fibre.',
            instructions:
              'Togliere subito dalla fonte di calore, lasciar assestare 60 secondi e nappare con il fondo aromatico emulsionato a crudo.',
            sensoryCues: {
              visual: 'Sfogliatura naturale dei petali di pesce sotto la forchetta',
              acoustic: 'Croccantezza netta sulla pelle (se arrosto/padella)',
              olfactory: 'Profumo fresco di Riviera Ligure'
            }
          }
        ]
      };
    }

    // Archetype 6: Meat Sear & Myofibrillar Pressure Relaxation (or Fried Crispness)
    if (fam === 'white_meat' || fam === 'red_meat' || fam === 'fried_dish') {
      const isFried = fam === 'fried_dish';
      return {
        cookingArchetype: 'meat_sear_and_myofibril_rest',
        steps: [
          {
            stepNumber: 1,
            phase: isFried ? 'Shock Termico Pastella/Infariatura' : 'Temperaggio & Asciugatura Miofibrillare',
            title: `Preparazione superficiale di ${mainItem.name} (${mainItem.rawGramsTotal}g)`,
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 180,
            timerType: 'active',
            scientificPrinciple: isFried
              ? 'Una panatura/pastella asciutta o freddissima genera vapore istantaneo al contatto con l\'olio a 175°C: il flusso di vapore verso l\'esterno impedisce fisicamente all\'olio di penetrare nell\'alimento.'
              : 'Portare la carne fuori dal frigo 15 min prima riduce il gradiente termico interno, mentre l\'asciugatura innesca la reazione di Maillard in metà tempo.',
            instructions: `Linea pesata: ${bomSummary}. Tamponare perfettamente e predisporre tutti gli aromi prima di accendere il fuoco.`,
            sensoryCues: {
              visual: 'Superficie asciutta e spessore regolare per cottura omogenea',
              acoustic: 'Nessun contatto a metallo freddo',
              olfactory: 'Aroma neutro e fresco delle materie prime'
            }
          },
          {
            stepNumber: 2,
            phase: isFried ? 'Frittura per Convezione a 175–180°C' : 'Reazione di Maillard (>155°C) & Controllo al Cuore',
            title: isFried
              ? 'Disidratazione croccante rapida senza crollo termico dell\'olio'
              : `Rosolatura di ${mainItem.name} (pirazine e composti tostati)`,
            heatLevel: 'high',
            stoveInstruction: heatDict.high,
            durationSeconds: Math.max(240, prepSec),
            timerType: 'passive',
            scientificPrinciple: isFried
              ? 'Sotto i 160°C l\'evaporazione rallenta e il cibo assorbe fino al triplo dei lipidi; a 175–180°C la crosta porosa vetrifica in 2–3 minuti mantenendo l\'interno succoso.'
              : 'Tra 155°C e 185°C amminoacidi e zuccheri riducenti formano centinaia di molecole aromatiche (pirazine, furani); girare ogni 60s uniforma l\'onda termica verso il cuore (56°C manzo / 70°C carni bianche).',
            instructions: isFried
              ? 'Immergere pochi pezzi per volta per non abbassare la temperatura; scolare su griglia o carta assorbente salando solo all\'uscita.'
              : 'Rosolare a metallo ben caldo senza forare le fibre; sfumare se previsto e completare fino alla temperatura target al cuore.',
            sensoryCues: {
              visual: 'Crosta dorato-ambrata uniforme (mai nera/carbonizzata)',
              acoustic: 'Sfrigolio allegro ad alta frequenza (bolle piccole e fitte)',
              olfactory: 'Note intense di arrosto, nocciola ed erbe aromatiche (rosmarino/timo)'
            }
          },
          {
            stepNumber: 3,
            phase: isFried ? 'Scolatura Aerata Anti-Condensa' : 'Rilassamento Miofibrillare & Deglassatura (<65°C)',
            title: isFried ? 'Servizio immediato croccante con sale marino' : 'Riposo obbligatorio di 180s per trattenere +12% di succhi',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: isFried ? 60 : 180,
            timerType: 'passive',
            scientificPrinciple: isFried
              ? 'Coprire un fritto intrappola il vapore acqueo residuo che reidrata l\'amido vetrificato in meno di 90 secondi distruggendo la croccantezza.'
              : 'Durante il riposo fuori fuoco le fibre di actina/miosina contratte si distendono e la viscosità dei succhi aumenta, evitando l\'emorragia di liquido sul tagliere al taglio.',
            instructions: isFried
              ? 'Salare solo a fine cottura su griglia aerata, accompagnare con spicchio di limone a parte e servire immediatamente.'
              : 'Trasferire su piatto tiepido per 3 minuti; nel frattempo deglassare i succhi caramellati del fondo ("fond") con un cucchiaio d\'acqua/vino e un filo d\'Olio EVO.',
            sensoryCues: {
              visual: 'Interno succoso e rosato/morbido con zero pozza di siero nel piatto',
              acoustic: isFried ? 'Crunch sonoro netto al primo morso' : 'Quiete termica durante il riposo',
              olfactory: 'Fondo di cottura concentrato e avvolgente'
            }
          }
        ]
      };
    }

    // Archetype 7: Differential Egg Protein Coagulation
    if (fam === 'eggs_savory' || fam === 'breakfast_savory') {
      return {
        cookingArchetype: 'egg_protein_coagulation',
        steps: [
          {
            stepNumber: 1,
            phase: 'Omogeneizzazione Proteica Senza Schiuma',
            title: `Preparazione delicata di ${mainItem.name} (${mainItem.rawGramsTotal}g) e ${secondaryItem.name}`,
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 120,
            timerType: 'active',
            scientificPrinciple:
              'Battere le uova con una forchetta anziché con la frusta rompe i filamenti di ovomucina senza inglobare bolle d\'aria che espandendosi e collassando renderebbero spugnosa la struttura.',
            instructions: `Pesare: ${bomSummary}. Salare leggermente le uova 2 minuti prima: gli ioni sodio schermano le cariche elettriche proteiche rendendo il coagulo più tenero.`,
            sensoryCues: {
              visual: 'Composto fluido e lucido senza schiuma superficiale',
              acoustic: 'Battito leggero e breve di forchetta',
              olfactory: 'Profumo fresco di erbe/verdure già pronte'
            }
          },
          {
            stepNumber: 2,
            phase: 'Coagulazione Differenziale (62°C → 70°C)',
            title: 'Cottura dolce sotto la soglia di sineresi (80°C)',
            heatLevel: 'low',
            stoveInstruction: heatDict.low,
            durationSeconds: 210,
            timerType: 'active',
            scientificPrinciple:
              'L\'ovotransferrina dell\'albume coagula a 62°C e il tuorlo diventa cremoso a 68–70°C; superare gli 82°C stringe eccessivamente il reticolo proteico spremendo fuori acqua libera (sineresi gommosa).',
            instructions:
              'Versare in padella antiaderente tiepida unta con un velo d\'Olio EVO, muovendo delicatamente con spatola in silicone per formare onde morbide e baveuse.',
            sensoryCues: {
              visual: 'Superficie ancora leggermente lucida e cremosa, zero doratura scura sul fondo',
              acoustic: 'Nessun sfrigolio violento (se frigge forte la padella è troppo calda)',
              olfactory: 'Aroma delicatissimo di uovo fresco ed erbe liguri'
            }
          },
          {
            stepNumber: 3,
            phase: 'Arresto dell\'Inerzia Termica',
            title: 'Impiattamento anticipato con completamento a calore residuo',
            heatLevel: 'off_heat',
            stoveInstruction: heatDict.off_heat,
            durationSeconds: 60,
            timerType: 'active',
            scientificPrinciple:
              'Togliere dal metallo quando manca ancora il 10% di cottura sfrutta il calore specifico accumulato per consegnare al piatto una texture setosa perfetta.',
            instructions:
              'Trasferire subito dalla padella calda al piatto, rifinire con un filo d\'Olio EVO Ligure crudo e pepe macinato fresco.',
            sensoryCues: {
              visual: 'Consistenza vellutata, morbida e fondente al palato',
              acoustic: 'Morbidezza assoluta al taglio',
              olfactory: 'Nota fresca finale dell\'olio extravergine'
            }
          }
        ]
      };
    }

    // Archetype 8: Baking, Legume/Oat Gelatinization & Mediterranean Vegetable Cooking
    return {
      cookingArchetype: 'baking_or_breakfast_gelatinization',
      steps: [
        {
          stepNumber: 1,
          phase: 'Idratazione & Bilanciamento Stechiometrico',
          title: `Pesatura di precisione di ${mainItem.name} (${mainItem.rawGramsTotal}g) e linea ingredienti`,
          heatLevel: 'off_heat',
          stoveInstruction: heatDict.off_heat,
          durationSeconds: 150,
          timerType: 'active',
          scientificPrinciple:
            'Nei cereali integrali, farine di ceci/grano e matrici vegetali il rapporto acqua:solidi governa la viscosità dei beta-glucani e la morbidezza delle pectine cellulari.',
          instructions: `Preparare sul banco: ${bomSummary}. Mescolare a freddo le polveri/fiocchi con i liquidi per evitare grumi idrofobici.`,
          sensoryCues: {
            visual: 'Idratazione uniforme senza sacche di farina/avena asciutta',
            acoustic: 'Mescolamento fluido e omogeneo',
            olfactory: 'Note naturali di cereali, frutta o ortaggi freschi'
          }
        },
        {
          stepNumber: 2,
          phase: 'Gelatinizzazione dei Polisaccaridi / Cottura Termica Controllata',
          title: `Trattamento termico calibrato per ${evaluated.title}`,
          heatLevel: 'medium',
          stoveInstruction: heatDict.medium,
          durationSeconds: Math.max(180, prepSec),
          timerType: 'passive',
          scientificPrinciple:
            'Tra 75°C e 95°C i beta-glucani e le emicellulose si solubilizzano creando una matrice cremosa o alveolata ad alto indice di sazietà e rilascio glicemico lento.',
          instructions:
            evaluated.course === 'colazione'
              ? 'Cuocere dolcemente mescolando (o assemblare a strati se a freddo con yogurt greco) finché i fiocchi/impasto raggiungono una consistenza vellutata.'
              : 'Cuocere a calore medio-regolare finché il cuore vegetale/amidaceo risulta tenero e la superficie leggermente caramellata.',
          sensoryCues: {
            visual: 'Struttura legata, cremosa o dorata ai bordi secondo la preparazione',
            acoustic: 'Sobbollizione dolce o lieve crepitio superficiale',
            olfactory: 'Sviluppo di note calde di cereale tostato, frutta o ortaggi mediterranei'
          }
        },
        {
          stepNumber: 3,
          phase: 'Finitura Nutrizionale Termolabile (<55°C)',
          title: 'Aggiunta fuori fuoco di grassi nobili, frutta secca o antiossidanti',
          heatLevel: 'off_heat',
          stoveInstruction: heatDict.off_heat,
          durationSeconds: 60,
          timerType: 'active',
          scientificPrinciple:
            'Inserire frutta fresca, miele grezzo, semi oleosi o Olio EVO sotto i 55°C preserva la vitamina C, gli enzimi naturali e il contrasto meccanico croccante-morbido.',
          instructions:
            'Togliere dal calore, completare con i topping croccanti/aromatici previsti dalla BOM e servire.',
          sensoryCues: {
            visual: 'Contrasto cromatico netto e guarnizione integra',
            acoustic: 'Contrasto tra base morbida e nota croccante di frutta secca/crostini',
            olfactory: 'Aroma pieno e pulito senza note di grasso ossidato'
          }
        }
      ]
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

    const { cookingArchetype, steps } = this._buildScientificStepsForDish(evaluated, heatDict);
    const kitchenReset = await kitchenResetService.generateProtocol(evaluated.canonicalCookwareIds);
    const labNotes = this.getLabNotesForDish(dish.id);

    return {
      dish: evaluated,
      cookingArchetype,
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
    const cleanRating = Math.max(1, Math.min(5, Number(payload.rating) || 5));
    const cleanWeight = payload.actualCookedWeightGrams ? Number(payload.actualCookedWeightGrams) : null;
    const cleanNotes = String(payload.saltAndHydrationNotes || '').trim();
    const cleanHeat = payload.heatSourceUsed || 'gas';

    // Deduplicate identical lab note entries so repeated clicks or test runs never create duplicate clones
    const existingIdx = state.entries.findIndex(
      (e) =>
        e.dishId === String(dishId) &&
        e.rating === cleanRating &&
        e.actualCookedWeightGrams === cleanWeight &&
        e.saltAndHydrationNotes === cleanNotes &&
        e.heatSourceUsed === cleanHeat
    );
    if (existingIdx !== -1) {
      const updated = {
        ...state.entries[existingIdx],
        dishTitle: payload.dishTitle || state.entries[existingIdx].dishTitle || String(dishId),
        createdAt: new Date().toISOString()
      };
      state.entries.splice(existingIdx, 1);
      state.entries.unshift(updated);
      this._saveLabNotes();
      return updated;
    }

    const entry = {
      id: `lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      dishId: String(dishId),
      dishTitle: payload.dishTitle || String(dishId),
      rating: cleanRating,
      actualCookedWeightGrams: cleanWeight,
      saltAndHydrationNotes: cleanNotes,
      heatSourceUsed: cleanHeat,
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
          creaId: '009210',
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
