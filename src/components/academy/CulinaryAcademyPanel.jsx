import React, { useState, useEffect, useCallback } from 'react';

const VERBOSITY_MODES = [
  { id: 'auto', label: 'Automatica (sul tuo livello)' },
  { id: 'novice', label: 'Principiante guidato' },
  { id: 'practitioner', label: 'Intermedio sintetico' },
  { id: 'master', label: 'Esperto (solo punti chiave)' }
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
      {/* Header Scuola di Cucina */}
      <section className="bg-white text-[#141A17] rounded-2xl border border-[#E5E2DA] p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA]">
              Scuola di cucina
            </span>
            {curriculum && (
              <span className="text-xs font-bold text-[#1B5E3A]">
                {curriculum.practicedCount}/{curriculum.totalSkills} tecniche provate · {curriculum.masteredCount} padroneggiate
              </span>
            )}
          </div>
          <h2 className="text-lg sm:text-xl font-extrabold text-[#141A17] mt-1.5">
            Tecniche di base, proporzioni e salvataggi ai fornelli
          </h2>
          <p className="text-xs text-[#575E58] mt-1 max-w-3xl">
            Capire come lavora il calore, legare le salse senza panna né formaggio, dosare a occhio e recuperare al volo un piatto in padella.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenMaestro && (
            <button
              type="button"
              onClick={() =>
                onOpenMaestro('Maestro, quale tecnica mi consigli di provare stasera con quello che ho in casa?')
              }
              className="px-3.5 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer transition-colors"
            >
              💬 Chiedi al Maestro
            </button>
          )}
          {onNavigateRoom && (
            <button
              type="button"
              onClick={() => onNavigateRoom('room-4-cucina')}
              className="px-3 py-2 rounded-xl bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-[#141A17] text-xs font-bold cursor-pointer"
            >
              🍳 Pentole e lame →
            </button>
          )}
        </div>
      </section>

      {/* Navigation Sub-Tabs */}
      <nav
        className="grid grid-cols-2 lg:grid-cols-4 gap-2"
        aria-label="Sezioni Scuola di Cucina"
      >
        {[
          { id: 'skills', label: '12 competenze di base' },
          { id: 'sos', label: 'SOS Fornelli (30s)' },
          { id: 'ratios', label: 'Proporzioni & Sapore' },
          { id: 'improvise', label: 'Cucina con quello che hai' }
        ].map((tab) => {
          const active = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveSection(tab.id)}
              className={`px-3 py-2.5 rounded-xl text-xs font-extrabold border transition-all cursor-pointer ${
                active
                  ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                  : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
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
          {/* 5 Cooking Principles */}
          {curriculum?.fivePillars?.length > 0 && (
            <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-3">
              <h3 className="text-sm font-extrabold text-[#141A17]">
                I 5 principi della buona cottura
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {curriculum.fivePillars.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-xs space-y-1.5"
                  >
                    <div className="font-extrabold text-[#141A17]">{p.title}</div>
                    <div className="text-[11px] font-semibold text-[#1B5E3A] bg-emerald-50/70 px-2 py-1 rounded border border-emerald-200">
                      {p.law}
                    </div>
                    <p className="text-[11px] text-[#575E58] leading-relaxed">{p.summary}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Verbosity Switch + 12 Skills Grid */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#E5E2DA] pb-3">
              <div>
                <h3 className="text-sm font-extrabold text-[#141A17]">
                  Le 12 competenze fondamentali
                </h3>
                <p className="text-xs text-[#575E58]">
                  La guida diventa più sintetica man mano che prendi confidenza (3 prove riuscite = padroneggiata).
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
                        ? 'bg-[#141A17] text-white border-[#141A17]'
                        : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
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
                        ? 'bg-emerald-50/40 border-[#1B5E3A]/40'
                        : sk.unlocked
                          ? 'bg-white border-[#E5E2DA]'
                          : 'bg-[#FAF9F6] border-[#E5E2DA] opacity-90'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-[#141A17] text-white">
                          Passo {sk.order} · Livello {sk.tier}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                            isMaster
                              ? 'bg-[#1B5E3A] text-white'
                              : isPractitioner
                                ? 'bg-amber-100 text-amber-950'
                                : sk.unlocked
                                  ? 'bg-[#F3F1EC] text-[#141A17]'
                                  : 'bg-stone-200 text-[#575E58]'
                          }`}
                        >
                          {isMaster
                            ? '★ Padroneggiata'
                            : isPractitioner
                              ? `In pratica (${sk.perfectCount}/3)`
                              : sk.unlocked
                                ? 'Disponibile'
                                : 'Dopo le basi'}
                        </span>
                      </div>

                      <h4 className="font-extrabold text-sm text-[#141A17]">{sk.title}</h4>
                      <p className="text-[11px] text-[#575E58]">{sk.corePhysicsLaw}</p>

                      <div className="p-2.5 rounded-lg bg-[#F3F1EC] border border-[#E5E2DA] text-[11px] text-[#141A17]">
                        <strong>Guida pratica:</strong> {resolveDisplayedGuidance(sk)}
                      </div>

                      {sk.sensoryCheckpoints && (
                        <div className="text-[11px] text-[#575E58] space-y-0.5 pt-1">
                          <div>
                            <strong className="text-[#141A17]">Cosa guardare:</strong> {sk.sensoryCheckpoints.visual}
                          </div>
                          <div>
                            <strong className="text-[#141A17]">Cosa ascoltare:</strong> {sk.sensoryCheckpoints.acoustic}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[#E5E2DA]">
                      <span className="text-[10px] font-medium text-[#575E58]">
                        Temperatura: {sk.criticalTempRangeC?.[0]}–{sk.criticalTempRangeC?.[1]}°C
                      </span>
                      <button
                        type="button"
                        disabled={practicingSkillId === sk.id}
                        onClick={() => handlePracticeSkill(sk.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] disabled:opacity-60 text-white text-[11px] font-extrabold cursor-pointer"
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
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
          <div>
            <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-900 border border-rose-200">
              Salvataggio rapido ai fornelli · 30 secondi
            </span>
            <h3 className="text-base font-extrabold text-[#141A17] mt-1.5">
              Cosa sta succedendo adesso in padella?
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
                      ? 'bg-[#141A17] text-white border-[#141A17] shadow-xs'
                      : 'bg-[#FAF9F6] text-[#141A17] border-[#E5E2DA] hover:border-[#1B5E3A]'
                  }`}
                >
                  {s.icon} {s.label}
                </button>
              );
            })}
          </div>

          {/* Stove, Pan & Free-Text Diagnostic Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5 bg-[#FAF9F6] p-3 rounded-xl border border-[#E5E2DA]">
            <select
              aria-label="Fornello in uso per SOS"
              value={sosHeatSource}
              onChange={(e) => setSosHeatSource(e.target.value)}
              className="text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white text-[#141A17]"
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
              className="text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white text-[#141A17]"
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
              className="text-xs border border-[#E5E2DA] rounded-lg px-3 py-2 bg-white text-[#141A17]"
            />

            <button
              type="button"
              onClick={() => triggerSOS(null, sosFreeQuery)}
              disabled={sosLoading}
              className="px-3 py-2 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              {sosLoading ? 'Analisi...' : 'Trova rimedio subito'}
            </button>
          </div>

          {/* Rescue Card */}
          {sosResult && (
            <div className="space-y-3 pt-1">
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-300 text-xs text-rose-950">
                <div className="font-extrabold uppercase text-[11px] text-rose-900">
                  ⛔ Fermati: cosa non fare adesso
                </div>
                <p className="font-bold mt-0.5">{sosResult.doNotDo}</p>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-[#1B5E3A]/30 text-xs text-[#141A17] space-y-2">
                <div className="font-extrabold text-sm text-[#1B5E3A]">
                  Come rimediare in 30 secondi ({sosResult.symptomLabel})
                </div>
                <div className="space-y-1.5">
                  {(sosResult.rescueIn30Seconds || []).map((step, idx) => (
                    <p key={idx} className="leading-relaxed font-medium">
                      {step}
                    </p>
                  ))}
                </div>
                {sosResult.equipmentContextNote && (
                  <div className="mt-2 pt-2 border-t border-emerald-200 font-bold text-[#1B5E3A]">
                    {sosResult.equipmentContextNote}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                  <strong className="text-[#141A17]">Perché succede:</strong>{' '}
                  <span className="text-[#575E58]">{sosResult.molecularCause}</span>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                  <strong className="text-[#141A17]">Per la prossima volta:</strong>{' '}
                  <span className="text-[#575E58]">{sosResult.nextTimeCalibration}</span>
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: PROPORTIONS & FLAVOR WITHOUT DAIRY */}
      {activeSection === 'ratios' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {/* Generative Ratios Calculator */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#141A17]">
                Proporzioni di base senza ricetta
              </h3>
              <p className="text-xs text-[#575E58]">
                Scegli la preparazione e inserisci i grammi principali: tutte le dosi si aggiornano in proporzione.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-[#141A17] mb-1">
                  Preparazione base
                </label>
                <select
                  value={selectedRatioId}
                  onChange={(e) => setSelectedRatioId(e.target.value)}
                  className="w-full text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white text-[#141A17]"
                >
                  {ratiosCatalog.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[#141A17] mb-1">
                  Grammi ingrediente principale (g)
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    type="number"
                    min="10"
                    max="3000"
                    value={anchorGrams}
                    onChange={(e) => setAnchorGrams(Number(e.target.value) || 100)}
                    className="w-full text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 text-[#141A17]"
                  />
                  {[100, 150, 250].map((presetG) => (
                    <button
                      key={presetG}
                      type="button"
                      onClick={() => setAnchorGrams(presetG)}
                      className="px-2 py-1.5 rounded bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[10px] font-extrabold text-[#141A17] cursor-pointer"
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
                      <span className="font-medium text-[#141A17]">
                        {part.component}{' '}
                        <span className="text-[10px] text-[#575E58]">(rapporto {part.weightRatio})</span>
                      </span>
                      <span className="font-mono font-extrabold text-[#1B5E3A]">{part.grams} g</span>
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-xs space-y-1">
                  <div>
                    <strong className="text-[#141A17]">Regola pratica:</strong> {scaledRatio.physicsRule}
                  </div>
                  <div className="text-[#1B5E3A] font-semibold">
                    <strong>Senza formaggi:</strong> {scaledRatio.zeroDairyNote}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Zero-Cheese Flavor Synergy */}
          <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs space-y-4">
            <div>
              <h3 className="text-sm font-extrabold text-[#141A17]">
                Dare sapore pieno senza formaggio
              </h3>
              <p className="text-xs text-[#575E58]">
                Abbina ingredienti ricchi di sapore naturale (pomodoro maturo, funghi, acciughe, olive) per moltiplicare la profondità del piatto senza latticini.
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
                        ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                        : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
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
                    ? 'bg-emerald-50/70 border-[#1B5E3A]/30 text-[#141A17]'
                    : 'bg-[#FAF9F6] border-[#E5E2DA] text-[#141A17]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-sm text-[#1B5E3A]">
                    {umamiResult.synergy8xActive ? 'Abbinamento sapore pieno attivo' : 'Sapore su un solo registro'}
                  </span>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-white border border-[#E5E2DA] text-[#575E58]">
                    {umamiResult.synergy8xActive ? 'Sapore moltiplicato' : 'Aggiungi un secondo aroma'}
                  </span>
                </div>
                <p className="leading-relaxed text-[#575E58]">{umamiResult.suggestion}</p>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 4: IMPROVISE FROM FRIDGE */}
      {activeSection === 'improvise' && (
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-[#141A17]">
                Cucina dal frigo senza ricetta
              </h3>
              <p className="text-xs text-[#575E58]">
                Scrivi 2–4 ingredienti che hai in casa: ottieni taglio, padella adatta, ordine di cottura e legatura finale.
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
                  className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-[11px] font-bold text-[#141A17] cursor-pointer"
                >
                  {pr.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleRunImprovise} className="grid grid-cols-1 md:grid-cols-5 gap-2.5 bg-[#FAF9F6] p-3 rounded-xl border border-[#E5E2DA]">
            <input
              type="text"
              value={fridgeInput}
              onChange={(e) => setFridgeInput(e.target.value)}
              placeholder="Ingredienti separati da virgola..."
              className="md:col-span-2 text-xs border border-[#E5E2DA] rounded-lg px-3 py-2 bg-white text-[#141A17]"
            />
            <select
              value={fridgeHeat}
              onChange={(e) => setFridgeHeat(e.target.value)}
              className="text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white text-[#141A17]"
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
              className="text-xs font-bold border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white text-[#141A17]"
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
              className="px-3 py-2 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              {improviseLoading ? 'Preparazione...' : 'Crea la sequenza'}
            </button>
          </form>

          {improvisedPlan && (
            <div className="rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E5E2DA] pb-2">
                <h4 className="font-extrabold text-sm text-[#141A17]">
                  🍽️ {improvisedPlan.generatedTitle}
                </h4>
                <span className="font-bold text-[#1B5E3A] bg-white px-2.5 py-1 rounded-lg border border-[#E5E2DA]">
                  ⏱️ ~{improvisedPlan.estimatedMinutes} min · {improvisedPlan.panPhysicsAndBatching?.guidance}
                </span>
              </div>

              {improvisedPlan.stoveAndSafety?.isBlockedP0 && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-300 text-rose-950 font-bold">
                  ⛔ Attenzione sicurezza: {improvisedPlan.stoveAndSafety.p0Blocks?.[0]?.message} →{' '}
                  {improvisedPlan.stoveAndSafety.p0Blocks?.[0]?.safeAction}
                </div>
              )}

              <div className="space-y-2">
                {(improvisedPlan.steps || []).map((st, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-white border border-[#E5E2DA] text-[#141A17]">
                    <strong>Fase {idx + 1}:</strong> {st}
                  </div>
                ))}
              </div>

              {improvisedPlan.umamiZeroCheeseAnalysis && (
                <div className="text-[11px] text-[#575E58] pt-1">
                  <strong className="text-[#141A17]">Equilibrio di sapore senza formaggi:</strong>{' '}
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
