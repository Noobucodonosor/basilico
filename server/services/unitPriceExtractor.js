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
  if (/\b(all['’\s]?etto|l['’\s]?etto|al\s*etto|€\s*\/\s*etto|euro\s*\/\s*etto|per\s*100\s*g|\/\s*100\s*g|al\s*100\s*g)\b/i.test(text)) {
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
    isPerEtto,
    isDirectPerKg,
    isDirectPerLiter
  };
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

  if (promoPrice > 0) {
    if (metrics.isPerEtto) {
      pricePerKg = Number((promoPrice * 10).toFixed(2));
      ediblePricePerKg = pricePerKg;
      formattedNormalizedPrice = `${pricePerKg.toFixed(2).replace('.', ',')} €/kg (da ${promoPrice.toFixed(2).replace('.', ',')} €/etto)`;
    } else if (metrics.packWeightGrams && metrics.packWeightGrams > 0) {
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

  return {
    checkoutPackPrice: promoPrice > 0 ? promoPrice : null,
    packWeightGrams: metrics.packWeightGrams,
    drainedWeightGrams: metrics.drainedWeightGrams,
    packVolumeMl: metrics.packVolumeMl,
    washCount: metrics.washCount,
    isPerEtto: metrics.isPerEtto,
    pricePerKg,
    ediblePricePerKg,
    pricePerLiter,
    pricePerWash,
    formattedNormalizedPrice,
    priceAnomalyFlag: anomalyReasons.length > 0,
    priceAnomalyReasons: anomalyReasons,
    originalPrice,
    discountPercentage
  };
}

export default {
  extractPackMetrics,
  normalizeUnitPricing
};
