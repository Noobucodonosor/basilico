/**
 * Integration Test Suite for IngestionService
 * Location: tests/integration/ingestion-service.test.js
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { IngestionService } from '../../server/services/ingestionService.js';
import { CacheManager } from '../../server/services/cacheManager.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

describe('IngestionService Integration Tests', () => {
  let tempDir;
  let cache;
  let service;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-ingestion-test-'));
    cache = new CacheManager({
      cacheDir: tempDir,
      defaultTtlSeconds: 3600,
      defaultStaleGraceSeconds: 86400,
      backend: 'json'
    });
    service = new IngestionService({ cacheManager: cache });
  });

  describe('Tier 1: Upstream Ingestion & Timeout Controls', () => {
    it('enforces AbortController timeout and aborts cleanly on timeout', async () => {
      const start = Date.now();
      try {
        await service.fetchWithTimeout('http://10.255.255.1', 60);
        assert.fail('Should have timed out');
      } catch (err) {
        const elapsed = Date.now() - start;
        assert.ok(elapsed < 1000, `Elapsed ${elapsed}ms should be under 1000ms`);
        assert.ok(err.name === 'AbortError' || err.name === 'TimeoutError' || err.message.includes('timed out'));
      }
    });

    it('extractNextData extracts structured JSON from HTML script tag', () => {
      const mockHtml = `<html><head><script id="__NEXT_DATA__" type="application/json">{"props":{"pageProps":{"apiResources":{"topCategoryFlyers":[{"id":"123","title":"Offerta"}]}}}}</script></head></html>`;
      const data = service.extractNextData(mockHtml);
      assert.equal(data.props.pageProps.apiResources.topCategoryFlyers[0].id, '123');
    });

    it('extractNextData throws descriptive error on malformed HTML without crashing process', () => {
      assert.throws(() => service.extractNextData('<html><body>No next data</body></html>'), /__NEXT_DATA__/);
      assert.throws(() => service.extractNextData(''), /Invalid HTML/);
      assert.throws(() => service.extractNextData(null), /Invalid HTML/);
    });
  });

  describe('Tier 2: Brand Matching & Normalization', () => {
    it('matchStore maps retailer names to canonical Rapallo store IDs', async () => {
      const stores = await service.getStores();
      assert.ok(stores.length >= 5, 'Should load stores');

      const matchedCoop = service.matchStore('Ipercoop Liguria', stores);
      assert.ok(matchedCoop, 'Should match Coop');
      assert.equal(matchedCoop.chainId, 'coop');

      const matchedCarrefour = service.matchStore('Carrefour Express', stores);
      assert.ok(matchedCarrefour, 'Should match Carrefour');
      assert.equal(matchedCarrefour.chainId, 'carrefour');

      const matchedBasko = service.matchStore('Basko Rapallo', stores);
      assert.ok(matchedBasko, 'Should match Basko');
      assert.equal(matchedBasko.chainId, 'basko');
    });

    it('normalizeLiveFlyers converts raw aggregator items into Flyer objects', async () => {
      const stores = await service.getStores();
      const rawFlyers = [
        {
          id: '99901',
          retailerName: 'Carrefour Market',
          title: 'Offerte Freschi Rapallo',
          start_date: '2026-11-01T00:00:00.000Z',
          end_date: '2026-11-20T23:59:59.000Z',
          pageCount: 8,
          imageAssets: {
            cover: 'https://it-it-media.shopfully.cloud/images/volantini/big_99901.jpg',
            pages: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg']
          }
        }
      ];

      const normalized = service.normalizeLiveFlyers(rawFlyers, stores);
      assert.equal(normalized.length, 1);
      assert.equal(normalized[0].id, '99901');
      assert.equal(normalized[0].chainId, 'carrefour');
      assert.equal(normalized[0].storeId, 'rapallo-carrefour-assereto');
      assert.equal(normalized[0].pageCount, 2);
      assert.equal(normalized[0].isCurrent, true);
    });
  });

  describe('Tier 3: Multi-Tier Fallback Cascade', () => {
    it('sync() falls back seamlessly to seed dataset when upstream fails', async () => {
      const failingService = new IngestionService({ cacheManager: cache });
      failingService.fetchLiveAggregator = async () => { throw new Error('Simulated upstream failure'); };

      const result = await failingService.sync(true);
      assert.equal(result.status, 'cached_fallback');
      assert.equal(result.dataSource, 'seed');
      assert.ok(result.storesProcessed >= 11, `Expected >= 11 stores, got ${result.storesProcessed}`);
      assert.ok(result.totalFlyers >= 12, `Expected >= 12 flyers, got ${result.totalFlyers}`);
      assert.ok(result.totalOffers >= 40, `Expected >= 40 offers, got ${result.totalOffers}`);
      assert.equal(result.errors.length, 1);
    });

    it('sync() serves from cache on subsequent non-forced calls', async () => {
      // First sync primes the cache
      const failingService = new IngestionService({ cacheManager: cache });
      failingService.fetchLiveAggregator = async () => { throw new Error('Network offline'); };
      await failingService.sync(true);

      // Second sync without force should hit cache
      const cachedResult = await failingService.sync(false);
      assert.equal(cachedResult.status, 'success');
      assert.equal(cachedResult.dataSource, 'cache');
      assert.ok(cachedResult.durationMs < 50);
    });

    it('deduplicates concurrent sync() calls into a single execution', async () => {
      let callCount = 0;
      const delayedService = new IngestionService({ cacheManager: cache });
      delayedService.fetchLiveAggregator = async () => {
        callCount++;
        await new Promise(r => setTimeout(r, 40));
        throw new Error('Offline');
      };

      const [r1, r2, r3] = await Promise.all([
        delayedService.sync(true),
        delayedService.sync(true),
        delayedService.sync(true)
      ]);

      assert.equal(callCount, 1, 'Only one live fetch should be initiated during concurrent calls');
      assert.equal(r1.status, 'cached_fallback');
      assert.equal(r2.status, 'cached_fallback');
      assert.equal(r3.status, 'cached_fallback');
    });

    it('never throws unhandled exceptions even if seed data path is unreadable', async () => {
      const brokenService = new IngestionService({
        cacheManager: cache,
        seedDir: '/invalid/path/that/does/not/exist'
      });
      brokenService.fetchLiveAggregator = async () => { throw new Error('Network down'); };

      const result = await brokenService.sync(true);
      assert.equal(result.status, 'failed');
      assert.equal(result.storesProcessed, 0);
      assert.ok(result.errors.length >= 1);
    });
  });

  describe('Tier 4: Product Search, Category Filters, and Store Queries', () => {
    it('getStores returns all 14 verified Rapallo stores with flyerCount and activeOfferCount', async () => {
      const stores = await service.getStores();
      assert.equal(stores.length, 14);

      const coop = stores.find(s => s.id === 'rapallo-coop-sciesa');
      assert.ok(coop, 'Coop must be present');
      assert.equal(coop.brand, 'Coop');
      assert.ok(coop.flyerCount >= 1);
      assert.ok(coop.activeOfferCount >= 1);

      const dpiu = stores.find(s => s.id === 'rapallo-dpiu-fioria');
      assert.ok(dpiu, 'DPiù must be present');
      assert.equal(dpiu.city, 'Rapallo');
    });

    it('getFlyers returns flyers sorted active first and filters by storeId or chainId', async () => {
      const allFlyers = await service.getFlyers();
      assert.ok(allFlyers.length >= 12);
      assert.equal(allFlyers[0].isCurrent, true, 'First flyer should be active');

      const coopFlyers = await service.getFlyers('rapallo-coop-sciesa');
      assert.ok(coopFlyers.length >= 1);
      for (const f of coopFlyers) {
        assert.ok(f.storeId === 'rapallo-coop-sciesa' || f.chainId === 'coop');
      }
    });

    it('getOffers supports accent-insensitive searching ("caffe" matches "Caffè")', async () => {
      const res1 = await service.getOffers({ query: 'caffe' });
      const res2 = await service.getOffers({ query: 'caffè' });
      const res3 = await service.getOffers({ query: 'CAFFÈ' });

      assert.ok(res1.totalOffers > 0, 'Should find coffee offers');
      assert.equal(res1.totalOffers, res2.totalOffers);
      assert.equal(res2.totalOffers, res3.totalOffers);
    });

    it('getOffers filters by category, chainId, and minDiscount', async () => {
      const fruitOffers = await service.getOffers({ category: 'Frutta e Verdura' });
      assert.ok(fruitOffers.totalOffers >= 5);
      for (const o of fruitOffers.offers) {
        assert.equal(o.category, 'Frutta e Verdura');
      }

      const highDiscount = await service.getOffers({ minDiscount: 40 });
      assert.ok(highDiscount.totalOffers >= 5);
      for (const o of highDiscount.offers) {
        assert.ok(o.discountPercentage >= 40);
      }
    });

    it('getOffers supports pagination and sorting', async () => {
      const page1 = await service.getOffers({ page: 1, limit: 10, sortBy: 'discountDesc' });
      assert.equal(page1.offers.length, 10);
      assert.equal(page1.page, 1);
      assert.ok(page1.totalPages >= 4);

      // Verify discount descending sort
      for (let i = 0; i < page1.offers.length - 1; i++) {
        assert.ok(
          page1.offers[i].discountPercentage >= page1.offers[i + 1].discountPercentage,
          'Offers should be sorted by discount descending'
        );
      }
    });

    it('getStatus returns accurate system status and health metadata', async () => {
      await service.init();
      const status = await service.getStatus();
      assert.ok(typeof status.isOnline === 'boolean');
      assert.ok(['live', 'cache', 'seed'].includes(status.dataSource));
      assert.equal(status.storeCount, 14);
      assert.ok(status.flyerCount >= 12);
      assert.ok(status.offerCount >= 40);
    });
  });
});
