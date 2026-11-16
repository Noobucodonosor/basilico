import React, { useState, useEffect, useCallback } from 'react';

const REGIA_STEPS = [
  { step: 1, icon: '📈', short: '1. Inflazione & TCO', title: 'Cruscotto Economia, ISTAT Personale & Shrinkflation' },
  { step: 2, icon: '🥫', short: '2. Swipe Dispensa 5s', title: 'Controllo Rapido Freschi & Valore a Rischio (VaR_48h)' },
  { step: 3, icon: '⛵', short: '3. Batch & Piano Barca', title: 'Strategia Pasti, Economie di Scala & Giorni Barca' },
  { step: 4, icon: '🚗', short: '4. Giro Spesa €/h', title: 'Simulatore Tappe Rapallo sul Rendimento Orario Netto' }
];

function fmtEur(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'n/d';
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}

export function WeeklyRegiaView({
  activeProfileId = 'dany',
  onNavigateRoom,
  onOpenMaestro,
  onAddToShoppingList
}) {
  const [activeStep, setActiveStep] = useState(1);
  const [inflationData, setInflationData] = useState(null);
  const [tcoData, setTcoData] = useState(null);
  const [receiptAudit, setReceiptAudit] = useState(null);
  const [pantryData, setPantryData] = useState(null);
  const [storeYieldData, setStoreYieldData] = useState(null);
  const [transportMode, setTransportMode] = useState('car');
  const [batchComparison, setBatchComparison] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState('');

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(''), 2800);
  }, []);

  const loadAllRegiaData = useCallback(
    async (tm = transportMode) => {
      setLoading(true);
      try {
        const [infRes, tcoRes, audRes, panRes, yldRes, singleMealRes, batchMealRes] =
          await Promise.all([
            fetch('/api/maestro/economics/inflation'),
            fetch('/api/maestro/economics/tco?usesPerWeek=3'),
            fetch(
              `/api/nutrition-coach/receipt-audit?profileId=${encodeURIComponent(activeProfileId)}`
            ),
            fetch('/api/pantry'),
            fetch(
              `/api/maestro/economics/store-yield?transportMode=${encodeURIComponent(tm)}`
            ),
            fetch('/api/maestro/economics/meal-cost', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ingredientsEdibleCostEur: 3.4,
                activePrepMinutes: 16,
                passiveCookMinutes: 35,
                cleaningResetMinutes: 4,
                cookingMethod: 'oven_bake',
                batchServings: 1,
                rhythmPreset: 'weekend_relax'
              })
            }),
            fetch('/api/maestro/economics/meal-cost', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ingredientsEdibleCostEur: 3.4,
                activePrepMinutes: 16,
                passiveCookMinutes: 35,
                cleaningResetMinutes: 4,
                cookingMethod: 'oven_bake',
                batchServings: 4,
                rhythmPreset: 'weekend_relax'
              })
            })
          ]);

        if (infRes.ok) setInflationData(await infRes.json());
        if (tcoRes.ok) setTcoData(await tcoRes.json());
        if (audRes.ok) setReceiptAudit(await audRes.json());
        if (panRes.ok) setPantryData(await panRes.json());
        if (yldRes.ok) setStoreYieldData(await yldRes.json());
        if (singleMealRes.ok && batchMealRes.ok) {
          setBatchComparison({
            single: await singleMealRes.json(),
            batch4: await batchMealRes.json()
          });
        }
      } catch (_) {
      } finally {
        setLoading(false);
      }
    },
    [activeProfileId, transportMode]
  );

  useEffect(() => {
    loadAllRegiaData(transportMode);
  }, [activeProfileId, transportMode, loadAllRegiaData]);

  const handleQuickSwipe = async (itemId, fraction, reason = 'consumed') => {
    try {
      const res = await fetch(`/api/maestro/pantry-swipe/${encodeURIComponent(itemId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraction, reason })
      });
      if (res.ok) {
        notify('Dispensa e VaR_48h aggiornati!');
        const panRes = await fetch('/api/pantry');
        if (panRes.ok) setPantryData(await panRes.json());
      }
    } catch (_) {}
  };

  const var48h = pantryData?.valueAtRisk48h || { totalAtRiskEuro: 0, atRiskItems: [], staleUnverifiedItems: [] };

  return (
    <div className="space-y-5" data-testid="weekly-regia-view">
      {toast && (
        <div className="bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs">
          {toast}
        </div>
      )}

      {/* Header + 4-Step Tunnel Stepper */}
      <section className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 border border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
              🧭 Regia Settimanale · 10 Minuti ad Alto ROI
            </span>
            <h1 className="text-lg sm:text-xl font-extrabold mt-1">
              Governa Casa, Cambusa Barca e Spesa a Rapallo
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Un tunnel ordinato in 4 passi: prima chiudi i conti veri e salvi il frigo, poi ottimizzi pasti e tappe spesa.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenMaestro?.(
                'Facciamo il check-up settimanale di economia domestica, scorte in scadenza e giro spesa a Rapallo.'
              )
            }
            className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white cursor-pointer shrink-0"
          >
            💬 Regia col Maestro
          </button>
        </div>

        <nav className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="4 Passi Regia Settimanale">
          {REGIA_STEPS.map((s) => {
            const active = activeStep === s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveStep(s.step)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs'
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:bg-slate-800'
                }`}
              >
                <div className="text-xs font-extrabold">
                  <span aria-hidden="true">{s.icon}</span> {s.short}
                </div>
                <div className={`text-[10px] mt-0.5 line-clamp-1 ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                  {s.title}
                </div>
              </button>
            );
          })}
        </nav>
      </section>

      {/* STEP 1: Personal Laspeyres Inflation, Shrinkflation, Sentinel Receipt Audit & TCO */}
      {activeStep === 1 && (
        <section className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-emerald-800">
                📊 Il Tuo Indice ISTAT a Rapallo (Laspeyres)
              </div>
              <div className="text-2xl font-extrabold text-slate-900">
                {inflationData?.laspeyresIndex != null
                  ? `${inflationData.laspeyresIndex} (${inflationData.personalInflationPct >= 0 ? '+' : ''}${inflationData.personalInflationPct}%)`
                  : 'In attesa di serie storica'}
              </div>
              <p className="text-xs text-slate-600">
                {inflationData?.summary ||
                  'Calcolato esclusivamente su referenze reali osservate almeno 2 volte negli scontrini (ADR-0006: zero indici sintetici).'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateRoom?.('room-5-dispensa')}
                className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                🧾 Carica Nuovo Scontrino al Centesimo →
              </button>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-amber-800">
                🔍 Shrinkflation Watchdog
              </div>
              {inflationData?.shrinkflationAlerts?.length > 0 ? (
                <div className="space-y-2">
                  {inflationData.shrinkflationAlerts.map((al) => (
                    <div key={al.productKey} className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs">
                      <div className="font-bold text-amber-950">{al.title}</div>
                      <div className="text-[11px] text-amber-900">{al.explanation}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-600">
                  Nessuna riduzione occulta di formato rilevata sugli scontrini caricati finora. Il cane da guardia confronta peso confezione e prezzo €/kg a ogni nuovo scontrino.
                </p>
              )}
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-2">
              <div className="text-xs font-extrabold uppercase tracking-wider text-sky-800">
                🥗 Audit Gruppi Sentinella LARN (Scontrini)
              </div>
              <p className="text-xs text-slate-600">
                {receiptAudit?.summary ||
                  'Controllo passivo a zero data-entry su pesce azzurro EPA/DHA, Calcio Fascia Alta Zero-Formaggi, legumi e verdure dagli scontrini Casa.'}
              </p>
              <button
                type="button"
                onClick={() => onNavigateRoom?.('room-2-crea')}
                className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
              >
                Apri Classifica Nutrienti/€ CREA →
              </button>
            </div>
          </div>

          {/* CapEx vs OpEx Cookware TCO Highlights */}
          {tcoData?.toolsTco && (
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-slate-900">
                    🍳 Capitale Domestico: TCO a 10 Anni (Buy-It-For-Life vs Consumabili PTFE)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Quanto costa davvero ogni strumento per singolo utilizzo e quanto brucia un uso termico/chimico errato.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateRoom?.('room-4-cucina')}
                  className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
                >
                  Apri Officina Cucina (Stanza 4) →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tcoData.toolsTco.slice(0, 6).map((tool) => (
                  <div key={tool.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-slate-900 truncate">{tool.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          tool.capExClass === 'buy_it_for_life'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {tool.capExClass === 'buy_it_for_life' ? 'BIFL 25+ anni' : 'Consumabile PTFE'}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-700">
                      Uso corretto: <strong>€{tool.cpuProperRangeEur[0]}–{tool.cpuProperRangeEur[1]}/ciclo</strong> (10 anni:{' '}
                      {fmtEur(tool.tenYearTcoProperRangeEur[0])})
                    </div>
                    {tool.tenYearAbuseWasteMidpointEur > 30 && (
                      <div className="text-[11px] text-rose-700 font-semibold">
                        ⚠️ Abuso Boost/alcali spreca ~{fmtEur(tool.tenYearAbuseWasteMidpointEur)} in 10 anni
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 2: Swipe Check Dispensa 5s →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: 5-Second Pantry Swipe Check & VaR_48h */}
      {activeStep === 2 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                🥫 Swipe Check 5 Secondi — Frigo, Dispensa & Cambusa Barca
              </h2>
              <p className="text-xs text-slate-600">
                Valore a rischio entro 48h: <strong>{fmtEur(var48h.totalAtRiskEuro)}</strong>. Aggiorna con 1 tap prima di generare la spesa per non ricomprare doppioni.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-5-dispensa')}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Gestione completa Stanza 5 →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(pantryData?.items || []).slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-slate-600">
                    Zona: <code>{item.zone}</code> •{' '}
                    {item.remainingWeightGrams != null
                      ? `${item.remainingWeightGrams}${item.unit || 'g'}`
                      : `Quota ${Math.round((item.remainingFraction ?? 1) * 100)}%`}{' '}
                    {item.currentValueEuro != null ? `• ${fmtEur(item.currentValueEuro)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 1.0)}
                    className="px-2 py-1 rounded-lg border border-slate-300 bg-white text-[11px] font-bold text-slate-700 cursor-pointer"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 0.5)}
                    className="px-2 py-1 rounded-lg border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-900 cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 0, 'consumed')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 text-[11px] font-bold text-white cursor-pointer"
                  >
                    ✓ Finito
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
            >
              ← Passo 1
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 3: Batch Cooking & Piano Barca →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Batch Cooking Scale Economies & Terra/Barca Planner */}
      {activeStep === 3 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900">
              ⛵ Strategia Pasti, Batch Cooking & Amido Resistente RS3 per la Barca
            </h2>
            <p className="text-xs text-slate-600 mt-0.5">
              Cuocere basi intelligenti nel weekend abbatte i costi fissi di rampa forno (0,42 kWh), dimezza i lavaggi e prepara cereali/patate raffreddati ≥12h (+4°C) ricchi di amido resistente RS3 per la borsa termica!
            </p>
          </div>

          {batchComparison && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                <div className="text-xs font-bold text-slate-500">1 Cottura Singola in Forno (1 porzione)</div>
                <div className="text-lg font-extrabold text-slate-900">
                  Costo Pieno: {fmtEur(batchComparison.single.grossGeneralizedCostEur)} / porzione
                </div>
                <div className="text-xs text-slate-600">
                  Energia forno: {fmtEur(batchComparison.single.breakdown.energyCostEur)} • Tempo attivo+reset:{' '}
                  {batchComparison.single.minutesPerServing.totalHandsOnMinutes} min
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-300 space-y-1">
                <div className="text-xs font-extrabold text-emerald-800">
                  ⚡ Batch Cooking Weekend (4 porzioni su 1 sola rampa forno)
                </div>
                <div className="text-lg font-extrabold text-emerald-950">
                  Costo Pieno: {fmtEur(batchComparison.batch4.grossGeneralizedCostEur)} / porzione
                </div>
                <div className="text-xs text-emerald-900">
                  Risparmi <strong>{fmtEur(batchComparison.batch4.batchScaleEconomy.savedPerServingViaBatchEur)}</strong> a porzione ({batchComparison.batch4.minutesPerServing.totalHandsOnMinutes} min attivi/porz.)!
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-6-pianificatore')}
              className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
            >
              🗓️ Apri Pianificatore 21 Pasti Zero-Spreco (Stanza 6) →
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(4)}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 4: Simulatore Tappe Spesa €/h →
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Multi-Store Rapallo Net Hourly Yield (€/h) */}
      {activeStep === 4 && (
        <section className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-extrabold text-slate-900">
                🚗 Simulatore Giro Spesa a Rapallo sul Rendimento Orario Netto (€/h)
              </h2>
              <p className="text-xs text-slate-600">
                Una 2ª o 3ª tappa è approvata SOLO se il risparmio diviso per i minuti extra (parcheggio a Rapallo incluso!) supera il valore del tuo tempo.
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              {['car', 'scooter', 'foot'].map((tm) => (
                <button
                  key={tm}
                  type="button"
                  onClick={() => setTransportMode(tm)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border cursor-pointer ${
                    transportMode === tm
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {tm === 'car' ? '🚗 Auto' : tm === 'scooter' ? '🛵 Scooter' : '🚶 Piedi'}
                </button>
              ))}
            </div>
          </div>

          {storeYieldData?.optimalSummary && (
            <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 text-xs font-bold text-emerald-950">
              ✅ {storeYieldData.optimalSummary}
            </div>
          )}

          {Array.isArray(storeYieldData?.incrementalYields) && storeYieldData.incrementalYields.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {storeYieldData.incrementalYields.map((yld) => (
                <div
                  key={yld.stepLabel}
                  className={`p-3.5 rounded-xl border text-xs space-y-1 ${
                    yld.verdict === 'recommended'
                      ? 'bg-emerald-50/60 border-emerald-300'
                      : 'bg-slate-50 border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-extrabold text-slate-900">
                    <span>{yld.stepLabel}</span>
                    <span>Rende {fmtEur(yld.impliedHourlyYieldEur)}/h</span>
                  </div>
                  <p className="text-[11px] text-slate-700">{yld.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-700 cursor-pointer"
            >
              ← Passo 3
            </button>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-6-pianificatore')}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
            >
              🛒 Vai alla Lista per Corsia & Piano B Scaffale →
            </button>
          </div>
        </section>
      )}

      {loading && (
        <div className="text-center text-xs text-slate-400 py-1">
          Aggiornamento indicatori economici deterministici...
        </div>
      )}
    </div>
  );
}

export default WeeklyRegiaView;
