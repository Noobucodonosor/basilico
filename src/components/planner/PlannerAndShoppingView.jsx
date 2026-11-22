import React, { useState, useEffect, useCallback, useRef } from 'react';
import AisleChecklistModal from './AisleChecklistModal.jsx';

const DAY_MODE_OPTIONS = [
  { id: 'land_day', label: '🏠 Giornata a Terra (Casa)' },
  { id: 'boat_day', label: '⛵ Giornata in Barca (Borsa Termica)' },
  { id: 'eat_out', label: '🍽️ Fuori a Pranzo/Cena' }
];

const DEFAULT_DAY_MODES = [
  'land_day',
  'land_day',
  'land_day',
  'land_day',
  'boat_day',
  'boat_day',
  'land_day'
];

export function PlannerAndShoppingView({ activeProfileId, onShoppingListChange, onPantryUpdated }) {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('promo_driven_neodiet');
  const [budgetEur, setBudgetEur] = useState(80);
  const [servings, setServings] = useState(1);
  const [dayModes, setDayModes] = useState(DEFAULT_DAY_MODES);

  const [plan, setPlan] = useState(null);
  const [shoppingList, setShoppingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAisleModalOpen, setIsAisleModalOpen] = useState(false);
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemDomain, setManualItemDomain] = useState('food_human');
  const [manualItemPrice, setManualItemPrice] = useState('2.50');
  const [statusToast, setStatusToast] = useState('');
  const [transportMode, setTransportMode] = useState('car');
  const [storeYieldData, setStoreYieldData] = useState(null);

  const generateAbortRef = useRef(null);
  const budgetDebounceRef = useRef(null);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/maestro/economics/store-yield?transportMode=${encodeURIComponent(transportMode)}`, {
      signal: ctrl.signal
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !ctrl.signal.aborted) setStoreYieldData(data);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [transportMode]);

  useEffect(() => {
    const ctrl = new AbortController();
    fetch('/api/planner/models', { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) setModels(data.models);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, []);

  // Hydrate persisted plan + shopping list on mount / profile switch via GET /api/planner/current
  // (NEVER fires POST /api/planner/generate on mount, preserving promo items, checked flags & swaps!)
  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true);
    const profParam = activeProfileId ? `?profileId=${encodeURIComponent(activeProfileId)}` : '';

    fetch(`/api/planner/current${profParam}`, { signal: ctrl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data) return;
        if (data.plan) {
          setPlan(data.plan);
          if (data.plan.model?.id) setSelectedModelId(data.plan.model.id);
          if (Number.isFinite(Number(data.plan.budgetEur)) && Number(data.plan.budgetEur) > 0) {
            setBudgetEur(Number(data.plan.budgetEur));
          }
          if (Number.isFinite(Number(data.plan.servings)) && Number(data.plan.servings) > 0) {
            setServings(Number(data.plan.servings));
          }
          if (Array.isArray(data.plan.days) && data.plan.days.length > 0) {
            setDayModes(data.plan.days.map((d) => d.dayMode || 'land_day'));
          }
        }
        if (data.shoppingList) {
          setShoppingList(data.shoppingList);
          if (onShoppingListChange) {
            onShoppingListChange(data.shoppingList?.subtotals?.totalItemsCount || 0);
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!ctrl.signal.aborted) {
          setLoading(false);
        }
      });

    return () => {
      ctrl.abort();
    };
  }, [activeProfileId, onShoppingListChange]);

  // Cleanup any in-flight generation / debounce timer on unmount
  useEffect(() => {
    return () => {
      if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
      if (generateAbortRef.current) generateAbortRef.current.abort();
    };
  }, []);

  const generatePlan = useCallback(
    (overrides = {}) => {
      if (generateAbortRef.current) {
        generateAbortRef.current.abort();
      }
      const ctrl = new AbortController();
      generateAbortRef.current = ctrl;

      const nextModelId = overrides.modelId ?? selectedModelId;
      const nextServings = overrides.servings ?? servings;
      const rawBudget = overrides.budgetEur ?? budgetEur;
      const nextBudget = Number.isFinite(Number(rawBudget)) && Number(rawBudget) > 0 ? Number(rawBudget) : 65;
      const nextModes = overrides.dayModes ?? dayModes;

      setLoading(true);
      fetch('/api/planner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          modelId: nextModelId,
          daysCount: 7,
          servings: nextServings,
          budgetEur: nextBudget,
          dayModes: nextModes,
          profileId: activeProfileId || 'dany'
        })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data && !ctrl.signal.aborted) {
            setPlan(data.plan);
            setShoppingList(data.shoppingList);
            if (onShoppingListChange) {
              onShoppingListChange(data.shoppingList?.subtotals?.totalItemsCount || 0);
            }
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!ctrl.signal.aborted) {
            setLoading(false);
          }
        });
    },
    [selectedModelId, servings, budgetEur, dayModes, activeProfileId, onShoppingListChange]
  );

  const handleSelectModel = (modelId) => {
    if (modelId === selectedModelId) return;
    setSelectedModelId(modelId);
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    generatePlan({ modelId });
  };

  const handleServingsChange = (nextServings) => {
    const safeServings = Math.max(1, Math.min(8, Number(nextServings) || 1));
    setServings(safeServings);
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    generatePlan({ servings: safeServings });
  };

  const handleBudgetInputChange = (rawVal) => {
    setBudgetEur(rawVal);
    if (budgetDebounceRef.current) {
      clearTimeout(budgetDebounceRef.current);
    }
    const parsed = Number(rawVal);
    if (!Number.isFinite(parsed) || parsed < 15) return;
    budgetDebounceRef.current = setTimeout(() => {
      generatePlan({ budgetEur: parsed });
    }, 400);
  };

  const handleDayModeChange = (idx, newMode) => {
    const updated = [...dayModes];
    updated[idx] = newMode;
    setDayModes(updated);
    if (budgetDebounceRef.current) clearTimeout(budgetDebounceRef.current);
    generatePlan({ dayModes: updated });
  };

  const handleSwapMeal = async (dayIndex, slot) => {
    const res = await fetch('/api/planner/swap-meal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dayIndex, slot })
    });
    if (res.ok) {
      const data = await res.json();
      setPlan(data.plan);
      setShoppingList(data.shoppingList);
      if (onShoppingListChange) {
        onShoppingListChange(data.shoppingList?.subtotals?.totalItemsCount || 0);
      }
    }
  };

  const handleToggleShoppingItem = async (itemId) => {
    const res = await fetch(`/api/shopping-list/items/${encodeURIComponent(itemId)}/toggle`, {
      method: 'POST'
    });
    if (res.ok) {
      const state = await res.json();
      setShoppingList(state);
      if (onShoppingListChange) {
        onShoppingListChange(state?.subtotals?.totalItemsCount || 0);
      }
    }
  };

  const handleRemoveShoppingItem = async (itemId) => {
    const res = await fetch(`/api/shopping-list/items/${encodeURIComponent(itemId)}`, {
      method: 'DELETE'
    });
    if (res.ok) {
      const state = await res.json();
      setShoppingList(state);
      if (onShoppingListChange) {
        onShoppingListChange(state?.subtotals?.totalItemsCount || 0);
      }
    }
  };

  const handleReplacePlanBItem = async (itemId, alt) => {
    const res = await fetch(`/api/shopping-list/items/${encodeURIComponent(itemId)}/replace-plan-b`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(alt || {})
    });
    if (res.ok) {
      const state = await res.json();
      setShoppingList(state);
      if (onShoppingListChange) {
        onShoppingListChange(state?.subtotals?.totalItemsCount || 0);
      }
      setStatusToast(`🔄 Sostituito nel carrello con "${alt?.title}" (${alt?.chainName})`);
      setTimeout(() => setStatusToast(''), 3500);
    }
  };

  const handleAddManualItem = async (e) => {
    e.preventDefault();
    if (!manualItemName.trim()) return;
    const parsedPrice = Number(String(manualItemPrice || '2.5').replace(',', '.'));
    const safePrice = Number.isFinite(parsedPrice) && parsedPrice > 0 ? parsedPrice : 2.5;
    const res = await fetch('/api/shopping-list/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manualItemName,
        domain: manualItemDomain,
        unitPriceEur: safePrice
      })
    });
    if (res.ok) {
      const state = await res.json();
      setShoppingList(state);
      setManualItemName('');
      if (onShoppingListChange) {
        onShoppingListChange(state?.subtotals?.totalItemsCount || 0);
      }
    }
  };

  const handleCompleteAndLoadPantry = async () => {
    const res = await fetch('/api/shopping-list/complete-and-load-pantry', {
      method: 'POST'
    });
    if (res.ok) {
      const data = await res.json();
      setShoppingList(data.shoppingList);
      if (onShoppingListChange) {
        onShoppingListChange(data.shoppingList?.subtotals?.totalItemsCount || 0);
      }
      if (onPantryUpdated) {
        onPantryUpdated();
      }
      setStatusToast(
        `✅ Spesa completata: ${data.loadedCount} confezioni intere caricate automaticamente nella tua Dispensa a 3 Luoghi!`
      );
      setTimeout(() => setStatusToast(''), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Clean Consumer Lista & Meal Plan Header */}
      <section className="bg-[#141A17] text-white rounded-2xl p-5 sm:p-6 shadow-sm">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
              Lista della Spesa &amp; Piano Settimanale
            </h1>
            <p className="text-xs sm:text-sm text-stone-300 max-w-2xl">
              Organizza gli acquisti tra i negozi di Rapallo usando prima le scorte già aperte in casa e confezioni intere senza sprechi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAisleModalOpen(true)}
              className="px-4 py-2.5 rounded-full text-xs font-semibold bg-[#1B5E3A] hover:bg-emerald-700 text-white cursor-pointer"
            >
              🛒 Modalità In Corsia ({shoppingList?.subtotals?.totalItemsCount || 0} art.)
            </button>
            <button
              type="button"
              onClick={handleCompleteAndLoadPantry}
              className="px-3.5 py-2.5 rounded-full text-xs font-semibold bg-white/15 hover:bg-white/25 text-white cursor-pointer"
            >
              ✓ Carica spuntati in Dispensa
            </button>
          </div>
        </div>
      </section>

      {statusToast && (
        <div className="p-3.5 rounded-xl bg-[#1B5E3A] text-white text-xs font-extrabold text-center shadow-xs">
          {statusToast}
        </div>
      )}

      {/* 6 Neo-Dieta Models Selector */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-900">
            1. Scegli lo stile della settimana
          </h2>
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Budget Cassa Settimanale (€):</span>
              <input
                type="number"
                min="20"
                max="300"
                value={budgetEur}
                onChange={(e) => handleBudgetInputChange(e.target.value)}
                className="w-20 text-xs font-extrabold border border-slate-300 rounded-lg px-2 py-1 text-slate-900"
              />
            </label>
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Persone:</span>
              <select
                value={servings}
                onChange={(e) => handleServingsChange(e.target.value)}
                className="text-xs font-extrabold border border-slate-300 rounded-lg px-2 py-1 text-slate-900"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'Single' : 'Pers.'}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => generatePlan()}
              className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-slate-900 hover:bg-slate-800 text-white cursor-pointer"
            >
              🔄 Rigenera Piano
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {models.map((m) => {
            const isSel = selectedModelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => handleSelectModel(m.id)}
                className={`p-3.5 rounded-2xl border text-left transition-all cursor-pointer ${
                  isSel
                    ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                    : 'bg-white text-slate-800 border-slate-200 hover:border-emerald-400'
                }`}
              >
                <div className="flex items-center gap-2 font-extrabold text-xs">
                  <span className="text-base">{m.icon}</span>
                  <span>{m.name}</span>
                </div>
                <p className={`text-[11px] mt-1 ${isSel ? 'text-slate-300' : 'text-slate-500'}`}>
                  {m.description}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {loading && !plan ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Caricamento piano settimanale a confezioni intere zero-spreco...
        </div>
      ) : !plan ? null : (
        <>
          {/* Summary KPI Bar */}
          <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Scontrino Cassa Confezioni Intere</div>
              <div className="text-xl font-extrabold text-emerald-700 mt-1">
                €{Number(plan.ledger.totalCheckoutCashEur || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">
                Budget: €{plan.budgetEur} ({plan.withinBudget ? '✓ Rispettato' : 'Soglia minima'})
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Valore Grammi Puri Consumati</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                €{Number(plan.ledger.totalPureConsumedValueEur || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">Il resto rientra tracciato in Dispensa</div>
            </div>

            <div className="bg-white rounded-2xl border border-[#E5E2DA] p-4 shadow-xs">
              <div className="text-[11px] font-bold text-[#575E58] uppercase">Equivalente Menu Ristoranti</div>
              <div className="text-xl font-extrabold text-[#141A17] mt-1">
                €{Number(plan.ledger.totalMenuEquivalentEur || 0).toFixed(2)}
              </div>
              <div className="text-[11px] text-[#1B5E3A] font-bold">
                Risparmio Arbitraggio: €{Number(plan.ledger.totalArbitrageSavingsEur || 0).toFixed(2)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Freschi Aperti Prioritizzati</div>
              <div className="text-xl font-extrabold text-amber-700 mt-1">
                {(plan.openedPerishablesPrioritized || []).length} confezioni
              </div>
              <div className="text-[11px] text-slate-500">Consumati nei primi giorni entro T_open</div>
            </div>
          </section>

          {/* 7-Day Calendar with Boat / Land / Eat Out Selector */}
          <section className="space-y-3">
            <h2 className="text-sm font-extrabold text-slate-900">
              ⛵ 2. Calendario 7 Giorni (Configura Giorni in Barca / Terra / Fuori & Sostituisci con 1 Clic)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {plan.days.map((day, idx) => (
                <article
                  key={day.dayIndex}
                  className={`rounded-2xl border p-4 shadow-xs space-y-3 ${
                    day.dayMode === 'boat_day'
                      ? 'bg-sky-50/60 border-sky-200'
                      : day.dayMode === 'eat_out'
                      ? 'bg-slate-100 border-slate-200 opacity-75'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-slate-200/70 pb-2">
                    <span className="text-sm font-extrabold text-slate-900">
                      Giorno {day.dayIndex} · {day.dayName}
                    </span>
                    <select
                      aria-label={`Modalità Giorno ${day.dayName}`}
                      value={day.dayMode}
                      onChange={(e) => handleDayModeChange(idx, e.target.value)}
                      className="text-[11px] font-bold border border-slate-300 rounded-lg px-2 py-1 bg-white text-slate-800"
                    >
                      {DAY_MODE_OPTIONS.map((opt) => (
                        <option key={opt.id} value={opt.id}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="text-[11px] text-slate-700 bg-white/90 p-2.5 rounded-xl border border-slate-200/70 space-y-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-extrabold text-amber-900">☕ Colazione (con BOM CREA)</span>
                      {day.dayMode !== 'eat_out' && (
                        <button
                          type="button"
                          onClick={() => handleSwapMeal(day.dayIndex, 'breakfast')}
                          className="text-[10px] font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                        >
                          🔄 Cambia
                        </button>
                      )}
                    </div>
                    <div className="font-bold text-slate-900">{day.breakfast.title}</div>
                    <div className="text-[10px] text-slate-500">
                      {day.breakfast.kcal} kcal
                      {day.breakfast.proteinG ? ` • ${day.breakfast.proteinG}g prot` : ''}
                      {day.breakfast.purePortionCostEur ? ` • €${Number(day.breakfast.purePortionCostEur).toFixed(2)}` : ''}
                    </div>
                  </div>

                  {day.dayMode === 'eat_out' ? (
                    <div className="p-3 text-center text-xs font-semibold text-slate-500">
                      🍽️ Pasti fuori casa — nessun ingrediente addebitato sulla lista spesa.
                    </div>
                  ) : (
                    <>
                      {/* Lunch Slot */}
                      {day.lunch?.dish && (
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase text-emerald-800">
                              {day.lunch.contextLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSwapMeal(day.dayIndex, 'lunch')}
                              className="text-[10px] font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                            >
                              🔄 Cambia piatto
                            </button>
                          </div>
                          <div className="text-xs font-extrabold text-slate-900">{day.lunch.dish.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Porzione: €{Number(day.lunch.dish.costAndArbitrage?.purePortionCostEur || 0).toFixed(2)}</span>
                            <span>• {day.lunch.dish.nutritionPerServing?.energyKcal || 0} kcal</span>
                            {day.lunch.consumesOpenedPerishable && (
                              <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-900 font-bold">
                                ⏱️ Svuota Fresco Aperto
                              </span>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Dinner Slot */}
                      {day.dinner?.dish && (
                        <div className="p-2.5 rounded-xl bg-white border border-slate-200 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-extrabold uppercase text-slate-600">
                              {day.dinner.contextLabel}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleSwapMeal(day.dayIndex, 'dinner')}
                              className="text-[10px] font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                            >
                              🔄 Cambia piatto
                            </button>
                          </div>
                          <div className="text-xs font-extrabold text-slate-900">{day.dinner.dish.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Porzione: €{Number(day.dinner.dish.costAndArbitrage?.purePortionCostEur || 0).toFixed(2)}</span>
                            <span>• {day.dinner.dish.nutritionPerServing?.energyKcal || 0} kcal</span>
                            {day.dinner.sharedPackCount > 0 && (
                              <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-900 font-bold">
                                🔗 {day.dinner.sharedPackCount} conf. concatenate
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </article>
              ))}
            </div>
          </section>

          {/* Whole-Pack Traceability Ledger */}
          <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-100 text-emerald-900">
                Zero Spreco & Tracciabilità Confezioni Intere (K_p = ⌈Q_p / S_p⌉)
              </span>
              <h2 className="text-base font-extrabold text-slate-900 mt-1">
                📦 3. Tracciabilità Confezioni Condivise tra Più Pasti & Rientri Onesti in Dispensa
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(plan.ledger.wholePackItems || []).slice(0, 12).map((wp) => (
                <div
                  key={wp.key}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{wp.name}</span>
                    <span className="font-extrabold text-emerald-800">
                      {wp.packsToBuy} conf. × {wp.packSizeGrams}g = €{Number(wp.checkoutCostEur || 0).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Fabbisogno ricette: <strong>{wp.totalRequiredGrams}g</strong> • Da Dispensa:{' '}
                    <strong>{wp.fromPantryGrams}g</strong> • Acquistati: <strong>{wp.totalPurchasedGrams}g</strong> •
                    Residuo che rientra in Dispensa:{' '}
                    <strong className="text-[#1B5E3A]">{wp.residualReturnedToPantryGrams}g</strong>
                  </div>
                  <div className="text-[10px] text-slate-500">
                    Usato in:{' '}
                    {wp.usedInMeals
                      .map(
                        (m) =>
                          `${m.dayName} (${
                            m.slot === 'breakfast' ? 'Colazione' : m.slot === 'lunch' ? 'Pranzo' : 'Cena'
                          }: ${m.gramsUsed}g)`
                      )
                      .join(' → ')}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Multi-Store Simulator in Rapallo (1 vs 2 vs 3 Stores) + €/h Stop Convenience */}
          {shoppingList?.storeSimulations && (
            <section className="bg-white rounded-2xl border border-[#E5E2DA] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#F3F1EC] text-[#9A5B25] border border-[#DFDCD2]">
                    Logistica Reale Rapallo (16035 GE)
                  </span>
                  <h2 className="text-base font-extrabold text-[#141A17] mt-1">
                    🏪 4. Simulatore Strategia di Spesa: 1 Solo Negozio vs 2 Negozi vs 3 Negozi a Rapallo
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAisleModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-[#141A17] hover:bg-[#1B5E3A] text-white taste-btn cursor-pointer"
                >
                  🛒 Apri Checklist In Corsia & Piano B
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shoppingList.storeSimulations.map((sim, idx) => (
                  <div
                    key={sim.strategyId}
                    className={`p-4 rounded-xl border space-y-2 ${
                      idx === 1 ? 'bg-[#F3F1EC] border-[#1B5E3A]/40' : 'bg-[#FAF9F6] border-[#E5E2DA]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#141A17]">{sim.title}</span>
                      <span className="text-xs font-bold text-[#575E58]">🚶 ~{sim.estimatedTotalMinutes} min</span>
                    </div>
                    <div className="text-lg font-extrabold text-[#1B5E3A]">
                      €{Number(sim.estimatedTotalEur || 0).toFixed(2)}
                      {sim.savingsVsSingleEur > 0 && (
                        <span className="ml-2 text-xs font-bold text-[#1B5E3A]">
                          (Risparmi €{Number(sim.savingsVsSingleEur || 0).toFixed(2)})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#4A524C]">
                      <strong>Tappe:</strong> {sim.storesVisited.join(' + ')}
                    </div>
                    <div className="text-[10px] text-[#9A5B25] font-semibold">
                      💳 Carte: {sim.loyaltyCardsNeeded.join(' • ')}
                    </div>
                    <p className="text-[11px] text-[#575E58]">{sim.recommendation}</p>
                  </div>
                ))}
              </div>

              {/* Convenienza oraria netta (€/h) tra 1, 2 o 3 tappe a Rapallo */}
              <div className="pt-3 border-t border-[#E5E2DA] space-y-3" data-testid="shopping-store-yield-panel">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-[#141A17]">
                      ⏱️ Conviene davvero aggiungere una seconda o terza tappa? (Rendimento €/ora)
                    </h3>
                    <p className="text-[11px] text-[#575E58]">
                      Confronta il risparmio sullo scontrino con il tempo speso tra traffico e parcheggio a Rapallo.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {['car', 'scooter', 'foot'].map((tm) => (
                      <button
                        key={tm}
                        type="button"
                        onClick={() => setTransportMode(tm)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                          transportMode === tm
                            ? 'bg-[#141A17] text-white border-[#141A17]'
                            : 'bg-[#F3F1EC] text-[#141A17] border-[#DFDCD2] hover:bg-[#E7E4DC]'
                        }`}
                      >
                        {tm === 'car' ? '🚗 Auto' : tm === 'scooter' ? '🛵 Scooter' : '🚶 A piedi'}
                      </button>
                    ))}
                  </div>
                </div>

                {storeYieldData?.optimalSummary && (
                  <div className="p-3 rounded-xl bg-[#F3F1EC] border border-[#1B5E3A]/30 text-xs font-bold text-[#141A17]">
                    ✅ {storeYieldData.optimalSummary}
                  </div>
                )}

                {Array.isArray(storeYieldData?.incrementalYields) && storeYieldData.incrementalYields.length > 0 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {storeYieldData.incrementalYields.map((yld) => (
                      <div
                        key={yld.stepLabel}
                        className={`p-3 rounded-xl border text-xs space-y-1 ${
                          yld.verdict === 'recommended'
                            ? 'bg-[#F3F1EC] border-[#1B5E3A]/30'
                            : 'bg-[#FAF9F6] border-[#E5E2DA]'
                        }`}
                      >
                        <div className="flex items-center justify-between font-extrabold text-[#141A17]">
                          <span>{yld.stepLabel}</span>
                          <span className="text-[#1B5E3A]">Vale €{Number(yld.impliedHourlyYieldEur || 0).toFixed(2)}/ora</span>
                        </div>
                        <p className="text-[11px] text-[#575E58]">{yld.explanation}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Add Extra Item (Food or Home Cleaning / Tigotà) */}
              <form
                onSubmit={handleAddManualItem}
                className="pt-3 border-t border-[#E5E2DA] flex flex-wrap items-center gap-2"
              >
                <span className="text-xs font-bold text-[#4A524C]">
                  + Aggiungi articolo extra alla Lista Spesa:
                </span>
                <input
                  type="text"
                  placeholder="Es. Detersivo Piatti Neutro / Carta Forno / Caffè..."
                  value={manualItemName}
                  onChange={(e) => setManualItemName(e.target.value)}
                  className="flex-1 min-w-[200px] text-xs border border-[#DFDCD2] rounded-lg px-3 py-1.5"
                />
                <select
                  value={manualItemDomain}
                  onChange={(e) => setManualItemDomain(e.target.value)}
                  className="text-xs border border-[#DFDCD2] rounded-lg px-2.5 py-1.5 font-semibold"
                >
                  <option value="food_human">🥩 Alimentari (Subtotale Cibo)</option>
                  <option value="home_cleaning">🧼 Chimica Casa / Tigotà (Subtotale Casa)</option>
                  <option value="personal_care">🧴 Cura Persona & Igiene (Subtotale Casa)</option>
                  <option value="kitchen_cookware">🍳 Pentole & Elettrodomestici (Subtotale Casa)</option>
                  <option value="pet_care">🐾 Animali Domestici (Subtotale Casa)</option>
                  <option value="bazar_seasonal">🎄 Giocattoli, Natale & Bazar (Subtotale Casa)</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  value={manualItemPrice}
                  onChange={(e) => setManualItemPrice(e.target.value)}
                  className="w-20 text-xs border border-[#DFDCD2] rounded-lg px-2 py-1.5"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-[#1B5E3A] hover:bg-[#14472C] text-white text-xs font-extrabold rounded-lg cursor-pointer"
                >
                  + Aggiungi
                </button>
              </form>
            </section>
          )}
        </>
      )}

      <AisleChecklistModal
        isOpen={isAisleModalOpen}
        shoppingList={shoppingList}
        onClose={() => setIsAisleModalOpen(false)}
        onToggleItem={handleToggleShoppingItem}
        onRemoveItem={handleRemoveShoppingItem}
        onReplacePlanB={handleReplacePlanBItem}
        onCompleteAndLoadPantry={handleCompleteAndLoadPantry}
      />
    </div>
  );
}

export default PlannerAndShoppingView;
