import React, { useState, useEffect, useCallback } from 'react';
import CreaFoodModal from './CreaFoodModal.jsx';
import CreaCompareTray from './CreaCompareTray.jsx';

const SORT_OPTIONS = [
  { id: 'proteinG', label: 'Proteine più alte (g/100g)' },
  { id: 'nameAsc', label: 'Ordine alfabetico (A-Z)' },
  { id: 'ironMg', label: 'Ferro più alto (mg/100g)' },
  { id: 'calciumMg', label: 'Calcio più alto (mg/100g)' },
  { id: 'potassiumMg', label: 'Potassio più alto (mg/100g)' },
  { id: 'magnesiumMg', label: 'Magnesio più alto (mg/100g)' },
  { id: 'fiberG', label: 'Fibre più alte (g/100g)' },
  { id: 'vitaminCMg', label: 'Vitamina C più alta (mg/100g)' },
  { id: 'vitaminB12Ug', label: 'Vitamina B12 più alta (μg/100g)' },
  { id: 'kcalAsc', label: 'Ipocalorici (kcal crescenti)' }
];

const PHYSIOLOGICAL_PRESETS = [
  { id: null, label: 'Tutti gli Alimenti', icon: '🔬' },
  { id: 'high_protein', label: 'Alta Densità Proteica (≥18g)', icon: '💪' },
  { id: 'boat_hydration', label: 'Idratazione & Elettroliti in Barca', icon: '⛵' },
  { id: 'evening_light', label: 'Sazietà Leggera Serale', icon: '🌙' },
  { id: 'iron_vitamin_c', label: 'Focus Ferro & Vitamina C', icon: '🩸' }
];

const NPE_METRICS = [
  { id: 'proteinGPerEuro', label: 'Grammi di Proteine per 1 €', unit: 'g prot / €' },
  { id: 'kcalPerEuro', label: 'Energia (kcal) per 1 €', unit: 'kcal / €' },
  { id: 'ironMgPerEuro', label: 'Ferro (mg) per 1 €', unit: 'mg Fe / €' },
  { id: 'potassiumMgPerEuro', label: 'Potassio (mg) per 1 €', unit: 'mg K / €' },
  { id: 'fiberGPerEuro', label: 'Fibre (g) per 1 €', unit: 'g fibre / €' },
  { id: 'calciumMgPerEuro', label: 'Calcio (mg) per 1 €', unit: 'mg Ca / €' }
];

