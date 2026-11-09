/**
 * Canonical Flyer Modal State Coordinator
 * Aligns 1:1 with tests/e2e/flyer_modal.test.js oracle.
 */
export class FlyerModalCoordinator {
  constructor(flyer) {
    this.flyer = flyer || { pageCount: 1, pages: [] };
    this.isOpen = false;
    this.currentPage = 1;
    this.totalPages = (typeof flyer?.pageCount === 'number' && flyer.pageCount >= 1)
      ? flyer.pageCount
      : (Array.isArray(flyer?.pages) && flyer.pages.length > 0 ? flyer.pages.length : 1);
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
    const page = parseInt(pageNumber, 10);
    if (!isNaN(page) && page >= 1 && page <= this.totalPages) {
      this.currentPage = page;
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
    let activeUrl = null;
    if (this.flyer) {
      if (Array.isArray(this.flyer.pages) && this.flyer.pages.length > 0) {
        const item = this.flyer.pages[this.currentPage - 1];
        activeUrl = typeof item === 'string' ? item : (item?.imageUrl || this.flyer.coverImageUrl);
      } else {
        activeUrl = this.flyer.coverImageUrl;
      }
    }

    return {
      isOpen: this.isOpen,
      currentPage: this.currentPage,
      totalPages: this.totalPages,
      pageIndicator: `Pagina ${this.currentPage} di ${this.totalPages}`,
      hasNext: this.currentPage < this.totalPages,
      hasPrev: this.currentPage > 1,
      activePageUrl: activeUrl,
      scrollSnapType: this.scrollSnapType,
      scrollSnapAlign: this.scrollSnapAlign,
      overscrollBehavior: this.overscrollBehavior
    };
  }
}

export default FlyerModalCoordinator;
