/**
 * C.I.B.O. / Basilico — Batch Open Food Facts Italia Offer Enrichment
 *
 * Strictly verifies brand + product-name overlap against Open Food Facts Search API
 * and attaches `offer.openFoodFacts` (EAN, NOVA 1-4, Nutri-Score, real additives,
 * hidden milk/lactose allergen check, and ingredients preview) into `data/seed/rapallo_offers.json`.
 *
 * Zero runtime API calls: everything is pre-verified offline and bundled in static data.
 *
 * Usage:
 *   node scripts/enrichOffersFromOpenFoodFacts.mjs [--limit 100] [--force] [--dry-run] [--query "mutti,senfter"]
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OFFERS_PATH = path.join(ROOT_DIR, 'data', 'seed', 'rapallo_offers.json');

const STORE_NAMES = new Set([
  'basko', 'coop', 'gulliver', 'carrefour', 'ekom', 'penny', 'eurospin',
  'despar', 'dpiù', 'dpiu', 'tigotà', 'tigota', 'piùme', 'piume',
  'unieuro', 'arcaplanet', 'offerta', 'esselunga', 'conad'
]);

const NON_FOOD_CATEGORIES = new Set([
  'Cura Casa e Bucato',
  'Cura Persona e Igiene',
  'Animali Domestici',
  'Giocattoli, Natale e Tempo Libero',
  'Tessile, Abbigliamento e Bazar Casa',
  'Pentole, Cucina ed Elettrodomestici'
]);

const STOPWORDS = new Set([
  'con', 'per', 'alla', 'alle', 'allo', 'del', 'della', 'delle', 'dello', 'dei',
  'degli', 'nel', 'nella', 'senza', 'alta', 'qualita', 'gusto', 'linea', 'vari',
  'assortiti', 'assortite', 'classico', 'classica', 'extra', 'puro', 'pura',
  'fresco', 'fresca', 'nuovo', 'nuova', 'pack', 'formato', 'tris', 'bipacco', 'bio'
]);

const MILK_ALLERGEN_RX = /\b(latte|lattosio|siero di latte|proteine del latte|burro|panna|casein\w*|formaggi\w*|ricotta|mascarpone|mozzarella|parmigiano|grana)\b/i;

export function normalizeTokens(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

export function extractOfferBrandAndProduct(offer) {
  const rawTitle = String(offer.title || '').trim();
  let offerBrand = String(offer.brand || '').trim();
  let productPart = rawTitle;

  const dashIdx = rawTitle.indexOf(' - ');
  if (dashIdx > 0) {
    const prefix = rawTitle.slice(0, dashIdx).trim();
    const rest = rawTitle.slice(dashIdx + 3).trim();
    if (!offerBrand || STORE_NAMES.has(offerBrand.toLowerCase())) {
      offerBrand = prefix;
    }
    productPart = rest;
  }

  if (!offerBrand || STORE_NAMES.has(offerBrand.toLowerCase())) {
    return null;
  }

  return { offerBrand, productPart };
}

export function isVerifiedOffMatch(offerBrand, productPart, offProduct) {
  if (!offProduct || !offProduct.code || !offProduct.product_name) return false;

  const offBrandsRaw = Array.isArray(offProduct.brands)
    ? offProduct.brands.join(' ')
    : String(offProduct.brands || '');
  const offBrandTokens = normalizeTokens(offBrandsRaw);
  const offerBrandTokens = normalizeTokens(offerBrand);

  if (offerBrandTokens.length === 0 || offBrandTokens.length === 0) return false;

  // Strict brand check: every primary brand token (or at least the main brand token) must match OFF brands
  const brandMatched = offerBrandTokens.some((bt) =>
    offBrandTokens.some((obt) => obt === bt || (bt.length >= 5 && obt.includes(bt)))
  );
  if (!brandMatched) return false;

  // Strict product name overlap
  const offerProdTokens = normalizeTokens(productPart);
  const offProdTokens = new Set(normalizeTokens(offProduct.product_name));
  if (offerProdTokens.length === 0 || offProdTokens.size === 0) return false;

  const matchedCount = offerProdTokens.filter((t) => offProdTokens.has(t)).length;
  const minRequired = offerProdTokens.length <= 1
    ? 1
    : Math.ceil(offerProdTokens.length * 0.5);
  if (matchedCount < minRequired) return false;

  // Completeness gate: require at least one concrete label signal
  const hasNova = [1, 2, 3, 4].includes(Number(offProduct.nova_group));
  const hasNutri = ['a', 'b', 'c', 'd', 'e'].includes(String(offProduct.nutriscore_grade || '').toLowerCase());
  const hasAdditives = Array.isArray(offProduct.additives_tags) && offProduct.additives_tags.length > 0;
  const hasAllergens = Array.isArray(offProduct.allergens_tags) && offProduct.allergens_tags.length > 0;
  const hasIngredients = Boolean(offProduct.ingredients_text_it || offProduct.ingredients_text);

  return hasNova || hasNutri || hasAdditives || hasAllergens || hasIngredients;
}

function formatAdditives(tags = []) {
  return tags
    .map((t) => String(t).replace(/^en:/i, '').toUpperCase())
    .filter((t) => /^E\d{3,4}[A-Z]?$/.test(t))
    .slice(0, 8);
}

function buildOffPayload(offProduct) {
  const ingText = String(offProduct.ingredients_text_it || offProduct.ingredients_text || '').trim();
  const allergensTags = Array.isArray(offProduct.allergens_tags) ? offProduct.allergens_tags : [];
  const hasMilkAllergen =
    allergensTags.some((a) => /\bmilk\b|\blactose\b/i.test(String(a))) ||
    MILK_ALLERGEN_RX.test(ingText);

  const rawBrands = Array.isArray(offProduct.brands)
    ? offProduct.brands.join(', ')
    : String(offProduct.brands || '').trim();

  const nova = Number(offProduct.nova_group);
  const nutri = String(offProduct.nutriscore_grade || '').toLowerCase();

  return {
    ean: String(offProduct.code),
    productName: String(offProduct.product_name).trim(),
    brands: rawBrands || null,
    novaGroup: [1, 2, 3, 4].includes(nova) ? nova : null,
    nutriscore: ['a', 'b', 'c', 'd', 'e'].includes(nutri) ? nutri.toUpperCase() : null,
    additives: formatAdditives(offProduct.additives_tags || []),
    hasMilkAllergen,
    hasIngredients: Boolean(ingText),
    ingredientsPreview: ingText ? ingText.slice(0, 180) : null,
    verifiedAt: new Date().toISOString()
  };
}

async function queryOffProduct(offerBrand, productPart) {
  const variants = [productPart];
  const splitO = productPart.split(/\s+o\s+/i);
  if (splitO.length > 1 && splitO[0].trim().length >= 4) {
    variants.push(splitO[0].trim());
  }

  const fields = [
    'code',
    'product_name',
    'brands',
    'quantity',
    'nova_group',
    'nutriscore_grade',
    'allergens_tags',
    'additives_tags',
    'ingredients_text_it',
    'ingredients_text'
  ].join(',');

  for (const variant of variants) {
    const q = `${offerBrand} ${variant}`.trim();
    const urls = [
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&countries_tags=en:italy&page_size=5&fields=${fields}`,
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(variant)}&brands_tags=${encodeURIComponent(offerBrand.toLowerCase())}&countries_tags=en:italy&page_size=5&fields=${fields}`
    ];
    for (const url of urls) {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Basilico-Rapallo-BatchEnrich/1.0' },
        signal: AbortSignal.timeout(9000)
      });
      if (!res.ok) continue;
      const data = await res.json();
      const hits = Array.isArray(data.hits) ? data.hits : [];
      for (const hit of hits) {
        if (isVerifiedOffMatch(offerBrand, variant, hit)) {
          return buildOffPayload(hit);
        }
      }
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf('--limit');
  const limit = limitIdx >= 0 ? Math.max(1, Number(args[limitIdx + 1] || 100)) : Infinity;
  const force = args.includes('--force');
  const dryRun = args.includes('--dry-run');
  const queryIdx = args.indexOf('--query');
  const queryTerms = queryIdx >= 0
    ? String(args[queryIdx + 1] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];

  const offers = JSON.parse(fs.readFileSync(OFFERS_PATH, 'utf8'));
  const queryCache = new Map();

  let checked = 0;
  let matched = 0;
  let skipped = 0;

  for (const offer of offers) {
    if (checked >= limit) break;
    if (offer.domain && offer.domain !== 'food_human') continue;
    if (NON_FOOD_CATEGORIES.has(offer.category)) continue;
    if (!force && offer.openFoodFacts) {
      skipped++;
      continue;
    }

    if (queryTerms.length > 0) {
      const hay = `${offer.title || ''} ${offer.brand || ''}`.toLowerCase();
      if (!queryTerms.some((t) => hay.includes(t))) continue;
    }

    const parsed = extractOfferBrandAndProduct(offer);
    if (!parsed) continue;

    checked++;
    const cacheKey = `${parsed.offerBrand.toLowerCase()}::${parsed.productPart.toLowerCase()}`;
    let result;
    if (queryCache.has(cacheKey)) {
      result = queryCache.get(cacheKey);
    } else {
      try {
        result = await queryOffProduct(parsed.offerBrand, parsed.productPart);
      } catch (_) {
        result = null;
      }
      queryCache.set(cacheKey, result);
      await sleep(200);
    }

    if (result) {
      matched++;
      offer.openFoodFacts = result;
      console.log(
        `✅ [${matched}/${checked}] "${offer.title}" -> ${result.productName} (${result.brands}) | NOVA:${result.novaGroup ?? '-'} Nutri:${result.nutriscore ?? '-'} Add:${result.additives.length} Latte:${result.hasMilkAllergen ? 'SI' : 'No'}`
      );
    }
  }

  console.log(`\nRiepilogo OFF: controllate=${checked}, match verificati=${matched}, già presenti=${skipped}`);

  if (!dryRun && matched > 0) {
    fs.writeFileSync(OFFERS_PATH, `${JSON.stringify(offers, null, 2)}\n`, 'utf8');
    console.log(`💾 Salvato ${OFFERS_PATH}`);
  } else if (dryRun) {
    console.log('ℹ️  Dry-run attivo: nessun file scritto.');
  }
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isCli) {
  main().catch((err) => {
    console.error('❌ Errore batch OFF:', err);
    process.exit(1);
  });
}
