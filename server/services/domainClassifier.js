/**
 * Basilico — Multi-Domain Taxonomy & Canonical Category Classifier (ADR-0007, ADR-0013, TASK-DATA-03)
 * Location: server/services/domainClassifier.js
 *
 * Strictly partitions every commercial product/offer into one of 6 closed domains:
 *  - 'food_human'       : Alimenti e bevande per consumo umano (unico dominio ammesso in CREA/Ricette/Dieta)
 *  - 'home_cleaning'    : Pura chimica casa, detersivi, disinfettanti, spugne, carta casa/cucina e sacchi
 *  - 'kitchen_cookware' : Pentole, padelle, coltelli, elettrodomestici cucina/casa e elettronica
 *  - 'personal_care'    : Igiene e cura della persona (shampoo, dentifricio, cosmetica, cura capelli, integratori)
 *  - 'pet_care'         : Alimenti e accessori per animali domestici (Arcaplanet, crocchette, lettiera)
 *  - 'bazar_seasonal'   : Giocattoli, addobbi natalizi/stagionali, tessile letto/bagno, abbigliamento e bazar casa
 */

export const VALID_PRODUCT_DOMAINS = [
  'food_human',
  'home_cleaning',
  'kitchen_cookware',
  'personal_care',
  'pet_care',
  'bazar_seasonal'
];

export const DOMAIN_LABELS = {
  food_human: 'Alimenti & Bevande',
  home_cleaning: 'Cura Casa & Detergenza',
  kitchen_cookware: 'Pentole, Cucina & Tech',
  personal_care: 'Igiene & Cura Persona',
  pet_care: 'Pet & Animali',
  bazar_seasonal: 'Giocattoli, Natale & Bazar'
};

export const FOOD_PRODUCT_CATEGORIES = [
  'Frutta e Verdura',
  'Carne e Pesce',
  'Latticini e Formaggi',
  'Pane e Pasticceria',
  'Dispensa e Pasta',
  'Colazione e Dolci',
  'Acqua e Bevande',
  'Surgelati'
];

export const NON_FOOD_PRODUCT_CATEGORIES = [
  'Cura Casa e Bucato',
  'Cura Persona e Igiene',
  'Pentole, Cucina ed Elettrodomestici',
  'Animali Domestici',
  'Giocattoli, Natale e Tempo Libero',
  'Tessile, Abbigliamento e Bazar Casa'
];

