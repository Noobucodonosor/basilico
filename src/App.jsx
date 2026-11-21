import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import RoomNavigation, {
  BASILICO_ROOMS,
  BASILICO_PHASES,
  VALID_PHASE_IDS,
  CausalPhaseNavigation,
  getPhaseForRoom
} from './components/RoomNavigation.jsx';
import OfflineNotice from './components/OfflineNotice.jsx';
import CycleOverviewView from './components/cycle/CycleOverviewView.jsx';
import RapalloMarketView from './components/market/RapalloMarketView.jsx';
import { useSupermarketData } from './hooks/useSupermarketData.js';

const FlyerModal = React.lazy(() => import('./components/FlyerModal.jsx'));
const SyncStatusModal = React.lazy(() => import('./components/SyncStatusModal.jsx'));
const CounterPriceModal = React.lazy(() => import('./components/CounterPriceModal.jsx'));
const CreaExplorerView = React.lazy(() => import('./components/crea/CreaExplorerView.jsx'));
const PantryAndReceiptsView = React.lazy(() => import('./components/pantry/PantryAndReceiptsView.jsx'));
const KitchenCareView = React.lazy(() => import('./components/kitchen/KitchenCareView.jsx'));
const RecipesAndRestaurantsView = React.lazy(() => import('./components/recipes/RecipesAndRestaurantsView.jsx'));
const PlannerAndShoppingView = React.lazy(() => import('./components/planner/PlannerAndShoppingView.jsx'));
const MaestroDrawer = React.lazy(() => import('./components/maestro/MaestroDrawer.jsx'));
const HomeChemistryView = React.lazy(() => import('./components/home/HomeChemistryView.jsx'));
const CulinaryAcademyPanel = React.lazy(() => import('./components/academy/CulinaryAcademyPanel.jsx'));
const NutritionCoachPanel = React.lazy(() => import('./components/crea/NutritionCoachPanel.jsx'));

const isViteDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const DevAgentation = isViteDev
  ? React.lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null;

const DOMAIN_ALLOWED_CATEGORIES = {
  food_human: [
    'Frutta e Verdura',
    'Carne e Pesce',
    'Latticini e Formaggi',
    'Pane e Pasticceria',
    'Dispensa e Pasta',
    'Colazione e Dolci',
    'Acqua e Bevande',
    'Surgelati'
  ],
  home_cleaning: ['Cura Casa e Bucato'],
  kitchen_cookware: ['Pentole, Cucina ed Elettrodomestici'],
  personal_care: ['Cura Persona e Igiene'],
  pet_care: ['Animali Domestici'],
  bazar_seasonal: [
    'Giocattoli, Natale e Tempo Libero',
    'Tessile, Abbigliamento e Bazar Casa'
  ]
};

const VALID_ROOM_IDS = new Set(BASILICO_ROOMS.map((r) => r.id));
const VALID_PHASE1_PANELS = new Set(['crea', 'academy', 'nutrition']);
const VALID_ACADEMY_SECTIONS = new Set(['skills', 'sos', 'ratios', 'improvise']);

function normalizeRoomId(roomId) {
  return roomId && VALID_ROOM_IDS.has(roomId) ? roomId : 'room-1-negozi';
}

function getDefaultRoomForPhase(phaseId) {
  const phase = BASILICO_PHASES.find((p) => p.id === phaseId);
  return phase?.rooms?.[0]?.id || 'room-1-negozi';
}

/**
 * Resolves the initial 4-Phase Causal Cycle state from the URL (ADR-0016 / TASK-CICLO-01):
 *  - `?room=room-X-...`    -> matching phase + exact room (deep-link preserved)
 *  - `?phase=1|2|3|4`      -> phase-1..phase-4 + its default room
 *  - legacy `?rhythm=...`  -> mapped cleanly to the corresponding phase
 *  - bare `/`              -> 'overview' (Panoramica sobria del ciclo reale)
 */
