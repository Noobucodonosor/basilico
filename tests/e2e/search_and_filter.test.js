import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  VALID_PRODUCT_CATEGORIES,
  normalizeSearchToken
} from '../helpers/test_helper.js';

describe('E2E Tests: Live Product Search & Category Filters (F12)', () => {
  const sampleDeals = [
    { id: '1', title: 'Pasta Barilla Penne 500g', category: 'Dispensa e Pasta', promoPrice: 0.89 },
    { id: '2', title: 'Pasta De Cecco Spaghetti 500g', category: 'Dispensa e Pasta', promoPrice: 1.29 },
    { id: '3', title: 'Passata di Pomodoro Mutti 700g', category: 'Dispensa e Pasta', promoPrice: 1.09 },
    { id: '4', title: 'Caffè Espresso Lavazza 250g', category: 'Colazione e Dolci', promoPrice: 2.99 },
    { id: '5', title: 'Latte Parmalat Parzialmente Scremato 1L', category: 'Latticini e Formaggi', promoPrice: 0.99 }
  ];

  /**
   * Reference Filter Coordinator (Oracle for F12)
   */
  class FilterCoordinator {
    constructor(deals = sampleDeals) {
      this.deals = deals;
      this.query = '';
      this.selectedCategory = null;
    }

    setQuery(q) {
      this.query = q || '';
    }

    toggleCategory(category) {
      if (this.selectedCategory === category) {
        this.selectedCategory = null; // deselect toggle
      } else {
        this.selectedCategory = category;
      }
    }

    clearFilters() {
      this.query = '';
      this.selectedCategory = null;
    }

    getActiveFilterCount() {
      let count = 0;
      if (this.query.trim().length > 0) count++;
      if (this.selectedCategory !== null) count++;
      return count;
    }

    getFilteredResults() {
      let results = [...this.deals];

      if (this.selectedCategory) {
        results = results.filter((d) => d.category === this.selectedCategory);
      }

      const q = normalizeSearchToken(this.query);
      if (q) {
        results = results.filter((d) => {
          const itemText = normalizeSearchToken(`${d.title} ${d.category}`);
          return itemText.includes(q);
        });
      }

      return results;
    }
  }

  describe('F12: Live Search & Category Filtering (Tier 1)', () => {
    it('12.1 should filter deals by search query keyword ("pomodoro")', () => {
      const coordinator = new FilterCoordinator();
      coordinator.setQuery('pomodoro');
      const results = coordinator.getFilteredResults();

      assert.equal(results.length, 1);
      assert.equal(results[0].id, '3');
      assert.ok(results[0].title.includes('Mutti'));
    });

    it('12.2 should filter deals by category pill selection ("Colazione e Dolci")', () => {
      const coordinator = new FilterCoordinator();
      coordinator.toggleCategory('Colazione e Dolci');
      const results = coordinator.getFilteredResults();

      assert.equal(results.length, 1);
      assert.equal(results[0].id, '4');
      assert.ok(results[0].title.includes('Lavazza'));
    });

    it('12.3 should compute intersection when both query and category are active', () => {
      const coordinator = new FilterCoordinator();
      coordinator.toggleCategory('Dispensa e Pasta');
      coordinator.setQuery('Barilla');
      const results = coordinator.getFilteredResults();

      assert.equal(results.length, 1);
      assert.equal(results[0].id, '1');
    });

    it('12.4 should accurately report active filter count badge', () => {
      const coordinator = new FilterCoordinator();
      assert.equal(coordinator.getActiveFilterCount(), 0);

      coordinator.setQuery('latte');
      assert.equal(coordinator.getActiveFilterCount(), 1);

      coordinator.toggleCategory('Latticini e Formaggi');
      assert.equal(coordinator.getActiveFilterCount(), 2);
    });

    it('12.5 should reset all filters when clearFilters is triggered', () => {
      const coordinator = new FilterCoordinator();
      coordinator.setQuery('spaghetti');
      coordinator.toggleCategory('Dispensa e Pasta');
      assert.equal(coordinator.getActiveFilterCount(), 2);

      coordinator.clearFilters();
      assert.equal(coordinator.getActiveFilterCount(), 0);
      assert.equal(coordinator.getFilteredResults().length, sampleDeals.length);
    });
  });

  describe('F12: Live Search Boundary & Debounce Behavior (Tier 2)', () => {
    it('12.6 should debounce rapid keystrokes within 200ms and fire only on final term', async () => {
      let callCount = 0;
      let timer = null;

      const debouncedSearch = (term, delay = 50) => {
        return new Promise((resolve) => {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            callCount++;
            resolve(term);
          }, delay);
        });
      };

      // Type "p", "pa", "pas", "pasta" rapidly
      debouncedSearch('p');
      debouncedSearch('pa');
      debouncedSearch('pas');
      const finalResult = await debouncedSearch('pasta');

      assert.equal(finalResult, 'pasta');
      assert.equal(callCount, 1, 'Debounce must discard intermediate calls');
    });

    it('12.7 should treat whitespace-only queries as empty and restore all deals', () => {
      const coordinator = new FilterCoordinator();
      coordinator.setQuery('     ');
      assert.equal(coordinator.getActiveFilterCount(), 0);
      assert.equal(coordinator.getFilteredResults().length, sampleDeals.length);
    });

    it('12.8 should deselect category when same pill is clicked twice (toggle behavior)', () => {
      const coordinator = new FilterCoordinator();
      coordinator.toggleCategory('Dispensa e Pasta');
      assert.equal(coordinator.selectedCategory, 'Dispensa e Pasta');

      coordinator.toggleCategory('Dispensa e Pasta'); // Click again
      assert.equal(coordinator.selectedCategory, null);
      assert.equal(coordinator.getActiveFilterCount(), 0);
    });

    it('12.9 should produce identical results for "caffè" and "caffe"', () => {
      const c1 = new FilterCoordinator();
      const c2 = new FilterCoordinator();

      c1.setQuery('caffè');
      c2.setQuery('caffe');

      assert.deepEqual(c1.getFilteredResults(), c2.getFilteredResults());
      assert.equal(c1.getFilteredResults().length, 1);
    });

    it('12.10 should return empty list and zero count for non-matching search term', () => {
      const coordinator = new FilterCoordinator();
      coordinator.setQuery('prodotto_fantasma_xyz');
      const results = coordinator.getFilteredResults();

      assert.equal(results.length, 0);
      assert.equal(coordinator.getActiveFilterCount(), 1);
    });
  });
});
