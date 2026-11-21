import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CANONICAL_RAPALLO_STORES,
  normalizeSearchToken,
  PROJECT_ROOT
} from '../helpers/test_helper.js';
import { offerService } from '../../server/services/offerService.js';
import { checkAndPrepareBuild, startServer, distIndexExists } from '../../server.js';

describe('Challenger 2 Empirical Stress Test Suite: Milestone 3 Resilience & Interactions', () => {

  // =========================================================================
  // STRESS SUITE 1: Offline Fallback Transitions & State Machine Stress
  // =========================================================================
  describe('1. Offline Fallback Transitions & State Machine Stress', () => {
    /**
     * Offline Resilience State Machine matching OfflineNotice.jsx logic
     */
    class OfflineResilienceHarness {
      constructor() {
        this.isOnline = true;
        this.dataSource = 'live'; // 'live' | 'cache' | 'seed'
        this.lastSyncTimestamp = new Date().toISOString();
        this.isBannerDismissed = false;
        this.retryCount = 0;
        this.retryHistory = [];
      }

      setNetwork(online) {
        this.isOnline = online;
        if (!online) {
          this.dataSource = 'seed';
          // A fresh network drop resets dismissal so user is informed of new failure
          this.isBannerDismissed = false;
        } else {
          this.dataSource = 'live';
        }
        return this.computeBannerState();
      }

      setCache(timestamp) {
        this.dataSource = 'cache';
        this.lastSyncTimestamp = timestamp;
        return this.computeBannerState();
      }

      dismiss() {
        this.isBannerDismissed = true;
        return this.computeBannerState();
      }

      async triggerRetry(mockUpstreamAvailable = false) {
        this.retryCount++;
        if (mockUpstreamAvailable) {
          this.isOnline = true;
          this.dataSource = 'live';
          this.lastSyncTimestamp = new Date().toISOString();
          this.isBannerDismissed = false;
          this.retryHistory.push({ success: true, timestamp: this.lastSyncTimestamp });
          return { success: true, dataSource: 'live' };
        } else {
          this.retryHistory.push({ success: false, timestamp: new Date().toISOString() });
          return { success: false, error: 'Upstream still unreachable' };
        }
      }

      computeBannerState() {
        const isDismissed = this.isBannerDismissed;
        const isStale = Boolean(
          this.dataSource === 'cache' &&
          this.lastSyncTimestamp &&
          (Date.now() - new Date(this.lastSyncTimestamp).getTime()) > 86400000
        );

        const showBanner = !isDismissed && (this.dataSource === 'seed' || this.dataSource === 'cache' || !this.isOnline);

        let bannerMessage = '';
        let badgeText = 'Cache';
        if (this.dataSource === 'seed' || !this.isOnline) {
          bannerMessage = 'Sei in modalità offline. Visualizzazione dati promozionali salvati per Rapallo.';
          badgeText = 'Offline';
        } else if (isStale) {
          bannerMessage = 'Dati promozionali memorizzati oltre 24 ore fa. Alcuni prezzi potrebbero variare.';
          badgeText = 'Obsoleto';
        } else if (this.dataSource === 'cache') {
          bannerMessage = 'Connessione upstream non disponibile. Visualizzazione copia cache.';
          badgeText = 'Copia Cache';
        }

        return {
          isOnline: this.isOnline,
          dataSource: this.dataSource,
          showBanner,
          bannerMessage,
          badgeText,
          isStale,
          isDismissed
        };
      }
    }

    it('1.1 should correctly identify seed fallback on upstream offline drop', () => {
      const harness = new OfflineResilienceHarness();
      const state = harness.setNetwork(false);

      assert.equal(state.isOnline, false);
      assert.equal(state.dataSource, 'seed');
      assert.equal(state.showBanner, true);
      assert.equal(state.badgeText, 'Offline');
      assert.ok(state.bannerMessage.includes('modalità offline'));
    });

    it('1.2 should display stale warning when cache timestamp exceeds 24 hours (86,400,000ms)', () => {
      const harness = new OfflineResilienceHarness();
      const staleTimestamp = new Date(Date.now() - (25 * 3600 * 1000)).toISOString();
      const state = harness.setCache(staleTimestamp);

      assert.equal(state.isStale, true);
      assert.equal(state.showBanner, true);
      assert.equal(state.badgeText, 'Obsoleto');
      assert.ok(state.bannerMessage.includes('24 ore fa'));
    });

    it('1.3 should display standard cache message when cache is fresh (< 24 hours)', () => {
      const harness = new OfflineResilienceHarness();
      const freshTimestamp = new Date(Date.now() - (2 * 3600 * 1000)).toISOString();
      const state = harness.setCache(freshTimestamp);

      assert.equal(state.isStale, false);
      assert.equal(state.showBanner, true);
      assert.equal(state.badgeText, 'Copia Cache');
      assert.ok(state.bannerMessage.includes('copia cache'));
    });

    it('1.4 should dismiss banner on user click while maintaining offline status', () => {
      const harness = new OfflineResilienceHarness();
      harness.setNetwork(false);
      assert.equal(harness.computeBannerState().showBanner, true);

      const dismissedState = harness.dismiss();
      assert.equal(dismissedState.showBanner, false);
      assert.equal(dismissedState.isOnline, false);
      assert.equal(dismissedState.isDismissed, true);
    });

    it('1.5 should handle failed manual retry without unhandled exceptions and maintain banner', async () => {
      const harness = new OfflineResilienceHarness();
      harness.setNetwork(false);

      const retryRes = await harness.triggerRetry(false);
      assert.equal(retryRes.success, false);
      assert.equal(harness.retryCount, 1);
      assert.equal(harness.computeBannerState().showBanner, true);
    });

    it('1.6 should recover to live online mode upon successful retry sync', async () => {
      const harness = new OfflineResilienceHarness();
      harness.setNetwork(false);
      assert.equal(harness.computeBannerState().showBanner, true);

      const retryRes = await harness.triggerRetry(true);
      assert.equal(retryRes.success, true);
      assert.equal(harness.computeBannerState().showBanner, false);
      assert.equal(harness.computeBannerState().dataSource, 'live');
      assert.equal(harness.computeBannerState().isOnline, true);
    });

    it('1.7 should survive rapid network status oscillation (100 transitions) without corrupted state', () => {
      const harness = new OfflineResilienceHarness();
      for (let i = 0; i < 100; i++) {
        harness.setNetwork(i % 2 === 0);
        const s = harness.computeBannerState();
        assert.equal(typeof s.showBanner, 'boolean');
        assert.equal(typeof s.bannerMessage, 'string');
      }
      // Ends at i=99 (odd -> offline)
      assert.equal(harness.computeBannerState().isOnline, false);
      assert.equal(harness.computeBannerState().showBanner, true);
    });
  });

  // =========================================================================
  // STRESS SUITE 2: Accent-Insensitive Search with Complex Italian Queries
  // =========================================================================
  describe('2. Accent-Insensitive Search with Complex Italian Queries', () => {
    const stressGroceryOffers = [
      {
        id: 'stress-caffe-1',
        title: 'Caffè Lavazza Qualità Oro 250g',
        brand: 'Lavazza',
        category: 'Colazione e Dolci',
        storeId: 'coop-rapallo-sciesa',
        promoPrice: 3.49,
        originalPrice: 4.99,
        discountPercentage: 30
      },
      {
        id: 'stress-caffe-2',
        title: 'Caffè De-Caffeinato Illy Espresso Macinato 250g',
        brand: 'Illy',
        category: 'Colazione e Dolci',
        storeId: 'carrefour-market-assereto',
        promoPrice: 4.99,
        originalPrice: 6.99,
        discountPercentage: 29
      },
      {
        id: 'stress-mozzarella-1',
        title: 'Mozzarella di Bufala Campana DOP 200g',
        brand: 'Garofalo',
        category: 'Latticini e Formaggi',
        storeId: 'conad-city-torrecivica',
        promoPrice: 2.79,
        originalPrice: 3.99,
        discountPercentage: 30
      },
      {
        id: 'stress-mozzarella-2',
        title: 'Mozzarella Santa Lucia Galbani 3x100g',
        brand: 'Galbani',
        category: 'Latticini e Formaggi',
        storeId: 'basko-rapallo-colombo',
        promoPrice: 2.19,
        originalPrice: 3.29,
        discountPercentage: 33
      },
      {
        id: 'stress-olio-1',
        title: 'Olio Extra Vergine di Oliva Monini Il Poggiolo 1L',
        brand: 'Monini',
        category: 'Dispensa e Pasta',
        storeId: 'basko-rapallo-colombo',
        promoPrice: 6.99,
        originalPrice: 10.99,
        discountPercentage: 36
      },
      {
        id: 'stress-olio-2',
        title: 'Tonno all\'Olio di Oliva Rio Mare 4x80g',
        brand: 'Rio Mare',
        category: 'Dispensa e Pasta',
        storeId: 'coop-rapallo-sciesa',
        promoPrice: 3.69,
        originalPrice: 5.49,
        discountPercentage: 33
      },
      {
        id: 'stress-pasta-1',
        title: 'Pasta di Gragnano IGP Penne Rigate Garofalo 500g',
        brand: 'Garofalo',
        category: 'Dispensa e Pasta',
        storeId: 'doro-tigullio-margherita',
        promoPrice: 0.99,
        originalPrice: 1.69,
        discountPercentage: 41
      }
    ];

    it('2.1 should match "caffè" and "caffe" symmetrically across both coffee items', () => {
      const q1 = offerService.processQuery({ q: 'caffè' }, stressGroceryOffers);
      const q2 = offerService.processQuery({ q: 'caffe' }, stressGroceryOffers);
      const q3 = offerService.processQuery({ q: 'CAFFÈ' }, stressGroceryOffers);
      const q4 = offerService.processQuery({ q: 'Caffé' }, stressGroceryOffers);

      assert.equal(q1.totalOffers, 2);
      assert.equal(q2.totalOffers, 2);
      assert.equal(q3.totalOffers, 2);
      assert.equal(q4.totalOffers, 2);
      assert.deepEqual(q1.offers.map(o => o.id), q2.offers.map(o => o.id));
      assert.deepEqual(q1.offers.map(o => o.id), q3.offers.map(o => o.id));
      assert.deepEqual(q1.offers.map(o => o.id), q4.offers.map(o => o.id));
    });

    it('2.2 should match "mozzarella" with surrounding whitespaces, tabs, and newline characters', () => {
      const clean = offerService.processQuery({ q: 'mozzarella' }, stressGroceryOffers);
      const messy = offerService.processQuery({ q: '  \t \n mozzarella \r \t  ' }, stressGroceryOffers);

      assert.equal(clean.totalOffers, 2);
      assert.equal(messy.totalOffers, 2);
      assert.deepEqual(clean.offers.map(o => o.id), messy.offers.map(o => o.id));
    });

    it('2.3 should find olive oil promotions with queries "olio extravergine", "olio", "extra vergine"', () => {
      const resExtra = offerService.processQuery({ q: 'extra vergine' }, stressGroceryOffers);
      assert.equal(resExtra.totalOffers, 1);
      assert.equal(resExtra.offers[0].id, 'stress-olio-1');

      const resOlio = offerService.processQuery({ q: 'olio' }, stressGroceryOffers);
      assert.equal(resOlio.totalOffers, 2); // Monini + Rio Mare
      const olioIds = resOlio.offers.map(o => o.id);
      assert.ok(olioIds.includes('stress-olio-1'));
      assert.ok(olioIds.includes('stress-olio-2'));
    });

    it('2.4 should handle special punctuation (apostrophe, hyphens, slashes) in product names', () => {
      // "all'olio" vs "all olio"
      const resApos = offerService.processQuery({ q: "all'olio" }, stressGroceryOffers);
      assert.equal(resApos.totalOffers, 1);
      assert.equal(resApos.offers[0].id, 'stress-olio-2');

      // "de-caffeinato" vs "decaffeinato"
      const resHyphen = offerService.processQuery({ q: 'de caffeinato' }, stressGroceryOffers);
      assert.equal(resHyphen.totalOffers, 1);
      assert.equal(resHyphen.offers[0].id, 'stress-caffe-2');
    });

    it('2.5 should neutralize regex special characters without throwing syntax errors', () => {
      const dangerousQueries = [
        '.*',
        '+',
        'caffè (250g)',
        '[0-9]+',
        '\\bmozzarella\\b',
        'pasta / rigate',
        'caffè?|olio*',
        '${process.env.PATH}',
        '/*<![CDATA[*/',
        "'; DROP TABLE offers; --"
      ];

      for (const dq of dangerousQueries) {
        assert.doesNotThrow(() => {
          const res = offerService.processQuery({ q: dq }, stressGroceryOffers);
          assert.equal(typeof res.totalOffers, 'number');
        }, `Query "${dq}" should not throw error`);
      }
    });

    it('2.6 should safely sanitize emoji and non-Latin symbols (☕, 🍕, 🧀)', () => {
      const resEmoji = offerService.processQuery({ q: '☕ caffè' }, stressGroceryOffers);
      assert.equal(resEmoji.totalOffers, 2);
    });

    it('2.7 should handle empty search query string and return all offers', () => {
      const res = offerService.processQuery({ q: '   ' }, stressGroceryOffers);
      assert.equal(res.totalOffers, stressGroceryOffers.length);
    });
  });

  // =========================================================================
  // STRESS SUITE 3: Store Switching, Filter Preservation & URL Sync Roundtrips
  // =========================================================================
  describe('3. Store Switching, Filter Preservation & URL Sync Roundtrips', () => {
    /**
     * URL Sync and Store Switcher State Simulator matching App.jsx & StoreSwitcher.jsx
     */
    class StoreSwitcherHarness {
      constructor(stores = CANONICAL_RAPALLO_STORES) {
        this.stores = stores;
        this.selectedStoreId = null;
        this.searchQuery = '';
        this.selectedCategory = null;
        this.sortBy = 'discountDesc';
      }

      initFromUrl(searchString) {
        const params = new URLSearchParams(searchString);
        const storeParam = params.get('store');
        if (storeParam) {
          const match = this.stores.find(
            s => s.id === storeParam || s.brand.toLowerCase() === storeParam.toLowerCase()
          );
          this.selectedStoreId = match ? match.id : null;
        } else {
          this.selectedStoreId = null;
        }

        this.searchQuery = params.get('q') || '';
        this.selectedCategory = params.get('category') || null;
        this.sortBy = params.get('sortBy') || 'discountDesc';
        return this.getState();
      }

      selectStore(storeId) {
        // Preserves active filters (searchQuery, selectedCategory, sortBy)
        this.selectedStoreId = storeId || null;
        return this.getState();
      }

      toUrlSearch() {
        const params = new URLSearchParams();
        if (this.selectedStoreId) params.set('store', this.selectedStoreId);
        if (this.searchQuery.trim()) params.set('q', this.searchQuery.trim());
        if (this.selectedCategory) params.set('category', this.selectedCategory);
        if (this.sortBy && this.sortBy !== 'discountDesc') params.set('sortBy', this.sortBy);
        const str = params.toString();
        return str ? `?${str}` : '';
      }

      getState() {
        const activeStore = this.stores.find(s => s.id === this.selectedStoreId) || null;
        return {
          selectedStoreId: this.selectedStoreId,
          activeStoreName: activeStore ? activeStore.name : 'Tutti i Supermercati',
          isRegionalServing: Boolean(activeStore?.isRegionalServing),
          searchQuery: this.searchQuery,
          selectedCategory: this.selectedCategory,
          sortBy: this.sortBy,
          urlSearch: this.toUrlSearch()
        };
      }
    }

    it('3.1 should parse URL "?store=carrefour-market-assereto" and activate Carrefour', () => {
      const harness = new StoreSwitcherHarness();
      const state = harness.initFromUrl('?store=carrefour-market-assereto');

      assert.equal(state.selectedStoreId, 'carrefour-market-assereto');
      assert.ok(state.activeStoreName.includes('Carrefour'));
      assert.equal(state.urlSearch, '?store=carrefour-market-assereto');
    });

    it('3.2 should preserve search query and category filter when switching stores', () => {
      const harness = new StoreSwitcherHarness();
      // Shopper searches for pasta with category "Dispensa e Pasta" at Carrefour
      harness.initFromUrl('?store=carrefour-market-assereto&q=pasta&category=Dispensa+e+Pasta&sortBy=priceAsc');

      assert.equal(harness.getState().selectedStoreId, 'carrefour-market-assereto');
      assert.equal(harness.getState().searchQuery, 'pasta');
      assert.equal(harness.getState().selectedCategory, 'Dispensa e Pasta');
      assert.equal(harness.getState().sortBy, 'priceAsc');

      // Shopper switches to Basko
      const baskoState = harness.selectStore('basko-rapallo-colombo');

      assert.equal(baskoState.selectedStoreId, 'basko-rapallo-colombo');
      assert.equal(baskoState.searchQuery, 'pasta', 'Query must be preserved');
      assert.equal(baskoState.selectedCategory, 'Dispensa e Pasta', 'Category must be preserved');
      assert.equal(baskoState.sortBy, 'priceAsc', 'Sort order must be preserved');

      // Verify serialized URL reflects updated store with preserved filters
      assert.ok(baskoState.urlSearch.includes('store=basko-rapallo-colombo'));
      assert.ok(baskoState.urlSearch.includes('q=pasta'));
      assert.ok(baskoState.urlSearch.includes('category=Dispensa+e+Pasta'));
      assert.ok(baskoState.urlSearch.includes('sortBy=priceAsc'));
    });

    it('3.3 should switch to "Tutti" (null) and cleanly omit the store URL parameter', () => {
      const harness = new StoreSwitcherHarness();
      harness.initFromUrl('?store=coop-rapallo-sciesa&q=latte');

      const allState = harness.selectStore(null);
      assert.equal(allState.selectedStoreId, null);
      assert.equal(allState.activeStoreName, 'Tutti i Supermercati');
      assert.equal(allState.searchQuery, 'latte');
      assert.equal(allState.urlSearch, '?q=latte');
      assert.ok(!allState.urlSearch.includes('store='));
    });

    it('3.4 should support fuzzy brand name query in URL (?store=conad)', () => {
      const harness = new StoreSwitcherHarness();
      const state = harness.initFromUrl('?store=conad');

      assert.equal(state.selectedStoreId, 'conad-city-torrecivica');
      assert.ok(state.activeStoreName.includes('Conad'));
    });

    it('3.5 should fall back safely to "Tutti" when unknown storeId is passed (?store=unknown_store_99)', () => {
      const harness = new StoreSwitcherHarness();
      const state = harness.initFromUrl('?store=unknown_store_99');

      assert.equal(state.selectedStoreId, null);
      assert.equal(state.activeStoreName, 'Tutti i Supermercati');
    });

    it('3.6 should display regional serving badge when switching to Doro Tigullio', () => {
      const harness = new StoreSwitcherHarness();
      const state = harness.selectStore('doro-tigullio-margherita');

      assert.equal(state.selectedStoreId, 'doro-tigullio-margherita');
      assert.equal(state.isRegionalServing, true);
    });

    it('3.7 should handle 100 rapid sequential store switches without desynchronization', () => {
      const harness = new StoreSwitcherHarness();
      const storeIds = [null, ...CANONICAL_RAPALLO_STORES.map(s => s.id)];

      for (let i = 0; i < 100; i++) {
        const targetId = storeIds[i % storeIds.length];
        const s = harness.selectStore(targetId);
        assert.equal(s.selectedStoreId, targetId);
      }
    });
  });

  // =========================================================================
  // STRESS SUITE 4: Clean Checkout Automated Build Verification (node server.js)
  // =========================================================================
  describe('4. Clean Checkout Automated Build Verification', () => {
    it('4.1 should automatically build dist/index.html if missing and serve 200 on port 3198', async () => {
      const tempDistDir = path.resolve(PROJECT_ROOT, `dist_cold_test_${Date.now()}`);
      if (fs.existsSync(tempDistDir)) {
        fs.rmSync(tempDistDir, { recursive: true, force: true });
      }

      assert.equal(distIndexExists(tempDistDir), false, 'Pre-condition: temp dist/index.html must be absent');
      checkAndPrepareBuild(tempDistDir);
      assert.equal(distIndexExists(tempDistDir), true, 'tempDistDir/index.html must exist after checkAndPrepareBuild');

      try {
        process.env.PORT = '3198';
        const server = await startServer();

        // Verify HTTP GET / returns 200 with viewport meta
        const res = await fetch('http://localhost:3198/');
        assert.equal(res.status, 200);
        const html = await res.text();
        assert.ok(html.includes('<meta name="viewport"'), 'Must serve HTML with viewport meta');
        assert.ok(html.includes('id="root"'), 'Must serve HTML with React mount container');

        // Verify API is operational
        const statusRes = await fetch('http://localhost:3198/api/status');
        assert.equal(statusRes.status, 200);
        const statusData = await statusRes.json();
        assert.equal(typeof statusData.storeCount, 'number');

        await new Promise((resolve) => server.close(resolve));
      } finally {
        if (fs.existsSync(tempDistDir)) {
          fs.rmSync(tempDistDir, { recursive: true, force: true });
        }
      }
    });
  });
});
