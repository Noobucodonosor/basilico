import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import RoomNavigation, { BASILICO_ROOMS } from './components/RoomNavigation.jsx';
import StoreSwitcher from './components/StoreSwitcher.jsx';
import SearchBar from './components/SearchBar.jsx';
import CategoryFilters from './components/CategoryFilters.jsx';
import OfferGrid from './components/OfferGrid.jsx';
import EmptyState from './components/EmptyState.jsx';
import FlyerModal from './components/FlyerModal.jsx';
import SyncStatusModal from './components/SyncStatusModal.jsx';
import CounterPriceModal from './components/CounterPriceModal.jsx';
import OfflineNotice from './components/OfflineNotice.jsx';
import CreaExplorerView from './components/crea/CreaExplorerView.jsx';
import PantryAndReceiptsView from './components/pantry/PantryAndReceiptsView.jsx';
import KitchenCareView from './components/kitchen/KitchenCareView.jsx';
import RecipesAndRestaurantsView from './components/recipes/RecipesAndRestaurantsView.jsx';
import { useSupermarketData } from './hooks/useSupermarketData.js';

const DOMAIN_PILLS = [
  { id: null, label: 'Tutti i 5 Domini', icon: '🌐' },
  { id: 'food_human', label: 'Alimentari & Bevande', icon: '🥩' },
  { id: 'home_cleaning', label: 'Chimica & Cura Casa', icon: '🧼' },
  { id: 'kitchen_cookware', label: 'Pentole & Utensili', icon: '🍳' },
  { id: 'personal_care', label: 'Igiene Persona', icon: '🧴' },
  { id: 'pet_care', label: 'Animali (Pet)', icon: '🐾' }
];

