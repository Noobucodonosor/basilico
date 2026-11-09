import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import StoreSwitcher from './components/StoreSwitcher.jsx';
import SearchBar from './components/SearchBar.jsx';
import CategoryFilters from './components/CategoryFilters.jsx';
import OfferGrid from './components/OfferGrid.jsx';
import EmptyState from './components/EmptyState.jsx';
import FlyerModal from './components/FlyerModal.jsx';
import OfflineNotice from './components/OfflineNotice.jsx';
import { useSupermarketData } from './hooks/useSupermarketData.js';

export function App() {
  // 1. Initial State from URL
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialStore = initialParams.get('store') || null;
  const initialQuery = initialParams.get('q') || '';
  const initialCategory = initialParams.get('category') || null;
  const initialSort = initialParams.get('sortBy') || 'discountDesc';

  const [selectedStoreId, setSelectedStoreId] = useState(initialStore);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialSort);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeFlyer, setActiveFlyer] = useState(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // 2. Data Hook
  const {
    stores,
    offers,
    flyers,
    facets,
    status,
    loading,
    totalOffers,
    syncData
  } = useSupermarketData({
    storeId: selectedStoreId,
    q: searchQuery,
    category: selectedCategory,
    sortBy: sortBy
  });

  // 3. Keep URL search params synchronized without page reload
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (selectedStoreId) params.set('store', selectedStoreId);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedCategory) params.set('category', selectedCategory);
    if (sortBy && sortBy !== 'discountDesc') params.set('sortBy', sortBy);

    const newRelativePath = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newRelativePath);
  }, [selectedStoreId, searchQuery, selectedCategory, sortBy]);

  // 4. Resolve Active Store display name
  const activeStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  const activeStoreName = activeStore ? activeStore.name : 'Tutti i Supermercati';

  // Active flyer for selected store
  const currentStoreFlyer = useMemo(() => {
    if (!selectedStoreId) return null;
    return flyers.find((f) => f.storeId === selectedStoreId) || null;
  }, [flyers, selectedStoreId]);

  // 5. Active filter count calculation (Contract 12.4)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim().length > 0) count++;
    if (selectedCategory !== null) count++;
    return count;
  }, [searchQuery, selectedCategory]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
  }, []);

  const handleToggleCategory = useCallback((cat) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await syncData(true);
    setIsRefreshing(false);
    setIsBannerDismissed(false);
  }, [syncData]);

  const handleOpenFlyer = useCallback((targetFlyer) => {
    if (targetFlyer) {
      setActiveFlyer(targetFlyer);
    }
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Offline / Stale Cache Warning Banner */}
      <OfflineNotice
        isOnline={status.isOnline}
        dataSource={status.dataSource}
        lastSyncTimestamp={status.lastSyncTimestamp}
        isBannerDismissed={isBannerDismissed}
        onDismiss={() => setIsBannerDismissed(true)}
        onRetry={handleRefresh}
      />

      {/* Responsive Header */}
      <Header
        status={status}
        activeStoreName={activeStoreName}
        isMobileSearchOpen={isMobileSearchOpen}
        onToggleMobileSearch={() => setIsMobileSearchOpen((prev) => !prev)}
        onRefresh={handleRefresh}
        isRefreshing={isRefreshing}
      />

      {/* Store Switcher Tab Bar */}
      <StoreSwitcher
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelectStore={(id) => setSelectedStoreId(id)}
      />

      {/* Main Content Area: Cap at max-w-7xl (1280px, Tier 2 test 10.7) */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {/* Active Store Promo & Flyer Banner */}
        {activeStore && (
          <section className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-slate-900">{activeStore.name}</h2>
                {activeStore.isRegionalServing && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    Servizio Rapallo & Tigullio
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
                {activeStore.address}
              </p>
            </div>

            {currentStoreFlyer && (
              <button
                type="button"
                onClick={() => handleOpenFlyer(currentStoreFlyer)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors whitespace-nowrap self-start sm:self-auto cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                <span>Sfoglia volantino ({currentStoreFlyer.pageCount} pag.)</span>
              </button>
            )}
          </section>
        )}

        {/* Search & Sort Controls (Always visible on desktop >=640px, toggleable on mobile <640px) */}
        <section className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 ${
          isMobileSearchOpen ? 'flex' : 'hidden sm:flex'
        }`}>
          <div className="flex-1">
            <SearchBar
              value={searchQuery}
              onChange={setSearchQuery}
              onClear={() => setSearchQuery('')}
              matchCount={totalOffers}
              autoFocus={isMobileSearchOpen}
            />
          </div>

          {/* Sort Selector */}
          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="sort-select" className="text-xs font-semibold text-slate-500 whitespace-nowrap">
              Ordina:
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="text-xs font-medium bg-white border border-slate-300 rounded-lg px-2.5 py-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer shadow-xs"
            >
              <option value="discountDesc">Sconto più alto (% decrescente)</option>
              <option value="priceAsc">Prezzo più basso (€ crescente)</option>
              <option value="priceDesc">Prezzo più alto (€ decrescente)</option>
            </select>
          </div>
        </section>

        {/* Category Filter Pills */}
        <section>
          <CategoryFilters
            selectedCategory={selectedCategory}
            onToggleCategory={handleToggleCategory}
            categoryCounts={facets?.categories || {}}
            activeFilterCount={activeFilterCount}
            onClearFilters={handleClearFilters}
          />
        </section>

        {/* Offer Grid or Empty State */}
        <section aria-label="Offerte promozionali">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-80 animate-pulse flex flex-col gap-3">
                  <div className="bg-slate-200 rounded-lg aspect-square w-full" />
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                  <div className="mt-auto h-6 bg-slate-200 rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              searchQuery={searchQuery}
              selectedCategory={selectedCategory}
              selectedStoreName={activeStore ? activeStore.name : null}
              onClearFilters={handleClearFilters}
              onApplyQuery={(term) => setSearchQuery(term)}
            />
          ) : (
            <OfferGrid
              offers={offers}
              loading={loading}
              allFlyers={flyers}
              onOpenFlyer={(item) => {
                const storeFlyer = flyers.find((f) => f.storeId === item?.storeId) || flyers[0] || item;
                if (storeFlyer) setActiveFlyer(storeFlyer);
              }}
              onResetFilters={handleClearFilters}
            />
          )}
        </section>
      </main>

      {/* Modal Flyer Viewer */}
      {activeFlyer && (
        <FlyerModal
          flyer={activeFlyer}
          isOpen={Boolean(activeFlyer)}
          onClose={() => setActiveFlyer(null)}
        />
      )}

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <p className="font-medium text-slate-700">
            🌿 Basilico — Volantini & Promozioni Supermercati Rapallo (16035 GE)
          </p>
          <p className="text-slate-400">
            Basko • Coop • Gulliver • Penny • Ekom • Eurospin • Despar • Tigotà • PiùMe • Kasanova
          </p>
          <p className="text-[11px] text-slate-400">
            Sorgente dati: <span className="font-semibold text-slate-600">{(status.dataSource || 'live').toUpperCase()}</span> • Supermercati attivi: {stores.length}
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
