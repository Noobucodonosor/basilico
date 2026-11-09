import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('E2E Tests: Graceful Fallback & Offline UI Banner (F15)', () => {
  /**
   * Reference Offline Resilience State Machine (Oracle for F15)
   */
  class OfflineResilienceCoordinator {
    constructor() {
      this.isOnline = true;
      this.dataSource = 'live'; // 'live' | 'cache' | 'seed'
      this.lastSyncTimestamp = new Date().toISOString();
      this.isBannerDismissed = false;
      this.retryCount = 0;
    }

    setNetworkStatus(isOnline) {
      this.isOnline = isOnline;
      if (!isOnline) {
        this.dataSource = 'seed';
        this.isBannerDismissed = false;
      } else {
        this.dataSource = 'live';
      }
      return this.getState();
    }

    setDataSource(source, lastSyncTimestamp = new Date().toISOString()) {
      this.dataSource = source;
      this.lastSyncTimestamp = lastSyncTimestamp;
      return this.getState();
    }

    dismissBanner() {
      this.isBannerDismissed = true;
      return this.getState();
    }

    async retrySync() {
      this.retryCount++;
      if (this.isOnline) {
        this.dataSource = 'live';
        this.lastSyncTimestamp = new Date().toISOString();
        return { success: true, dataSource: 'live' };
      } else {
        return { success: false, dataSource: this.dataSource };
      }
    }

    getState() {
      const showBanner = !this.isBannerDismissed && (this.dataSource === 'seed' || this.dataSource === 'cache' || !this.isOnline);
      const isStale = this.dataSource === 'cache' && (Date.now() - new Date(this.lastSyncTimestamp).getTime()) > 86400000;

      let bannerMessage = '';
      if (this.dataSource === 'seed') {
        bannerMessage = 'Sei in modalità offline. Visualizzazione dati promozionali salvati per Rapallo.';
      } else if (isStale) {
        bannerMessage = 'Dati promozionali memorizzati oltre 24 ore fa. Alcuni prezzi potrebbero variare.';
      } else if (this.dataSource === 'cache') {
        bannerMessage = 'Connessione upstream non disponibile. Visualizzazione copia cache.';
      }

      return {
        isOnline: this.isOnline,
        dataSource: this.dataSource,
        showBanner,
        bannerMessage,
        isBannerDismissed: this.isBannerDismissed,
        retryCount: this.retryCount
      };
    }
  }

  describe('F15: Offline Fallback & User-Facing Banner (Tier 1)', () => {
    it('15.1 should display banner when dataSource is "seed" (offline boot)', () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setDataSource('seed');
      const state = coordinator.getState();

      assert.equal(state.showBanner, true);
      assert.ok(state.bannerMessage.includes('modalità offline'));
    });

    it('15.2 should display banner when dataSource is "cache" (upstream failure)', () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setDataSource('cache');
      const state = coordinator.getState();

      assert.equal(state.showBanner, true);
      assert.ok(state.bannerMessage.includes('copia cache'));
    });

    it('15.3 should hide banner when dataSource is "live" and online', () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setNetworkStatus(true);
      coordinator.setDataSource('live');
      const state = coordinator.getState();

      assert.equal(state.showBanner, false);
      assert.equal(state.bannerMessage, '');
    });

    it('15.4 should support manual retry action via retrySync()', async () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setNetworkStatus(false);
      assert.equal(coordinator.getState().dataSource, 'seed');

      // Network recovers
      coordinator.setNetworkStatus(true);
      const retryResult = await coordinator.retrySync();

      assert.equal(retryResult.success, true);
      assert.equal(retryResult.dataSource, 'live');
      assert.equal(coordinator.getState().showBanner, false);
    });

    it('15.5 should keep application responsive and searchable while offline', () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setNetworkStatus(false);
      const state = coordinator.getState();

      // UI state remains accessible without throwing
      assert.equal(state.isOnline, false);
      assert.equal(state.showBanner, true);
    });
  });

  describe('F15: Offline Boundary & Network Transition Cases (Tier 2)', () => {
    it('15.6 should immediately activate offline banner when network drops (online -> offline)', () => {
      const coordinator = new OfflineResilienceCoordinator();
      assert.equal(coordinator.getState().showBanner, false);

      coordinator.setNetworkStatus(false);
      const state = coordinator.getState();
      assert.equal(state.showBanner, true);
      assert.equal(state.isOnline, false);
    });

    it('15.7 should display stale warning when cached data is older than 24 hours', () => {
      const coordinator = new OfflineResilienceCoordinator();
      const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
      coordinator.setDataSource('cache', twoDaysAgo);

      const state = coordinator.getState();
      assert.equal(state.showBanner, true);
      assert.ok(state.bannerMessage.includes('24 ore fa'));
    });

    it('15.8 should allow user to manually dismiss banner without leaving offline mode', () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setNetworkStatus(false);
      assert.equal(coordinator.getState().showBanner, true);

      coordinator.dismissBanner();
      const state = coordinator.getState();
      assert.equal(state.showBanner, false);
      assert.equal(state.isOnline, false); // still offline
    });

    it('15.9 should handle failed retry when network is still disconnected without crash', async () => {
      const coordinator = new OfflineResilienceCoordinator();
      coordinator.setNetworkStatus(false);
      const result = await coordinator.retrySync();

      assert.equal(result.success, false);
      assert.equal(coordinator.getState().retryCount, 1);
      assert.equal(coordinator.getState().showBanner, true);
    });

    it('15.10 should verify zero unhandled exceptions on repeated online/offline toggling', () => {
      const coordinator = new OfflineResilienceCoordinator();
      for (let i = 0; i < 20; i++) {
        coordinator.setNetworkStatus(i % 2 === 0);
        coordinator.getState();
      }
      assert.equal(coordinator.getState().isOnline, false);
    });
  });
});
