import React, { useRef, useEffect, useState, useCallback } from 'react';
import FlyerFallbackCard from './FlyerFallbackCard.jsx';

/**
 * FlyerCarousel Component
 * Delivers 60fps hardware-accelerated touch swipe scrolling via CSS Scroll Snap:
 * - scroll-snap-type: x mandatory
 * - scroll-snap-align: center
 * Supports full-page scans AND clean multi-product digital page sheets when upstream CDN
 * exposes individual product crops (`/flyergibs/gibCover_*.png`) instead of full-page scans.
 */
export function FlyerCarousel({
  pages = [],
  currentPage = 1,
  onPageChange,
  zoomLevel = 1,
  onZoomToggle,
  flyerTitle = 'Volantino Rapallo',
  storeName = 'Supermercato',
  flyerOffers = [],
  highlightOfferId = null
}) {
  const scrollerRef = useRef(null);
  const [isSwiping, setIsSwiping] = useState(false);
  const [failedPages, setFailedPages] = useState({});

  const touchStateRef = useRef({
    initialDist: 0,
    initialZoom: 1
  });

  // Programmatically scroll carousel when currentPage changes externally
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const targetLeft = (currentPage - 1) * scroller.clientWidth;
    if (Math.abs(scroller.scrollLeft - targetLeft) > 5) {
      scroller.scrollTo({
        left: targetLeft,
        behavior: isSwiping ? 'auto' : 'smooth'
      });
    }
  }, [currentPage, isSwiping]);

  // Synchronize scroll-snap settling with currentPage
  const handleScroll = useCallback(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const width = scroller.clientWidth;
    if (!width) return;

    const newPage = Math.round(scroller.scrollLeft / width) + 1;
    if (newPage >= 1 && newPage <= pages.length && newPage !== currentPage) {
      onPageChange?.(newPage);
    }
  }, [pages.length, currentPage, onPageChange]);

  // Listen for native scrollsnapchange
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onSnapChange = (e) => {
      if (e.snapTargetInline?.dataset?.page) {
        const p = parseInt(e.snapTargetInline.dataset.page, 10);
        if (!isNaN(p) && p !== currentPage) {
          onPageChange?.(p);
        }
      }
    };

    if ('onscrollsnapchange' in window) {
      scroller.addEventListener('scrollsnapchange', onSnapChange);
      return () => scroller.removeEventListener('scrollsnapchange', onSnapChange);
    }
  }, [currentPage, onPageChange]);

  const handleTouchStart = (e) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      touchStateRef.current.initialDist = dist;
      touchStateRef.current.initialZoom = zoomLevel;
    } else {
      setIsSwiping(true);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    touchStateRef.current.initialDist = 0;
  };

  const handleImageError = (pageNum) => {
    setFailedPages((prev) => ({ ...prev, [pageNum]: true }));
  };

  return (
    <div
      ref={scrollerRef}
      onScroll={handleScroll}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      data-scroll-snap-type="x mandatory"
      style={{
        scrollSnapType: zoomLevel > 1 ? 'none' : 'x mandatory',
        WebkitOverflowScrolling: 'touch',
        overscrollBehavior: 'contain'
      }}
      className={`w-full h-full flex overflow-x-auto overflow-y-hidden ${
        zoomLevel > 1 ? '' : 'snap-x snap-mandatory scroll-snap-x-mandatory'
      } scroll-smooth overscroll-contain no-scrollbar scrollbar-none select-none`}
    >
      {pages.map((url, idx) => {
        const pageNum = idx + 1;
        const isCurrent = pageNum === currentPage;
        const isFailed = Boolean(failedPages[pageNum]);
        const isSingleItemCrop = typeof url === 'string' && url.includes('/flyergibs/');
        const offersOnThisPage = Array.isArray(flyerOffers)
          ? flyerOffers.filter((o) => Number(o.pageNumber) === pageNum)
          : [];

        return (
          <div
            key={`page-${pageNum}`}
            data-page={pageNum}
            data-scroll-snap-align="center"
            style={{ scrollSnapAlign: 'center', scrollSnapStop: 'always' }}
            className="flex-shrink-0 w-full h-full snap-center scroll-snap-align-center flex items-center justify-center p-2 sm:p-4 overflow-hidden relative"
          >
            {isSingleItemCrop && offersOnThisPage.length > 0 ? (
              <div className="w-full max-w-3xl h-full max-h-[75dvh] bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden select-text">
                <div className="px-4 py-2.5 bg-emerald-900 text-white flex items-center justify-between gap-2 shrink-0">
                  <div className="min-w-0">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider bg-emerald-700 px-1.5 py-0.5 rounded mr-2">
                      {storeName}
                    </span>
                    <span className="text-xs sm:text-sm font-bold truncate">
                      {flyerTitle} — Pagina {pageNum}
                    </span>
                  </div>
                  <span className="text-[11px] font-semibold text-emerald-200 shrink-0">
                    {offersOnThisPage.length} {offersOnThisPage.length === 1 ? 'offerta estratta' : 'offerte estratte'}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-3 bg-slate-50">
                  {offersOnThisPage.map((item) => {
                    const isHighlighted = highlightOfferId && String(item.id) === String(highlightOfferId);
                    const priceVal = Number(item.promoPrice ?? item.price ?? 0);
                    return (
                      <div
                        key={item.id}
                        className={`bg-white rounded-lg border p-2.5 flex flex-col gap-1.5 shadow-xs ${
                          isHighlighted
                            ? 'border-emerald-600 ring-2 ring-emerald-500/50 bg-emerald-50/30'
                            : 'border-slate-200'
                        }`}
                      >
                        <div className="aspect-square w-full bg-slate-50 rounded flex items-center justify-center p-1.5 overflow-hidden relative">
                          <img
                            src={item.imageUrl || url}
                            alt={item.title}
                            loading="lazy"
                            className="max-h-full max-w-full object-contain"
                          />
                          {item.discountPercentage > 0 && (
                            <span className="absolute top-1 right-1 bg-rose-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                              -{item.discountPercentage}%
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-semibold text-slate-900 line-clamp-2 leading-tight">
                          {item.title}
                        </div>
                        <div className="mt-auto flex items-baseline gap-1.5">
                          <span className="text-sm font-extrabold text-emerald-700">
                            € {priceVal.toFixed(2).replace('.', ',')}
                          </span>
                          {item.originalPrice > priceVal && (
                            <span className="text-[10px] text-slate-400 line-through">
                              € {Number(item.originalPrice).toFixed(2).replace('.', ',')}
                            </span>
                          )}
                        </div>
                        {item.formattedNormalizedPrice && (
                          <span className="text-[10px] text-slate-500 font-medium truncate">
                            ⚖️ {item.formattedNormalizedPrice}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : isFailed ? (
              <FlyerFallbackCard
                storeName={storeName}
                title={flyerTitle}
                pageNumber={pageNum}
                onRetry={() => {
                  setFailedPages((prev) => {
                    const copy = { ...prev };
                    delete copy[pageNum];
                    return copy;
                  });
                }}
              />
            ) : (
              <div
                onDoubleClick={onZoomToggle}
                className="relative max-w-full max-h-full flex items-center justify-center transition-transform duration-200 ease-out cursor-zoom-in"
                style={{
                  transform: isCurrent ? `scale(${zoomLevel})` : 'scale(1)',
                  transformOrigin: 'center center'
                }}
              >
                <img
                  src={url}
                  alt={`${flyerTitle} — Pagina ${pageNum}`}
                  loading={isCurrent ? 'eager' : 'lazy'}
                  decoding="async"
                  onError={() => handleImageError(pageNum)}
                  className="max-h-[75dvh] max-w-full object-contain rounded-md shadow-2xl pointer-events-none"
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default FlyerCarousel;
