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

const daysFromNow = (days) => new Date(Date.now() + days * 86400_000).toISOString();

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
          start_date: daysFromNow(-7),
          end_date: daysFromNow(7),
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

  describe('Tier 5: Honest Data Integrity & Deep Sync Verification (ADR-0006)', () => {
    it('verifies seed dataset contains zero synthetic unitPrice ("€ / pz") and honest null originalPrice when absent', async () => {
      const seed = await service.loadSeedData();
      assert.equal(seed.stores.length, 14);
      assert.ok(seed.flyers.length >= 15);
      assert.ok(seed.offers.length >= 100);

      const storeIds = new Set(seed.stores.map(s => s.id));
      const nonRapalloRegex = /spezia|piacentin|pavese|piemont|lombard|sardegn|sicili|pugli|calabri|campani|lazio|toscan|venet|friul|trentin|emili|romagn|umbria|marche|abruzz|molis|basilicat|aosta/i;

      for (const f of seed.flyers) {
        assert.ok(storeIds.has(f.storeId), `Flyer ${f.id} storeId ${f.storeId} must exist in rapallo_stores.json`);
        assert.equal(nonRapalloRegex.test(f.title), false, `Flyer "${f.title}" must not be from outside province`);
      }

      let nullOriginalCount = 0;
      let realOriginalCount = 0;
      for (const o of seed.offers) {
        assert.ok(storeIds.has(o.storeId), `Offer ${o.id} storeId ${o.storeId} must exist in rapallo_stores.json`);
        assert.ok(!String(o.unitPrice || '').endsWith('€ / pz'), `Offer ${o.id} must not have synthetic "€ / pz" unitPrice`);
        if (o.originalPrice === null) {
          nullOriginalCount++;
          assert.equal(o.discountPercentage, null, 'Offer without originalPrice must have null discountPercentage');
          assert.equal(o.discountLabel, null, 'Offer without originalPrice must have null discountLabel');
        } else {
          realOriginalCount++;
          const expected = Math.round(((o.originalPrice - o.promoPrice) / o.originalPrice) * 100);
          assert.equal(o.discountPercentage, expected);
        }
      }

      assert.ok(nullOriginalCount > 0, 'Must preserve promo-only offers with originalPrice: null');
      assert.ok(realOriginalCount > 0, 'Must preserve discounted offers with real originalPrice');
    });

    it('deepSync() strictly filters out non-Rapallo flyers, preserves real end_date, and never invents x1.25 originalPrice', async () => {
      const mockService = new IngestionService({ cacheManager: cache });
      const pastStart = daysFromNow(-7);
      const futureDate = daysFromNow(14);

      mockService.fetchWithTimeout = async (url) => {
        if (url.includes('/rapallo/gulliver')) {
          // Store with ONLY out-of-province flyers -> must result in 0 flyers and 0 offers
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyersByRetailer: [
                    { id: '9001', title: 'Iper Pavese e Piemontese', start_date: pastStart.slice(0, 10), end_date: futureDate }
                  ],
                  flyerGibsData: {
                    flyerGibs: [
                      { id: 'g-pavese', title: 'Riso Pavese', settings: { price_extended: { digits: '2.00' } } }
                    ]
                  }
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: {
            pageProps: {
              apiResources: {
                flyersByRetailer: [
                  {
                    id: '8001',
                    title: 'Speciale Rapallo',
                    start_date: pastStart,
                    end_date: futureDate,
                    settings: { time_zone: { publish_at_iso: pastStart, unpublish_at_iso: futureDate } }
                  }
                ],
                flyerGibsData: {
                  flyerGibs: [
                    {
                      id: `gib-no-orig-${url.split('/').pop()}`,
                      title: 'Ananas Promo Solo Prezzo',
                      settings: {
                        price_extended: { digits: '1.48' },
                        starting_price: { digits: '' },
                        flyer_page: '3',
                        brand: 'Ortofrutta'
                      }
                    },
                    {
                      id: `gib-with-orig-${url.split('/').pop()}`,
                      title: 'Caffè Lavazza Qualità Rossa',
                      settings: {
                        price_extended: { digits: '3.99' },
                        starting_price: { digits: '5.99' },
                        flyer_page: '1',
                        brand: 'Lavazza'
                      }
                    }
                  ]
                }
              }
            }
          }
        })}</script>`;
        return new Response(html, { status: 200 });
      };

      const res = await mockService.deepSync();
      assert.equal(res.status, 'success');

      const flyers = await mockService.getFlyers('rapallo-gulliver-mameli');
      assert.equal(flyers.length, 0, 'Gulliver with only Pavese flyer must have 0 flyers (no fallback to out-of-province)');

      const baskoOffers = await mockService.getOffers({ storeId: 'rapallo-basko-colombo' });
      const promoOnly = baskoOffers.offers.find(o => o.title === 'Ananas Promo Solo Prezzo');
      assert.ok(promoOnly, 'Promo-only item must be included');
      assert.equal(promoOnly.promoPrice, 1.48);
      assert.equal(promoOnly.originalPrice, null, 'Must NOT invent originalPrice = 1.48 * 1.25');
      assert.equal(promoOnly.discountPercentage, null, 'Must NOT invent -20% discount');
      assert.equal(promoOnly.unitPrice, null, 'Must NOT invent "1,48 € / pz"');
      assert.equal(promoOnly.pageNumber, 3, 'Must preserve real flyer_page 3');
      assert.equal(promoOnly.validTo, futureDate, 'Must preserve exact validTo without +10d extension');
    });

    it('deepSync() rejects silent out-of-province flyers via storesData.stores (e.g. CZ, LT/RM) while canonicalizing external redirect hrefs for GE flyers (TASK-DATA-03)', async () => {
      const mockService = new IngestionService({ cacheManager: cache });
      const pastStart = daysFromNow(-7);
      const futureDate = daysFromNow(14);

      mockService.fetchWithTimeout = async (url) => {
        if (url === 'https://www.promoqui.it/rapallo/coop') {
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyersByRetailer: [
                    {
                      id: '1689209',
                      title: 'Al costo',
                      href: '/volantino/coop/1689209',
                      start_date: pastStart,
                      end_date: futureDate
                    },
                    {
                      id: '1740566',
                      title: 'Grandi marche',
                      href: '/volantino/coop/1740566',
                      start_date: pastStart,
                      end_date: futureDate
                    }
                  ]
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        if (url === 'https://www.promoqui.it/volantino/coop/1689209') {
          // Silent Calabria leak (no province in title, but storesData proves Catanzaro CZ)
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyer: { id: 1689209, is_national: false },
                  storesData: { stores: [{ city: 'Catanzaro', province: 'CZ' }, { city: 'Cosenza', province: 'CS' }] },
                  flyerGibsData: {
                    flyerGibs: [{ id: 'cz-leak-1', title: 'Olio Calabria Leak', settings: { price_extended: { digits: '4.99' } } }]
                  }
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        if (url === 'https://www.promoqui.it/volantino/coop/1740566') {
          // Real Liguria GE flyer
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyer: { id: 1740566, is_national: false },
                  storesData: { stores: [{ city: 'Rapallo', province: 'GE' }, { city: 'Genova', province: 'GE' }] },
                  flyerGibsData: {
                    flyerGibs: [{ id: 'ge-coop-1', title: 'Pesto Genovese Coop Liguria', settings: { price_extended: { digits: '2.19' } } }]
                  }
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        if (url === 'https://www.promoqui.it/rapallo/penny') {
          // External redirect href (next.doveconviene.it) -> must canonicalize to /volantino/penny/1735110
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyersByRetailer: [
                    {
                      id: '1735110',
                      title: 'Catalogo di Natale',
                      href: 'https://next.doveconviene.it/promoqui?flyer=1735110',
                      start_date: '2026-11-01T00:00:00.000Z',
                      end_date: futureDate
                    }
                  ]
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        if (url === 'https://www.promoqui.it/volantino/penny/1735110') {
          const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
            props: {
              pageProps: {
                apiResources: {
                  flyer: { id: 1735110, is_national: false },
                  storesData: { stores: [{ city: 'Rapallo', province: 'GE' }] },
                  flyerGibsData: {
                    flyerGibsCount: 50,
                    flyerGibs: [{ id: 'ge-penny-xmas-1', title: 'Albero di Natale innevato 180cm', settings: { price_extended: { digits: '29.99' } } }]
                  }
                }
              }
            }
          })}</script>`;
          return new Response(html, { status: 200 });
        }

        // Other stores empty in this focused test
        const emptyHtml = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
          props: { pageProps: { apiResources: { flyersByRetailer: [] } } }
        })}</script>`;
        return new Response(emptyHtml, { status: 200 });
      };

      const res = await mockService.deepSync();
      assert.equal(res.status, 'success');

      const coopFlyers = await mockService.getFlyers('rapallo-coop-sciesa');
      assert.equal(coopFlyers.length, 1, 'Must reject Catanzaro flyer 1689209 and keep only GE flyer 1740566');
      assert.equal(coopFlyers[0].id, '1740566');

      const coopOffers = await mockService.getOffers({ storeId: 'rapallo-coop-sciesa' });
      assert.equal(coopOffers.totalOffers, 1);
      assert.equal(coopOffers.offers[0].title, 'Pesto Genovese Coop Liguria');

      const pennyFlyers = await mockService.getFlyers('rapallo-penny-milano');
      assert.equal(pennyFlyers.length, 1, 'External sponsor href must resolve to canonical /volantino/penny/1735110');
      assert.equal(pennyFlyers[0].upstreamIndexedCap, 50);

      const pennyOffers = await mockService.getOffers({ storeId: 'rapallo-penny-milano', domain: 'bazar_seasonal' });
      assert.equal(pennyOffers.totalOffers, 1);
      assert.equal(pennyOffers.offers[0].category, 'Giocattoli, Natale e Tempo Libero');
    });

    it('M-P0-01 & M-P2-08: offline deepSync() never overwrites valid cached offers/flyers with [], sync() normalizes rawOffers, and CacheManager handles string path + SQLite staleGraceSeconds + NaN expiry', async () => {
      // 1. Prime cache with seed data, then run offline deepSync() -> must preserve cached offers & flyers
      const seedData = await service.loadSeedData();
      await cache.set('stores', seedData.stores, { source: 'live' });
      await cache.set('flyers', seedData.flyers, { source: 'live' });
      await cache.set('offers', seedData.offers, { source: 'live' });

      const offlineDeepService = new IngestionService({ cacheManager: cache });
      offlineDeepService.fetchWithTimeout = async () => {
        throw new Error('ENOTFOUND www.promoqui.it');
      };

      const offlineRes = await offlineDeepService.deepSync();
      assert.equal(offlineRes.status, 'cached_fallback');
      const preservedOffers = await cache.get('offers');
      const preservedFlyers = await cache.get('flyers');
      assert.ok(Array.isArray(preservedOffers));
      assert.equal(preservedOffers.length, seedData.offers.length, 'Offline deepSync must NOT clobber cached offers with []');
      assert.equal(preservedFlyers.length, seedData.flyers.length, 'Offline deepSync must NOT clobber cached flyers with []');

      // 2. sync(true) normalizes raw PromoQui topOffers into canonical Rapallo offer schema
      const liveSyncDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-sync-norm-'));
      try {
        const stringCache = new CacheManager(liveSyncDir); // string constructor support
        const liveSyncService = new IngestionService({ cacheManager: stringCache });
        const futureIso = '2099-12-31T23:59:59.000Z';
        liveSyncService.fetchLiveAggregator = async () => ({
          rawFlyers: [
            {
              id: 'fly-coop-live',
              retailerName: 'Coop Liguria',
              title: 'Speciale Soci Rapallo',
              start_date: '2026-11-01T00:00:00.000Z',
              end_date: futureIso,
              pageCount: 4
            }
          ],
          rawOffers: [
            {
              id: 'raw-top-1',
              flyerId: 'fly-coop-live',
              retailerName: 'Coop Liguria',
              title: 'Olio Extra Vergine 1L',
              brand: 'Coop',
              settings: {
                price_extended: { digits: '6.49' },
                starting_price: { digits: '8.99' },
                flyer_page: '2'
              }
            }
          ]
        });

        const syncRes = await liveSyncService.sync(true);
        assert.equal(syncRes.status, 'success');
        const queried = await liveSyncService.getOffers({ storeId: 'rapallo-coop-sciesa' });
        assert.equal(queried.totalOffers, 1);
        assert.equal(queried.offers[0].promoPrice, 6.49);
        assert.equal(queried.offers[0].originalPrice, 8.99);
        assert.equal(queried.offers[0].domain, 'food_human');
        assert.equal(queried.offers[0].validTo, futureIso);
      } finally {
        fs.rmSync(liveSyncDir, { recursive: true, force: true });
      }

      // 3. M-P2-08: SQLite cleanupExpired honors staleGraceSeconds and CacheManager rejects NaN expiresAt
      const sqliteDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-sqlite-grace-'));
      try {
        const sqliteCache = new CacheManager({
          cacheDir: sqliteDir,
          backend: 'sqlite',
          defaultTtlSeconds: 1,
          defaultStaleGraceSeconds: 3600
        });
        await sqliteCache.set('grace_key', [{ id: 1 }], { ttlSeconds: 1, staleGraceSeconds: 3600 });
        const removedWithinGrace = sqliteCache.cleanupExpired(Date.now() + 5000);
        assert.equal(removedWithinGrace, 0, 'Row inside staleGraceSeconds must NOT be pruned');
        const removedPastGrace = sqliteCache.cleanupExpired(Date.now() + 4000 * 1000);
        assert.equal(removedPastGrace, 1, 'Row past expiresAt + staleGraceSeconds must be pruned');
        sqliteCache.close();

        const nanDir = fs.mkdtempSync(path.join(os.tmpdir(), 'basilico-nan-exp-'));
        const nanCache = new CacheManager({ cacheDir: nanDir, backend: 'json' });
        fs.writeFileSync(
          path.join(nanDir, 'corrupt_exp.json'),
          JSON.stringify({
            metadata: {
              key: 'corrupt_exp',
              cachedAt: new Date().toISOString(),
              expiresAt: 'not-a-valid-iso-date',
              staleGraceSeconds: 60
            },
            data: [{ bad: true }]
          })
        );
        const nanRead = await nanCache.get('corrupt_exp', { allowStale: true });
        assert.equal(nanRead, null, 'Invalid NaN expiresAt must be treated as expired, never immortal');
        assert.equal(nanCache.isExpired('corrupt_exp'), true);
        fs.rmSync(nanDir, { recursive: true, force: true });
      } finally {
        fs.rmSync(sqliteDir, { recursive: true, force: true });
      }
    });
  });
});