export function App() {
  // 1. Initial State from URL
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialRoom = initialParams.get('room') || 'room-1-negozi';
  const initialStore = initialParams.get('store') || null;
  const initialDomain = initialParams.get('domain') || null;
  const initialQuery = initialParams.get('q') || '';
  const initialCategory = initialParams.get('category') || null;
  const initialSort = initialParams.get('sortBy') || 'discountDesc';

  const [activeRoom, setActiveRoom] = useState(initialRoom);
  const [selectedStoreId, setSelectedStoreId] = useState(initialStore);
  const [selectedDomain, setSelectedDomain] = useState(initialDomain);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialSort);
  const [hideIncompatible, setHideIncompatible] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('dany');
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [localShops, setLocalShops] = useState([]);
  const [selectedCreaFoodId, setSelectedCreaFoodId] = useState(null);

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeFlyer, setActiveFlyer] = useState(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);

  // Load user profiles and local shops
  useEffect(() => {
    fetch('/api/profiles')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.profiles)) {
          setProfiles(data.profiles);
          if (data.activeProfileId) setActiveProfileId(data.activeProfileId);
        }
      })
      .catch(() => {});

    fetch('/api/stores?includeLocalShops=true')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.stores)) {
          setLocalShops(data.stores.filter((s) => s.dataChannel === 'receipt_observed'));
        }
      })
      .catch(() => {});
  }, []);

  const handleChangeProfile = useCallback(async (newProfileId) => {
    setActiveProfileId(newProfileId);
    try {
      await fetch('/api/profiles/active', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId: newProfileId })
      });
    } catch (_) {
      // Non-fatal
    }
  }, []);

  // 2. Data Hook
  const {
    stores,
    offers,
    flyers,
    facets,
    status,
    loading,
    totalOffers,
    syncData,
    refetchOffers
  } = useSupermarketData({
    storeId: selectedStoreId,
    domain: selectedDomain,
    profileId: activeProfileId,
    hideIncompatible,
    q: searchQuery,
    category: selectedCategory,
    sortBy: sortBy
  });

  // 3. Keep URL search params synchronized without page reload
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams();
    if (activeRoom && activeRoom !== 'room-1-negozi') params.set('room', activeRoom);
    if (selectedStoreId) params.set('store', selectedStoreId);
    if (selectedDomain) params.set('domain', selectedDomain);
    if (searchQuery.trim()) params.set('q', searchQuery.trim());
    if (selectedCategory) params.set('category', selectedCategory);
    if (sortBy && sortBy !== 'discountDesc') params.set('sortBy', sortBy);

    const newRelativePath = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newRelativePath);
  }, [activeRoom, selectedStoreId, selectedDomain, searchQuery, selectedCategory, sortBy]);

  // 4. Resolve Active Store display name
  const activeStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  const activeStoreName = activeStore ? activeStore.name : 'Tutti i Supermercati';

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || null;
  }, [profiles, activeProfileId]);

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
    if (selectedDomain !== null) count++;
    return count;
  }, [searchQuery, selectedCategory, selectedDomain]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedDomain(null);
    setHideIncompatible(false);
  }, []);

  const handleToggleCategory = useCallback((cat) => {
    setSelectedCategory((prev) => (prev === cat ? null : cat));
  }, []);

  const runSyncWithModal = useCallback(async (deep = false) => {
    setIsRefreshing(true);
    setIsSyncModalOpen(true);
    setSyncProgress({
      active: true,
      mode: deep ? 'deep' : 'quick',
      phase: 'starting',
      title: deep ? 'Deep Sync dei 14 Negozi di Rapallo in corso...' : 'Aggiornamento Rapido in corso...',
      currentStore: deep ? 'Avvio scansione per-insegna su Rapallo (16035)...' : 'Connessione al server di Rapallo...',
      completedStores: 0,
      totalStores: stores.length || 14,
      flyersFound: flyers.length || 0,
      offersFound: totalOffers || 0,
      percent: 8,
      logs: [
        `[${new Date().toLocaleTimeString('it-IT')}] ${
          deep
            ? 'Avvio Deep Sync approfondito su tutti i 14 punti vendita di Rapallo...'
            : 'Avvio controllo rapido volantini e stato online di Rapallo...'
        }`
      ]
    });

    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/sync/progress');
        if (res.ok) {
          const prog = await res.json();
          if (prog && prog.phase !== 'idle') {
            setSyncProgress(prog);
          }
        }
      } catch (_) {
        // Ignore transient polling error
      }
    }, 350);

    try {
      await syncData(true, deep);
      try {
        const finalRes = await fetch('/api/sync/progress');
        if (finalRes.ok) {
          const finalProg = await finalRes.json();
          setSyncProgress({ ...finalProg, active: false, percent: 100 });
        } else {
          setSyncProgress((prev) => ({ ...(prev || {}), active: false, percent: 100 }));
        }
      } catch (_) {
        setSyncProgress((prev) => ({ ...(prev || {}), active: false, percent: 100 }));
      }
    } finally {
      clearInterval(pollInterval);
      setIsRefreshing(false);
      setIsBannerDismissed(false);
    }
  }, [syncData, stores.length, flyers.length, totalOffers]);

  const handleRefresh = useCallback(async () => {
    await runSyncWithModal(false);
  }, [runSyncWithModal]);

  const handleDeepSync = useCallback(async () => {
    await runSyncWithModal(true);
  }, [runSyncWithModal]);

  const handleOpenFlyer = useCallback((targetFlyer) => {
    if (targetFlyer) {
      setActiveFlyer(targetFlyer);
    }
  }, []);

  const currentRoomMeta = BASILICO_ROOMS.find((r) => r.id === activeRoom) || BASILICO_ROOMS[0];

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
        onDeepSync={handleDeepSync}
        isRefreshing={isRefreshing}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onChangeProfile={handleChangeProfile}
        onOpenCounterPriceModal={() => setIsCounterModalOpen(true)}
      />

      {/* 6 Main Rooms Navigation Bar (ADR-0007..0012) */}
      <RoomNavigation activeRoom={activeRoom} onSelectRoom={setActiveRoom} />

      {activeRoom === 'room-1-negozi' ? (
        <>
          {/* Store Switcher Tab Bar */}
          <StoreSwitcher
            stores={stores}
            selectedStoreId={selectedStoreId}
            onSelectStore={(id) => setSelectedStoreId(id)}
          />

          {/* Main Content Area: Cap at max-w-7xl (1280px, Tier 2 test 10.7) */}
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
            {/* Active Dietary Profile & Local Shops Banner */}
            {activeProfile && (
              <section className="bg-emerald-900/95 text-white rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <span className="text-xl" aria-hidden="true">🛡️</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-extrabold uppercase tracking-wider bg-emerald-700 px-2 py-0.5 rounded">
                        Profilo: {activeProfile.name}
                      </span>
                      {activeProfile.excludedIngredients?.length > 0 && (
                        <span className="text-[11px] text-emerald-100">
                          Esclusioni attive: {activeProfile.excludedIngredients.slice(0, 5).join(', ')}
                          {activeProfile.excludedIngredients.length > 5 ? ` (+${activeProfile.excludedIngredients.length - 5})` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-emerald-200 mt-0.5">
                      {activeProfile.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-100 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideIncompatible}
                      onChange={(e) => setHideIncompatible(e.target.checked)}
                      className="rounded border-emerald-400 text-emerald-500 focus:ring-emerald-400"
                    />
                    <span>Nascondi prodotti esclusi</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsCounterModalOpen(true)}
                    className="sm:hidden px-2.5 py-1 text-xs font-bold bg-amber-400 text-slate-900 rounded-lg"
                  >
                    🏷️ Prezzo al banco
                  </button>
                </div>
              </section>
            )}

            {/* 5 Closed Product Domains Selector (ADR-0007) */}
            <section className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Domini merceologici">
              {DOMAIN_PILLS.map((dom) => {
                const isSelected = selectedDomain === dom.id;
                const count = dom.id ? facets?.domains?.[dom.id] : totalOffers;
                return (
                  <button
                    key={dom.id || 'all'}
                    type="button"
                    onClick={() => setSelectedDomain(isSelected ? null : dom.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition-all whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40'
                    }`}
                  >
                    <span aria-hidden="true">{dom.icon}</span>
                    <span>{dom.label}</span>
                    {count !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-slate-700 text-slate-100' : 'bg-slate-100 text-slate-600'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>

            {/* Active Store Promo & Flyer Banner */}
            {activeStore && (
              <section className="bg-white rounded-xl border border-slate-200/80 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-slate-900">{activeStore.name}</h2>
                    {activeStore.isRegionalServing && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                        Servizio Rapallo & Tigullio
                      </span>
                    )}
                    {activeStore.loyaltyCard && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        💳 {activeStore.loyaltyCard}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 truncate max-w-md">
                    {activeStore.address}
                    {activeStore.logistics ? ` • 🚶 ${activeStore.logistics.walkMinutesFromCenter} min a piedi` : ''}
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
                  <option value="pricePerKgAsc">Prezzo €/kg edibile più basso</option>
                  <option value="priceAsc">Prezzo confezione più basso (€ crescente)</option>
                  <option value="priceDesc">Prezzo confezione più alto (€ decrescente)</option>
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
                  onOpenCreaFood={(creaId) => {
                    setSelectedCreaFoodId(creaId);
                    setActiveRoom('room-2-crea');
                  }}
                  onOpenFlyer={(item) => {
                    const storeFlyer = flyers.find((f) => f.storeId === item?.storeId) || flyers[0] || item;
                    if (storeFlyer) setActiveFlyer(storeFlyer);
                  }}
                  onResetFilters={handleClearFilters}
                />
              )}
            </section>

            {/* Local Observed Shops Directory in Rapallo */}
            {localShops.length > 0 && (
              <section className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">
                      🐟 Botteghe Storiche, Mercato & Casalinghi Osservati a Rapallo
                    </h3>
                    <p className="text-xs text-slate-500">
                      Canale <code className="font-mono text-emerald-700">receipt_observed</code>: alimentato dai tuoi scontrini reali e dai prezzi visti al banco (zero finti volantini).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsCounterModalOpen(true)}
                    className="px-3 py-1.5 text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white rounded-lg cursor-pointer shrink-0"
                  >
                    + Prezzo visto al banco
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {localShops.map((shop) => (
                    <div key={shop.id} className="p-2.5 rounded-lg border border-slate-200 bg-slate-50/70 text-xs">
                      <div className="font-bold text-slate-800 truncate">{shop.name}</div>
                      <div className="text-[11px] text-slate-500 truncate">{shop.address}</div>
                      <div className="mt-1 inline-block text-[10px] font-semibold bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded">
                        Scontrini & Banco
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </main>
        </>
      ) : activeRoom === 'room-2-crea' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <CreaExplorerView
            activeProfileId={activeProfileId}
            initialFoodId={selectedCreaFoodId}
            onNavigateToOfferStore={(storeId, productTitle) => {
              setSelectedStoreId(storeId || null);
              setSearchQuery(productTitle || '');
              setActiveRoom('room-1-negozi');
            }}
          />
        </main>
      ) : activeRoom === 'room-3-ricette' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <RecipesAndRestaurantsView
            activeProfileId={activeProfileId}
            onOpenCreaFood={(creaId) => {
              setSelectedCreaFoodId(creaId);
              setActiveRoom('room-2-crea');
            }}
          />
        </main>
      ) : activeRoom === 'room-4-cucina' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KitchenCareView
            onNavigateToStoreDomain={(domainId) => {
              setSelectedDomain(domainId);
              setSelectedStoreId(null);
              setActiveRoom('room-1-negozi');
            }}
          />
        </main>
      ) : activeRoom === 'room-5-dispensa' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PantryAndReceiptsView stores={stores} />
        </main>
      ) : (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{currentRoomMeta.icon}</span>
              <div>
                <h2 className="text-xl font-extrabold text-slate-900">{currentRoomMeta.fullTitle}</h2>
                <p className="text-sm text-slate-500">{currentRoomMeta.subtitle}</p>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* Modal Flyer Viewer */}
      {activeFlyer && (
        <FlyerModal
          flyer={activeFlyer}
          isOpen={Boolean(activeFlyer)}
          onClose={() => setActiveFlyer(null)}
        />
      )}

      {/* Counter Price Observation Modal */}
      <CounterPriceModal
        isOpen={isCounterModalOpen}
        onClose={() => setIsCounterModalOpen(false)}
        stores={stores}
        onSaved={() => refetchOffers()}
      />

      {/* Informative Operation Status Dialog (ADR-0005) */}
      <SyncStatusModal
        isOpen={isSyncModalOpen}
        progress={syncProgress}
        onClose={() => setIsSyncModalOpen(false)}
      />

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-2">
          <p className="font-medium text-slate-700">
            🌿 Basilico — Sistema Domestico, Nutrizionale (CREA), Gastronomico & Offerte Rapallo (16035 GE)
          </p>
          <p className="text-slate-400">
            Basko • Coop • Gulliver • Carrefour Market & Express • Ekom • Penny • Eurospin • Despar • DPiù • Tigotà • PiùMe • Unieuro • Arcaplanet + Botteghe Locali
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
