/**
 * Basilico — Multi-Domain Taxonomy Classifier (ADR-0007, Level 1.4)
 * Location: server/services/domainClassifier.js
 *
 * Strictly partitions every commercial product/offer into one of 5 closed domains:
 *  - 'food_human'       : Alimenti e bevande per consumo umano (unico dominio ammesso in CREA/Ricette/Dieta)
 *  - 'home_cleaning'    : Cura casa, detersivi, chimica superfici, spugne, carta casa
 *  - 'kitchen_cookware' : Pentole, padelle, coltelli, elettrodomestici e attrezzatura cucina
 *  - 'personal_care'    : Igiene e cura della persona (shampoo, dentifricio, cosmetica)
 *  - 'pet_care'         : Alimenti e accessori per animali domestici (Arcaplanet, crocchette, lettiera)
 */

export const VALID_PRODUCT_DOMAINS = [
  'food_human',
  'home_cleaning',
  'kitchen_cookware',
  'personal_care',
  'pet_care'
];

export const DOMAIN_LABELS = {
  food_human: 'Alimenti & Bevande',
  home_cleaning: 'Cura Casa & Detergenza',
  kitchen_cookware: 'Pentole, Cucina & Tech',
  personal_care: 'Igiene & Cura Persona',
  pet_care: 'Pet & Animali'
};

const PET_REGEX = /\b(cane|cani|gatto|gatti|crocchett\w*|lettiera|antiparassitar\w*|guinzagli\w*|cuccia|purina|whiskas|felix|friskies|monge|royal canin|sheba|cesar|gourmet gold|almo nature|trainer|acana|orijen|vitakraft|migliorcane|migliorgatto|bocconcini per|umido gatto|umido cane|arcaplanet)\b/i;

const COOKWARE_TECH_REGEX = /\b(padell\w*|pentol\w*|casseruol\w*|tegame|wok|bistecchiera|coperchi\w*|coltell\w*|tagliere|mortaio|frullator\w*|impastatrice|friggitrice|forno|microonde|tostapane|bollitore|bilancia|caffettiera|moka|aspirapolvere|ferro da stiro|lavatrice|lavastoviglie|frigorifero|televisore|smart tv|smartphone|notebook|tablet|auricolar\w*|batteria di pentole|antiaderente|induzione|lagostina|ballarini|tescoma|moneta|pyrex|bormioli|tognana|ariete|de'longhi|delonghi|moulinex|philips|rowenta|braun|dyson|samsung|lg|xiaomi|apple|iphone)\b/i;

const PERSONAL_CARE_REGEX = /\b(shampoo|balsamo capelli|bagnoschiuma|bagnodoccia|docciaschiuma|dentifrici\w*|spazzolin\w*|collutorio|deodorant\w*|profum\w*|eau de toilette|crema viso|crema corpo|crema mani|maschera viso|siero viso|struccant\w*|fondotinta|mascara|rossetto|assorbent\w*|salvaslip|pannolin\w*|rasoi\w*|schiuma da barba|dopobarba|sapone liquido|sapone intimo|detergente intimo|fazzolett\w*|carta igienica|cotone idrofilo|cerotti|solare|protezione solare|tinta capelli)\b/i;

const HOME_CLEANING_REGEX = /\b(detersiv\w*|ammorbident\w*|sgrassator\w*|candeggina|anticalcare|disincrostant\w*|igienizzant\w*|disinfettant\w*|lavapavimenti|pulitore|brillantante|cura lavastoviglie|tabs lavastoviglie|capsule lavatrice|bucato|smacchiator\w*|spugn\w*|pagliett\w*|panno|microfibra|mocio|scopa|sacchi nettezza|sacchi spazzatura|asciugatutto|rotoloni|pellicola|alluminio cucina|carta forno|insetticida|profumatore ambiente|deumidificatore|chanteclair|finish|fairy|svelto|napisan|lysoform|ace\b|viakal|cif\b|bref|pril|dash|dixan|omino bianco|coccolino|vernel|lenor|winni's|quasar|ajax|vetril|mastro lindo|wc net|duck|scottex|regina|foxy)\b/i;

const EXPLICIT_FOOD_GUARD_REGEX = /\b(pasta|spaghetti|penne|fusilli|riso|farina|pane|focaccia|biscott\w*|frollini|caffe|latte|yogurt|mozzarella|ricotta|formaggio|parmigiano|grana|burro|uova|pollo|tacchino|manzo|bovino|suino|salsiccia|prosciutto|salame|mortadella|bresaola|tonno|salmone|merluzzo|orata|branzino|gamber\w*|cozze|vongole|olio|aceto|pomodor\w*|passata|ceci|fagioli|lenticchie|piselli|insalata|zucchine|melanzane|patate|carote|cipolle|mele|pere|banane|arance|limoni|acqua minerale|vino|birra|succo)\b/i;

/**
 * Deterministically classifies an offer or product into one of the 5 closed domains.
 *
 * @param {object} item - Offer or product object ({ title, brand, category, chainId, storeId })
 * @returns {'food_human' | 'home_cleaning' | 'kitchen_cookware' | 'personal_care' | 'pet_care'}
 */
export function classifyProductDomain(item = {}) {
  if (!item || typeof item !== 'object') return 'food_human';
  if (item.domain && VALID_PRODUCT_DOMAINS.includes(item.domain)) {
    return item.domain;
  }

  const title = String(item.title || '').trim();
  const brand = String(item.brand || '').trim();
  const category = String(item.category || '').trim();
  const chainId = String(item.chainId || item.storeId || '').toLowerCase();
  const combined = `${title} ${brand}`.toLowerCase();

  // 1. Pet store or explicit pet product
  if (chainId.includes('arcaplanet') || PET_REGEX.test(combined)) {
    return 'pet_care';
  }

  // 2. Personal care & hygiene
  if (category === 'Cura Persona e Igiene' || PERSONAL_CARE_REGEX.test(combined)) {
    return 'personal_care';
  }

  // 3. Home cleaning & detergents (checked BEFORE cookware/appliances so "Detersivo Lavatrice" -> home_cleaning)
  if (HOME_CLEANING_REGEX.test(combined)) {
    return 'home_cleaning';
  }

  // 4. Electronics / Cookware store or explicit cookware/appliance item (unless clearly food like "olio per friggere")
  if (chainId.includes('unieuro') || chainId.includes('casalinghi')) {
    if (!EXPLICIT_FOOD_GUARD_REGEX.test(combined) || COOKWARE_TECH_REGEX.test(combined)) {
      return 'kitchen_cookware';
    }
  }
  if (COOKWARE_TECH_REGEX.test(combined) && !EXPLICIT_FOOD_GUARD_REGEX.test(combined)) {
    return 'kitchen_cookware';
  }

  if (category === 'Cura Casa e Bucato' || chainId.includes('tigota') || chainId.includes('piume')) {
    if (EXPLICIT_FOOD_GUARD_REGEX.test(combined) && !HOME_CLEANING_REGEX.test(combined) && !PERSONAL_CARE_REGEX.test(combined)) {
      return 'food_human';
    }
    return 'home_cleaning';
  }

  // 5. Default for grocery supermarket categories
  return 'food_human';
}

/**
 * Checks if an offer/product is strictly eligible for human nutrition (CREA) and recipes.
 */
export function isHumanFoodOffer(item = {}) {
  return classifyProductDomain(item) === 'food_human';
}

export default {
  VALID_PRODUCT_DOMAINS,
  DOMAIN_LABELS,
  classifyProductDomain,
  isHumanFoodOffer
};
