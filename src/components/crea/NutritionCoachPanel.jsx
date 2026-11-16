import React, { useState, useEffect, useCallback } from 'react';

const LAB_MEAL_SCENARIOS = [
  {
    id: 'zero_cheese_high_ca',
    label: '🥦 Cime di rapa + Alici',
    subtitle: 'Ottimo assorbimento di calcio senza formaggi',
    defaultMethod: 'steamed',
    defaultAddedFatG: 10,
    defaultCooledHours: 0,
    ingredients: [
      { creaId: '005090', name: 'Broccoletti di rapa, crudi', grams: 180 },
      { creaId: '120010', name: 'Acciuga o alice', grams: 120 }
    ]
  },
  {
    id: 'oxalate_spinach_trap',
    label: '⚠️ Spinaci lessi',
    subtitle: 'Tanto calcio sulla carta, ma quasi bloccato dagli ossalati',
    defaultMethod: 'boiled_drained',
    defaultAddedFatG: 8,
    defaultCooledHours: 0,
    ingredients: [{ creaId: '005700', name: 'Spinaci, crudi', grams: 220 }]
  },
  {
    id: 'iron_vitc_aa_synergy',
    label: '🍋 Pasta, lenticchie e limone',
    subtitle: 'Proteine complete e ferro tre volte più assorbibile',
    defaultMethod: 'stewed_liquid_kept',
    defaultAddedFatG: 10,
    defaultCooledHours: 0,
    ingredients: [
      { creaId: '000800', name: 'Pasta di semola', grams: 75 },
      { creaId: '004500', name: 'Lenticchie, secche', grams: 65 },
      { creaId: '008040', name: 'Limoni, succo (a crudo)', grams: 75, cookingMethod: 'raw' }
    ]
  },
  {
    id: 'lycopene_evo_heat',
    label: '🍅 Pomodoro cotto + olio EVO',
    subtitle: 'La cottura con olio sprigiona più licopene assimilabile',
    defaultMethod: 'stewed_liquid_kept',
    defaultAddedFatG: 12,
    defaultCooledHours: 0,
    ingredients: [
      { creaId: '006610', name: 'Pomodori, maturi, freschi', grams: 250 },
      { creaId: '000800', name: 'Pasta di semola', grams: 80 }
    ]
  },
  {
    id: 'boat_rs3_retrograded',
    label: '⛵ Riso freddo e sgombro per la barca',
    subtitle: 'Raffreddato 14 ore in frigo per restare leggero al timone',
    defaultMethod: 'boiled_drained',
    defaultAddedFatG: 10,
    defaultCooledHours: 14,
    ingredients: [
      { creaId: '000100', name: 'Riso, brillato', grams: 90 },
      { creaId: '123010', name: 'Sgombro in salamoia', grams: 110, cookingMethod: 'raw' },
      { creaId: '005600', name: 'Peperoni crudi', grams: 70, cookingMethod: 'raw' }
    ]
  }
];

const COOKING_METHODS_UI = [
  { id: 'steamed', label: '💨 Cottura a vapore (preserva le vitamine)' },
  { id: 'boiled_drained', label: "💧 Bollito e scolato (disperde minerali nell'acqua)" },
  { id: 'stewed_liquid_kept', label: '🍲 Zuppa o risottato (tutto nel piatto)' },
  { id: 'pan_seared_gentle', label: '🍳 Padella dolce (≤160°C)' },
  { id: 'pan_seared_high', label: '🔥 Padella vivace o forno (>175°C)' },
  { id: 'raw', label: '🥗 Crudo / Assemblato a freddo' }
];

const BADGE_TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-950 border-emerald-200',
  amber: 'bg-amber-50 text-amber-950 border-amber-200',
  rose: 'bg-rose-50 text-rose-950 border-rose-200',
  sky: 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA]'
};

