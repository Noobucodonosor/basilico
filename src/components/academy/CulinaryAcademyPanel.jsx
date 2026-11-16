import React, { useState, useEffect, useCallback } from 'react';

const VERBOSITY_MODES = [
  { id: 'auto', label: '🎯 Automatica (Livello Utente)' },
  { id: 'novice', label: '🌱 Principiante Guidato' },
  { id: 'practitioner', label: '🔪 Intermedio Sintetico' },
  { id: 'master', label: '👨‍🍳 Maestro (Solo Target)' }
];

const SOS_QUICK_SYMPTOMS = [
  { key: 'emulsion_broken', icon: '🫗', label: 'Salsa slegata / Pozza d\'olio' },
  { key: 'fish_meat_boiling', icon: '💧', label: 'Pesce o carne che bolle' },
  { key: 'food_stuck_to_pan', icon: '🧲', label: 'Cibo attaccato al fondo' },
  { key: 'bitter_burnt_fond', icon: '🔥', label: 'Aglio o fondo amaro/bruciato' },
  { key: 'grey_mushy_greens', icon: '🥬', label: 'Verdure verdi grigie e molli' },
  { key: 'tough_rubbery_protein', icon: '🐙', label: 'Polpo gommoso / Filetto stopposo' }
];

const STOVE_OPTIONS = [
  { id: 'gas', label: '🔥 Gas' },
  { id: 'induction', label: '🧲 Induzione' },
  { id: 'electric_radiant', label: '⚡ Vetroceramica' },
  { id: 'boat_no_stove', label: '⛵ Cambusa Barca' }
];

const PAN_OPTIONS = [
  { id: 'padella_acciaio_inox', label: 'Padella Inox 18/10 Tri-Ply' },
  { id: 'padella_antiaderente', label: 'Padella Antiaderente PTFE' },
  { id: 'padella_ferro_blu', label: 'Padella Ferro Blu / Carbonio' },
  { id: 'casseruola_inox', label: 'Casseruola Inox Fondo Spesso' },
  { id: 'pentola', label: 'Pentola Alta Inox' }
];

const UMAMI_PRESET_CHIPS = [
  'Pomodorini datterini',
  'Acciughe sotto sale liguri',
  'Olive taggiasche',
  'Sgombro fresco del Golfo',
  'Alici fresche',
  'Funghi porcini secchi',
  'Gamberi del Mar Ligure',
  'Pinoli tostati'
];

const FRIDGE_QUICK_PRESETS = [
  {
    label: '🐟 Alici + Limone + Capperi (15m)',
    ingredients: 'Alici fresche, Limoni liguri, Capperi e prezzemolo',
    maxMinutes: 15,
    heatSource: 'induction',
    toolId: 'padella_antiaderente'
  },
  {
    label: '🍝 Spaghetti + Datterini + Olive (18m)',
    ingredients: 'Spaghetti trafilati al bronzo, Pomodorini datterini, Olive taggiasche e aglio',
    maxMinutes: 18,
    heatSource: 'gas',
    toolId: 'padella_acciaio_inox'
  },
  {
    label: '⛵ Ceci + Tonno + Finocchio (Barca 8m)',
    ingredients: 'Ceci lessati scolati, Tonno in vetro, Finocchi croccanti e limone',
    maxMinutes: 8,
    heatSource: 'boat_no_stove',
    toolId: 'coltello_chef'
  }
];