function stripAccents(str = '') {
  return String(str)
    .replace(/([a-zA-ZÀ-ÿ])-\s+([a-zA-ZÀ-ÿ])/g, '$1$2')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+-\s+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const PET_STRICT_FOOD_OR_BRAND_REGEX = /\b(crocchett\w*|lettiera|antiparassitar\w*|guinzagli\w*|cuccia|purina|whiskas|felix|friskies|monge|royal canin|sheba|cesar|gourmet gold|almo nature|trainer|acana|orijen|vitakraft|migliorcane|migliorgatto|bocconcini per (?:cane|cani|gatto|gatti)|umido (?:gatto|cane)|cibo per (?:cani|gatti)|snack (?:cane|gatto)|arcaplanet)\b/i;
const PET_ANIMAL_NOUN_REGEX = /\b(cane|cani|gatto|gatti)\b/i;

const TOYS_XMAS_LEISURE_REGEX = /\b(peluche|pelux|giocattol\w*|rocco giocattoli|rstoys|imctoys|imc toys|re\.el toys|zuru|globo\b|spin master|clementoni|ravensburger|lisciani|giochi uniti|hasbro|mattel|lego\b|playmobil|barbie|pokemon|nintendo|game\s*boy|playstation|\bps[45]\b|xbox|beyblade|hot wheels|squishmallows|radiocomand\w*|filoguidat\w*|costruzioni|mattoncini|bambol\w*|fa\s*-\s*shion\s+doll|fashion\s+doll|\bdoll\b|traxfigure|scacchi|air hockey|gioco\s+della|gioco\s+da\s+tavolo|goliath|grinch|gnom[oi]|follett[oi]|fermaporta|stopper|pupazz\w*|personagg\w*|bing\b|bagnetto\s+bing|maisonelle|set\s+fast\s+food|capibara|kawai\w*|lavagnett\w*|orso\s+(?:natale|con)|addobb\w*|albero\s+(?:di\s+)?natale|caten[ae]\s+(?:luminos\w*|led|micro)|luci\s+(?:led|natali\w*)|illuminazion\w*\s+led|minilucciol\w*|tenda\s+luminosa|decorazion\w*\s+(?:cagnolin\w*|follett\w*|natali\w*)|ghirland\w*|angelo\s+di\s+natale|stella\s+(?:di\s+natale|con\s+cascata)|corona\s+con\s+fiocco|lampione|palla\s+(?:con\s+luci|di\s+natale)|fiocco\s+con\s+luci|pacch[io]\s+(?:regalo|dono)|pacco\s+dono|cabina\s+telefono|lampad[ae]\s+(?:a\s+cuore|led|da\s+tavolo|comodino|ricaricabil\w*|notturn\w*)|tower\s+speaker|\bspeaker\b|cassa\s+(?:bluetooth|amplificata)|karaoke|giostra\s+animata|paesaggio\s+invernale|presep\w*|lantern\w*|tazza\s+mug\s+natalizi\w*|ciotola\s+natalizi\w*|\brgi\d{5,}\b|\bmey\s*\d{4,}\b|big\s+foot|ruota\s+libera|pista\s+(?:quad|treno)|champion\s*-\s*pista|mezzi\s+da\s+lavoro|trattore\s+con|pistola\s+con|proiettili\s+soffici|auto\s+in\s+metallo|soggetti\s+assortiti|valigetta\s+attrezzi|bisognini\s+o\s+dolce\s+nanna|gioia\s+mia|geco\s+interattivo|toys\s+garden|unicorno|30\s+anniversario|candy\s*-\s*set|solo\s*-\s*box\s+con|e-bike|ebike|fat\s+bike|bici\w*|monopattin\w*|valigi\w*|trolley)\b/i;

const TEXTILES_APPAREL_BAZAR_REGEX = /\b(completo letto|lenzuol\w*|trapunt\w*|piumin\w*\s+letto|copriletto|feder[ae]|cuscin\w*|asciugaman\w*|accappatoi\w*|tappet\w*|tovagli\w*(?!\s*carta)|canovacci\w*|presin\w*|bassetti|caleffi|gabel|pantalon\w*|magliett\w*|felp[ae]|giacc[ae]|pigiam\w*|calzin\w*|collant|mutand\w*|reggiseno|slip\s+(?:uomo|donna|bambin\w*|cotone)|pantofol\w*|ciabatt\w*|scarp\w*\s+(?:uomo|donna|bambin\w*|sport\w*)|candel[ae](?:\s+profumat\w*)?|portacandel\w*|diffusor\w*\s+(?:di\s+)?(?:fragranza|ambiente|bastoncini)|svegli[ae]|majestic|pile\s+(?:stilo|ministilo|alcaline)|batterie\s+(?:stilo|alcaline)|lampadin\w*|terriccio|concime|piant[ae]\s+(?:fiorit\w*|verd\w*|vaso|di\s+rosa)|poinsettia|kalanchoe|anthurium|azalea|orchide\w*|ciclam\w*|stendibiancheria|asse da stiro|ombrell\w*|cornic[ei]|portafoto)\b/i;

const TOYS_BAZAR_TEXTILES_REGEX = new RegExp(
  `(?:${TOYS_XMAS_LEISURE_REGEX.source}|${TEXTILES_APPAREL_BAZAR_REGEX.source})`,
  'i'
);

const PERSONAL_CARE_REGEX = /\b(shampoo|balsamo(?:\s+capelli|\s+rigenera\w*|\s+nutriente)?|maschera capelli|tinta capelli|piastra capelli|asciugacapelli|spazzola asciugacapelli|phon\b|acconciatur\w*|airwrap|styler|arricciacapelli|spica\s+per\s+i\s+tuoi\s+capelli|per\s+i\s+tuoi\s+capelli|cura\s+(?:dei\s+)?capelli|sauna facciale|specchio trucco|bagnoschiuma|bagnodoccia|bagnocrema|docciaschiuma|docciashampoo|doccia\s+crema|crema\s+bagno|spugn\w*\s+(?:di\s+mare|bagno|corpo|doccia|viso|make\s*up|trucco)|dentifrici\w*|spazzolin\w*|collutorio|filo interdentale|oral care|oral[\s-]?b|elmex|emoform|sensodyne|mentadent|colgate|az\s+ricerca|deodorant\w*|profum\w*(?!\s+ambiente|\s+bucato|\s+armadi)|eau de parfum|eau de toilette|parfum|toilette\s+(?:uomo|donna|unisex)|fragranz\w*\s+(?:uomo|donna|unisex|corpo)|body mist|body spray|acqua profumata|olio profumato|after shave|crema\s+(?:viso|corpo|mani|piedi|idratante|nutriente|antirughe|solare|depilatoria)|pasta lenitiva|maschera viso|siero viso|contorno occhi|acqua micellare|latte detergente|struccant\w*|fondotinta|mascara|rossetto|bronzer|terra abbronzante|cosmetics|cofanett\w*(?!\s+cucina|\s+pentol\w*)|coffret|trousse|delidea\w*|humect\w*|remiseca|aspettando\s+il\s+natale|coveri|azzaro|\baaz\b|hugo boss|aquolina|iceberg|pepe jeans|rimmel|bellaoggi|lattafa|calvin klein|burberry|laura biagiotti|davidoff|syoss|pantene|garnier|gliss|sunsilk|elviv\w*|nivea|neutro roberts|neutro med|neutroderma|borotalco|chilly|saugella|intima roberts|lactacyd|palette\s+oleo|oleo\s+intense|alama\b|biopoint|vitalcare|bilba\b|restivoil|bioscalin|tesori d['’]?oriente|fria\b|breeze\b|dove\b|assorbent\w*|salvaslip|pannolin\w*|pannolon\w*|lines\b|tampax|rasoi\w*|gillette|wilkinson|schiuma da barba|dopobarba|sapone\s+(?:liquido|mani|intimo|solido)|detergente\s+(?:intimo|viso|corpo|mani)|fazzolett\w*|carta igienica|cotone idrofilo|dischetti cotone|cerotti|protezione solare|integrator\w*\s+(?:effervescent\w*|alimentar\w*)|fermenti\s+lattici|matt(?:\s*-)?\s*omega\s*3)\b/i;

const HOME_CLEANING_REGEX = /\b(detersiv\w*|ammorbident\w*|sgrassator\w*|candeggina|ipoclorito(?:\s+di\s+sodio)?|percarbonato|acido\s+citrico|soda\s+solvay|carbonato\s+di\s+sodio|acqua\s+demineralizzata|alcool\s+(?:etilico\s+)?denaturato|anticalcare|disincrostant\w*|igienizzant\w*|disinfettant\w*|vileda|sistema\s+(?:di\s+)?pulizia|ricambio\s+mocio|kit\s+lavapavimenti|lavapavimenti(?!\s+(?:senza\s+filo|elettric\w*|floor\s+one|tineco|dyson|rowenta|bissell|mod\.))|pulitore|brillantante|cura\s*lavastoviglie|curalavatrice|calgon|tabs lavastoviglie|capsule lavatrice|bucato|smacchiator\w*|acchiappacolore|spugn\w*(?!\s+(?:di\s+mare|bagno|corpo|doccia|viso|make\s*up|trucco))|pagliett\w*|panno\b|panni\s+(?:cattura\w*|pavimenti|microfibra|polvere)|microfibra|mocio|scopa(?!\s+elettrica)\b|sacchi\s+(?:nettezza|spazzatura|immondizia|pattumiera)|asciugatutto|rotoloni|carta\s+(?:casa|cucina|forno|assorbente)|tovaglioli(?:\s+carta)?|piatti\s+(?:carta|plastica|monouso|biodegradabil\w*)|bicchieri\s+(?:carta|plastica|monouso)|pellicola(?:\s+trasparente|\s+alimenti|\s+cucina)?|alluminio(?:\s+cucina|\s+rotolo)?|bricchett\w*|pellet\b|insetticida|profumator\w*\s+(?:ambiente|armadi|bucato)|deumidificator\w*|chanteclair|finish\b|fairy\b|svelto\b|napisan|lysoform|ace\b|viakal|cif\b|bref\b|pril\b|dash\b|dixan|omino bianco|coccolino|vernel|lenor|winni['’]?s|quasar|ajax|vetril|mastro lindo|wc net|duck\b|scottex|(?:rotoloni|carta(?:\s+casa)?|fazzoletti|tovaglioli|asciugoni)\s+regina|regina\s+(?:rotoloni|asciugoni|blitz|carta|tovaglioli)|foxy|nicky)\b/i;

const COOKWARE_TECH_REGEX = /\b(padell\w*|pentol\w*|casseruol\w*|tegame|wok\b|bistecchiera|coperchi\w*|coltell\w*(?!\s+prosciutto)|tagliere(?!\s+(?:italiano|salumi|formaggi|degustazione|misto|rustico))|mortaio|pirofil\w*|stampo\s+(?:forno|torta|plumcake|crostata)|batteria di pentole|antiaderente|induzione|frullator\w*|impastatrice|planetaria|friggitrice|forno(?:\s+elettrico|\s+microonde|\s+incasso)|microonde|tostapane|bollitore|bilancia(?:\s+cucina|\s+pesapersona)?|caffettiera|moka\b|macchina\s+(?:(?:del|per(?:\s+il)?|da)\s+)?(?:caffe|espresso|pane|pasta|pop\s*corn|ghiaccio|sottovuoto)|aspirapolvere|scopa elettrica|lavapavimenti\s+(?:senza\s+filo|elettric\w*|floor\s+one|tineco|dyson|rowenta|bissell|mod\.)|floor\s+one|tineco|robot\s+(?:cucina|aspirapolvere)|ferro da stiro|lavatrice|lavastoviglie|asciugatrice|frigorifero|congelatore|condizionatore|televisore|smart tv|\btv\s+(?:led|oled|qled|\d{2})|smartphone|notebook|laptop|tablet|stampante|auricolar\w*|cuffie\s+bluetooth|lagostina|ballarini|tescoma|moneta\b|pyrex|bormioli|tognana|ariete|de['’]?longhi|delonghi|moulinex|philips|rowenta|braun|dyson|telefunken|innoliving|girmi|kooper|severin|kitchenaid|smeg\b|kenwood|imete?c|samsung|lg\b|xiaomi|apple\b|iphone|whirlpool|bosch|electrolux|beko|candy\s+(?:lavatrice|asciugatrice|lavastoviglie|frigo|forno|piano)|miele\s+(?:lavatrice|lavastoviglie|asciugatrice|aspirapolvere|forno|g\d{3,}))\b/i;

const EXPLICIT_FOOD_GUARD_REGEX = /\b(pasta|spaghetti|penne|fusilli|rigatoni|farfalle|mezze maniche|lasagn\w*|cannellon\w*|ravioli|tortellini|gnocchi|trofie|pansott\w*|riso|risott\w*|farina|semola|polenta|cous\s*cous|pane|focaccia|pizz[ae]|pinsa|piadina|grissini|cracker\w*|tarall\w*|fette biscottate|baguette|panino|panini|piatti pronti|zuppa|vellutata|crema\s+(?:di\s+)?(?:zucca|asparagi|funghi|ceci|lenticchie|piselli|verdure|carciofi|tartufo|nocciole|pistacchio|spalmabile|pasticcera|catalana|mascarpone|latte)|crema\s+e\s+gusto|patatin\w*|al forno|da forno|forno a legna|cotto al forno|polpett\w*|cotolett\w*|biscott\w*|canestrell\w*|amarett\w*|ricciarell\w*|pasticceria|frollini|cornett\w*|croissant|brioche|panettone|pandoro|colomba|torta|crostata|cioccolat\w*|nutella|spalmabil\w*|marmellat\w*|confettur\w*|wafer|merendin\w*|cereali|muesli|caffe|espresso|cialde|capsule\s+(?:caffe|compatibili)|t[eè]\s+(?:verde|nero|deteinato|limone|pesca|classico)|infuso|camomilla|miele(?:\s+(?:millefiori|d['’]?acacia|di\s+castagno|italiano|bio|eucalipto|agrumi|sulla|tiglio))?|latte(?:\s+(?:intero|parzialmente|scremato|uht|fresco|alta|vegetale|mandorla|avena|soia))?|scremat\w*|latterie|yogurt|kefir|skyr|mozzarella|ricotta|formagg\w*|canestrato|parmigiano|grana|pecorino|gorgonzola|stracchino|crescenza|robiola|mascarpone|scamorz\w*|provol\w*|sottilett\w*|burro|panna(?:\s+cucina|\s+fresca|\s+montata|\s+uht)?|uov[ao]|pollo|tacchino|manzo|bovino|vitello|suino|maiale|coniglio|agnello|salsicci\w*|hamburger|wurstel|prosciutt\w*|salame|mortadella|bresaola|speck|pancetta|guanciale|coppa|culatello|lardo|affettat\w*|tagliere\s+italiano|tonno|sgombro|salmone|merluzzo|nasello|platessa|baccala|stoccafisso|verdesca|pesce\s+spada|orata|branzino|spigola|trota|alici|acciughe|sardine|gamber\w*|mazzancoll\w*|scampi|cozze|vongole|calamar\w*|seppi\w*|polpo|frutti di mare|surgelat\w*|gelat\w*|minestrone|olio(?:\s+extra\s*vergine|\s+evo|\s+oliva|\s+semi)?|aceto(?!\s+pulizie)|pomodor\w*|passata|pelati|polpa|pesto|sugo|salsa|maionese|ketchup|senape|olive|capperi|carciofin\w*|sottoli\w*|ceci|fagioli|lenticchie|piselli|mais|insalat\w*|rucola|valerian\w*|spinaci|erbette|bietol\w*|zucchin\w*|melanzan\w*|peperon\w*|patat[ae]|carot[ae]|cipoll[ae]|aglio|finocch\w*|broccol\w*|cavolfior\w*|cavol\w*|zucca|funghi|asparagi|carciofi|mele\b|pere\b|banan\w*|bananito|aranc[ae]|mandarin\w*|clementin\w*|limon[ei]|limes|pompelm\w*|uva\b|kiwi|fragol\w*|mirtill\w*|lampon\w*|more\b|pesch[ae]|albicocch\w*|prugn\w*|susin\w*|ciliegi[ae]|cachi|ananas|avocado|mango|papaya|passion fruit|zenzero|castagn\w*|marron[ei]|noci\b|mandorl\w*|nocciol\w*|pistacch\w*|pinoli|anacardi|arachidi|datteri|fichi|acqua(?:\s+minerale|\s+naturale|\s+frizzante|\s+effervescente)?|vino|prosecco|spumante|champagne|franciacorta|barolo|chianti|amarone|vermentino|pigato|birra|succo|spremuta|aranciata|chinotto|cola|bibita|aperitivo|amaro|fernet|grappa|liquore|liqueur|limoncello|whisky|rum\b|gin\b|vodka)\b/i;

/**
 * Deterministically classifies an offer or product into one of the 6 closed domains.
 *
 * @param {object} item - Offer or product object ({ title, brand, category, chainId, storeId })
 * @returns {'food_human' | 'home_cleaning' | 'kitchen_cookware' | 'personal_care' | 'pet_care' | 'bazar_seasonal'}
 */
export function classifyProductDomain(item = {}) {
  if (!item || typeof item !== 'object') return 'food_human';

  const title = String(item.title || '').trim();
  const brand = String(item.brand || '').trim();
  const category = String(item.category || '').trim();
  const chainId = stripAccents(item.chainId || item.storeId || '');
  const combined = stripAccents(`${title} ${brand}`);

  const isScentedCandleOrHomeDiffuser =
    /\b(candel[ae](?:\s+profumat\w*)?|portacandel\w*|diffusor\w*\s+(?:di\s+)?(?:fragranza|ambiente|bastoncini)|profumator\w*\s+(?:ambiente|armadi|bucato|auto))\b/i.test(combined);
  const hasExplicitPersonalCare = PERSONAL_CARE_REGEX.test(combined) && !isScentedCandleOrHomeDiffuser;
  const hasExplicitHomeCleaning = HOME_CLEANING_REGEX.test(combined) && !isScentedCandleOrHomeDiffuser;
  const hasExplicitCookwareTech =
    COOKWARE_TECH_REGEX.test(combined) &&
    !/\b(pizza\s+(?:al\s+forno|da\s+forno|forno\s+a\s+legna)|cotto\s+al\s+forno|patat\w*\s+al\s+forno|al\s+forno|forno\s+a\s+legna|tagliere\s+(?:italiano|salumi|formaggi|degustazione|misto|rustico)|(?:capsule|cialde)\s+(?:per\s+|compatibil\w*\s+)?(?:macchina|nespresso|dolce\s*gusto|lavazza))\b/i.test(combined) &&
    !hasExplicitPersonalCare &&
    !hasExplicitHomeCleaning;
  const hasExplicitFood =
    EXPLICIT_FOOD_GUARD_REGEX.test(combined) &&
    !hasExplicitPersonalCare &&
    !hasExplicitHomeCleaning &&
    !hasExplicitCookwareTech &&
    !/\b(set\s+fast\s+food|candel[ae]\s+profumat\w*)\b/i.test(combined);

  // 1. Pet store or explicit pet food/brand
  if (chainId.includes('arcaplanet') || PET_STRICT_FOOD_OR_BRAND_REGEX.test(combined)) {
    return 'pet_care';
  }

  // 2. Electronics / Unieuro store: appliances & tech -> kitchen_cookware,
  //    while hair/body care appliances -> personal_care and Christmas decorations / bazar -> bazar_seasonal!
  if (chainId.includes('unieuro')) {
    if (
      hasExplicitPersonalCare &&
      !/\b(aspirapolvere|lavapavimenti|robot|frullator\w*|ferro da stiro|lavatrice|lavastoviglie|asciugatrice|frigorifero)\b/i.test(combined)
    ) {
      return 'personal_care';
    }
    if (hasExplicitHomeCleaning && !COOKWARE_TECH_REGEX.test(combined)) {
      return 'home_cleaning';
    }
    if (TOYS_BAZAR_TEXTILES_REGEX.test(combined) && !COOKWARE_TECH_REGEX.test(combined)) {
      return 'bazar_seasonal';
    }
    return 'kitchen_cookware';
  }

  // 3. Explicit personal care & hygiene (checked BEFORE food so scented products like "Shampoo Mandorla / Sapone Miele" stay personal_care)
  if (hasExplicitPersonalCare && !/\b(latte\s+(?:intero|parzialmente|scremato|uht|fresco)|caffe|crema\s+e\s+gusto|crema\s+(?:spalmabile|pasticcera|di\s+zucca|zucca))\b/i.test(combined)) {
    return 'personal_care';
  }

  // 4. Explicit home cleaning & detergents (checked BEFORE food so "Svelto Detersivo Piatti Limone / Aceto" & "Vileda" stay home_cleaning)
  if (hasExplicitHomeCleaning && !/\b(piatti\s+pronti|pasta\b|olio\s+extra\s*vergine|aceto\s+(?:balsamico|di\s+vino|di\s+mele))\b/i.test(combined)) {
    return 'home_cleaning';
  }

  // 5. Explicit kitchen cookware, espresso machines & appliances (checked BEFORE food/bazar so "Macchina del Caffè" -> kitchen_cookware)
  if (hasExplicitCookwareTech && !TOYS_XMAS_LEISURE_REGEX.test(combined)) {
    return 'kitchen_cookware';
  }

  // 6. Toys, Christmas decorations, LED lights, speakers, plants, textiles, apparel, candles -> dedicated bazar_seasonal domain!
  if (TOYS_BAZAR_TEXTILES_REGEX.test(combined) && !hasExplicitFood) {
    return 'bazar_seasonal';
  }

  // 7. Generic pet animal nouns ("Ciotola Cane", "Biscotti Cane") when not bazar/textile/food brand
  if (PET_ANIMAL_NOUN_REGEX.test(combined) && !hasExplicitFood) {
    return 'pet_care';
  }

  // 8. Casalinghi store or explicit non-food canonical categories
  if (chainId.includes('casalinghi')) {
    if (!hasExplicitFood || COOKWARE_TECH_REGEX.test(combined)) {
      return 'kitchen_cookware';
    }
  }
  if (COOKWARE_TECH_REGEX.test(combined) && !hasExplicitFood) {
    return 'kitchen_cookware';
  }

  if (!hasExplicitFood) {
    if (category === 'Pentole, Cucina ed Elettrodomestici') return 'kitchen_cookware';
    if (category === 'Animali Domestici') return 'pet_care';
    if (
      category === 'Giocattoli, Natale e Tempo Libero' ||
      category === 'Tessile, Abbigliamento e Bazar Casa'
    ) {
      return 'bazar_seasonal';
    }
    if (category === 'Cura Persona e Igiene') return 'personal_care';
  }

  // 9. Drugstores (Tigotà / PiùMe): explicit cleaning items already matched HOME_CLEANING_REGEX above;
  //    unlabelled drugstore/perfumery brands & gift sets must route to personal_care, never pollute home_cleaning!
  if (chainId.includes('tigota') || chainId.includes('piume')) {
    if (PERSONAL_CARE_REGEX.test(combined)) return 'personal_care';
    if (TOYS_BAZAR_TEXTILES_REGEX.test(combined) && !HOME_CLEANING_REGEX.test(combined)) {
      return 'bazar_seasonal';
    }
    if (hasExplicitFood && !HOME_CLEANING_REGEX.test(combined) && !TOYS_BAZAR_TEXTILES_REGEX.test(combined)) {
      return 'food_human';
    }
    if (HOME_CLEANING_REGEX.test(combined)) {
      return 'home_cleaning';
    }
    return 'personal_care';
  }
  if (category === 'Cura Casa e Bucato' && !hasExplicitFood) {
    return 'home_cleaning';
  }

  // 10. Preserve explicit valid domain only after all non-food lexical rules have run
  if (item.domain && VALID_PRODUCT_DOMAINS.includes(item.domain) && !hasExplicitFood) {
    return item.domain;
  }

  // 11. Default for grocery supermarket categories
  return 'food_human';
}

// Strict word-boundary food department matchers (used to classify and sanitize polluted categories)
const WINE_OR_SPIRITS_GUARD = /\b(champagne|spumante|prosecco|franciacorta|trento\s*doc|cuv[eé]e|vino|brut|docg?|astuccio|cantina|barolo|chianti|amarone|valpolicella|soave|barbera|ruche|barbaresco|frescobaldi|berlucchi|pommery|valdo)\b/i;
const CAT_SURGELATI_REGEX = /\b(surgelat\w*|gelat\w*|minestrone|bastoncini|pizza\s+surgelata|pizza\s+ristorante|cameo\s+.*pizza|piselli\s+fini|findus|orogel|bofrost|frosta|sammontana|algida|magnum|cornetto\s+algida)\b/i;
const CAT_BEVANDE_REGEX = /\b(acqua(?:\s+minerale|\s+naturale|\s+frizzante|\s+effervescente|\s+oligominerale)?|sant['’]?anna|levissima|lete\b|ferrarelle|uliveto|rocchetta|san benedetto|vino|prosecco|spumante|champagne|franciacorta|trento\s*doc|metodo\s+classico|barolo|barbaresco|chianti|amarone|valpolicella|soave|barbera|ruche|vermentino|pigato|lambrusco|montepulciano|primitivo|falanghina|muller thurgau|gewurztraminer|frescobaldi|santa\s+cristina|berlucchi|pommery|valdo\b|birra|heineken|moretti|peroni|ichnusa|ceres|corona|beck['’]?s|faxe\b|coca[\s-]?cola|pepsi|fanta|sprite|aranciata|chinotto|limonata|tonica|succo|succhi|spremuta|nettare|estathe|fuze\s*tea|bibita|energy drink|red bull|monster\b(?!\s*-?\s*(?:big\s+foot|ruota|truck))|gatorade|aperol|campari|aperitivo|amaro|fernet|montenegro|jagermeister|grappa|limoncello|liquore|liqueur|baileys|disaronno|cointreau|whisky|whiskey|nikka\b|bourbon|scotch|rum\b|gin\b|vodka|tequila|brandy|cognac|bevanda\s+(?:di\s+)?(?:soia|avena|mandorla|riso|cocco))\b/i;
const CAT_LATTICINI_REGEX = /\b(latte(?!\s+sapori)(?:\s+(?:intero|parzialmente|scremato|uht|fresco|alta|microfiltrato|parmalat|granarolo|tigullio|arborea|sterilgarda))?|latterie|yogurt|kefir|skyr|actimel|activia|danacol|mozzarella|bocconcini di mozzarella|ciliegine|burrata|stracciatella|ricotta|formagg\w*|grana\s+padano|parmigiano|pecorino|gorgonzola|stracchino|crescenza|squacquerone|robiola|presinseua|mascarpone|scamorz\w*|provol\w*|caciocavallo|asiago|fontina|taleggio|brie\b|camembert|emmental|leerdammer|edamer|gouda|cheddar|feta\b|primo\s*sale|fiocchi di latte|sottilett\w*|philadelphia|spalmabile\s+fresco|certosa|burro|panna(?:\s+cucina|\s+fresca|\s+montata|\s+spray|\s+uht)?|besciamella)\b/i;
const CAT_CARNE_PESCE_REGEX = /\b(pollo|tacchino|manzo|bovino|vitello|vitellone|scottona|suino|maiale|coniglio|agnello|salsicci\w*|luganega|hamburger|svizzere|polpett\w*|cotolett\w*|spiedin\w*|arrosto|lonza|braciol\w*|costine|macinato|fettine|straccetti|tagliata\s+bovino|battuta\s+di\s+bovino|carpaccio|tartare|prosciutt\w*|jamon|serrano|salame|salamino|mortadella|bresaola|speck|pancetta|guanciale|coppa\b|culatello|lardo|porchetta|wurstel|affettat\w*|salumi|tagliere\s+italiano|pesce|salmone|tonno\s+(?:fresco|trancio|filetto)|orata|branzino|spigola|trota|rombo|sogliola|merluzzo|nasello|platessa|baccala|stoccafisso|verdesca|pesce\s+spada|alici|acciughe|sardine|sgombro|gamber\w*|mazzancoll\w*|scampi|cozze|vongole|calamar\w*|totani|moscardini|seppi\w*|polpo|frutti di mare|surimi)\b/i;
const CAT_ORTOFRUTTA_REGEX = /\b(mele\b|mela\b|pere\b|pera\b|banan\w*|bananito|aranc[ae]|mandarin\w*|clementin\w*|limon[ei]|limes|pompelm\w*|uva\b|kiwi|fragol\w*|mirtill\w*|lampon\w*|more\b|pesch[ae]|albicocch\w*|prugn\w*|susin\w*|ciliegi[ae]|cachi|melograno|ananas|avocado|mango|papaya|passion fruit|zenzero|castagn\w*|marron[ei]|pomodor(?:o|i|ini)|ciliegino|datterino|insalat\w*|lattug\w*|rucola|valerian\w*|misticanza|spinaci|erbette|bietol\w*|zucchin\w*|melanzan\w*|peperon\w*|patat[ae](?!\s+(?:fritte|forno|chips))|carot[ae]|cipoll[ae]|scalogno|aglio|porri|sedano|finocch\w*|broccol\w*|cavolfior\w*|cavol\w*|verza|zucca|crema\s+(?:di\s+)?zucca|vellutata|zuppa\s+fresca|funghi\s+(?:freschi|champignon|pleurotus|porcini)|asparagi|carciofi(?!\s+(?:olio|vasetto|sott'olio))|radicchio|cetriol\w*|ravanell\w*|frutta\s+fresca|verdura\s+fresca)\b/i;
const CAT_COLAZIONE_DOLCI_REGEX = /\b(caff[eè]|espresso|lavazza|illy|kimbo|borbone|pellini|segafredo|nescafe|orzo\s+solubile|ginseng|t[eè]\b|infuso|tisana|camomilla|biscott\w*|frollini|canestrell\w*|amarett\w*|ricciarell\w*|cantucci|savoiardi|wafer|ringo\b|gocciole|pan di stelle|mulino bianco|balocco|gentilini|galbusera|misura\b|cornett\w*|croissant|plumcake|merendin\w*|buondi|fiesta\b|kinder|ferrero|nutella|crema\s+spalmabile|spalmabile\s+(?:nocciola|cacao|pistacchio)|cioccolat\w*|pralin\w*|gianduiott\w*|torron\w*|caramell\w*|gommose|marmellat\w*|confettur\w*|miele\b|latte\s+sapori|cereali\s+colazione|corn\s*flakes|muesli|granola|fette biscottate)\b/i;
const CAT_PANE_PASTICCERIA_REGEX = /\b(pane\b|pan\s+bauletto|pancarre|panini|baguette|ciabatta\s+pane|focaccia|pinsa|piadina|grissini|cracker\w*|tarall\w*|schiacciatin\w*|crostini|bruschett\w*|friselle|pasticceria|treccia\s+crema|sfogliat\w*|bign[eè]|cannol\w*|tiramisu|profiteroles|torta|crostata|strudel|panettone|pandoro|melegatti|bauli|motta|paluani|maina|colomba)\b/i;
const CANNED_TOMATO_OR_PANTRY_GUARD = /\b(passata|polpa|pelati|concentrato|sugo|pesto|sott['’]?olio|in\s+scatola|tonno\s+(?:all['’]?olio|al\s+naturale|rio\s+mare|nostromo|mareblu|palmera|asdomar|callipo)|patatine|chips|risott\w*|lasagn\w*|raviol\w*|tortellin\w*|pansot\w*|gnocch\w*|spaghetti|penne|fusilli|rigatoni|mezze\s+maniche|farfalle)\b/i;

/**
 * Assigns a clean, domain-consistent canonical department category with strict word boundaries.
 * Eliminates legacy substring pollution (e.g. "-te\b" -> Colazione, "verGINe" -> Bevande, "sCREMAto" -> Cura Persona).
 */
export function classifyCanonicalCategory(item = {}, precomputedDomain = null) {
  const domain = precomputedDomain || classifyProductDomain(item);
  const rawTitle = `${item.title || ''} ${item.brand || ''}`;
  const text = stripAccents(rawTitle);

  if (domain === 'personal_care') {
    return 'Cura Persona e Igiene';
  }
  if (domain === 'home_cleaning') {
    return 'Cura Casa e Bucato';
  }
  if (domain === 'kitchen_cookware') {
    return 'Pentole, Cucina ed Elettrodomestici';
  }
  if (domain === 'pet_care') {
    return 'Animali Domestici';
  }
  if (domain === 'bazar_seasonal') {
    if (TEXTILES_APPAREL_BAZAR_REGEX.test(text) && !TOYS_XMAS_LEISURE_REGEX.test(text)) {
      return 'Tessile, Abbigliamento e Bazar Casa';
    }
    return 'Giocattoli, Natale e Tempo Libero';
  }

  // domain === 'food_human'
  const existingCat = String(item.category || '').trim();

  // Check explicit food departments in priority order with strict word boundaries
  if (CAT_SURGELATI_REGEX.test(text) && !WINE_OR_SPIRITS_GUARD.test(text)) {
    return 'Surgelati';
  }
  if (CANNED_TOMATO_OR_PANTRY_GUARD.test(text) && !/\b(pizza|gelato|surgelat)\b/i.test(text)) {
    return 'Dispensa e Pasta';
  }
  if (CAT_BEVANDE_REGEX.test(text) && !/\b(aceto|olio|biscott|cioccolat|torta|panettone|pandoro|salmone|risott)\b/i.test(text)) {
    return 'Acqua e Bevande';
  }
  if (WINE_OR_SPIRITS_GUARD.test(text) && /\b(pecorino|igt\b|docg?\b)\b/i.test(text) && !/\b(formagg\w*|stagionat\w*|spicchio|grattugiat\w*)\b/i.test(text)) {
    return 'Acqua e Bevande';
  }
  if (
    CAT_LATTICINI_REGEX.test(text) &&
    !/\b(biscott\w*|cornett\w*|croissant|merendin\w*|cioccolat\w*|gelat\w*|torta|panettone|pandoro|confettur\w*|marmellat\w*|miele|nocciolata|spalmabil\w*\s+(?:nocciol\w*|cacao)|rigoni\s+di\s+asiago)\b/i.test(text)
  ) {
    return 'Latticini e Formaggi';
  }
  if (CAT_COLAZIONE_DOLCI_REGEX.test(text) && !/\b(latte\s+(?:intero|parzialmente|scremato|uht|fresco)|crema\s+di\s+zucca|vellutata)\b/i.test(text)) {
    return 'Colazione e Dolci';
  }
  if (CAT_PANE_PASTICCERIA_REGEX.test(text)) {
    return 'Pane e Pasticceria';
  }
  if (CAT_CARNE_PESCE_REGEX.test(text)) {
    return 'Carne e Pesce';
  }
  if (CAT_ORTOFRUTTA_REGEX.test(text)) {
    return 'Frutta e Verdura';
  }

  // If the item already had a valid food category that wasn't one of the legacy polluted buckets, preserve it;
  // Note: legacy `Colazione e Dolci` ("-te\b"), `Acqua e Bevande` ("verGINe"), `Frutta e Verdura` ("MELEgatti"),
  // `Cura Persona e Igiene` ("sCREMAto") and `Cura Casa e Bucato` ("Piatti Pronti") MUST NOT be blindly preserved
  // if they failed the strict regexes above!
  if (
    existingCat === 'Latticini e Formaggi' ||
    existingCat === 'Carne e Pesce' ||
    existingCat === 'Pane e Pasticceria' ||
    existingCat === 'Surgelati'
  ) {
    return existingCat;
  }

  return 'Dispensa e Pasta';
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
  FOOD_PRODUCT_CATEGORIES,
  NON_FOOD_PRODUCT_CATEGORIES,
  classifyProductDomain,
  classifyCanonicalCategory,
  isHumanFoodOffer
};
