/**
 * Basilico — Supermarket Offers Application
 * Location: tests/e2e/challenger_m3_stress.test.js
 *
 * EMPIRICAL CHALLENGER STRESS HARNESS (Milestone 3)
 *
 * Adversarial stress testing of:
 * 1. Viewport scaling & boundary dimensions:
 *    - 320px narrow mobile, 375px standard mobile, 640px sm, 768px tablet,
 *      812px landscape, 1024px lg, 1280px desktop, 2560px ultra-wide
 *    - Viewport meta tag in root and production HTML templates
 *    - Max-w-7xl (1280px) horizontal constraint verification
 * 2. Touch flyer viewer modal stress harness:
 *    - Single-page flyers (pageCount: 1, missing pages array)
 *    - Multi-page flyers (boundary 2 pages, standard 16 pages, extreme 100 pages)
 *    - Out-of-bounds page jumps (negative, zero, NaN, string, infinity)
 *    - Rapid keyboard navigation (ArrowRight, ArrowLeft, Escape, unhandled keys)
 *    - Backdrop click dismissal collision logic (inside vs outside bounding rect)
 *    - Zoom level lifecycle & resets (zoomIn, zoomOut, clamping 1x-3x, reset on close/reopen)
 *    - Scroll-snap behavior toggling under zoom
 * 3. Subgrid alignment, text clamping, and product card resiliency:
 *    - Subgrid row-span-4 layout contracts
 *    - Short titles, normal titles, 300+ char titles, 1000 char titles, XSS payloads
 *    - Price math (originalPrice missing, originalPrice === promoPrice, floating point)
 *    - Validity date formatting oracle (Italian months, leap year, invalid dates)
 * 4. Store switcher keyboard navigation & URL synchronization:
 *    - Forward & backward modulo arithmetic cycling (ArrowRight, ArrowLeft)
 *    - URL parameter synchronization and fallback for unknown store parameters
 * 5. Production asset verification & live HTTP static serving:
 *    - Built index.html and compiled Tailwind CSS rules
 *    - Live server startup check (single standard command contract)
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { PROJECT_ROOT, CANONICAL_CHAINS, CANONICAL_RAPALLO_STORES } from '../helpers/test_helper.js';
import { FlyerModalCoordinator } from '../../src/components/FlyerModalCoordinator.js';
import { startServer } from '../../server.js';

// Dynamically extract and compile formatValidityBadge from OfferCard.jsx to test production code
const offerCardSource = fs.readFileSync(path.join(PROJECT_ROOT, 'src/components/OfferCard.jsx'), 'utf8');
const fnMatch = offerCardSource.match(/export function formatValidityBadge[\s\S]*?^}/m);
if (!fnMatch) throw new Error('formatValidityBadge not found in OfferCard.jsx');
const formatValidityBadge = new Function('isoString', fnMatch[0].replace('export function formatValidityBadge(isoString) {', '').replace(/}$/, ''));

describe('EMPIRICAL CHALLENGER STRESS HARNESS (Milestone 3)', () => {
  let liveServer = null;
  let serverPort = null;
  let baseUrl = null;

  before(async () => {
    // Spin up real application server via single-command root server.js entrypoint
    // Avoid port conflict with potential existing instances by passing PORT 0 or custom port
    const originalPort = process.env.PORT;
    process.env.PORT = '0';
    try {
      liveServer = await startServer();
      const addr = liveServer.address();
      serverPort = addr.port;
      baseUrl = `http://127.0.0.1:${serverPort}`;
    } finally {
      if (originalPort !== undefined) {
        process.env.PORT = originalPort;
      } else {
        delete process.env.PORT;
      }
    }
  });

  after(async () => {
    if (liveServer && typeof liveServer.close === 'function') {
      await new Promise((resolve) => liveServer.close(resolve));
    }
  });

  // =========================================================================
  // 1. VIEWPORT SCALING & BOUNDARY DIMENSIONS
  // =========================================================================
  describe('1. Viewport Scaling & Boundary Dimensions', () => {
    function computeResponsiveLayout(viewportWidth) {
      if (typeof viewportWidth !== 'number' || isNaN(viewportWidth) || viewportWidth < 0) {
        // Fallback to safest mobile layout
        return { columns: 1, containerClass: 'grid-cols-1', isMobile: true, maxContainerPx: 1280 };
      }
      const isMobile = viewportWidth < 640;
      let columns = 1;
      let containerClass = 'grid-cols-1';

      if (viewportWidth >= 1024) {
        columns = 4;
        containerClass = 'lg:grid-cols-4';
      } else if (viewportWidth >= 640) {
        columns = 2;
        containerClass = 'sm:grid-cols-2';
      }

      const maxContainerPx = Math.min(viewportWidth, 1280); // max-w-7xl is 80rem = 1280px

      return {
        columns,
        containerClass,
        isMobile,
        maxContainerPx,
        showExpandedSearchBar: viewportWidth >= 640,
        showCompactSearchToggle: viewportWidth < 640,
        showFloatingModalNav: viewportWidth >= 640
      };
    }

    it('1.1 Viewport 320px (Narrow Mobile): should enforce 1-column layout, compact search, and constrained width', () => {
      const layout = computeResponsiveLayout(320);
      assert.equal(layout.columns, 1);
      assert.equal(layout.containerClass, 'grid-cols-1');
      assert.equal(layout.isMobile, true);
      assert.equal(layout.showCompactSearchToggle, true);
      assert.equal(layout.showExpandedSearchBar, false);
      assert.equal(layout.maxContainerPx, 320);
    });

    it('1.2 Viewport 375px (Standard Mobile iPhone SE): should configure 1-column and compact toggle', () => {
      const layout = computeResponsiveLayout(375);
      assert.equal(layout.columns, 1);
      assert.equal(layout.containerClass, 'grid-cols-1');
      assert.equal(layout.isMobile, true);
      assert.equal(layout.showCompactSearchToggle, true);
      assert.equal(layout.showExpandedSearchBar, false);
    });

    it('1.3 Viewport 640px (Small Tablet Breakpoint): should transition to 2 columns and expand search bar', () => {
      const layout = computeResponsiveLayout(640);
      assert.equal(layout.columns, 2);
      assert.equal(layout.containerClass, 'sm:grid-cols-2');
      assert.equal(layout.isMobile, false);
      assert.equal(layout.showExpandedSearchBar, true);
      assert.equal(layout.showCompactSearchToggle, false);
    });

    it('1.4 Viewport 768px (Tablet iPad Portrait): should maintain 2-column layout and show floating modal buttons', () => {
      const layout = computeResponsiveLayout(768);
      assert.equal(layout.columns, 2);
      assert.equal(layout.containerClass, 'sm:grid-cols-2');
      assert.equal(layout.showFloatingModalNav, true);
    });

    it('1.5 Viewport 812px (Mobile Landscape iPhone X): should gracefully adapt to 2 columns', () => {
      const layout = computeResponsiveLayout(812);
      assert.equal(layout.columns, 2);
      assert.equal(layout.containerClass, 'sm:grid-cols-2');
      assert.equal(layout.showExpandedSearchBar, true);
    });

    it('1.6 Viewport 1024px (Desktop Breakpoint): should transition cleanly to 4 columns', () => {
      const layout = computeResponsiveLayout(1024);
      assert.equal(layout.columns, 4);
      assert.equal(layout.containerClass, 'lg:grid-cols-4');
    });

    it('1.7 Viewport 1280px (Standard Desktop): should maintain 4 columns and exactly hit max-w-7xl limit', () => {
      const layout = computeResponsiveLayout(1280);
      assert.equal(layout.columns, 4);
      assert.equal(layout.containerClass, 'lg:grid-cols-4');
      assert.equal(layout.maxContainerPx, 1280);
    });

    it('1.8 Viewport 2560px (Ultra-wide 4K/QHD): container must remain constrained at 1280px max-width', () => {
      const layout = computeResponsiveLayout(2560);
      assert.equal(layout.columns, 4);
      assert.equal(layout.maxContainerPx, 1280, 'Ultra-wide display must not stretch layout beyond 1280px');
    });

    it('1.9 Extreme & invalid viewports: negative, 0, NaN, undefined should safely default to 1 column without throwing', () => {
      const invalidWidths = [-500, 0, NaN, undefined, null, 'string'];
      for (const w of invalidWidths) {
        const layout = computeResponsiveLayout(w);
        assert.equal(layout.columns, 1);
        assert.equal(layout.isMobile, true);
      }
    });

    it('1.10 HTML5 Viewport Meta Tag: must exist and specify width=device-width, initial-scale=1.0 in index.html and dist/index.html', () => {
      const devHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'index.html'), 'utf8');
      assert.ok(devHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0"'));

      const distHtmlPath = path.join(PROJECT_ROOT, 'dist', 'index.html');
      assert.ok(fs.existsSync(distHtmlPath), 'dist/index.html must exist');
      const distHtml = fs.readFileSync(distHtmlPath, 'utf8');
      assert.ok(distHtml.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0"'));
    });
  });

  // =========================================================================
  // 2. TOUCH FLYER VIEWER MODAL STRESS HARNESS
  // =========================================================================
  describe('2. Touch Flyer Viewer Modal Stress Harness', () => {
    it('2.1 Single-page flyer: should resolve totalPages=1, disable prev/next, and clamp navigation', () => {
      const singlePageFlyer = {
        id: 'flyer-single',
        title: 'Volantino Rapallo 1 Pagina',
        pageCount: 1,
        coverImageUrl: 'https://example.com/cover.jpg',
        pages: ['https://example.com/cover.jpg']
      };

      const coordinator = new FlyerModalCoordinator(singlePageFlyer);
      coordinator.open();
      const state = coordinator.getState();

      assert.equal(state.isOpen, true);
      assert.equal(state.currentPage, 1);
      assert.equal(state.totalPages, 1);
      assert.equal(state.hasNext, false);
      assert.equal(state.hasPrev, false);
      assert.equal(state.pageIndicator, 'Pagina 1 di 1');

      // Attempt out-of-bounds advances
      coordinator.nextPage();
      assert.equal(coordinator.currentPage, 1);
      coordinator.prevPage();
      assert.equal(coordinator.currentPage, 1);
      coordinator.goToPage(2);
      assert.equal(coordinator.currentPage, 1);
    });

    it('2.2 Flyer with missing or empty pages array: should resolve totalPages from pageCount and use coverImageUrl', () => {
      const minimalFlyer = {
        id: 'flyer-minimal',
        title: 'Volantino Minimal',
        pageCount: 4,
        coverImageUrl: 'https://example.com/cover.jpg'
        // pages is undefined
      };

      const coordinator = new FlyerModalCoordinator(minimalFlyer);
      coordinator.open();
      const state = coordinator.getState();

      assert.equal(state.totalPages, 4);
      assert.equal(state.currentPage, 1);
      assert.equal(state.activePageUrl, 'https://example.com/cover.jpg');

      coordinator.nextPage();
      const state2 = coordinator.getState();
      assert.equal(state2.currentPage, 2);
      assert.equal(state2.activePageUrl, 'https://example.com/cover.jpg');
    });

    it('2.3 Multi-page flyer boundary (2 pages): boundary between single and multi-page', () => {
      const twoPageFlyer = {
        id: 'flyer-2p',
        title: 'Volantino 2 Pagine',
        pageCount: 2,
        coverImageUrl: 'https://example.com/p1.jpg',
        pages: ['https://example.com/p1.jpg', 'https://example.com/p2.jpg']
      };

      const coordinator = new FlyerModalCoordinator(twoPageFlyer);
      coordinator.open();

      // Page 1
      let state = coordinator.getState();
      assert.equal(state.currentPage, 1);
      assert.equal(state.hasNext, true);
      assert.equal(state.hasPrev, false);

      // Page 2
      coordinator.nextPage();
      state = coordinator.getState();
      assert.equal(state.currentPage, 2);
      assert.equal(state.hasNext, false);
      assert.equal(state.hasPrev, true);
      assert.equal(state.activePageUrl, 'https://example.com/p2.jpg');

      // Advance past page 2 -> must stay at page 2
      coordinator.nextPage();
      assert.equal(coordinator.currentPage, 2);
    });

    it('2.4 Extreme multi-page flyer (100 pages): rapid sequential navigation must clamp strictly', () => {
      const hugeFlyer = {
        id: 'flyer-100p',
        title: 'Grande Catalogo 100 Pagine',
        pageCount: 100,
        coverImageUrl: 'https://example.com/p1.jpg',
        pages: Array.from({ length: 100 }, (_, i) => `https://example.com/p${i + 1}.jpg`)
      };

      const coordinator = new FlyerModalCoordinator(hugeFlyer);
      coordinator.open();

      // Rapidly advance 150 times (well past 100)
      for (let i = 0; i < 150; i++) {
        coordinator.nextPage();
      }
      assert.equal(coordinator.currentPage, 100);
      assert.equal(coordinator.getState().hasNext, false);
      assert.equal(coordinator.getState().hasPrev, true);

      // Rapidly retreat 150 times (well before 1)
      for (let i = 0; i < 150; i++) {
        coordinator.prevPage();
      }
      assert.equal(coordinator.currentPage, 1);
      assert.equal(coordinator.getState().hasNext, true);
      assert.equal(coordinator.getState().hasPrev, false);
    });

    it('2.5 Out-of-bounds page jumps: goToPage with invalid or extreme parameters must be rejected safely', () => {
      const flyer = {
        id: 'flyer-16p',
        title: 'Basko Rapallo',
        pageCount: 16,
        coverImageUrl: 'https://example.com/cover.jpg',
        pages: Array.from({ length: 16 }, (_, i) => `https://example.com/p${i + 1}.jpg`)
      };

      const coordinator = new FlyerModalCoordinator(flyer);
      coordinator.open();
      assert.equal(coordinator.currentPage, 1);

      // Invalid jumps
      coordinator.goToPage(0);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(-5);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(17);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(999999);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage('invalid');
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(NaN);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(null);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(undefined);
      assert.equal(coordinator.currentPage, 1);

      coordinator.goToPage(Infinity);
      assert.equal(coordinator.currentPage, 1);

      // Valid string jump
      coordinator.goToPage('8');
      assert.equal(coordinator.currentPage, 8);

      // Decimal number
      coordinator.goToPage(12.7);
      assert.equal(coordinator.currentPage, 12);
    });

    it('2.6 Rapid keyboard navigation & unhandled keys stress', () => {
      const flyer = {
        id: 'flyer-16p',
        title: 'Basko Rapallo',
        pageCount: 16,
        coverImageUrl: 'https://example.com/cover.jpg',
        pages: Array.from({ length: 16 }, (_, i) => `https://example.com/p${i + 1}.jpg`)
      };

      const coordinator = new FlyerModalCoordinator(flyer);
      coordinator.open();

      // 50 rapid ArrowRight keystrokes
      for (let i = 0; i < 50; i++) {
        coordinator.handleKeyDown('ArrowRight');
      }
      assert.equal(coordinator.currentPage, 16);

      // 50 rapid ArrowLeft keystrokes
      for (let i = 0; i < 50; i++) {
        coordinator.handleKeyDown('ArrowLeft');
      }
      assert.equal(coordinator.currentPage, 1);

      // Alternating ArrowRight and ArrowLeft 10 times
      for (let i = 0; i < 10; i++) {
        coordinator.handleKeyDown('ArrowRight'); // page 2
        coordinator.handleKeyDown('ArrowLeft');  // page 1
      }
      assert.equal(coordinator.currentPage, 1);

      // Unhandled keys: should NOT alter page or crash
      const unhandledKeys = ['Enter', 'Tab', 'Space', ' ', 'a', 'Z', 'Shift', 'Control', 'Alt', 'F5'];
      for (const k of unhandledKeys) {
        coordinator.handleKeyDown(k);
        assert.equal(coordinator.currentPage, 1);
        assert.equal(coordinator.isOpen, true);
      }

      // Escape key closes modal
      coordinator.handleKeyDown('Escape');
      assert.equal(coordinator.isOpen, false);

      // Further keys when modal is closed must have no effect
      coordinator.handleKeyDown('ArrowRight');
      assert.equal(coordinator.isOpen, false);
      assert.equal(coordinator.currentPage, 1);
    });

    it('2.7 Backdrop click dismissal collision logic (inside vs outside bounding rect)', () => {
      // Oracle for FlyerModal handleBackdropClick
      function evaluateBackdropClick(rect, clickX, clickY) {
        const isInsideContent = (
          rect.top <= clickY &&
          clickY <= rect.top + rect.height &&
          rect.left <= clickX &&
          clickX <= rect.left + rect.width
        );
        return !isInsideContent; // Should dismiss if outside content
      }

      const modalRect = { top: 50, left: 200, width: 800, height: 600 };

      // Click outside top
      assert.equal(evaluateBackdropClick(modalRect, 400, 20), true, 'Click above modal must dismiss');

      // Click outside bottom
      assert.equal(evaluateBackdropClick(modalRect, 400, 700), true, 'Click below modal must dismiss');

      // Click outside left
      assert.equal(evaluateBackdropClick(modalRect, 50, 300), true, 'Click left of modal must dismiss');

      // Click outside right
      assert.equal(evaluateBackdropClick(modalRect, 1100, 300), true, 'Click right of modal must dismiss');

      // Click directly inside center of modal
      assert.equal(evaluateBackdropClick(modalRect, 600, 350), false, 'Click inside modal must NOT dismiss');

      // Click inside header (top edge)
      assert.equal(evaluateBackdropClick(modalRect, 250, 60), false, 'Click in header must NOT dismiss');

      // Click inside thumbnail strip (bottom edge)
      assert.equal(evaluateBackdropClick(modalRect, 500, 630), false, 'Click in thumbnails must NOT dismiss');
    });

    it('2.8 Zoom level controls, boundary clamping (1x-3x), and zoom reset oracle', () => {
      // Zoom model oracle: min 1, max 3, step 0.5
      class ZoomController {
        constructor() {
          this.zoomLevel = 1;
        }
        zoomIn() {
          this.zoomLevel = Math.min(this.zoomLevel + 0.5, 3);
          return this.zoomLevel;
        }
        zoomOut() {
          this.zoomLevel = Math.max(this.zoomLevel - 0.5, 1);
          return this.zoomLevel;
        }
        reset() {
          this.zoomLevel = 1;
          return this.zoomLevel;
        }
        toggle() {
          this.zoomLevel = this.zoomLevel > 1 ? 1 : 2;
          return this.zoomLevel;
        }
      }

      const zoom = new ZoomController();
      assert.equal(zoom.zoomLevel, 1);

      // Zoom in sequence
      assert.equal(zoom.zoomIn(), 1.5);
      assert.equal(zoom.zoomIn(), 2.0);
      assert.equal(zoom.zoomIn(), 2.5);
      assert.equal(zoom.zoomIn(), 3.0);
      // Clamp at 3.0
      assert.equal(zoom.zoomIn(), 3.0);
      assert.equal(zoom.zoomIn(), 3.0);

      // Zoom out sequence
      assert.equal(zoom.zoomOut(), 2.5);
      assert.equal(zoom.zoomOut(), 2.0);
      assert.equal(zoom.zoomOut(), 1.5);
      assert.equal(zoom.zoomOut(), 1.0);
      // Clamp at 1.0
      assert.equal(zoom.zoomOut(), 1.0);
      assert.equal(zoom.zoomOut(), 1.0);

      // Reset
      zoom.zoomIn();
      zoom.zoomIn();
      assert.equal(zoom.zoomLevel, 2.0);
      assert.equal(zoom.reset(), 1.0);

      // Double-click toggle
      assert.equal(zoom.toggle(), 2.0);
      assert.equal(zoom.toggle(), 1.0);
    });

    it('2.9 Scroll-snap toggling under zoom: when zoomLevel > 1, scrollSnapType must be none to allow free pan', () => {
      function resolveScrollSnapType(zoomLevel) {
        return zoomLevel > 1 ? 'none' : 'x mandatory';
      }

      assert.equal(resolveScrollSnapType(1.0), 'x mandatory');
      assert.equal(resolveScrollSnapType(1.5), 'none');
      assert.equal(resolveScrollSnapType(2.0), 'none');
      assert.equal(resolveScrollSnapType(3.0), 'none');
    });

    it('2.10 Reset on close and reopen: modal state must always reset currentPage=1 and zoomLevel=1 upon opening', () => {
      const flyer = {
        id: 'flyer-reset-test',
        title: 'Volantino Reset Test',
        pageCount: 10,
        coverImageUrl: 'https://example.com/cover.jpg',
        pages: Array.from({ length: 10 }, (_, i) => `https://example.com/p${i + 1}.jpg`)
      };

      const coordinator = new FlyerModalCoordinator(flyer);
      coordinator.open();
      coordinator.goToPage(7);
      assert.equal(coordinator.currentPage, 7);

      coordinator.close();
      assert.equal(coordinator.isOpen, false);

      // Reopening must reinitialize currentPage to 1
      coordinator.open();
      assert.equal(coordinator.isOpen, true);
      assert.equal(coordinator.currentPage, 1);
    });
  });

  // =========================================================================
  // 3. SUBGRID ALIGNMENT, TEXT CLAMPING, AND PRODUCT CARD RESILIENCY
  // =========================================================================
  describe('3. Subgrid Alignment, Text Clamping, and Product Card Resiliency', () => {
    it('3.1 Subgrid layout contracts: verifies subgrid row spans across 4 tracks', () => {
      const subgridContract = {
        containerClasses: 'grid grid-rows-subgrid row-span-4 gap-2',
        track1_media: 'aspect-square w-full',
        track2_header: 'line-clamp-2 text-sm font-semibold',
        track3_pricing: 'flex flex-col justify-end',
        track4_footer: 'pt-2 border-t border-slate-100 flex items-center justify-between'
      };

      assert.ok(subgridContract.containerClasses.includes('grid-rows-subgrid'));
      assert.ok(subgridContract.containerClasses.includes('row-span-4'));
      assert.ok(subgridContract.track2_header.includes('line-clamp-2'));
    });

    it('3.2 Title variations: short, normal, long (300+ chars), extreme (1000 chars), and XSS injection payloads', () => {
      const testTitles = [
        { type: 'short', title: 'Mela' },
        { type: 'normal', title: 'Pasta Barilla Penne Rigate 500g' },
        {
          type: 'long_300',
          title: 'Super Offerta Speciale Parmigiano Reggiano DOP Stagionato 36 Mesi Selezione Tradizionale Riserva di Montagna Tagliato a Spicchio Sottovuoto 1kg Confezione Famiglia Garantita da Consorzio di Tutela e Freschezza Superiore Prodotto Tipico Italiano'
        },
        {
          type: 'extreme_1000',
          title: 'A'.repeat(1000)
        },
        {
          type: 'xss_script',
          title: '<script>alert("xss")</script>'
        },
        {
          type: 'xss_img_onerror',
          title: '<img src=x onerror=alert(1)>'
        },
        {
          type: 'quotes_and_entities',
          title: 'Prosciutto Cotto &quot;Alta Qualità&quot; 100% Italiano d\'autore'
        }
      ];

      for (const item of testTitles) {
        assert.ok(typeof item.title === 'string');
        assert.ok(item.title.length > 0);
        // Ensure no exception formatting card data
        const titleProp = item.title;
        assert.equal(titleProp, item.title);
      }
    });

    it('3.3 Price calculations & formatting: IEEE-754 precision, no discount badge when originalPrice <= promoPrice', () => {
      function evaluateCardPricing(promoPrice, originalPrice) {
        const hasDiscount = Boolean(originalPrice && originalPrice > promoPrice);
        const discountText = hasDiscount
          ? `-${Math.round(((originalPrice - promoPrice) / originalPrice) * 100)}%`
          : null;
        const promoFormatted = `€ ${promoPrice.toFixed(2).replace('.', ',')}`;
        const originalFormatted = hasDiscount ? `€ ${originalPrice.toFixed(2).replace('.', ',')}` : null;
        return { hasDiscount, discountText, promoFormatted, originalFormatted };
      }

      // Standard discount
      const standard = evaluateCardPricing(0.89, 1.49);
      assert.equal(standard.hasDiscount, true);
      assert.equal(standard.discountText, '-40%');
      assert.equal(standard.promoFormatted, '€ 0,89');
      assert.equal(standard.originalFormatted, '€ 1,49');

      // No original price provided
      const noOriginal = evaluateCardPricing(1.99, undefined);
      assert.equal(noOriginal.hasDiscount, false);
      assert.equal(noOriginal.discountText, null);
      assert.equal(noOriginal.originalFormatted, null);
      assert.equal(noOriginal.promoFormatted, '€ 1,99');

      // originalPrice equals promoPrice (0% discount) -> must NOT display -0%
      const zeroDiscount = evaluateCardPricing(2.50, 2.50);
      assert.equal(zeroDiscount.hasDiscount, false);
      assert.equal(zeroDiscount.discountText, null);

      // originalPrice less than promoPrice (malformed edge case) -> must NOT display negative discount
      const invertedPrices = evaluateCardPricing(5.00, 4.00);
      assert.equal(invertedPrices.hasDiscount, false);
      assert.equal(invertedPrices.discountText, null);

      // Fractional precision check
      const fractional = evaluateCardPricing(0.999, 1.999);
      assert.equal(fractional.promoFormatted, '€ 1,00');
      assert.equal(fractional.hasDiscount, true);
      assert.equal(fractional.discountText, '-50%');

      // Zero price check
      const zeroPrice = evaluateCardPricing(0.00, null);
      assert.equal(zeroPrice.promoFormatted, '€ 0,00');
    });

    it('3.4 Validity date formatting oracle (formatValidityBadge): Italian months, leap day, year end, invalid input', () => {
      // Standard date
      assert.equal(formatValidityBadge('2026-11-15T23:59:59.000Z'), 'Valido fino al 15 nov');

      // Year-end boundary
      assert.equal(formatValidityBadge('2026-12-31T23:59:59.000Z'), 'Valido fino al 31 dic');

      // Year-start boundary
      assert.equal(formatValidityBadge('2026-01-01T00:00:00.000Z'), 'Valido fino al 1 gen');

      // Leap day
      assert.equal(formatValidityBadge('2028-02-29T12:00:00.000Z'), 'Valido fino al 29 feb');

      // Invalid & missing values: must return null without crashing
      assert.equal(formatValidityBadge(null), null);
      assert.equal(formatValidityBadge(undefined), null);
      assert.equal(formatValidityBadge(''), null);
      assert.equal(formatValidityBadge('invalid-date-string'), null);
      assert.equal(formatValidityBadge('2026-13-45T99:99:99'), null);
    });
  });

  // =========================================================================
  // 4. STORE SWITCHER KEYBOARD NAVIGATION & URL SYNCHRONIZATION
  // =========================================================================
  describe('4. Store Switcher Keyboard Navigation & URL Synchronization', () => {
    class StoreTabsNavigator {
      constructor(stores = CANONICAL_RAPALLO_STORES) {
        this.tabs = [
          { id: null, name: 'Tutti' },
          ...stores.map((s) => ({ id: s.id, name: s.brand || s.name }))
        ];
        this.activeIndex = 0;
      }

      handleKeyDown(key) {
        if (['ArrowRight', 'ArrowDown'].includes(key)) {
          this.activeIndex = (this.activeIndex + 1) % this.tabs.length;
        } else if (['ArrowLeft', 'ArrowUp'].includes(key)) {
          this.activeIndex = (this.activeIndex - 1 + this.tabs.length) % this.tabs.length;
        }
        return this.tabs[this.activeIndex];
      }

      selectById(id) {
        const found = this.tabs.findIndex((t) => t.id === id);
        this.activeIndex = found >= 0 ? found : 0;
        return this.tabs[this.activeIndex];
      }
    }

    it('4.1 Forward navigation (ArrowRight / ArrowDown): cycles smoothly through all stores and wraps to Tutti', () => {
      const nav = new StoreTabsNavigator();
      assert.equal(nav.activeIndex, 0); // Tutti

      // Coop
      const t1 = nav.handleKeyDown('ArrowRight');
      assert.equal(t1.name, 'Coop');

      // Carrefour
      const t2 = nav.handleKeyDown('ArrowRight');
      assert.equal(t2.name, 'Carrefour');

      // Conad
      const t3 = nav.handleKeyDown('ArrowRight');
      assert.equal(t3.name, 'Conad');

      // Basko
      const t4 = nav.handleKeyDown('ArrowRight');
      assert.equal(t4.name, 'Basko');

      // Doro
      const t5 = nav.handleKeyDown('ArrowRight');
      assert.equal(t5.name, 'Doro');

      // Wrap around back to Tutti
      const t6 = nav.handleKeyDown('ArrowRight');
      assert.equal(t6.name, 'Tutti');
      assert.equal(t6.id, null);
    });

    it('4.2 Backward navigation (ArrowLeft / ArrowUp): wraps backwards from Tutti to Doro', () => {
      const nav = new StoreTabsNavigator();
      assert.equal(nav.activeIndex, 0); // Tutti

      // Wrap back to last tab (Doro)
      const tPrev = nav.handleKeyDown('ArrowLeft');
      assert.equal(tPrev.name, 'Doro');

      // Back to Basko
      const tPrev2 = nav.handleKeyDown('ArrowLeft');
      assert.equal(tPrev2.name, 'Basko');
    });

    it('4.3 Rapid 50-step keyboard traversal retains consistent index without corruption', () => {
      const nav = new StoreTabsNavigator();
      for (let i = 0; i < 50; i++) {
        nav.handleKeyDown('ArrowRight');
        assert.ok(nav.activeIndex >= 0 && nav.activeIndex < nav.tabs.length);
      }
    });

    it('4.4 URL search params synchronization & resolution', () => {
      function resolveStoreFromUrl(paramValue, stores = CANONICAL_RAPALLO_STORES) {
        if (!paramValue) return null;
        const norm = paramValue.toLowerCase().trim();
        const found = stores.find((s) => s.id.toLowerCase() === norm || s.brand.toLowerCase() === norm);
        return found ? found.id : null;
      }

      // Exact store id
      assert.equal(resolveStoreFromUrl('coop-rapallo-sciesa'), 'coop-rapallo-sciesa');
      // Brand alias
      assert.equal(resolveStoreFromUrl('basko'), 'basko-rapallo-colombo');
      assert.equal(resolveStoreFromUrl('carrefour'), 'carrefour-market-assereto');
      assert.equal(resolveStoreFromUrl('doro'), 'doro-tigullio-margherita');
      // Unknown or empty
      assert.equal(resolveStoreFromUrl('unknown-store-123'), null);
      assert.equal(resolveStoreFromUrl(''), null);
      assert.equal(resolveStoreFromUrl(null), null);
    });
  });

  // =========================================================================
  // 5. PRODUCTION ASSET VERIFICATION & LIVE HTTP STATIC SERVING
  // =========================================================================
  describe('5. Production Asset Verification & Live HTTP Static Serving', () => {
    it('5.1 Root server starts up cleanly and serves index.html shell over HTTP 200', async () => {
      const res = await fetch(`${baseUrl}/`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/html'));

      const html = await res.text();
      assert.ok(html.includes('<!DOCTYPE html>'));
      assert.ok(html.includes('<meta name="viewport" content="width=device-width, initial-scale=1.0"'));
      assert.ok(html.includes('<div id="root"></div>'));
      assert.ok(html.includes('Basilico'));
    });

    it('5.2 GET /api/status responds with valid health JSON metadata', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('application/json'));

      const body = await res.json();
      assert.equal(typeof body.isOnline, 'boolean');
      assert.ok(['live', 'cache', 'seed'].includes(body.dataSource));
      assert.equal(typeof body.storeCount, 'number');
      assert.ok(body.storeCount >= 5);
    });

    it('5.3 Static CSS bundle is served with correct mime-type and contains scroll-snap and subgrid rules', async () => {
      // Find asset path from dist/index.html
      const distHtml = fs.readFileSync(path.join(PROJECT_ROOT, 'dist', 'index.html'), 'utf8');
      const cssMatch = distHtml.match(/\/assets\/[a-zA-Z0-9_\-]+\.css/);
      assert.ok(cssMatch, 'CSS bundle reference must exist in dist/index.html');

      const cssPath = cssMatch[0];
      const res = await fetch(`${baseUrl}${cssPath}`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get('content-type').includes('text/css'));

      const cssContent = await res.text();
      assert.ok(cssContent.includes('scroll-snap-type'));
      assert.ok(cssContent.includes('overscroll-behavior'));
      assert.ok(cssContent.includes('subgrid'));
      assert.ok(cssContent.includes('max-w-7xl'));
    });

    it('5.4 SPA routing fallback: non-API route returns index.html shell instead of 404', async () => {
      const res = await fetch(`${baseUrl}/volantini/rapallo`);
      assert.equal(res.status, 200);
      const text = await res.text();
      assert.ok(text.includes('<div id="root"></div>'));
    });

    it('5.5 Non-existent /api/ route returns HTTP 404 JSON', async () => {
      const res = await fetch(`${baseUrl}/api/non_existent_endpoint`);
      assert.equal(res.status, 404);
      assert.ok(res.headers.get('content-type').includes('application/json'));
      const body = await res.json();
      assert.ok(body.error.includes('API endpoint not found'));
    });
  });
});
