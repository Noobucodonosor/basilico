import React, { useState, useEffect, useCallback } from 'react';

const TABS = [
  { id: 'sos', label: '⚡ SOS Macchia 3-Tap', shortLabel: '⚡ SOS 3-Tap' },
  { id: 'kit', label: '🧪 Kit 7 Pilastri & P0', shortLabel: '🧪 Kit & P0' },
  { id: 'offers', label: '💶 Offerte €/ciclo & INCI', shortLabel: '💶 €/ciclo & INCI' },
  { id: 'maintenance', label: '🛡️ Elettrodomestici & Miti', shortLabel: '🛡️ Casa & Miti' }
];

const SURFACE_ICONS = {
  marmo_ardesia_graniglia: '🏛️',
  gres_porcellanato: '🧱',
  acciaio_inox_satinato: '✨',
  cromature_rubinetteria: '🚿',
  cristallo_doccia_vetro: '🪟',
  silicone_fughe_sanitari: '🛁',
  alluminio_anfotero: '☕',
  ptfe_antiaderente: '🍳',
  ghisa_stagionata: '🔥',
  rame_stagnato: '🥘',
  parquet_legno: '🪵',
  cotone_lino_resistenti: '👕',
  lana_seta_delicati: '🧶',
  microfibra_sintetici_vela: '⛵',
  barca_aisi316_gelcoat: '⚓'
};

const REAGENT_OPTIONS = [
  'Acido Citrico 15%',
  'Candeggina (Ipoclorito NaClO)',
  'Sodio Percarbonato',
  'Soda Solvay (Carbonato di Sodio)',
  'Ammoniaca',
  'Aceto Bianco',
  'Anticalcare Acido (Viakal)',
  'Acido Muriatico (Cloridrico)',
  'Detersivo Piatti (Anionico)',
  'Disinfettante Benzalconio (Cationico)',
  'Detersivo Universale con Proteasi',
  'Ammorbidente Cationico (Esterquat)'
];

const CONTAINER_OR_TARGET_OPTIONS = [
  { value: '', label: 'Vaschetta / Bacinella aperta su superficie neutra' },
  { value: 'flacone spray chiuso ermetico', label: '⚠️ Flacone Spray chiuso ermeticamente' },
  { value: 'bottiglia acqua minerale PET', label: '⚠️ Bottiglia ex-acqua minerale / bibita' },
  { value: 'Marmo di Carrara / Ardesia Ligure', label: '🏛️ Su Marmo di Carrara o Ardesia Ligure' },
  { value: 'Acciaio Inox 18/10', label: '✨ Su Acciaio Inox 18/10 / Lavello' },
  { value: 'Moka in alluminio / Filtro cappa alluminio', label: '☕ Su Moka o Filtro Cappa in Alluminio' },
  { value: 'Maglione in lana cashmere / seta', label: '🧶 Su Lana, Cashmere o Seta' },
  { value: 'Panni in microfibra / Capi vela', label: '⛵ Su Panni Microfibra o Capi Tecnici Vela' }
];

const INCI_PRESETS = [
  {
    label: 'Polvere Bianchi Completa',
    inci: 'Sodium Sulfate, Sodium Carbonate Peroxide, Sodium Dodecylbenzenesulfonate, Zeolite, TAED, Subtilisin, Alpha-Amylase, Lipase, Citric Acid'
  },
  {
    label: 'Ammorbidente Commerciale',
    inci: 'Aqua, Dihydrogenated Palmoylethyl Hydroxyethylmonium Methosulfate, Esterquat, Parfum, Benzisothiazolinone'
  },
  {
    label: 'Finto Eco "Bicarbonato & Aceto"',
    inci: 'Aqua, Sodium Laureth Sulfate, Cocamidopropyl Betaine, Parfum, Sodium Bicarbonate, Vinegar'
  }
];

const DEFAULT_OWNED_KIT = [
  'acido_citrico_puro',
  'detersivo_piatti_neutro',
  'disinfettante_pmc_e_microfibra'
];

function loadInitialOwnedKit() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const saved = window.localStorage.getItem('basilico_owned_kit_v2');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    }
  } catch (_) {}
  return DEFAULT_OWNED_KIT;
}