export function CulinaryAcademyPanel({
  activeProfileId = 'dany',
  onNavigateRoom,
  onOpenMaestro,
  initialSection = 'skills'
}) {
  const [activeSection, setActiveSection] = useState(initialSection);

  // 1. Skills Tree State
  const [curriculum, setCurriculum] = useState(null);
  const [verbosityOverride, setVerbosityOverride] = useState('auto');
  const [practicingSkillId, setPracticingSkillId] = useState(null);

  // 2. SOS Fornelli State
  const [sosSymptomKey, setSosSymptomKey] = useState('emulsion_broken');
  const [sosFreeQuery, setSosFreeQuery] = useState('');
  const [sosHeatSource, setSosHeatSource] = useState('induction');
  const [sosToolId, setSosToolId] = useState('padella_acciaio_inox');
  const [sosResult, setSosResult] = useState(null);
  const [sosLoading, setSosLoading] = useState(false);

  // 3. Ratios & 8x Umami State
  const [ratiosCatalog, setRatiosCatalog] = useState([]);
  const [selectedRatioId, setSelectedRatioId] = useState('ratio-farinata-ligure');
  const [anchorGrams, setAnchorGrams] = useState(150);
  const [scaledRatio, setScaledRatio] = useState(null);
  const [selectedUmamiChips, setSelectedUmamiChips] = useState([
    'Pomodorini datterini',
    'Sgombro fresco del Golfo'
  ]);
  const [umamiResult, setUmamiResult] = useState(null);

  // 4. Improvise "Frigo -> Tecnica" State
  const [fridgeInput, setFridgeInput] = useState('Alici fresche, Limoni liguri, Prezzemolo e capperi');
  const [fridgeHeat, setFridgeHeat] = useState('gas');
  const [fridgeTool, setFridgeTool] = useState('padella_acciaio_inox');
  const [fridgeMinutes, setFridgeMinutes] = useState(18);
  const [improvisedPlan, setImprovisedPlan] = useState(null);
  const [improviseLoading, setImproviseLoading] = useState(false);

  const loadCurriculumAndRatios = useCallback(async () => {
    try {
      const [skRes, ratRes] = await Promise.all([
        fetch(`/api/academy/skills?profileId=${encodeURIComponent(activeProfileId)}`),
        fetch('/api/academy/ratios')
      ]);
      if (skRes.ok) {
        setCurriculum(await skRes.json());
      }
      if (ratRes.ok) {
        const rData = await ratRes.json();
        setRatiosCatalog(rData.ratios || []);
      }
    } catch (_) {}
  }, [activeProfileId]);

  useEffect(() => {
    loadCurriculumAndRatios();
  }, [loadCurriculumAndRatios]);

  // Run SOS calculation
  const triggerSOS = useCallback(
    async (overrideKey = null, overrideQuery = null) => {
      setSosLoading(true);
      try {
        const res = await fetch('/api/academy/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symptomKey: overrideQuery ? null : overrideKey || sosSymptomKey,
            queryText: overrideQuery !== null ? overrideQuery : sosFreeQuery,
            heatSource: sosHeatSource,
            toolId: sosToolId
          })
        });
        if (res.ok) {
          setSosResult(await res.json());
        }
      } catch (_) {}
      setSosLoading(false);
    },
    [sosSymptomKey, sosFreeQuery, sosHeatSource, sosToolId]
  );

  useEffect(() => {
    triggerSOS(sosSymptomKey, '');
  }, [sosSymptomKey, sosHeatSource, sosToolId]);

  // Run Ratio & Umami calculation
  useEffect(() => {
    let cancelled = false;
    fetch('/api/academy/ratios/calculate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ratioId: selectedRatioId,
        anchorGrams: Number(anchorGrams) || 100,
        ingredients: selectedUmamiChips
      })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) {
          setScaledRatio(data);
          if (data.umamiSynergy) setUmamiResult(data.umamiSynergy);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedRatioId, anchorGrams, selectedUmamiChips]);

  const handlePracticeSkill = async (skillId) => {
    setPracticingSkillId(skillId);
    try {
      const res = await fetch('/api/academy/skills/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: activeProfileId,
          skillId,
          visualOutcome: 'perfect'
        })
      });
      if (res.ok) {
        setCurriculum(await res.json());
      }
    } catch (_) {}
    setPracticingSkillId(null);
  };

  const handleRunImprovise = async (e) => {
    if (e) e.preventDefault();
    setImproviseLoading(true);
    try {
      const ingredients = fridgeInput
        .split(/[,;\n]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await fetch('/api/academy/improvise', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          availableIngredients: ingredients,
          ownedToolIds: [fridgeTool, 'pentola', 'coltello_chef'],
          heatSource: fridgeHeat,
          maxMinutes: Number(fridgeMinutes) || 18,
          servings: 1
        })
      });
      if (res.ok) {
        setImprovisedPlan(await res.json());
      }
    } catch (_) {}
    setImproviseLoading(false);
  };

  useEffect(() => {
    handleRunImprovise();
  }, []);

  const resolveDisplayedGuidance = (skill) => {
    const va = skill?.verbosityAdaptation;
    if (!va) return skill?.activeGuidanceText || '';
    const mode = verbosityOverride === 'auto' ? skill.masteryLevel : verbosityOverride;
    if (mode === 'master') return va.masterTarget;
    if (mode === 'practitioner') return va.intermediateCue;
    return va.noviceGuide;
  };

  const toggleUmamiChip = (chip) => {
    setSelectedUmamiChips((prev) =>
      prev.includes(chip) ? prev.filter((c) => c !== chip) : [...prev, chip]
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Accademia Scientifica */}
      <section className="bg-slate-900 text-white rounded-2xl p-5 shadow-md flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded bg-emerald-500 text-slate-950">
              Anima 2 · Scuola Scientifica d&apos;Arte Culinaria
            </span>
            {curriculum && (
              <span className="text-xs font-bold text-emerald-300">
                Livello Attivo: {curriculum.globalLevel.toUpperCase()} ({curriculum.practicedCount}/
                {curriculum.totalSkills} praticate · {curriculum.masteredCount} padroneggiate)
              </span>
            )}
          </div>
          <h2 className="text-xl font-extrabold mt-1.5">
            🎓 Accademia Culinaria, Ruhlman&apos;s Ratios &amp; SOS Fornelli 30s
          </h2>
          <p className="text-xs text-slate-300 mt-1 max-w-3xl">
            Dalle ricette da eseguire ai <strong>Principi Generativi</strong> (McGee · Kenji · Ruhlman · Bressanini):
            governo del calore latente (2.260 J/g), emulsioni amido-EVO fuori fuoco (&lt;65°C), cinetica proteica e
            moltiplicatore Umami 8× per una cucina ligure <em>Zero Formaggi</em> da maestro.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenMaestro && (
            <button
              type="button"
              onClick={() =>
                onOpenMaestro('Maestro, quale competenza tecnica mi consigli di allenare stasera con ciò che ho in casa?')
              }
              className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-extrabold cursor-pointer"
            >
              💬 Chiedi Lezione al Maestro
            </button>
          )}
          {onNavigateRoom && (
            <button
              type="button"
              onClick={() => onNavigateRoom('room-4-cucina')}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 text-xs font-bold cursor-pointer"
            >
              🍳 Officina Pentole &amp; Lame →
            </button>
          )}
        </div>
      </section>

      {/* Navigation Sub-Tabs */}
      <nav
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
        aria-label="Sezioni Accademia Culinaria"
      >
        {[
          { id: 'skills', label: '🌳 12 Competenze & 5 Pilastri' },
          { id: 'sos', label: '🔥 SOS Fornelli (30s)' },
          { id: 'ratios', label: '📐 Ratios & Umami 8×' },
          { id: 'improvise', label: '🧑‍🔬 Frigo → Tecnica' }
        ].map((tab) => {
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                active
                  ? 'bg-emerald-900 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </nav>

      {/* SECTION 1: 12 SKILLS & 5 PILLARS */}
      {activeSection === 'skills' && (
        <div className="space-y-5">
          {/* 5 Generative Pillars */}
          {curriculum?.fivePillars?.length > 0 && (
            <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <h3 className="text-sm font-extrabold text-slate-900">
                ⚛️ I 5 Pilastri Fisico-Chimici Generativi
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {curriculum.fivePillars.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5"
                  >
                    <div className="font-extrabold text-slate-900">{p.title}</div>
                    <div className="font-mono text-[10px] text-emerald-800 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                      {p.law}
                    </div>
                    <p className="text-[11px] text-slate-600 leading-relaxed">{p.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Verbosity Switch + 12 Skills Grid */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-slate-900">
                  🌳 Albero delle 12 Competenze Fondamentali
                </h3>
                <p className="text-xs text-slate-500">
                  La guida si accorcia automaticamente man mano che padroneggi il gesto (3 sessioni perfette = Maestro).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {VERBOSITY_MODES.map((vm) => (
                  <button
                    key={vm.id}
                    type="button"
                    onClick={() => setVerbosityOverride(vm.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border cursor-pointer ${
                      verbosityOverride === vm.id
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {vm.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {(curriculum?.skills || []).map((sk) => {
                const isMaster = sk.masteryLevel === 'master';
                const isPractitioner = sk.masteryLevel === 'practitioner';
                return (
                  <article
                    key={sk.id}
                    className={`rounded-xl border p-3.5 text-xs flex flex-col justify-between space-y-3 ${
                      isMaster
                        ? 'bg-emerald-50/50 border-emerald-300'
                        : sk.unlocked
                          ? 'bg-white border-slate-200'
                          : 'bg-slate-50/80 border-slate-200 opacity-90'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-slate-900 text-white">
                           #{sk.order} · Tier {sk.tier}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                            isMaster
                              ? 'bg-emerald-600 text-white'
                              : isPractitioner
                                ? 'bg-amber-100 text-amber-900'
                                : sk.unlocked
                                  ? 'bg-sky-100 text-sky-900'
                                  : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {isMaster
                            ? '★ Maestro'
                            : isPractitioner
                              ? `In pratica (${sk.perfectCount}/3)`
                              : sk.unlocked
                                ? 'Sbloccata'
                                : 'Prerequisito consigliato'}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-sm text-slate-900">{sk.title}</h4>
                      <p className="text-[11px] text-slate-600">{sk.corePhysicsLaw}</p>

                      <div className="p-2.5 rounded-lg bg-indigo-50/70 border border-indigo-200 text-[11px] text-indigo-950">
                        <strong>Guida adattiva:</strong> {resolveDisplayedGuidance(sk)}
                      </div>

                      {sk.sensoryCheckpoints && (
                        <div className="text-[11px] text-slate-600 space-y-0.5 pt-1">
                          <div>
                            <strong>👁️ Vista:</strong> {sk.sensoryCheckpoints.visual}
                          </div>
                          <div>
                            <strong>👂 Udito:</strong> {sk.sensoryCheckpoints.acoustic}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-100">
                      <span className="text-[10px] font-mono text-slate-500">
                        Target: {sk.criticalTempRangeC?.[0]}–{sk.criticalTempRangeC?.[1]}°C
                      </span>
                      <button
                        type="button"
                        disabled={practicingSkillId === sk.id}
                        onClick={() => handlePracticeSkill(sk.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 disabled:opacity-60 text-white text-[11px] font-extrabold cursor-pointer"
                      >
                        {practicingSkillId === sk.id ? 'Salvataggio...' : '✓ Segna praticata'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* SECTION 2: SOS FORNELLI IN 30 SECONDS */}
      {activeSection === 'sos' && (
        <section className="bg-white rounded-2xl border-2 border-rose-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-600 text-white">
              Pronto Soccorso Molecolare · 1 Mano Libera
            </span>
            <h3 className="text-base font-extrabold text-slate-900 mt-1">
              🔥 SOS Fornelli in 30 Secondi — Cosa sta succedendo adesso in padella?
            </h3>
          </div>

          {/* 6 Quick Symptom Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {SOS_QUICK_SYMPTOMS.map((s) => {
              const selected = sosSymptomKey === s.key && !sosFreeQuery;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => {
                    setSosFreeQuery('');
                    setSosSymptomKey(s.key);
                  }}
                  className={`p-3 rounded-xl border text-left text-xs font-extrabold transition-all cursor-pointer ${
                    selected
                      ? 'bg-rose-700 text-white border-rose-800 shadow-xs'
                      : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-rose-300'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>

          {/* Stove, Pan & Free-Text Diagnostic Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <select
              aria-label="Fornello in uso per SOS"
              value={sosHeatSource}
              onChange={(e) => setSosHeatSource(e.target.value)}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              {STOVE_OPTIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>

            <select
              aria-label="Pentola in uso per SOS"
              value={sosToolId}
              onChange={(e) => setSosToolId(e.target.value)}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              {PAN_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={sosFreeQuery}
              onChange={(e) => setSosFreeQuery(e.target.value)}
              placeholder="Oppure scrivi: es. pesto separato, polpo duro..."
              className="text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800"
            />

            <button
              type="button"
              onClick={() => triggerSOS(null, sosFreeQuery)}
              disabled={sosLoading}
              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
            >
              {sosLoading ? 'Analisi...' : '🚑 Diagnostica Subito'}
            </button>
          </div>

          {/* Rescue Card */}
          {sosResult && (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-rose-50 border-2 border-rose-300 text-xs text-rose-950">
                <div className="font-extrabold uppercase text-[11px] text-rose-800">
                  ⛔ FERMATI — Cosa NON fare assolutamente adesso:
                </div>
                <p className="font-bold mt-0.5">{sosResult.doNotDo}</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 space-y-2">
                <div className="font-extrabold text-sm text-emerald-900">
                  🚑 Manovra di Salvataggio in 30 Secondi ({sosResult.symptomLabel})
                </div>
                <div className="space-y-1.5">
                  {(sosResult.rescueIn30Seconds || []).map((step, idx) => (
                    <p key={idx} className="leading-relaxed font-medium">
                      {step}
                    </p>
                  ))}
                </div>
                {sosResult.equipmentContextNote && (
                  <div className="mt-2 pt-2 border-t border-emerald-200 font-bold text-emerald-900">
                    🎛️ {sosResult.equipmentContextNote}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <strong className="text-slate-900">⚛️ Causa Molecolare:</strong>{' '}
                  <span className="text-slate-700">{sosResult.molecularCause}</span>
                </div>
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200">
                  <strong className="text-amber-950">📓 Calibrazione Prossima Volta:</strong>{' '}
                  <span className="text-amber-900">{sosResult.nextTimeCalibration}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: RUHLMAN'S RATIOS & 8X UMAMI ZERO-CHEESE */}
      {activeSection === 'ratios' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Generative Ratios Calculator */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                📐 Calcolatore Rapporti Aurei (Ruhlman&apos;s Ratios)
              </h3>
              <p className="text-xs text-slate-500">
                Scegli la struttura e inserisci i grammi dell&apos;ingrediente guida: le proporzioni fisiche scalano all&apos;istante.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Formula Strutturale
                </label>
                <select
                  value={selectedRatioId}
                  onChange={(e) => setSelectedRatioId(e.target.value)}
                  className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-900"
                >
                  {ratiosCatalog.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Grammi Ingrediente Guida (g)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="10"
                    max="3000"
                    value={anchorGrams}
                    onChange={(e) => setAnchorGrams(Number(e.target.value) || 100)}
                    className="w-full text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 text-slate-900"
                  />
                  {[100, 150, 250].map((presetG) => (
                    <button
                      key={presetG}
                      type="button"
                      onClick={() => setAnchorGrams(presetG)}
                      className="px-2 py-1.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-extrabold text-slate-700 cursor-pointer"
                    >
                      {presetG}g
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {scaledRatio && (
              <div className="space-y-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-3 space-y-1.5 text-xs">
                  {(scaledRatio.scaledParts || []).map((part, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between border-b border-emerald-100 last:border-0 pb-1 last:pb-0"
                    >
                      <span className="font-medium text-slate-800">
                        {part.component}{' '}
                        <span className="text-[10px] text-slate-500">(rapporto {part.weightRatio})</span>
                      </span>
                      <span className="font-mono font-extrabold text-emerald-900">{part.grams} g</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div>
                    <strong>⚛️ Regola Fisica:</strong> {scaledRatio.physicsRule}
                  </div>
                  <div className="text-emerald-800 font-semibold">
                    <strong>🛡️ Nota Zero Formaggi:</strong> {scaledRatio.zeroDairyNote}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* 8x Umami Synergy Builder (Zero-Cheese) */}
          <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                🧬 Moltiplicatore Sinergico Umami 8× (Senza Latticini)
              </h3>
              <p className="text-xs text-slate-500">
                Seleziona gli ingredienti del piatto per verificare il blocco allosterico{' '}
                <code>L-Glutammato + IMP/GMP</code> sul recettore T1R1/T1R3.
              </p>
            </div>

            <div className="flex flex-wrap gap-1.5">
              {UMAMI_PRESET_CHIPS.map((chip) => {
                const active = selectedUmamiChips.includes(chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleUmamiChip(chip)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                      active
                        ? 'bg-amber-500 text-slate-950 border-amber-600'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {chip}
                  </button>
                );
              })}
            </div>

            {umamiResult && (
              <div
                className={`p-4 rounded-xl border text-xs space-y-2 ${
                  umamiResult.synergy8xActive
                    ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-extrabold text-sm">
                    {umamiResult.synergy8xActive ? '⚡ Sinergia Umami 8× ATTIVA!' : '⚖️ Canale Singolo (1×)'}
                  </span>
                  <span className="font-mono text-[11px] font-bold px-2 py-0.5 rounded bg-white/80 border border-current/20">
                    Glu: {umamiResult.hasGlutamate ? 'SÌ' : 'NO'} · IMP/GMP:{' '}
                    {umamiResult.hasNucleotide ? 'SÌ' : 'NO'}
                  </span>
                </div>
                <p className="leading-relaxed">{umamiResult.suggestion}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 4: IMPROVISE "FRIGO -> TECNICA" */}
      {activeSection === 'improvise' && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                🧑‍🔬 Generatore &ldquo;Frigo → Tecnica&rdquo; (Cucinare Senza Ricetta)
              </h3>
              <p className="text-xs text-slate-500">
                Inserisci 2–4 ingredienti che hai in frigo: il motore assembla taglio, padella, turni anti-bollitura ed emulsione finale.
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {FRIDGE_QUICK_PRESETS.map((pr, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setFridgeInput(pr.ingredients);
                    setFridgeMinutes(pr.maxMinutes);
                    setFridgeHeat(pr.heatSource);
                    setFridgeTool(pr.toolId);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 border border-slate-200 text-[11px] font-bold text-slate-700 cursor-pointer"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleRunImprovise} className="grid grid-cols-1 md:grid-cols-5 gap-2.5 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <input
              type="text"
              value={fridgeInput}
              onChange={(e) => setFridgeInput(e.target.value)}
              placeholder="Ingredienti separati da virgola..."
              className="md:col-span-2 text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-900"
            />
            <select
              value={fridgeHeat}
              onChange={(e) => setFridgeHeat(e.target.value)}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              {STOVE_OPTIONS.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>
            <select
              value={fridgeTool}
              onChange={(e) => setFridgeTool(e.target.value)}
              className="text-xs font-bold border border-slate-300 rounded-lg px-2.5 py-2 bg-white text-slate-800"
            >
              {PAN_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={improviseLoading}
              className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold cursor-pointer"
            >
              {improviseLoading ? 'Generazione...' : '⚡ Costruisci Tecnica'}
            </button>
          </form>

          {improvisedPlan && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/30 p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/70 pb-2">
                <h4 className="font-extrabold text-sm text-slate-900">
                  🍽️ {improvisedPlan.generatedTitle}
                </h4>
                <span className="font-bold text-emerald-900 bg-white px-2.5 py-1 rounded-lg border border-emerald-200">
                  ⏱️ ~{improvisedPlan.estimatedMinutes} min · {improvisedPlan.panPhysicsAndBatching?.guidance}
                </span>
              </div>

              {improvisedPlan.stoveAndSafety?.isBlockedP0 && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-950 font-bold">
                  ⛔ Guardia P0 Attivata: {improvisedPlan.stoveAndSafety.p0Blocks?.[0]?.message} →{' '}
                  {improvisedPlan.stoveAndSafety.p0Blocks?.[0]?.safeAction}
                </div>
              )}

              <div className="space-y-2">
                {(improvisedPlan.steps || []).map((st, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white border border-slate-200">
                    <strong>Fase {idx + 1}:</strong> {st}
                  </div>
                ))}
              </div>

              {improvisedPlan.umamiZeroCheeseAnalysis && (
                <div className="text-[11px] text-slate-700 pt-1">
                  <strong>🧬 Check Umami Zero-Formaggi:</strong>{' '}
                  {improvisedPlan.umamiZeroCheeseAnalysis.suggestion}
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default CulinaryAcademyPanel;
