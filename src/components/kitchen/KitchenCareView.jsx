import React, { useState, useEffect, useCallback } from 'react';
import KitchenResetCard from './KitchenResetCard.jsx';

const HEAT_SOURCE_LABELS = {
  gas: {
    label: '🔥 Fiamma Viva a Gas',
    desc: 'Conduzione + convezione anulare; compatibile con qualsiasi metallo (incluso rame stagnato e terracotta con spargifiamma).'
  },
  induction: {
    label: '🧲 Piano a Induzione Elettromagnetica',
    desc: 'Correnti parassite di Foucault (20-100 kHz); richiede fondo ferromagnetico. Vietato Boost su PTFE e ferro sottile a secco.'
  },
  electric_radiant: {
    label: '⚡ Piastra Elettrica / Vetroceramica Radiante',
    desc: 'Alta inerzia termica residua; richiede fondo perfettamente planare.'
  },
  boat_no_stove: {
    label: '⛵ Cambusa Barca / Borsa Termica (Senza Forno)',
    desc: 'Fornello basculante singolo o zero-fuoco; contenitori ermetici Inox AISI 316 marino.'
  }
};

const CALIBRATION_OUTCOMES = [
  { id: 'perfect', label: '✨ Perfetto (Crosta & Cuore)', color: 'bg-emerald-700 text-white' },
  { id: 'overcooked_dry', label: '🏜️ Asciutto / Stopposo (-Potenza)', color: 'bg-amber-100 text-amber-950 border-amber-300' },
  { id: 'pale_boiled', label: '💧 Bollito / Pallido (Più Turni)', color: 'bg-sky-100 text-sky-950 border-sky-300' },
  { id: 'stuck_or_broken', label: '🧲 Attaccato / Slegato (Leidenfrost)', color: 'bg-rose-100 text-rose-950 border-rose-300' }
];

