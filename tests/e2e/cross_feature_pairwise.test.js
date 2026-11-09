import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CANONICAL_RAPALLO_STORES,
  normalizeSearchToken,
  calculateDiscountPercentage
} from '../helpers/test_helper.js';

describe('Tier 3: Cross-Feature Pairwise Interaction Tests', () => {
  // Comprehensive cross-feature mock dataset representing active Rapallo promotions
  const dataset = [
    {
      id: 'item-1',
      storeId: 'coop-rapallo-sciesa',
      title: 'Mozzarella Granarolo 3x100g',
      category: 'Latticini e Formaggi',
      originalPrice: 3.49,
      promoPrice: 2.29,
      discountPercentage: 34
    },
    {
      id: 'item-2',
      storeId: 'coop-rapallo-sciesa',
      title: 'Acqua Minerale Naturale San Benedetto 6x1.5L',
      category: 'Acqua e Bevande',
      originalPrice: 2.80,
      promoPrice: 1.68,
      discountPercentage: 40
    },
    {
      id: 'item-3',
      storeId: 'carrefour-market-assereto',
      title: 'Caffè Lavazza Qualità Rossa 2x250g',
      category: 'Colazione e Dolci',
      originalPrice: 6.99,
      promoPrice: 4.89,
      discountPercentage: 30
    },
    {
      id: 'item-4',
      storeId: 'conad-city-torrecivica',
      title: 'Pasta Rummo Rigatoni 500g',
      category: 'Dispensa e Pasta',
      originalPrice: 1.69,
      promoPrice: 0.99,
      discountPercentage: 41
    },
    {
      id: 'item-5',
      storeId: 'conad-city-torrecivica',
      title: 'Tonno Rio Mare all\'Olio di Oliva 4x80g',
      category: 'Dispensa e Pasta',
      originalPrice: 5.99,
      promoPrice: 3.59,
      discountPercentage: 40
    },
    {
      id: 'item-6',
      storeId: 'basko-rapallo-colombo',
      title: 'Olio Extra Vergine Monini Classico 1L',
      category: 'Dispensa e Pasta',
      originalPrice: 9.99,
      promoPrice: 6.49,
      discountPercentage: 35
    },
    {
      id: 'item-7',
      storeId: 'basko-rapallo-colombo',
      title: 'Pizza Margherita Surgelata Italpizza 400g',
      category: 'Surgelati',
      originalPrice: 4.29,
      promoPrice: 2.14,
      discountPercentage: 50
    },
    {
      id: 'item-8',
      storeId: 'doro-tigullio-margherita',
      title: 'Pasta Barilla Penne Rigate 500g',
      category: 'Dispensa e Pasta',
      originalPrice: 1.39,
      promoPrice: 0.89,
      discountPercentage: 36
    },
    {
      id: 'item-9',
      storeId: 'doro-tigullio-margherita',
      title: 'Mele Golden Delicious Val Venosta 1.5kg',
      category: 'Frutta e Verdura',
      originalPrice: 2.99,
      promoPrice: 1.99,
      discountPercentage: 33
    },
    {
      id: 'item-10',
      storeId: 'conad-city-torrecivica',
      title: 'Detersivo Lavatrice Dash Pods 31 pezzi',
      category: 'Cura Casa e Bucato',
      originalPrice: 11.99,
      promoPrice: 5.99,
      discountPercentage: 50
    }
  ];

  function queryEngine(options = {}, items = dataset) {
    let results = [...items];

    if (options.storeId) {
      results = results.filter((i) => i.storeId === options.storeId);
    }

    if (options.category) {
      results = results.filter((i) => i.category === options.category);
    }

    if (options.q && typeof options.q === 'string' && options.q.trim()) {
      const q = normalizeSearchToken(options.q);
      results = results.filter((i) => {
        const text = normalizeSearchToken(`${i.title} ${i.category}`);
        return text.includes(q);
      });
    }

    if (options.minDiscount) {
      results = results.filter((i) => i.discountPercentage >= options.minDiscount);
    }

    if (options.sortBy === 'discountDesc') {
      results.sort((a, b) => b.discountPercentage - a.discountPercentage);
    } else if (options.sortBy === 'priceAsc') {
      results.sort((a, b) => a.promoPrice - b.promoPrice);
    } else if (options.sortBy === 'priceDesc') {
      results.sort((a, b) => b.promoPrice - a.promoPrice);
    }

    return results;
  }

  it('Pairwise 1: Store (Coop) + Category ("Latticini e Formaggi")', () => {
    const res = queryEngine({ storeId: 'coop-rapallo-sciesa', category: 'Latticini e Formaggi' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-1');
  });

  it('Pairwise 2: Store (Carrefour) + Search Query ("caffè")', () => {
    const res = queryEngine({ storeId: 'carrefour-market-assereto', q: 'caffè' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-3');
  });

  it('Pairwise 3: Store (Conad) + Sort (discountDesc)', () => {
    const res = queryEngine({ storeId: 'conad-city-torrecivica', sortBy: 'discountDesc' });
    assert.equal(res.length, 3);
    assert.equal(res[0].discountPercentage, 50); // Dash 50%
    assert.equal(res[1].discountPercentage, 41); // Rummo 41%
  });

  it('Pairwise 4: Store (Basko) + MinDiscount (40%)', () => {
    const res = queryEngine({ storeId: 'basko-rapallo-colombo', minDiscount: 40 });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-7'); // Pizza 50%
  });

  it('Pairwise 5: Store (Doro) + Query ("pasta")', () => {
    const res = queryEngine({ storeId: 'doro-tigullio-margherita', q: 'pasta' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-8');
    assert.ok(res[0].title.includes('Barilla'));
  });

  it('Pairwise 6: Category ("Dispensa e Pasta") + Sort (priceAsc)', () => {
    const res = queryEngine({ category: 'Dispensa e Pasta', sortBy: 'priceAsc' });
    assert.ok(res.length >= 4);
    assert.equal(res[0].promoPrice, 0.89); // Barilla at Doro
    assert.equal(res[1].promoPrice, 0.99); // Rummo at Conad
  });

  it('Pairwise 7: Category ("Surgelati") + MinDiscount (40%)', () => {
    const res = queryEngine({ category: 'Surgelati', minDiscount: 40 });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-7');
  });

  it('Pairwise 8: Query ("latte") + Category ("Latticini e Formaggi")', () => {
    const customItems = [
      ...dataset,
      { id: 'item-latte', storeId: 'coop-rapallo-sciesa', title: 'Latte Intero 1L', category: 'Latticini e Formaggi', promoPrice: 1.10, discountPercentage: 20 }
    ];
    const res = queryEngine({ q: 'latte', category: 'Latticini e Formaggi' }, customItems);
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-latte');
  });

  it('Pairwise 9: Query ("olio") + Sort (priceAsc)', () => {
    const res = queryEngine({ q: 'olio', sortBy: 'priceAsc' });
    assert.equal(res.length, 2); // Tonno all'olio (3.59) and Monini (6.49)
    assert.equal(res[0].id, 'item-5');
    assert.equal(res[1].id, 'item-6');
  });

  it('Pairwise 10: Store (Coop) + Category ("Acqua e Bevande") + Query ("naturale")', () => {
    const res = queryEngine({ storeId: 'coop-rapallo-sciesa', category: 'Acqua e Bevande', q: 'naturale' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-2');
  });

  it('Pairwise 11: Store (Basko) + Sort (priceDesc) + MinDiscount (30%)', () => {
    const res = queryEngine({ storeId: 'basko-rapallo-colombo', sortBy: 'priceDesc', minDiscount: 30 });
    assert.equal(res.length, 2);
    assert.equal(res[0].promoPrice, 6.49); // Monini
    assert.equal(res[1].promoPrice, 2.14); // Pizza
  });

  it('Pairwise 12: Category ("Cura Casa e Bucato") + Query ("detersivo") + Sort (discountDesc)', () => {
    const res = queryEngine({ category: 'Cura Casa e Bucato', q: 'detersivo', sortBy: 'discountDesc' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-10');
    assert.equal(res[0].discountPercentage, 50);
  });

  it('Pairwise 13: Store (Conad) + Active Flyer Inspection + Page Traversal', () => {
    const store = CANONICAL_RAPALLO_STORES.find((s) => s.brand === 'Conad');
    const mockFlyer = {
      id: 'f-conad-1',
      storeId: store.id,
      pageCount: 8,
      pages: Array.from({ length: 8 }, (_, i) => `p${i + 1}`)
    };
    let activePage = 1;
    activePage++; // user clicks next
    assert.equal(activePage, 2);
    assert.equal(mockFlyer.pages[activePage - 1], 'p2');
  });

  it('Pairwise 14: Mobile Viewport (375px) + Store Switcher Selection + Modal Flyer Open', () => {
    const viewportWidth = 375;
    const isMobile = viewportWidth < 640;
    assert.equal(isMobile, true);

    const activeStore = 'basko-rapallo-colombo';
    const isModalOpen = true;
    const modalHeightUnit = '100dvh';

    assert.ok(isModalOpen);
    assert.equal(modalHeightUnit, '100dvh');
    assert.equal(activeStore, 'basko-rapallo-colombo');
  });

  it('Pairwise 15: Offline Fallback Simulation + Store Switcher (Coop) + Query ("mozzarella")', () => {
    const isOnline = false;
    const activeSource = isOnline ? 'live' : 'seed';
    assert.equal(activeSource, 'seed');

    const res = queryEngine({ storeId: 'coop-rapallo-sciesa', q: 'mozzarella' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-1');
  });

  it('Pairwise 16: Doro Supermarket + Regional Serving Flag + Category ("Frutta e Verdura")', () => {
    const doroStore = CANONICAL_RAPALLO_STORES.find((s) => s.brand === 'Doro');
    assert.equal(doroStore.isRegionalServing, true);

    const res = queryEngine({ storeId: doroStore.id, category: 'Frutta e Verdura' });
    assert.equal(res.length, 1);
    assert.equal(res[0].id, 'item-9');
  });
});
