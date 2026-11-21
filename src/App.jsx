import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Header from './components/Header.jsx';
import RoomNavigation, {
  BASILICO_ROOMS,
  BASILICO_PHASES,
  VALID_PHASE_IDS,
  CausalPhaseNavigation,
  getPhaseForRoom
} from './components/RoomNavigation.jsx';
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
import PlannerAndShoppingView from './components/planner/PlannerAndShoppingView.jsx';
import CycleOverviewView from './components/cycle/CycleOverviewView.jsx';
import MaestroDrawer from './components/maestro/MaestroDrawer.jsx';
import HomeChemistryView from './components/home/HomeChemistryView.jsx';
import CulinaryAcademyPanel from './components/academy/CulinaryAcademyPanel.jsx';
import NutritionCoachPanel from './components/crea/NutritionCoachPanel.jsx';
import { useSupermarketData } from './hooks/useSupermarketData.js';

const isViteDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const DevAgentation = isViteDev
  ? React.lazy(() => import('agentation').then((m) => ({ default: m.Agentation })))
  : null;

const DOMAIN_PILLS = [
  { id: null, label: 'Tutti i Domini', icon: '🌐' },
  { id: 'food_human', label: 'Alimentari & Bevande', icon: '🥩' },
  { id: 'home_cleaning', label: 'Chimica & Cura Casa', icon: '🧼' },
  { id: 'kitchen_cookware', label: 'Pentole & Elettrodomestici', icon: '🍳' },
  { id: 'personal_care', label: 'Igiene Persona', icon: '🧴' },
  { id: 'pet_care', label: 'Animali (Pet)', icon: '🐾' },
  { id: 'bazar_seasonal', label: 'Giocattoli, Natale & Bazar', icon: '🎄' }
];

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
              <CulinaryAcademyPanel
                key={`academy-${academySection}`}
                activeProfileId={activeProfileId}
                onNavigateRoom={handleNavigateRoom}
                onOpenMaestro={handleOpenMaestro}
                initialSection={academySection}
              />
            </main>
          ) : activePhase === 'phase-1' && phase1Panel === 'nutrition' ? (
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
              <NutritionCoachPanel
                activeProfileId={activeProfileId}
                onNavigateRoom={handleNavigateRoom}
                onOpenMaestro={handleOpenMaestro}
              />
            </main>
          ) : (
            <>

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
              <section className="bg-white border border-[#E5E2DA] text-[#141A17] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start sm:items-center gap-2.5">
                  <span className="text-xl" aria-hidden="true">🛡️</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider bg-[#1B5E3A] text-white px-2 py-0.5 rounded">
                        Profilo: {activeProfile.name}
                      </span>
                      {activeProfile.excludedIngredients?.length > 0 && (
                        <span className="text-[11px] text-[#575E58]">
                          Esclusioni attive: {activeProfile.excludedIngredients.slice(0, 5).join(', ')}
                          {activeProfile.excludedIngredients.length > 5 ? ` (+${activeProfile.excludedIngredients.length - 5})` : ''}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#575E58] mt-0.5">
                      {activeProfile.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                  <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#141A17] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideIncompatible}
                      onChange={(e) => setHideIncompatible(e.target.checked)}
                      className="rounded border-[#DFDCD2] text-[#1B5E3A] focus:ring-[#1B5E3A]"
                    />
                    <span>Nascondi prodotti esclusi</span>
                  </label>
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
                    onClick={() => handleSelectDomain(isSelected ? null : dom.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border taste-btn whitespace-nowrap cursor-pointer ${
                      isSelected
                        ? 'bg-[#141A17] text-white border-[#141A17] shadow-xs'
                        : 'bg-white text-[#4A524C] border-[#E5E2DA] hover:border-[#1B5E3A]/40 hover:bg-[#F3F1EC]'
                    }`}
                  >
                    <span aria-hidden="true">{dom.icon}</span>
                    <span>{dom.label}</span>
                    {count !== undefined && (
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-[#2B332E] text-white' : 'bg-[#F3F1EC] text-[#575E58]'}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </section>

            {/* Active Store Promo & Flyer Banner */}
            {activeStore && (
              <section className="bg-white rounded-xl border border-[#E5E2DA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-[#141A17]">{activeStore.name}</h2>
                    {activeStore.isRegionalServing && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#F3F1EC] text-[#1B5E3A] border border-[#DFDCD2]">
                        Servizio Rapallo & Tigullio
                      </span>
                    )}
                    {activeStore.loyaltyCard && (
                      <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-[#9A5B25] border border-amber-200">
                        💳{' '}
                        {typeof activeStore.loyaltyCard === 'string'
                          ? activeStore.loyaltyCard
                          : activeStore.loyaltyCard?.name || 'Carta Fedeltà'}
                        {typeof activeStore.loyaltyCard === 'object' && activeStore.loyaltyCard?.requiredForPromo
                          ? ' (richiesta per promo)'
                          : ''}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#575E58] mt-0.5 truncate max-w-xl">
                    {activeStore.address}
                    {activeStore.logistics?.distanceKmFromHarbor != null
                      ? ` • 📍 ${activeStore.logistics.distanceKmFromHarbor} km dal Porto`
                      : ''}
                    {activeStore.logistics?.avgVisitMinutes != null
                      ? ` • ⏱️ ~${activeStore.logistics.avgVisitMinutes} min visita`
                      : ''}
                  </p>
                </div>

                <div className="flex flex-col items-start sm:items-end gap-1.5">
                  {currentStoreFlyers.length > 0 && (
                    <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
                      {currentStoreFlyers.map((flyerItem, idx) => (
                        <button
                          key={flyerItem.id || idx}
                          type="button"
                          onClick={() => handleOpenFlyer(flyerItem)}
                          className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-semibold rounded-lg shadow-xs taste-btn whitespace-nowrap cursor-pointer"
                        >
                          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                          </svg>
                          <span>
                            {currentStoreFlyers.length > 1
                              ? `Volantino ${idx + 1}: ${flyerItem.title || 'Sfoglia'} (${flyerItem.pageCount} pag.)`
                              : `Sfoglia volantino (${flyerItem.pageCount} pag.)`}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  {currentStoreFlyers.some((f) => f.upstreamIndexedCap) && (
                    <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                      ℹ️ Nota trasparenza: PromoQui indicizza max {currentStoreFlyers.find((f) => f.upstreamIndexedCap)?.upstreamIndexedCap} prodotti per volantino (verificato prov. GE)
                    </span>
                  )}
                </div>
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

            {/* Category Filter Pills (shown when multiple food/department categories apply; hidden on single-bucket non-food domains to avoid redundant pills) */}
            {(!visibleCategoriesForDomain || visibleCategoriesForDomain.length > 1) ? (
              <section>
                <CategoryFilters
                  categories={visibleCategoriesForDomain}
                  selectedCategory={selectedCategory}
                  onToggleCategory={handleToggleCategory}
                  categoryCounts={facets?.categories || {}}
                  activeFilterCount={activeFilterCount}
                  onClearFilters={handleClearFilters}
                />
              </section>
            ) : activeFilterCount > 0 ? (
              <section className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                >
                  ✕ Azzera filtri ({activeFilterCount})
                </button>
              </section>
            ) : null}

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
                  selectedDomain={selectedDomain}
                  selectedStoreName={activeStore ? activeStore.name : null}
                  hideIncompatible={hideIncompatible}
                  onClearFilters={handleClearFilters}
                  onApplyQuery={(term) => setSearchQuery(term)}
                />
              ) : (
                <OfferGrid
                  offers={offers}
                  totalOffers={totalOffers}
                  hasMoreOffers={hasMoreOffers}
                  loadingMore={loadingMore}
                  onLoadMore={loadMoreOffers}
                  loading={loading}
                  onAddToShoppingList={handleAddToShoppingList}
                  onOpenCreaFood={(creaId) => {
                    setSelectedCreaFoodId(creaId);
                    setActiveRoom('room-2-crea');
                  }}
                  onOpenFlyer={handleOpenOfferFlyer}
                  onResetFilters={handleClearFilters}
                />
              )}
            </section>

            {/* Local Observed Shops Directory in Rapallo */}
            {localShops.length > 0 && (
              <section className="bg-white rounded-xl border border-[#E5E2DA] p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-[#141A17]">
                      🐟 Botteghe Storiche, Mercato &amp; Casalinghi Osservati a Rapallo
                    </h3>
                    <p className="text-xs text-[#575E58]">
                      Prezzi reali rilevati dai tuoi scontrini e al banco di quartiere (zero finti volantini).
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setCounterDefaultStoreId('');
                      setIsCounterModalOpen(true);
                    }}
                    className="px-3 py-1.5 text-xs font-bold bg-[#9A5B25] hover:bg-[#7F4A1D] text-white rounded-lg taste-btn cursor-pointer shrink-0"
                  >
                    + Prezzo visto al banco
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {localShops.map((shop) => (
                    <button
                      key={shop.id}
                      type="button"
                      onClick={() => {
                        setCounterDefaultStoreId(shop.id);
                        setIsCounterModalOpen(true);
                      }}
                      className="p-2.5 rounded-lg border border-[#E5E2DA] bg-[#FAF9F6] hover:bg-[#F3F1EC] hover:border-[#9A5B25]/50 text-left text-xs taste-card cursor-pointer"
                    >
                      <div className="font-bold text-[#141A17] truncate">{shop.name}</div>
                      <div className="text-[11px] text-[#575E58] truncate">{shop.address}</div>
                      <div className="mt-1 inline-block text-[10px] font-semibold bg-[#F3F1EC] text-[#9A5B25] border border-[#DFDCD2] px-1.5 py-0.5 rounded">
                        + Registra prezzo al banco
                      </div>
                    </button>
                  ))}
                </div>
                {counterObservations.length > 0 && (
                  <div className="pt-2 border-t border-[#E5E2DA] space-y-2">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-[#575E58]">
                      📌 Ultimi prezzi reali rilevati al banco a Rapallo ({counterObservations.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {counterObservations.map((obs) => (
                        <div
                          key={obs.id}
                          className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-[#141A17] truncate">{obs.title}</div>
                            <div className="text-[10px] text-[#575E58] truncate">
                              {obs.storeName || obs.storeId} • {obs.unitString || '1 pz'}
                            </div>
                          </div>
                          <div className="text-right shrink-0">
                            <div className="font-extrabold text-[#1B5E3A]">
                              € {Number(obs.price || 0).toFixed(2).replace('.', ',')}
                            </div>
                            {(obs.normalizedPricePerKgOrL ?? obs.ediblePricePerKg) ? (
                              <div className="text-[10px] text-[#575E58]">
                                {Number(obs.normalizedPricePerKgOrL ?? obs.ediblePricePerKg).toFixed(2).replace('.', ',')} €/{obs.referenceUnit || 'kg'}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}
          </main>
        </>
      ) : !profilesReady ? (
        <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center text-sm text-[#575E58]">
          Sincronizzazione profilo attivo in corso...
        </main>
      ) : activeRoom === 'room-2-crea' ? (
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
            </>
          )}
        </>
      )}

      {/* Global single instance: Basilico Maestro Hybrid Grounded Chat (ADR-0015) */}
      <MaestroDrawer
        isOpen={isMaestroOpen}
        onClose={handleCloseMaestro}
        activeProfileId={activeProfileId}
        rhythmPreset={rhythmPreset}
        initialPrompt={maestroPrompt}
      />

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
        localShops={localShops}
        defaultStoreId={counterDefaultStoreId}
        onSaved={() => {
          refetchOffers();
          refreshCounterObservations();
        }}
      />

      {/* Informative Operation Status Dialog (ADR-0005) */}
      <SyncStatusModal
        isOpen={isSyncModalOpen}
        progress={syncProgress}
        onClose={() => setIsSyncModalOpen(false)}
      />

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
