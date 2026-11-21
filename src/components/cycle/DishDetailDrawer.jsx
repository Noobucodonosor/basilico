import React, { useEffect, useRef, useState } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

function formatEuro(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '€ 0,00';
  return `€ ${num.toFixed(2).replace('.', ',')}`;
}

export function DishDetailDrawer({
  dish,
  activeProfileId = 'ospiti',
  onClose,
  onAddToShoppingList
}) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addedCount, setAddedCount] = useState(0);
  const [addError, setAddError] = useState('');
  const panelRef = useRef(null);

  useDialogA11y({
    isOpen: Boolean(dish),
    containerRef: panelRef,
    onClose
  });

  useEffect(() => {
    if (!dish?.dishId) {
      setSession(null);
      setAddedCount(0);
      setAddError('');
      return;
    }

    let active = true;
    setLoading(true);
    setAddedCount(0);
    setAddError('');
    const params = new URLSearchParams({
      profileId: activeProfileId || 'ospiti',
      servings: '1'
    });
    fetch(`/api/recipes/${encodeURIComponent(dish.dishId)}/cooking-session?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) setSession(data);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dish?.dishId, activeProfileId]);

  if (!dish) return null;

  const evaluatedDish = session?.dish || null;
  const bom = Array.isArray(evaluatedDish?.bom) ? evaluatedDish.bom : [];
  const steps = Array.isArray(session?.scientificSteps) ? session.scientificSteps : [];
  const homeCost = evaluatedDish?.costAndArbitrage?.purePortionCostEur ?? dish.purePortionCostEur;
  const restaurantPrice = evaluatedDish?.costAndArbitrage?.totalMenuPriceEur ?? dish.menuPriceEuro;
  const prepMinutes = Math.round(
    dish.totalHandsOnMinutes || evaluatedDish?.prepMinutes || 20
  );
  const nutrition = evaluatedDish?.nutritionPerServing || dish.nutritionSummary || {};

  const handleAddIngredients = async () => {
    if (!onAddToShoppingList || bom.length === 0 || isAdding) return;
    setIsAdding(true);
    setAddError('');
    let succeeded = 0;

    for (const item of bom) {
      const ok = await onAddToShoppingList({
        name: item.matchedOffer?.title || item.name,
        category: 'Spesa Ricetta',
        quantityLabel: item.rawGramsTotal ? `${Math.round(item.rawGramsTotal)} g` : '1 pz',
        storeId: item.matchedOffer?.storeId || null,
        storeName: item.matchedOffer?.storeName || null,
        unitPrice: item.linePureCostEur || null
      });
      if (ok !== false) {
        succeeded += 1;
      }
    }

    setIsAdding(false);
    if (succeeded === 0) {
      setAddError('Impossibile aggiungere gli ingredienti alla lista. Riprova.');
    } else if (succeeded < bom.length) {
      setAddedCount(succeeded);
      setAddError(`Aggiunti ${succeeded} ingredienti su ${bom.length}; alcuni non sono stati salvati.`);
    } else {
      setAddedCount(succeeded);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#141A17]/50 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-6 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label={dish.cleanTitle || dish.title}
      data-testid="dish-detail-drawer"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[90dvh] overflow-y-auto shadow-2xl focus:outline-none"
      >
        {/* Sticky Top Header */}
        <div className="sticky top-0 z-10 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E5E2DA] px-6 py-5 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#1B5E3A]">
              {prepMinutes} minuti
              {dish.restaurantName ? ` · Ispirato a ${dish.restaurantName}` : ''}
            </p>
            <h2 className="font-editorial text-2xl sm:text-3xl font-normal text-[#141A17] leading-tight">
              {dish.cleanTitle || dish.title}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Chiudi scheda piatto"
            className="p-2 rounded-full text-[#575E58] hover:text-[#141A17] hover:bg-[#F3F1EC] cursor-pointer shrink-0"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Cost Comparison + Primary Action */}
          <div className="bg-white border border-[#E5E2DA] rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-baseline gap-6">
              <div>
                <p className="text-xs text-[#575E58]">A casa per porzione</p>
                <p className="text-2xl font-semibold text-[#141A17] tabular-nums">
                  {formatEuro(homeCost)}
                </p>
              </div>
              {restaurantPrice > homeCost && (
                <div className="border-l border-[#E5E2DA] pl-6">
                  <p className="text-xs text-[#575E58]">Al ristorante</p>
                  <p className="text-base font-medium text-[#575E58] tabular-nums line-through">
                    {formatEuro(restaurantPrice)}
                  </p>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={handleAddIngredients}
              disabled={loading || bom.length === 0 || isAdding || addedCount === bom.length && addedCount > 0}
              className="px-5 py-2.5 rounded-full bg-[#1B5E3A] hover:bg-[#14492D] disabled:opacity-60 text-white text-sm font-medium taste-btn cursor-pointer shrink-0"
            >
              {isAdding
                ? 'Salvataggio…'
                : addedCount > 0
                  ? `${addedCount} ingredienti aggiunti`
                  : 'Aggiungi ingredienti alla lista'}
            </button>
          </div>

          {addError && (
            <p className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5">
              {addError}
            </p>
          )}

          {dish.whyThisWins && (
            <p className="text-sm text-[#4A524C] leading-relaxed">
              {dish.whyThisWins}
            </p>
          )}

          {/* Real Ingredients Breakdown */}
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-[0.14em] text-[#575E58]">
              Ingredienti e prezzi a Rapallo
            </h3>

            {loading ? (
              <p className="text-sm text-[#575E58] py-4">Caricamento ingredienti e costi...</p>
            ) : bom.length === 0 ? (
              <p className="text-sm text-[#575E58] py-2">Lista ingredienti non disponibile per questo piatto.</p>
            ) : (
              <ul className="bg-white border border-[#E5E2DA] rounded-2xl divide-y divide-[#E5E2DA]">
                {bom.map((item, idx) => (
                  <li key={`${item.name}-${idx}`} className="px-4 py-3 flex items-center justify-between gap-4 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium text-[#141A17] truncate">{item.name}</p>
                      <p className="text-xs text-[#575E58] truncate">
                        {item.rawGramsTotal ? `${Math.round(item.rawGramsTotal)} g` : 'q.b.'}
                        {item.matchedOffer?.storeName ? ` · In offerta da ${item.matchedOffer.storeName}` : ''}
                      </p>
                    </div>
                    <span className="text-sm font-medium text-[#141A17] tabular-nums shrink-0">
                      {formatEuro(item.linePureCostEur)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Expandable Optional Details (Collapsed by Default) */}
          <div className="space-y-2.5">
            <details className="group bg-white border border-[#E5E2DA] rounded-2xl overflow-hidden">
              <summary className="px-5 py-3.5 text-sm font-medium text-[#141A17] cursor-pointer list-none flex items-center justify-between hover:bg-[#FAF9F6]">
                <span>Preparazione passo dopo passo</span>
                <span className="text-xs text-[#575E58] group-open:hidden">Mostra</span>
                <span className="text-xs text-[#575E58] hidden group-open:inline">Nascondi</span>
              </summary>
              <div className="px-5 pb-5 pt-2 border-t border-[#E5E2DA] space-y-3">
                {steps.length === 0 ? (
                  <p className="text-sm text-[#575E58]">Passaggi di preparazione in caricamento.</p>
                ) : (
                  <ol className="space-y-3">
                    {steps.map((st, idx) => (
                      <li key={st.stepNumber || idx} className="text-sm text-[#4A524C] leading-relaxed">
                        <p className="font-medium text-[#141A17]">
                          {st.stepNumber || idx + 1}. {st.title}
                        </p>
                        {st.instructions && <p className="mt-0.5 text-xs text-[#575E58]">{st.instructions}</p>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </details>

            <details className="group bg-white border border-[#E5E2DA] rounded-2xl overflow-hidden">
              <summary className="px-5 py-3.5 text-sm font-medium text-[#141A17] cursor-pointer list-none flex items-center justify-between hover:bg-[#FAF9F6]">
                <span>Valori nutrizionali (CREA)</span>
                <span className="text-xs text-[#575E58] group-open:hidden">Mostra</span>
                <span className="text-xs text-[#575E58] hidden group-open:inline">Nascondi</span>
              </summary>
              <div className="px-5 pb-5 pt-3 border-t border-[#E5E2DA] space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                    <p className="text-[11px] text-[#575E58]">Energia</p>
                    <p className="text-sm font-semibold text-[#141A17] tabular-nums">
                      {nutrition.energyKcal ?? '—'} kcal
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                    <p className="text-[11px] text-[#575E58]">Proteine</p>
                    <p className="text-sm font-semibold text-[#141A17] tabular-nums">
                      {nutrition.proteinG ?? '—'} g
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                    <p className="text-[11px] text-[#575E58]">Carboidrati</p>
                    <p className="text-sm font-semibold text-[#141A17] tabular-nums">
                      {nutrition.carbsG ?? '—'} g
                    </p>
                  </div>
                  <div className="p-2.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA]">
                    <p className="text-[11px] text-[#575E58]">Grassi</p>
                    <p className="text-sm font-semibold text-[#141A17] tabular-nums">
                      {nutrition.lipidsG ?? '—'} g
                    </p>
                  </div>
                </div>
                {dish.nutritionSummary?.highlights?.length > 0 && (
                  <p className="text-xs text-[#575E58] leading-relaxed">
                    {dish.nutritionSummary.highlights[0]}
                  </p>
                )}
              </div>
            </details>

            <details className="group bg-white border border-[#E5E2DA] rounded-2xl overflow-hidden">
              <summary className="px-5 py-3.5 text-sm font-medium text-[#141A17] cursor-pointer list-none flex items-center justify-between hover:bg-[#FAF9F6]">
                <span>Pentola e cottura</span>
                <span className="text-xs text-[#575E58] group-open:hidden">Mostra</span>
                <span className="text-xs text-[#575E58] hidden group-open:inline">Nascondi</span>
              </summary>
              <div className="px-5 pb-5 pt-3 border-t border-[#E5E2DA] space-y-2 text-xs text-[#575E58] leading-relaxed">
                {dish.fiveSoulsChain?.strumenti && <p>{dish.fiveSoulsChain.strumenti}</p>}
                {dish.fiveSoulsChain?.casa && <p>{dish.fiveSoulsChain.casa}</p>}
              </div>
            </details>
          </div>
        </div>
      </div>
    </div>
  );
}

export default DishDetailDrawer;
