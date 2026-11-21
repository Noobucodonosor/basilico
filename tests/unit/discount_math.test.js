import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { calculateDiscountPercentage, formatUnitPrice } from '../helpers/test_helper.js';

describe('Unit Tests: Discount Math & Pricing (F13)', () => {
  describe('F13: Discount Calculation Math (Tier 1)', () => {
    it('13.1 should calculate exact 50% discount when promo price is half of original', () => {
      const discount = calculateDiscountPercentage(2.00, 1.00);
      assert.equal(discount, 50);
    });

    it('13.2 should round fractional percentage to nearest integer (35.97% -> 36%)', () => {
      // Barilla pasta: 1.39 original -> 0.89 promo = 35.9712% -> 36%
      const discount = calculateDiscountPercentage(1.39, 0.89);
      assert.equal(discount, 36);
    });

    it('13.3 should calculate steep discounts correctly (75% off)', () => {
      const discount = calculateDiscountPercentage(10.00, 2.50);
      assert.equal(discount, 75);
    });

    it('13.4 should calculate minor discounts correctly (5% off)', () => {
      const discount = calculateDiscountPercentage(5.00, 4.75);
      assert.equal(discount, 5);
    });

    it('13.5 should format standard unit price in Italian EUR convention (€ 1,78 / kg)', () => {
      const unitPrice = formatUnitPrice(1.78, 1, 'kg');
      assert.equal(unitPrice, '€ 1,78 / kg');
    });
  });

  describe('F13: Discount Math Boundary & Corner Cases (Tier 2)', () => {
    it('13.6 should return 0 when promoPrice equals originalPrice', () => {
      assert.equal(calculateDiscountPercentage(4.50, 4.50), 0);
    });

    it('13.7 should return 0 when promoPrice exceeds originalPrice', () => {
      assert.equal(calculateDiscountPercentage(3.00, 3.50), 0);
    });

    it('13.8 should return 0 when originalPrice is zero (division by zero guard)', () => {
      assert.equal(calculateDiscountPercentage(0, 1.50), 0);
    });

    it('13.9 should return 0 when originalPrice or promoPrice is negative', () => {
      assert.equal(calculateDiscountPercentage(-10.00, 5.00), 0);
      assert.equal(calculateDiscountPercentage(10.00, -5.00), 0);
    });

    it('13.10 should return 0 when inputs are undefined, null, or NaN', () => {
      assert.equal(calculateDiscountPercentage(undefined, 2.00), 0);
      assert.equal(calculateDiscountPercentage(5.00, null), 0);
      assert.equal(calculateDiscountPercentage(NaN, 2.00), 0);
      assert.equal(calculateDiscountPercentage(5.00, NaN), 0);
    });

    it('13.11 should handle IEEE-754 precision boundary without NaN or drift (0.30 to 0.10 -> 67%)', () => {
      const discount = calculateDiscountPercentage(0.30, 0.10);
      assert.equal(discount, 67);
    });

    it('13.12 should handle large price numbers without overflow (999.99 to 499.99 -> 50%)', () => {
      const discount = calculateDiscountPercentage(999.99, 499.99);
      assert.equal(discount, 50);
    });

    it('13.13 should format unit price with different units (liters, pieces, wash cycles)', () => {
      assert.equal(formatUnitPrice(1.20, 1.5, 'l'), '€ 0,80 / l');
      assert.equal(formatUnitPrice(4.99, 20, 'lavaggi'), '€ 0,25 / lavaggi');
      assert.equal(formatUnitPrice(3.00, 6, 'pz'), '€ 0,50 / pz');
    });

    it('13.14 should return empty string for unit price when quantity is 0 or negative', () => {
      assert.equal(formatUnitPrice(5.00, 0, 'kg'), '');
      assert.equal(formatUnitPrice(5.00, -1, 'kg'), '');
    });

    it('13.15 should return empty string for unit price when price or quantity is non-numeric', () => {
      assert.equal(formatUnitPrice('five', 1, 'kg'), '');
      assert.equal(formatUnitPrice(5.00, 'one', 'kg'), '');
      assert.equal(formatUnitPrice(null, 1, 'kg'), '');
    });
  });
});
