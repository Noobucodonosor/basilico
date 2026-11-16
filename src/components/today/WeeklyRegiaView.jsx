import React, { useState, useEffect, useCallback } from 'react';

const REGIA_STEPS = [
  { step: 1, icon: '📈', short: '1. Prezzi & Strumenti', title: 'Come cambiano i prezzi della tua spesa' },
  { step: 2, icon: '🥫', short: '2. Controllo Frigo', title: 'Controlla in un tocco cosa resta in frigo' },
  { step: 3, icon: '⛵', short: '3. Basi & Barca', title: 'Cucina una volta sola per più pasti' },
  { step: 4, icon: '🚗', short: '4. Giro Spesa', title: 'Quante tappe conviene fare a Rapallo?' }
];

function fmtEur(val) {
  const n = Number(val);
  if (!Number.isFinite(n)) return 'n/d';
  return `€ ${n.toFixed(2).replace('.', ',')}`;
}

function formatPantryZone(zone) {
  if (zone === 'fridge_freezer') return 'Frigo e freezer';
  if (zone === 'dry_pantry') return 'Dispensa secca';
  if (zone === 'boat_galley') return 'Cambusa barca';
  return zone || 'Casa';
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
        notify('Dispensa e scorte fresche aggiornate!');
        const panRes = await fetch('/api/pantry');
        if (panRes.ok) setPantryData(await panRes.json());
      }
    } catch (_) {}
  };

  const var48h = pantryData?.valueAtRisk48h || { totalAtRiskEuro: 0, atRiskItems: [], staleUnverifiedItems: [] };

  return (
    <div className="space-y-5" data-testid="weekly-regia-view">
      {toast && (
        <div className="bg-[#1B5E3A] text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs">
          {toast}
        </div>
      )}

      {/* Header + 4-Step Weekend Tunnel */}
      <section className="bg-white text-[#141A17] rounded-2xl p-5 sm:p-6 border border-[#E5E2DA] shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#F3F1EC] text-[#575E58] border border-[#E5E2DA]">
              Piano settimanale · 10 minuti nel weekend
            </span>
            <h1 className="text-lg sm:text-2xl font-extrabold text-[#141A17] mt-2 tracking-tight">
              Organizza casa, cambusa e spesa a Rapallo
            </h1>
            <p className="text-xs sm:text-sm text-[#575E58] mt-1">
              Quattro passaggi rapidi: controlla prezzi e attrezzatura, verifica cosa resta in frigo, prepara le basi e scegli dove fare la spesa.
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onOpenMaestro?.(
                'Facciamo il punto settimanale su prezzi, scorte in frigo e giro spesa a Rapallo.'
              )
            }
            className="px-4 py-2.5 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-xs font-extrabold text-white cursor-pointer shrink-0 transition-colors"
          >
            💬 Chiedi al Maestro
          </button>
        </div>

        <nav className="grid grid-cols-2 lg:grid-cols-4 gap-2" aria-label="Percorso weekend in 4 passi">
          {REGIA_STEPS.map((s) => {
            const active = activeStep === s.step;
            return (
              <button
                key={s.step}
                type="button"
                onClick={() => setActiveStep(s.step)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  active
                    ? 'bg-[#1B5E3A] border-[#1B5E3A] text-white shadow-xs'
                    : 'bg-[#F3F1EC] border-[#E5E2DA] text-[#141A17] hover:bg-[#E7E4DC]'
                }`}
              >
                <div className="text-xs font-extrabold">
                  <span aria-hidden="true">{s.icon}</span> {s.short}
                </div>
                <div className={`text-[11px] mt-0.5 line-clamp-1 ${active ? 'text-emerald-100' : 'text-[#575E58]'}`}>
                  {s.title}
                </div>
              </button>
            );
          })}
        </nav>
      </section>

      {/* STEP 1: Price Changes, Format Shrinks, Receipt Nutrition Balance & Cookware Cost */}
      {activeStep === 1 && (
        <section className="space-y-4">
          <div className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#141A17]">
                Come cambiano i prezzi della tua spesa
              </h2>
              <p className="text-xs text-[#575E58] mt-0.5">
                Confronto basato solo sui prodotti comprati più volte nei tuoi scontrini reali, senza stime inventate.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-[#FAF9F6] rounded-xl border border-[#E5E2DA] p-4 space-y-2">
                <div className="text-xs font-extrabold text-[#1B5E3A]">
                  Andamento reale dei tuoi scontrini
                </div>
                <div className="text-2xl font-extrabold text-[#141A17]">
                  {inflationData?.laspeyresIndex != null
                    ? `${inflationData.laspeyresIndex} (${inflationData.personalInflationPct >= 0 ? '+' : ''}${inflationData.personalInflationPct}%)`
                    : 'Servono almeno due spese'}
                </div>
                <p className="text-xs text-[#575E58]">
                  {inflationData?.summary ||
                    'Carica gli scontrini della spesa per confrontare nel tempo gli stessi prodotti.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateRoom?.('room-5-dispensa')}
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#141A17] hover:bg-[#2A332E] text-white text-xs font-bold cursor-pointer"
                >
                  🧾 Carica nuovo scontrino →
                </button>
              </div>

              <div className="bg-[#FAF9F6] rounded-xl border border-[#E5E2DA] p-4 space-y-2">
                <div className="text-xs font-extrabold text-[#141A17]">
                  Controllo peso delle confezioni
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
                  <p className="text-xs text-[#575E58]">
                    Nessuna riduzione nascosta di peso rilevata finora. Controlla grammatura e prezzo al chilo a ogni nuovo scontrino.
                  </p>
                )}
              </div>

              <div className="bg-[#FAF9F6] rounded-xl border border-[#E5E2DA] p-4 space-y-2">
                <div className="text-xs font-extrabold text-[#141A17]">
                  Equilibrio nutrizionale della spesa
                </div>
                <p className="text-xs text-[#575E58]">
                  {receiptAudit?.summary ||
                    'Verifica automatica su pesce azzurro, fonti di calcio senza formaggi, legumi e verdure dai tuoi scontrini.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigateRoom?.('room-2-crea')}
                  className="text-xs font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                >
                  Apri classifica nutrienti per euro →
                </button>
              </div>
            </div>
          </div>

          {/* Cookware 10-year Cost */}
          {tcoData?.toolsTco && (
            <div className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-extrabold text-[#141A17]">
                    Quanto ti costano le pentole negli anni
                  </h3>
                  <p className="text-xs text-[#575E58]">
                    Costo per singolo utilizzo su 10 anni e quanto si butta rovinando il rivestimento sul fuoco.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateRoom?.('room-4-cucina')}
                  className="text-xs font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                >
                  Apri Officina Cucina →
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {tcoData.toolsTco.slice(0, 6).map((tool) => (
                  <div key={tool.id} className="p-3 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] space-y-1 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-extrabold text-[#141A17] truncate">{tool.name}</span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${
                          tool.capExClass === 'buy_it_for_life'
                            ? 'bg-emerald-50 text-[#1B5E3A] border border-emerald-200'
                            : 'bg-amber-50 text-amber-900 border border-amber-200'
                        }`}
                      >
                        {tool.capExClass === 'buy_it_for_life' ? 'Dura tutta la vita' : 'Rivestimento delicato'}
                      </span>
                    </div>
                    <div className="text-[11px] text-[#575E58]">
                      Uso corretto: <strong className="text-[#141A17]">€{tool.cpuProperRangeEur[0]}–{tool.cpuProperRangeEur[1]} a utilizzo</strong> (in 10 anni:{' '}
                      {fmtEur(tool.tenYearTcoProperRangeEur[0])})
                    </div>
                    {tool.tenYearAbuseWasteMidpointEur > 30 && (
                      <div className="text-[11px] text-rose-800 font-semibold">
                        ⚠️ Calore eccessivo o lavaggi sbagliati sprecano ~{fmtEur(tool.tenYearAbuseWasteMidpointEur)} in 10 anni
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
              className="px-4 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 2: Controllo Frigo →
            </button>
          </div>
        </section>
      )}

      {/* STEP 2: 1-Tap Pantry & Fridge Check */}
      {activeStep === 2 && (
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#141A17]">
                Controlla in un tocco cosa resta in frigo
              </h2>
              <p className="text-xs text-[#575E58] mt-0.5">
                Valore dei freschi da usare entro due giorni: <strong className="text-[#141A17]">{fmtEur(var48h.totalAtRiskEuro)}</strong>. Aggiorna prima di fare la lista per evitare doppioni.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-5-dispensa')}
              className="text-xs font-bold text-[#1B5E3A] hover:underline cursor-pointer"
            >
              Apri tutta la dispensa →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {(pantryData?.items || []).slice(0, 8).map((item) => (
              <div
                key={item.id}
                className="p-3 rounded-xl border border-[#E5E2DA] bg-[#FAF9F6] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#141A17] truncate">{item.title}</div>
                  <div className="text-[11px] text-[#575E58]">
                    {formatPantryZone(item.zone)} •{' '}
                    {item.remainingWeightGrams != null
                      ? `${item.remainingWeightGrams}${item.unit || 'g'}`
                      : `Rimasto ${Math.round((item.remainingFraction ?? 1) * 100)}%`}{' '}
                    {item.currentValueEuro != null ? `• ${fmtEur(item.currentValueEuro)}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 1.0)}
                    className="px-2.5 py-1 rounded-lg border border-[#E5E2DA] bg-white hover:bg-[#F3F1EC] text-[11px] font-bold text-[#141A17] cursor-pointer"
                  >
                    Intero
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 0.5)}
                    className="px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 text-[11px] font-bold text-amber-950 cursor-pointer"
                  >
                    Metà
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickSwipe(item.id, 0, 'consumed')}
                    className="px-2.5 py-1 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-[11px] font-bold text-white cursor-pointer"
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
              className="px-3 py-1.5 rounded-xl border border-[#E5E2DA] bg-[#F3F1EC] text-xs font-bold text-[#141A17] cursor-pointer"
            >
              ← Passo 1
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-4 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 3: Basi &amp; Barca →
            </button>
          </div>
        </section>
      )}

      {/* STEP 3: Cook Once for Multiple Meals + Boat Prep */}
      {activeStep === 3 && (
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[#141A17]">
              Cucina una volta sola per più pasti
            </h2>
            <p className="text-xs text-[#575E58] mt-0.5">
              Cuocere più porzioni insieme abbatte il costo di accensione del forno, dimezza i lavaggi e prepara cereali o patate raffreddati in frigo (+4°C) più leggeri per la borsa termica in barca.
            </p>
          </div>

          {batchComparison && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] space-y-1">
                <div className="text-xs font-bold text-[#575E58]">Una cottura singola in forno (1 porzione)</div>
                <div className="text-lg font-extrabold text-[#141A17]">
                  Costo reale: {fmtEur(batchComparison.single.grossGeneralizedCostEur)} / porzione
                </div>
                <div className="text-xs text-[#575E58]">
                  Energia forno: {fmtEur(batchComparison.single.breakdown.energyCostEur)} • Tempo e lavaggio:{' '}
                  {batchComparison.single.minutesPerServing.totalHandsOnMinutes} min
                </div>
              </div>

              <div className="p-4 rounded-xl bg-emerald-50/70 border border-[#1B5E3A]/30 space-y-1">
                <div className="text-xs font-extrabold text-[#1B5E3A]">
                  Preparazione multipla (4 porzioni con una sola infornata)
                </div>
                <div className="text-lg font-extrabold text-[#141A17]">
                  Costo reale: {fmtEur(batchComparison.batch4.grossGeneralizedCostEur)} / porzione
                </div>
                <div className="text-xs text-[#1B5E3A]">
                  Risparmi <strong>{fmtEur(batchComparison.batch4.batchScaleEconomy.savedPerServingViaBatchEur)}</strong> a porzione ({batchComparison.batch4.minutesPerServing.totalHandsOnMinutes} min di impegno per pasto).
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-6-pianificatore')}
              className="px-4 py-2 rounded-xl bg-[#141A17] hover:bg-[#2A332E] text-white text-xs font-extrabold cursor-pointer"
            >
              🗓️ Apri pianificatore settimanale →
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(4)}
              className="px-4 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              Passo 4: Giro Spesa →
            </button>
          </div>
        </section>
      )}

      {/* STEP 4: Rapallo Multi-Store Route */}
      {activeStep === 4 && (
        <section className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-extrabold text-[#141A17]">
                Quante tappe conviene fare a Rapallo?
              </h2>
              <p className="text-xs text-[#575E58] mt-0.5">
                Una seconda o terza fermata conviene solo se il risparmio supera il tempo perso tra traffico e parcheggio.
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
                      ? 'bg-[#141A17] text-white border-[#141A17]'
                      : 'bg-[#F3F1EC] text-[#141A17] border-[#E5E2DA] hover:bg-[#E7E4DC]'
                  }`}
                >
                  {tm === 'car' ? '🚗 Auto' : tm === 'scooter' ? '🛵 Scooter' : '🚶 A piedi'}
                </button>
              ))}
            </div>
          </div>

          {storeYieldData?.optimalSummary && (
            <div className="p-3.5 rounded-xl bg-emerald-50/70 border border-[#1B5E3A]/30 text-xs font-bold text-[#141A17]">
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
                      ? 'bg-emerald-50/60 border-[#1B5E3A]/30'
                      : 'bg-[#FAF9F6] border-[#E5E2DA]'
                  }`}
                >
                  <div className="flex items-center justify-between font-extrabold text-[#141A17]">
                    <span>{yld.stepLabel}</span>
                    <span>Vale {fmtEur(yld.impliedHourlyYieldEur)}/ora</span>
                  </div>
                  <p className="text-[11px] text-[#575E58]">{yld.explanation}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-3 py-1.5 rounded-xl border border-[#E5E2DA] bg-[#F3F1EC] text-xs font-bold text-[#141A17] cursor-pointer"
            >
              ← Passo 3
            </button>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-6-pianificatore')}
              className="px-4 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-extrabold cursor-pointer"
            >
              🛒 Vai alla lista per corsia →
            </button>
          </div>
        </section>
      )}

      {loading && (
        <div className="text-center text-xs text-[#575E58] py-1">
          Aggiornamento dati di casa e offerte di Rapallo...
        </div>
      )}
    </div>
  );
}

export default WeeklyRegiaView;
