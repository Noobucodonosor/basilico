import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import { FlyerModalCoordinator } from './FlyerModalCoordinator.js';
import FlyerCarousel from './FlyerCarousel.jsx';

/**
 * FlyerModal Component
 * Native HTML5 <dialog> with top-layer promotion, scroll containment,
 * keyboard navigation, product-per-page sheet fallback for GIB crops, and thumbnail preview bar.
 */
export function FlyerModal({ flyer, isOpen, onClose }) {
  const dialogRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [flyerOffers, setFlyerOffers] = useState([]);

  // Initialize or update coordinator instance
  const coordinator = useMemo(() => {
    return new FlyerModalCoordinator(flyer);
  }, [flyer]);

  // Load all active offers belonging to this store/flyer so pages without full-bleed scans can display real multi-product page sheets
  useEffect(() => {
    if (!isOpen || !flyer) return;
    let cancelled = false;
    const storeParam = flyer.storeId ? `storeId=${encodeURIComponent(flyer.storeId)}&` : '';
    Promise.all([
      fetch(`/api/offers?${storeParam}page=1&limit=100`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/offers?${storeParam}page=2&limit=100`).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      fetch(`/api/offers?${storeParam}page=3&limit=100`).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    ]).then((responses) => {
      if (cancelled) return;
      const all = [];
      const seen = new Set();
      for (const res of responses) {
        if (res && Array.isArray(res.offers)) {
          for (const o of res.offers) {
            if (!seen.has(o.id)) {
              seen.add(o.id);
              all.push(o);
            }
          }
        }
      }
      const matchingFlyer = flyer.id
        ? all.filter((o) => String(o.flyerId) === String(flyer.id))
        : all;
      setFlyerOffers(matchingFlyer.length > 0 ? matchingFlyer : all);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, flyer]);

  // Sync open/close lifecycle with native <dialog>
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      const startPage = flyer?.initialPage || 1;
      const nextState = coordinator.open(startPage);
      setCurrentPage(nextState.currentPage);
      setZoomLevel(1);
      if (!dialog.open) {
        dialog.showModal();
      }
    } else {
      coordinator.close();
      if (dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen, coordinator, flyer?.initialPage]);

  const totalPages = coordinator.totalPages;
  const pageIndicator = `Pagina ${currentPage} di ${totalPages}`;
  const hasNext = currentPage < totalPages;
  const hasPrev = currentPage > 1;

  // Page navigation handlers
  const handleNext = useCallback(() => {
    if (hasNext) {
      coordinator.nextPage();
      setCurrentPage(coordinator.currentPage);
    }
  }, [hasNext, coordinator]);

  const handlePrev = useCallback(() => {
    if (hasPrev) {
      coordinator.prevPage();
      setCurrentPage(coordinator.currentPage);
    }
  }, [hasPrev, coordinator]);

  const handleGoToPage = useCallback((p) => {
    coordinator.goToPage(p);
    setCurrentPage(coordinator.currentPage);
  }, [coordinator]);

  // Zoom controls
  const handleZoomIn = useCallback(() => {
    setZoomLevel((prev) => Math.min(prev + 0.5, 3));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel((prev) => Math.max(prev - 0.5, 1));
  }, []);

  const handleZoomReset = useCallback(() => {
    setZoomLevel(1);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        coordinator.handleKeyDown('Escape');
        onClose?.();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleZoomReset();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, handleNext, handlePrev, handleZoomIn, handleZoomOut, handleZoomReset, onClose, coordinator]);

  // Backdrop light-dismiss fallback
  const handleBackdropClick = (e) => {
    const dialog = dialogRef.current;
    if (!dialog || e.target !== dialog) return;

    const rect = dialog.getBoundingClientRect();
    const isInsideContent = (
      rect.top <= e.clientY &&
      e.clientY <= rect.top + rect.height &&
      rect.left <= e.clientX &&
      e.clientX <= rect.left + rect.width
    );

    if (!isInsideContent) {
      coordinator.close();
      onClose?.();
    }
  };

  if (!flyer) return null;

  // Extract page image list
  const pages = Array.isArray(flyer.pages) && flyer.pages.length > 0
    ? flyer.pages.map((p) => (typeof p === 'string' ? p : (p?.imageUrl || flyer.coverImageUrl)))
    : Array.from({ length: totalPages }, () => flyer.coverImageUrl);

  return (
    <dialog
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="flyer-modal-title"
      closedby="any"
      onClick={handleBackdropClick}
      onCancel={(e) => {
        e.preventDefault();
        coordinator.close();
        onClose?.();
      }}
      className="fixed inset-0 m-auto h-[90dvh] max-h-[100dvh] w-full max-w-4xl rounded-2xl bg-slate-900 text-white shadow-2xl flex flex-col overflow-hidden border border-slate-700 p-0 backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm overscroll-contain"
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Top Controls Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-slate-800/90 border-b border-slate-700/80 z-20 shrink-0 gap-2">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide uppercase bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shrink-0">
            {flyer.storeName || 'Rapallo'}
          </span>
          <h2
            id="flyer-modal-title"
            className="text-sm sm:text-base font-semibold truncate text-slate-100"
            title={flyer.title}
          >
            {flyer.title || 'Volantino Promozionale'}
          </h2>
        </div>

        {/* Center: Live Page Indicator */}
        <div
          className="hidden sm:flex items-center px-3 py-1 bg-slate-900/60 rounded-full text-xs font-mono font-medium text-slate-300 border border-slate-700/60 shrink-0"
          aria-live="polite"
        >
          {pageIndicator}
        </div>

        {/* Right: External Flyer Link, Zoom controls and Close Button */}
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          {flyer.pdfUrl && (
            <a
              href={flyer.pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg bg-slate-700/70 hover:bg-emerald-700 text-slate-100 border border-slate-600 transition-colors"
              title="Apri scansione originale esterna in una nuova scheda"
            >
              <span>Fonte ↗</span>
            </a>
          )}

          <div className="flex items-center bg-slate-700/50 rounded-lg p-0.5 border border-slate-600/50">
            <button
              type="button"
              onClick={handleZoomOut}
              disabled={zoomLevel <= 1}
              aria-label="Riduci zoom"
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
              </svg>
            </button>
            <span className="text-xs px-1.5 font-mono text-slate-300 select-none">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              onClick={handleZoomIn}
              disabled={zoomLevel >= 3}
              aria-label="Aumenta zoom"
              className="p-1.5 text-slate-300 hover:text-white disabled:opacity-30 disabled:hover:text-slate-300 transition-colors cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              coordinator.close();
              onClose?.();
            }}
            aria-label="Chiudi volantino"
            className="p-2 ml-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700/60 focus:outline-none focus:ring-2 focus:ring-emerald-400 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {/* Main Touch Carousel Area */}
      <main className="relative flex-1 min-h-0 bg-slate-950 flex items-center justify-center overflow-hidden">
        <FlyerCarousel
          pages={pages}
          currentPage={currentPage}
          onPageChange={handleGoToPage}
          zoomLevel={zoomLevel}
          onZoomToggle={() => setZoomLevel((z) => (z > 1 ? 1 : 2))}
          flyerTitle={flyer.title}
          storeName={flyer.storeName}
          flyerOffers={flyerOffers}
          highlightOfferId={flyer.highlightOfferId || null}
        />

        {/* Floating Desktop Next / Prev Buttons */}
        {hasPrev && (
          <button
            type="button"
            onClick={handlePrev}
            aria-label="Pagina precedente"
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white shadow-lg backdrop-blur-sm border border-slate-700/60 transition-all z-10 cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}

        {hasNext && (
          <button
            type="button"
            onClick={handleNext}
            aria-label="Pagina successiva"
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 p-3 rounded-full bg-slate-900/80 hover:bg-emerald-600 text-white shadow-lg backdrop-blur-sm border border-slate-700/60 transition-all z-10 cursor-pointer"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </main>

      {/* Footer Thumbnail Strip & Mobile Page Indicator */}
      <footer className="bg-slate-900 border-t border-slate-800 p-2 sm:p-3 flex flex-col gap-2 z-20 shrink-0">
        <div className="flex sm:hidden items-center justify-between text-xs text-slate-400 px-1">
          <span className="font-mono">{pageIndicator}</span>
          <span className="text-[11px] text-slate-500">Scorri per cambiare pagina</span>
        </div>

        {/* Thumbnail Navigation Strip */}
        {totalPages > 1 && (
          <div
            className="flex items-center gap-2 overflow-x-auto py-1 px-1 scroll-smooth no-scrollbar scrollbar-none"
            role="tablist"
            aria-label="Pagine del volantino"
          >
            {pages.map((url, idx) => {
              const pageNum = idx + 1;
              const isActive = pageNum === currentPage;
              const isCropThumb = typeof url === 'string' && url.includes('/flyergibs/');
              const pageItemCount = flyerOffers.filter((o) => Number(o.pageNumber) === pageNum).length;
              return (
                <button
                  key={`thumb-${pageNum}`}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-label={`Vai a pagina ${pageNum}`}
                  onClick={() => handleGoToPage(pageNum)}
                  className={`relative shrink-0 w-11 h-14 rounded overflow-hidden border transition-all text-xs font-semibold cursor-pointer ${
                    isActive
                      ? 'border-emerald-500 ring-2 ring-emerald-500/50 scale-105 z-10 shadow-md'
                      : 'border-slate-700 opacity-60 hover:opacity-100 hover:border-slate-500'
                  }`}
                >
                  {isCropThumb ? (
                    <div className="w-full h-full bg-slate-800 flex flex-col items-center justify-center text-[10px] text-slate-300 leading-tight px-0.5">
                      <span className="font-bold text-emerald-400">P.{pageNum}</span>
                      {pageItemCount > 0 && (
                        <span className="text-[8px] text-slate-400">{pageItemCount} art.</span>
                      )}
                    </div>
                  ) : (
                    <>
                      <img
                        src={url}
                        alt={`Anteprima pagina ${pageNum}`}
                        loading="lazy"
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextElementSibling) {
                            e.currentTarget.nextElementSibling.style.display = 'flex';
                          }
                        }}
                      />
                      <div className="hidden absolute inset-0 bg-slate-800 items-center justify-center text-[10px] text-slate-400">
                        P.{pageNum}
                      </div>
                      <span className="absolute bottom-0 right-0 bg-slate-950/80 px-1 py-0.5 text-[9px] font-mono text-slate-200 rounded-tl">
                        {pageNum}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </footer>
    </dialog>
  );
}

export default FlyerModal;
