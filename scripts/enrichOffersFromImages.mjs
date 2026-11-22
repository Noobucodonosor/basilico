/**
 * C.I.B.O. / Basilico — Batch Vision/OCR Offer Enrichment
 * Extracts `packWeightGrams`, `unitPrice`, and `isMemberOnly` ("SCONTO SOCI")
 * from flyer cutout images (`imageUrl`) into `data/seed/rapallo_offers.json`
 * at build/CI time so the static offline PWA has complete weights & €/kg at €0 runtime cost.
 *
 * Usage:
 *   GEMINI_API_KEY=... node scripts/enrichOffersFromImages.mjs [--limit 50] [--all]
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

function parseOcrTextToOfferFields(text) {
  const clean = String(text || '');
  let packWeightGrams = null;

  // Match multipack first e.g. "2 x 100 g" or "3x80g"
  const multi = clean.match(/(\d+)\s*[xX×]\s*(\d+(?:[.,]\d+)?)\s*(kg|g|ml|l)\b/i);
  if (multi) {
    const count = Number(multi[1]);
    const unitVal = Number(multi[2].replace(',', '.'));
    const unit = multi[3].toLowerCase();
    const mult = unit === 'kg' || unit === 'l' ? 1000 : 1;
    if (count > 0 && unitVal > 0) packWeightGrams = Math.round(count * unitVal * mult);
  } else {
    const single = clean.match(/\b(\d+(?:[.,]\d+)?)\s*(kg|g|ml|cl|l)\b/i);
    if (single) {
      const val = Number(single[1].replace(',', '.'));
      const unit = single[2].toLowerCase();
      const mult = unit === 'kg' || unit === 'l' ? 1000 : (unit === 'cl' ? 10 : 1);
      if (val > 0) packWeightGrams = Math.round(val * mult);
    }
  }

  let unitPriceEurPerKg = null;
  const perKgMatch = clean.match(/(\d+[.,]\d{2})\s*€?\s*(?:al|\/)\s*(?:kg|l)\b/i);
  if (perKgMatch) {
    unitPriceEurPerKg = Number(perKgMatch[1].replace(',', '.'));
  }

  const isMemberOnly = /sconto\s*soci|solo\s*soci|carta\s*fedelt[aà]/i.test(clean);
  return { packWeightGrams, unitPriceEurPerKg, isMemberOnly, rawText: clean };
}

let compiledVisionBin = null;
function ensureVisionBinary() {
  if (compiledVisionBin && fs.existsSync(compiledVisionBin)) return compiledVisionBin;
  const binPath = path.join(os.tmpdir(), 'basilico-vision-ocr');
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
    const { stdout } = await execFileAsync(bin, [tmpFile], { encoding: 'utf8', timeout: 15000 });
    return parseOcrTextToOfferFields(stdout);
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
    `Rispondi SOLO con un oggetto JSON valido con questi 3 campi:\n` +
    `{"packWeightGrams": number|null, "unitPriceEurPerKg": number|null, "isMemberOnly": boolean}\n` +
    `Regole: converti kg/L in grammi/ml (es. 1 kg -> 1000, 3x80g -> 240); imposta isMemberOnly=true se vedi "SCONTO SOCI", "SOLO SOCI", "CARTA FEDELTÀ" o simile.`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: prompt },
            { inline_data: { mime_type: contentType, data: base64 } }
          ]
        }
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 }
    })
  });

  if (!res.ok) return null;
  const data = await res.json();
  const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) return null;
  return JSON.parse(rawText);
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const engine = apiKey ? 'gemini' : 'apple_vision';

  const args = process.argv.slice(2);
  const runAll = args.includes('--all');
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
      return !o.packWeightGrams || o.ocrEnriched !== true;
    })
    .slice(0, limit);

  console.log(`[enrichOffersFromImages] Engine=${engine} | Processing ${targets.length} of ${offers.length} offers...`);
  if (engine === 'apple_vision') ensureVisionBinary();

  let updated = 0;
  const concurrency = engine === 'apple_vision' ? 8 : 3;
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
          if (typeof extracted.unitPriceEurPerKg === 'number' && extracted.unitPriceEurPerKg > 0 && !offer.unitPrice) {
            offer.unitPrice = `€ ${extracted.unitPriceEurPerKg.toFixed(2).replace('.', ',')}/kg`;
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

main();
