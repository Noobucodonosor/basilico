/**
 * Basilico — Deterministic Unit Price & Edible Weight Normalizer (ADR-0007, Level 1.2)
 * Location: server/services/unitPriceExtractor.js
 *
 * Rules enforced:
 * 1. "all'etto / l'etto / per 100g / 100 g" -> multiplied by 10 to obtain true €/kg.
 * 2. Multipack formats ("3x80g", "6 x 1,5 l", "4x125 g") -> total pack weight/volume.
 * 3. Drained vs Gross weight ("sgocciolato 156g", or canonical drained ratios for canned tuna/legumes/mozzarella)
 *    used to compute true edible €/kg.
 * 4. Separates Checkout Pack Price (prezzo di cassa) from Normalized Price (€/kg, €/L, €/lavaggio).
 * 5. Anti-hallucination guardrail flags anomalous prices (e.g., meat/cheese < 2.50 €/kg or discount > 85%).
 */

const CANONICAL_DRAINED_RATIOS = [
  { pattern: /\b(tonno|sgombro|salmone)\b.*\b(olio|naturale|scatola|lattina|vasetto|3x|4x|2x|80\s*g|160\s*g)\b/i, ratio: 0.65 },
  { pattern: /\b(ceci|fagioli|lenticchie|piselli|mais)\b.*\b(scatola|vasetto|lessat\w*|vap\w*|400\s*g|3x)\b/i, ratio: 0.60 },
  { pattern: /\b(mozzarella|bocconcini|ciliegine)\b/i, ratio: 0.62 },
  { pattern: /\b(olive|capperi|carciofini|funghetti)\b.*\b(salamoia|olio|vasetto)\b/i, ratio: 0.60 }
];

function parseItNumber(str) {
  if (!str) return null;
  const cleaned = String(str).trim().replace(',', '.');
  const val = parseFloat(cleaned);
  return Number.isFinite(val) && val > 0 ? val : null;
}

/**
 * Extracts weight in grams, volume in ml, or wash count from product title/description/unitPrice.
 */
