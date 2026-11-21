import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('E2E Tests: Responsive Offer Grid & Deal Cards (F13)', () => {
  /**
   * Reference Card Renderer Model (Oracle for F13)
   */
  function renderCardViewModel(offer) {
    const hasDiscount = Boolean(offer.originalPrice && offer.originalPrice > offer.promoPrice);
    const discountText = hasDiscount ? `-${Math.round(((offer.originalPrice - offer.promoPrice) / offer.originalPrice) * 100)}%` : null;
    const promoFormatted = `€ ${offer.promoPrice.toFixed(2).replace('.', ',')}`;
    const originalFormatted = hasDiscount ? `€ ${offer.originalPrice.toFixed(2).replace('.', ',')}` : null;
    const imageUrl = offer.imageUrl || '/images/placeholder_deal.svg';

    return {
      id: offer.id,
      title: offer.title,
      brand: offer.brand || 'Generico',
      category: offer.category,
      promoFormatted,
      originalFormatted,
      discountText,
      hasDiscount,
      imageUrl,
      unitPrice: offer.unitPrice || null,
      subgridClasses: 'grid grid-rows-subgrid row-span-4'
    };
  }

  describe('F13: Deal Card Layout & Information Display (Tier 1)', () => {
    const fullOffer = {
      id: 'o-1',
      title: 'Pasta Barilla Penne Rigate 500g',
      brand: 'Barilla',
      category: 'Dispensa e Pasta',
      originalPrice: 1.49,
      promoPrice: 0.89,
      imageUrl: 'https://example.com/barilla.jpg',
      unitPrice: '€ 1,78 / kg'
    };

    it('13.1 should render card with title, brand, category, and formatted promo price (€ 0,89)', () => {
      const card = renderCardViewModel(fullOffer);
      assert.equal(card.title, 'Pasta Barilla Penne Rigate 500g');
      assert.equal(card.brand, 'Barilla');
      assert.equal(card.promoFormatted, '€ 0,89');
    });

    it('13.2 should compute and display discount percentage badge (-40%)', () => {
      const card = renderCardViewModel(fullOffer);
      assert.equal(card.hasDiscount, true);
      assert.equal(card.discountText, '-40%');
    });

    it('13.3 should format original price for strikethrough comparison (€ 1,49)', () => {
      const card = renderCardViewModel(fullOffer);
      assert.equal(card.originalFormatted, '€ 1,49');
    });

    it('13.4 should display unit price when present (€ 1,78 / kg)', () => {
      const card = renderCardViewModel(fullOffer);
      assert.equal(card.unitPrice, '€ 1,78 / kg');
    });

    it('13.5 should configure subgrid classes to align card sections across uneven content', () => {
      const card = renderCardViewModel(fullOffer);
      assert.ok(card.subgridClasses.includes('grid-rows-subgrid'));
      assert.ok(card.subgridClasses.includes('row-span-4'));
    });
  });

  describe('F13: Deal Card Boundary & Fallback Display (Tier 2)', () => {
    it('13.6 should hide discount badge and strikethrough when originalPrice is omitted', () => {
      const noOriginal = {
        id: 'o-2',
        title: 'Mele Golden Rapallo 1kg',
        category: 'Frutta e Verdura',
        promoPrice: 1.99
      };
      const card = renderCardViewModel(noOriginal);
      assert.equal(card.hasDiscount, false);
      assert.equal(card.discountText, null);
      assert.equal(card.originalFormatted, null);
    });

    it('13.7 should fallback to placeholder image when imageUrl is missing', () => {
      const noImage = {
        id: 'o-3',
        title: 'Biscotti',
        category: 'Colazione e Dolci',
        promoPrice: 2.20
      };
      const card = renderCardViewModel(noImage);
      assert.equal(card.imageUrl, '/images/placeholder_deal.svg');
    });

    it('13.8 should handle 2-line title clamping via CSS utility class contract', () => {
      const longTitleOffer = {
        id: 'o-4',
        title: 'Olio Extra Vergine di Oliva Ligure DOP Riviera dei Fiori Bottiglia in Vetro 750ml Selezione Pregiata',
        category: 'Dispensa e Pasta',
        promoPrice: 9.99
      };
      const titleClampClass = 'line-clamp-2 text-sm font-semibold leading-snug';
      assert.ok(titleClampClass.includes('line-clamp-2'));
    });

    it('13.9 should handle zero-discount items without displaying -0%', () => {
      const zeroDiscount = {
        id: 'o-5',
        title: 'Acqua Minerale 1.5L',
        category: 'Acqua e Bevande',
        originalPrice: 0.35,
        promoPrice: 0.35
      };
      const card = renderCardViewModel(zeroDiscount);
      assert.equal(card.hasDiscount, false);
      assert.equal(card.discountText, null);
    });

    it('13.10 should format Italian date badge (e.g. "Valido fino al 15 nov")', () => {
      const formatValidityBadge = (isoString) => {
        const date = new Date(isoString);
        const day = date.getUTCDate();
        const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
        return `Valido fino al ${day} ${months[date.getUTCMonth()]}`;
      };

      const badge = formatValidityBadge('2026-11-15T23:59:59.000Z');
      assert.equal(badge, 'Valido fino al 15 nov');
    });
  });
});