export function KitchenCareView({
  activeProfileId = 'dany',
  onNavigateToStoreDomain,
  onAddToShoppingList,
  onNavigateRoom,
  onOpenMaestro
}) {
  const [kitchenState, setKitchenState] = useState(null);
  const [resetData, setResetData] = useState({
    protocols: [],
    underSinkCatalog: [],
    liveRapalloCleaningOffers: [],
    chemicalSafetyMatrix: []
  });
  const [loading, setLoading] = useState(true);

  // Physics Simulator & Calibration State (`cookwarePhysicsEngine`)
  const [simToolId, setSimToolId] = useState('padella_antiaderente');
  const [simDiameterCm, setSimDiameterCm] = useState(26);
  const [simWeightClass, setSimWeightClass] = useState('medium');
  const [simMeasuredMassGrams, setSimMeasuredMassGrams] = useState('');
  const [simFoodMassGrams, setSimFoodMassGrams] = useState(380);
  const [simRequestedLevel, setSimRequestedLevel] = useState('high');
  const [simDryPreheat, setSimDryPreheat] = useState(false);
  const [simAcidLong, setSimAcidLong] = useState(false);
  const [simColdSalt, setSimColdSalt] = useState(false);
  const [physicsEval, setPhysicsEval] = useState(null);
  const [calibrationToast, setCalibrationToast] = useState('');

  // Knife & Container Advisors State
  const [knifeId, setKnifeId] = useState('western_stainless_56_58hrc');
  const [boardId, setBoardId] = useState('end_grain_wood');
  const [knifeTask, setKnifeTask] = useState('sfilettatura pesce e trito erbe');
  const [containerContext, setContainerContext] = useState('home_fridge');
  const [containerHotFat, setContainerHotFat] = useState(true);
  const [containerAcidTomato, setContainerAcidTomato] = useState(true);

  // 10-Year TCO State (`/api/maestro/economics/tco`)
  const [usesPerWeek, setUsesPerWeek] = useState(4);
  const [tcoData, setTcoData] = useState(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const stateRes = await fetch('/api/kitchen/state').then((r) => (r.ok ? r.json() : null));
      if (stateRes) {
        setKitchenState(stateRes);
        const activeToolIds = (stateRes.effectiveTools || []).map((t) => t.id).join(',');
        const resetRes = await fetch(
          `/api/kitchen/reset-protocol?tools=${encodeURIComponent(activeToolIds)}`
        ).then((r) => (r.ok ? r.json() : null));
        if (resetRes) setResetData(resetRes);
      } else {
        const resetRes = await fetch('/api/kitchen/reset-protocol').then((r) => (r.ok ? r.json() : null));
        if (resetRes) setResetData(resetRes);
      }
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Evaluate Cookware Physics, Batching, P0 Guards, Knives & Containers
  const activeHeatSource = kitchenState?.heatSource || 'gas';

  const runPhysicsEvaluation = useCallback(async () => {
    try {
      const res = await fetch('/api/academy/cookware-physics/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heatSource: activeHeatSource,
          toolId: simToolId,
          diameterCm: Number(simDiameterCm) || 26,
          weightClass: simWeightClass,
          measuredMassGrams: simMeasuredMassGrams ? Number(simMeasuredMassGrams) : null,
          foodMassGrams: Number(simFoodMassGrams) || 250,
          requestedLevel: simRequestedLevel,
          isDryPreheat: simDryPreheat,
          hasAcidicIngredients: simAcidLong,
          acidDurationMinutes: simAcidLong ? 25 : 0,
          coldWaterSaltingAttempt: simColdSalt,
          knifeId,
          boardId,
          task: knifeTask,
          containerContext,
          isHot: containerHotFat,
          isFatty: containerHotFat,
          isAcidicOrTomato: containerAcidTomato
        })
      });
      if (res.ok) {
        setPhysicsEval(await res.json());
      }
    } catch (_) {}
  }, [
    activeHeatSource,
    simToolId,
    simDiameterCm,
    simWeightClass,
    simMeasuredMassGrams,
    simFoodMassGrams,
    simRequestedLevel,
    simDryPreheat,
    simAcidLong,
    simColdSalt,
    knifeId,
    boardId,
    knifeTask,
    containerContext,
    containerHotFat,
    containerAcidTomato
  ]);

  useEffect(() => {
    runPhysicsEvaluation();
  }, [runPhysicsEvaluation]);

  // Load 10-Year TCO Analysis
  useEffect(() => {
    fetch(`/api/maestro/economics/tco?usesPerWeek=${encodeURIComponent(usesPerWeek)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setTcoData(data);
      })
      .catch(() => {});
  }, [usesPerWeek, kitchenState?.ownedToolIds]);

  const handleUpdateConfig = async (payload) => {
    try {
      const res = await fetch('/api/kitchen/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setKitchenState(updated);
        const activeToolIds = (updated.effectiveTools || []).map((t) => t.id).join(',');
        const resetRes = await fetch(
          `/api/kitchen/reset-protocol?tools=${encodeURIComponent(activeToolIds)}`
        );
        if (resetRes.ok) {
          setResetData(await resetRes.json());
        }
      }
    } catch (_) {}
  };

  const handleOneTapCalibration = async (visualOutcome) => {
    try {
      const res = await fetch('/api/academy/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          heatSource: activeHeatSource,
          toolId: simToolId,
          visualOutcome,
          measuredPanMassGrams: simMeasuredMassGrams ? Number(simMeasuredMassGrams) : null
        })
      });
      if (res.ok) {
        const data = await res.json();
        setCalibrationToast(
          `Calibrato (${data.calibration.lastVisualOutcome}): ΔPotenza ${data.calibration.powerStepDelta >= 0 ? '+' : ''}${data.calibration.powerStepDelta}, Tempo ×${data.calibration.timeMultiplier}`
        );
        runPhysicsEvaluation();
        setTimeout(() => setCalibrationToast(''), 4000);
      }
    } catch (_) {}
  };

  if (loading && !kitchenState) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento Officina Cucina &amp; Termofisica...</div>;
  }

  const allSelectableTools = [
    ...(kitchenState?.effectiveTools || []),
    ...(kitchenState?.disqualifiedTools || []),
    ...(kitchenState?.missingRoiOpportunities || [])
  ];

  return (
    <div className="space-y-6">
      {/* Header Banner — Stanza 4: Officina Cucina + Ponte a Stanza 7 */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-600 text-white">
              Anima 3 · Chimica &amp; Fisica degli Strumenti
            </span>
            <span className="text-[11px] font-bold text-emerald-800">
              Separazione Fisica Rame Stagnato (231,9°C) vs Terracotta (0,62 mm²/s) · Guardie P0 Attive
            </span>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-2xl">🍳</span>
            <h2 className="text-xl font-extrabold text-slate-900">
              Stanza 4 — Officina Cucina: Fornelli, Pentole, Lame, Termodinamica &amp; Ponte Kitchen Reset
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Governa diffusività e capacità termica delle pentole (calcolo turni anti-crollo &lt;140°C e blocchi P0 su PTFE/stagno/inox),
            manutenzione lame HRC, contenitori Casa/Barca (AISI 316), TCO decennale e protocollo post-cottura{' '}
            <strong>Kitchen Reset</strong>.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onNavigateRoom && (
            <button
              type="button"
              onClick={() => onNavigateRoom('room-7-chimica')}
              className="px-3.5 py-2 bg-[#141A17] hover:bg-[#1B5E3A] text-white text-xs font-extrabold rounded-xl taste-btn cursor-pointer"
            >
              🧪 Chimica Casa &amp; Barca (Fase 4) →
            </button>
          )}
          {onOpenMaestro && (
            <button
              type="button"
              onClick={() =>
                onOpenMaestro('Quale padella della mia dotazione devo usare per una rosolatura perfetta senza rovinare i rivestimenti?')
              }
              className="px-3 py-2 bg-[#1B5E3A] hover:bg-[#14472C] text-white text-xs font-extrabold rounded-xl taste-btn cursor-pointer"
            >
              💬 Chiedi al Maestro
            </button>
          )}
          {onNavigateToStoreDomain && (
            <>
              <button
                type="button"
                onClick={() => onNavigateToStoreDomain('kitchen_cookware')}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                🍳 Offerte Pentole →
              </button>
              <button
                type="button"
                onClick={() => onNavigateToStoreDomain('home_cleaning')}
                className="px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-extrabold rounded-xl cursor-pointer"
              >
                🧼 Offerte Tigotà &amp; PiùMe →
              </button>
            </>
          )}
        </div>
      </section>

      {/* 1. Stove / Heat Source Configurator */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">
          1. Sorgente Termica Attiva (Piano Cottura Casa o Barca)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(HEAT_SOURCE_LABELS).map(([key, info]) => {
            const isSelected = activeHeatSource === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleUpdateConfig({ heatSource: key })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-900 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="text-xs font-extrabold">{info.label}</div>
                <p className={`text-[11px] mt-1 ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                  {info.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Disqualified Cookware Alert (e.g. Non-ferromagnetic on Induction) */}
      {kitchenState?.disqualifiedTools?.length > 0 && (
        <section className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-extrabold text-rose-900">
            ⚠️ Pentole Squalificate dal Piano Cottura Attivo ({kitchenState.disqualifiedTools.length})
          </h3>
          {kitchenState.disqualifiedTools.map((dt) => (
            <div
              key={dt.id}
              className="bg-white p-3 rounded-xl border border-rose-200 text-xs flex items-center justify-between gap-3"
            >
              <div>
                <div className="font-bold text-slate-900">{dt.name}</div>
                <div className="text-rose-700 font-medium">{dt.disqualificationReason}</div>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ toggleToolId: dt.id })}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded font-bold shrink-0 cursor-pointer"
              >
                Rimuovi
              </button>
            </div>
          ))}
        </section>
      )}

      {/* 2. NEW: Simulatore Termofisico, Batching Anti-Bollitura & Blocchi P0 */}
      <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#E5E2DA] pb-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#141A17] text-white">
              Fisica delle Pentole · Dati Reali
            </span>
            <h3 className="text-sm font-extrabold text-slate-900 mt-1">
              🔬 Simulatore Termofisico Live: Inerzia, Turni in Padella (&gt;140°C) &amp; Blocchi Sicurezza P0
            </h3>
          </div>
          {calibrationToast && (
            <span className="text-xs font-extrabold px-3 py-1 rounded-lg bg-emerald-100 text-emerald-900 border border-emerald-300">
              ✓ {calibrationToast}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
          <div className="lg:col-span-2">
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Pentola / Archetipo</label>
            <select
              value={simToolId}
              onChange={(e) => setSimToolId(e.target.value)}
              className="w-full font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            >
              {(allSelectableTools.length > 0
                ? allSelectableTools
                : [
                    { id: 'padella_antiaderente', name: 'Padella Antiaderente PTFE' },
                    { id: 'padella_acciaio_inox', name: 'Padella Inox 18/10 Tri-Ply' },
                    { id: 'testo_rame_stagnato', name: 'Testo Rame Stagnato' },
                    { id: 'tegame_terracotta', name: 'Tegame Terracotta' }
                  ]
              ).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">Diametro &amp; Fascia Peso</label>
            <div className="flex gap-1.5">
              <select
                value={simDiameterCm}
                onChange={(e) => setSimDiameterCm(Number(e.target.value))}
                className="w-1/2 font-bold border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-900"
              >
                {[20, 22, 24, 26, 28, 30].map((d) => (
                  <option key={d} value={d}>
                    Ø {d}cm
                  </option>
                ))}
              </select>
              <select
                value={simWeightClass}
                onChange={(e) => setSimWeightClass(e.target.value)}
                className="w-1/2 font-bold border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-900"
              >
                <option value="light">Leggera</option>
                <option value="medium">Media</option>
                <option value="heavy">Pesante</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Pesata Bilancia Opz. (g)
            </label>
            <input
              type="number"
              min="100"
              max="6000"
              placeholder="Es. 1150 (C=M·cp)"
              value={simMeasuredMassGrams}
              onChange={(e) => setSimMeasuredMassGrams(e.target.value)}
              className="w-full border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              Carico Cibo (g) &amp; Potenza
            </label>
            <div className="flex gap-1.5">
              <input
                type="number"
                min="50"
                max="2000"
                step="50"
                value={simFoodMassGrams}
                onChange={(e) => setSimFoodMassGrams(Number(e.target.value) || 200)}
                className="w-1/2 font-bold border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-900"
              />
              <select
                value={simRequestedLevel}
                onChange={(e) => setSimRequestedLevel(e.target.value)}
                className="w-1/2 font-bold border border-slate-300 rounded-lg px-2 py-2 bg-white text-slate-900"
              >
                <option value="low">Bassa</option>
                <option value="medium">Media</option>
                <option value="high">Alta</option>
                <option value="boost">Boost</option>
              </select>
            </div>
          </div>
        </div>

        {/* Stress-Test Condition Toggles */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className="font-bold text-slate-700">Verifica condizioni critiche P0:</span>
          <label className="inline-flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={simDryPreheat}
              onChange={(e) => setSimDryPreheat(e.target.checked)}
            />
            <span>Preriscaldamento a vuoto (secco)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={simAcidLong}
              onChange={(e) => setSimAcidLong(e.target.checked)}
            />
            <span>Riduzione acida &gt;20 min (pomodoro/limone/vino)</span>
          </label>
          <label className="inline-flex items-center gap-1.5 cursor-pointer bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
            <input
              type="checkbox"
              checked={simColdSalt}
              onChange={(e) => setSimColdSalt(e.target.checked)}
            />
            <span>Sale versato in acqua fredda</span>
          </label>
        </div>

        {/* Physics & P0 Output */}
        {physicsEval?.batching && physicsEval?.stoveValidation && (
          <div className="space-y-3">
            {physicsEval.stoveValidation.isBlockedP0 && (
              <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-400 text-xs text-rose-950 space-y-1.5">
                {physicsEval.stoveValidation.p0Blocks.map((b) => (
                  <div key={b.code}>
                    <span className="font-extrabold">⛔ [{b.code}] {b.message}</span>
                    <div className="text-rose-800 font-semibold">→ Azione sicura imposta: {b.safeAction}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] space-y-1">
                <div className="font-extrabold text-[#141A17]">
                  📐 Profilo Termofisico ({physicsEval.batching.profile.materialLabel})
                </div>
                <div>
                  • Diffusività α: <strong>{physicsEval.batching.profile.thermalDiffusivityMm2S} mm²/s</strong> · T_max sicura:{' '}
                  <strong>{physicsEval.batching.profile.maxSafeTempC}°C</strong>
                </div>
                <div>
                  • Capacità termica:{' '}
                  {physicsEval.batching.profile.confidenceMode === 'measured_scale_exact' ? (
                    <strong className="text-emerald-800">
                      Esatta da bilancia = {physicsEval.batching.profile.exactHeatCapacityJK} J/K
                    </strong>
                  ) : (
                    <strong>
                      Banda certificata [{physicsEval.batching.profile.arealHeatCapacityRangeKJm2K[0]}–
                      {physicsEval.batching.profile.arealHeatCapacityRangeKJm2K[1]} kJ/m²K]
                    </strong>
                  )}
                </div>
                <div>
                  • Fattore evaporazione geometrica: <strong>×{physicsEval.batching.evaporationRateFactor}</strong>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-emerald-200 space-y-1">
                <div className="font-extrabold text-emerald-950">
                  🥩 Prescrizione Turni Anti-Bollitura (&gt;140°C)
                </div>
                <div className="text-sm font-extrabold text-emerald-900">
                  {physicsEval.batching.recommendedBatches === 1
                    ? '✓ 1 Turno Unico Sicuro'
                    : `⚠️ Dividi in ${physicsEval.batching.recommendedBatches} Turni Separati`}
                </div>
                <p className="text-[11px] text-slate-700">{physicsEval.batching.guidance}</p>
              </div>

              <div className="p-3.5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-1">
                <div className="font-extrabold text-amber-950">🎛️ Comando Fornello Calibrato</div>
                <div className="font-bold text-slate-900">{physicsEval.stoveValidation.stoveInstruction}</div>
                <div className="text-[11px] text-slate-600 pt-1">
                  Feriale Salute: <strong>{physicsEval.stoveValidation.multiSoulRegimes.weekday_health_fast.conductiveFatGrams}g EVO</strong> (Reset{' '}
                  {physicsEval.stoveValidation.multiSoulRegimes.weekday_health_fast.soilGeneratedForCasa.estimatedResetSeconds}s)
                </div>
              </div>
            </div>

            {/* 1-Tap Closed-Loop Lab Calibration */}
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
              <span className="font-bold text-slate-700">
                📓 Calibrazione 1-Tap Post-Cottura (senza pesare il cotto): com&apos;è venuto l&apos;ultimo piatto su questa pentola?
              </span>
              <div className="flex flex-wrap gap-1.5">
                {CALIBRATION_OUTCOMES.map((out) => (
                  <button
                    key={out.id}
                    type="button"
                    onClick={() => handleOneTapCalibration(out.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-extrabold border cursor-pointer ${out.color}`}
                  >
                    {out.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 3. Owned Cookware & Missing Cookware Unlock ROI (Existing Core Contract) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Owned & Effective Tools */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                2. Dotazione Pentole, Lame &amp; Sensori Attivi ({kitchenState?.effectiveTools?.length || 0})
              </h3>
              <p className="text-[11px] text-slate-500">
                Stoviglie fisicamente compatibili • Sbloccano{' '}
                <strong className="text-emerald-800">
                  {kitchenState?.totalUnlockedDishes || 0} / {kitchenState?.totalCatalogDishes || 264} piatti
                </strong>{' '}
                completi del catalogo.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {(kitchenState?.effectiveTools || []).map((tool) => (
              <div key={tool.id} className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 text-xs space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">✓ {tool.name}</div>
                    <div className="text-[11px] text-emerald-800 font-semibold">
                      Abilita {tool.unlockedDishesCount} piatti • T_max sicura: {tool.maxSafeTempC || tool.maxTempC}°C
                      {tool.inductionBoostAllowed === false && tool.inductionCompatible ? ' • NO Boost' : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateConfig({ toggleToolId: tool.id })}
                    className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-white border border-rose-200 rounded cursor-pointer shrink-0"
                  >
                    Togli da dotazione
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">{tool.physicalJustification}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Missing Cookware & Recipe Unlock ROI */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-2.5">
            <h3 className="text-sm font-extrabold text-amber-950">
              3. Analisi Gap &amp; ROI Utensili Mancanti ({kitchenState?.missingRoiOpportunities?.length || 0})
            </h3>
            <p className="text-[11px] text-slate-500">
              Ordinati per ricette sbloccate e valore tecnico (inclusi Testo Stagnato, Terracotta, Inox Tri-Ply, Ferro Blu e Sonda).
            </p>
          </div>

          <div className="space-y-2.5 max-h-[520px] overflow-y-auto pr-1">
            {(kitchenState?.missingRoiOpportunities || []).map((opp) => (
              <div key={opp.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/30 text-xs space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">{opp.name}</div>
                    <div className="text-[11px] font-extrabold text-amber-800">🔓 {opp.roiSummary}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateConfig({ toggleToolId: opp.id })}
                    className="px-2.5 py-1 text-[10px] font-extrabold bg-emerald-700 text-white rounded-lg cursor-pointer shrink-0"
                  >
                    + Ho questo utensile
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">{opp.physicalJustification}</p>
                <div className="text-[10px] text-slate-500">
                  📍 Riferimento a Rapallo: <strong>{opp.rapalloSource}</strong> (~€{' '}
                  {Number(opp.referencePriceEuro).toFixed(2)})
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 4. NEW: Consulente Lame HRC, Termometro a Sonda & Contenitori Casa/Barca + TCO Decennale */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Metallurgia Lame & Contenitori Casa/Barca */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
          <h3 className="text-sm font-extrabold text-slate-900">
            🔪 Metallurgia Lame (HRC) &amp; Chimica Contenitori Casa / Barca
          </h3>

          <div className="space-y-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
            <div className="font-extrabold text-slate-800">Accoppiamento Lama × Tagliere</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select
                value={knifeId}
                onChange={(e) => setKnifeId(e.target.value)}
                className="font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
              >
                <option value="western_stainless_56_58hrc">Europeo Inox 56–58 HRC (18–20°)</option>
                <option value="japanese_hard_60_63hrc">Giapponese VG-10/Aogami 60–63 HRC (12–15°)</option>
              </select>
              <select
                value={boardId}
                onChange={(e) => setBoardId(e.target.value)}
                className="font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
              >
                <option value="end_grain_wood">Tagliere Legno di Testa / Noce</option>
                <option value="hdpe_food_grade">Tagliere Polietilene PEHD</option>
                <option value="bamboo">Tagliere Bambù</option>
                <option value="glass_marble_ceramic">Lastra in Vetro / Marmo / Piatto</option>
              </select>
            </div>
            <input
              type="text"
              value={knifeTask}
              onChange={(e) => setKnifeTask(e.target.value)}
              placeholder="Compito: es. crudo di orata, ossa di pollo..."
              className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-900"
            />
            {physicsEval?.knifeAdvice && (
              <div className="space-y-1 pt-1">
                {physicsEval.knifeAdvice.alerts?.map((al, i) => (
                  <div key={i} className="p-2 rounded-lg bg-rose-50 border border-rose-300 text-rose-950 font-bold">
                    {al}
                  </div>
                ))}
                <p className="text-[11px] text-slate-600">
                  <strong>Manutenzione:</strong> {physicsEval.knifeAdvice.knife?.dailyMaintenance}
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2.5 bg-sky-50/50 p-3 rounded-xl border border-sky-200 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-extrabold text-sky-950">Contenitori Stoccaggio (Casa vs Barca)</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setContainerContext('home_fridge')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    containerContext === 'home_fridge' ? 'bg-sky-800 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  🏠 Frigo/Forno Casa
                </button>
                <button
                  type="button"
                  onClick={() => setContainerContext('boat_cooler')}
                  className={`px-2.5 py-1 rounded text-[11px] font-bold cursor-pointer ${
                    containerContext === 'boat_cooler' ? 'bg-sky-800 text-white' : 'bg-white text-slate-700 border border-slate-200'
                  }`}
                >
                  ⛵ Borsa Termica Barca
                </button>
              </div>
            </div>

            {physicsEval?.containerAdvice && (
              <div className="space-y-1.5">
                <div className="font-extrabold text-emerald-900">
                  ✓ Scelta Ottimale: {physicsEval.containerAdvice.recommendedContainer?.label}
                </div>
                <p className="text-[11px] text-slate-700">
                  {physicsEval.containerAdvice.recommendedContainer?.physicsNote}
                </p>
                {(physicsEval.containerAdvice.pp5Warnings || []).map((w, idx) => (
                  <div key={idx} className="text-[11px] text-amber-900 bg-amber-50 p-2 rounded border border-amber-200">
                    ⚠️ <strong>Limite Plastica PP #5:</strong> {w}
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* TCO 10 Anni: Buy-It-For-Life vs Consumabili PTFE */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                💶 Costo Reale a 10 Anni (TCO): Buy-It-For-Life vs Consumabili PTFE
              </h3>
              <p className="text-[11px] text-slate-500">
                Quanto ti costa davvero una pentola per singolo utilizzo (cura corretta vs abuso termico/chimico).
              </p>
            </div>
            <select
              aria-label="Utilizzi a settimana"
              value={usesPerWeek}
              onChange={(e) => setUsesPerWeek(Number(e.target.value))}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-slate-50 text-slate-900"
            >
              <option value={2}>2 usi / settimana</option>
              <option value={4}>4 usi / settimana</option>
              <option value={7}>Uso quotidiano (7/sett)</option>
            </select>
          </div>

          <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
            {(tcoData?.toolsTco || []).slice(0, 8).map((item) => {
              const isBifl = item.capExClass === 'buy_it_for_life';
              return (
                <div
                  key={item.id}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-900">{item.name}</span>
                    <span
                      className={`text-[10px] font-extrabold px-2 py-0.5 rounded shrink-0 ${
                        isBifl ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {isBifl ? '♾️ Buy-It-For-Life' : '🔄 Rivestimento a Ciclo Finito'}
                    </span>
                  </div>
                  <div className="flex flex-wrap justify-between gap-2 text-[11px] text-slate-700">
                    <span>
                      TCO 10a (Cura corretta):{' '}
                      <strong className="text-emerald-800">
                        €{item.tenYearTcoProperRangeEur?.[0]}–€{item.tenYearTcoProperRangeEur?.[1]}
                      </strong>
                    </span>
                    <span>
                      Se maltrattata (Boost/Abrasivi):{' '}
                      <strong className="text-rose-700">
                        €{item.tenYearTcoAbuseRangeEur?.[0]}–€{item.tenYearTcoAbuseRangeEur?.[1]}
                      </strong>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* 5. Under-Sink Chemical Inventory (Kitchen Reset Bridge) */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              4. Dotazione Chimica Sottolavello per il &ldquo;Kitchen Reset&rdquo; Post-Cottura
            </h3>
            <p className="text-xs text-slate-500">
              Prodotti essenziali per lavare le pentole senza danneggiare PTFE, stagno, marmo o passivazione Inox (per bagno, bucato e marmi liguri apri Stanza 7).
            </p>
          </div>
          {onNavigateRoom && (
            <button
              type="button"
              onClick={() => onNavigateRoom('room-7-chimica')}
              className="px-3 py-1.5 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#DFDCD2] text-[#141A17] text-xs font-extrabold shrink-0 cursor-pointer"
            >
              🧪 Apri Kit 7 Pilastri in Fase 4 →
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(resetData.underSinkCatalog || []).map((item) => (
            <div
              key={item.id}
              className={`p-3 rounded-xl border text-left text-xs transition-all flex flex-col justify-between ${
                item.ownedInUnderSink
                  ? 'bg-sky-50 border-sky-300 text-sky-950'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => handleUpdateConfig({ toggleCleaningKey: item.key })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleUpdateConfig({ toggleCleaningKey: item.key });
                  }
                }}
                className="cursor-pointer"
              >
                <div className="font-extrabold flex items-center justify-between">
                  <span>{item.ownedInUnderSink ? '✓ In Sottolavello' : '🛒 Mancante'}</span>
                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-white border border-slate-200">
                    {item.phRange}
                  </span>
                </div>
                <div className="font-bold text-slate-900 mt-1">{item.name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">
                  {item.brand} • ~€ {item.referencePriceEuro}
                </div>
                {item.matchedOffers?.length > 0 && (
                  <div className="mt-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                    🏷️ Promo {item.matchedOffers[0].storeName}: €
                    {Number(item.matchedOffers[0].promoPrice).toFixed(2)}
                  </div>
                )}
              </div>
              {!item.ownedInUnderSink && onAddToShoppingList && (
                <button
                  type="button"
                  onClick={() =>
                    onAddToShoppingList({
                      name: item.matchedOffers?.[0]?.title || item.name,
                      domain: 'home_cleaning',
                      source: 'kitchen_care',
                      unitPriceEur: Number(
                        item.matchedOffers?.[0]?.promoPrice ?? item.referencePriceEuro ?? 2.5
                      ),
                      preferredChain: item.matchedOffers?.[0]?.storeName || 'Tigotà / PiùMe Rapallo',
                      storeId: item.matchedOffers?.[0]?.storeId || null,
                      onPromo: Boolean(item.matchedOffers?.length > 0)
                    })
                  }
                  className="mt-2 w-full py-1 px-2 rounded-lg text-[10px] font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                >
                  + Aggiungi a Lista Spesa
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* P0-Safety Chemical Incompatibility Matrix */}
      {resetData.chemicalSafetyMatrix?.length > 0 && (
        <section className="bg-rose-50/80 rounded-2xl border-2 border-rose-300 p-4 shadow-xs space-y-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-700 text-white">
              P0-Safety · Sicurezza Chimica Sottolavello
            </span>
            <h3 className="text-sm font-extrabold text-rose-950 mt-1">
              ☠️ Matrice Incompatibilità Chimiche Critiche (Miscele Vietate)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {resetData.chemicalSafetyMatrix.map((rule) => (
              <div key={rule.id} className="bg-white rounded-xl border border-rose-200 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-rose-900">
                    ⛔ {rule.reagentA} + {rule.reagentB}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-900 shrink-0">
                    {rule.severity}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                  {rule.hazardFormula} → {rule.toxicProduct}
                </div>
                <p className="text-[11px] text-slate-700">{rule.clinicalRisk}</p>
                <p className="text-[11px] font-bold text-rose-800">Regola: {rule.mandatoryRule}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chemical Kitchen Reset Protocols */}
      <section className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">
          5. Protocolli Post-Cottura &ldquo;Kitchen Reset&rdquo; per le tue Pentole Attive
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(resetData.protocols || []).map((proto) => (
            <KitchenResetCard key={proto.toolId} protocol={proto} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default KitchenCareView;