export function extractPackMetrics(item = {}) {
  const title = String(item.title || '');
  const description = String(item.description || '');
  const unitPriceRaw = String(item.unitPrice || '');
  const text = `${title} ${unitPriceRaw} ${description}`;

  let packWeightGrams = null;
  let drainedWeightGrams = null;
  let packVolumeMl = null;
  let washCount = null;
  let isPerEtto = false;
  let isDirectPerKg = false;
  let isDirectPerLiter = false;

  // Check explicit "all'etto / l'etto / €/etto / per 100g"
  // NOTE: require real apostrophe in l['’]etto so the Italian word "letto" (bedding) never matches!
  if (/\b(all['’\s]?etto|l['’]etto|al\s+etto|€\s*\/\s*etto|euro\s*\/\s*etto|per\s*100\s*g|\/\s*100\s*g|al\s*100\s*g)\b/i.test(text)) {
    isPerEtto = true;
    packWeightGrams = 100;
  } else if (/\b(al\s*kg|€\s*\/\s*kg|euro\s*\/\s*kg|prezzo\s*al\s*kg)\b/i.test(text)) {
    isDirectPerKg = true;
  } else if (/\b(al\s*litro|€\s*\/\s*l\b)/i.test(text)) {
    isDirectPerLiter = true;
  }

  // Check explicit drained weight ("sgocc. 156g" / "sgocciolato 240 g")
  const drainedMatch = text.match(/sgocc(?:iolato|\.)?\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|etto|etti)\b/i);
  if (drainedMatch) {
    const qty = parseItNumber(drainedMatch[1]);
    const unit = drainedMatch[2].toLowerCase();
    if (qty) {
      if (unit === 'kg') drainedWeightGrams = Math.round(qty * 1000);
      else if (unit.startsWith('ett')) drainedWeightGrams = Math.round(qty * 100);
      else drainedWeightGrams = Math.round(qty);
    }
  }

  // Check multipack weight/volume: e.g. "3x80g", "3 x 80 g", "6x1,5L", "4 x 125 ml"
  const multiMatch = text.match(/(\d+)\s*[x×*]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|gr|l|lt|ml|cl)\b/i);
  if (multiMatch) {
    const count = parseInt(multiMatch[1], 10);
    const unitQty = parseItNumber(multiMatch[2]);
    const unit = multiMatch[3].toLowerCase();
    if (count > 0 && unitQty) {
      if (unit === 'kg') packWeightGrams = Math.round(count * unitQty * 1000);
      else if (unit === 'g' || unit === 'gr') packWeightGrams = Math.round(count * unitQty);
      else if (unit === 'l' || unit === 'lt') packVolumeMl = Math.round(count * unitQty * 1000);
      else if (unit === 'cl') packVolumeMl = Math.round(count * unitQty * 10);
      else if (unit === 'ml') packVolumeMl = Math.round(count * unitQty);
    }
  }

  // Single weight/volume match if not already found via multipack
  if (!packWeightGrams && !packVolumeMl && !isPerEtto) {
    const singleMatch = text.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|gr|hg|etti|etto|l|lt|ml|cl)\b/i);
    if (singleMatch) {
      const qty = parseItNumber(singleMatch[1]);
      const unit = singleMatch[2].toLowerCase();
      if (qty) {
        if (unit === 'kg') packWeightGrams = Math.round(qty * 1000);
        else if (unit === 'hg' || unit.startsWith('ett')) packWeightGrams = Math.round(qty * 100);
        else if (unit === 'g' || unit === 'gr') packWeightGrams = Math.round(qty);
        else if (unit === 'l' || unit === 'lt') packVolumeMl = Math.round(qty * 1000);
        else if (unit === 'cl') packVolumeMl = Math.round(qty * 10);
        else if (unit === 'ml') packVolumeMl = Math.round(qty);
      }
    }
  }

  // Explicit EU Class M egg count in title ("6 Uova", "10 Uova Fresche"): 60g gross / 53g edible shell-free per egg
  let eggCount = null;
  if (!packWeightGrams && !packVolumeMl && !isPerEtto) {
    const eggMatch = text.match(/\b(\d{1,2})\s*uov[ao]\b/i);
    if (eggMatch) {
      const count = parseInt(eggMatch[1], 10);
      if (count >= 2 && count <= 30) {
        eggCount = count;
        packWeightGrams = count * 60;
        drainedWeightGrams = count * 53;
      }
    }
  }

  // Wash count for detergents ("40 lavaggi", "36 caps", "50 tabs")
  const washMatch = text.match(/\b(\d+)\s*(lavaggi|caps|capsule|tabs|panni|strappi|rotoli)\b/i);
  if (washMatch) {
    washCount = parseInt(washMatch[1], 10);
  }

  // Infer drained weight if not explicitly stated but matches canonical canned/brined food
  if (packWeightGrams && !drainedWeightGrams) {
    for (const rule of CANONICAL_DRAINED_RATIOS) {
      if (rule.pattern.test(text)) {
        drainedWeightGrams = Math.round(packWeightGrams * rule.ratio);
        break;
      }
    }
  }

  return {
    packWeightGrams: packWeightGrams || (isDirectPerKg ? 1000 : null),
    drainedWeightGrams: drainedWeightGrams || packWeightGrams || (isDirectPerKg ? 1000 : null),
    packVolumeMl: packVolumeMl || (isDirectPerLiter ? 1000 : null),
    washCount,
    eggCount,
    isPerEtto,
    isDirectPerKg,
    isDirectPerLiter
  };
}

