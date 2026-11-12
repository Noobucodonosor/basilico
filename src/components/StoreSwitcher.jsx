import React, { useRef, useEffect } from 'react';

export function StoreSwitcher({ stores = [], selectedStoreId, onSelectStore }) {
  const tablistRef = useRef(null);

  // Build tabs: Index 0 is "Tutti", 1..N are specific stores
  const tabs = [
    {
      id: null,
      name: 'Tutti',
      fullName: 'Tutti i Supermercati',
      badgeText: null,
      isRegionalServing: false
    },
    ...stores.map((s) => ({
      id: s.id,
      name: s.brand || s.name,
      fullName: s.name,
      badgeText: s.activeOfferCount > 0 ? `${s.activeOfferCount} offerte` : '0',
      hasActiveOffers: s.activeOfferCount > 0,
      isRegionalServing: Boolean(s.isRegionalServing)
    }))
  ];

  const activeIndex = tabs.findIndex((t) => t.id === selectedStoreId);
  const currentTab = activeIndex >= 0 ? tabs[activeIndex] : tabs[0];

  const handleKeyDown = (e) => {
    if (['ArrowRight', 'ArrowDown'].includes(e.key)) {
      e.preventDefault();
      const nextIdx = (activeIndex + 1) % tabs.length;
      onSelectStore(tabs[nextIdx].id);
    } else if (['ArrowLeft', 'ArrowUp'].includes(e.key)) {
      e.preventDefault();
      const prevIdx = (activeIndex - 1 + tabs.length) % tabs.length;
      onSelectStore(tabs[prevIdx].id);
    }
  };

  useEffect(() => {
    if (tablistRef.current) {
      const activeEl = tablistRef.current.querySelector('[aria-selected="true"]');
      if (activeEl) {
        activeEl.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
      }
    }
  }, [selectedStoreId]);

  return (
    <div className="bg-white border-b border-slate-200 py-2.5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div
          ref={tablistRef}
          role="tablist"
          aria-label="Seleziona Supermercato a Rapallo"
          onKeyDown={handleKeyDown}
          className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 scroll-smooth"
        >
          {tabs.map((tab) => {
            const isSelected = (tab.id === null && selectedStoreId === null) || tab.id === selectedStoreId;
            return (
              <button
                key={tab.id || 'all'}
                role="tab"
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => onSelectStore(tab.id)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-semibold transition-all shrink-0 select-none focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-1 cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : tab.hasActiveOffers === false
                      ? 'bg-slate-50 text-slate-400 border border-slate-200/70 hover:bg-slate-100'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <span>{tab.name}</span>
                {tab.badgeText && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected
                        ? 'bg-emerald-800 text-emerald-100'
                        : tab.hasActiveOffers === false
                          ? 'bg-slate-100 text-slate-400'
                          : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {tab.badgeText}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {currentTab?.isRegionalServing && (
          <div className="mt-2 text-xs bg-amber-50 text-amber-800 border border-amber-200 px-3 py-1.5 rounded-md flex items-center gap-2">
            <span aria-hidden="true">📍</span>
            <span>
              <strong>{currentTab.fullName || currentTab.name}:</strong> Punto vendita a servizio del bacino di Rapallo / Tigullio.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default StoreSwitcher;
