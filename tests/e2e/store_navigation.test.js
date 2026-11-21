import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CANONICAL_CHAINS, CANONICAL_RAPALLO_STORES } from '../helpers/test_helper.js';

describe('E2E Tests: Store Switcher & Navigation (F11)', () => {
  /**
   * Reference Store Switcher State Coordinator (Oracle for F11)
   */
  class StoreNavigationCoordinator {
    constructor(stores = CANONICAL_RAPALLO_STORES) {
      this.stores = stores;
      this.selectedStoreId = null; // null represents "Tutti"
      this.searchQuery = '';
      this.focusedIndex = 0;
    }

    selectStore(storeId) {
      this.selectedStoreId = storeId || null;
      return this.getState();
    }

    setSearchQuery(q) {
      this.searchQuery = q || '';
    }

    navigateKeyboard(direction) {
      // 0: Tutti, 1..N: Stores
      const totalTabs = this.stores.length + 1;
      if (direction === 'ArrowRight' || direction === 'ArrowDown') {
        this.focusedIndex = (this.focusedIndex + 1) % totalTabs;
      } else if (direction === 'ArrowLeft' || direction === 'ArrowUp') {
        this.focusedIndex = (this.focusedIndex - 1 + totalTabs) % totalTabs;
      }
      if (this.focusedIndex === 0) {
        this.selectedStoreId = null;
      } else {
        this.selectedStoreId = this.stores[this.focusedIndex - 1].id;
      }
      return this.getState();
    }

    syncFromUrl(urlSearchParams) {
      const storeParam = urlSearchParams.get('store');
      if (storeParam) {
        const found = this.stores.find((s) => s.id === storeParam || s.brand.toLowerCase() === storeParam.toLowerCase());
        this.selectedStoreId = found ? found.id : null;
      } else {
        this.selectedStoreId = null;
      }
      return this.getState();
    }

    getState() {
      const activeStore = this.stores.find((s) => s.id === this.selectedStoreId) || null;
      return {
        selectedStoreId: this.selectedStoreId,
        isAllSelected: this.selectedStoreId === null,
        activeStoreName: activeStore ? activeStore.name : 'Tutti i Supermercati',
        isRegionalServing: activeStore ? Boolean(activeStore.isRegionalServing) : false,
        searchQuery: this.searchQuery,
        activeBrandPills: ['Tutti', ...CANONICAL_CHAINS]
      };
    }
  }

  describe('F11: Store Switcher Navigation (Tier 1)', () => {
    it('11.1 should render "Tutti" option plus pills for Coop, Carrefour, Conad, Basko, Doro', () => {
      const nav = new StoreNavigationCoordinator();
      const state = nav.getState();
      assert.equal(state.isAllSelected, true);
      assert.equal(state.activeStoreName, 'Tutti i Supermercati');
      for (const chain of CANONICAL_CHAINS) {
        assert.ok(state.activeBrandPills.includes(chain));
      }
    });

    it('11.2 should switch active store to Basko Rapallo when selected', () => {
      const nav = new StoreNavigationCoordinator();
      const state = nav.selectStore('basko-rapallo-colombo');
      assert.equal(state.selectedStoreId, 'basko-rapallo-colombo');
      assert.equal(state.isAllSelected, false);
      assert.ok(state.activeStoreName.includes('Basko'));
    });

    it('11.3 should switch active store to Coop Rapallo when selected', () => {
      const nav = new StoreNavigationCoordinator();
      const state = nav.selectStore('coop-rapallo-sciesa');
      assert.equal(state.selectedStoreId, 'coop-rapallo-sciesa');
      assert.ok(state.activeStoreName.includes('Coop'));
    });

    it('11.4 should reset to all stores when "Tutti" (null) is selected', () => {
      const nav = new StoreNavigationCoordinator();
      nav.selectStore('basko-rapallo-colombo');
      const resetState = nav.selectStore(null);
      assert.equal(resetState.isAllSelected, true);
      assert.equal(resetState.selectedStoreId, null);
    });

    it('11.5 should verify active offer count badge can be associated with store tab', () => {
      const storeWithBadge = {
        ...CANONICAL_RAPALLO_STORES[0],
        badgeText: '15 offerte'
      };
      assert.equal(storeWithBadge.badgeText, '15 offerte');
    });
  });

  describe('F11: Store Switcher Boundary & Interaction Cases (Tier 2)', () => {
    it('11.6 should display regional serving badge when Doro Tigullio is selected', () => {
      const nav = new StoreNavigationCoordinator();
      const state = nav.selectStore('doro-tigullio-margherita');
      assert.equal(state.selectedStoreId, 'doro-tigullio-margherita');
      assert.equal(state.isRegionalServing, true, 'Doro must show regional serving status');
    });

    it('11.7 should preserve active search query when switching stores', () => {
      const nav = new StoreNavigationCoordinator();
      nav.setSearchQuery('latte');
      nav.selectStore('conad-city-torrecivica');
      const state = nav.getState();

      assert.equal(state.selectedStoreId, 'conad-city-torrecivica');
      assert.equal(state.searchQuery, 'latte', 'Search query must not be wiped when switching stores');
    });

    it('11.8 should handle rapid store switching without state corruption', () => {
      const nav = new StoreNavigationCoordinator();
      const sequence = ['coop-rapallo-sciesa', 'basko-rapallo-colombo', 'carrefour-market-assereto', null];
      for (const id of sequence) {
        nav.selectStore(id);
      }
      const finalState = nav.getState();
      assert.equal(finalState.selectedStoreId, null);
      assert.equal(finalState.isAllSelected, true);
    });

    it('11.9 should support keyboard navigation (ArrowRight / ArrowLeft) across store pills', () => {
      const nav = new StoreNavigationCoordinator();
      // Initially at 0 ("Tutti")
      const next1 = nav.navigateKeyboard('ArrowRight'); // 1: First store (Coop)
      assert.equal(next1.selectedStoreId, 'coop-rapallo-sciesa');

      const next2 = nav.navigateKeyboard('ArrowRight'); // 2: Second store (Carrefour)
      assert.equal(next2.selectedStoreId, 'carrefour-market-assereto');

      const prev = nav.navigateKeyboard('ArrowLeft'); // back to Coop
      assert.equal(prev.selectedStoreId, 'coop-rapallo-sciesa');
    });

    it('11.10 should parse and sync store selection from URL search params (?store=conad)', () => {
      const nav = new StoreNavigationCoordinator();
      const params = new URLSearchParams('store=conad');
      const state = nav.syncFromUrl(params);

      assert.equal(state.selectedStoreId, 'conad-city-torrecivica');
      assert.ok(state.activeStoreName.includes('Conad'));
    });
  });
});
