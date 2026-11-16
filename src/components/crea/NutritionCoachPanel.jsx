import React, { useState, useEffect, useCallback } from 'react';

const LAB_MEAL_SCENARIOS = [
  {
    id: 'zero_cheese_high_ca',
    label: '🥦 Calcio >30%: Cime di Rapa + Alici',
    subtitle: 'Ideale Zero Formaggi (basso ossalato + lisca)',
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
    label: '⚠️ Trappola Ossalati: Spinaci Lessi',
    subtitle: 'Alto calcio lordo CREA ma assorbito <10%',
    defaultMethod: 'boiled_drained',
    defaultAddedFatG: 8,
    defaultCooledHours: 0,
    ingredients: [{ creaId: '005700', name: 'Spinaci, crudi', grams: 220 }]
  },
  {
    id: 'iron_vitc_aa_synergy',
    label: '🍋 Ferro×3 & AA 100%: Pasta, Lenticchie & Limone',
    subtitle: 'Complementazione lisina+solforati + Vit. C a crudo',
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
    label: '🍅 Cis-Licopene: Pomodoro Cotto + EVO',
    subtitle: 'Isomerizzazione termica + micelle biliari',
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
    label: '⛵ Barca RS3: Riso Freddo & Sgombro (+4°C 14h)',
    subtitle: 'Amido retrogradato anti-abbiocco al timone',
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
  { id: 'steamed', label: '💨 Vapore (Max Ritenzione USDA)' },
  { id: 'boiled_drained', label: '💧 Bollito & Scolato (Lisciviazione)' },
  { id: 'stewed_liquid_kept', label: '🍲 Zuppa / Risottato (Liquido Trattenuto)' },
  { id: 'pan_seared_gentle', label: '🍳 Padella Dolce ≤160°C' },
  { id: 'pan_seared_high', label: '🔥 Rosolatura / Forno >175°C' },
  { id: 'raw', label: '🥗 Crudo / Assemblaggio a Freddo' }
];

const BADGE_TONE_CLASSES = {
  emerald: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  amber: 'bg-amber-50 text-amber-900 border-amber-200',
  rose: 'bg-rose-50 text-rose-900 border-rose-200',
  sky: 'bg-sky-50 text-sky-900 border-sky-200'
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
      {/* 1. LARN V Rev. Zero-Friction Presets + Optional Mifflin-St Jeor */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">🥗</span>
              <h3 className="text-base font-extrabold text-slate-900">
                Bussola Fisiologica LARN V Rev. & Guardia Calcio Zero-Formaggi
              </h3>
            </div>
            <p className="text-xs text-slate-600 mt-0.5">
              Preset zero-attrito su fabbisogni italiani ufficiali SINU 2024, con calibrazione antropometrica Mifflin-St Jeor opzionale.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {activeTargets?.zeroCheeseCalciumGuardActive && (
              <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                🛡️ Guardia Calcio Zero-Formaggi Attiva
              </span>
            )}
            <button
              type="button"
              onClick={() => setShowAdvancedLarn((v) => !v)}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer"
            >
              {showAdvancedLarn ? 'Nascondi Mifflin-St Jeor' : '⚙️ Calibrazione Avanzata'}
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
                    ? 'bg-emerald-50/80 border-emerald-500 ring-1 ring-emerald-500'
                    : 'bg-slate-50/60 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold text-slate-900">
                    {p.icon} {p.shortLabel}
                  </span>
                  <span className="text-[11px] font-bold text-emerald-800">
                    {p.dailyTargets?.kcal} kcal
                  </span>
                </div>
                <p className="text-[11px] text-slate-600 mt-1 line-clamp-2">{p.description}</p>
              </button>
            );
          })}
        </div>

        {showAdvancedLarn && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500">Sesso</label>
              <select
                value={advForm.sex}
                onChange={(e) => setAdvForm((f) => ({ ...f, sex: e.target.value }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value="M">Uomo (M)</option>
                <option value="F">Donna (F)</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500">Età (anni)</label>
              <input
                type="number"
                min={18}
                max={95}
                value={advForm.ageYears}
                onChange={(e) => setAdvForm((f) => ({ ...f, ageYears: Number(e.target.value) || 38 }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500">Peso (kg)</label>
              <input
                type="number"
                min={40}
                max={160}
                value={advForm.weightKg}
                onChange={(e) => setAdvForm((f) => ({ ...f, weightKg: Number(e.target.value) || 72 }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500">Altezza (cm)</label>
              <input
                type="number"
                min={140}
                max={215}
                value={advForm.heightCm}
                onChange={(e) => setAdvForm((f) => ({ ...f, heightCm: Number(e.target.value) || 178 }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500">LAF Attività</label>
              <select
                value={advForm.laf}
                onChange={(e) => setAdvForm((f) => ({ ...f, laf: Number(e.target.value) }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              >
                <option value={1.45}>1.45 Sedentario</option>
                <option value={1.6}>1.60 Attivo</option>
                <option value={1.75}>1.75 Sportivo</option>
                <option value={1.95}>1.95 Intenso</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-500">Delta kcal</label>
              <input
                type="number"
                min={-400}
                max={400}
                step={50}
                value={advForm.goalDeltaKcal}
                onChange={(e) => setAdvForm((f) => ({ ...f, goalDeltaKcal: Number(e.target.value) || 0 }))}
                className="w-full mt-0.5 text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
              />
            </div>
          </div>
        )}

        {targets && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 pt-1">
            {[
              { label: 'Energia', val: `${targets.kcal} kcal` },
              { label: 'Proteine', val: `${targets.proteinG} g` },
              { label: 'Fibre min', val: `${targets.fiberG} g` },
              { label: 'Calcio PRI', val: `${targets.calciumMg} mg` },
              { label: 'Ferro PRI', val: `${targets.ironMg} mg` },
              { label: 'Potassio', val: `${targets.potassiumMg} mg` },
              { label: 'EPA+DHA', val: `${targets.epaDhaMg} mg` },
              { label: 'Tetto Sodio', val: `<${targets.sodiumMaxMg} mg` }
            ].map((item) => (
              <div key={item.label} className="bg-slate-50 border border-slate-200/80 rounded-lg px-2.5 py-2">
                <div className="text-[10px] font-semibold text-slate-500">{item.label}</div>
                <div className="text-xs font-extrabold text-slate-900">{item.val}</div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 2. Cooked Meal Physiology & Bioavailability Lab */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-extrabold text-slate-900">
              🔬 Laboratorio Fisiologia del Pasto Cotto & Biodisponibilità (USDA + CREA 31+ Nutrienti)
            </h3>
            <p className="text-xs text-slate-600">
              Confronta dal vivo ritenzione termica (Vapore vs Bollitura con scolo), Calcio biodisponibile vs ossalati, Ferro + Vitamina C, cis-Licopene e Amido Resistente RS3.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowGuidePillars((v) => !v)}
            className="px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 hover:bg-indigo-100 cursor-pointer shrink-0"
          >
            {showGuidePillars ? 'Chiudi Fonti Scientifiche' : '📖 5 Pilastri & Fonti'}
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
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-400'
              }`}
            >
              <div className="text-xs font-extrabold">{sc.label}</div>
              <div className={`text-[10px] ${selectedScenarioId === sc.id ? 'text-slate-300' : 'text-slate-500'}`}>
                {sc.subtitle}
              </div>
            </button>
          ))}
        </div>

        {/* Interactive Physics Controls */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Tecnica Termica & Destino Acqua (USDA Rf)
            </label>
            <select
              value={cookingMethod}
              onChange={(e) => setCookingMethod(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white font-semibold"
            >
              {COOKING_METHODS_UI.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Olio EVO Vettore Micellare: <strong>{addedFatGrams} g</strong>
            </label>
            <input
              type="range"
              min={0}
              max={20}
              step={2}
              value={addedFatGrams}
              onChange={(e) => setAddedFatGrams(Number(e.target.value))}
              className="w-full accent-emerald-600 mt-1.5"
            />
            <div className="flex justify-between text-[10px] text-slate-500">
              <span>0g (Scondito)</span>
              <span>≥5g Sblocco Carotenoidi</span>
              <span>20g</span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1">
              Riposo Frigo +4°C (RS3 Barca): <strong>{cooledHours} h</strong>
            </label>
            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setCooledHours(0)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  cooledHours < 12
                    ? 'bg-amber-100 border-amber-400 text-amber-900'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                🔥 Appena Cotto (0h)
              </button>
              <button
                type="button"
                onClick={() => setCooledHours(14)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                  cooledHours >= 12
                    ? 'bg-emerald-100 border-emerald-500 text-emerald-900'
                    : 'bg-white border-slate-300 text-slate-700'
                }`}
              >
                ⛵ Cambusa +4°C (14h RS3)
              </button>
            </div>
          </div>
        </div>

        {/* Live Evaluation Output */}
        {evalLoading ? (
          <div className="text-xs text-slate-500 py-4">Calcolo fisiologia del pasto cotto su 31+ nutrienti CREA...</div>
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

              {/* Key Cooked Physiological Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Peso Cotto</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.weights?.cookedWeightGrams} g
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Densità Cotta</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.satietyAndVolumetrics?.cookedEnergyDensityKcalPer100g} kcal/100g
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Proteine / AA</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.nutrients?.proteinG} g{' '}
                    {mealEval.bioavailability?.aminoAcids?.chemicalScorePct != null &&
                      `(${mealEval.bioavailability.aminoAcids.chemicalScorePct}% FAO)`}
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Vit. C Residua</div>
                  <div className="text-xs font-extrabold text-emerald-800">
                    {mealEval.nutrients?.vitaminCMg ?? 'n.d.'} mg
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Calcio Fascia &gt;30%</div>
                  <div className="text-xs font-extrabold text-emerald-800">
                    {mealEval.bioavailability?.calcium?.highBioavailCalciumMg} / {mealEval.nutrients?.calciumMg ?? 0} mg
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Ferro (Eme/Tot)</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.bioavailability?.iron?.hemeIronMg} / {mealEval.nutrients?.ironMg ?? 0} mg
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">Potassio Cotto</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.nutrients?.potassiumMg ?? 'n.d.'} mg
                  </div>
                </div>
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5">
                  <div className="text-[10px] text-slate-500 font-bold">EPA+DHA / Fibre</div>
                  <div className="text-xs font-extrabold text-slate-900">
                    {mealEval.nutrients?.epaDhaG ?? 0} g · {mealEval.nutrients?.fiberG ?? 0} g
                  </div>
                </div>
              </div>
            </div>
          )
        )}

        {showGuidePillars && bioGuide?.pillars && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200">
            {bioGuide.pillars.map((p) => (
              <div key={p.id} className="p-3 rounded-xl bg-indigo-50/50 border border-indigo-100 text-xs">
                <div className="font-extrabold text-indigo-950">{p.title}</div>
                <p className="text-[11px] text-slate-700 mt-1">{p.rule}</p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* 3. 1-Tap Non-Punitive Adaptive Coaching & 4. Passive Receipt Audit */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Adaptive Coaching Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                🧭 Coaching Adattivo 1-Tap (Zero Ortoressia)
              </h3>
              <p className="text-xs text-slate-600">
                Riequilibrio fisiologico su finestra mobile 3–7 giorni + salvataggio freschi aperti (T_open).
              </p>
            </div>
            {onOpenMaestro && (
              <button
                type="button"
                onClick={() => onOpenMaestro('Aiutami ad adattare la cena di stasera senza sprecare i freschi in frigo')}
                className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-900 text-white hover:bg-slate-800 cursor-pointer shrink-0"
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
              className="flex-1 text-xs border border-slate-300 rounded-xl px-3 py-2"
            />
            <button
              type="button"
              disabled={adaptLoading}
              onClick={() => triggerAdaptiveCoach('eat_out')}
              className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-amber-600 text-white hover:bg-amber-700 cursor-pointer shrink-0"
            >
              🍽️ Ho mangiato fuori
            </button>
          </div>

          <button
            type="button"
            disabled={adaptLoading}
            onClick={() => triggerAdaptiveCoach('emergency_5min')}
            className="w-full py-2.5 px-4 rounded-xl text-xs font-extrabold bg-emerald-700 text-white hover:bg-emerald-800 cursor-pointer"
          >
            ⚡ Sono stanco / Piatto Salvagente 5 min (Zero Pentole dalla Dispensa)
          </button>

          {adaptResult && (
            <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-2.5 text-xs">
              <div className="font-bold text-slate-900">{adaptResult.coachingMessage}</div>

              {adaptResult.eventType === 'eat_out' && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-emerald-800">
                    ✓ Pavimento calorico sano garantito ({adaptResult.gentleAdjustedDailyTargetKcal} kcal/die su 4 gg, zero tagli punitivi)
                  </div>
                  {adaptResult.rebalanceActions?.map((act) => (
                    <div key={act.code} className="p-2 rounded-lg bg-white border border-slate-200 text-[11px]">
                      <span className="font-extrabold text-slate-800">{act.horizon}:</span> {act.recommendation}
                    </div>
                  ))}
                </div>
              )}

              {adaptResult.eventType === 'emergency_5min' && adaptResult.rescueMeals?.length > 0 && (
                <div className="space-y-2">
                  {adaptResult.rescueMeals.slice(0, 2).map((rm) => (
                    <div key={rm.id} className="p-2.5 rounded-lg bg-white border border-emerald-200">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-slate-900">{rm.title}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 shrink-0">
                          {rm.prepMinutes} min · 0 pentole
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 mt-1">{rm.stepsSummary}</p>
                      <div className="text-[10px] font-bold text-slate-700 mt-1">
                        {rm.physiology?.nutrients?.kcal} kcal · {rm.physiology?.nutrients?.proteinG}g prot ·{' '}
                        {rm.physiology?.nutrients?.epaDhaG ?? 0}g EPA+DHA · {rm.physiology?.nutrients?.vitaminCMg ?? 0}mg Vit.C
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Passive Receipt LARN Sentinel Audit Card */}
        <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                🧾 Audit Passivo Scontrini LARN (21 Giorni)
              </h3>
              <p className="text-xs text-slate-600">
                Analisi gruppi sentinella senza diario manuale: scorte lunghe ammortizzate, zero pesi sintetici (ADR-0006).
              </p>
            </div>
            {onNavigateRoom && (
              <button
                type="button"
                onClick={() => onNavigateRoom('room-5-dispensa')}
                className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold bg-slate-100 text-slate-700 hover:bg-slate-200 cursor-pointer shrink-0"
              >
                Scontrini →
              </button>
            )}
          </div>

          {auditLoading ? (
            <div className="text-xs text-slate-500 py-3">Verifica copertura sentinella LARN...</div>
          ) : receiptAudit ? (
            <div className="space-y-2.5 text-xs">
              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                  Scontrini Casa: <strong>{receiptAudit.auditedPersonalReceiptsCount}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-semibold">
                  Ospiti esclusi: <strong>{receiptAudit.excludedGuestReceiptsCount}</strong>
                </span>
                <span className="px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 font-semibold border border-emerald-200">
                  ✓ Zero fallback 250g finti
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
                    className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px]"
                  >
                    <span className="font-semibold text-slate-800 truncate">{g.label}</span>
                    <span
                      className={`px-2 py-0.5 rounded-full font-bold shrink-0 ${
                        g.status === 'covered' || g.status === 'ok'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-900'
                      }`}
                    >
                      {g.status === 'covered' || g.status === 'ok' ? 'Coperto ✓' : 'Da integrare'}
                    </span>
                  </div>
                ))}
              </div>

              {receiptAudit.suggestedRapalloAction && (
                <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-1">
                  <div className="text-[11px] font-extrabold text-indigo-950">
                    💡 Micro-Correzione Spesa a Rapallo: {receiptAudit.suggestedRapalloAction.advice}
                  </div>
                  {receiptAudit.suggestedRapalloAction.matchedRapalloOffer && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-indigo-900 pt-1">
                      <span>
                        Offerta attiva: <strong>{receiptAudit.suggestedRapalloAction.matchedRapalloOffer.title}</strong> (
                        {receiptAudit.suggestedRapalloAction.matchedRapalloOffer.storeName} · €
                        {Number(receiptAudit.suggestedRapalloAction.matchedRapalloOffer.promoPrice).toFixed(2)})
                      </span>
                      {onNavigateRoom && (
                        <button
                          type="button"
                          onClick={() => onNavigateRoom('room-1-negozi')}
                          className="px-2 py-1 rounded-lg bg-indigo-700 text-white font-bold cursor-pointer shrink-0"
                        >
                          Vedi Offerta
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