export function NutritionCoachPanel({
  activeProfileId = 'dany',
  onNavigateRoom,
  onOpenMaestro
}) {
  // 1. LARN Presets & Optional Mifflin-St Jeor state
  const [presetsList, setPresetsList] = useState([]);
  const [selectedPresetId, setSelectedPresetId] = useState('active_adult');
  const [showAdvancedLarn, setShowAdvancedLarn] = useState(false);
  const [advForm, setAdvForm] = useState({
    sex: 'M',
    ageYears: 38,
    weightKg: 72,
    heightCm: 178,
    laf: 1.6,
    goalDeltaKcal: 0
  });
  const [activeTargets, setActiveTargets] = useState(null);

  // 2. Cooked Meal Physiology Lab state
  const [selectedScenarioId, setSelectedScenarioId] = useState(LAB_MEAL_SCENARIOS[0].id);
  const [cookingMethod, setCookingMethod] = useState(LAB_MEAL_SCENARIOS[0].defaultMethod);
  const [addedFatGrams, setAddedFatGrams] = useState(LAB_MEAL_SCENARIOS[0].defaultAddedFatG);
  const [cooledHours, setCooledHours] = useState(LAB_MEAL_SCENARIOS[0].defaultCooledHours);
  const [mealEval, setMealEval] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);
  const [bioGuide, setBioGuide] = useState(null);
  const [showGuidePillars, setShowGuidePillars] = useState(false);

  // 3. Adaptive Coaching 1-Tap state
  const [outDishInput, setOutDishInput] = useState('Pansotti in salsa di noci');
  const [adaptResult, setAdaptResult] = useState(null);
  const [adaptLoading, setAdaptLoading] = useState(false);

  // 4. Passive Receipt Audit state
  const [receiptAudit, setReceiptAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);

  const activeScenario =
    LAB_MEAL_SCENARIOS.find((s) => s.id === selectedScenarioId) || LAB_MEAL_SCENARIOS[0];

  const fetchPresetsAndTargets = useCallback(() => {
    const params = new URLSearchParams({
      presetId: selectedPresetId,
      profileId: activeProfileId
    });
    if (showAdvancedLarn) {
      params.set('sex', String(advForm.sex));
      params.set('ageYears', String(advForm.ageYears));
      params.set('weightKg', String(advForm.weightKg));
      params.set('heightCm', String(advForm.heightCm));
      params.set('laf', String(advForm.laf));
      params.set('goalDeltaKcal', String(advForm.goalDeltaKcal));
    }

    fetch(`/api/nutrition-coach/presets?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (Array.isArray(data.presets)) setPresetsList(data.presets);
          if (data.activeTargets) setActiveTargets(data.activeTargets);
        }
      })
      .catch(() => {});
  }, [selectedPresetId, activeProfileId, showAdvancedLarn, advForm]);

  const fetchMealEvaluation = useCallback(() => {
    setEvalLoading(true);
    fetch('/api/nutrition-coach/evaluate-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ingredients: activeScenario.ingredients,
        cookingMethod,
        addedFatGrams,
        cooledHours
      })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setMealEval(data);
      })
      .catch(() => {})
      .finally(() => setEvalLoading(false));
  }, [activeScenario, cookingMethod, addedFatGrams, cooledHours]);

  const fetchBioGuideAndAudit = useCallback(() => {
    fetch(`/api/nutrition-coach/bioavailability-guide?profileId=${encodeURIComponent(activeProfileId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setBioGuide(data);
      })
      .catch(() => {});

    setAuditLoading(true);
    fetch(`/api/nutrition-coach/receipt-audit?profileId=${encodeURIComponent(activeProfileId)}&windowDays=21`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setReceiptAudit(data);
      })
      .catch(() => {})
      .finally(() => setAuditLoading(false));
  }, [activeProfileId]);

  useEffect(() => {
    fetchPresetsAndTargets();
  }, [fetchPresetsAndTargets]);

  useEffect(() => {
    fetchMealEvaluation();
  }, [fetchMealEvaluation]);

  useEffect(() => {
    fetchBioGuideAndAudit();
  }, [fetchBioGuideAndAudit]);

  const handleSelectScenario = (scen) => {
    setSelectedScenarioId(scen.id);
    setCookingMethod(scen.defaultMethod);
    setAddedFatGrams(scen.defaultAddedFatG);
    setCooledHours(scen.defaultCooledHours);
  };

  const triggerAdaptiveCoach = (eventType) => {
    setAdaptLoading(true);
    fetch('/api/nutrition-coach/adapt', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        eventType,
        profileId: activeProfileId,
        presetId: selectedPresetId,
        useCurrentPlan: true,
        restaurantDish: eventType === 'eat_out' ? outDishInput : undefined
      })
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAdaptResult(data);
      })
      .catch(() => {})
      .finally(() => setAdaptLoading(false));
  };

  const targets = activeTargets?.dailyTargets || null;

  return (
    <div className="space-y-5" data-testid="nutrition-coach-panel">
      {/* 1. Daily Nutritional Targets */}
      <section className="bg-white rounded-2xl border border-[#E5E2DA] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🥗</span>
              <h3 className="text-base font-extrabold text-[#141A17]">
                Obiettivi nutrizionali quotidiani
              </h3>
            </div>
            <p className="text-xs text-[#575E58] mt-0.5">
              Profili rapidi basati sui riferimenti nutrizionali italiani, con calcolo personale opzionale.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {activeTargets?.zeroCheeseCalciumGuardActive && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-[#1B5E3A] border border-emerald-200">
                Attenzione al calcio senza formaggi
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAdvancedLarn((v) => !v)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA] hover:bg-[#E7E4DC] cursor-pointer"
            >
              {showAdvancedLarn ? 'Chiudi parametri personali' : 'Calcola sul tuo profilo'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          {presetsList.map((p) => {
            const isSelected = p.id === selectedPresetId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPresetId(p.id)}
                className={`text-left p-3 rounded-xl border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-50/70 border-[#1B5E3A] ring-1 ring-[#1B5E3A]'
                    : 'bg-[#FAF9F6] border-[#E5E2DA] hover:border-[#1B5E3A]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-[#141A17]">
                    {p.icon} {p.shortLabel}
                  </span>
                  <span className="text-[11px] font-bold text-[#1B5E3A]">
                    {p.dailyTargets?.kcal} kcal
                  </span>
                </div>
                <p className="text-[11px] text-[#575E58] mt-1 line-clamp-2">{p.description}</p>
              </button>
            );
          })}
        </div>

        {showAdvancedLarn && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Sesso</label>
              <select
                value={advForm.sex}
                onChange={(e) => setAdvForm((f) => ({ ...f, sex: e.target.value }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              >
                <option value="M">Uomo (M)</option>
                <option value="F">Donna (F)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Età (anni)</label>
              <input
                type="number"
                min={18}
                max={95}
                value={advForm.ageYears}
                onChange={(e) => setAdvForm((f) => ({ ...f, ageYears: Number(e.target.value) || 38 }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Peso (kg)</label>
              <input
                type="number"
                min={40}
                max={160}
                value={advForm.weightKg}
                onChange={(e) => setAdvForm((f) => ({ ...f, weightKg: Number(e.target.value) || 72 }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Altezza (cm)</label>
              <input
                type="number"
                min={140}
                max={215}
                value={advForm.heightCm}
                onChange={(e) => setAdvForm((f) => ({ ...f, heightCm: Number(e.target.value) || 178 }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Livello di attività</label>
              <select
                value={advForm.laf}
                onChange={(e) => setAdvForm((f) => ({ ...f, laf: Number(e.target.value) }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              >
                <option value={1.45}>Sedentario</option>
                <option value={1.6}>Attivo</option>
                <option value={1.75}>Sportivo</option>
                <option value={1.95}>Molto intenso</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-[#575E58]">Variazione kcal</label>
              <input
                type="number"
                min={-400}
                max={400}
                step={50}
                value={advForm.goalDeltaKcal}
                onChange={(e) => setAdvForm((f) => ({ ...f, goalDeltaKcal: Number(e.target.value) || 0 }))}
                className="w-full mt-0.5 text-xs border border-[#E5E2DA] rounded-lg px-2 py-1.5 bg-white text-[#141A17]"
              />
            </div>
          </div>
        )}

        {targets && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
            {[
              { label: 'Energia', val: `${targets.kcal} kcal` },
              { label: 'Proteine', val: `${targets.proteinG} g` },
              { label: 'Fibre minime', val: `${targets.fiberG} g` },
              { label: 'Calcio', val: `${targets.calciumMg} mg` },
              { label: 'Ferro', val: `${targets.ironMg} mg` },
              { label: 'Potassio', val: `${targets.potassiumMg} mg` },
              { label: 'Omega-3', val: `${targets.epaDhaMg} mg` },
              { label: 'Limite sodio', val: `<${targets.sodiumMaxMg} mg` }
            ].map((item) => (
              <div key={item.label} className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg px-2.5 py-2">
                <div className="text-[10px] font-semibold text-[#575E58]">{item.label}</div>
                <div className="text-xs font-extrabold text-[#141A17]">{item.val}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Cooked Meal & Bioavailability Comparison */}
      <section className="bg-white rounded-2xl border border-[#E5E2DA] p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[#141A17]">
              Come cambia il piatto con la cottura
            </h3>
            <p className="text-xs text-[#575E58]">
              Confronta cosa trattengono le verdure al vapore o bollite, quanto calcio assorbi davvero e come olio o riposo in frigo cambiano i nutrienti.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidePillars((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA] hover:bg-[#E7E4DC] cursor-pointer shrink-0"
          >
            {showGuidePillars ? 'Chiudi principi' : '📖 5 regole chiave'}
          </button>
        </div>

        {/* Scenario Selector Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
          {LAB_MEAL_SCENARIOS.map((sc) => (
            <button
              key={sc.id}
              type="button"
              onClick={() => handleSelectScenario(sc)}
              className={`px-3 py-2 rounded-xl text-left border shrink-0 transition-colors cursor-pointer ${
                selectedScenarioId === sc.id
                  ? 'bg-[#141A17] text-white border-[#141A17]'
                  : 'bg-[#FAF9F6] text-[#141A17] border-[#E5E2DA] hover:border-[#1B5E3A]'
              }`}
            >
              <div className="text-xs font-extrabold">{sc.label}</div>
              <div className={`text-[10px] ${selectedScenarioId === sc.id ? 'text-stone-300' : 'text-[#575E58]'}`}>
                {sc.subtitle}
              </div>
            </button>
          ))}
        </div>

        {/* Interactive Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-[#FAF9F6] p-3.5 rounded-xl border border-[#E5E2DA]">
          <div>
            <label className="block text-[11px] font-bold text-[#575E58] mb-1">
              Metodo di cottura
            </label>
            <select
              value={cookingMethod}
              onChange={(e) => setCookingMethod(e.target.value)}
              className="w-full text-xs border border-[#E5E2DA] rounded-lg px-2.5 py-2 bg-white font-semibold text-[#141A17]"
            >
              {COOKING_METHODS_UI.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#575E58] mb-1">
              Olio extravergine aggiunto: <strong className="text-[#141A17]">{addedFatGrams} g</strong>
            </label>
            <input
              type="range"
              min={0}
              max={20}
              step={2}
              value={addedFatGrams}
              onChange={(e) => setAddedFatGrams(Number(e.target.value))}
              className="w-full accent-[#1B5E3A] mt-1.5"
            />
            <div className="flex justify-between text-[10px] text-[#575E58]">
              <span>0 g (senza olio)</span>
              <span>≥5 g assorbe le vitamine</span>
              <span>20 g</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-[#575E58] mb-1">
              Riposo in frigo prima di mangiare: <strong className="text-[#141A17]">{cooledHours} h</strong>
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setCooledHours(0)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  cooledHours < 12
                    ? 'bg-amber-50 border-amber-400 text-amber-950'
                    : 'bg-white border-[#E5E2DA] text-[#575E58]'
                }`}
              >
                Appena cotto (0 h)
              </button>
              <button
                type="button"
                onClick={() => setCooledHours(14)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  cooledHours >= 12
                    ? 'bg-emerald-50 border-[#1B5E3A] text-[#1B5E3A]'
                    : 'bg-white border-[#E5E2DA] text-[#575E58]'
                }`}
              >
                In frigo 14 h (barca)
              </button>
            </div>
          </div>
        </div>

        {/* Live Evaluation Output */}
        {evalLoading ? (
          <div className="text-xs text-[#575E58] py-4">Calcolo i valori reali del piatto cotto...</div>
        ) : (
          mealEval && (
            <div className="space-y-3">
              {/* Bioavailability Badges */}
              {mealEval.badges?.length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                  {mealEval.badges.map((b) => (
                    <div
                      key={b.code}
                      className={`p-3 rounded-xl border text-xs ${
                        BADGE_TONE_CLASSES[b.tone] || BADGE_TONE_CLASSES.sky
                      }`}
                    >
                      <div className="font-extrabold">{b.label}</div>
                      <div className="text-[11px] opacity-90 mt-0.5">{b.detail}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* Key Cooked Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Peso nel piatto</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.weights?.cookedWeightGrams} g
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Calorie su 100 g</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.satietyAndVolumetrics?.cookedEnergyDensityKcalPer100g} kcal
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Proteine</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.nutrients?.proteinG} g{' '}
                    {mealEval.bioavailability?.aminoAcids?.chemicalScorePct != null &&
                      `(${mealEval.bioavailability.aminoAcids.chemicalScorePct}%)`}
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Vitamina C rimasta</div>
                  <div className="text-xs font-extrabold text-[#1B5E3A]">
                    {mealEval.nutrients?.vitaminCMg ?? 'n.d.'} mg
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Calcio ben assorbito</div>
                  <div className="text-xs font-extrabold text-[#1B5E3A]">
                    {mealEval.bioavailability?.calcium?.highBioavailCalciumMg} / {mealEval.nutrients?.calciumMg ?? 0} mg
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Ferro (anim. / tot.)</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.bioavailability?.iron?.hemeIronMg} / {mealEval.nutrients?.ironMg ?? 0} mg
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Potassio rimasto</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.nutrients?.potassiumMg ?? 'n.d.'} mg
                  </div>
                </div>
                <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-lg p-2.5">
                  <div className="text-[10px] text-[#575E58] font-bold">Omega-3 · Fibre</div>
                  <div className="text-xs font-extrabold text-[#141A17]">
                    {mealEval.nutrients?.epaDhaG ?? 0} g · {mealEval.nutrients?.fiberG ?? 0} g
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {showGuidePillars && bioGuide?.pillars && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-[#E5E2DA]">
            {bioGuide.pillars.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-xs">
                <div className="font-extrabold text-[#141A17]">{p.title}</div>
                <p className="text-[11px] text-[#575E58] mt-1">{p.rule}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. 1-Tap Adaptive Day Adjustment & 4. Receipt Nutrition Check */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Adaptive Day Card */}
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-[#141A17]">
                Adatta la giornata in un tocco
              </h3>
              <p className="text-xs text-[#575E58]">
                Compensa con equilibrio su più giorni e usa prima i freschi già aperti in frigo.
              </p>
            </div>
            {onOpenMaestro && (
              <button
                type="button"
                onClick={() => onOpenMaestro('Aiutami ad adattare la cena di stasera senza sprecare i freschi in frigo')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-[#141A17] text-white hover:bg-[#2A332E] cursor-pointer shrink-0"
              >
                💬 Chiedi al Maestro
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={outDishInput}
              onChange={(e) => setOutDishInput(e.target.value)}
              placeholder="Cosa hai mangiato fuori? (es. Pansotti, Frittura...)"
              className="flex-1 text-xs border border-[#E5E2DA] rounded-xl px-3 py-2 bg-white text-[#141A17]"
            />
            <button
              type="button"
              disabled={adaptLoading}
              onClick={() => triggerAdaptiveCoach('eat_out')}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA] hover:bg-[#E7E4DC] cursor-pointer shrink-0"
            >
              🍽️ Ho mangiato fuori
            </button>
          </div>

          <button
            type="button"
            disabled={adaptLoading}
            onClick={() => triggerAdaptiveCoach('emergency_5min')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold bg-[#1B5E3A] text-white hover:bg-[#14492D] cursor-pointer transition-colors"
          >
            ⚡ Sono stanco: piatto veloce in 5 minuti (zero pentole)
          </button>

          {adaptResult && (
            <div className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] space-y-2.5 text-xs">
              <div className="font-bold text-[#141A17]">{adaptResult.coachingMessage}</div>

              {adaptResult.eventType === 'eat_out' && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-[#1B5E3A]">
                    ✓ Equilibrio garantito senza tagli rigidi ({adaptResult.gentleAdjustedDailyTargetKcal} kcal al giorno nei prossimi 4 giorni)
                  </div>
                  {adaptResult.rebalanceActions?.map((act) => (
                    <div key={act.code} className="p-2 rounded-lg bg-white border border-[#E5E2DA] text-[11px]">
                      <span className="font-extrabold text-[#141A17]">{act.horizon}:</span> {act.recommendation}
                    </div>
                  ))}
                </div>
              )}

              {adaptResult.eventType === 'emergency_5min' && adaptResult.rescueMeals?.length > 0 && (
                <div className="space-y-2">
                  {adaptResult.rescueMeals.slice(0, 2).map((rm) => (
                    <div key={rm.id} className="p-2.5 rounded-lg bg-white border border-[#E5E2DA]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-[#141A17]">{rm.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-[#1B5E3A] border border-emerald-200 shrink-0">
                          {rm.prepMinutes} min · 0 pentole
                        </span>
                      </div>
                      <p className="text-[11px] text-[#575E58] mt-1">{rm.stepsSummary}</p>
                      <div className="text-[10px] font-bold text-[#141A17] mt-1">
                        {rm.physiology?.nutrients?.kcal} kcal · {rm.physiology?.nutrients?.proteinG}g proteine ·{' '}
                        {rm.physiology?.nutrients?.epaDhaG ?? 0}g omega-3 · {rm.physiology?.nutrients?.vitaminCMg ?? 0}mg vit. C
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Receipt Nutrition Check Card */}
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-[#141A17]">
                Controllo nutrizionale dai tuoi scontrini
              </h3>
              <p className="text-xs text-[#575E58]">
                Verifica cosa manca nella spesa delle ultime tre settimane, escludendo le cene con ospiti e usando solo pesi reali.
              </p>
            </div>
            {onNavigateRoom && (
              <button
                type="button"
                onClick={() => onNavigateRoom('room-5-dispensa')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-[#F3F1EC] text-[#141A17] border border-[#E5E2DA] hover:bg-[#E7E4DC] cursor-pointer shrink-0"
              >
                Scontrini →
              </button>
            )}
          </div>

          {auditLoading ? (
            <div className="text-xs text-[#575E58] py-3">Controllo i gruppi alimentari negli scontrini...</div>
          ) : receiptAudit ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] text-[#141A17] font-semibold">
                  Scontrini di casa: <strong>{receiptAudit.auditedPersonalReceiptsCount}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] text-[#141A17] font-semibold">
                  Cene con ospiti escluse: <strong>{receiptAudit.excludedGuestReceiptsCount}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-[#1B5E3A] font-semibold border border-emerald-200">
                  ✓ Solo pesi reali
                </span>
              </div>

              {receiptAudit.warnings?.map((w) => (
                <div key={w.groupId} className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
                  <strong>{w.label}:</strong> {w.message}
                </div>
              ))}

              <div className="space-y-1.5">
                {(receiptAudit.groupEvaluations || []).slice(0, 5).map((g) => (
                  <div
                    key={g.groupId}
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] text-[11px]"
                  >
                    <span className="font-semibold text-[#141A17] truncate">{g.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold shrink-0 ${
                        g.status === 'covered' || g.status === 'ok'
                          ? 'bg-emerald-50 text-[#1B5E3A] border border-emerald-200'
                          : 'bg-amber-50 text-amber-900 border border-amber-200'
                      }`}
                    >
                      {g.status === 'covered' || g.status === 'ok' ? 'Coperto ✓' : 'Da integrare'}
                    </span>
                  </div>
                ))}
              </div>

              {receiptAudit.suggestedRapalloAction && (
                <div className="p-3 rounded-xl bg-[#F3F1EC] border border-[#E5E2DA] space-y-1">
                  <div className="text-[11px] font-extrabold text-[#141A17]">
                    Consiglio spesa a Rapallo: {receiptAudit.suggestedRapalloAction.advice}
                  </div>
                  {receiptAudit.suggestedRapalloAction.matchedRapalloOffer && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-[#575E58] pt-1">
                      <span>
                        Offerta attiva: <strong className="text-[#141A17]">{receiptAudit.suggestedRapalloAction.matchedRapalloOffer.title}</strong> (
                        {receiptAudit.suggestedRapalloAction.matchedRapalloOffer.storeName} · €
                        {Number(receiptAudit.suggestedRapalloAction.matchedRapalloOffer.promoPrice).toFixed(2)})
                      </span>
                      {onNavigateRoom && (
                        <button
                          type="button"
                          onClick={() => onNavigateRoom('room-1-negozi')}
                          className="px-2.5 py-1 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white font-bold cursor-pointer shrink-0"
                        >
                          Vedi offerta
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export default NutritionCoachPanel;
