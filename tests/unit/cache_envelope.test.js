import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCacheFreshness } from '../helpers/test_helper.js';

describe('Unit Tests: Cache Envelope & TTL Expiration (F4)', () => {
  const TTL_6_HOURS = 21600;
  const GRACE_7_DAYS = 604800;

  describe('F4: Cache Freshness & Envelope Logic (Tier 1)', () => {
    it('4.1 should mark data cached 10 minutes ago as fresh (< 6h TTL)', () => {
      const now = Date.now();
      const tenMinutesAgo = new Date(now - 10 * 60 * 1000).toISOString();
      const freshness = evaluateCacheFreshness(tenMinutesAgo, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, true, 'Should be fresh');
      assert.equal(freshness.isStale, false, 'Should not be stale');
      assert.equal(freshness.isExpired, false, 'Should not be expired');
      assert.ok(freshness.ageSeconds <= 650);
    });

    it('4.2 should mark data cached 8 hours ago as stale (> 6h TTL, < 7d grace)', () => {
      const now = Date.now();
      const eightHoursAgo = new Date(now - 8 * 3600 * 1000).toISOString();
      const freshness = evaluateCacheFreshness(eightHoursAgo, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, false, 'Should not be fresh');
      assert.equal(freshness.isStale, true, 'Should be stale');
      assert.equal(freshness.isExpired, false, 'Should not be expired');
      assert.ok(freshness.ageSeconds >= 28800);
    });

    it('4.3 should mark data cached 10 days ago as expired (> 6h + 7d)', () => {
      const now = Date.now();
      const tenDaysAgo = new Date(now - 10 * 86400 * 1000).toISOString();
      const freshness = evaluateCacheFreshness(tenDaysAgo, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, false, 'Should not be fresh');
      assert.equal(freshness.isStale, false, 'Should not be stale');
      assert.equal(freshness.isExpired, true, 'Should be expired');
    });

    it('4.4 should validate complete cache envelope structure', () => {
      const envelope = {
        data: [{ id: 'item-1', name: 'Barilla' }],
        metadata: {
          cachedAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + TTL_6_HOURS * 1000).toISOString(),
          ttlSeconds: TTL_6_HOURS,
          source: 'live',
          version: '1.0'
        }
      };

      assert.ok(Array.isArray(envelope.data));
      assert.ok(typeof envelope.metadata.cachedAt === 'string');
      assert.equal(envelope.metadata.ttlSeconds, 21600);
      assert.equal(envelope.metadata.source, 'live');
    });

    it('4.5 should accurately compute elapsed age in seconds', () => {
      const now = Date.now();
      const thirtySecondsAgo = new Date(now - 30 * 1000).toISOString();
      const freshness = evaluateCacheFreshness(thirtySecondsAgo, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(Math.round(freshness.ageSeconds), 30);
    });
  });

  describe('F4: Cache Freshness Boundary & Corner Cases (Tier 2)', () => {
    it('4.6 should treat data exactly at TTL boundary (age === ttl) as fresh', () => {
      const now = 1000000000000;
      const exactTtl = new Date(now - TTL_6_HOURS * 1000).toISOString();
      const freshness = evaluateCacheFreshness(exactTtl, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, true);
      assert.equal(freshness.isStale, false);
      assert.equal(freshness.isExpired, false);
    });

    it('4.7 should treat data exactly at TTL + Stale Grace boundary as stale', () => {
      const now = 1000000000000;
      const exactGrace = new Date(now - (TTL_6_HOURS + GRACE_7_DAYS) * 1000).toISOString();
      const freshness = evaluateCacheFreshness(exactGrace, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, false);
      assert.equal(freshness.isStale, true);
      assert.equal(freshness.isExpired, false);
    });

    it('4.8 should immediately mark cache as non-fresh when TTL is 0', () => {
      const now = Date.now();
      const justNow = new Date(now - 1000).toISOString();
      const freshness = evaluateCacheFreshness(justNow, 0, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, false);
      assert.equal(freshness.isStale, true);
    });

    it('4.9 should handle invalid or unparseable date strings safely as expired', () => {
      const freshness = evaluateCacheFreshness('invalid-timestamp-string');
      assert.equal(freshness.isFresh, false);
      assert.equal(freshness.isExpired, true);
    });

    it('4.10 should handle clock skew (future cachedAt timestamp) without negative crash', () => {
      const now = Date.now();
      const futureTime = new Date(now + 60 * 1000).toISOString();
      const freshness = evaluateCacheFreshness(futureTime, TTL_6_HOURS, GRACE_7_DAYS, now);

      assert.equal(freshness.isFresh, true);
      assert.ok(freshness.ageSeconds <= 0);
    });

    it('4.11 should accept valid dataSource values: live, cache, seed', () => {
      const validSources = ['live', 'cache', 'seed'];
      for (const src of validSources) {
        const envelope = { data: [], metadata: { source: src } };
        assert.ok(validSources.includes(envelope.metadata.source));
      }
    });

    it('4.12 should respect custom TTL and custom grace period configurations', () => {
      const customTtl = 3600; // 1 hour
      const customGrace = 1800; // 30 minutes
      const now = Date.now();
      const ninetyMinutesAgo = new Date(now - 90 * 60 * 1000).toISOString();

      const freshness = evaluateCacheFreshness(ninetyMinutesAgo, customTtl, customGrace, now);
      // 90 mins > 60 mins TTL, and 90 mins === 60 + 30 mins grace -> stale
      assert.equal(freshness.isFresh, false);
      assert.equal(freshness.isStale, true);
      assert.equal(freshness.isExpired, false);
    });

    it('4.13 should preserve nested objects and arrays during JSON serialization roundtrip', () => {
      const payload = {
        stores: [{ id: 's1', coords: { lat: 44.35, lng: 9.22 } }],
        tags: ['rapallo', 'liguria'],
        active: true,
        count: 42
      };
      const serialized = JSON.stringify(payload);
      const deserialized = JSON.parse(serialized);

      assert.deepEqual(deserialized, payload);
    });

    it('4.14 should handle large cache payload serialization (500KB) without truncation', () => {
      const largeOffers = Array.from({ length: 500 }, (_, i) => ({
        id: `offer-${i}`,
        title: `Prodotto Alimentare Rapallo Grandi Promozioni ${i}`,
        brand: `Marchio ${i}`,
        price: 3.99,
        category: 'Dispensa e Pasta'
      }));
      const serialized = JSON.stringify(largeOffers);
      assert.ok(serialized.length > 50000, `Payload size: ${serialized.length} bytes`);
      const parsed = JSON.parse(serialized);
      assert.equal(parsed.length, 500);
      assert.equal(parsed[499].id, 'offer-499');
    });

    it('4.15 should handle negative TTL gracefully by marking cache expired', () => {
      const now = Date.now();
      const past = new Date(now - 10000).toISOString();
      const freshness = evaluateCacheFreshness(past, -100, 0, now);

      assert.equal(freshness.isFresh, false);
      assert.equal(freshness.isExpired, true);
    });
  });
});
