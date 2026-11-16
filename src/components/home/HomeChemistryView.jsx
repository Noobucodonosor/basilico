import React, { useState, useEffect, useCallback } from 'react';

const TABS = [
  { id: 'sos', label: 'Smacchiatore guidato', shortLabel: 'Smacchiatore' },
  { id: 'kit', label: 'I 7 prodotti base & Sicurezza', shortLabel: 'Base & Sicurezza' },
  { id: 'offers', label: 'Prezzi a lavaggio & Etichette', shortLabel: 'Prezzi & Etichette' },
  { id: 'maintenance', label: 'Elettrodomestici & Falsi miti', shortLabel: 'Cura & Miti' }
];

const SAFETY_LOCK_TITLES = {
  'P0-PRESSURE-BURST': 'Mai chiudere il percarbonato in uno spruzzino',
  'P0-CAV-INGESTION': "Mai travasare in bottiglie d'acqua",
  'P0-DUST-AEROSOL': 'Usa erogatori a schiuma o un panno, mai aerosol',
  'P0-CL2-LETHAL': 'Mai mescolare candeggina e acidi (gas tossico)',
  'P0-NH2CL-LETHAL': 'Mai mescolare candeggina e ammoniaca',
  'P0-PERACETIC': 'Mai mescolare aceto e acqua ossigenata',
  'P0-ALUMINUM-CORROSION': "Mai sgrassatori forti o soda sull'alluminio",
  'P0-BIOCIDE-FAIL': 'Risciacqua il sapone prima di disinfettare',
  'P1-ACID-MARBLE-SLATE': 'Mai acidi o aceto su marmo, ardesia e graniglia',
  'P1-BLEACH-INOX-PITTING': "Mai candeggina sull'acciaio inox"
};

function getSafetyLockTitle(lock) {
  if (!lock) return 'Avviso di sicurezza';
  return SAFETY_LOCK_TITLES[lock.code] || lock.reagentA || lock.title || 'Avviso di sicurezza';
}

