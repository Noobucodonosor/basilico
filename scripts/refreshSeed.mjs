#!/usr/bin/env node
/**
 * Basilico — Rapallo Seed Dataset Refresh CLI (`TASK-QA-02`, ADR-0006)
 *
 * Runs IngestionService.deepSync() against an isolated os.tmpdir() CacheManager,
 * validates geographic purity (16035 Rapallo / GE province) and schema completeness,
 * and atomically updates data/seed/rapallo_{stores,flyers,offers}.json unless --dry-run is set.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CacheManager } from '../server/services/cacheManager.js';
import { IngestionService } from '../server/services/ingestionService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export const DEFAULT_SEED_DIR = path.resolve(__dirname, '../data/seed');

const NON_RAPALLO_FLYER_REGEX =
  /spezia|piacentin|pavese|piemont|lombard|sardegn|sicili|pugli|calabri|campani|lazio|toscan|venet|friul|trentin|emili|romagn|umbria|(?<!grandi\s)marche\b|abruzz|molis|basilicat|aosta/i;
const KNOWN_LEAKED_FLYER_IDS = new Set(['1689209', '1744270', '1736960', '1736959', '1738505']);

export function validateSeedSnapshot({ stores, flyers, offers } = {}) {
  const errors = [];

  if (!Array.isArray(stores) || stores.length === 0) {
    errors.push('stores deve essere un array non vuoto');
  }
  if (!Array.isArray(flyers) || flyers.length === 0) {
    errors.push('flyers deve essere un array non vuoto');
  }
  if (!Array.isArray(offers) || offers.length === 0) {
    errors.push('offers deve essere un array non vuoto');
  }

  const validStoreIds = new Set(Array.isArray(stores) ? stores.map((s) => s?.id).filter(Boolean) : []);
  let outOfProvinceFlyers = 0;
  let invalidOfferPrices = 0;
  let unknownStoreLinks = 0;

  if (Array.isArray(flyers)) {
    for (const f of flyers) {
      if (!f || !f.id) {
        errors.push('trovato volantino privo di id');
        continue;
      }
      if (KNOWN_LEAKED_FLYER_IDS.has(String(f.id)) || NON_RAPALLO_FLYER_REGEX.test(f.title || '')) {
        outOfProvinceFlyers++;
      }
      if (f.province && String(f.province).toUpperCase().trim() !== 'GE') {
        outOfProvinceFlyers++;
      }
      if (f.storeId && validStoreIds.size > 0 && !validStoreIds.has(f.storeId)) {
        unknownStoreLinks++;
      }
    }
  }

  if (Array.isArray(offers)) {
    for (const o of offers) {
      if (!o || !o.title || !Number.isFinite(Number(o.promoPrice ?? o.price)) || Number(o.promoPrice ?? o.price) <= 0) {
        invalidOfferPrices++;
      }
      if (KNOWN_LEAKED_FLYER_IDS.has(String(o?.flyerId || ''))) {
        outOfProvinceFlyers++;
      }
      if (o?.storeId && validStoreIds.size > 0 && !validStoreIds.has(o.storeId)) {
        unknownStoreLinks++;
      }
    }
  }

  if (outOfProvinceFlyers > 0) {
    errors.push(`rilevati ${outOfProvinceFlyers} record fuori provincia/area GE (ADR-0006)`);
  }
  if (unknownStoreLinks > 0) {
    errors.push(`rilevati ${unknownStoreLinks} collegamenti a storeId inesistenti`);
  }
  if (invalidOfferPrices > 0) {
    errors.push(`rilevate ${invalidOfferPrices} offerte con titolo mancante o prezzo non valido`);
  }

  return {
    valid: errors.length === 0,
    errors,
    stats: {
      stores: Array.isArray(stores) ? stores.length : 0,
      flyers: Array.isArray(flyers) ? flyers.length : 0,
      offers: Array.isArray(offers) ? offers.length : 0
    }
  };
}

export function atomicWriteJson(filePath, payload) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmpPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.renameSync(tmpPath, filePath);
}

function unwrapCacheValue(raw) {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object' && Array.isArray(raw.data)) return raw.data;
  return null;
}

export async function refreshSeed({
  dryRun = false,
  allowPartial = false,
  seedDir = DEFAULT_SEED_DIR,
  createIngestion
} = {}) {
  const tmpCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-seed-refresh-'));

  try {
    const isolatedCache = new CacheManager({ cacheDir: tmpCacheDir });
    const ingestion =
      typeof createIngestion === 'function'
        ? createIngestion({ cacheManager: isolatedCache, seedDir })
        : new IngestionService({ cacheManager: isolatedCache, seedDir });

    const syncResult = await ingestion.deepSync();
    const statusOk =
      syncResult?.status === 'success' || (allowPartial && syncResult?.status === 'partial_success');
    const isLive = syncResult?.dataSource === 'live';

    const stores = unwrapCacheValue(isolatedCache.get('stores')) || [];
    const flyers = unwrapCacheValue(isolatedCache.get('flyers')) || [];
    const offers = unwrapCacheValue(isolatedCache.get('offers')) || [];
    const validation = validateSeedSnapshot({ stores, flyers, offers });

    const summary = {
      dryRun,
      written: false,
      syncStatus: syncResult?.status || 'unknown',
      dataSource: syncResult?.dataSource || 'unknown',
      validation,
      errors: [...validation.errors]
    };

    if (!isLive || !statusOk) {
      summary.errors.unshift(
        `DeepSync non live o incompleto (status=${summary.syncStatus}, dataSource=${summary.dataSource})`
      );
      return summary;
    }

    if (!validation.valid) {
      return summary;
    }

    if (!dryRun) {
      atomicWriteJson(path.join(seedDir, 'rapallo_stores.json'), stores);
      atomicWriteJson(path.join(seedDir, 'rapallo_flyers.json'), flyers);
      atomicWriteJson(path.join(seedDir, 'rapallo_offers.json'), offers);
      summary.written = true;
    }

    return summary;
  } finally {
    try {
      fs.rmSync(tmpCacheDir, { recursive: true, force: true });
    } catch (_) {}
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === __filename;
if (isDirectRun) {
  const args = new Set(process.argv.slice(2));
  const dryRun = args.has('--dry-run');
  const allowPartial = args.has('--allow-partial');

  const report = await refreshSeed({ dryRun, allowPartial });
  console.log(JSON.stringify(report, null, 2));

  if (report.errors.length > 0 && !dryRun) {
    process.exit(1);
  }
  if (!report.validation.valid) {
    process.exit(1);
  }
}
