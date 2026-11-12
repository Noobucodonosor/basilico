import React, { useState, useEffect, useCallback, useMemo } from 'react';
import CookingModeModal from './CookingModeModal.jsx';

const SOURCE_TYPE_TABS = [
  { id: 'all', label: 'Tutti i Piatti', icon: '🍽️' },
  { id: 'base_single_school', label: 'Scuola Base Single, Colazioni & Barca', icon: '⛵' },
  { id: 'tigullio_restaurant', label: 'Ristoranti con Menu Reale Verificato (GE)', icon: '🦞' },
  { id: 'starred_author', label: 'Alta Cucina & Stellati (Studio)', icon: '⭐' }
];

const MEAL_CONTEXT_PILLS = [
  { id: 'all', label: 'Tutti i Contesti' },
  { id: 'breakfast', label: '☀️ Colazione Mattutina' },
  { id: 'boat_cooler', label: '⛵ Borsa Termica / Barca (Freddo Sicuro)' },
  { id: 'light_dinner', label: '🌙 Cena Leggera' },
  { id: 'lunch_home', label: '🏠 Pranzo a Terra' },
  { id: 'sunday_lab', label: '🔬 Laboratorio Domenicale' }
];

export function RecipesAndRestaurantsView({ activeProfileId, onOpenCreaFood, onPantryUpdated }) {
  const [activeViewTab, setActiveViewTab] = useState('catalog'); // 'catalog' | 'pareto_8020' | 'deconstruct' | 'lab_notebook'
  const [sourceType, setSourceType] = useState('all');
  const [zona, setZona] = useState('all');
  const [restaurantId, setRestaurantId] = useState('all');
  const [mealContext, setMealContext] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [servings, setServings] = useState(1);
  const [sortBy, setSortBy] = useState('arbitrage_desc');
  const [deduplicateTwins, setDeduplicateTwins] = useState(false);
  const [excludeIncompatible, setExcludeIncompatible] = useState(false);
  const [visibleLimit, setVisibleLimit] = useState(80);

  const [catalogData, setCatalogData] = useState({
    totalDishesInCatalog: 368,
    totalBomRowsInCatalog: 1647,
    tigullioDishesCount: 334,
    baseSingleDishesCount: 32,
    totalCensusedRestaurantsCount: 32,
    activeMenuRestaurantsCount: 23,
    totalMatching: 0,
    zones: [],
    cities: [],
    restaurants: [],
    dishes: []
  });
  const [allRestaurantsCache, setAllRestaurantsCache] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paretoData, setParetoData] = useState(null);
  const [labEntries, setLabEntries] = useState([]);
  const [activeCookingDishId, setActiveCookingDishId] = useState(null);
  const [expandedBomDishId, setExpandedBomDishId] = useState(null);

  // Deconstruct custom dish state
  const [customTitle, setCustomTitle] = useState('');
  const [customRestaurant, setCustomRestaurant] = useState('');
  const [customPrice, setCustomPrice] = useState('24');
  const [customIngredients, setCustomIngredients] = useState('');
  const [deconstructedResult, setDeconstructedResult] = useState(null);

  useEffect(() => {
    setVisibleLimit(80);
  }, [sourceType, zona, restaurantId, mealContext, searchQuery, deduplicateTwins, excludeIncompatible, activeProfileId]);

  const fetchCatalog = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      sourceType,
      zona,
      restaurantId,
      mealContext,
      q: searchQuery,
      servings: String(servings),
      sortBy,
      limit: String(visibleLimit),
      deduplicateTwins: String(deduplicateTwins),
      excludeIncompatible: String(excludeIncompatible),
      profileId: activeProfileId || 'dany'
    });
    fetch(`/api/recipes?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setCatalogData(data);
          if (zona === 'all' && Array.isArray(data.restaurants)) {
            setAllRestaurantsCache(data.restaurants);
          }
          if (
            restaurantId !== 'all' &&
            Array.isArray(data.restaurants) &&
            !data.restaurants.some((r) => r.id === restaurantId)
          ) {
            setRestaurantId('all');
          }
        }
      })
      .finally(() => setLoading(false));
  }, [sourceType, zona, restaurantId, mealContext, searchQuery, servings, sortBy, visibleLimit, deduplicateTwins, excludeIncompatible, activeProfileId]);

  const handleZonaChange = (e) => {
    const nextZona = e.target.value;
    setZona(nextZona);
    if (nextZona !== 'all' && restaurantId !== 'all') {
      const knownPool = allRestaurantsCache.length > 0 ? allRestaurantsCache : catalogData.restaurants;
      const selectedRest = knownPool.find((r) => r.id === restaurantId);
      if (!selectedRest || selectedRest.zona !== nextZona) {
        setRestaurantId('all');
      }
    }
  };

  const restaurantsByZone = useMemo(() => {
    const groups = new Map();
    for (const zObj of catalogData.zones || []) {
      if (zObj?.zona) groups.set(zObj.zona, []);
    }
    for (const r of catalogData.restaurants || []) {
      const z = r.zona || 'Tigullio Ovest (Rapallo-SML-Portofino)';
      if (!groups.has(z)) groups.set(z, []);
      groups.get(z).push(r);
    }
    return Array.from(groups.entries()).filter(([, list]) => list.length > 0);
  }, [catalogData.restaurants, catalogData.zones]);

  useEffect(() => {
    fetchCatalog();
  }, [fetchCatalog]);

  const fetchPareto8020 = useCallback(() => {
    const params = new URLSearchParams({
      topK: '12',
      profileId: activeProfileId || 'dany'
    });
    fetch(`/api/recipes/8020?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setParetoData(data);
      });
  }, [activeProfileId]);

  const fetchLabNotes = useCallback(() => {
    fetch('/api/recipes/lab-notes')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.entries)) setLabEntries(data.entries);
      });
  }, []);

  useEffect(() => {
    fetchLabNotes();
  }, [fetchLabNotes]);

  useEffect(() => {
    setParetoData(null);
  }, [activeProfileId]);

  useEffect(() => {
    if (activeViewTab === 'pareto_8020' && !paretoData) {
      fetchPareto8020();
    }
    if (activeViewTab === 'lab_notebook') {
      fetchLabNotes();
    }
  }, [activeViewTab, paretoData, fetchPareto8020, fetchLabNotes]);

  const handleDeconstructSubmit = async (e) => {
    e.preventDefault();
    if (!customTitle.trim()) return;
    const res = await fetch('/api/recipes/deconstruct', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: customTitle,
        restaurantName: customRestaurant || 'Ristorante del Tigullio',
        menuPriceEuro: Number(customPrice) || 22,
        ingredientsText: customIngredients || customTitle,
        servings,
        profileId: activeProfileId || 'dany'
      })
    });
    if (res.ok) {
      const data = await res.json();
      setDeconstructedResult(data.dish);
      fetchCatalog();
    }
  };

  return (
    <div className="space-y-6">
      {/* Room 3 Hero Header */}
      <section className="bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white rounded-2xl p-5 sm:p-6 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-500 text-slate-950">
                Stanza 3 · ADR-0011
              </span>
              <span className="text-xs text-emerald-300 font-semibold">
                {catalogData.activeMenuRestaurantsCount || catalogData.restaurants.length} Ristoranti con Menu Reale Verificato in {(catalogData.zones || []).length || 1} Zone GE • {catalogData.totalDishesInCatalog} Piatti • {(catalogData.totalBomRowsInCatalog || 0).toLocaleString('it-IT')} Righe BOM Certificate CREA
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              🍽️ Ricette Base Single, Ristoranti della Provincia di Genova, Arbitraggio Live &amp; Fornelli (<em className="italic font-semibold text-emerald-200">Science &amp; Cooking</em>)
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Confronta il prezzo al tavolo dei ristoranti verificati della <strong>Provincia di Genova (Genova, Golfo Paradiso, Tigullio &amp; Entroterra — zero pizzerie)</strong> con il
              <strong> Costo Porzione Pura</strong> e lo <strong>Scontrino Reale di Cassa</strong> nei negozi di Rapallo, con variante automatica senza formaggi e guida scientifica ai fornelli.
            </p>
          </div>

          {/* Sub-navigation Tabs */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setActiveViewTab('catalog')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                activeViewTab === 'catalog'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              📖 Catalogo & Arbitraggio ({catalogData.totalDishesInCatalog})
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('pareto_8020')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                activeViewTab === 'pareto_8020'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              📊 Analisi 80/20 Max-Coverage
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('deconstruct')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                activeViewTab === 'deconstruct'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              🧪 De-costruisci Menu
            </button>
            <button
              type="button"
              onClick={() => setActiveViewTab('lab_notebook')}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold cursor-pointer transition-all ${
                activeViewTab === 'lab_notebook'
                  ? 'bg-emerald-500 text-slate-950 shadow-xs'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              📓 Quaderno Lab ({labEntries.length})
            </button>
          </div>
        </div>
      </section>

      {activeViewTab === 'catalog' && (
        <section className="space-y-4">
          {/* Source Type Pills + Twin Deduplication Toggle */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {SOURCE_TYPE_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSourceType(t.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-extrabold border cursor-pointer transition-all ${
                    sourceType === t.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-400'
                  }`}
                >
                  <span>{t.icon}</span>
                  <span>
                    {t.id === 'all'
                      ? `${t.label} (${catalogData.totalDishesInCatalog})`
                      : t.id === 'tigullio_restaurant'
                        ? `${catalogData.activeMenuRestaurantsCount || catalogData.restaurants.length} Ristoranti con Menu Reale Verificato (${catalogData.tigullioDishesCount || 334} Piatti)`
                        : t.id === 'base_single_school'
                          ? `${t.label} (${catalogData.baseSingleDishesCount || 32})`
                          : t.label}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={deduplicateTwins}
                  onChange={(e) => setDeduplicateTwins(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>🔗 Raggruppa omonimi (fascia prezzo)</span>
              </label>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeIncompatible}
                  onChange={(e) => setExcludeIncompatible(e.target.checked)}
                  className="rounded border-slate-300 text-emerald-600"
                />
                <span>🛡️ Nascondi piatti a identità latticini (solo compatibili)</span>
              </label>
            </div>
          </div>

          {/* Filter Bar: Zona GE Selector, Restaurant Selector (<optgroup>), Meal Context, Search, Servings Scaler, Sort */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Zona / Area GE ({(catalogData.zones || []).length || 1} aree verificate)
              </label>
              <select
                aria-label="Filtra per Zona della Provincia di Genova"
                value={zona}
                onChange={handleZonaChange}
                className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
              >
                <option value="all">
                  Tutte le Zone della Provincia di Genova (GE) ({catalogData.activeMenuRestaurantsCount || catalogData.restaurants.length} locali)
                </option>
                {(catalogData.zones || []).map((z) => (
                  <option key={z.zona} value={z.zona}>
                    📍 {z.zona} — {z.restaurantCount} {z.restaurantCount === 1 ? 'locale' : 'locali'} ({z.dishCount} piatti)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Ristorante ({catalogData.restaurants.length} {zona !== 'all' ? `in ${zona}` : 'con Menu Reale Verificato'})
              </label>
              <select
                aria-label="Filtra per Ristorante della Provincia di Genova"
                value={restaurantId}
                onChange={(e) => setRestaurantId(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
              >
                <option value="all">
                  {zona === 'all'
                    ? `Tutti i ${catalogData.activeMenuRestaurantsCount || catalogData.restaurants.length} Ristoranti con Menu Reale Verificato & Scuole`
                    : `Tutti i ${catalogData.restaurants.length} Ristoranti in ${zona}`}
                </option>
                {restaurantsByZone.map(([zoneLabel, rests]) => (
                  <optgroup key={zoneLabel} label={`${zoneLabel} (${rests.length})`}>
                    {rests.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.logo_emoji || '🍽️'} {r.nome} ({r.citta}) — {r.dishCount} {r.dishCount === 1 ? 'piatto' : 'piatti'}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Contesto d&apos;Uso (Barca / Terra)
              </label>
              <select
                value={mealContext}
                onChange={(e) => setMealContext(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
              >
                {MEAL_CONTEXT_PILLS.map((mc) => (
                  <option key={mc.id} value={mc.id}>
                    {mc.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Cerca piatto o ingrediente BOM
              </label>
              <input
                type="search"
                placeholder="Es. acciughe, cappon magro, seppia, cracco..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Scala Porzioni (1–8 persone)
              </label>
              <select
                aria-label="Scala Porzioni"
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
                className="w-full text-xs font-extrabold border border-emerald-300 bg-emerald-50/50 rounded-lg px-2.5 py-2 text-emerald-950"
              >
                {[1, 2, 3, 4, 6, 8].map((n) => (
                  <option key={n} value={n}>
                    👤 {n} {n === 1 ? 'Porzione (Single)' : 'Porzioni'}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Ordina per Arbitraggio / Fattibilità
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-800"
              >
                <option value="arbitrage_desc">💰 Risparmio Arbitraggio più alto (€)</option>
                <option value="cost_asc">🏷️ Costo Porzione Pura più basso (€)</option>
                <option value="pantry_desc">🥫 Maggior copertura Dispensa (%)</option>
              </select>
            </div>
          </div>

          {/* Dishes Cards Grid */}
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Calcolo Arbitraggio Live e Distinta Base (BOM) su {catalogData.totalDishesInCatalog} piatti...
            </div>
          ) : catalogData.dishes.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
              <div className="text-2xl">🍽️</div>
              <div className="text-sm font-extrabold text-slate-900">
                Nessun piatto trovato per i filtri selezionati
              </div>
              <p className="text-xs text-slate-600 max-w-lg mx-auto">
                {restaurantId !== 'all'
                  ? 'Questo locale del Tigullio non ha ancora schede piatto nel filtro attivo (oppure sono escluse dai filtri correnti). Puoi azzerare i filtri o usare il tab "De-costruisci Menu" per analizzare un piatto dal suo menu.'
                  : 'Prova ad ampliare la ricerca o azzerare i filtri attivi.'}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setZona('all');
                    setRestaurantId('all');
                    setSourceType('all');
                    setMealContext('all');
                    setSearchQuery('');
                    setExcludeIncompatible(false);
                  }}
                  className="px-4 py-2 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
                >
                  Mostra tutti i ristoranti e piatti
                </button>
                {restaurantId !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setActiveViewTab('deconstruct')}
                    className="px-4 py-2 rounded-xl text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                  >
                    🧪 De-costruisci un piatto di questo locale
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {catalogData.dishes.map((dish) => {
                const isExpanded = expandedBomDishId === dish.id;
                return (
                  <article
                    key={dish.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between space-y-3"
                  >
                    <div className="space-y-2">
                      {/* Top badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-slate-100 text-slate-800"
                            title={dish.zona || ''}
                          >
                            {dish.restaurantName || 'Scuola Base Single'} · {dish.city}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            {dish.course}
                          </span>
                          {dish.hasProfileSubstitution && (
                            <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-amber-100 text-amber-900 border border-amber-300">
                              🛡️ Variante Senza Formaggi Attiva
                            </span>
                          )}
                          {dish.isExcludedByProfileIdentity && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-900 border border-rose-300"
                              title={dish.profileExclusionReason || ''}
                            >
                              🚫 Identità Latticini — Solo Studio / Ospiti
                            </span>
                          )}
                          {dish.restaurantPriceRangeEur && (
                            <span
                              className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-800 border border-indigo-200"
                              title={dish.comparableRestaurants.map((c) => `${c.restaurantName} (${c.city}): €${c.menuPriceEuro}`).join(' • ')}
                            >
                              📊 In {dish.restaurantPriceRangeEur.count} ristoranti (€{dish.restaurantPriceRangeEur.minEur}–€{dish.restaurantPriceRangeEur.maxEur})
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] font-bold text-slate-500">⏱️ {dish.prepMinutes} min</span>
                      </div>

                      <h3 className="text-base font-extrabold text-slate-900 leading-snug">{dish.title}</h3>

                      {/* Dual Cost & Arbitrage Box */}
                      <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                        <div>
                          <div className="text-[10px] text-slate-500 font-semibold">Menu Ristorante</div>
                          <div className="text-sm font-extrabold text-slate-800">
                            €{dish.costAndArbitrage.totalMenuPriceEur.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-400">({dish.servings} porz.)</div>
                        </div>
                        <div>
                          <div className="text-[10px] text-emerald-700 font-bold">Costo Porzione Pura</div>
                          <div className="text-sm font-extrabold text-emerald-700">
                            €{dish.costAndArbitrage.purePortionCostEur.toFixed(2)}
                          </div>
                          <div className="text-[10px] text-slate-500">
                            Cassa: €{dish.costAndArbitrage.checkoutCashCostEur.toFixed(2)}
                          </div>
                        </div>
                        <div>
                          <div className="text-[10px] text-indigo-700 font-bold">Arbitraggio Casa</div>
                          <div
                            className={`text-sm font-extrabold ${
                              dish.costAndArbitrage.arbitrageSavingsEur >= 0 ? 'text-indigo-800' : 'text-amber-700'
                            }`}
                          >
                            {dish.costAndArbitrage.arbitrageSavingsEur >= 0
                              ? `-€${dish.costAndArbitrage.arbitrageSavingsEur.toFixed(2)}`
                              : `+€${Math.abs(dish.costAndArbitrage.arbitrageSavingsEur).toFixed(2)}`}{' '}
                            ({dish.costAndArbitrage.arbitrageSavingsPct}%)
                          </div>
                          <div className="text-[10px] text-emerald-700 font-semibold">
                            {dish.costAndArbitrage.onPromoIngredientsCount} ingr. in promo
                          </div>
                        </div>
                      </div>

                      {/* Nutrition & Feasibility Bar */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 pt-1">
                        <div className="flex items-center gap-2 font-semibold">
                          <span>🔥 {dish.nutritionPerServing.energyKcal} kcal/porz</span>
                          <span>• Proteine: {dish.nutritionPerServing.proteinG}g</span>
                          <span>• Lipidi: {dish.nutritionPerServing.lipidsG}g</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              dish.feasibility.cookwareReady
                                ? 'bg-emerald-50 text-emerald-800'
                                : 'bg-rose-50 text-rose-800'
                            }`}
                          >
                            {dish.feasibility.cookwareReady
                              ? '🍳 Pentole OK'
                              : `⚠️ Manca: ${dish.feasibility.missingCookware.join(', ')}`}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">
                            🥫 Dispensa: {dish.feasibility.pantryCoveragePct}%
                          </span>
                        </div>
                      </div>

                      {/* Expandable BOM Table */}
                      {isExpanded && (
                        <div className="mt-2 pt-2 border-t border-slate-200 space-y-1.5">
                          <div className="text-[11px] font-extrabold text-slate-700 uppercase">
                            Distinta Base Scientifica (BOM · {dish.bom.length} ingredienti):
                          </div>
                          {dish.bom.map((b, idx) => (
                            <div
                              key={idx}
                              className="flex flex-wrap items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 border border-slate-200/80 text-xs"
                            >
                              <div>
                                <button
                                  type="button"
                                  onClick={() => onOpenCreaFood && b.creaId && onOpenCreaFood(b.creaId)}
                                  className="font-bold text-slate-900 hover:text-emerald-700 underline decoration-dotted cursor-pointer text-left"
                                >
                                  {b.name}
                                </button>
                                <div className="text-[10px] text-slate-500">
                                  Crudo: <strong>{b.rawGramsTotal}g</strong> → Cotto: <strong>{b.cookedGramsTotal}g</strong> •{' '}
                                  {b.notes}
                                </div>
                              </div>
                              <div className="text-right">
                                <div className="font-extrabold text-emerald-800">€{b.linePureCostEur.toFixed(2)}</div>
                                <div className="text-[10px] text-slate-500">
                                  {b.matchedOffer
                                    ? `🏷️ Promo ${b.matchedOffer.chainName}`
                                    : `€${b.euroPerKg}/kg`}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => setExpandedBomDishId(isExpanded ? null : dish.id)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 cursor-pointer"
                      >
                        {isExpanded ? '▲ Chiudi BOM' : `🔬 Vedi BOM (${dish.bom.length} ingr.)`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveCookingDishId(dish.id)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
                      >
                        👨‍🍳 Avvia Modalità Fornelli (<em className="italic">Science &amp; Cooking</em>)
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
          {!loading && catalogData.totalMatching > catalogData.dishes.length && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <span className="text-xs font-semibold text-slate-500">
                Visualizzati {catalogData.dishes.length} di {catalogData.totalMatching} piatti corrispondenti
              </span>
              <button
                type="button"
                onClick={() => setVisibleLimit((prev) => prev + 80)}
                className="px-5 py-2.5 rounded-xl text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white shadow-xs cursor-pointer"
              >
                Mostra altri piatti (+80) →
              </button>
            </div>
          )}
        </section>
      )}

      {/* TAB 2: 80/20 Max-Coverage Basket Solver */}
      {activeViewTab === 'pareto_8020' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-indigo-100 text-indigo-900">
              Algoritmo Submodulare 80/20 Max-Coverage
            </span>
            <h2 className="text-lg font-extrabold text-slate-900 mt-1">
              📊 I 12 Ingredienti Chiave che Sbloccano il Massimo Numero di Piatti della Provincia di Genova
            </h2>
            <p className="text-xs text-slate-600">
              Considerando le scorte già presenti nella tua Dispensa, ecco l&apos;ordine ottimo di acquisto a Rapallo per massimizzare i piatti cucinabili al 100%.
            </p>
          </div>

          {!paretoData ? (
            <div className="p-6 text-center text-xs text-slate-500">Calcolo copertura 80/20 in corso...</div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {paretoData.paretoBasket.map((item) => (
                <div
                  key={item.key}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-slate-900 text-white text-[10px] font-extrabold">
                      #{item.rank} Priorità 80/20
                    </span>
                    {item.onPromoInRapallo && (
                      <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-900 text-[10px] font-bold">
                        🏷️ In Offerta ({item.promoChain})
                      </span>
                    )}
                  </div>
                  <div className="font-extrabold text-sm text-slate-900">{item.name}</div>
                  <div className="text-xs text-slate-600 space-y-0.5">
                    <div>
                      Presente in <strong>{item.dishFrequency} piatti</strong> del catalogo • Totale sbloccati:{' '}
                      <strong className="text-emerald-700">{item.cumulativeUnlockedDishesCount} ricette complete</strong>
                      {item.newlyUnlockedDishesCount > 0 && (
                        <span className="ml-1 text-emerald-800 font-bold">(+{item.newlyUnlockedDishesCount} dirette)</span>
                      )}
                    </div>
                    {item.nearlyUnlockedDishesCount > 0 && (
                      <div className="text-[11px] text-indigo-700 font-medium">
                        ↳ Porta altri {item.nearlyUnlockedDishesCount} piatti a 1 solo ingrediente dallo sblocco
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 3: On-Demand Menu Deconstruction */}
      {activeViewTab === 'deconstruct' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              🧪 De-costruisci un Nuovo Piatto o Menu di Ristorante
            </h2>
            <p className="text-xs text-slate-600">
              Inserisci il nome del piatto letto sulla lavagna o sul menu di un ristorante ligure: Basilico ne genera la Distinta Base (BOM) collegata a CREA e calcola l&apos;arbitraggio rispetto ai negozi di Rapallo.
            </p>
          </div>

          <form onSubmit={handleDeconstructSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Titolo del Piatto sul Menu</label>
              <input
                type="text"
                required
                placeholder="Es. Trenette al Pesto, Patate e Fagiolini"
                value={customTitle}
                onChange={(e) => setCustomTitle(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Nome Ristorante & Prezzo Menu (€)</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Es. Trattoria del Mare Rapallo"
                  value={customRestaurant}
                  onChange={(e) => setCustomRestaurant(e.target.value)}
                  className="flex-1 text-xs border border-slate-300 rounded-lg px-3 py-2"
                />
                <input
                  type="number"
                  min="4"
                  max="250"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  className="w-24 text-xs font-bold border border-slate-300 rounded-lg px-3 py-2"
                />
              </div>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Ingredienti principali (separati da virgola)
              </label>
              <input
                type="text"
                placeholder="Es. pasta di semola, patate, fagiolini, pinoli, olio extravergine"
                value={customIngredients}
                onChange={(e) => setCustomIngredients(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="submit"
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                🔬 Genera Scheda Scientifica BOM & Calcola Arbitraggio
              </button>
            </div>
          </form>

          {deconstructedResult && (
            <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2 text-xs">
              <div className="font-extrabold text-sm text-emerald-950">
                ✅ Piatto de-costruito e aggiunto al catalogo: {deconstructedResult.title}
              </div>
              <div>
                Prezzo Ristorante: <strong>€{deconstructedResult.costAndArbitrage.totalMenuPriceEur.toFixed(2)}</strong> •
                Costo Porzione Pura a Rapallo:{' '}
                <strong>€{deconstructedResult.costAndArbitrage.purePortionCostEur.toFixed(2)}</strong> • Risparmio
                Arbitraggio: <strong>€{deconstructedResult.costAndArbitrage.arbitrageSavingsEur.toFixed(2)}</strong>
              </div>
            </div>
          )}
        </section>
      )}

      {/* TAB 4: Lab Notebook History */}
      {activeViewTab === 'lab_notebook' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-slate-900">
              📓 Quaderno di Laboratorio Gastronomico
            </h2>
            <p className="text-xs text-slate-600">
              Storico delle tue esecuzioni reali ai fornelli: pesi cotti misurati, calibrazione sapidità/idratazione e valutazioni.
            </p>
          </div>
          {labEntries.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nessuna nota registrata. Apri un piatto in &quot;Modalità Fornelli&quot; per salvare la tua prima prova sperimentale!
            </div>
          ) : (
            <div className="space-y-2.5">
              {labEntries.map((en) => (
                <div key={en.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{en.dishTitle}</span>
                    <span className="font-bold text-amber-600">{'★'.repeat(en.rating)}</span>
                  </div>
                  <p className="text-slate-700">{en.saltAndHydrationNotes}</p>
                  <div className="text-[10px] text-slate-500">
                    Piano: {en.heatSourceUsed} •{' '}
                    {en.actualCookedWeightGrams ? `Peso cotto reale: ${en.actualCookedWeightGrams}g • ` : ''}
                    {new Date(en.createdAt).toLocaleString('it-IT')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Full-Screen Cooking Mode Modal */}
      {activeCookingDishId && (
        <CookingModeModal
          dishId={activeCookingDishId}
          initialServings={servings}
          activeProfileId={activeProfileId}
          onClose={() => setActiveCookingDishId(null)}
          onLabNoteSaved={() => fetchLabNotes()}
          onPantryConsumed={() => {
            fetchCatalog();
            if (onPantryUpdated) onPantryUpdated();
          }}
        />
      )}
    </div>
  );
}

export default RecipesAndRestaurantsView;
