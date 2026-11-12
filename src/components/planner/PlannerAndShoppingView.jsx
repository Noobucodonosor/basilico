import React, { useState, useEffect, useCallback } from 'react';
import AisleChecklistModal from './AisleChecklistModal.jsx';

const DAY_MODE_OPTIONS = [
  { id: 'land_day', label: '🏠 Giornata a Terra (Casa)' },
  { id: 'boat_day', label: '⛵ Giornata in Barca (Borsa Termica)' },
  { id: 'eat_out', label: '🍽️ Fuori a Pranzo/Cena' }
];

export function PlannerAndShoppingView({ activeProfileId, onShoppingListChange }) {
  const [models, setModels] = useState([]);
  const [selectedModelId, setSelectedModelId] = useState('promo_driven_neodiet');
  const [budgetEur, setBudgetEur] = useState(80);
  const [servings, setServings] = useState(1);
  const [dayModes, setDayModes] = useState([
    'land_day',
    'land_day',
    'land_day',
    'land_day',
    'boat_day',
    'boat_day',
    'land_day'
  ]);

  const [plan, setPlan] = useState(null);
  const [shoppingList, setShoppingList] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isAisleModalOpen, setIsAisleModalOpen] = useState(false);
  const [manualItemName, setManualItemName] = useState('');
  const [manualItemDomain, setManualItemDomain] = useState('food_human');
  const [manualItemPrice, setManualItemPrice] = useState('2.50');
  const [statusToast, setStatusToast] = useState('');

  useEffect(() => {
    fetch('/api/planner/models')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.models) setModels(data.models);
      });
  }, []);

  const generatePlan = useCallback(
    (overrideModes = null) => {
      setLoading(true);
      fetch('/api/planner/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          modelId: selectedModelId,
          daysCount: 7,
          servings,
          budgetEur: Number(budgetEur) || 65,
          dayModes: overrideModes || dayModes,
          profileId: activeProfileId || 'dany'
        })
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) {
            setPlan(data.plan);
            setShoppingList(data.shoppingList);
            if (onShoppingListChange) {
              onShoppingListChange(data.shoppingList?.subtotals?.totalItemsCount || 0);
            }
          }
        })
        .finally(() => setLoading(false));
    },
    [selectedModelId, servings, budgetEur, dayModes, activeProfileId, onShoppingListChange]
  );

  useEffect(() => {
    generatePlan();
  }, [generatePlan]);

  const handleDayModeChange = (idx, newMode) => {
    const updated = [...dayModes];
    updated[idx] = newMode;
    setDayModes(updated);
    generatePlan(updated);
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
    const res = await fetch('/api/shopping-list/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: manualItemName,
        domain: manualItemDomain,
        unitPriceEur: Number(manualItemPrice) || 2.5
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
      setStatusToast(
        `✅ Spesa completata: ${data.loadedCount} confezioni intere caricate automaticamente nella tua Dispensa a 3 Luoghi!`
      );
      setTimeout(() => setStatusToast(''), 4000);
    }
  };

  return (
    <div className="space-y-6">
      {/* Room 6 Hero Header */}
      <section className="bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-950 text-white rounded-2xl p-5 sm:p-6 shadow-md">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold uppercase tracking-wider bg-emerald-400 text-slate-950">
                Stanza 6 · ADR-0012 · Vertice Bottom-Up
              </span>
              <span className="text-xs text-emerald-300 font-semibold">
                6 Modelli Neo-Dieta • Giorni Barca/Terra • Confezioni Intere Zero-Spreco (K_p = ⌈Q_p / S_p⌉)
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
              🗓️ Pianificatore Settimanale &quot;Neo-Dieta&quot; & Lista Spesa Multi-Negozio a Rapallo
            </h1>
            <p className="text-xs sm:text-sm text-slate-300 max-w-3xl">
              Priorità automatica ai freschi aperti in frigo (T_open), concatenazione di confezioni intere tra più pasti, budget onesto (sostituisce intere ricette senza mai cancellare singoli ingredienti) e simulatore 1 vs 2 vs 3 negozi a Rapallo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsAisleModalOpen(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-sm cursor-pointer"
            >
              🛒 Apri Modalità &quot;In Corsia&quot; ({shoppingList?.subtotals?.totalItemsCount || 0} art.)
            </button>
            <button
              type="button"
              onClick={handleCompleteAndLoadPantry}
              className="px-3.5 py-2.5 rounded-xl text-xs font-extrabold bg-amber-400 hover:bg-amber-300 text-slate-950 cursor-pointer"
            >
              ✅ Spunta tutto e carica in Dispensa
            </button>
          </div>
        </div>
      </section>

      {statusToast && (
        <div className="p-3.5 rounded-xl bg-emerald-600 text-white text-xs font-extrabold text-center shadow-xs">
          {statusToast}
        </div>
      )}

      {/* 6 Neo-Dieta Models Selector */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-extrabold text-slate-900">
            🧭 1. Scegli il Modello Settimanale &quot;Neo-Dieta&quot; (6 Archetipi Immediati)
          </h2>
          <div className="flex items-center gap-3">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Budget Cassa Settimanale (€):</span>
              <input
                type="number"
                min="20"
                max="300"
                value={budgetEur}
                onChange={(e) => setBudgetEur(Number(e.target.value))}
                className="w-20 text-xs font-extrabold border border-slate-300 rounded-lg px-2 py-1 text-slate-900"
              />
            </label>
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <span>Persone:</span>
              <select
                value={servings}
                onChange={(e) => setServings(Number(e.target.value))}
                className="text-xs font-extrabold border border-slate-300 rounded-lg px-2 py-1 text-slate-900"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'Single' : 'Pers.'}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {models.map((m) => {
            const isSel = selectedModelId === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setSelectedModelId(m.id)}
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

      {loading || !plan ? (
        <div className="p-8 text-center text-sm text-slate-500">
          Generazione piano settimanale a confezioni intere zero-spreco...
        </div>
      ) : (
        <>
          {/* Summary KPI Bar */}
          <section className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Scontrino Cassa Confezioni Intere</div>
              <div className="text-xl font-extrabold text-emerald-700 mt-1">
                €{plan.ledger.totalCheckoutCashEur.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">
                Budget: €{plan.budgetEur} ({plan.withinBudget ? '✓ Rispettato' : 'Soglia minima'})
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Valore Grammi Puri Consumati</div>
              <div className="text-xl font-extrabold text-slate-900 mt-1">
                €{plan.ledger.totalPureConsumedValueEur.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500">Il resto rientra tracciato in Dispensa</div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Equivalente Menu Ristoranti</div>
              <div className="text-xl font-extrabold text-indigo-800 mt-1">
                €{plan.ledger.totalMenuEquivalentEur.toFixed(2)}
              </div>
              <div className="text-[11px] text-emerald-700 font-bold">
                Risparmio Arbitraggio: €{plan.ledger.totalArbitrageSavingsEur.toFixed(2)}
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs">
              <div className="text-[11px] font-bold text-slate-500 uppercase">Freschi Aperti Prioritizzati</div>
              <div className="text-xl font-extrabold text-amber-700 mt-1">
                {plan.openedPerishablesPrioritized.length} confezioni
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
                          className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
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
                              className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                            >
                              🔄 Cambia piatto
                            </button>
                          </div>
                          <div className="text-xs font-extrabold text-slate-900">{day.lunch.dish.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Porzione: €{day.lunch.dish.costAndArbitrage.purePortionCostEur.toFixed(2)}</span>
                            <span>• {day.lunch.dish.nutritionPerServing.energyKcal} kcal</span>
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
                              className="text-[10px] font-bold text-indigo-700 hover:underline cursor-pointer"
                            >
                              🔄 Cambia piatto
                            </button>
                          </div>
                          <div className="text-xs font-extrabold text-slate-900">{day.dinner.dish.title}</div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-slate-500">
                            <span>Porzione: €{day.dinner.dish.costAndArbitrage.purePortionCostEur.toFixed(2)}</span>
                            <span>• {day.dinner.dish.nutritionPerServing.energyKcal} kcal</span>
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
              {plan.ledger.wholePackItems.slice(0, 12).map((wp) => (
                <div
                  key={wp.key}
                  className="p-3 rounded-xl border border-slate-200 bg-slate-50/70 text-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-slate-900">{wp.name}</span>
                    <span className="font-extrabold text-emerald-800">
                      {wp.packsToBuy} conf. × {wp.packSizeGrams}g = €{wp.checkoutCostEur.toFixed(2)}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-600">
                    Fabbisogno ricette: <strong>{wp.totalRequiredGrams}g</strong> • Da Dispensa:{' '}
                    <strong>{wp.fromPantryGrams}g</strong> • Acquistati: <strong>{wp.totalPurchasedGrams}g</strong> •
                    Residuo che rientra in Dispensa:{' '}
                    <strong className="text-indigo-700">{wp.residualReturnedToPantryGrams}g</strong>
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

          {/* Multi-Store Simulator in Rapallo (1 vs 2 vs 3 Stores) */}
          {shoppingList?.storeSimulations && (
            <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-amber-100 text-amber-900">
                    Logistica Reale Rapallo (16035 GE)
                  </span>
                  <h2 className="text-base font-extrabold text-slate-900 mt-1">
                    🏪 4. Simulatore Strategia di Spesa: 1 Solo Negozio vs 2 Negozi vs 3 Negozi a Rapallo
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setIsAisleModalOpen(true)}
                  className="px-3.5 py-2 rounded-xl text-xs font-extrabold bg-slate-900 text-white cursor-pointer"
                >
                  🛒 Apri Checklist In Corsia & Piano B
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {shoppingList.storeSimulations.map((sim, idx) => (
                  <div
                    key={sim.strategyId}
                    className={`p-4 rounded-xl border space-y-2 ${
                      idx === 1 ? 'bg-emerald-50/60 border-emerald-400 shadow-xs' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-slate-900">{sim.title}</span>
                      <span className="text-xs font-bold text-slate-600">🚶 ~{sim.estimatedTotalMinutes} min</span>
                    </div>
                    <div className="text-lg font-extrabold text-emerald-800">
                      €{sim.estimatedTotalEur.toFixed(2)}
                      {sim.savingsVsSingleEur > 0 && (
                        <span className="ml-2 text-xs font-bold text-emerald-600">
                          (Risparmi €{sim.savingsVsSingleEur.toFixed(2)})
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-700">
                      <strong>Tappe:</strong> {sim.storesVisited.join(' + ')}
                    </div>
                    <div className="text-[10px] text-amber-900 font-semibold">
                      💳 Carte: {sim.loyaltyCardsNeeded.join(' • ')}
                    </div>
                    <p className="text-[11px] text-slate-500">{sim.recommendation}</p>
                  </div>
                ))}
              </div>

              {/* Quick Add Extra Item (Food or Home Cleaning / Tigotà) */}
              <form
                onSubmit={handleAddManualItem}
                className="pt-3 border-t border-slate-200 flex flex-wrap items-center gap-2"
              >
                <span className="text-xs font-bold text-slate-700">
                  + Aggiungi articolo extra alla Lista Spesa:
                </span>
                <input
                  type="text"
                  placeholder="Es. Detersivo Piatti Neutro / Carta Forno / Caffè..."
                  value={manualItemName}
                  onChange={(e) => setManualItemName(e.target.value)}
                  className="flex-1 min-w-[200px] text-xs border border-slate-300 rounded-lg px-3 py-1.5"
                />
                <select
                  value={manualItemDomain}
                  onChange={(e) => setManualItemDomain(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 font-semibold"
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
                  className="w-20 text-xs border border-slate-300 rounded-lg px-2 py-1.5"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-extrabold rounded-lg cursor-pointer"
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