const STANDARD_GDO_PACK_RULES = [
  // Processed Tomato & Canned Pantry FIRST (must precede fresh "pomodori" so "Passata di Pomodoro" never gets "1 kg sfuso"!)
  { regex: /\b(passata\s+di\s+pomodoro|passata\s+classica|passata\s+vellutata|passata\s+rustica|mutti\s+.*passata|pomi\s+.*passata)\b/i, minP: 0.65, maxP: 2.69, grossG: 700, edibleG: 700, label: '700 g bottiglia' },
  { regex: /\b(polpa\s+di\s+pomodoro|pomodori\s+pelati|pelati|datterini\s+pelati)\b/i, minP: 0.59, maxP: 2.49, grossG: 400, edibleG: 400, label: '400 g lattina' },

  // In-shell Nuts & Chestnuts (must precede 200 g shelled nuts & generic 1 kg fruit so CREA shell % is applied only once!)
  { regex: /\b(noci\s+(?:in\s+)?guscio|arachidi\s+(?:in\s+)?guscio)\b/i, minP: 1.99, maxP: 6.99, grossG: 800, edibleG: 800, label: '800 g sacchetto in guscio' },
  { regex: /\b(castagn\w*|marroni)\b/i, minP: 0.75, maxP: 1.98, grossG: 250, edibleG: 250, label: '250 g busta castagne' },
  { regex: /\b(castagn\w*|marroni)\b/i, minP: 1.99, maxP: 6.99, grossG: 1000, edibleG: 1000, label: '1 kg rete castagne' },

  // Fresh Fruit & Vegetables (standard 1 kg loose GDO price or standard punnet; guarded against dehydrated/candied fruit)
  { regex: /^(?!.*\b(disidratat\w*|essiccat\w*|sciroppat\w*|candit\w*|succo|nettare|marmellat\w*|confettur\w*)\b).*\b(banan[ae]|bananito|mele|pere|arance|mandarin\w*|clementin\w*|limon[ei]|limes|ananas|cachi|prugn\w*|pesch[ae]|albicocch\w*|uva|kiwi|finocch\w*|cavolfior\w*|verz[ae]|broccol\w*|zucchin[ae]|melanzan[ae]|peperon[ei]|carot[ae]|cipoll[ae])\b/i, minP: 0.60, maxP: 5.50, grossG: 1000, edibleG: 1000, label: '1 kg sfuso/rete' },
  { regex: /\b(patat[ae])\b(?!.*\b(fritt|patatin|chips|forno)\b)/i, minP: 0.79, maxP: 3.99, grossG: 1500, edibleG: 1500, label: '1,5 kg sacco' },
  { regex: /^(?!.*\b(disidratat\w*|essiccat\w*|sciroppat\w*|candit\w*)\b).*\b(avocado|mango|papaya|passion fruit|zenzero|pomodorin\w*|ciliegino|datterino|fragol\w*|mirtill\w*|lampon\w*|spinaci)\b/i, minP: 0.99, maxP: 4.50, grossG: 500, edibleG: 500, label: '500 g vassoio' },
  { regex: /^(?!.*\b(passata|polpa|pelat\w*|sugo|salsa|concentrato|secch\w*)\b).*\b(pomodor[oi])\b/i, minP: 0.99, maxP: 3.99, grossG: 1000, edibleG: 1000, label: '1 kg sfuso' },
  { regex: /\b(insalat\w*|valerian\w*|rucola|misticanza|lattughin\w*)\b/i, minP: 0.79, maxP: 2.50, grossG: 200, edibleG: 200, label: '200 g busta lavata' },

  // Dry Pasta, Rice, Flour, Bread & Pantry
  { regex: /\b(pasta di semola|spaghetti|penne|fusilli|rigatoni|mezze maniche|farfalle|linguine|bucatini|maccheroni|orecchiette)\b/i, minP: 0.55, maxP: 2.49, grossG: 500, edibleG: 500, label: '500 g pacco standard' },
  { regex: /\b(trofie|pansoti|pansotti|ravioli|tortellini|gnocchi|tagliatelle|lasagne all['’]?uovo)\b/i, minP: 0.89, maxP: 4.50, grossG: 250, edibleG: 250, label: '250 g pasta fresca' },
  { regex: /\b(riso\b)/i, minP: 1.29, maxP: 4.99, grossG: 1000, edibleG: 1000, label: '1 kg pacco riso' },
  { regex: /\b(farina)\b/i, minP: 0.55, maxP: 2.49, grossG: 1000, edibleG: 1000, label: '1 kg pacco farina' },
  { regex: /\b(olio extra\s*vergine|olio evo)\b/i, minP: 5.49, maxP: 14.99, grossG: 916, edibleG: 916, label: '1 L bottiglia (916 g)' },
  { regex: /\b(ceci|fagioli|lenticchie|piselli)\b(?!.*\b(farina|pasta|chips)\b)/i, minP: 0.55, maxP: 2.20, grossG: 400, edibleG: 240, label: '400 g (240 g sgocc.)' },
  { regex: /\b(olive taggiasche|olive verdi|olive nere)\b/i, minP: 1.49, maxP: 4.50, grossG: 300, edibleG: 180, label: '180 g sgocc. vasetto' },
  { regex: /\b(pan bauletto|pane bianco|pane integrale|pane ai cereali|pancarre)\b/i, minP: 0.55, maxP: 2.29, grossG: 400, edibleG: 400, label: '400 g confezione' },
  { regex: /^(?!.*\bguscio\b).*\b(noci|mandorle|nocciole|pistacchi|anacardi|arachidi|pinoli)\b(?!.*\b(salsa|gelato|biscott|torta|crema|latte|bevanda)\b)/i, minP: 1.59, maxP: 5.50, grossG: 200, edibleG: 200, label: '200 g busta frutta secca sgusciata' },
  { regex: /\b(miele)\b/i, minP: 1.69, maxP: 5.99, grossG: 250, edibleG: 250, label: '250 g vasetto' },
  { regex: /\b(caffe)\b(?!.*\b(gelato|torta|crema|liquore)\b)/i, minP: 1.89, maxP: 4.50, grossG: 250, edibleG: 250, label: '250 g pacco caffè' },
  { regex: /\b(caffe)\b(?!.*\b(gelato|torta|crema|liquore)\b)/i, minP: 4.51, maxP: 8.99, grossG: 500, edibleG: 500, label: '2x250 g caffè' },

  // Fish, Meat & Eggs
  { regex: /\b(uova)\b/i, minP: 1.39, maxP: 3.69, grossG: 360, edibleG: 318, label: '6 uova medie (318 g edibili)' },
  { regex: /\b(tonno)\b(?!.*\b(fresco|trancio|carpaccio|tartare)\b)/i, minP: 2.29, maxP: 4.99, grossG: 240, edibleG: 156, label: '3x80 g (156 g sgocc.)' },
  { regex: /\b(tonno)\b(?!.*\b(fresco|trancio|carpaccio|tartare)\b)/i, minP: 0.99, maxP: 2.28, grossG: 160, edibleG: 104, label: '2x80 g (104 g sgocc.)' },
  { regex: /\b(sgombro|alici|acciughe|sardine)\b.*\b(filett\w*|olio|naturale|vasetto)?/i, minP: 1.19, maxP: 3.69, grossG: 125, edibleG: 90, label: '125 g (90 g sgocc.)' },
  { regex: /\b(salmone affumicato|salmone norvegese)\b/i, minP: 2.49, maxP: 6.49, grossG: 100, edibleG: 100, label: '100 g busta' },
  { regex: /\b(filett\w* di (?:orata|branzino|spigola|salmone|trota))\b/i, minP: 3.20, maxP: 7.50, grossG: 250, edibleG: 250, label: '250 g vassoio filetti' },
  { regex: /\b(filett\w* di (?:baccala|merluzzo|nasello|platessa))\b/i, minP: 3.50, maxP: 9.50, grossG: 400, edibleG: 400, label: '400 g filetti' },
  { regex: /\b(filett\w* di (?:baccala|merluzzo|orata|branzino|salmone)|orata|branzino|spigola|salmone|gamber\w*|calamar\w*|polpo)\b/i, minP: 9.51, maxP: 29.90, grossG: 1000, edibleG: 1000, label: '1 kg banco pescheria' },
  { regex: /\b(petto di pollo|fesa di tacchino|filett\w* di pollo|cotolett\w*|bocconcini di pollo)\b/i, minP: 2.20, maxP: 6.20, grossG: 400, edibleG: 400, label: '400 g vassoio avicoli' },
  { regex: /\b(petto di pollo|fesa di tacchino|pollo|tacchino|suino|bovino|manzo|scottona|macinato|hamburger)\b/i, minP: 6.50, maxP: 22.90, grossG: 1000, edibleG: 1000, label: '1 kg banco macelleria' },
  { regex: /\b(prosciutto cotto|prosciutto crudo|bresaola|speck|salame|mortadella|fesa|soppressata|pancetta)\b/i, minP: 1.19, maxP: 3.99, grossG: 100, edibleG: 100, label: '100 g vaschetta/etto' },

  // Dairy & Milk (used for guests / academic CREA ranking)
  { regex: /\b(latte (?:intero|parzialmente scremato|scremato|uht|fresco|alta digeribilita))\b/i, minP: 0.79, maxP: 2.29, grossG: 1030, edibleG: 1030, label: '1 L brick' },
  { regex: /\b(kefir)\b/i, minP: 0.79, maxP: 2.19, grossG: 500, edibleG: 500, label: '500 g bottiglia' },
  { regex: /\b(yogurt greco|yogurt colato|skyr)\b/i, minP: 0.89, maxP: 2.19, grossG: 170, edibleG: 170, label: '170 g vasetto' },
  { regex: /\b(yogurt)\b/i, minP: 0.65, maxP: 1.99, grossG: 250, edibleG: 250, label: '2x125 g vasetti' },
  { regex: /\b(mozzarella)\b/i, minP: 0.55, maxP: 1.79, grossG: 200, edibleG: 125, label: '125 g sgocc. busta' },
  { regex: /\b(mozzarella)\b/i, minP: 2.29, maxP: 4.50, grossG: 600, edibleG: 375, label: '3x125 g sgocc. multipack' },
  { regex: /\b(ricotta)\b/i, minP: 0.79, maxP: 2.29, grossG: 250, edibleG: 250, label: '250 g vaschetta' },
  { regex: /\b(stracchino|crescenza|robiola|presinseua|caciotta)\b/i, minP: 0.89, maxP: 2.19, grossG: 165, edibleG: 165, label: '165 g confezione' },
  { regex: /\b(mascarpone)\b/i, minP: 1.49, maxP: 3.19, grossG: 250, edibleG: 250, label: '250 g vaschetta' },
  { regex: /\b(burro)\b/i, minP: 1.69, maxP: 3.99, grossG: 250, edibleG: 250, label: '250 g panetto' },
  { regex: /\b(parmigiano reggiano|grana padano|pecorino)\b/i, minP: 2.49, maxP: 5.99, grossG: 200, edibleG: 200, label: '200 g spicchio/grattugiato' }
];

/**
 * Estimates a transparent reference pack size ONLY when the flyer text omits explicit weight
 * (because PromoQui prints weights inside the cropped image) and the item + price clearly match
 * a standard Italian GDO commercial format. Never overwrites explicit pricePerKg (ADR-0006).
 */
export function estimateStandardPackSize(item = {}, promoPrice = 0) {
  if (!promoPrice || promoPrice <= 0) return null;
  if (item.domain && item.domain !== 'food_human') return null;

  const rawTitle = String(item.title || '').trim();
  if (!rawTitle || /^(al\s*kg|all['’\s]?etto|offerta|solo|prezzo)\b/i.test(rawTitle)) {
    return null;
  }

  const normText = `${rawTitle} ${item.brand || ''}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  for (const rule of STANDARD_GDO_PACK_RULES) {
    if (promoPrice >= rule.minP && promoPrice <= rule.maxP && rule.regex.test(normText)) {
      const estimatedPricePerKg = Number(((promoPrice / rule.grossG) * 1000).toFixed(2));
      const estimatedEdiblePricePerKg = Number(((promoPrice / rule.edibleG) * 1000).toFixed(2));
      return {
        estimatedPackGrams: rule.grossG,
        estimatedEdibleGrams: rule.edibleG,
        estimatedPricePerKg,
        estimatedEdiblePricePerKg,
        formatLabel: rule.label,
        isEstimatedPackSize: true
      };
    }
  }
  return null;
}

/**
 * Computes normalized €/kg (gross & edible/drained), €/L, €/wash, and anomaly guardrails.
 */
export function normalizeUnitPricing(item = {}) {
  const promoPrice = Number(item.promoPrice ?? item.discountPrice ?? item.price ?? 0);
  const originalPrice = item.originalPrice !== null && item.originalPrice !== undefined ? Number(item.originalPrice) : null;
  const discountPercentage = item.discountPercentage !== null && item.discountPercentage !== undefined ? Number(item.discountPercentage) : null;

  const metrics = extractPackMetrics(item);
  let pricePerKg = null;
  let ediblePricePerKg = null;
  let pricePerLiter = null;
  let pricePerWash = null;
  let formattedNormalizedPrice = null;

  const isFoodOrPetDomain = !item.domain || item.domain === 'food_human' || item.domain === 'pet_care';

  if (promoPrice > 0) {
    if (metrics.isPerEtto && isFoodOrPetDomain) {
      pricePerKg = Number((promoPrice * 10).toFixed(2));
      ediblePricePerKg = pricePerKg;
      formattedNormalizedPrice = `${pricePerKg.toFixed(2).replace('.', ',')} €/kg (da ${promoPrice.toFixed(2).replace('.', ',')} €/etto)`;
    } else if (metrics.packWeightGrams && metrics.packWeightGrams > 0 && isFoodOrPetDomain) {
      pricePerKg = Number(((promoPrice / metrics.packWeightGrams) * 1000).toFixed(2));
      const effectiveDrained = metrics.drainedWeightGrams || metrics.packWeightGrams;
      ediblePricePerKg = Number(((promoPrice / effectiveDrained) * 1000).toFixed(2));
      if (effectiveDrained < metrics.packWeightGrams) {
        formattedNormalizedPrice = `${ediblePricePerKg.toFixed(2).replace('.', ',')} €/kg sgocc. (${pricePerKg.toFixed(2).replace('.', ',')} €/kg lordo)`;
      } else {
        formattedNormalizedPrice = `${pricePerKg.toFixed(2).replace('.', ',')} €/kg`;
      }
    } else if (metrics.packVolumeMl && metrics.packVolumeMl > 0) {
      pricePerLiter = Number(((promoPrice / metrics.packVolumeMl) * 1000).toFixed(2));
      formattedNormalizedPrice = `${pricePerLiter.toFixed(2).replace('.', ',')} €/L`;
    }

    if (metrics.washCount && metrics.washCount > 0) {
      pricePerWash = Number((promoPrice / metrics.washCount).toFixed(3));
      if (!formattedNormalizedPrice) {
        formattedNormalizedPrice = `${pricePerWash.toFixed(2).replace('.', ',')} €/unità`;
      }
    }
  }

  // Anti-hallucination guardrail checks
  const anomalyReasons = [];
  if (discountPercentage !== null && discountPercentage > 85) {
    anomalyReasons.push('Sconto superiore all\'85%: verificare sulla pagina del volantino');
  }
  const titleLower = String(item.title || '').toLowerCase();
  const effectiveKgPrice = ediblePricePerKg || pricePerKg;
  if (
    effectiveKgPrice !== null &&
    effectiveKgPrice < 2.5 &&
    !metrics.isPerEtto &&
    /\b(bresaola|prosciutto crudo|parmigiano|grana padano|pecorino|salmone affumicato|filetto di manzo|orata|branzino|olio extra vergine)\b/i.test(titleLower)
  ) {
    anomalyReasons.push(`Prezzo ${effectiveKgPrice.toFixed(2)} €/kg sospetto (possibile prezzo all'etto non dichiarato)`);
  }

  const referencePackEstimate =
    pricePerKg === null && pricePerLiter === null && pricePerWash === null
      ? estimateStandardPackSize(item, promoPrice)
      : null;

  return {
    checkoutPackPrice: promoPrice > 0 ? promoPrice : null,
    packWeightGrams: metrics.packWeightGrams,
    drainedWeightGrams: metrics.drainedWeightGrams,
    packVolumeMl: metrics.packVolumeMl,
    washCount: metrics.washCount,
    eggCount: metrics.eggCount,
    isPerEtto: metrics.isPerEtto,
    pricePerKg,
    ediblePricePerKg,
    pricePerLiter,
    pricePerWash,
    formattedNormalizedPrice,
    referencePackEstimate,
    priceAnomalyFlag: anomalyReasons.length > 0,
    priceAnomalyReasons: anomalyReasons,
    originalPrice,
    discountPercentage
  };
}

export default {
  extractPackMetrics,
  estimateStandardPackSize,
  normalizeUnitPricing
};
