import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSearchToken } from '../helpers/test_helper.js';

describe('Unit Tests: Search Tokenization & Accent Normalization (F6, F12)', () => {
  describe('F6 & F12: Search Normalization & Tokenization (Tier 1)', () => {
    it('6.1 should normalize standard lowercase text ("pasta" -> "pasta")', () => {
      assert.equal(normalizeSearchToken('pasta'), 'pasta');
    });

    it('6.2 should case-fold uppercase search terms ("BARILLA" -> "barilla")', () => {
      assert.equal(normalizeSearchToken('BARILLA'), 'barilla');
    });

    it('6.3 should collapse multiple internal and surrounding whitespaces', () => {
      assert.equal(normalizeSearchToken('   pasta    penne   rigate  '), 'pasta penne rigate');
    });

    it('6.4 should strip grave and acute Italian accents ("caffè" -> "caffe", "perché" -> "perche")', () => {
      assert.equal(normalizeSearchToken('caffè'), 'caffe');
      assert.equal(normalizeSearchToken('perché'), 'perche');
    });

    it('6.5 should strip all Italian vowel accents (à, è, é, ì, ò, ù)', () => {
      const accented = 'città caffè poiché dì però più';
      const expected = 'citta caffe poiche di pero piu';
      assert.equal(normalizeSearchToken(accented), expected);
    });
  });

  describe('F6 & F12: Search Boundary & Corner Cases (Tier 2)', () => {
    it('6.6 should handle uppercase accented characters ("CAFFÈ" -> "caffe", "TÈ" -> "te")', () => {
      assert.equal(normalizeSearchToken('CAFFÈ'), 'caffe');
      assert.equal(normalizeSearchToken('TÈ VERDE'), 'te verde');
    });

    it('6.7 should return empty string for null, undefined, or empty query', () => {
      assert.equal(normalizeSearchToken(''), '');
      assert.equal(normalizeSearchToken(null), '');
      assert.equal(normalizeSearchToken(undefined), '');
      assert.equal(normalizeSearchToken(123), '');
    });

    it('6.8 should return empty string for whitespace-only query ("   ")', () => {
      assert.equal(normalizeSearchToken('     \t  \n  '), '');
    });

    it('6.9 should sanitize punctuation and special characters ("olio extra-vergine d\'oliva")', () => {
      const sanitized = normalizeSearchToken("olio extra-vergine d'oliva");
      assert.equal(sanitized, 'olio extra vergine d oliva');
    });

    it('6.10 should safely sanitize regex meta-characters without syntax crash', () => {
      const regexAttack = '.*+?^${}()|[]\\ pasta';
      const sanitized = normalizeSearchToken(regexAttack);
      assert.ok(!sanitized.includes('*'));
      assert.ok(!sanitized.includes('+'));
      assert.equal(sanitized, 'pasta');
    });

    it('6.11 should handle alphanumeric product measurements ("500g", "1.5l", "6x330ml")', () => {
      assert.equal(normalizeSearchToken('Pasta 500g'), 'pasta 500g');
      assert.equal(normalizeSearchToken('Latte 1.5l'), 'latte 1 5l');
    });

    it('6.12 should handle single character queries ("a", "x") safely', () => {
      assert.equal(normalizeSearchToken('a'), 'a');
      assert.equal(normalizeSearchToken(' x '), 'x');
    });

    it('6.13 should handle non-Latin or emoji characters gracefully without exception ("☕ Caffè")', () => {
      const output = normalizeSearchToken('☕ Caffè');
      assert.equal(output, 'caffe');
    });

    it('6.14 should handle extremely long input queries (1,000 characters) in < 5ms', () => {
      const longQuery = 'pasta '.repeat(200);
      const start = performance.now();
      const output = normalizeSearchToken(longQuery);
      const elapsed = performance.now() - start;
      assert.ok(elapsed < 10, `Processing long query took ${elapsed}ms`);
      assert.ok(output.startsWith('pasta'));
    });

    it('6.15 should verify symmetric bidirectional matching ("caffè" matches "caffe" and vice versa)', () => {
      const targetProduct = 'Caffè Lavazza Qualità Rossa 250g';
      const normalizedTarget = normalizeSearchToken(targetProduct);
      
      const queryWithAccent = normalizeSearchToken('caffè');
      const queryWithoutAccent = normalizeSearchToken('caffe');

      assert.ok(normalizedTarget.includes(queryWithAccent));
      assert.ok(normalizedTarget.includes(queryWithoutAccent));
    });
  });
});
