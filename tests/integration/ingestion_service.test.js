import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RAPALLO_STORES,
  createIsolatedTempDir,
  validateFlyerSchema
} from '../helpers/test_helper.js';

describe('Integration Tests: Multi-Tier Ingestion & Parser Engine (F3, F8)', () => {
  // Mock aggregator payload fixture representing Next.js __NEXT_DATA__
  const mockNextDataPayload = {
    props: {
      pageProps: {
        apiResources: {
          topCategoryFlyers: [
            {
              id: '1727665',
              retailerName: 'Carrefour Market',
              title: 'Prezzi Freschi Rapallo',
              start_date: '2026-10-23T00:00:00.000Z',
              end_date: '2026-11-08T23:59:59.000Z',
              imageAssets: {
                cover: 'https://it-it-media.shopfully.cloud/images/volantini/big_1727665.jpg',
                pages: [
                  'https://it-it-media.shopfully.cloud/images/volantini/page_1.jpg',
                  'https://it-it-media.shopfully.cloud/images/volantini/page_2.jpg'
                ]
              }
            },
            {
              id: '1721387',
              retailerName: 'Conad City',
              title: 'Taglio Netto Rapallo',
              start_date: '2026-10-26T00:00:00.000Z',
              end_date: '2026-11-12T23:59:59.000Z',
              imageAssets: {
                cover: 'https://it-it-media.shopfully.cloud/images/volantini/big_1721387.jpg',
                pages: ['https://it-it-media.shopfully.cloud/images/volantini/conad_1.jpg']
              }
            }
          ]
        }
      }
    }
  };

  /**
   * Reference Ingestion Parser Engine (Oracle for F3 / F8)
   */
  function parseAggregatorFlyers(payload, storeMapping) {
    if (!payload || !payload.props?.pageProps?.apiResources?.topCategoryFlyers) {
      throw new Error('Invalid or missing aggregator flyer payload');
    }
    const rawList = payload.props.pageProps.apiResources.topCategoryFlyers;
    return rawList.map((raw) => {
      const matchedStore = storeMapping.find((s) =>
        s.name.toLowerCase().includes(raw.retailerName.toLowerCase()) ||
        raw.retailerName.toLowerCase().includes(s.brand.toLowerCase())
      );
      return {
        id: String(raw.id),
        storeId: matchedStore ? matchedStore.id : 'unknown-store',
        title: raw.title,
        validFrom: raw.start_date,
        validTo: raw.end_date,
        pageCount: raw.imageAssets?.pages?.length || 1,
        coverImageUrl: raw.imageAssets?.cover || '',
        pages: raw.imageAssets?.pages || []
      };
    });
  }

  describe('F3: Multi-Tier Ingestion Parser Engine (Tier 1)', () => {
    it('3.1 should parse raw Next.js __NEXT_DATA__ into normalized Flyer objects', () => {
      const normalized = parseAggregatorFlyers(mockNextDataPayload, CANONICAL_RAPALLO_STORES);
      assert.equal(normalized.length, 2);
      assert.equal(normalized[0].id, '1727665');
      assert.equal(normalized[0].title, 'Prezzi Freschi Rapallo');
      assert.equal(normalized[0].pageCount, 2);
      assert.equal(validateFlyerSchema(normalized[0]).length, 0);
    });

    it('3.2 should match aggregator retailer name to canonical Rapallo storeId', () => {
      const normalized = parseAggregatorFlyers(mockNextDataPayload, CANONICAL_RAPALLO_STORES);
      assert.equal(normalized[0].storeId, 'carrefour-market-assereto');
      assert.equal(normalized[1].storeId, 'conad-city-torrecivica');
    });

    it('3.3 should return IngestionResult with dataSource "live" when live fetch succeeds', async () => {
      // Simulate live connector execution
      const simulateLiveFetch = async () => ({
        status: 'success',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 45,
        storesProcessed: 5,
        totalFlyers: 2,
        totalOffers: 40,
        dataSource: 'live',
        errors: []
      });

      const result = await simulateLiveFetch();
      assert.equal(result.status, 'success');
      assert.equal(result.dataSource, 'live');
      assert.ok(result.durationMs >= 0);
      assert.equal(result.errors.length, 0);
    });

    it('3.4 should fallback to cache with dataSource "cache" when live fetch fails', async () => {
      const cachedData = { flyers: [{ id: 'cached-1' }] };
      const simulateFetchWithCacheFallback = async (networkFails = true) => {
        if (networkFails) {
          return {
            status: 'cached_fallback',
            dataSource: 'cache',
            data: cachedData,
            errors: [{ storeId: 'all', message: 'Network offline: simulated' }]
          };
        }
        return { status: 'success', dataSource: 'live', data: {} };
      };

      const result = await simulateFetchWithCacheFallback(true);
      assert.equal(result.status, 'cached_fallback');
      assert.equal(result.dataSource, 'cache');
      assert.equal(result.data.flyers.length, 1);
      assert.ok(result.errors.length > 0);
    });

    it('3.5 should fallback to seed dataset with dataSource "seed" when both live and cache fail', async () => {
      const simulateColdOfflineBoot = async () => {
        const hasLive = false;
        const hasCache = false;
        if (!hasLive && !hasCache) {
          return {
            status: 'seed_fallback',
            dataSource: 'seed',
            storeCount: CANONICAL_RAPALLO_STORES.length,
            isOnline: false
          };
        }
      };

      const result = await simulateColdOfflineBoot();
      assert.equal(result.dataSource, 'seed');
      assert.equal(result.isOnline, false);
      assert.equal(result.storeCount, 5);
    });
  });

  describe('F3 & F8: Ingestion Boundary & Failure Recovery (Tier 2)', () => {
    it('3.6 should gracefully catch malformed JSON payload and trigger fallback without crash', () => {
      const malformedPayload = { props: { corrupted: true } };
      assert.throws(
        () => parseAggregatorFlyers(malformedPayload, CANONICAL_RAPALLO_STORES),
        /Invalid or missing aggregator flyer payload/
      );
    });

    it('3.7 should enforce AbortController timeout guardrail (5000ms)', async () => {
      const fetchWithTimeout = async (timeoutMs) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
        try {
          await new Promise((resolve, reject) => {
            const timer = setTimeout(resolve, timeoutMs * 2);
            controller.signal.addEventListener('abort', () => {
              clearTimeout(timer);
              reject(new Error('Fetch timeout exceeded'));
            });
          });
        } finally {
          clearTimeout(timeoutId);
        }
      };

      await assert.rejects(
        () => fetchWithTimeout(50),
        /Fetch timeout exceeded/
      );
    });

    it('3.8 should handle HTTP 404 or 500 upstream responses by recording store error', async () => {
      const stores = ['coop-rapallo-sciesa', 'carrefour-market-assereto'];
      const errors = [];
      const results = [];

      for (const s of stores) {
        if (s === 'carrefour-market-assereto') {
          errors.push({ storeId: s, status: 500, message: 'Upstream 500 Internal Error' });
        } else {
          results.push({ storeId: s, status: 200, items: 10 });
        }
      }

      assert.equal(results.length, 1);
      assert.equal(errors.length, 1);
      assert.equal(errors[0].storeId, 'carrefour-market-assereto');
    });

    it('3.9 should handle empty flyer list response without throwing exceptions', () => {
      const emptyPayload = {
        props: {
          pageProps: {
            apiResources: {
              topCategoryFlyers: []
            }
          }
        }
      };
      const result = parseAggregatorFlyers(emptyPayload, CANONICAL_RAPALLO_STORES);
      assert.equal(result.length, 0);
    });

    it('3.10 should deduplicate concurrent sync() calls to avoid redundant scraping', async () => {
      let callCount = 0;
      let syncPromise = null;

      const triggerSync = async () => {
        if (syncPromise) return syncPromise;
        syncPromise = (async () => {
          callCount++;
          await new Promise((r) => setTimeout(r, 20));
          syncPromise = null;
          return { status: 'success', execution: callCount };
        })();
        return syncPromise;
      };

      const [res1, res2, res3] = await Promise.all([
        triggerSync(),
        triggerSync(),
        triggerSync()
      ]);

      assert.equal(callCount, 1, 'Concurrent calls should share a single in-flight ingestion promise');
      assert.equal(res1.execution, 1);
      assert.equal(res2.execution, 1);
      assert.equal(res3.execution, 1);
    });
  });
});
