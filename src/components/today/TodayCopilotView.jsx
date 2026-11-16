import React, { useState, useEffect, useCallback } from 'react';

const RHYTHM_BUTTONS = [
  {
    id: 'sera_stanca',
    icon: '🌙',
    label: 'Sera Stanca',
    sub: '30 €/h · ≤15m'
  },
  {
    id: 'feriale',
    icon: '⚡',
    label: 'Feriale',
    sub: '18 €/h · ≤30m'
  },
  {
    id: 'weekend_relax',
    icon: '☀️',
    label: 'Weekend',
    sub: '8 €/h · Studio/Batch'
  }
];

function formatEuro(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 'n/d';
  return `€ ${num.toFixed(2).replace('.', ',')}`;
}

export function TodayCopilotView({
  activeProfileId = 'dany',
  rhythmPreset = 'feriale',
  onChangeRhythmPreset,
  onSwitchAppMode,
  onNavigateRoom,
  onOpenMaestro,
  onAddToShoppingList,
  onOpenAcademy
}) {
  const [localRhythm, setLocalRhythm] = useState(rhythmPreset || 'feriale');
  const [copilotData, setCopilotData] = useState(null);
  const [calibration, setCalibration] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showAdvancedCal, setShowAdvancedCal] = useState(false);

  // Advanced Calibration Form State
  const [advHourlyEur, setAdvHourlyEur] = useState('');
  const [advKwhEur, setAdvKwhEur] = useState('0.28');
  const [advSmcEur, setAdvSmcEur] = useState('1.15');
  const [advTransport, setAdvTransport] = useState('car');
  const [savingCal, setSavingCal] = useState(false);

  // Adaptive Coaching ("Ho mangiato fuori" / "Salvagente 5 min") Result Banner
  const [adaptBanner, setAdaptBanner] = useState(null);
  const [adapting, setAdapting] = useState(false);
  const [expandedChains, setExpandedChains] = useState(() => new Set(['min_friction', 'save_var_value']));
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    if (rhythmPreset && rhythmPreset !== localRhythm) {
      setLocalRhythm(rhythmPreset);
    }
  }, [rhythmPreset]);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  const fetchCopilot = useCallback(
    async (presetOverride) => {
      const targetPreset = presetOverride || localRhythm || 'feriale';
      setLoading(true);
      try {
        const [copRes, calRes] = await Promise.all([
          fetch(
            `/api/maestro/today-copilot?profileId=${encodeURIComponent(activeProfileId)}&rhythmPreset=${encodeURIComponent(targetPreset)}`
          ),
          fetch(`/api/maestro/calibration?rhythmPreset=${encodeURIComponent(targetPreset)}`)
        ]);

        if (copRes.ok) {
          const data = await copRes.json();
          setCopilotData(data);
        }
        if (calRes.ok) {
          const cal = await calRes.json();
          setCalibration(cal);
          setAdvHourlyEur(
            cal.advancedOverrides?.hourlyValueEuro != null
              ? String(cal.advancedOverrides.hourlyValueEuro)
              : ''
          );
          setAdvKwhEur(
            String(cal.effectiveParameters?.electricityEurPerKwh ?? 0.28)
          );
          setAdvSmcEur(String(cal.effectiveParameters?.gasEurPerSmc ?? 1.15));
          setAdvTransport(cal.effectiveParameters?.transportMode || 'car');
        }
      } catch (_) {
        // Resilient offline graceful degradation
      } finally {
        setLoading(false);
      }
    },
    [activeProfileId, localRhythm]
  );

  useEffect(() => {
    fetchCopilot(localRhythm);
  }, [activeProfileId, localRhythm, fetchCopilot]);

  const handleSelectRhythm = async (nextPreset) => {
    setLocalRhythm(nextPreset);
    if (typeof onChangeRhythmPreset === 'function') {
      onChangeRhythmPreset(nextPreset);
    }
    try {
      await fetch('/api/maestro/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activeRhythmPreset: nextPreset })
      });
    } catch (_) {}
    fetchCopilot(nextPreset);
  };

  const handleSaveAdvancedCalibration = async (e) => {
    e.preventDefault();
    setSavingCal(true);
    try {
      const res = await fetch('/api/maestro/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          activeRhythmPreset: localRhythm,
          advancedOverrides: {
            hourlyValueEuro: advHourlyEur.trim() === '' ? null : Number(advHourlyEur),
            electricityEurPerKwh: Number(advKwhEur),
            gasEurPerSmc: Number(advSmcEur),
            transportMode: advTransport
          }
        })
      });
      if (res.ok) {
        showToast('⚙️ Parametri economici salvati e applicati al Co-pilota.');
        setShowAdvancedCal(false);
        fetchCopilot(localRhythm);
      }
    } catch (_) {
    } finally {
      setSavingCal(false);
    }
  };

  const handleResetAdvanced = async () => {
    setSavingCal(true);
    try {
      const res = await fetch('/api/maestro/calibration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetAdvancedOverrides: true })
      });
      if (res.ok) {
        setAdvHourlyEur('');
        showToast('Ripristinati i valori automatici del preset.');
        fetchCopilot(localRhythm);
      }
    } catch (_) {
    } finally {
      setSavingCal(false);
    }
  };

  const handleSwipePantry = async (itemId, fraction, reason = 'consumed') => {
    try {
      const res = await fetch(`/api/maestro/pantry-swipe/${encodeURIComponent(itemId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fraction, reason })
      });
      if (res.ok) {
        showToast(
          fraction === 0
            ? reason === 'discarded_waste'
              ? 'Registrato come spreco (aggiornato VaR_48h).'
              : 'Ottimo! Fresco salvato e consumato.'
            : `Scorta aggiornata al ${Math.round(fraction * 100)}%.`
        );
        fetchCopilot(localRhythm);
      }
    } catch (_) {}
  };

  const handleTriggerAdaptiveCoach = async (eventType) => {
    setAdapting(true);
    try {
      const res = await fetch('/api/nutrition-coach/adapt', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventType,
          profileId: activeProfileId,
          useCurrentPlan: true
        })
      });
      if (res.ok) {
        const result = await res.json();
        setAdaptBanner({
          eventType,
          data: result
        });
      }
    } catch (_) {
    } finally {
      setAdapting(false);
    }
  };

  const toggleChain = (slotId) => {
    setExpandedChains((prev) => {
      const next = new Set(prev);
      if (next.has(slotId)) next.delete(slotId);
      else next.add(slotId);
      return next;
    });
  };

  const var48h = copilotData?.valueAtRisk48h || { totalAtRiskEuro: 0, atRiskItems: [] };
  const paretoCards = copilotData?.tonightParetoCards || [];
  const flashOffers = copilotData?.rapalloFlashOpportunities || [];
  const effectiveWt =
    copilotData?.activeRhythm?.hourlyValueEuro ??
    calibration?.effectiveParameters?.hourlyValueEuro ??
    18;

  return (
    <div className="space-y-5" data-testid="today-copilot-view">
      {toastMsg && (
        <div className="bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-xl shadow-xs">
          {toastMsg}
        </div>
      )}

      {/* 1. Zero-Friction Rhythm Calibration Bar + Optional Advanced Accordion */}
      <section className="bg-slate-900 text-white rounded-2xl p-4 sm:p-5 shadow-xs border border-slate-800">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                ⚡ Co-pilota Oggi · 5 Anime
              </span>
              {copilotData?.activeProfile?.name && (
                <span className="text-[11px] font-semibold text-slate-300">
                  Profilo: <strong className="text-white">{copilotData.activeProfile.name}</strong>
                </span>
              )}
              <span className="text-[11px] text-amber-300 font-semibold">
                Valore tempo attivo: €{effectiveWt}/h
              </span>
            </div>
            <h1 className="text-lg sm:text-xl font-extrabold mt-1">
              Qual è la tua energia stasera?
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Un tap ricalibra istantaneamente fornelli, tempi di pulizia e convenienza delle tappe a Rapallo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Preset Ritmo Quotidiano">
            {RHYTHM_BUTTONS.map((btn) => {
              const active = localRhythm === btn.id;
              return (
                <button
                  key={btn.id}
                  type="button"
                  onClick={() => handleSelectRhythm(btn.id)}
                  className={`flex flex-col items-start px-3.5 py-2 rounded-xl border text-left transition-all cursor-pointer ${
                    active
                      ? 'bg-emerald-600 border-emerald-400 text-white shadow-xs ring-2 ring-emerald-400/40'
                      : 'bg-slate-800/90 border-slate-700 text-slate-200 hover:bg-slate-800 hover:border-slate-500'
                  }`}
                >
                  <span className="text-xs font-extrabold flex items-center gap-1.5">
                    <span aria-hidden="true">{btn.icon}</span>
                    <span>{btn.label}</span>
                  </span>
                  <span className={`text-[10px] ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                    {btn.sub}
                  </span>
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => setShowAdvancedCal((v) => !v)}
              className="px-3 py-2 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-800 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              ⚙️ Calibrazione Avanzata
            </button>
          </div>
        </div>

        {showAdvancedCal && (
          <form
            onSubmit={handleSaveAdvancedCalibration}
            className="mt-4 pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
          >
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Override Valore Tempo (€/h)
              </label>
              <input
                type="number"
                step="0.5"
                min="1"
                placeholder="Vuoto = usa preset"
                value={advHourlyEur}
                onChange={(e) => setAdvHourlyEur(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Luce (€/kWh ARERA/bolletta)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.05"
                value={advKwhEur}
                onChange={(e) => setAdvKwhEur(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Gas Metano (€/Smc)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.1"
                value={advSmcEur}
                onChange={(e) => setAdvSmcEur(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-300 mb-1">
                Spostamento Spesa Rapallo
              </label>
              <select
                value={advTransport}
                onChange={(e) => setAdvTransport(e.target.value)}
                className="w-full rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-white"
              >
                <option value="car">🚗 Auto (conta parcheggio)</option>
                <option value="scooter">🛵 Scooter / Moto</option>
                <option value="foot">🚶 A piedi</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingCal}
                className="flex-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-extrabold text-white cursor-pointer"
              >
                Salva
              </button>
              <button
                type="button"
                onClick={handleResetAdvanced}
                disabled={savingCal}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs text-slate-300 cursor-pointer"
              >
                Reset
              </button>
            </div>
          </form>
        )}
      </section>

      {/* 2. One-Handed Quick Action Shortcuts (Maestro, SOS Fornelli, SOS Macchia, Emergenze) */}
      <section className="grid grid-cols-2 sm:grid-cols-5 gap-2.5" aria-label="Scorciatoie operative rapide">
        <button
          type="button"
          onClick={() => onOpenMaestro?.('')}
          className="p-3 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-left shadow-xs transition-colors cursor-pointer col-span-2 sm:col-span-1"
        >
          <div className="text-xs font-extrabold">💬 Chiedi al Maestro</div>
          <div className="text-[11px] text-emerald-100 mt-0.5">Chat 5 Anime Grounded</div>
        </button>

        <button
          type="button"
          onClick={() => {
            if (onOpenAcademy) {
              onOpenAcademy('sos');
            } else if (onOpenMaestro) {
              onOpenMaestro('SOS Fornelli: la salsa si sta slegando o il pesce attacca, aiutami in 30 secondi!');
            } else {
              onNavigateRoom?.('room-3-ricette');
            }
          }}
          className="p-3 rounded-xl bg-white hover:bg-amber-50 border border-amber-200 text-left shadow-xs transition-colors cursor-pointer"
        >
          <div className="text-xs font-extrabold text-amber-900">🔥 SOS Fornelli 30s</div>
          <div className="text-[11px] text-slate-600 mt-0.5">Recupera piatto ora</div>
        </button>

        <button
          type="button"
          onClick={() => onNavigateRoom?.('room-7-chimica')}
          className="p-3 rounded-xl bg-white hover:bg-sky-50 border border-sky-200 text-left shadow-xs transition-colors cursor-pointer"
        >
          <div className="text-xs font-extrabold text-sky-900">🧼 SOS Macchia 3-Tap</div>
          <div className="text-[11px] text-slate-600 mt-0.5">Chimica Casa & Barca</div>
        </button>

        <button
          type="button"
          disabled={adapting}
          onClick={() => handleTriggerAdaptiveCoach('eat_out')}
          className="p-3 rounded-xl bg-white hover:bg-slate-100 border border-slate-200 text-left shadow-xs transition-colors cursor-pointer"
        >
          <div className="text-xs font-extrabold text-slate-900">🍽️ Ho mangiato fuori</div>
          <div className="text-[11px] text-slate-600 mt-0.5">Salva freschi 48h</div>
        </button>

        <button
          type="button"
          disabled={adapting}
          onClick={() => handleTriggerAdaptiveCoach('emergency_5min')}
          className="p-3 rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-left shadow-xs transition-colors cursor-pointer"
        >
          <div className="text-xs font-extrabold text-rose-900">🛟 Salvagente 5 min</div>
          <div className="text-[11px] text-slate-600 mt-0.5">Zero cottura da dispensa</div>
        </button>
      </section>

      {/* Adaptive Coaching Non-Punitive Feedback Card */}
      {adaptBanner && (
        <section className="bg-emerald-50 border border-emerald-300 rounded-2xl p-4 space-y-2.5 shadow-xs">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="text-[11px] font-extrabold uppercase tracking-wider bg-emerald-700 text-white px-2 py-0.5 rounded">
                {adaptBanner.eventType === 'emergency_5min'
                  ? '🛟 Piatti Salvagente ≤ 5 Minuti (Zero Sensi di Colpa)'
                  : '🍽️ Ricalibrazione Dolce Post-Ristorante'}
              </span>
              <p className="text-xs text-slate-800 font-medium mt-1.5">
                {adaptBanner.data?.coachMessage ||
                  adaptBanner.data?.summary ||
                  'Piano ricalibrato proteggendo i freschi aperti nelle prossime 48h senza tagli punitivi.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdaptBanner(null)}
              className="text-xs font-bold text-slate-500 hover:text-slate-800 cursor-pointer"
            >
              ✕ Chiudi
            </button>
          </div>
          {Array.isArray(adaptBanner.data?.rescueOptions) && adaptBanner.data.rescueOptions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 pt-1">
              {adaptBanner.data.rescueOptions.slice(0, 3).map((opt, idx) => (
                <div key={opt.id || idx} className="bg-white rounded-xl p-3 border border-emerald-200 text-xs">
                  <div className="font-extrabold text-slate-900">{opt.title || opt.name}</div>
                  <div className="text-[11px] text-slate-600 mt-1">
                    {opt.rationale || opt.description || 'Pronto in 5 min con scorte reali.'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 3. Value-at-Risk (VaR_48h) & 5-Second Pantry Swipe Alert */}
      {var48h.atRiskItemsCount > 0 && (
        <section className="bg-amber-50/90 border border-amber-300 rounded-2xl p-4 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-extrabold uppercase tracking-wider bg-amber-600 text-white px-2.5 py-0.5 rounded-full">
                  ⏰ Valore a Rischio 48h: {formatEuro(var48h.totalAtRiskEuro)}
                </span>
                <span className="text-xs font-semibold text-amber-900">
                  {var48h.atRiskItemsCount} {var48h.atRiskItemsCount === 1 ? 'fresco prioritario' : 'freschi prioritari'} in frigo/dispensa
                </span>
              </div>
              <p className="text-xs text-amber-900/90 mt-1">
                Swipe Check 5 secondi: aggiorna lo stato con 1 tap per azzerare lo spreco reale (senza pesare nulla).
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-5-dispensa')}
              className="text-xs font-bold text-amber-900 underline cursor-pointer self-start sm:self-center"
            >
              Apri Dispensa 3 Zone →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {var48h.atRiskItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-amber-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-slate-900 truncate">{item.title}</div>
                  <div className="text-[11px] text-slate-600">
                    {item.remainingWeightGrams != null
                      ? `${item.remainingWeightGrams}${item.unit || 'g'}`
                      : `Quota ${Math.round((item.remainingFraction ?? 1) * 100)}% (non pesato)`}{' '}
                    •{' '}
                    <strong className="text-amber-800">
                      {item.atRiskEuro != null ? formatEuro(item.atRiskEuro) : 'Prezzo non rilevato'}
                    </strong>{' '}
                    • {item.hoursRemaining != null ? `${item.hoursRemaining}h residue` : 'In scadenza'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 1.0)}
                    className="px-2 py-1 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-[11px] font-bold text-slate-700 cursor-pointer"
                  >
                    100%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 0.5)}
                    className="px-2 py-1 rounded-lg border border-amber-200 bg-amber-50 hover:bg-amber-100 text-[11px] font-bold text-amber-900 cursor-pointer"
                  >
                    50%
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 0, 'consumed')}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-[11px] font-bold text-white cursor-pointer"
                  >
                    ✓ Finito
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 4. Stasera in Cucina — 3 Non-Dominated Pareto Cards */}
      <section className="space-y-3" aria-label="Stasera in Cucina — Frontiera di Pareto">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
              🍳 Stasera in Cucina — Le 3 Scelte di Pareto (Zero Punteggi Magici)
            </h2>
            <p className="text-xs text-slate-600">
              Filtrate sui tuoi vincoli P0 (profilo, pentole possedute e sicurezza termica), mostrando i trade-off nudi sulle 5 Anime.
            </p>
          </div>
          {onSwitchAppMode && (
            <button
              type="button"
              onClick={() => onSwitchAppMode('regia')}
              className="text-xs font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
            >
              🧭 Apri Regia Settimanale & Spesa →
            </button>
          )}
        </div>

        {loading && paretoCards.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-2xl border border-slate-200 p-5 h-72 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {paretoCards.map((card) => {
              const isExpanded = expandedChains.has(card.slotId);
              return (
                <article
                  key={card.slotId}
                  className={`bg-white rounded-2xl border p-4 sm:p-5 shadow-xs flex flex-col justify-between transition-all ${
                    card.recommendedForRhythm
                      ? 'border-emerald-500 ring-2 ring-emerald-500/20'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[11px] font-extrabold px-2.5 py-1 rounded-full bg-slate-900 text-white">
                        {card.badge}
                      </span>
                      {card.recommendedForRhythm && (
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-800">
                          Ideale ora
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                        {card.title}
                      </h3>
                      <p className="text-xs text-slate-600 mt-1">{card.whyThisWins}</p>
                    </div>

                    {/* Bare Physical & Economic Vector */}
                    <div className="grid grid-cols-3 gap-2 bg-slate-50 rounded-xl p-2.5 border border-slate-100 text-center">
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Mani + Lavaggio</div>
                        <div className="text-xs font-extrabold text-slate-900">
                          {card.totalHandsOnMinutes} min
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Materia Edibile</div>
                        <div className="text-xs font-extrabold text-emerald-800">
                          {formatEuro(card.purePortionCostEur)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] font-semibold text-slate-500">Costo Pieno Netto</div>
                        <div className="text-xs font-extrabold text-slate-900">
                          {formatEuro(card.netGeneralizedCostEur)}
                        </div>
                      </div>
                    </div>

                    {/* Expandable 5-Souls Symbiotic Chain */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleChain(card.slotId)}
                        className="text-[11px] font-bold text-emerald-700 hover:text-emerald-900 flex items-center gap-1 cursor-pointer"
                      >
                        <span>{isExpanded ? '▾' : '▸'} Catena Simbiotica delle 5 Anime</span>
                      </button>

                      {isExpanded && card.fiveSoulsChain && (
                        <ul className="mt-2 space-y-1.5 text-[11px] text-slate-700 bg-emerald-50/40 rounded-xl p-3 border border-emerald-100">
                          <li>
                            <strong>💶 Economia:</strong> {card.fiveSoulsChain.economia}
                          </li>
                          <li>
                            <strong>🍳 Strumenti & P0:</strong> {card.fiveSoulsChain.strumenti}
                          </li>
                          <li>
                            <strong>👨‍🍳 Tecnica:</strong> {card.fiveSoulsChain.culinaria}
                          </li>
                          <li>
                            <strong>🥗 Fisiologia CREA:</strong> {card.fiveSoulsChain.nutrizione}
                          </li>
                          <li>
                            <strong>🧼 Kitchen Reset:</strong> {card.fiveSoulsChain.casa}
                          </li>
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onNavigateRoom?.('room-3-ricette')}
                      className="flex-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold cursor-pointer"
                    >
                      🔥 Vai ai Fornelli
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenMaestro?.(
                          `Guidami passo-passo per preparare "${card.title}" stasera con le mie pentole e dimmi il reset pulizia finale.`
                        )
                      }
                      className="px-3 py-2 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-bold text-slate-700 cursor-pointer"
                    >
                      💬 Maestro
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. Flash Verified Discounts in Rapallo + Multi-Store €/h Summary */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                🏷️ Flash Veri Sconti Storici a Rapallo (16035)
              </h3>
              <p className="text-xs text-slate-500">
                Solo offerte compatibili col profilo attivo e verificate contro lo storico prezzi reale.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-1-negozi')}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              Tutte le offerte →
            </button>
          </div>

          {flashOffers.length === 0 ? (
            <p className="text-xs text-slate-500">
              Nessuno sconto straordinario rilevato in questo istante. Apri Stanza 1 per esplorare i volantini.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {flashOffers.map((off) => (
                <div
                  key={off.id}
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex flex-col justify-between gap-2"
                >
                  <div>
                    <div className="text-[10px] font-bold text-emerald-800 uppercase">
                      {off.storeName}
                    </div>
                    <div className="text-xs font-bold text-slate-900 line-clamp-2 mt-0.5">
                      {off.title}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      <div className="text-sm font-extrabold text-slate-900">
                        {formatEuro(off.promoPrice)}
                      </div>
                      {off.ediblePricePerKg != null && (
                        <div className="text-[10px] text-slate-500">
                          {formatEuro(off.ediblePricePerKg)}/kg edib.
                        </div>
                      )}
                    </div>
                    {onAddToShoppingList && (
                      <button
                        type="button"
                        onClick={() =>
                          onAddToShoppingList({
                            name: off.title,
                            domain: 'food_human',
                            unitPriceEur: off.promoPrice,
                            preferredChain: off.storeName,
                            onPromo: true
                          })
                        }
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                      >
                        + Lista
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              🚗 Rendimento Orario Giro Spesa (€/h)
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              {copilotData?.storeRouteYieldSummary?.summary ||
                'Valutazione automatica 1 vs 2 vs 3 negozi a Rapallo inclusi tempi di parcheggio.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              onSwitchAppMode ? onSwitchAppMode('regia') : onNavigateRoom?.('room-6-pianificatore')
            }
            className="w-full px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-extrabold cursor-pointer"
          >
            Simula Tappe & Modalità In Corsia →
          </button>
        </div>
      </section>
    </div>
  );
}

export default TodayCopilotView;
