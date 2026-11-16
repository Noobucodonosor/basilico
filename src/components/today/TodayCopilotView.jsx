import React, { useState, useEffect, useCallback } from 'react';

const RHYTHM_BUTTONS = [
  {
    id: 'sera_stanca',
    label: 'Sera Stanca',
    sub: '≤15 min'
  },
  {
    id: 'feriale',
    label: 'Feriale',
    sub: '≤30 min'
  },
  {
    id: 'weekend_relax',
    label: 'Weekend',
    sub: 'Con calma'
  }
];

function formatEuro(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return 'n/d';
  return `€ ${num.toFixed(2).replace('.', ',')}`;
}

function formatPantryAmount(item) {
  if (item.remainingWeightGrams != null) {
    return `${item.remainingWeightGrams}${item.unit || 'g'}`;
  }
  const pct = Math.round((item.remainingFraction ?? 1) * 100);
  if (pct >= 95) return 'Confezione intera';
  if (pct >= 45 && pct <= 55) return 'Circa metà';
  return `Circa ${pct}%`;
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

  // Optional parameters form state
  const [advHourlyEur, setAdvHourlyEur] = useState('');
  const [advKwhEur, setAdvKwhEur] = useState('0.28');
  const [advSmcEur, setAdvSmcEur] = useState('1.15');
  const [advTransport, setAdvTransport] = useState('car');
  const [savingCal, setSavingCal] = useState(false);

  // Adaptive coaching ("Ho mangiato fuori" / "Ho solo 5 minuti") feedback banner
  const [adaptBanner, setAdaptBanner] = useState(null);
  const [adapting, setAdapting] = useState(false);
  const [expandedChains, setExpandedChains] = useState(() => new Set());
  const [toastMsg, setToastMsg] = useState('');

  useEffect(() => {
    if (rhythmPreset && rhythmPreset !== localRhythm) {
      setLocalRhythm(rhythmPreset);
    }
  }, [rhythmPreset, localRhythm]);

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
        showToast('Parametri salvati e applicati alle proposte di stasera.');
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
        showToast('Ripristinati i parametri automatici.');
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
              ? 'Registrato come scarto: elenco freschi aggiornato.'
              : 'Perfetto, alimento segnato come consumato.'
            : `Quantità aggiornata al ${Math.round(fraction * 100)}%.`
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
  const profileLabel = copilotData?.activeProfile?.name || 'Cucina di casa';

  return (
    <div className="space-y-6" data-testid="today-copilot-view">
      {toastMsg && (
        <div
          role="status"
          className="bg-[#1B5E3A] text-white text-xs font-semibold px-4 py-2.5 rounded-xl"
        >
          {toastMsg}
        </div>
      )}

      {/* 1. Calm Editorial Hero + Energy Selector + Quick Action Pills */}
      <section
        data-enter
        className="bg-white border border-[#E5E2DA] rounded-2xl p-5 sm:p-7"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-8 space-y-5">
            <div>
              <p className="text-xs font-medium text-[#575E58]">
                {profileLabel} · Rapallo
                {var48h.totalAtRiskEuro > 0
                  ? ` · ${formatEuro(var48h.totalAtRiskEuro)} di freschi da usare entro 48 ore`
                  : ''}
              </p>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#141A17] mt-1.5">
                Cosa cucinare stasera
              </h1>
              <p className="text-sm text-[#575E58] mt-1.5 max-w-2xl leading-relaxed">
                Tre piatti scelti su cosa hai in dispensa, sulle pentole di casa e sul tempo che hai adesso.
              </p>
            </div>

            {/* Energy / Rhythm Selector + Optional Parameters Link */}
            <div className="flex flex-wrap items-center gap-2.5" role="group" aria-label="Tempo disponibile stasera">
              {RHYTHM_BUTTONS.map((btn) => {
                const active = localRhythm === btn.id;
                return (
                  <button
                    key={btn.id}
                    type="button"
                    onClick={() => handleSelectRhythm(btn.id)}
                    aria-pressed={active}
                    className={`taste-btn inline-flex items-baseline gap-2 px-4 py-2.5 rounded-xl border text-left cursor-pointer min-h-[42px] ${
                      active
                        ? 'bg-[#1B5E3A] border-[#1B5E3A] text-white'
                        : 'bg-[#F3F1EC] border-[#E5E2DA] text-[#141A17] hover:bg-[#E7E4DC]'
                    }`}
                  >
                    <span className="text-xs font-semibold">{btn.label}</span>
                    <span className={`text-[11px] ${active ? 'text-emerald-100' : 'text-[#575E58]'}`}>
                      {btn.sub}
                    </span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setShowAdvancedCal((v) => !v)}
                aria-expanded={showAdvancedCal}
                className="text-xs font-medium text-[#575E58] hover:text-[#141A17] underline underline-offset-4 px-2 py-2 cursor-pointer"
              >
                Parametri
              </button>
            </div>

            {showAdvancedCal && (
              <form
                onSubmit={handleSaveAdvancedCalibration}
                className="pt-4 border-t border-[#E5E2DA] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-[#575E58] mb-1">
                    Valore del tuo tempo (€/ora)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="1"
                    placeholder="Automatico"
                    value={advHourlyEur}
                    onChange={(e) => setAdvHourlyEur(e.target.value)}
                    className="w-full rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] px-2.5 py-2 text-xs text-[#141A17] focus:outline-none focus:border-[#1B5E3A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#575E58] mb-1">
                    Luce (€/kWh)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.05"
                    value={advKwhEur}
                    onChange={(e) => setAdvKwhEur(e.target.value)}
                    className="w-full rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] px-2.5 py-2 text-xs text-[#141A17] focus:outline-none focus:border-[#1B5E3A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#575E58] mb-1">
                    Gas (€/Smc)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0.1"
                    value={advSmcEur}
                    onChange={(e) => setAdvSmcEur(e.target.value)}
                    className="w-full rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] px-2.5 py-2 text-xs text-[#141A17] focus:outline-none focus:border-[#1B5E3A]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[#575E58] mb-1">
                    Mezzo per la spesa
                  </label>
                  <select
                    value={advTransport}
                    onChange={(e) => setAdvTransport(e.target.value)}
                    className="w-full rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] px-2.5 py-2 text-xs text-[#141A17] focus:outline-none focus:border-[#1B5E3A]"
                  >
                    <option value="car">Auto (include parcheggio)</option>
                    <option value="scooter">Scooter o moto</option>
                    <option value="foot">A piedi</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={savingCal}
                    className="taste-btn flex-1 px-3 py-2 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-xs font-semibold text-white cursor-pointer"
                  >
                    Salva
                  </button>
                  <button
                    type="button"
                    onClick={handleResetAdvanced}
                    disabled={savingCal}
                    className="taste-btn px-2.5 py-2 rounded-lg bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-medium text-[#141A17] cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </form>
            )}

            {/* Integrated Calm Quick Action Pills */}
            <div
              className="flex flex-wrap items-center gap-2 pt-3 border-t border-[#E5E2DA]"
              aria-label="Azioni rapide"
            >
              <button
                type="button"
                disabled={adapting}
                onClick={() => handleTriggerAdaptiveCoach('eat_out')}
                className="taste-btn min-h-[40px] px-3.5 py-2 rounded-full bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer"
              >
                Ho mangiato fuori
              </button>

              <button
                type="button"
                disabled={adapting}
                onClick={() => handleTriggerAdaptiveCoach('emergency_5min')}
                className="taste-btn min-h-[40px] px-3.5 py-2 rounded-full bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer"
              >
                Ho solo 5 minuti
              </button>

              <button
                type="button"
                onClick={() => {
                  if (onOpenAcademy) {
                    onOpenAcademy('sos');
                  } else if (onOpenMaestro) {
                    onOpenMaestro('Aiuto rapido ai fornelli: la salsa si sta slegando o il pesce attacca, come rimedio subito?');
                  } else {
                    onNavigateRoom?.('room-3-ricette');
                  }
                }}
                className="taste-btn min-h-[40px] px-3.5 py-2 rounded-full bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer"
              >
                SOS Fornelli
              </button>

              <button
                type="button"
                onClick={() => onNavigateRoom?.('room-7-chimica')}
                className="taste-btn min-h-[40px] px-3.5 py-2 rounded-full bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer"
              >
                SOS Macchia
              </button>

              <button
                type="button"
                onClick={() => onOpenMaestro?.('')}
                className="taste-btn min-h-[40px] px-3.5 py-2 rounded-full bg-white hover:bg-[#F3F1EC] border border-[#1B5E3A]/35 text-xs font-semibold text-[#1B5E3A] cursor-pointer"
              >
                Chiedi al Maestro
              </button>
            </div>
          </div>

          {/* Right Column: Verified Fresh Ingredients Photograph (Zero Caption) */}
          <div className="lg:col-span-4">
            <div className="taste-photo-frame rounded-xl aspect-[4/3] bg-[#F3F1EC] border border-[#E5E2DA]">
              <img
                src="/assets/img/photo-m61660576.jpg"
                alt="Cestino con zucchine e pomodori freschi appoggiato su un tavolo di cucina in legno scuro"
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Adaptive Coaching Non-Punitive Feedback Card */}
      {adaptBanner && (
        <section className="bg-white border border-[#1B5E3A]/30 rounded-2xl p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <span className="inline-block text-[11px] font-semibold bg-emerald-50 text-[#1B5E3A] px-2.5 py-0.5 rounded-full">
                {adaptBanner.eventType === 'emergency_5min'
                  ? 'Piatti pronti in 5 minuti'
                  : 'Riequilibrio leggero dopo la cena fuori'}
              </span>
              <p className="text-xs text-[#141A17] mt-2 leading-relaxed">
                {adaptBanner.data?.coachMessage ||
                  adaptBanner.data?.summary ||
                  'Piano aggiornato proteggendo gli ingredienti freschi già aperti nei prossimi due giorni, senza tagli drastici.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAdaptBanner(null)}
              className="text-xs font-medium text-[#575E58] hover:text-[#141A17] cursor-pointer shrink-0"
            >
              Chiudi
            </button>
          </div>
          {Array.isArray(adaptBanner.data?.rescueOptions) && adaptBanner.data.rescueOptions.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
              {adaptBanner.data.rescueOptions.slice(0, 3).map((opt, idx) => (
                <div key={opt.id || idx} className="bg-[#FAF9F6] rounded-xl p-3.5 border border-[#E5E2DA] text-xs">
                  <div className="font-semibold text-[#141A17]">{opt.title || opt.name}</div>
                  <div className="text-[11px] text-[#575E58] mt-1">
                    {opt.rationale || opt.description || 'Pronto in 5 minuti con ciò che hai già in casa.'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* 2. Expiring Fresh Items (Only shown when atRiskItemsCount > 0) */}
      {var48h.atRiskItemsCount > 0 && (
        <section className="bg-white border border-[#E5E2DA] rounded-2xl p-5 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <h2 className="text-sm font-bold text-[#141A17]">
                  Da usare entro due giorni ({formatEuro(var48h.totalAtRiskEuro)})
                </h2>
                <span className="text-[11px] font-semibold text-[#9A5B25] bg-[#FAF9F6] border border-[#E5E2DA] px-2.5 py-0.5 rounded-full">
                  {var48h.atRiskItemsCount} {var48h.atRiskItemsCount === 1 ? 'fresco in frigo' : 'freschi in frigo'}
                </span>
              </div>
              <p className="text-xs text-[#575E58] mt-1">
                Aggiorna con un tocco quanto ne resta per tenere in ordine dispensa e idee per cena.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-5-dispensa')}
              className="text-xs font-semibold text-[#1B5E3A] hover:underline cursor-pointer self-start sm:self-center"
            >
              Apri dispensa →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {var48h.atRiskItems.slice(0, 4).map((item) => (
              <div
                key={item.id}
                className="bg-[#FAF9F6] rounded-xl border border-[#E5E2DA] p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[#141A17] truncate">{item.title}</div>
                  <div className="text-[11px] text-[#575E58] mt-0.5">
                    {formatPantryAmount(item)}
                    {item.atRiskEuro != null ? ` · ${formatEuro(item.atRiskEuro)}` : ''}
                    {item.hoursRemaining != null ? ` · ${item.hoursRemaining}h rimaste` : ' · In scadenza'}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 1.0)}
                    className="taste-btn px-2.5 py-1.5 rounded-lg border border-[#E5E2DA] bg-white hover:bg-[#F3F1EC] text-[11px] font-semibold text-[#141A17] cursor-pointer"
                  >
                    Intero
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 0.5)}
                    className="taste-btn px-2.5 py-1.5 rounded-lg border border-[#E5E2DA] bg-white hover:bg-[#F3F1EC] text-[11px] font-semibold text-[#9A5B25] cursor-pointer"
                  >
                    Metà
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSwipePantry(item.id, 0, 'consumed')}
                    className="taste-btn px-3 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-[11px] font-semibold text-white cursor-pointer"
                  >
                    Finito
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 3. The 3 Dinner Proposals */}
      <section className="space-y-4" aria-label="Le tre proposte per cena">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2">
          <h2 className="text-lg sm:text-xl font-bold text-[#141A17]">
            Le tre proposte per cena
          </h2>
          {onSwitchAppMode && (
            <button
              type="button"
              onClick={() => onSwitchAppMode('regia')}
              className="text-xs font-semibold text-[#1B5E3A] hover:text-[#14492D] hover:underline cursor-pointer self-start sm:self-auto"
            >
              Pianifica la settimana →
            </button>
          )}
        </div>

        {loading && paretoCards.length === 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {[1, 2, 3].map((n) => (
              <div key={n} className="bg-white rounded-2xl border border-[#E5E2DA] p-5 h-72 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {paretoCards.map((card) => {
              const isExpanded = expandedChains.has(card.slotId);
              return (
                <article
                  key={card.slotId}
                  className={`taste-card bg-white rounded-2xl border p-5 flex flex-col justify-between ${
                    card.recommendedForRhythm
                      ? 'border-[#1B5E3A] ring-1 ring-[#1B5E3A]/20'
                      : 'border-[#E5E2DA]'
                  }`}
                >
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-[#F3F1EC] text-[#141A17]">
                        {card.badge}
                      </span>
                      {card.recommendedForRhythm && (
                        <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-50 text-[#1B5E3A]">
                          Consigliato ora
                        </span>
                      )}
                    </div>

                    <div>
                      <h3 className="text-base font-bold text-[#141A17] leading-snug">
                        {card.cleanTitle || card.title}
                      </h3>
                      {card.cleanSubtitle && (
                        <p className="text-xs text-[#575E58] mt-0.5">{card.cleanSubtitle}</p>
                      )}
                      <p className="text-xs text-[#575E58] mt-2 leading-relaxed">{card.whyThisWins}</p>
                    </div>

                    {/* Essential 2-Datum Strip */}
                    <div className="grid grid-cols-2 gap-3 bg-[#FAF9F6] rounded-xl p-3 border border-[#E5E2DA]">
                      <div>
                        <div className="text-[11px] font-medium text-[#575E58]">Tempo totale</div>
                        <div className="text-sm font-bold text-[#141A17] mt-0.5">
                          {Math.round(card.totalHandsOnMinutes)} min
                        </div>
                        <div className="text-[11px] text-[#575E58]">cottura + lavaggio</div>
                      </div>
                      <div>
                        <div className="text-[11px] font-medium text-[#575E58]">Ingredienti</div>
                        <div className="text-sm font-bold text-[#1B5E3A] mt-0.5">
                          {formatEuro(card.purePortionCostEur)}
                        </div>
                        <div className="text-[11px] text-[#575E58]">a porzione</div>
                      </div>
                    </div>

                    {/* Expandable Detail (Collapsed by Default) */}
                    <div>
                      <button
                        type="button"
                        onClick={() => toggleChain(card.slotId)}
                        aria-expanded={isExpanded}
                        className="text-xs font-semibold text-[#1B5E3A] hover:text-[#14492D] inline-flex items-center gap-1.5 cursor-pointer py-1"
                      >
                        <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
                        <span>Perché funziona</span>
                      </button>

                      {isExpanded && card.fiveSoulsChain && (
                        <ul className="mt-2 space-y-2 text-xs bg-[#FAF9F6] rounded-xl p-3.5 border border-[#E5E2DA] leading-relaxed">
                          <li>
                            <strong className="font-semibold text-[#141A17]">Tecnica:</strong>{' '}
                            <span className="text-[#575E58]">{card.fiveSoulsChain.culinaria}</span>
                          </li>
                          <li>
                            <strong className="font-semibold text-[#141A17]">Pentola:</strong>{' '}
                            <span className="text-[#575E58]">{card.fiveSoulsChain.strumenti}</span>
                          </li>
                          <li>
                            <strong className="font-semibold text-[#141A17]">Nutrizione:</strong>{' '}
                            <span className="text-[#575E58]">{card.fiveSoulsChain.nutrizione}</span>
                          </li>
                          <li>
                            <strong className="font-semibold text-[#141A17]">Lavaggio:</strong>{' '}
                            <span className="text-[#575E58]">{card.fiveSoulsChain.casa}</span>
                          </li>
                          <li>
                            <strong className="font-semibold text-[#141A17]">
                              Bilancio economico completo (incluso tempo ed energia):
                            </strong>{' '}
                            <span className="text-[#575E58]">{card.fiveSoulsChain.economia}</span>
                          </li>
                        </ul>
                      )}
                    </div>
                  </div>

                  <div className="mt-5 pt-3.5 border-t border-[#E5E2DA] flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => onNavigateRoom?.('room-3-ricette')}
                      className="taste-btn flex-1 px-3.5 py-2.5 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-semibold cursor-pointer"
                    >
                      Cucina questo piatto
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onOpenMaestro?.(
                          `Guidami passo-passo per preparare "${card.cleanTitle || card.title}" stasera con le mie pentole e dimmi come lavare subito dopo.`
                        )
                      }
                      className="taste-btn px-3.5 py-2.5 rounded-xl bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer"
                    >
                      Chiedi al Maestro
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* 4. Calm Footer Section: Verified Discounts & Multi-Store Yield */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-7 bg-white rounded-2xl border border-[#E5E2DA] p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-[#141A17]">
                Sconti veri oggi a Rapallo
              </h3>
              <p className="text-xs text-[#575E58] mt-0.5">
                Offerte adatte al tuo profilo e confrontate con i prezzi reali delle scorse settimane.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-1-negozi')}
              className="text-xs font-semibold text-[#1B5E3A] hover:underline cursor-pointer shrink-0"
            >
              Tutte le offerte →
            </button>
          </div>

          {flashOffers.length === 0 ? (
            <p className="text-xs text-[#575E58]">
              Nessuno sconto fuori dal comune rilevato in questo momento. Puoi comunque sfogliare i volantini dei negozi di Rapallo.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {flashOffers.map((off) => (
                <div
                  key={off.id}
                  className="p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] flex flex-col justify-between gap-3"
                >
                  <div>
                    <div className="text-[11px] font-semibold text-[#1B5E3A]">
                      {off.storeName}
                    </div>
                    <div className="text-xs font-semibold text-[#141A17] line-clamp-2 mt-1">
                      {off.title}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div>
                      <div className="text-sm font-bold text-[#141A17]">
                        {formatEuro(off.promoPrice)}
                      </div>
                      {off.ediblePricePerKg != null && (
                        <div className="text-[11px] text-[#575E58]">
                          {formatEuro(off.ediblePricePerKg)}/kg edibile
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
                        className="taste-btn px-2.5 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-[11px] font-semibold cursor-pointer"
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

        <div className="lg:col-span-5 bg-white rounded-2xl border border-[#E5E2DA] p-5 flex flex-col justify-between gap-4">
          <div className="space-y-3.5">
            <div className="taste-photo-frame rounded-xl aspect-[16/10] bg-[#F3F1EC] border border-[#E5E2DA]">
              <img
                src="/assets/img/photo-m61663250-960.jpg"
                alt="Cassetta di legno con carote fresche e cipolle rosse di stagione"
                className="w-full h-full object-cover"
                loading="lazy"
              />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#141A17]">
                Conviene fare più tappe?
              </h3>
              <p className="text-xs text-[#575E58] mt-1 leading-relaxed">
                {copilotData?.storeRouteYieldSummary?.summary ||
                  'Confrontiamo uno, due o tre negozi a Rapallo contando anche tempo di strada e parcheggio.'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              onSwitchAppMode ? onSwitchAppMode('regia') : onNavigateRoom?.('room-6-pianificatore')
            }
            className="taste-btn w-full px-4 py-2.5 rounded-xl bg-[#141A17] hover:bg-[#27312B] text-white text-xs font-semibold cursor-pointer"
          >
            Simula tappe e lista in corsia →
          </button>
        </div>
      </section>
    </div>
  );
}

export default TodayCopilotView;
