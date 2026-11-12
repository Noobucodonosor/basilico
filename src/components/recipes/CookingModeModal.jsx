import React, { useState, useEffect } from 'react';
import KitchenResetCard from '../kitchen/KitchenResetCard.jsx';
import LabNotebookModal from './LabNotebookModal.jsx';

const HEAT_SOURCE_LABELS = {
  gas: '🔥 Piano a Gas (Fiamma Modulata)',
  induction: '⚡ Piano a Induzione (Campo Elettromagnetico)',
  electric_radiant: '🟠 Piastra Elettrica Radiante',
  boat_no_stove: '⛵ Cambusa Barca / Borsa Termica (Zero Fornelli)'
};

export function CookingModeModal({ dishId, initialServings = 1, activeProfileId, onClose, onLabNoteSaved }) {
  const [session, setSession] = useState(null);
  const [heatSource, setHeatSource] = useState('gas');
  const [loading, setLoading] = useState(true);
  const [checkedIngredients, setCheckedIngredients] = useState({});
  const [activeTimers, setActiveTimers] = useState({});
  const [isLabModalOpen, setIsLabModalOpen] = useState(false);
  const [pantryConsumeResult, setPantryConsumeResult] = useState(null);
  const [consumingPantry, setConsumingPantry] = useState(false);

  const handleConsumeFromPantry = async () => {
    if (!session?.dish || consumingPantry) return;
    setConsumingPantry(true);
    try {
      const res = await fetch('/api/pantry/consume-dish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishId: session.dish.id,
          dishTitle: session.dish.title,
          servings: session.dish.servings || initialServings,
          profileId: activeProfileId || 'dany',
          bom: session.dish.bom
        })
      });
      if (res.ok) {
        setPantryConsumeResult(await res.json());
      }
    } catch (_) {}
    setConsumingPantry(false);
  };

  useEffect(() => {
    if (!dishId) return;
    setLoading(true);
    fetch(
      `/api/recipes/${encodeURIComponent(dishId)}/cooking-session?heatSource=${encodeURIComponent(
        heatSource
      )}&servings=${initialServings}&profileId=${encodeURIComponent(activeProfileId || 'dany')}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setSession(data);
          const timersInit = {};
          (data.scientificSteps || []).forEach((s) => {
            timersInit[s.stepNumber] = {
              remaining: s.durationSeconds || 120,
              running: false,
              total: s.durationSeconds || 120
            };
          });
          setActiveTimers(timersInit);
        }
      })
      .finally(() => setLoading(false));
  }, [dishId, heatSource, initialServings, activeProfileId]);

  // Countdown tick for active step timers
  useEffect(() => {
    const id = setInterval(() => {
      setActiveTimers((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const [k, t] of Object.entries(prev)) {
          if (t.running && t.remaining > 0) {
            changed = true;
            next[k] = {
              ...t,
              remaining: t.remaining - 1,
              running: t.remaining - 1 > 0
            };
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  if (!dishId) return null;

  const toggleTimer = (stepNum) => {
    setActiveTimers((prev) => {
      const cur = prev[stepNum] || { remaining: 120, total: 120, running: false };
      return {
        ...prev,
        [stepNum]: { ...cur, running: !cur.running }
      };
    });
  };

  const resetTimer = (stepNum) => {
    setActiveTimers((prev) => {
      const cur = prev[stepNum] || { remaining: 120, total: 120, running: false };
      return {
        ...prev,
        [stepNum]: { ...cur, remaining: cur.total, running: false }
      };
    });
  };

  const formatSec = (s) => {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, '0')}`;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 overflow-y-auto p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Modalità Fornelli Science & Cooking"
    >
      <div className="max-w-5xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Top Bar */}
        <div className="bg-slate-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-600 text-white">
                Harvard Science & Cooking Coach
              </span>
              {session?.dish?.restaurantName && (
                <span className="text-xs text-emerald-300 font-semibold">
                  📍 {session.dish.restaurantName} ({session.dish.city})
                </span>
              )}
            </div>
            <h2 className="text-lg font-extrabold mt-1">
              👨‍🍳 {session?.dish?.title || 'Caricamento sessione scientifica...'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 self-stretch sm:self-center">
            <select
              aria-label="Seleziona Piano Cottura"
              value={heatSource}
              onChange={(e) => setHeatSource(e.target.value)}
              className="text-xs font-bold bg-slate-800 text-white border border-slate-700 rounded-lg px-3 py-2 cursor-pointer"
            >
              {Object.entries(HEAT_SOURCE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleConsumeFromPantry}
              disabled={consumingPantry || Boolean(pantryConsumeResult)}
              className="px-3 py-2 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-lg cursor-pointer whitespace-nowrap"
            >
              {pantryConsumeResult ? '✓ Scalato da Dispensa' : '🍳 Ho cucinato (Scala Dispensa)'}
            </button>
            <button
              type="button"
              onClick={() => setIsLabModalOpen(true)}
              className="px-3 py-2 text-xs font-extrabold bg-amber-500 hover:bg-amber-600 text-slate-950 rounded-lg cursor-pointer whitespace-nowrap"
            >
              📓 Registra nel Quaderno Lab
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
            >
              ✕ Esci dai Fornelli
            </button>
          </div>
        </div>

        {loading || !session ? (
          <div className="p-8 text-center text-sm text-slate-500">
            Calcolo parametri fisici, termodinamici e protocollo Kitchen Reset...
          </div>
        ) : (
          <div className="p-5 space-y-6">
            {pantryConsumeResult && (
              <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-300 text-xs text-sky-950 space-y-1">
                <div className="font-extrabold">
                  🥫 Dispensa aggiornata post-cottura ({pantryConsumeResult.deductedCount} confezioni scalate):
                </div>
                {pantryConsumeResult.deductedItems.map((di, idx) => (
                  <p key={idx}>
                    • <strong>{di.title}</strong>: -{di.gramsDeducted}g → residuo <strong>{di.remainingAfterGrams}g</strong>
                    {di.tOpenNewlyActivated ? ' (⏱️ Orologio freschezza T_open avviato!)' : ''}
                  </p>
                ))}
              </div>
            )}
            {/* Profile Substitution Notice or Structural Dairy Identity Warning */}
            {session.dish.isExcludedByProfileIdentity && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-950 space-y-1">
                <div className="font-extrabold">
                  🚫 Piatto a Identità Latticini Strutturale (Non Sostituibile per Profilo Zero Formaggi):
                </div>
                <p>{session.dish.profileExclusionReason}</p>
              </div>
            )}
            {session.dish.hasProfileSubstitution && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 space-y-1">
                <div className="font-extrabold">
                  🛡️ Variante Scientifica Adattata al Profilo (Zero Formaggi / Latticini):
                </div>
                {session.dish.substitutionsApplied.map((sub, i) => (
                  <p key={i}>
                    • Sostituito <strong>{sub.originalName}</strong> → <strong>{sub.name}</strong> ({sub.scientificRationale})
                  </p>
                ))}
              </div>
            )}

            {/* Mise en Place Checklist */}
            <section className="bg-slate-50 rounded-xl border border-slate-200 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">
                  ⚖️ 1. Check Mise en Place ({session.dish.servings} porz.) & Resa Crudo → Cotto
                </h3>
                <span className="text-xs font-bold text-emerald-800">
                  Costo porzione pura: €{session.dish.costAndArbitrage.purePortionCostEur.toFixed(2)} (Menu: €
                  {session.dish.costAndArbitrage.totalMenuPriceEur.toFixed(2)})
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {session.dish.bom.map((b, idx) => {
                  const isChecked = Boolean(checkedIngredients[idx]);
                  return (
                    <label
                      key={idx}
                      className={`flex items-start gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 line-through'
                          : 'bg-white border-slate-200 text-slate-800'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() =>
                          setCheckedIngredients((prev) => ({ ...prev, [idx]: !prev[idx] }))
                        }
                        className="mt-0.5 rounded text-emerald-600"
                      />
                      <div className="flex-1">
                        <div className="font-bold">
                          {b.name} — <span className="text-emerald-700">{b.rawGramsTotal}g crudo</span> (→{' '}
                          {b.cookedGramsTotal}g cotto)
                        </div>
                        <div className="text-[11px] text-slate-500">{b.notes}</div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </section>

            {/* Step-by-Step Scientific Cooking Timeline */}
            <section className="space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900">
                🔬 2. Sequenza Termica &amp; Sensoriale (<em className="italic">Harvard Science &amp; Cooking</em>)
              </h3>
              <div className="space-y-4">
                {session.scientificSteps.map((st) => {
                  const timer = activeTimers[st.stepNumber] || {
                    remaining: st.durationSeconds,
                    total: st.durationSeconds,
                    running: false
                  };
                  return (
                    <article
                      key={st.stepNumber}
                      className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                        <div>
                          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-900 text-white">
                            Step {st.stepNumber} · {st.phase}
                          </span>
                          <h4 className="text-sm font-extrabold text-slate-900 mt-1">{st.title}</h4>
                        </div>

                        {/* Interactive Countdown Timer */}
                        <div className="flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl border border-slate-200">
                          <span className="font-mono text-sm font-extrabold text-slate-900">
                            ⏱️ {formatSec(timer.remaining)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleTimer(st.stepNumber)}
                            className={`px-2.5 py-1 rounded text-[11px] font-extrabold text-white cursor-pointer ${
                              timer.running ? 'bg-amber-600' : 'bg-emerald-600 hover:bg-emerald-700'
                            }`}
                          >
                            {timer.running ? 'Pausa' : 'Avvia'}
                          </button>
                          <button
                            type="button"
                            onClick={() => resetTimer(st.stepNumber)}
                            className="px-2 py-1 rounded text-[11px] font-bold text-slate-600 hover:bg-slate-200 cursor-pointer"
                          >
                            Reset
                          </button>
                        </div>
                      </div>

                      {/* Stove Translation Banner */}
                      <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-950 font-semibold">
                        🎛️ <strong>Regolazione Piano Cottura:</strong> {st.stoveInstruction}
                      </div>

                      {/* Operational Instructions */}
                      <p className="text-xs text-slate-800 leading-relaxed">{st.instructions}</p>

                      {/* Physics / Chemistry Box */}
                      <div className="p-3 rounded-xl bg-indigo-50/70 border border-indigo-200 text-xs text-indigo-950">
                        <strong>⚛️ Perché fisico-chimico:</strong> {st.scientificPrinciple}
                      </div>

                      {/* Sensory Cues */}
                      {st.sensoryCues && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                            <strong>👁️ Vista:</strong> {st.sensoryCues.visual}
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                            <strong>👂 Udito:</strong> {st.sensoryCues.acoustic}
                          </div>
                          <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-[11px]">
                            <strong>👃 Olfatto:</strong> {st.sensoryCues.olfactory}
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>

            {/* Post-Cooking Kitchen Reset Protocols */}
            {session.kitchenReset?.protocols?.length > 0 && (
              <section className="space-y-3 pt-2 border-t border-slate-200">
                <h3 className="text-sm font-extrabold text-slate-900">
                  🧼 3. Protocollo Post-Cottura "Kitchen Reset" (Tutela Pentole & Anti-Shock Termico)
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {session.kitchenReset.protocols.map((proto) => (
                    <KitchenResetCard key={proto.toolId} protocol={proto} />
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>

      <LabNotebookModal
        isOpen={isLabModalOpen}
        dish={session?.dish}
        heatSource={heatSource}
        onClose={() => setIsLabModalOpen(false)}
        onSaved={(entry) => {
          if (onLabNoteSaved) onLabNoteSaved(entry);
        }}
      />
    </div>
  );
}

export default CookingModeModal;