function formatSeverityLabel(severity) {
  if (severity === 'P0-LETHAL') return 'Pericolo grave';
  if (severity === 'P0-CRITICAL') return 'Attenzione critica';
  if (severity === 'P1-DAMAGE') return 'Rischio danni';
  return 'Avviso';
}

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
      <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA]">
                Casa e barca · Pulizie sicure
              </span>
              <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#1B5E3A] border border-emerald-200">
                💧 Acqua Iren Rapallo: 14–22 °f (attuale: {waterHardnessF} °f)
              </span>
            </div>
            <h2 className="text-lg sm:text-xl font-extrabold text-[#141A17] pt-1">
              Pulizie sicure per casa e barca
            </h2>
            <p className="text-xs text-[#575E58] max-w-3xl">
              Scegli la superficie e il tipo di sporco per avere i prodotti giusti, proteggere marmi e ardesie liguri e confrontare i veri prezzi a lavaggio tra Tigotà, PiùMe e supermercati di Rapallo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleToggleBoatMode}
              className={`px-3 py-2 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                boatMode
                  ? 'bg-[#141A17] text-white border-[#141A17] shadow-xs'
                  : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
              }`}
            >
              ⚓ Modalità barca: {boatMode ? 'Attiva' : 'Spenta'}
            </button>

            {onOpenMaestro && (
              <button
                type="button"
                onClick={() =>
                  onOpenMaestro(
                    'Ho un dubbio sulle pulizie di casa a Rapallo: cosa uso in sicurezza senza rovinare le superfici?'
                  )
                }
                className="px-3 py-2 bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold rounded-xl cursor-pointer transition-colors"
              >
                💬 Chiedi al Maestro
              </button>
            )}

            {onNavigateRoom && (
              <button
                type="button"
                onClick={() => onNavigateRoom('room-4-cucina')}
                className="px-3 py-2 bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#E5E2DA] text-xs font-bold rounded-xl cursor-pointer"
              >
                🍳 Pentole e fornelli →
              </button>
            )}
          </div>
        </div>

        {/* Calibrazione rapida Durezza Acqua Rapallo */}
        <div className="pt-3 border-t border-[#E5E2DA] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-3">
            <label htmlFor="rapallo-hardness-slider" className="font-bold text-[#141A17] shrink-0">
              💧 Durezza acqua (°f):
            </label>
            <input
              id="rapallo-hardness-slider"
              type="range"
              min={8}
              max={38}
              value={waterHardnessF}
              onChange={(e) => setWaterHardnessF(Number(e.target.value))}
              className="w-36 sm:w-48 accent-[#1B5E3A] cursor-pointer"
            />
            <span className="font-extrabold text-[#141A17] bg-[#F3F1EC] border border-[#E5E2DA] px-2 py-0.5 rounded">
              {waterHardnessF} °f
            </span>
            {waterHardnessF !== 18 && (
              <button
                type="button"
                onClick={() => setWaterHardnessF(18)}
                className="text-[11px] underline text-[#575E58] hover:text-[#141A17] cursor-pointer"
              >
                Ripristina Rapallo (18 °f)
              </button>
            )}
          </div>
          <div className="text-[11px] text-[#575E58]">
            Dosaggio consigliato rispetto allo standard UE (25 °f):{' '}
            <strong className="text-[#141A17]">
              {kitGuide?.waterHardness?.detergentMultiplierVsEu25F ?? 1.0}×
            </strong>{' '}
            ({kitGuide?.waterHardness?.label || 'Acqua Media — Tipica Rapallo'})
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 pt-1" role="tablist" aria-label="Sezioni Cura della Casa">
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
                    ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                    : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
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
          TAB 1: SMACCHIATORE GUIDATO
         ===================================================================== */}
      {activeTab === 'sos' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Left Column: 3-Tap Inputs */}
            <div className="lg:col-span-7 space-y-4">
              {/* Step 1: Superficie / Tessuto */}
              <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-2.5">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-extrabold text-[#141A17]">
                    1. Quale superficie o tessuto devi pulire?
                  </h3>
                  <span className="text-[11px] text-[#575E58]">{surfaces.length} materiali</span>
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
                            ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                            : 'bg-[#FAF9F6] text-[#141A17] border-[#E5E2DA] hover:border-[#1B5E3A]'
                        }`}
                      >
                        <div className="font-bold leading-snug">
                          {SURFACE_ICONS[surf.id] || '🧼'} {surf.name.split('(')[0].trim()}
                        </div>
                        <div
                          className={`text-[10px] mt-0.5 ${
                            isSelected ? 'text-emerald-100' : 'text-[#575E58]'
                          }`}
                        >
                          pH sicuro: {surf.safePhRange?.[0]}–{surf.safePhRange?.[1]}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 2: Natura dello Sporco */}
              <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-2.5">
                <h3 className="text-sm font-extrabold text-[#141A17]">
                  2. Che tipo di sporco o macchia devi togliere?
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
                            ? 'bg-[#141A17] text-white border-[#141A17] shadow-xs'
                            : 'bg-[#FAF9F6] text-[#141A17] border-[#E5E2DA] hover:border-[#1B5E3A]'
                        }`}
                      >
                        <div className="font-extrabold">{soil.name}</div>
                        <div
                          className={`text-[10px] mt-0.5 line-clamp-1 ${
                            isSelected ? 'text-stone-300' : 'text-[#575E58]'
                          }`}
                        >
                          Es: {(soil.examples || []).slice(0, 3).join(', ')}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* Step 3: Checklist Sottolavello / Kit posseduto */}
              <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-2.5">
                <div>
                  <h3 className="text-sm font-extrabold text-[#141A17]">
                    3. Cosa hai già in casa sotto il lavello?
                  </h3>
                  <p className="text-[11px] text-[#575E58]">
                    Spunta i prodotti base che possiedi per usare subito quello che hai già in armadietto.
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
                            ? 'bg-emerald-50 text-[#1B5E3A] border-[#1B5E3A]/40'
                            : 'bg-white text-[#575E58] border-[#E5E2DA] hover:bg-[#FAF9F6]'
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

            {/* Right Column: Protocol Output */}
            <div className="lg:col-span-5">
              <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4 sticky top-4">
                {solving && !solvedProtocol ? (
                  <div className="py-10 text-center text-xs text-[#575E58]">
                    Calcolo la soluzione migliore...
                  </div>
                ) : solvedProtocol ? (
                  <>
                    <div className="border-b border-[#E5E2DA] pb-3">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#1B5E3A] border border-emerald-200">
                        Procedura sicura
                      </span>
                      <h3 className="text-base font-extrabold text-[#141A17] mt-1.5">
                        {solvedProtocol.title}
                      </h3>
                      <p className="text-[11px] text-[#575E58] mt-1">
                        {solvedProtocol.soil?.chemicalMechanism}
                      </p>
                    </div>

                    {/* Genuine Safety Warning */}
                    <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950 space-y-1.5">
                      <div className="font-extrabold text-rose-900 uppercase tracking-wide flex items-center gap-1.5">
                        <span>⛔ Cosa non fare per prima cosa</span>
                      </div>
                      <p className="font-bold leading-relaxed">{solvedProtocol.doNotDoFirst}</p>
                      {(solvedProtocol.p0SafetyLocks || []).map((lock) => (
                        <div
                          key={lock.id}
                          className="mt-1.5 pt-1.5 border-t border-rose-200 text-[11px] text-rose-900 space-y-0.5"
                        >
                          <div className="font-extrabold">{getSafetyLockTitle(lock)}</div>
                          <div>{lock.mandatoryRule}</div>
                          {lock.code && (
                            <div className="text-[10px] font-mono text-rose-700/80">Rif.: {lock.code}</div>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Sinner's Circle Bar */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-extrabold text-[#141A17]">
                          Equilibrio della pulizia ({solvedProtocol.sinnerCircle?.totalPct || 100}%)
                        </span>
                        <span className="text-[10px] text-[#575E58]">Fattori in gioco</span>
                      </div>
                      <div className="w-full h-3 rounded-full overflow-hidden flex bg-[#F3F1EC] border border-[#E5E2DA]">
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.chemistryPct || 25}%` }}
                          className="bg-[#1B5E3A]"
                          title="Prodotto"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.tempPct || 25}%` }}
                          className="bg-[#9A5B25]"
                          title="Temperatura"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.timePct || 25}%` }}
                          className="bg-stone-500"
                          title="Tempo di posa"
                        />
                        <div
                          style={{ width: `${solvedProtocol.sinnerCircle?.mechanicalPct || 25}%` }}
                          className="bg-[#141A17]"
                          title="Azione meccanica"
                        />
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 text-[10px] font-bold pt-0.5">
                        <span className="text-[#1B5E3A]">
                          Prodotto: {solvedProtocol.sinnerCircle?.chemistryPct}%
                        </span>
                        <span className="text-[#9A5B25]">
                          Calore: {solvedProtocol.sinnerCircle?.tempPct}%
                        </span>
                        <span className="text-[#575E58]">
                          Tempo: {solvedProtocol.sinnerCircle?.timePct}%
                        </span>
                        <span className="text-[#141A17]">
                          Olio di gomito: {solvedProtocol.sinnerCircle?.mechanicalPct}%
                        </span>
                      </div>
                    </div>

                    {/* Active Ingredients */}
                    <div className="space-y-2">
                      <div className="text-xs font-extrabold text-[#141A17]">
                        Prodotti consigliati (calibrati su {waterHardnessF} °f):
                      </div>
                      <div className="space-y-2">
                        {(solvedProtocol.requiredKitPillars || []).map((req) => (
                          <div
                            key={req.key}
                            className={`p-2.5 rounded-xl border text-xs flex items-start justify-between gap-2 ${
                              req.owned
                                ? 'bg-[#FAF9F6] border-[#E5E2DA]'
                                : 'bg-amber-50/50 border-amber-200'
                            }`}
                          >
                            <div>
                              <div className="font-bold text-[#141A17]">
                                {req.owned ? '✓ Già in casa: ' : 'Da comprare: '}
                                {req.name}
                              </div>
                              <div className="text-[11px] text-[#575E58] mt-0.5">{req.formula}</div>
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
                                className="px-2 py-1 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-[10px] font-extrabold shrink-0 cursor-pointer"
                              >
                                + Lista
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Step-by-Step Procedure */}
                    <div className="space-y-1.5 pt-2 border-t border-[#E5E2DA]">
                      <div className="text-xs font-extrabold text-[#141A17]">
                        Passaggi da seguire:
                      </div>
                      <ol className="list-decimal list-inside text-xs text-[#141A17] space-y-1.5 leading-relaxed">
                        {(solvedProtocol.steps || []).map((st, idx) => (
                          <li key={idx}>{st}</li>
                        ))}
                      </ol>
                    </div>

                    {/* Material Footnote */}
                    {solvedProtocol.surface?.materialNote && (
                      <div className="p-2.5 rounded-xl bg-[#F3F1EC] border border-[#E5E2DA] text-[11px] text-[#575E58]">
                        <strong className="text-[#141A17]">Nota sul materiale:</strong> {solvedProtocol.surface.materialNote}
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
          TAB 2: I 7 PRODOTTI BASE & SICUREZZA
         ===================================================================== */}
      {activeTab === 'kit' && (
        <div className="space-y-5">
          {/* 3 Regole Essenziali sulle Polveri Pure */}
          <section className="bg-rose-50/80 rounded-2xl border border-rose-300 p-4 sm:p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-rose-700 text-white">
                  Sicurezza essenziale · Uso corretto
                </span>
                <h3 className="text-sm sm:text-base font-extrabold text-rose-950 mt-1.5">
                  I 3 divieti essenziali sulle polveri pure
                </h3>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(kitGuide?.purePowderSafetyLocksP0 || []).map((lock) => (
                <div
                  key={lock.id}
                  className="bg-white rounded-xl border border-rose-200 p-3.5 text-xs space-y-1.5 shadow-2xs flex flex-col justify-between"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <h4 className="font-extrabold text-rose-950 leading-snug">
                        {getSafetyLockTitle(lock)}
                      </h4>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-900 shrink-0">
                        {formatSeverityLabel(lock.severity)}
                      </span>
                    </div>
                    <div className="font-semibold text-[#141A17]">{lock.reagentA}</div>
                    <p className="text-[11px] text-[#575E58]">{lock.clinicalRisk}</p>
                    <p className="text-[11px] font-extrabold text-rose-800">{lock.mandatoryRule}</p>
                  </div>
                  <div className="pt-1.5 border-t border-[#E5E2DA] flex flex-wrap items-center justify-between gap-1 text-[10px] text-[#575E58]">
                    <span className="font-mono">{lock.hazardFormula}</span>
                    {lock.code && <span className="font-mono">Rif. {lock.code}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Verificatore Sicurezza Miscele Live */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-3.5">
            <div>
              <h3 className="text-sm font-extrabold text-[#141A17]">
                Verifica prima di mescolare due prodotti
              </h3>
              <p className="text-xs text-[#575E58]">
                Controlla subito se due prodotti insieme creano gas pericolosi o rovinano una superficie.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block font-bold text-[#141A17] mb-1">Primo prodotto</label>
                <select
                  value={reagentA}
                  onChange={(e) => setReagentA(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] font-semibold text-[#141A17]"
                >
                  {REAGENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-[#141A17] mb-1">Secondo prodotto</label>
                <select
                  value={reagentB}
                  onChange={(e) => setReagentB(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] font-semibold text-[#141A17]"
                >
                  <option value="">(Nessun secondo prodotto)</option>
                  {REAGENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold text-[#141A17] mb-1">Contenitore o superficie</label>
                <select
                  value={targetContext}
                  onChange={(e) => setTargetContext(e.target.value)}
                  className="w-full p-2.5 rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] font-semibold text-[#141A17]"
                >
                  {CONTAINER_OR_TARGET_OPTIONS.map((opt) => (
                    <option key={opt.label} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preset rapidi di test */}
            <div className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="font-bold text-[#575E58]">Prove rapide:</span>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Candeggina (Ipoclorito NaClO)');
                  setReagentB('Anticalcare Acido (Viakal)');
                  setTargetContext('');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] font-semibold text-[#141A17] cursor-pointer"
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
                className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] font-semibold text-[#141A17] cursor-pointer"
              >
                Percarbonato in spruzzino chiuso
              </button>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Soda Solvay (Carbonato di Sodio)');
                  setReagentB('');
                  setTargetContext('Moka in alluminio / Filtro cappa alluminio');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] font-semibold text-[#141A17] cursor-pointer"
              >
                Soda Solvay su moka in alluminio
              </button>
              <button
                type="button"
                onClick={() => {
                  setReagentA('Acido Citrico 15%');
                  setReagentB('');
                  setTargetContext('Marmo di Carrara / Ardesia Ligure');
                }}
                className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] font-semibold text-[#141A17] cursor-pointer"
              >
                Acido Citrico su marmo ligure
              </button>
            </div>

            {safetyResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                  safetyResult.blockedByP0
                    ? 'bg-rose-50 border-rose-400 text-rose-950'
                    : safetyResult.blockedByP1
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : 'bg-emerald-50/70 border-[#1B5E3A]/30 text-[#141A17]'
                }`}
              >
                <div className="font-extrabold text-sm">
                  {safetyResult.blockedByP0
                    ? '🔴 Pericolo chimico: non procedere assolutamente'
                    : safetyResult.blockedByP1
                      ? '🟠 Rischio di rovinare il materiale'
                      : '🟢 Combinazione sicura — Nessuna incompatibilità critica rilevata'}
                </div>
                {(safetyResult.violations || []).map((v) => (
                  <div key={v.id} className="bg-white/95 p-2.5 rounded-lg border border-[#E5E2DA] space-y-1">
                    <div className="font-bold text-[#141A17]">
                      {getSafetyLockTitle(v)} — {v.reagentA} + {v.reagentB} → {v.toxicProduct}
                    </div>
                    <div className="text-[11px] font-semibold text-[#141A17]">{v.mandatoryRule}</div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#575E58]">
                      <span>{v.hazardFormula}</span>
                      {v.code && <span>Rif. {v.code}</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* I 7 prodotti base */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm sm:text-base font-extrabold text-[#141A17]">
                  I 7 prodotti base per tutta la casa (sostituiscono {kitGuide?.totalCommercialBottlesReplaced || 25}+ flaconi diversi)
                </h3>
                <p className="text-xs text-[#575E58]">
                  Costo indicativo dell&apos;intero set a Rapallo:{' '}
                  <strong className="text-[#141A17]">~€ {Number(kitGuide?.fullKitReferenceCostEuro || 30.57).toFixed(2)}</strong> • Dosi calibrate su{' '}
                  <strong className="text-[#141A17]">{waterHardnessF} °f</strong>.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {kitPillars.map((p) => {
                const isOwned = ownedKitKeys.includes(p.key);
                return (
                  <article
                    key={p.id}
                    className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs flex flex-col justify-between gap-3 text-xs"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA]">
                            Prodotto #{p.pillarNumber}
                          </span>
                          <h4 className="text-sm font-extrabold text-[#141A17] mt-1">{p.name}</h4>
                        </div>
                        <span className="text-xs font-extrabold text-[#1B5E3A] shrink-0">
                          ~€ {Number(p.referencePriceEuro).toFixed(2)}
                        </span>
                      </div>

                      <div
                        className={`p-2.5 rounded-xl border text-[11px] ${
                          p.preparedSolutionRecipe?.allowedInClosedSprayBottle
                            ? 'bg-emerald-50/60 border-emerald-200 text-[#141A17]'
                            : 'bg-amber-50/70 border-amber-200 text-amber-950'
                        }`}
                      >
                        <div className="font-extrabold">
                          {p.preparedSolutionRecipe?.allowedInClosedSprayBottle
                            ? '✓ Si può conservare in flacone opaco ben etichettato'
                            : '⛔ Mai chiudere in flacone spray — Usa al momento in contenitore aperto'}
                        </div>
                        <p className="mt-0.5">{p.preparedSolutionRecipe?.formula}</p>
                      </div>

                      {p.preparedSolutionRecipe?.rapalloDosages && (
                        <div className="space-y-1">
                          <div className="font-bold text-[#141A17]">Dosi per Rapallo ({waterHardnessF} °f):</div>
                          <ul className="list-disc list-inside text-[11px] text-[#575E58] space-y-0.5">
                            {Object.values(p.preparedSolutionRecipe.rapalloDosages).map((d, i) => (
                              <li key={i}>{d}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      <div className="text-[11px] text-[#575E58]">
                        <strong className="text-[#141A17]">Elimina dal carrello:</strong>{' '}
                        {(p.replacedCommercialProducts || []).join(' • ')}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#E5E2DA] flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => toggleOwnedKitKey(p.key)}
                        className={`px-3 py-1.5 rounded-lg font-extrabold cursor-pointer ${
                          isOwned
                            ? 'bg-emerald-50 text-[#1B5E3A] border border-emerald-200'
                            : 'bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA]'
                        }`}
                      >
                        {isOwned ? '✓ Già in casa' : 'Segna come presente'}
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
                          className="px-3 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white font-extrabold cursor-pointer"
                        >
                          + Aggiungi alla lista
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
          TAB 3: PREZZI A LAVAGGIO & ETICHETTE
         ===================================================================== */}
      {activeTab === 'offers' && (
        <div className="space-y-5">
          {/* Lettore Etichette */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#141A17]">
                  Leggi l&apos;etichetta sul retro del flacone
                </h3>
                <p className="text-xs text-[#575E58]">
                  Incolla la lista ingredienti dal retro del prodotto per vedere cosa pulisce davvero e su quali tessuti evitarlo.
                </p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {INCI_PRESETS.map((pr) => (
                  <button
                    key={pr.label}
                    type="button"
                    onClick={() => setInciInput(pr.inci)}
                    className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[11px] font-bold text-[#141A17] cursor-pointer"
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
              className="w-full p-3 rounded-xl border border-[#E5E2DA] text-xs font-mono bg-[#FAF9F6] text-[#141A17]"
            />

            {inciDecoded && (
              <div className="space-y-2 text-xs">
                {(inciDecoded.warnings || []).map((w, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 font-bold"
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
                      <div className="font-extrabold text-[#141A17]">{act.name}</div>
                      <p className="text-[11px] text-[#575E58]">{act.primaryFunction}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* Offerte Vere Cura Casa Rapallo */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-extrabold text-[#141A17]">
                  Offerte reali per la casa a Rapallo ({offersReport?.totalCleaningOffers || 0} attive)
                </h3>
                <p className="text-xs text-[#575E58]">
                  Il costo per lavaggio viene calcolato solo quando peso o numero di cicli sono indicati chiaramente sul volantino, senza stime inventate.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(offersReport?.offers || []).map((off, idx) => (
                <div
                  key={off.id || idx}
                  className="p-3.5 rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] flex flex-col justify-between gap-2.5 text-xs"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-white border border-[#E5E2DA] text-[#575E58]">
                        📍 {off.storeName || off.storeId}
                      </span>
                      <span className="text-sm font-extrabold text-[#1B5E3A]">
                        € {Number(off.promoPrice || 0).toFixed(2)}
                      </span>
                    </div>
                    <div className="font-bold text-[#141A17]">{off.title}</div>

                    {off.costPerRapalloCycleEur !== null ? (
                      <div className="text-[11px] font-bold text-[#141A17] bg-[#F3F1EC] border border-[#E5E2DA] rounded-lg px-2 py-1">
                        Costo reale a {waterHardnessF} °f:{' '}
                        <strong>€ {off.costPerRapalloCycleEur.toFixed(2)} / lavaggio</strong> ({off.washCount} cicli)
                      </div>
                    ) : (
                      <div className="text-[10px] text-[#575E58] italic">
                        Formato o numero di lavaggi non indicato sul volantino
                      </div>
                    )}

                    {off.intervalDominanceComparison?.dominanceProven && (
                      <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                        <strong>Confronto coi prodotti base:</strong> anche considerando la massima concentrazione di legge (
                        {off.intervalDominanceComparison.assumedCommercialUpperBoundPct}%), il prodotto puro fa risparmiare almeno{' '}
                        <strong>{off.intervalDominanceComparison.certifiedMinSavingsPct}%</strong>.
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
                      className="w-full py-1.5 px-2.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-[11px] font-extrabold cursor-pointer"
                    >
                      + Aggiungi alla lista
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}

      {/* =====================================================================
          TAB 4: ELETTRODOMESTICI & FALSI MITI
         ===================================================================== */}
      {activeTab === 'maintenance' && (
        <div className="space-y-5">
          {/* Piani Manutenzione Elettrodomestici */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#141A17]">
                Manutenzione per far durare gli elettrodomestici e la barca
              </h3>
              <p className="text-xs text-[#575E58]">
                Pochi euro l&apos;anno di acido citrico e percarbonato allungano la vita di lavatrice, lavastoviglie, frigorifero, cappa e dotazioni di bordo.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(appliancesData?.appliances || []).map((app) => (
                <article
                  key={app.id}
                  className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-2.5 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#E5E2DA] pb-2">
                    <div>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1B5E3A] border border-emerald-200">
                        ⏱️ {app.frequency}
                      </span>
                      <h4 className="text-sm font-extrabold text-[#141A17] mt-1">{app.applianceName}</h4>
                    </div>
                    {app.capexProtectedRangeEuro && (
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#F3F1EC] text-[#575E58]">
                        Protegge €{app.capexProtectedRangeEuro[0]}–{app.capexProtectedRangeEuro[1]}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-[#141A17] bg-[#F3F1EC] border border-[#E5E2DA] p-2.5 rounded-xl">
                    <strong>Acqua a Rapallo:</strong> {app.rapalloWaterNote}
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-[#575E58] leading-relaxed">
                    {(app.decoupledSteps || []).map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </article>
              ))}

              {appliancesData?.boatCareModule && (
                <article className="bg-[#141A17] text-white rounded-2xl border border-[#141A17] p-4 shadow-xs space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 border-b border-white/15 pb-2">
                    <div>
                      <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-white/10 text-stone-200">
                        ⚓ Cura della barca · Tigullio
                      </span>
                      <h4 className="text-sm font-extrabold mt-1">
                        {appliancesData.boatCareModule.title}
                      </h4>
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-rose-950 border border-rose-500 text-rose-100 font-bold text-[11px]">
                    ⛔ {appliancesData.boatCareModule.doNotDoFirst}
                  </div>
                  <ol className="list-decimal list-inside space-y-1 text-stone-200 leading-relaxed">
                    {(appliancesData.boatCareModule.steps || []).map((st, i) => (
                      <li key={i}>{st}</li>
                    ))}
                  </ol>
                </article>
              )}
            </div>
          </section>

          {/* Falsi miti spiegati semplicemente */}
          <section className="space-y-3">
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-[#141A17]">
                Falsi miti sulle pulizie spiegati bene
              </h3>
              <p className="text-xs text-[#575E58]">
                Perché alcune &ldquo;ricette casalinghe&rdquo; popolari si annullano a vicenda o rovinano nel tempo lavatrice, cromature e tessuti.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {myths.map((m) => (
                <article
                  key={m.id}
                  className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-2 text-xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-extrabold text-[#141A17]">❌ &ldquo;{m.mythTitle}&rdquo;</h4>
                    <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-950 text-[10px] font-extrabold shrink-0">
                      {m.verdict.split('(')[0].trim()}
                    </span>
                  </div>
                  <div className="font-mono text-[11px] bg-[#FAF9F6] border border-[#E5E2DA] p-2 rounded-lg text-[#141A17]">
                    {m.stoichiometry}
                  </div>
                  <p className="text-[11px] text-[#575E58]">
                    <strong className="text-[#141A17]">Cosa sembra succedere:</strong> {m.visualIllusion}
                  </p>
                  <p className="text-[11px] text-[#141A17] leading-relaxed">
                    <strong>Cosa succede davvero:</strong> {m.chemicalTruth}
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
