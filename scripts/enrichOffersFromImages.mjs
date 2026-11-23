/**
 * C.I.B.O. / Basilico — Batch Vision/OCR Offer Enrichment
 * Extracts `packWeightGrams`, `unitPrice`, `quantityLabel`, and `isMemberOnly`
 * from flyer cutout images (`imageUrl`) into `data/seed/rapallo_offers.json`.
 *
 * Usage:
 *   node scripts/enrichOffersFromImages.mjs [--limit 50] [--all] [--force] [--query "mutti,bretzel"]
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const OFFERS_PATH = path.join(ROOT_DIR, 'data', 'seed', 'rapallo_offers.json');
const VISION_SCRIPT = path.join(__dirname, 'vision_ocr.swift');

function unitMultiplier(rawUnit) {
  const u = String(rawUnit || '').toLowerCase();
  if (u === 'kg' || u === 'l' || u === 'lt' || u === 'it') return 1000;
  if (u === 'cl') return 10;
  if (u === 'etto' || u === 'hg') return 100;
  return 1;
}

export function parseOcrTextToOfferFields(text, offer = {}) {
  const clean = String(text || '');
  const promoPrice = Number(offer.promoPrice ?? offer.price ?? 0);
  let packWeightGrams = null;
  let quantityLabel = null;
  let unitPriceEurPerKg = null;
  let unitSymbol = 'kg';

  // 1. Price per kg / L (supports "al kg € 1,49", "al kg 1,49 €", "1,49 €/kg", "al lt 3,50 €", "al l € 1,00")
  const perKgAfter = clean.match(/(\d+[.,]\d{2})\s*€?\s*(?:al|\/)\s*(kg|lt|l)\b/i);
  const perKgBefore = clean.match(/(?:al|€\s*\/)\s*(kg|lt|l)\s*[€e]?\s*(\d+[.,]\d{2})/i);
  if (perKgAfter) {
    unitPriceEurPerKg = Number(perKgAfter[1].replace(',', '.'));
    unitSymbol = perKgAfter[2].toLowerCase().startsWith('l') ? 'L' : 'kg';
  } else if (perKgBefore) {
    unitSymbol = perKgBefore[1].toLowerCase().startsWith('l') ? 'L' : 'kg';
    unitPriceEurPerKg = Number(perKgBefore[2].replace(',', '.'));
  }

  // 2. Multipack: "2 x 150 g", "3x80g", "G 100X3", "LT 1X4", "it 1x4" (OCR 'it' for 'lt')
  const multiAfter = clean.match(/\b(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l)\b/i);
  const multiBefore = clean.match(/\b(kg|gr|g|ml|cl|lt|it|l)\s*(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+)\b/i);
  if (multiAfter) {
    const count = Number(multiAfter[1]);
    const unitVal = Number(multiAfter[2].replace(',', '.'));
    const mult = unitMultiplier(multiAfter[3]);
    if (count > 0 && unitVal > 0 && count * unitVal * mult <= 25000) {
      packWeightGrams = Math.round(count * unitVal * mult);
      if (multiAfter[3].toLowerCase().startsWith('l') || multiAfter[3].toLowerCase().endsWith('l')) unitSymbol = 'L';
    }
  } else if (multiBefore) {
    const mult = unitMultiplier(multiBefore[1]);
    const unitVal = Number(multiBefore[2].replace(',', '.'));
    const count = Number(multiBefore[3]);
    if (count > 0 && unitVal > 0 && count * unitVal * mult <= 25000) {
      packWeightGrams = Math.round(count * unitVal * mult);
      if (['lt', 'it', 'l', 'ml', 'cl'].includes(multiBefore[1].toLowerCase())) unitSymbol = 'L';
    }
  }

  // 3. Single weight / volume: "800 g", "800g", "1,5 kg", "LT 1,71", "G 500", "ML 750"
  if (!packWeightGrams) {
    // Exclude "al kg / al lt" tokens so we don't confuse unit price with weight
    const stripped = clean.replace(/(?:al|\/)\s*(?:kg|lt|l)\b/gi, ' ');
    const singleAfter = stripped.match(/(?:^|[\s(])(\d+(?:[.,]\d+)?)\s*(kg|gr|g|ml|cl|lt|l)\b/i);
    const singleBefore = stripped.match(/\b(kg|gr|g|ml|cl|lt|l)\s*(\d+(?:[.,]\d+)?)\b/i);
    if (singleAfter) {
      const val = Number(singleAfter[1].replace(',', '.'));
      const mult = unitMultiplier(singleAfter[2]);
      const grams = Math.round(val * mult);
      if (grams >= 10 && grams <= 25000) {
        packWeightGrams = grams;
        if (['lt', 'l', 'ml', 'cl'].includes(singleAfter[2].toLowerCase())) unitSymbol = 'L';
      }
    } else if (singleBefore) {
      const mult = unitMultiplier(singleBefore[1]);
      const val = Number(singleBefore[2].replace(',', '.'));
      const grams = Math.round(val * mult);
      if (grams >= 10 && grams <= 25000) {
        packWeightGrams = grams;
        if (['lt', 'l', 'ml', 'cl'].includes(singleBefore[1].toLowerCase())) unitSymbol = 'L';
      }
    }
  }

  // 4. Deli counter "L'ETTO" / "ALL'ETTO" (immune to "completo letto")
  const titleAndOcr = `${offer.title || ''}\n${clean}`;
  if (!packWeightGrams && !/\bcompleto\s+letto\b/i.test(titleAndOcr) && /\b(?:all['’\s]*etto|l['’\s]+etto|l['’]etto)\b/i.test(clean)) {
    packWeightGrams = 100;
    if (promoPrice > 0 && !unitPriceEurPerKg) {
      unitPriceEurPerKg = Number((promoPrice * 10).toFixed(2));
    }
    quantityLabel = promoPrice > 0
      ? `Al banco: 100 g / l'etto (€ ${(promoPrice * 10).toFixed(2).replace('.', ',')}/kg)`
      : `Al banco: vendita all'etto (100 g)`;
  }

  // 5. Mathematical derivation when €/kg (or €/L) AND promoPrice are present, e.g. €1,19 / €1,49/kg = 800g
  if (!packWeightGrams && unitPriceEurPerKg && unitPriceEurPerKg > 0 && promoPrice > 0) {
    const derived = Math.round((promoPrice / unitPriceEurPerKg) * 1000);
    // Snap to clean retail pack sizes within 2% (e.g. 799g -> 800g, 299g -> 300g)
    const snapped = Math.round(derived / 10) * 10;
    const finalGrams = Math.abs(snapped - derived) <= 6 ? snapped : derived;
    if (finalGrams >= 25 && finalGrams <= 25000) {
      packWeightGrams = finalGrams;
    }
  }

  // 6. Loose weight "AL KG" (fresh produce / butcher / fish counter where promoPrice IS the €/kg)
  if (!packWeightGrams && /\bal\s*kg\b/i.test(clean) && promoPrice > 0 && promoPrice < 60) {
    packWeightGrams = 1000;
    unitPriceEurPerKg = promoPrice;
    quantityLabel = `Sfuso a peso: € ${promoPrice.toFixed(2).replace('.', ',')}/kg`;
  }

  // 7. Count / Household units ("10 uova", "4 rotoli", "87 lavaggi", "Conf. 2 pz", "30 capsule", "20 salviette")
  if (!quantityLabel) {
    const countMatch = clean.match(/\b(\d+)\s*(uova|rotol[io]|lavagg[io]|capsul[ae]|ciald[ae]|bustin[ae]|salviet\w*|fett[ae]|bottigli[ae]|lattin[ae]|pannolin[io])\b/i) ||
      clean.match(/\bconf\.?\s*(\d+\s*(?:pz|pezzi))\b/i) ||
      clean.match(/\b(\d+)\s*(pz|pezzi)\b/i);
    if (countMatch) {
      const labelText = countMatch[2] ? `${countMatch[1]} ${countMatch[2].toLowerCase()}` : countMatch[1];
      if (!packWeightGrams && /uova/i.test(labelText)) {
        packWeightGrams = Number(countMatch[1]) * 60;
      }
      if (!packWeightGrams) {
        quantityLabel = `Confezione: ${labelText}`;
      }
    }
  }

  // 8. Normal (original) price & discount percentage from image ("1,99 -> 1,19", "$4,49 -> €3,96", "-40%", "SCONTO 35%")
  let discountPercentage = null;
  const minusPct = clean.match(/(?:^|[\s(])-\s*(\d{1,2})\s*%/m);
  const scontoPct = clean.match(/\bsconto(?:\s+soci|\s+del)?\s*(\d{1,2})\s*[%*~°]?/i);
  const rawPct = minusPct ? Number(minusPct[1]) : (scontoPct ? Number(scontoPct[1]) : 0);
  if (rawPct >= 5 && rawPct <= 75) {
    discountPercentage = rawPct;
  }

  let originalPrice = null;
  if (promoPrice > 0) {
    // Strip lines containing "al kg" / "al lt" so unit price is never mistaken for original price
    const nonUnitLines = clean
      .split('\n')
      .filter((ln) => !/(?:al|\/)\s*(?:kg|lt|l)\b/i.test(ln))
      .join(' ');
    const decimals = [...nonUnitLines.matchAll(/(?:^|[^\d])(\d{1,3}[.,]\d{2})(?!\d)/g)]
      .map((m) => Number(m[1].replace(',', '.')))
      .filter((v) =>
        Number.isFinite(v) &&
        v > promoPrice * 1.04 &&
        v <= promoPrice * 3.2 &&
        (!unitPriceEurPerKg || Math.abs(v - unitPriceEurPerKg) > 0.03)
      );
    if (decimals.length > 0) {
      // Pick the closest plausible full price above promoPrice (or matching discountPercentage if present)
      if (discountPercentage) {
        const expected = promoPrice / (1 - discountPercentage / 100);
        decimals.sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected));
      } else {
        decimals.sort((a, b) => a - b);
      }
      originalPrice = Number(decimals[0].toFixed(2));
      if (!discountPercentage) {
        discountPercentage = Math.round(((originalPrice - promoPrice) / originalPrice) * 100);
      }
    } else if (discountPercentage) {
      originalPrice = Number((promoPrice / (1 - discountPercentage / 100)).toFixed(2));
    }
  }

  const isMemberOnly = /sconto\s*soci|solo\s*soci|carta\s*fedelt[aà]|solo\s*con\s*prima|solo\s*titolari/i.test(clean);
  return { packWeightGrams, unitPriceEurPerKg, unitSymbol, quantityLabel, discountPercentage, originalPrice, isMemberOnly, rawText: clean };
}

let compiledVisionBin = null;
function ensureVisionBinary() {
  if (compiledVisionBin && fs.existsSync(compiledVisionBin)) return compiledVisionBin;
  const binPath = path.join(os.tmpdir(), 'basilico-vision-ocr-v2');
  execFileSync('swiftc', [VISION_SCRIPT, '-O', '-o', binPath], { timeout: 60000 });
  compiledVisionBin = binPath;
  return binPath;
}

async function extractFromImageWithAppleVision(offer) {
  const imgRes = await fetch(offer.imageUrl);
  if (!imgRes.ok) return null;
  const tmpFile = path.join(os.tmpdir(), `basilico-ocr-${offer.id}.png`);
  try {
    fs.writeFileSync(tmpFile, Buffer.from(await imgRes.arrayBuffer()));
    const bin = ensureVisionBinary();
    const { stdout } = await execFileAsync(bin, [tmpFile], { encoding: 'utf8', timeout: 20000 });
    return parseOcrTextToOfferFields(stdout, offer);
  } finally {
    if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
  }
}

async function extractFromImageWithGemini(apiKey, offer) {
  const imgRes = await fetch(offer.imageUrl);
  if (!imgRes.ok) return null;
  const contentType = imgRes.headers.get('content-type') || 'image/png';
  const base64 = Buffer.from(await imgRes.arrayBuffer()).toString('base64');
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`;
  const prompt =
    `Analizza questo ritaglio di volantino italiano ("${offer.title}", prezzo €${offer.promoPrice ?? offer.price}).\n` +
    `Rispondi SOLO con JSON: {"packWeightGrams": number|null, "unitPriceEurPerKg": number|null, "quantityLabel": string|null, "isMemberOnly": boolean}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: contentType, data: base64 } }] }],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 }
    })
  });
  if (!res.ok) return null;
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  return rawText ? JSON.parse(rawText) : null;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const engine = apiKey ? 'gemini' : 'apple_vision';

  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
  const force = args.includes('--force');
  const limitIdx = args.indexOf('--limit');
  const queryIdx = args.indexOf('--query');
  const queryTerms = queryIdx >= 0
    ? String(args[queryIdx + 1] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
    : [];
  const limit = runAll ? Infinity : (limitIdx >= 0 ? Number(args[limitIdx + 1] || 50) : 50);

  const offers = JSON.parse(fs.readFileSync(OFFERS_PATH, 'utf8'));
  const targets = offers
    .filter((o) => {
      if (!o.imageUrl) return false;
      if (queryTerms.length > 0) {
        return queryTerms.some((t) => String(o.title || '').toLowerCase().includes(t));
      }
      if (force) return true;
      return !o.originalPrice || (!o.packWeightGrams && !o.quantityLabel) || o.ocrEnriched !== true;
    })
    .slice(0, limit);

  console.log(`[enrichOffersFromImages] Engine=${engine} | Processing ${targets.length} of ${offers.length} offers...`);
  if (engine === 'apple_vision') ensureVisionBinary();

  let updated = 0;
  const concurrency = engine === 'apple_vision' ? 12 : 3;
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    await Promise.all(
      batch.map(async (offer) => {
        try {
          const extracted = engine === 'gemini'
            ? await extractFromImageWithGemini(apiKey, offer)
            : await extractFromImageWithAppleVision(offer);
          if (!extracted) return;
          if (typeof extracted.packWeightGrams === 'number' && extracted.packWeightGrams > 0) {
            offer.packWeightGrams = Math.round(extracted.packWeightGrams);
          }
          if (typeof extracted.unitPriceEurPerKg === 'number' && extracted.unitPriceEurPerKg > 0) {
            const sym = extracted.unitSymbol || 'kg';
            offer.unitPrice = `€ ${extracted.unitPriceEurPerKg.toFixed(2).replace('.', ',')}/${sym}`;
          }
          if (extracted.quantityLabel) {
            offer.quantityLabel = extracted.quantityLabel;
          }
          if (typeof extracted.originalPrice === 'number' && extracted.originalPrice > 0 && !offer.originalPrice) {
            offer.originalPrice = extracted.originalPrice;
          }
          if (typeof extracted.discountPercentage === 'number' && extracted.discountPercentage > 0 && !(offer.discountPercentage > 0)) {
            offer.discountPercentage = extracted.discountPercentage;
            offer.discountLabel = `-${extracted.discountPercentage}%`;
          }
          if (extracted.isMemberOnly === true) {
            offer.isMemberOnly = true;
          }
          offer.ocrEnriched = true;
          updated += 1;
        } catch (err) {
          console.warn(`[enrichOffersFromImages] Skipped ${offer.id}: ${err.message}`);
        }
      })
    );
  }

  fs.writeFileSync(OFFERS_PATH, JSON.stringify(offers, null, 2));
  console.log(`[enrichOffersFromImages] Done. Enriched ${updated} offers in data/seed/rapallo_offers.json.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  main();
}
