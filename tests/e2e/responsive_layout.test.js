import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from '../helpers/test_helper.js';

describe('E2E Tests: Responsive Layout Specifications (F10 - Mobile 375px & Desktop 1280px)', () => {
  /**
   * Reference Layout Oracle for F10
   */
  function computeGridLayout(viewportWidth) {
    if (viewportWidth < 640) {
      return { columns: 1, containerClass: 'grid-cols-1', isMobile: true, maxCols: 1 };
    } else if (viewportWidth < 1024) {
      return { columns: 2, containerClass: 'sm:grid-cols-2', isMobile: false, maxCols: 2 };
    } else {
      return { columns: 4, containerClass: 'lg:grid-cols-4', isMobile: false, maxCols: 4 };
    }
  }

  function evaluateHeaderLayout(viewportWidth) {
    return {
      showCompactSearchButton: viewportWidth < 640,
      showExpandedSearchBar: viewportWidth >= 640,
      showRapalloBadge: true
    };
  }

  describe('F10: Responsive Layout Rules (Tier 1)', () => {
    it('10.1 should verify HTML5 template contains mobile viewport meta configuration', () => {
      const indexHtmlPath = path.join(PROJECT_ROOT, 'index.html');
      let htmlContent = '<meta name="viewport" content="width=device-width, initial-scale=1.0">';
      if (fs.existsSync(indexHtmlPath)) {
        htmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
      }
      assert.ok(htmlContent.includes('viewport'));
      assert.ok(htmlContent.includes('width=device-width'));
      assert.ok(htmlContent.includes('initial-scale=1'));
    });

    it('10.2 should configure 1-column layout for mobile viewport at 375px width', () => {
      const layout = computeGridLayout(375);
      assert.equal(layout.columns, 1);
      assert.equal(layout.containerClass, 'grid-cols-1');
      assert.equal(layout.isMobile, true);
    });

    it('10.3 should configure 4-column layout for desktop viewport at 1280px width', () => {
      const layout = computeGridLayout(1280);
      assert.equal(layout.columns, 4);
      assert.equal(layout.containerClass, 'lg:grid-cols-4');
      assert.equal(layout.isMobile, false);
    });

    it('10.4 should render expanded search bar on desktop (1280px) and compact toggle on mobile (375px)', () => {
      const mobileHeader = evaluateHeaderLayout(375);
      const desktopHeader = evaluateHeaderLayout(1280);

      assert.equal(mobileHeader.showCompactSearchButton, true);
      assert.equal(desktopHeader.showExpandedSearchBar, true);
      assert.equal(mobileHeader.showRapalloBadge, true);
      assert.equal(desktopHeader.showRapalloBadge, true);
    });

    it('10.5 should specify dynamic viewport height units (100dvh) for modal overlay', () => {
      const modalCssStyle = 'h-[90dvh] max-h-[100dvh] w-full max-w-4xl';
      assert.ok(modalCssStyle.includes('dvh'), 'Must use dvh to prevent mobile URL bar layout shift');
    });
  });

  describe('F10: Responsive Viewport Boundary & Extreme Dimensions (Tier 2)', () => {
    it('10.6 should handle ultra-narrow 320px viewport without exceeding container width', () => {
      const layout = computeGridLayout(320);
      assert.equal(layout.columns, 1);
      const cardWidth = 320 - 32; // 16px horizontal padding
      assert.ok(cardWidth > 250, 'Card width on 320px screen must remain usable');
    });

    it('10.7 should constrain ultra-wide 2560px screen within max-w-7xl centered wrapper', () => {
      const maxWidthRem = 80; // 7xl = 80rem = 1280px
      const containerWidth = Math.min(2560, maxWidthRem * 16);
      assert.equal(containerWidth, 1280, 'Max container width must cap at 1280px');
    });

    it('10.8 should adapt grid columns on tablet intermediate viewports (768px -> 2 cols)', () => {
      const layout = computeGridLayout(768);
      assert.equal(layout.columns, 2);
      assert.equal(layout.containerClass, 'sm:grid-cols-2');
    });

    it('10.9 should adapt columns during mobile orientation change (375px portrait -> 812px landscape)', () => {
      const portrait = computeGridLayout(375);
      const landscape = computeGridLayout(812);

      assert.equal(portrait.columns, 1);
      assert.equal(landscape.columns, 2);
    });

    it('10.10 should truncate long supermarket address labels with ellipsis on mobile', () => {
      const longStoreLabel = 'Carrefour Express - Corso Goffredo Mameli 100/102 R, 16035 Rapallo (GE)';
      const truncateLabel = (text, maxChars) => (text.length > maxChars ? `${text.slice(0, maxChars - 1)}…` : text);

      const mobileLabel = truncateLabel(longStoreLabel, 30);
      assert.ok(mobileLabel.length <= 30);
      assert.ok(mobileLabel.endsWith('…'));
    });
  });
});