function resolveInitialCycleState(params) {
  const roomParam = params.get('room');
  if (roomParam && VALID_ROOM_IDS.has(roomParam)) {
    return {
      phase: getPhaseForRoom(roomParam),
      room: roomParam,
      phase1Panel: 'crea'
    };
  }

  const phaseParam = params.get('phase');
  if (phaseParam) {
    const candidate = phaseParam.startsWith('phase-') ? phaseParam : `phase-${phaseParam}`;
    if (VALID_PHASE_IDS.has(candidate) && candidate !== 'overview') {
      return {
        phase: candidate,
        room: getDefaultRoomForPhase(candidate),
        phase1Panel: 'crea'
      };
    }
  }

  const legacyRhythm = params.get('rhythm');
  if (legacyRhythm === 'regia') {
    return { phase: 'phase-2', room: 'room-6-pianificatore', phase1Panel: 'crea' };
  }
  if (legacyRhythm === 'oggi') {
    return { phase: 'phase-4', room: 'room-3-ricette', phase1Panel: 'crea' };
  }
  if (legacyRhythm === 'atlante') {
    const sec = params.get('section');
    return {
      phase: 'phase-1',
      room: 'room-2-crea',
      phase1Panel: VALID_PHASE1_PANELS.has(sec) ? sec : 'crea'
    };
  }

  return {
    phase: 'overview',
    room: 'room-1-negozi',
    phase1Panel: 'crea'
  };
}