export function CreaExplorerView({
  activeProfileId = 'dany',
  initialFoodId = null,
  onNavigateToOfferStore
}) {
  const [subTab, setSubTab] = useState('database'); // 'database' | 'nutrients_per_euro'
  const [foods, setFoods] = useState([]);
  const [categories, setCategories] = useState([]);
  const [totalFoods, setTotalFoods] = useState(0);
  const [totalCatalogSize, setTotalCatalogSize] = useState(832);
  const [loading, setLoading] = useState(true);

  const [searchQ, setSearchQ] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [sortBy, setSortBy] = useState('proteinG');
  const [preset, setPreset] = useState(null);
  const [includeExcluded, setIncludeExcluded] = useState(false);

  const [compareItems, setCompareItems] = useState([]);
  const [activeModalFoodId, setActiveModalFoodId] = useState(initialFoodId);

  // Nutrients per Euro state
  const [npeMetric, setNpeMetric] = useState('proteinGPerEuro');
  const [npeRankings, setNpeRankings] = useState([]);
  const [npeLoading, setNpeLoading] = useState(false);

  useEffect(() => {
    if (initialFoodId) {
      setActiveModalFoodId(initialFoodId);
    }
  }, [initialFoodId]);

  const fetchFoods = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({
      sortBy,
      profileId: activeProfileId,
      includeExcluded: String(includeExcluded),
      limit: '120'
    });
    if (searchQ.trim()) params.set('q', searchQ.trim());
    if (selectedCategory) params.set('category', selectedCategory);
    if (preset) params.set('preset', preset);

    fetch(`/api/crea/foods?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setFoods(data.foods || []);
          setTotalFoods(data.totalFoods || 0);
          setTotalCatalogSize(data.totalCatalogSize || 832);
          if (data.categories) setCategories(data.categories);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [searchQ, selectedCategory, sortBy, preset, activeProfileId, includeExcluded]);

  const fetchNutrientsPerEuro = useCallback(() => {
    setNpeLoading(true);
    const params = new URLSearchParams({
      metric: npeMetric,
      profileId: activeProfileId,
      hideIncompatible: String(!includeExcluded)
    });
    fetch(`/api/crea/nutrients-per-euro?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.rankings)) {
          setNpeRankings(data.rankings);
        }
      })
      .catch(() => {})
      .finally(() => setNpeLoading(false));
  }, [npeMetric, activeProfileId, includeExcluded]);

  useEffect(() => {
    fetchFoods();
  }, [fetchFoods]);

  useEffect(() => {
    if (subTab === 'nutrients_per_euro') {
      fetchNutrientsPerEuro();
    }
  }, [subTab, fetchNutrientsPerEuro]);

  const toggleCompareItem = (food) => {
    setCompareItems((prev) => {
      if (prev.some((i) => i.id === food.id)) {
        return prev.filter((i) => i.id !== food.id);
      }
      if (prev.length >= 4) return prev;
      return [...prev, food];
    });
  };

  const activeMetricUnit = NPE_METRICS.find((m) => m.id === npeMetric)?.unit || 'unità / €';

  return (
    <div className="space-y-5">
      {/* Top Banner & Mode Switcher */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔬</span>
            <h2 className="text-xl font-extrabold text-slate-900">
              Stanza 2 — Scienza & Database Ufficiale CREA (100% Integrale)
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Tutti gli <strong>{totalCatalogSize} alimenti ufficiali CREA</strong> × <strong>26.622 valori</strong> nelle <strong>7 sezioni complete</strong> (zero tagli <code>.slice</code>), ricalcolo 100g edibili/lordi/LARN, resa fisica Crudo↔Cotto e ponte <strong>Nutrienti per Euro Edibili</strong> sulle offerte di Rapallo.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setSubTab('database')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
              subTab === 'database'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            📚 Esploratore & Classifiche ({totalFoods}/{totalCatalogSize})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('nutrients_per_euro')}
            className={`px-3.5 py-2 rounded-xl text-xs font-extrabold transition-colors cursor-pointer ${
              subTab === 'nutrients_per_euro'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            💶 Classifica Live &ldquo;Nutrienti per 1 €&rdquo; a Rapallo
          </button>
        </div>
      </section>

      {/* Side-by-Side Comparison Tray (2-4 foods) */}
      <CreaCompareTray
        items={compareItems}
        onRemoveItem={(id) => setCompareItems((prev) => prev.filter((i) => i.id !== id))}
        onClearAll={() => setCompareItems([])}
        onInspectFood={(id) => setActiveModalFoodId(id)}
      />

      {subTab === 'database' ? (
        <>
          {/* Physiological Presets + Academic Override Toggle */}
          <section className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
              {PHYSIOLOGICAL_PRESETS.map((p) => (
                <button
                  key={p.id || 'all'}
                  type="button"
                  onClick={() => setPreset(preset === p.id ? null : p.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border whitespace-nowrap cursor-pointer ${
                    preset === p.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
                  }`}
                >
                  <span>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-3 py-1.5 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={includeExcluded}
                onChange={(e) => setIncludeExcluded(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              <span>Mostra anche alimenti esclusi dal profilo (studio accademico)</span>
            </label>
          </section>

          {/* Search, Category Filter & Nutrient Sort Bar */}
          <section className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Cerca tra gli 832 alimenti (IT / EN / Nome scientifico)
              </label>
              <input
                type="search"
                placeholder="es. acciuga, tonno, lenticchie, spinaci, lupini..."
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Filtra per Categoria Ufficiale CREA (17 categorie)
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tutte le 17 Categorie CREA</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">
                Classifica Scientifica per Nutriente (per 100g edibili)
              </label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="w-full text-xs font-bold border border-emerald-300 rounded-lg px-3 py-2 bg-emerald-50/40 text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {SORT_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </section>

          {/* CREA Foods Table / Cards */}
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px]">
                    <th className="py-2.5 px-3 font-bold">Alimento CREA</th>
                    <th className="py-2.5 px-3 font-bold">Categoria</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Edibile</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">kcal</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Proteine</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Lipidi</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Carbo.</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Fibre</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Ferro</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Calcio</th>
                    <th className="py-2.5 px-2.5 font-bold text-right">Potassio</th>
                    <th className="py-2.5 px-3 font-bold text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {loading ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-slate-500">
                        Caricamento database scientifico CREA...
                      </td>
                    </tr>
                  ) : foods.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-10 text-center text-slate-500">
                        Nessun alimento CREA trovato con i filtri attuali.
                      </td>
                    </tr>
                  ) : (
                    foods.map((f) => {
                      const km = f.keyMetrics || {};
                      const isCompared = compareItems.some((i) => i.id === f.id);
                      const isExcluded = f.profileCompatibility && f.profileCompatibility.isCompatible === false;
                      return (
                        <tr
                          key={f.id}
                          className={`hover:bg-emerald-50/40 transition-colors ${
                            isExcluded ? 'bg-amber-50/30 opacity-80' : ''
                          }`}
                        >
                          <td className="py-2 px-3">
                            <button
                              type="button"
                              onClick={() => setActiveModalFoodId(f.id)}
                              className="font-bold text-slate-900 hover:text-emerald-700 hover:underline text-left cursor-pointer"
                            >
                              {f.name}
                            </button>
                            <div className="text-[10px] text-slate-400">
                              ID #{f.id} {f.scientificName ? `• ${f.scientificName}` : ''}
                              {isExcluded && (
                                <span className="ml-1.5 text-amber-700 font-bold">⚠️ Escluso dal profilo</span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-[11px] text-slate-600">{f.category}</td>
                          <td className="py-2 px-2.5 text-right font-medium text-slate-600">{f.ediblePartPct}%</td>
                          <td className="py-2 px-2.5 text-right font-semibold text-slate-800">{km.kcal ?? '—'}</td>
                          <td className="py-2 px-2.5 text-right font-extrabold text-emerald-700">
                            {km.proteinG != null ? `${km.proteinG} g` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-700">
                            {km.fatG != null ? `${km.fatG} g` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-700">
                            {km.carbsG != null ? `${km.carbsG} g` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-700">
                            {km.fiberG != null ? `${km.fiberG} g` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right font-medium text-rose-700">
                            {km.ironMg != null ? `${km.ironMg} mg` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-slate-700">
                            {km.calciumMg != null ? `${km.calciumMg} mg` : '—'}
                          </td>
                          <td className="py-2 px-2.5 text-right text-sky-700 font-medium">
                            {km.potassiumMg != null ? `${km.potassiumMg} mg` : '—'}
                          </td>
                          <td className="py-2 px-3 text-right whitespace-nowrap space-x-1.5">
                            <button
                              type="button"
                              onClick={() => toggleCompareItem(f)}
                              className={`px-2 py-1 rounded text-[10px] font-bold border cursor-pointer ${
                                isCompared
                                  ? 'bg-indigo-600 text-white border-indigo-600'
                                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                              }`}
                            >
                              {isCompared ? '✓ In confronto' : '+ Confronta'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveModalFoodId(f.id)}
                              className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                            >
                              7 Sezioni →
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* Live "Nutrients per Edible Euro" Ranking on Rapallo Offers */
        <section className="space-y-4">
          <div className="bg-indigo-950 text-white rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-extrabold">
                💶 Classifica Live &ldquo;Nutrienti per 1 € Edibile&rdquo; nei Supermercati di Rapallo
              </h3>
              <p className="text-xs text-indigo-200 mt-0.5">
                Incrocio in tempo reale tra i prezzi al kg sgocciolato delle offerte attive a Rapallo, la % di parte edibile e la densità nutrizionale CREA.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <label className="text-xs font-bold text-indigo-200">Ordina per:</label>
              <select
                value={npeMetric}
                onChange={(e) => setNpeMetric(e.target.value)}
                className="text-xs font-extrabold bg-white text-slate-900 rounded-lg px-3 py-2 cursor-pointer"
              >
                {NPE_METRICS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-900 text-white text-[11px]">
                    <th className="py-2.5 px-3 font-bold">#</th>
                    <th className="py-2.5 px-3 font-bold">Offerta Supermercato Rapallo</th>
                    <th className="py-2.5 px-3 font-bold">Match Scientifico CREA (Head-Noun)</th>
                    <th className="py-2.5 px-3 font-bold text-right">Prezzo Cassa</th>
                    <th className="py-2.5 px-3 font-bold text-right">€/kg Edibile Netto</th>
                    <th className="py-2.5 px-3 font-bold text-right bg-indigo-900">Resa per 1 € ({activeMetricUnit})</th>
                    <th className="py-2.5 px-3 font-bold text-right">Proteine/€</th>
                    <th className="py-2.5 px-3 font-bold text-right">kcal/€</th>
                    <th className="py-2.5 px-3 font-bold text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {npeLoading ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        Calcolo efficienza nutrizionale per euro sulle offerte di Rapallo...
                      </td>
                    </tr>
                  ) : npeRankings.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-500">
                        Nessuna offerta abbinata per i criteri correnti.
                      </td>
                    </tr>
                  ) : (
                    npeRankings.map((item, idx) => (
                      <tr key={`${item.offerId}-${idx}`} className="hover:bg-indigo-50/40">
                        <td className="py-2.5 px-3 font-extrabold text-slate-500">#{idx + 1}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.offerTitle}</div>
                          <div className="text-[10px] text-slate-500">
                            🏪 {item.storeName} {item.brand ? `• ${item.brand}` : ''}
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <button
                            type="button"
                            onClick={() => setActiveModalFoodId(item.creaFoodId)}
                            className="font-semibold text-emerald-800 hover:underline text-left cursor-pointer"
                          >
                            🔬 {item.creaFoodName}
                          </button>
                          <div className="text-[10px] text-slate-400">
                            Edibile: {item.ediblePartPctUsed}% • Metodo: {item.matchBasis}
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-800">
                          € {Number(item.promoPrice).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-semibold text-slate-600">
                          € {Number(item.trueEdibleEuroPerKg).toFixed(2)} / kg
                        </td>
                        <td className="py-2.5 px-3 text-right font-extrabold text-indigo-800 bg-indigo-50/60">
                          {item.nutrientsPerEuro[npeMetric]} {activeMetricUnit}
                        </td>
                        <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                          {item.nutrientsPerEuro.proteinGPerEuro} g/€
                        </td>
                        <td className="py-2.5 px-3 text-right text-slate-600">
                          {item.nutrientsPerEuro.kcalPerEuro} kcal/€
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setActiveModalFoodId(item.creaFoodId)}
                            className="px-2 py-1 rounded text-[10px] font-bold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
                          >
                            Scheda CREA
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* Full 7-Section Academic CREA Modal */}
      <CreaFoodModal
        foodId={activeModalFoodId}
        isOpen={Boolean(activeModalFoodId)}
        onClose={() => setActiveModalFoodId(null)}
        onSelectOfferStore={onNavigateToOfferStore}
      />
    </div>
  );
}

export default CreaExplorerView;
