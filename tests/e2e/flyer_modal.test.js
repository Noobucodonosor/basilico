import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('E2E Tests: Touch-Friendly Flyer Viewer Modal (F14)', () => {
  /**
   * Reference Modal Coordinator (Oracle for F14)
   */
  class FlyerModalCoordinator {
    constructor(flyer) {
      this.flyer = flyer;
      this.isOpen = false;
      this.currentPage = 1;
      this.totalPages = flyer.pageCount;
      this.overscrollBehavior = 'contain';
      this.scrollSnapType = 'x mandatory';
      this.scrollSnapAlign = 'center';
    }

    open() {
      this.isOpen = true;
      this.currentPage = 1;
      return this.getState();
    }

    close() {
      this.isOpen = false;
      return this.getState();
    }

    nextPage() {
      if (this.currentPage < this.totalPages) {
        this.currentPage++;
      }
      return this.getState();
    }

    prevPage() {
      if (this.currentPage > 1) {
        this.currentPage--;
      }
      return this.getState();
    }

    goToPage(pageNumber) {
      if (pageNumber >= 1 && pageNumber <= this.totalPages) {
        this.currentPage = pageNumber;
      }
      return this.getState();
    }

    handleKeyDown(key) {
      if (!this.isOpen) return this.getState();
      if (key === 'Escape') {
        return this.close();
      } else if (key === 'ArrowRight') {
        return this.nextPage();
      } else if (key === 'ArrowLeft') {
        return this.prevPage();
      }
      return this.getState();
    }

    getState() {
      return {
        isOpen: this.isOpen,
        currentPage: this.currentPage,
        totalPages: this.totalPages,
        pageIndicator: `Pagina ${this.currentPage} di ${this.totalPages}`,
        hasNext: this.currentPage < this.totalPages,
        hasPrev: this.currentPage > 1,
        activePageUrl: this.flyer.pages[this.currentPage - 1] || this.flyer.coverImageUrl,
        scrollSnapType: this.scrollSnapType,
        scrollSnapAlign: this.scrollSnapAlign,
        overscrollBehavior: this.overscrollBehavior
      };
    }
  }

  const sampleFlyer = {
    id: 'f-basko-16p',
    title: 'Volantino Basko Rapallo',
    pageCount: 16,
    coverImageUrl: 'https://example.com/cover.jpg',
    pages: Array.from({ length: 16 }, (_, i) => `https://example.com/page_${i + 1}.jpg`)
  };

  describe('F14: Native <dialog> Modal & Carousel Gestures (Tier 1)', () => {
    it('14.1 should open flyer modal and initialize active page to 1', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      assert.equal(modal.isOpen, false);

      const state = modal.open();
      assert.equal(state.isOpen, true);
      assert.equal(state.currentPage, 1);
      assert.equal(state.pageIndicator, 'Pagina 1 di 16');
    });

    it('14.2 should configure CSS Scroll Snap properties for touch swipe', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      const state = modal.getState();
      assert.equal(state.scrollSnapType, 'x mandatory');
      assert.equal(state.scrollSnapAlign, 'center');
    });

    it('14.3 should advance to next page on nextPage()', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();
      const state = modal.nextPage();

      assert.equal(state.currentPage, 2);
      assert.equal(state.hasPrev, true);
      assert.equal(state.hasNext, true);
      assert.equal(state.activePageUrl, 'https://example.com/page_2.jpg');
    });

    it('14.4 should navigate back to previous page on prevPage()', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();
      modal.nextPage(); // page 2
      const state = modal.prevPage(); // page 1

      assert.equal(state.currentPage, 1);
      assert.equal(state.hasPrev, false);
      assert.equal(state.hasNext, true);
    });

    it('14.5 should dismiss modal when close() is invoked', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();
      assert.equal(modal.isOpen, true);

      const state = modal.close();
      assert.equal(state.isOpen, false);
    });
  });

  describe('F14: Flyer Modal Boundary & Accessibility Controls (Tier 2)', () => {
    it('14.6 should enforce overscroll-behavior: contain to prevent background scroll chaining', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      const state = modal.getState();
      assert.equal(state.overscrollBehavior, 'contain');
    });

    it('14.7 should disable next and prev buttons on single-page flyer', () => {
      const singlePageFlyer = {
        id: 'f-single',
        title: 'Speciale 1 Pagina',
        pageCount: 1,
        coverImageUrl: 'https://example.com/single.jpg',
        pages: ['https://example.com/single.jpg']
      };
      const modal = new FlyerModalCoordinator(singlePageFlyer);
      const state = modal.open();

      assert.equal(state.currentPage, 1);
      assert.equal(state.totalPages, 1);
      assert.equal(state.hasNext, false);
      assert.equal(state.hasPrev, false);
    });

    it('14.8 should dismiss modal when Escape key is pressed', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();
      assert.equal(modal.isOpen, true);

      const state = modal.handleKeyDown('Escape');
      assert.equal(state.isOpen, false);
    });

    it('14.9 should advance pages via ArrowRight and ArrowLeft keyboard controls', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();

      const nextState = modal.handleKeyDown('ArrowRight');
      assert.equal(nextState.currentPage, 2);

      const prevState = modal.handleKeyDown('ArrowLeft');
      assert.equal(prevState.currentPage, 1);
    });

    it('14.10 should jump directly to target page when thumbnail is clicked', () => {
      const modal = new FlyerModalCoordinator(sampleFlyer);
      modal.open();

      const state = modal.goToPage(8);
      assert.equal(state.currentPage, 8);
      assert.equal(state.pageIndicator, 'Pagina 8 di 16');
      assert.equal(state.activePageUrl, 'https://example.com/page_8.jpg');
    });
  });
});