export function HomeChemistryView({
  activeProfileId = 'dany',
  onAddToShoppingList,
  onNavigateRoom,
  onOpenMaestro
}) {
  const [activeTab, setActiveTab] = useState('sos');
  const [waterHardnessF, setWaterHardnessF] = useState(18);
  const [boatMode, setBoatMode] = useState(false);
  const [ownedKitKeys, setOwnedKitKeys] = useState(loadInitialOwnedKit);

  // Catalog & Endpoints state
  const [matrix, setMatrix] = useState(null);
  const [selectedSurface, setSelectedSurface] = useState('acciaio_inox_satinato');
  const [selectedSoil, setSelectedSoil] = useState('lipid_polymerized');
  const [solvedProtocol, setSolvedProtocol] = useState(null);
  const [solving, setSolving] = useState(false);

  const [kitGuide, setKitGuide] = useState(null);
  const [reagentA, setReagentA] = useState('Candeggina (Ipoclorito NaClO)');
  const [reagentB, setReagentB] = useState('Acido Citrico 15%');
  const [targetContext, setTargetContext] = useState('');
  const [safetyResult, setSafetyResult] = useState(null);

  const [offersReport, setOffersReport] = useState(null);
  const [inciInput, setInciInput] = useState(INCI_PRESETS[0].inci);
  const [inciDecoded, setInciDecoded] = useState(null);

  const [appliancesData, setAppliancesData] = useState(null);
  const [myths, setMyths] = useState([]);

  // Persist owned kit locally
  const toggleOwnedKitKey = (key) => {
    setOwnedKitKeys((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem('basilico_owned_kit_v2', JSON.stringify(next));
        }
      } catch (_) {}
      return next;
    });
  };

  // Initial load of matrix, myths, appliances
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [matRes, mythsRes] = await Promise.all([
          fetch('/api/home-chemistry/matrix').then((r) => (r.ok ? r.json() : null)),
          fetch('/api/home-chemistry/myths').then((r) => (r.ok ? r.json() : null))
        ]);
        if (!cancelled) {
          if (matRes) setMatrix(matRes);
          if (mythsRes?.myths) setMyths(mythsRes.myths);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Switch surface automatically when toggling Boat Mode
  const handleToggleBoatMode = () => {
    setBoatMode((prev) => {
      const next = !prev;
      if (next) {
        setSelectedSurface('barca_aisi316_gelcoat');
        setSelectedSoil('inorganic_limescale_soapscum');
      }
      return next;
    });
  };

  // Solve 4-axis protocol whenever SOS inputs change
  const runSolve = useCallback(async () => {
    setSolving(true);
    try {
      const res = await fetch('/api/home-chemistry/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          surface: selectedSurface,
          soil: selectedSoil,
          ownedKitKeys,
          waterHardnessF,
          boatMode,
          profileId: activeProfileId
        })
      });
      if (res.ok) {
        setSolvedProtocol(await res.json());
      }
    } catch (_) {}
    setSolving(false);
  }, [selectedSurface, selectedSoil, ownedKitKeys, waterHardnessF, boatMode, activeProfileId]);

  useEffect(() => {
    runSolve();
  }, [runSolve]);

  // Refresh Minimal Kit, Offers & Appliances when waterHardnessF or ownedKitKeys change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ownedCsv = encodeURIComponent(ownedKitKeys.join(','));
        const [kitRes, offersRes, appRes] = await Promise.all([
          fetch(`/api/home-chemistry/minimal-kit?waterHardnessF=${waterHardnessF}&owned=${ownedCsv}`).then(
            (r) => (r.ok ? r.json() : null)
          ),
          fetch(`/api/home-chemistry/offers-value?waterHardnessF=${waterHardnessF}`).then((r) =>
            r.ok ? r.json() : null
          ),
          fetch(`/api/home-chemistry/appliances?waterHardnessF=${waterHardnessF}`).then((r) =>
            r.ok ? r.json() : null
          )
        ]);
        if (!cancelled) {
          if (kitRes) setKitGuide(kitRes);
          if (offersRes) setOffersReport(offersRes);
          if (appRes) setAppliancesData(appRes);
        }
      } catch (_) {}
    })();
    return () => {
      cancelled = true;
    };
  }, [waterHardnessF, ownedKitKeys]);

  // Live Mixture Safety Check
  const runSafetyCheck = useCallback(async () => {
    try {
      const res = await fetch('/api/home-chemistry/safety-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reagents: [reagentA, reagentB].filter(Boolean),
          surface: targetContext,
          containerType: targetContext,
          boatMode
        })
      });
      if (res.ok) {
        setSafetyResult(await res.json());
      }
    } catch (_) {}
  }, [reagentA, reagentB, targetContext, boatMode]);

  useEffect(() => {
    runSafetyCheck();
  }, [runSafetyCheck]);

  // Decode INCI
  const handleDecodeInci = useCallback(async (rawText) => {
    try {
      const res = await fetch('/api/home-chemistry/decode-inci', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inci: rawText })
      });
      if (res.ok) {
        setInciDecoded(await res.json());
      }
    } catch (_) {}
  }, []);

  useEffect(() => {
    handleDecodeInci(inciInput);
  }, [inciInput, handleDecodeInci]);

  const surfaces = matrix?.surfacesAndFabrics || [];
  const soils = matrix?.soilTaxonomy || [];
  const kitPillars = kitGuide?.pillars || matrix?.minimalChemicalKit || [];

  return (
    <div className="space-y-5" data-testid="room-7-home-chemistry">
      {/* 1. HEADER STANZA 7 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-900">
                Stanza 7 · Chimica Applicata (Reg. CE 648/2004)
              </span>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200">
                💧 Acqua Iren Rapallo: 14–22 °f (Attuale: {waterHardnessF} °f)
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
              🧼 Chimica & Cura Scientifica della Casa e della Barca
            </h2>
            <p className="text-xs text-slate-600 max-w-3xl">
              Motore deterministico a 4 assi (<em>Sporco × Substrato × Principio Attivo × Cerchio di Sinner</em>) con
              guardie salvavita <strong>P0</strong>, tutela marmi/ardesie liguri e arbitraggio reale <code>€/ciclo</code> su{' '}
              <strong>Tigotà</strong>, <strong>PiùMe</strong> e supermercati di Rapallo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleBoatMode}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                boatMode
                  ? 'bg-sky-900 text-white border-sky-800 shadow-xs'
                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-sky-300'
              }`}
            >
              ⚓ Modalità Barca (AISI 316 / Mare): {boatMode ? 'ATTIVA' : 'OFF'}
            </button>

            {onOpenMaestro && (
              <button
                type="button"
                onClick={() =>
                  onOpenMaestro(
                    'Ho un dubbio chimico sulle pulizie di casa a Rapallo: cosa uso in sicurezza senza rovinare le superfici?'
                  )
                }
                className="px-3 py-2 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                💬 Chiedi al Chimico (Maestro)
              </button>
            )}

            {onNavigateRoom && (
              <button
                type="button"
                onClick={() => onNavigateRoom('room-4-cucina')}
                className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 text-xs font-bold rounded-xl cursor-pointer"
              >
                🍳 Officina Pentole →
              </button>
            )}
          </div>
        </div>

        {/* Calibrazione rapida Durezza Acqua Rapallo */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <label htmlFor="rapallo-hardness-slider" className="font-bold text-slate-700 shrink-0">
              💧 Durezza Acqua (°f):
            </label>
            <input
              id="rapallo-hardness-slider"
              type="range"
              min={8}
              max={38}
              value={waterHardnessF}
              onChange={(e) => setWaterHardnessF(Number(e.target.value))}
              className="w-36 sm:w-48 accent-sky-700 cursor-pointer"
            />
            <span className="font-extrabold text-sky-900 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded">
              {waterHardnessF} °f
            </span>
            {waterHardnessF !== 18 && (
              <button
                type="button"
                onClick={() => setWaterHardnessF(18)}
                className="text-[11px] underline text-slate-500 hover:text-slate-800 cursor-pointer"
              >
                Reset Rapallo (18 °f)
              </button>
            )}
          </div>
          <div className="text-[11px] text-slate-600">
            Fattore dosaggio detersivo vs standard UE (25 °f):{' '}
            <strong className="text-slate-900">
              {kitGuide?.waterHardness?.detergentMultiplierVsEu25F ?? 1.0}×
            </strong>{' '}
            ({kitGuide?.waterHardness?.label || 'Acqua Media — Tipica Rapallo'})
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1" role="tablist" aria-label="Sezioni Chimica Casa">
          {TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`py-2.5 px-3 rounded-xl text-xs font-extrabold border text-center transition-all cursor-pointer ${
                  active
                    ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <span className="hidden sm:inline">{tab.label}</span>
                <span className="sm:hidden">{tab.shortLabel}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* =====================================================================
          TAB 1: SOS MACCHIA & INCROSTAZIONE IN 3 TAP
         ===================================================================== */}
      {activeTab === 'sos' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: 3-Tap Inputs */}
            <div className="lg:col-span-7 space-y-4">
              {/* Tap 1: Superficie / Tessuto */}
              <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-slate-900">
                    1️⃣ Tap 1 — Quale superficie o tessuto devi trattare?
                  </h3>
                  <span className="text-[11px] text-slate-500">{surfaces.length} substrati</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {surfaces.map((surf) => {
                    const isSelected = selectedSurface === surf.id;
                    return (
                      <button
                        key={surf.id}
                        type="button"
                        onClick={() => setSelectedSurface(surf.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-900 text-white border-emerald-800 shadow-xs'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-300'
                        }`}
                      >
                        <div className="font-bold leading-snug">
                          {SURFACE_ICONS[surf.id] || '🧼'} {surf.name.split('(')[0].trim()}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 ${
                            isSelected ? 'text-emerald-200' : 'text-slate-500'
                          }`}
                        >
                          pH sicuro: {surf.safePhRange?.[0]}–{surf.safePhRange?.[1]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Tap 2: Natura dello Sporco */}
              <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">
                  2️⃣ Tap 2 — Qual è la natura chimica dello sporco o della macchia?
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {soils.map((soil) => {
                    const isSelected = selectedSoil === soil.id;
                    return (
                      <button
                        key={soil.id}
                        type="button"
                        onClick={() => setSelectedSoil(soil.id)}
                        className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-sky-900 text-white border-sky-800 shadow-xs'
                            : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-sky-300'
                        }`}
                      >
                        <div className="font-extrabold">
                          [{soil.code}] {soil.name}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 line-clamp-1 ${
                            isSelected ? 'text-sky-200' : 'text-slate-500'
                          }`}
                        >
                          Es: {(soil.examples || []).slice(0, 3).join(', ')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Tap 3: Checklist Sottolavello / Kit posseduto */}
              <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    3️⃣ Tap 3 — Cosa hai già in casa nel tuo Armadietto Chimico?
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Spunta i pilastri che possiedi: il protocollo evidenzierà cosa puoi usare subito e cosa comprare da Tigotà/PiùMe.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {kitPillars.map((pillar) => {
                    const isOwned = ownedKitKeys.includes(pillar.key);
                    return (
                      <button
                        key={pillar.key}
                        type="button"
                        onClick={() => toggleOwnedKitKey(pillar.key)}
                        className={`px-2.5 py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          isOwned
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {isOwned ? '✓ ' : '+ '}
                        {pillar.name.split('—')[0].split('(')[0].trim()}
                      </button>
                    );
                  })}
                </div>
              </section>
            </div>

            {/* Right Column: Deterministic Sinner Protocol Output */}
            <div className="lg:col-span-5">
              <section className="bg-white rounded-2xl border-2 border-slate-900 p-4 sm:p-5 shadow-sm space-y-4 sticky top-4">
                {solving && !solvedProtocol ? (
                  <div className="py-10 text-center text-xs text-slate-500">
                    Calcolo stechiometria e Cerchio di Sinner...
                  </div>
                ) : solvedProtocol ? (
                  <>
                    <div className="border-b border-slate-100 pb-3">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                        Protocollo Scientifico Validato
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 mt-1.5">
                        {solvedProtocol.title}
                      </h3>
                      <p className="text-[11px] text-slate-600 mt-1">
                        {solvedProtocol.soil?.chemicalMechanism}
                      </p>
                    </div>

                    {/* RED P0 / P1 ALERT: DO NOT DO FIRST */}
                    <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-400 text-xs text-rose-950 space-y-1.5">
                      <div className="font-extrabold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
                        <span>⛔ COSA NON FARE PER PRIMO (Guardia P0/P1)</span>
                      </div>
                      <p className="font-bold leading-relaxed">{solvedProtocol.doNotDoFirst}</p>
                      {(solvedProtocol.p0SafetyLocks || []).map((lock) => (
                        <div
                          key={lock.id}
                          className="mt-1.5 pt-1.5 border-t border-rose-200 text-[11px] text-rose-900"
                        >
                          <strong>[{lock.code}]</strong> {lock.mandatoryRule}
                        </div>
                      ))}
                    </div>

                    {/* SINNER'S CIRCLE BAR (C + T + t + M = 100%) */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-slate-800">
                          🔄 Cerchio di Sinner ({solvedProtocol.sinnerCircle?.totalPct || 100}%)
                        </span>
                        <span className="text-[10px] text-slate-500">Bilanciamento energia</span>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden flex bg-slate-100 border border-slate-200">
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.chemistryPct || 25}%` }}
                          className="bg-emerald-600"
                          title="Chimica"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.tempPct || 25}%` }}
                          className="bg-amber-500"
                          title="Temperatura"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.timePct || 25}%` }}
                          className="bg-sky-600"
                          title="Tempo di contatto"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.mechanicalPct || 25}%` }}
                          className="bg-purple-600"
                          title="Azione Meccanica"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-bold pt-0.5">
                        <span className="text-emerald-800">
                          🧪 Chimica: {solvedProtocol.sinnerCircle?.chemistryPct}%
                        </span>
                        <span className="text-amber-800">
                          🌡️ Temp: {solvedProtocol.sinnerCircle?.tempPct}%
                        </span>
                        <span className="text-sky-800">
                          ⏱️ Tempo: {solvedProtocol.sinnerCircle?.timePct}%
                        </span>
                        <span className="text-purple-800">
                          🧽 Meccanica: {solvedProtocol.sinnerCircle?.mechanicalPct}%
                        </span>
                      </div>
                    </div>

                    {/* Active Molecules / Required Kit Pillars */}
                    <div className="space-y-2">
                      <div className="text-xs font-extrabold text-slate-800">
                        🧴 Principi Attivi Consigliati (calibrati su {waterHardnessF} °f):
                      </div>
                      <div className="space-y-2">
                        {(solvedProtocol.requiredKitPillars || []).map((req) => (
                          <div
                            key={req.key}
                            className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                              req.owned
                                ? 'bg-emerald-50/60 border-emerald-200'
                                : 'bg-amber-50/60 border-amber-200'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-slate-900">
                                {req.owned ? '✓ Già in casa: ' : '🛒 Ti manca: '}
                                {req.name}
                              </div>
                              <div className="text-[11px] text-slate-600 mt-0.5">{req.formula}</div>
                            </div>
                            {!req.owned && onAddToShoppingList && (
                              <button
                                type="button"
                                onClick={() =>
                                  onAddToShoppingList({
                                    name: req.name,
                                    domain: 'home_cleaning',
                                    source: 'home_chemistry_sos',
                                    unitPriceEur: Number(req.referencePriceEuro || 2.99),
                                    preferredChain: 'Tigotà / PiùMe Rapallo'
                                  })
                                }
                                className="px-2 py-1 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[10px] font-extrabold shrink-0 cursor-pointer"
                              >
                                + Lista
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Step-by-Step Procedure */}
                    <div className="space-y-1.5 pt-2 border-t border-slate-100">
                      <div className="text-xs font-extrabold text-slate-900">
                        📋 Procedura Operativa Step-by-Step:
                      </div>
                      <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1.5 leading-relaxed">
                        {(solvedProtocol.steps || []).map((st, idx) => (
                          <li key={idx}>{st}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Material Science Footnote */}
                    {solvedProtocol.surface?.materialNote && (
                      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
                        <strong>🔬 Scienza del Substrato:</strong> {solvedProtocol.surface.materialNote}
                      </div>
                    )}
                  </>
                ) : null}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          TAB 2: IL KIT MINIMO CHIMICO (7 PILASTRI) & GUARDIE P0 POLVERI PURE
         ===================================================================== */}
      {activeTab === 'kit' && (
        <div className="space-y-5">
          {/* 3 Guardie P0 Salvavita Polveri Pure */}
          <section className="bg-rose-50 rounded-2xl border-2 border-rose-400 p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-700 text-white">
                  Guardie Inviolabili P0 · Autoproduzione Sicura
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-rose-950 mt-1">
                  ☠️ I 3 Divieti Salvavita sulle Polveri Pure (Contro la fallacia &ldquo;Naturale = Innocuo&rdquo;)
                </h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(kitGuide?.purePowderSafetyLocksP0 || []).map((lock) => (
                <div
                  key={lock.id}
                  className="bg-white rounded-xl border border-rose-300 p-3.5 text-xs space-y-1.5 shadow-2xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-rose-900">{lock.code}</span>
                    <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded bg-rose-100 text-rose-900">
                      {lock.severity}
                    </span>
                  </div>
                  <div className="font-bold text-slate-900">{lock.reagentA}</div>
                  <div className="font-mono text-[10px] bg-slate-50 p-1.5 rounded border border-slate-200 text-slate-700">
                    {lock.hazardFormula}
                  </div>
                  <p className="text-[11px] text-slate-700">{lock.clinicalRisk}</p>
                  <p className="text-[11px] font-extrabold text-rose-800">{lock.mandatoryRule}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Verificatore Sicurezza Miscele Live */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                🚦 Verificatore Live Sicurezza Miscele & Contenitori (Semaforo Chimico P0)
              </h3>
              <p className="text-xs text-slate-500">
                Prima di mescolare due prodotti o travasarli in un contenitore, verifica la compatibilità chimica deterministica.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prodotto / Reagente A</label>
                <select
                  value={reagentA}
                  onChange={(e) => setReagentA(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-semibold"
                >
                  {REAGENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Prodotto / Reagente B</label>
                <select
                  value={reagentB}
                  onChange={(e) => setReagentB(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-semibold"
                >
                  <option value="">(Nessun secondo reagente)</option>
                  {REAGENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-slate-700 mb-1">Contenitore / Superficie</label>
                <select
                  value={targetContext}
                  onChange={(e) => setTargetContext(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-semibold"
                >
                  {CONTAINER_OR_TARGET_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preset rapidi di test P0 */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold text-slate-500">Test rapidi:</span>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Candeggina (Ipoclorito NaClO)');
                  setReagentB('Anticalcare Acido (Viakal)');
                  setTargetContext('');
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
              >
                Candeggina + Viakal
              </button>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Sodio Percarbonato');
                  setReagentB('');
                  setTargetContext('flacone spray chiuso ermetico');
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
              >
                Percarbonato in Spray Chiuso
              </button>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Soda Solvay (Carbonato di Sodio)');
                  setReagentB('');
                  setTargetContext('Moka in alluminio / Filtro cappa alluminio');
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
              >
                Soda Solvay su Moka Alluminio
              </button>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Acido Citrico 15%');
                  setReagentB('');
                  setTargetContext('Marmo di Carrara / Ardesia Ligure');
                }}
                className="px-2 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 font-semibold text-slate-700 cursor-pointer"
              >
                Acido Citrico su Marmo Ligure
              </button>
            </div>

            {safetyResult && (
              <div
                className={`p-3.5 rounded-xl border-2 text-xs space-y-2 ${
                  safetyResult.blockedByP0
                    ? 'bg-rose-50 border-rose-500 text-rose-950'
                    : safetyResult.blockedByP1
                      ? 'bg-amber-50 border-amber-400 text-amber-950'
                      : 'bg-emerald-50 border-emerald-400 text-emerald-950'
                }`}
              >
                <div className="font-extrabold text-sm">
                  {safetyResult.blockedByP0
                    ? `🔴 BLOCCO CHIMICO ${safetyResult.highestSeverity} — VIETATO PROCEDERE!`
                    : safetyResult.blockedByP1
                      ? `🟠 ALLERTA DANNO MATERIALI (${safetyResult.highestSeverity})`
                      : '🟢 SEMAFORO VERDE — Nessuna incompatibilità chimica critica rilevata'}
                </div>
                {(safetyResult.violations || []).map((v) => (
                  <div key={v.id} className="bg-white/90 p-2.5 rounded-lg border border-slate-200 space-y-1">
                    <div className="font-bold">
                      [{v.code}] {v.reagentA} + {v.reagentB} → {v.toxicProduct}
                    </div>
                    <div className="font-mono text-[11px] text-slate-700">{v.hazardFormula}</div>
                    <div className="text-[11px] font-semibold">{v.mandatoryRule}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* I 7 Pilastri del Kit Minimo Chimico */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                  🧪 Il Kit Minimo Chimico a 7 Pilastri (Sostituisce {kitGuide?.totalCommercialBottlesReplaced || 25}+ Flaconi Marketing)
                </h3>
                <p className="text-xs text-slate-600">
                  Costo intero set di riferimento a Rapallo:{' '}
                  <strong>~€ {Number(kitGuide?.fullKitReferenceCostEuro || 30.57).toFixed(2)}</strong> • Calibrato su{' '}
                  <strong>{waterHardnessF} °f</strong>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kitPillars.map((p) => {
                const isOwned = ownedKitKeys.includes(p.key);
                return (
                  <article
                    key={p.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between gap-3 text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-sky-100 text-sky-900">
                            Pilastro #{p.pillarNumber}
                          </span>
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1">{p.name}</h4>
                        </div>
                        <span className="text-xs font-extrabold text-emerald-800 shrink-0">
                          ~€ {Number(p.referencePriceEuro).toFixed(2)}
                        </span>
                      </div>

                      <div
                        className={`p-2.5 rounded-xl border text-[11px] ${
                          p.preparedSolutionRecipe?.allowedInClosedSprayBottle
                            ? 'bg-emerald-50/60 border-emerald-200 text-emerald-950'
                            : 'bg-amber-50/70 border-amber-300 text-amber-950'
                        }`}
                      >
                        <div className="font-extrabold">
                          {p.preparedSolutionRecipe?.allowedInClosedSprayBottle
                            ? '✓ Stoccabile in flacone opaco child-proof etichettato'
                            : '⛔ VIETATO chiudere in flacone spray — Solo uso estemporaneo aperto'}
                        </div>
                        <p className="mt-0.5">{p.preparedSolutionRecipe?.formula}</p>
                      </div>

                      {p.preparedSolutionRecipe?.rapalloDosages && (
                        <div className="space-y-1">
                          <div className="font-bold text-slate-700">Dosaggi Rapallo ({waterHardnessF} °f):</div>
                          <ul className="list-disc list-inside text-[11px] text-slate-600 space-y-0.5">
                            {Object.values(p.preparedSolutionRecipe.rapalloDosages).map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="text-[11px] text-slate-500">
                        <strong>Elimina dal carrello:</strong>{' '}
                        {(p.replacedCommercialProducts || []).join(' • ')}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOwnedKitKey(p.key)}
                        className={`px-3 py-1.5 rounded-lg font-extrabold cursor-pointer ${
                          isOwned
                            ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                            : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}
                      >
                        {isOwned ? '✓ Posseduto in casa' : 'Segna come posseduto'}
                      </button>
                      {!isOwned && onAddToShoppingList && (
                        <button
                          type="button"
                          onClick={() =>
                            onAddToShoppingList({
                              name: p.name,
                              domain: 'home_cleaning',
                              source: 'minimal_kit_room7',
                              unitPriceEur: Number(p.referencePriceEuro || 2.99),
                              preferredChain: 'Tigotà / PiùMe Rapallo'
                            })
                          }
                          className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold cursor-pointer"
                        >
                          + Aggiungi a Lista Spesa
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 3: OFFERTE TIGOTÀ / PIÙME / GDO (€/CICLO) & DECODIFICA INCI
         ===================================================================== */}
      {activeTab === 'offers' && (
        <div className="space-y-5">
          {/* Decodificatore INCI Detergenti Reg. CE 648/2004 */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  🔬 Decodificatore INCI Detergenti (Reg. CE 648/2004 — Anti-Greenwashing)
                </h3>
                <p className="text-xs text-slate-500">
                  Incolla gli ingredienti dal retro del flacone o dalla scheda online per vedere i veri principi attivi e i divieti sui tessuti.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INCI_PRESETS.map((pr) => (
                  <button
                    key={pr.label}
                    type="button"
                    onClick={() => setInciInput(pr.inci)}
                    className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer"
                  >
                    {pr.label}
                  </button>
                ))}
              </div>
            </div>

            <textarea
              rows={2}
              value={inciInput}
              onChange={(e) => setInciInput(e.target.value)}
              placeholder="Es. Aqua, Sodium Laureth Sulfate, Sodium Carbonate Peroxide, TAED, Subtilisin..."
              className="w-full p-3 rounded-xl border border-slate-300 text-xs font-mono bg-slate-50"
            />

            {inciDecoded && (
              <div className="space-y-2 text-xs">
                {(inciDecoded.warnings || []).map((w, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-amber-50 border border-amber-300 text-amber-950 font-bold"
                  >
                    ⚠️ {w}
                  </div>
                ))}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {(inciDecoded.detectedActives || []).map((act) => (
                    <div
                      key={act.id}
                      className="p-2.5 rounded-xl bg-emerald-50/50 border border-emerald-200 space-y-0.5"
                    >
                      <div className="font-extrabold text-emerald-950">{act.name}</div>
                      <p className="text-[11px] text-slate-700">{act.primaryFunction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Offerte Vere Cura Casa Rapallo */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  💶 Offerte Vere Detergenza a Rapallo ({offersReport?.totalCleaningOffers || 0} attive · Zero Profumi/Bazar)
                </h3>
                <p className="text-xs text-slate-500">
                  Valutazione rigorosa <code>ADR-0006</code>: <code>€/ciclo</code> calcolato solo su formati espliciti e{' '}
                  <strong>Dominanza d&apos;Intervallo Reg. 648/2004</strong> senza percentuali inventate.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(offersReport?.offers || []).map((off, idx) => (
                <div
                  key={off.id || idx}
                  className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/60 flex flex-col justify-between gap-2.5 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                        📍 {off.storeName || off.storeId}
                      </span>
                      <span className="text-sm font-extrabold text-emerald-800">
                        € {Number(off.promoPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="font-bold text-slate-900">{off.title}</div>

                    {off.costPerRapalloCycleEur !== null ? (
                      <div className="text-[11px] font-bold text-sky-900 bg-sky-50 border border-sky-200 rounded-lg px-2 py-1">
                        🧺 Costo reale a {waterHardnessF} °f:{' '}
                        <strong>€ {off.costPerRapalloCycleEur.toFixed(2)} / ciclo</strong> ({off.washCount} cicli std)
                      </div>
                    ) : (
                      <div className="text-[10px] text-slate-500 italic">
                        Formato/lavaggi omessi sul testo volantino (nessuna stima sintetica per ADR-0006)
                      </div>
                    )}

                    {off.intervalDominanceComparison?.dominanceProven && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                        <strong>💡 Dominanza Kit Minimo:</strong> anche al tetto massimo legale (
                        {off.intervalDominanceComparison.assumedCommercialUpperBoundPct}% attivo), il principio puro del
                        Kit fa risparmiare{' '}
                        <strong>≥ {off.intervalDominanceComparison.certifiedMinSavingsPct}%</strong>!
                      </div>
                    )}

                    {(off.safetyWarnings || []).map((sw, i) => (
                      <div key={i} className="text-[10px] font-semibold text-rose-800">
                        ⚠️ {sw}
                      </div>
                    ))}
                  </div>

                  {onAddToShoppingList && (
                    <button
                      type="button"
                      onClick={() =>
                        onAddToShoppingList({
                          name: off.title,
                          domain: 'home_cleaning',
                          source: 'room7_offers',
                          unitPriceEur: Number(off.promoPrice || 0),
                          preferredChain: off.storeName || 'Rapallo',
                          storeId: off.storeId || null,
                          onPromo: true
                        })
                      }
                      className="w-full py-1.5 px-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-extrabold cursor-pointer"
                    >
                      + Aggiungi a Lista Spesa
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 4: MANUTENZIONE ELETTRODOMESTICI & MYTH-BUSTER STECHIOMETRICO
         ===================================================================== */}
      {activeTab === 'maintenance' && (
        <div className="space-y-5">
          {/* Piani Anti-Guasto Elettrodomestici */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                🛡️ Piano Manutenzione Programmata Anti-Guasto (Tutela CapEx Elettrodomestici & Barca)
              </h3>
              <p className="text-xs text-slate-600">
                Pochi euro l&apos;anno di Acido Citrico e Percarbonato raddoppiano la vita utile di lavatrice, lavastoviglie, frigo, cappa e dotazioni di bordo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(appliancesData?.appliances || []).map((app) => (
                <article
                  key={app.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                        ⏱️ {app.frequency}
                      </span>
                      <h4 className="text-sm font-extrabold text-slate-900 mt-1">{app.applianceName}</h4>
                    </div>
                    {app.capexProtectedRangeEuro && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        Protegge €{app.capexProtectedRangeEuro[0]}–{app.capexProtectedRangeEuro[1]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-sky-900 bg-sky-50 border border-sky-200 p-2 rounded-xl">
                    <strong>💧 Nota Acqua Rapallo:</strong> {app.rapalloWaterNote}
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700 leading-relaxed">
                    {(app.decoupledSteps || []).map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </article>
              ))}

              {appliancesData?.boatCareModule && (
                <article className="bg-sky-950 text-white rounded-2xl border border-sky-800 p-4 shadow-xs space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-sky-800 pb-2">
                    <div>
                      <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-sky-700 text-white">
                        ⚓ Modulo Nautico Golfo del Tigullio
                      </span>
                      <h4 className="text-sm font-extrabold mt-1">
                        {appliancesData.boatCareModule.title}
                      </h4>
                    </div>
                  </div>
                  <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-500 text-rose-100 font-bold text-[11px]">
                    ⛔ {appliancesData.boatCareModule.doNotDoFirst}
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-sky-100 leading-relaxed">
                    {(appliancesData.boatCareModule.steps || []).map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </article>
              )}
            </div>
          </section>

          {/* Myth-Buster Stechiometrico */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900">
                🧪 Myth-Buster Stechiometrico — Falsi Miti Domestici Smontati con la Chimica
              </h3>
              <p className="text-xs text-slate-600">
                Perché le &ldquo;ricette magiche del web&rdquo; producono acqua salata inerte o corrodono silenziosamente lavatrice e tessuti.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myths.map((m) => (
                <article
                  key={m.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-slate-900">❌ &ldquo;{m.mythTitle}&rdquo;</h4>
                    <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-900 text-[10px] font-extrabold shrink-0">
                      {m.verdict.split('(')[0].trim()}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] bg-slate-50 border border-slate-200 p-2 rounded-lg text-slate-800">
                    {m.stoichiometry}
                  </div>
                  <p className="text-[11px] text-slate-500">
                    <strong>Illusione ottica:</strong> {m.visualIllusion}
                  </p>
                  <p className="text-[11px] text-slate-800 leading-relaxed">
                    <strong>Realtà chimica:</strong> {m.chemicalTruth}
                  </p>
                </article>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default HomeChemistryView;
