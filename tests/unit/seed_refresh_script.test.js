import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validateSeedSnapshot, refreshSeed } from '../../scripts/refreshSeed.mjs';

describe('Wave C: scripts/refreshSeed.mjs Validation & Dry-Run Isolation (TASK-QA-02)', () => {
  const validStore = { id: 'rapallo-basko-colombo', chainId: 'basko', brand: 'Basko', name: 'Basko Rapallo' };
  const validFlyer = { id: '999001', storeId: 'rapallo-basko-colombo', title: 'Sottocosto Rapallo' };
  const validOffer = {
    id: 'off-1',
    storeId: 'rapallo-basko-colombo',
    flyerId: '999001',
    title: 'Pasta Rummo 500g',
    promoPrice: 1.19
  };

  it('validateSeedSnapshot accepts clean Rapallo snapshot and rejects empty or out-of-province snapshots', () => {
    const ok = validateSeedSnapshot({
      stores: [validStore],
      flyers: [validFlyer],
      offers: [validOffer]
    });
    assert.equal(ok.valid, true);
    assert.equal(ok.errors.length, 0);

    const empty = validateSeedSnapshot({ stores: [validStore], flyers: [], offers: [] });
    assert.equal(empty.valid, false);
    assert.ok(empty.errors.some((e) => /flyers/i.test(e)));

    const leaked = validateSeedSnapshot({
      stores: [validStore],
      flyers: [{ id: '1689209', storeId: 'rapallo-basko-colombo', title: 'Speciale Lazio' }],
      offers: [validOffer]
    });
    assert.equal(leaked.valid, false);
    assert.ok(leaked.errors.some((e) => /fuori provincia/i.test(e)));

    const grandiMarcheOk = validateSeedSnapshot({
      stores: [validStore],
      flyers: [{ id: '999002', storeId: 'rapallo-basko-colombo', title: 'Grandi Marche in Offerta' }],
      offers: [{ ...validOffer, flyerId: '999002' }]
    });
    assert.equal(grandiMarcheOk.valid, true, '"Grandi Marche" must not trigger Marche region leak');
  });

  it('refreshSeed supports --dry-run safely without modifying target seedDir', async () => {
    const tmpSeedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-seed-dryrun-'));
    try {
      fs.writeFileSync(path.join(tmpSeedDir, 'rapallo_stores.json'), JSON.stringify([validStore]), 'utf8');
      fs.writeFileSync(path.join(tmpSeedDir, 'rapallo_flyers.json'), JSON.stringify([validFlyer]), 'utf8');
      fs.writeFileSync(path.join(tmpSeedDir, 'rapallo_offers.json'), JSON.stringify([validOffer]), 'utf8');

      const report = await refreshSeed({
        dryRun: true,
        seedDir: tmpSeedDir,
        createIngestion: ({ cacheManager }) => ({
          async deepSync() {
            cacheManager.set('stores', [validStore], 600, { dataSource: 'live' });
            cacheManager.set('flyers', [validFlyer, { id: '999003', storeId: 'rapallo-basko-colombo', title: 'Fresco Liguria' }], 600, { dataSource: 'live' });
            cacheManager.set('offers', [validOffer], 600, { dataSource: 'live' });
            return { status: 'success', dataSource: 'live' };
          }
        })
      });

      assert.equal(report.dryRun, true);
      assert.equal(report.written, false);
      assert.equal(report.validation.valid, true);
      assert.equal(report.validation.stats.flyers, 2);

      // Verify original seed files on disk stayed untouched (still 1 flyer)
      const flyersOnDisk = JSON.parse(fs.readFileSync(path.join(tmpSeedDir, 'rapallo_flyers.json'), 'utf8'));
      assert.equal(flyersOnDisk.length, 1);
    } finally {
      fs.rmSync(tmpSeedDir, { recursive: true, force: true });
    }
  });
});