export function App() {
  // 1. Initial State from URL
  const initialParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const initialCycle = resolveInitialCycleState(initialParams);
  const initialStore = initialParams.get('store') || null;
  const initialDomain = initialParams.get('domain') || null;
  const initialQuery = initialParams.get('q') || '';
  const initialCategory = initialParams.get('category') || null;
  const initialSort = initialParams.get('sortBy') || 'discountDesc';

  // ADR-0016: Single 4-Phase Causal Cycle (`overview` | `phase-1`..`phase-4`)
  const [activePhase, setActivePhase] = useState(initialCycle.phase);
  const [phase1Panel, setPhase1Panel] = useState(initialCycle.phase1Panel);
  const [academySection, setAcademySection] = useState('skills');
  const [rhythmPreset, setRhythmPreset] = useState('feriale');
  const [isMaestroOpen, setIsMaestroOpen] = useState(false);
  const [maestroPrompt, setMaestroPrompt] = useState('');

  const [activeRoom, setActiveRoomState] = useState(initialCycle.room);
  const [selectedStoreId, setSelectedStoreId] = useState(initialStore);
  const [selectedDomain, setSelectedDomain] = useState(initialDomain);
  const [searchQuery, setSearchQuery] = useState(initialQuery);
  const [selectedCategory, setSelectedCategory] = useState(initialCategory);
  const [sortBy, setSortBy] = useState(initialSort);
  const [hideIncompatible, setHideIncompatible] = useState(false);

  const [profiles, setProfiles] = useState([]);
  const [activeProfileId, setActiveProfileId] = useState('dany');
  const [profilesReady, setProfilesReady] = useState(false);
  const [isCounterModalOpen, setIsCounterModalOpen] = useState(false);
  const [counterDefaultStoreId, setCounterDefaultStoreId] = useState('');
  const [localShops, setLocalShops] = useState([]);
  const [counterObservations, setCounterObservations] = useState([]);
  const [selectedCreaFoodId, setSelectedCreaFoodId] = useState(null);
  const [initialRecipeSearch, setInitialRecipeSearch] = useState('');

  const setActiveRoom = useCallback((nextRoom) => {
    const normalized = normalizeRoomId(nextRoom);
    setActivePhase(getPhaseForRoom(normalized));
    if (normalized === 'room-2-crea') {
      setPhase1Panel('crea');
    }
    setActiveRoomState((prev) => {
      if (prev === 'room-2-crea' && normalized !== 'room-2-crea') {
        setSelectedCreaFoodId(null);
      }
      if (prev === 'room-3-ricette' && normalized !== 'room-3-ricette') {
        setInitialRecipeSearch('');
      }
      if (normalized !== 'room-1-negozi') {
        setIsMobileSearchOpen(false);
      }
      return normalized;
    });
  }, []);

  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);

  // ---- ADR-0016 Navigation handlers across the 4 Causal Cycle Phases & 7 Rooms ----
  const scrollToTop = useCallback(() => {
    if (typeof window !== 'undefined' && typeof window.scrollTo === 'function') {
      try {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (_) {}
    }
  }, []);

  const handleSelectPhase = useCallback(
    (nextPhase) => {
      const phaseId = VALID_PHASE_IDS.has(nextPhase) ? nextPhase : 'overview';
      setActivePhase(phaseId);
      setInitialRecipeSearch('');
      if (phaseId === 'overview') {
        setIsMobileSearchOpen(false);
      } else {
        const targetRoom = getDefaultRoomForPhase(phaseId);
        setActiveRoomState(targetRoom);
        if (phaseId === 'phase-1') setPhase1Panel('crea');
        if (targetRoom !== 'room-1-negozi') setIsMobileSearchOpen(false);
      }
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleNavigateRoom = useCallback(
    (roomId) => {
      setInitialRecipeSearch('');
      setActiveRoom(roomId);
      scrollToTop();
    },
    [setActiveRoom, scrollToTop]
  );

  const handleOpenAcademy = useCallback(
    (section = 'skills') => {
      setAcademySection(VALID_ACADEMY_SECTIONS.has(section) ? section : 'skills');
      setActivePhase('phase-1');
      setActiveRoomState('room-2-crea');
      setPhase1Panel('academy');
      scrollToTop();
    },
    [scrollToTop]
  );

  const handleOpenNutritionCoach = useCallback(() => {
    setActivePhase('phase-1');
    setActiveRoomState('room-2-crea');
    setPhase1Panel('nutrition');
    scrollToTop();
  }, [scrollToTop]);

  const handleCookWithIngredient = useCallback(
    (ingredientName = '') => {
      const cleaned = String(ingredientName || '')
        .split(/[,(]/)[0]
        .trim();
      setInitialRecipeSearch(cleaned);
      setActiveRoom('room-3-ricette');
      scrollToTop();
    },
    [setActiveRoom, scrollToTop]
  );

  const handleSearchMarketOffer = useCallback(
    (query = '') => {
      const cleaned = String(query || '')
        .split(/[,(]/)[0]
        .trim();
      setSelectedStoreId(null);
      setSelectedDomain(null);
      setSelectedCategory(null);
      setSearchQuery(cleaned);
      setSelectedCreaFoodId(null);
      setActiveRoom('room-1-negozi');
      scrollToTop();
    },
    [setActiveRoom, scrollToTop]
  );

  const handleOpenMaestro = useCallback((prompt = '') => {
    setMaestroPrompt(typeof prompt === 'string' ? prompt : '');
    setIsMaestroOpen(true);
  }, []);

  const handleCloseMaestro = useCallback(() => {
    setIsMaestroOpen(false);
    setMaestroPrompt('');
  }, []);

  // Hydrate persisted rhythm preset (Sera Stanca / Feriale / Weekend) from the economics engine
  useEffect(() => {
    fetch('/api/maestro/calibration')
      .then((r) => (r.ok ? r.json() : null))
      .then((cal) => {
        if (cal?.activeRhythmPreset) setRhythmPreset(cal.activeRhythmPreset);
      })
      .catch(() => {});
  }, []);

  const isRoomsView = activePhase !== 'overview' && !(activePhase === 'phase-1' && phase1Panel !== 'crea');
  const [activeFlyer, setActiveFlyer] = useState(null);
  const [isBannerDismissed, setIsBannerDismissed] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [syncProgress, setSyncProgress] = useState(null);
  const [shoppingCount, setShoppingCount] = useState(0);
  const [shoppingToast, setShoppingToast] = useState('');

  const refreshShoppingCount = useCallback(() => {
    fetch('/api/shopping-list')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.subtotals?.totalItemsCount !== undefined) {
          setShoppingCount(data.subtotals.totalItemsCount);
        }
      })
      .catch(() => {});
  }, []);

  const handleAddToShoppingList = useCallback(async (payload) => {
    try {
      const res = await fetch('/api/shopping-list/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
      });
      if (res.ok) {
        const data = await res.json();
        const count = data?.subtotals?.totalItemsCount ?? 0;
        setShoppingCount(count);
        setShoppingToast(`🛒 Aggiunto alla Lista Spesa (${count} art.): ${payload?.name || 'Articolo'}`);
        setTimeout(() => setShoppingToast(''), 2600);
      }
    } catch (_) {
      // Non-fatal
    }
  }, []);

  const refreshCounterObservations = useCallback(() => {
    fetch('/api/prices/history?channel=counter_observed')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (Array.isArray(data?.observations)) {
          setCounterObservations(data.observations.slice(0, 12));
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshShoppingCount();
    refreshCounterObservations();
  }, [activeRoom, refreshShoppingCount, refreshCounterObservations]);

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
      .catch(() => {})
      .finally(() => setProfilesReady(true));

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
    loadingMore,
    totalOffers,
    hasMoreOffers,
    loadMoreOffers,
    syncData,
    refetchOffers
  } = useSupermarketData({
    ready: profilesReady,
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
    if (activePhase !== 'overview') {
      const phaseNum = activePhase.replace('phase-', '');
      params.set('phase', phaseNum);
      if (activePhase === 'phase-1' && phase1Panel !== 'crea') {
        params.set('section', phase1Panel);
      } else if (activeRoom) {
        params.set('room', activeRoom);
      }
      if (activeRoom === 'room-1-negozi') {
        if (selectedStoreId) params.set('store', selectedStoreId);
        if (selectedDomain) params.set('domain', selectedDomain);
        if (searchQuery.trim()) params.set('q', searchQuery.trim());
        if (selectedCategory) params.set('category', selectedCategory);
        if (sortBy && sortBy !== 'discountDesc') params.set('sortBy', sortBy);
      }
    }

    const newRelativePath = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, '', newRelativePath);
  }, [activePhase, phase1Panel, activeRoom, selectedStoreId, selectedDomain, searchQuery, selectedCategory, sortBy]);

  // 4. Resolve Active Store display name
  const activeStore = useMemo(() => {
    return stores.find((s) => s.id === selectedStoreId) || null;
  }, [stores, selectedStoreId]);

  const activeStoreName = activeStore ? activeStore.name : 'Tutti i Supermercati';

  const activeProfile = useMemo(() => {
    return profiles.find((p) => p.id === activeProfileId) || null;
  }, [profiles, activeProfileId]);

  // All active flyers for selected store (supports multi-flyer stores: 1st, 2nd, 3rd flyer)
  const currentStoreFlyers = useMemo(() => {
    if (!selectedStoreId) return [];
    return flyers.filter(
      (f) =>
        f.storeId === selectedStoreId ||
        (Array.isArray(f.storeIds) && f.storeIds.includes(selectedStoreId))
    );
  }, [flyers, selectedStoreId]);

  const handleOpenOfferFlyer = useCallback(
    (item) => {
      const exactFlyer =
        (item?.flyerId && flyers.find((f) => String(f.id) === String(item.flyerId))) ||
        (item?.storeId &&
          flyers.find(
            (f) =>
              f.storeId === item.storeId ||
              (Array.isArray(f.storeIds) && f.storeIds.includes(item.storeId))
          )) ||
        null;
      if (exactFlyer) {
        setActiveFlyer({
          ...exactFlyer,
          initialPage: Number(item?.pageNumber) >= 1 ? Number(item.pageNumber) : 1,
          highlightOfferId: item?.id || null
        });
      }
    },
    [flyers]
  );

  // 5. Active filter count calculation (Contract 12.4)
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchQuery.trim().length > 0) count++;
    if (selectedCategory) count++;
    if (selectedDomain) count++;
    return count;
  }, [searchQuery, selectedCategory, selectedDomain]);

  const handleClearFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedCategory(null);
    setSelectedDomain(null);
    setHideIncompatible(false);
  }, []);

  const handleSelectDomain = useCallback((nextDomain) => {
    setSelectedDomain(nextDomain);
    if (nextDomain && selectedCategory) {
      const allowed = DOMAIN_ALLOWED_CATEGORIES[nextDomain] || [];
      if (!allowed.includes(selectedCategory)) {
        setSelectedCategory(null);
      }
    }
  }, [selectedCategory]);

  const visibleCategoriesForDomain = useMemo(() => {
    if (!selectedDomain) return undefined;
    return DOMAIN_ALLOWED_CATEGORIES[selectedDomain] || undefined;
  }, [selectedDomain]);

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

  return (
    <div className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#141A17] font-sans selection:bg-emerald-100 selection:text-[#14492D]">
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
        activeRoom={isRoomsView ? activeRoom : activePhase}
        activeStoreName={activeStoreName}
        isMobileSearchOpen={isMobileSearchOpen}
        onToggleMobileSearch={() => setIsMobileSearchOpen((prev) => !prev)}
        onRefresh={handleRefresh}
        onDeepSync={handleDeepSync}
        isRefreshing={isRefreshing}
        profiles={profiles}
        activeProfileId={activeProfileId}
        onChangeProfile={handleChangeProfile}
        onOpenCounterPriceModal={() => {
          setCounterDefaultStoreId('');
          setIsCounterModalOpen(true);
        }}
        shoppingCount={shoppingCount}
        onOpenShoppingList={() => handleNavigateRoom('room-6-pianificatore')}
        onOpenMaestro={handleOpenMaestro}
        onGoHome={() => handleSelectPhase('overview')}
        showCounterPrice={activePhase === 'phase-2' || activePhase === 'phase-3'}
      />

      {shoppingToast && (
        <div className="bg-[#1B5E3A] text-white text-xs font-bold py-2 px-4 text-center shadow-xs">
          {shoppingToast}
        </div>
      )}

      {/* ADR-0016: Single linear 4-Phase Causal Cycle Bar + quick jump to 7 Rooms */}
      <CausalPhaseNavigation
        activePhase={activePhase}
        onSelectPhase={handleSelectPhase}
        activeRoom={activePhase !== 'overview' ? activeRoom : ''}
        onSelectRoom={handleNavigateRoom}
      />

      {activePhase === 'overview' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6">
          <CycleOverviewView
            status={status}
            activeProfile={activeProfile}
            shoppingCount={shoppingCount}
            onSelectPhase={handleSelectPhase}
            onNavigateRoom={handleNavigateRoom}
            onOpenMaestro={handleOpenMaestro}
            onTriggerSync={handleDeepSync}
            onCookWithIngredient={handleCookWithIngredient}
          />
        </main>
      ) : (
        <>
          {/* Phase-scoped sub-navigation (only rooms/panels belonging to the active phase) */}
          {activePhase === 'phase-1' ? (
            <section
              aria-label="Sezioni Fase 1: Sapere & Obiettivi"
              className="bg-white border-b border-[#E5E2DA]"
              data-testid="phase-sub-navigation"
            >
              <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                {[
                  { id: 'crea', icon: '🔬', label: 'Scienza & CREA' },
                  { id: 'nutrition', icon: '🥗', label: 'Coach Nutrizionale' },
                  { id: 'academy', icon: '👨‍🍳', label: 'Scuola Culinaria & SOS' }
                ].map((sec) => {
                  const isActive = phase1Panel === sec.id;
                  return (
                    <button
                      key={sec.id}
                      type="button"
                      onClick={() => {
                        setPhase1Panel(sec.id);
                        if (sec.id === 'academy') setAcademySection('skills');
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap taste-btn cursor-pointer shrink-0 ${
                        isActive
                          ? 'bg-[#1B5E3A] text-white shadow-xs'
                          : 'text-[#4A524C] hover:text-[#141A17] hover:bg-[#F3F1EC]'
                      }`}
                    >
                      <span aria-hidden="true">{sec.icon}</span>
                      <span>{sec.label}</span>
                    </button>
                  );
                })}
              </div>
            </section>
          ) : (
            <RoomNavigation
              activeRoom={activeRoom}
              onSelectRoom={setActiveRoom}
              rooms={BASILICO_ROOMS.filter((r) => r.phaseId === activePhase)}
            />
          )}

          {activePhase === 'phase-1' && phase1Panel === 'academy' ? (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <React.Suspense fallback={<div className="p-6 text-xs text-[#575E58]">Caricamento Scuola Culinaria…</div>}>
                <CulinaryAcademyPanel
                  key={`academy-${academySection}`}
                  activeProfileId={activeProfileId}
                  onNavigateRoom={handleNavigateRoom}
                  onOpenMaestro={handleOpenMaestro}
                  initialSection={academySection}
                />
              </React.Suspense>
            </main>
          ) : activePhase === 'phase-1' && phase1Panel === 'nutrition' ? (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <React.Suspense fallback={<div className="p-6 text-xs text-[#575E58]">Caricamento Coach Nutrizionale…</div>}>
                <NutritionCoachPanel
                  activeProfileId={activeProfileId}
                  onNavigateRoom={handleNavigateRoom}
                  onOpenMaestro={handleOpenMaestro}
                />
              </React.Suspense>
            </main>
          ) : (
            <>

      {activeRoom === 'room-1-negozi' ? (
        <RapalloMarketView
          stores={stores}
          selectedStoreId={selectedStoreId}
          onSelectStore={(id) => setSelectedStoreId(id)}
          activeProfile={activeProfile}
          hideIncompatible={hideIncompatible}
          onChangeHideIncompatible={setHideIncompatible}
          selectedDomain={selectedDomain}
          onSelectDomain={handleSelectDomain}
          facets={facets}
          totalOffers={totalOffers}
          activeStore={activeStore}
          currentStoreFlyers={currentStoreFlyers}
          onOpenFlyer={handleOpenFlyer}
          isMobileSearchOpen={isMobileSearchOpen}
          searchQuery={searchQuery}
          onChangeSearchQuery={setSearchQuery}
          sortBy={sortBy}
          onChangeSortBy={setSortBy}
          visibleCategoriesForDomain={visibleCategoriesForDomain}
          selectedCategory={selectedCategory}
          onToggleCategory={handleToggleCategory}
          activeFilterCount={activeFilterCount}
          onClearFilters={handleClearFilters}
          loading={loading}
          offers={offers}
          hasMoreOffers={hasMoreOffers}
          loadingMore={loadingMore}
          onLoadMore={loadMoreOffers}
          onAddToShoppingList={handleAddToShoppingList}
          onOpenCreaFood={(creaId) => {
            setSelectedCreaFoodId(creaId);
            setActiveRoom('room-2-crea');
          }}
          onOpenOfferFlyer={handleOpenOfferFlyer}
          localShops={localShops}
          counterObservations={counterObservations}
          onOpenCounterModal={(storeId) => {
            setCounterDefaultStoreId(storeId || '');
            setIsCounterModalOpen(true);
          }}
        />
      ) : !profilesReady ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-[#575E58]">
          Sincronizzazione profilo attivo in corso...
        </main>
      ) : (
        <React.Suspense fallback={<main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-xs text-[#575E58]">Caricamento sezione…</main>}>
          {activeRoom === 'room-2-crea' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <section className="bg-white border border-[#E5E2DA] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#141A17]">
              <strong>🥗 Coach Nutrizionale:</strong> fisiologia del pasto cotto (ritenzione USDA), Calcio Zero-Formaggi biodisponibile, preset LARN e adattamento 1-tap.
            </p>
            <button
              type="button"
              onClick={handleOpenNutritionCoach}
              className="px-3 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-bold taste-btn cursor-pointer shrink-0"
            >
              Apri Coach Nutrizionale →
            </button>
          </section>
          <CreaExplorerView
            activeProfileId={activeProfileId}
            initialFoodId={selectedCreaFoodId}
            onCloseInitialFood={() => setSelectedCreaFoodId(null)}
            onAddToShoppingList={handleAddToShoppingList}
            onSearchMarketOffer={handleSearchMarketOffer}
            onNavigateToOfferStore={(storeId) => {
              setSelectedStoreId(storeId || null);
              setSelectedDomain('food_human');
              setSelectedCategory('');
              setSearchQuery('');
              setSelectedCreaFoodId(null);
              setActiveRoom('room-1-negozi');
            }}
          />
        </main>
      ) : activeRoom === 'room-3-ricette' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
          <section className="bg-white border border-[#E5E2DA] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-xs text-[#141A17]">
              <strong>👨‍🍳 Accademia Culinaria:</strong> 12 competenze scientifiche, SOS Fornelli in 30 secondi, Ratios e &quot;Frigo → Tecnica&quot; senza ricetta.
            </p>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleOpenAcademy('sos')}
                className="px-3 py-1.5 rounded-lg bg-[#9A5B25] hover:bg-[#7F4A1D] text-white text-xs font-bold taste-btn cursor-pointer"
              >
                🔥 SOS Fornelli
              </button>
              <button
                type="button"
                onClick={() => handleOpenAcademy('skills')}
                className="px-3 py-1.5 rounded-lg border border-[#DFDCD2] bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] text-xs font-bold taste-btn cursor-pointer"
              >
                Apri Accademia →
              </button>
            </div>
          </section>
          <RecipesAndRestaurantsView
            activeProfileId={activeProfileId}
            initialSearchQuery={initialRecipeSearch}
            onAddToShoppingList={handleAddToShoppingList}
            onPantryUpdated={refreshShoppingCount}
            onOpenCreaFood={(creaId) => {
              setSelectedCreaFoodId(creaId);
              setActiveRoom('room-2-crea');
            }}
          />
        </main>
      ) : activeRoom === 'room-4-cucina' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <KitchenCareView
            activeProfileId={activeProfileId}
            onAddToShoppingList={handleAddToShoppingList}
            onNavigateRoom={handleNavigateRoom}
            onOpenMaestro={handleOpenMaestro}
            onNavigateToStoreDomain={(domainId) => {
              setSelectedDomain(domainId || null);
              setSelectedCategory('');
              setSearchQuery('');
              setSelectedStoreId(null);
              setActiveRoom('room-1-negozi');
            }}
          />
        </main>
      ) : activeRoom === 'room-5-dispensa' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PantryAndReceiptsView
            stores={stores}
            onPantryUpdated={refreshShoppingCount}
            onCookWithIngredient={handleCookWithIngredient}
          />
        </main>
      ) : activeRoom === 'room-6-pianificatore' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <PlannerAndShoppingView
            activeProfileId={activeProfileId}
            onShoppingListChange={setShoppingCount}
            onPantryUpdated={refreshShoppingCount}
          />
        </main>
      ) : activeRoom === 'room-7-chimica' ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <HomeChemistryView
            activeProfileId={activeProfileId}
            onAddToShoppingList={handleAddToShoppingList}
            onNavigateRoom={handleNavigateRoom}
            onOpenMaestro={handleOpenMaestro}
          />
        </main>
      ) : null}
        </React.Suspense>
      )}
            </>
          )}
        </>
      )}

      {/* Global single instance: Basilico Maestro Hybrid Grounded Chat (ADR-0015) */}
      {isMaestroOpen && (
        <React.Suspense fallback={null}>
          <MaestroDrawer
            isOpen={isMaestroOpen}
            onClose={handleCloseMaestro}
            activeProfileId={activeProfileId}
            rhythmPreset={rhythmPreset}
            initialPrompt={maestroPrompt}
          />
        </React.Suspense>
      )}

      {/* Modal Flyer Viewer */}
      {activeFlyer && (
        <React.Suspense fallback={null}>
          <FlyerModal
            flyer={activeFlyer}
            isOpen={Boolean(activeFlyer)}
            onClose={() => setActiveFlyer(null)}
          />
        </React.Suspense>
      )}

      {/* Counter Price Observation Modal */}
      {isCounterModalOpen && (
        <React.Suspense fallback={null}>
          <CounterPriceModal
            isOpen={isCounterModalOpen}
            onClose={() => setIsCounterModalOpen(false)}
            stores={stores}
            localShops={localShops}
            defaultStoreId={counterDefaultStoreId}
            onSaved={() => {
              refetchOffers();
              refreshCounterObservations();
            }}
          />
        </React.Suspense>
      )}

      {/* Informative Operation Status Dialog (ADR-0005) */}
      {isSyncModalOpen && (
        <React.Suspense fallback={null}>
          <SyncStatusModal
            isOpen={isSyncModalOpen}
            progress={syncProgress}
            onClose={() => setIsSyncModalOpen(false)}
          />
        </React.Suspense>
      )}

      {/* Agentation Visual Point-to-Agent Toolbar (ADR-0014: active only in Vite dev on localhost) */}
      {DevAgentation &&
        typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') && (
          <React.Suspense fallback={null}>
            <DevAgentation
              appName={`Basilico (${activeRoom})`}
            onAnnotationAdd={(annotation) => {
              fetch('/api/agentation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  annotation: { ...annotation, url: window.location.href }
                })
              }).catch(() => {});
            }}
            onAnnotationUpdate={(annotation) => {
              fetch('/api/agentation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  annotation: { ...annotation, url: window.location.href }
                })
              }).catch(() => {});
            }}
            onAnnotationDelete={(annotation) => {
              if (annotation?.id) {
                fetch(`/api/agentation/${encodeURIComponent(annotation.id)}`, {
                  method: 'DELETE'
                }).catch(() => {});
              }
            }}
            onSubmit={(markdown, annotations) => {
              fetch('/api/agentation', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  markdown,
                  url: window.location.href,
                  annotations: (annotations || []).map((a) => ({
                    ...a,
                    url: a.url || window.location.href
                  }))
                })
              })
                .then((r) => (r.ok ? r.json() : null))
                .then((res) => {
                  const n = res?.pendingCount ?? annotations?.length ?? 0;
                  setShoppingToast(
                    `🎯 Inviate ${n} annotazioni visive all'Inbox Agente (scrivi "smaltisci inbox" in chat)`
                  );
                  setTimeout(() => setShoppingToast(''), 3500);
                })
                .catch(() => {});
            }}
            />
          </React.Suspense>
        )}

      {/* Footer */}
      <footer className="border-t border-[#E5E2DA] bg-white py-6 mt-12 text-center text-xs text-[#575E58]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-1.5">
          <p className="font-medium text-[#141A17]">
            🌿 Basilico — Cucina, Nutrizione, Cura della Casa &amp; Offerte Rapallo (16035 GE)
          </p>
          <p className="text-[#575E58]">
            Basko • Coop • Gulliver • Carrefour Market &amp; Express • Ekom • Penny • Eurospin • Despar • DPiù • Tigotà • PiùMe • Unieuro • Arcaplanet + Botteghe Locali
          </p>
          <p className="text-[11px] text-[#575E58]">
            Sorgente dati: <span className="font-semibold text-[#141A17]">{(status.dataSource || 'live').toUpperCase()}</span> • Supermercati attivi: {stores.length}
          </p>
          <p className="text-[11px] text-[#575E58]">
            Fotografie via Wikimedia Commons (CC0): Brooke Cagle, Markus Spiske, Leonie Wise
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
