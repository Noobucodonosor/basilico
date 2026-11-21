import React, { useState } from 'react';

export function AisleChecklistModal({
  isOpen,
  shoppingList,
  onClose,
  onToggleItem,
  onRemoveItem,
  onReplacePlanB,
  onCompleteAndLoadPantry
}) {
  const [planBData, setPlanBData] = useState(null);
  const [loadingPlanBId, setLoadingPlanBId] = useState(null);
  const [copiedMsg, setCopiedMsg] = useState('');

  if (!isOpen || !shoppingList) return null;

  const handleFetchPlanB = async (itemId) => {
    setLoadingPlanBId(itemId);
    try {
      const res = await fetch(`/api/shopping-list/items/${encodeURIComponent(itemId)}/plan-b`);
      if (res.ok) {
        const data = await res.json();
        setPlanBData(data);
      }
    } finally {
      setLoadingPlanBId(null);
    }
  };

  const handleCopyWhatsapp = async () => {
    try {
      await navigator.clipboard.writeText(shoppingList.whatsappExportText || '');
      setCopiedMsg('Lista copiata negli appunti per WhatsApp / Telegram!');
      setTimeout(() => setCopiedMsg(''), 3000);
    } catch (_) {
      setCopiedMsg('Testo pronto per copia manuale.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/85 overflow-y-auto p-3 sm:p-6 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Modalità In Corsia per Reparti"
    >
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden">
        {/* Top Sticky Header */}
        <div className="bg-slate-900 text-white px-5 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500 text-slate-950">
              Modalità In Corsia · Spunta col Pollice
            </span>
            <h2 className="text-lg font-extrabold mt-1">
              🛒 Carrello Live per Reparti a Rapallo ({shoppingList.subtotals.checkedItemsCount}/
              {shoppingList.subtotals.totalItemsCount} spuntati)
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleCopyWhatsapp}
              className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#1B5E3A] hover:bg-[#14472C] text-white cursor-pointer"
            >
              📲 Copia WhatsApp / Telegram
            </button>
            <button
              type="button"
              onClick={onCompleteAndLoadPantry}
              className="px-3 py-1.5 rounded-lg text-xs font-extrabold bg-[#9A5B25] hover:bg-[#7F4A1D] text-white cursor-pointer"
            >
              ✅ Spunta tutto e carica in Dispensa
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[#242D28] hover:bg-[#323D37] text-[#FAF9F6] cursor-pointer"
            >
              ✕ Chiudi
            </button>
          </div>
        </div>

        {copiedMsg && (
          <div className="bg-[#1B5E3A] text-white text-xs font-bold px-5 py-2 text-center">
            {copiedMsg}
          </div>
        )}

        <div className="p-5 space-y-5">
          {/* Subtotals Bar */}
          <div className="grid grid-cols-3 gap-3 p-3.5 rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] text-xs">
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Subtotale Alimentari</div>
              <div className="text-base font-extrabold text-emerald-800">
                €{Number(shoppingList.subtotals.foodSubtotalEur || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Casa & Sottolavello</div>
              <div className="text-base font-extrabold text-sky-800">
                €{Number(shoppingList.subtotals.homeAndKitchenSubtotalEur || 0).toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 font-bold uppercase">Nel Carrello / Totale</div>
              <div className="text-base font-extrabold text-slate-900">
                €{Number(shoppingList.subtotals.checkedTotalEur || 0).toFixed(2)} / €
                {Number(shoppingList.subtotals.grandTotalEur || 0).toFixed(2)}
              </div>
            </div>
          </div>

          {/* Plan B Shelf Substitute Alert if open */}
          {planBData && (
            <div className="p-4 rounded-xl bg-amber-50 border border-amber-300 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-amber-950">
                  🔄 Piano B sullo Scaffale per: {planBData.originalItem.name}
                </span>
                <button
                  type="button"
                  onClick={() => setPlanBData(null)}
                  className="text-amber-900 font-bold cursor-pointer"
                >
                  ✕ Chiudi Piano B
                </button>
              </div>
              <div className="space-y-1.5">
                {planBData.planBAlternatives.map((alt) => (
                  <div
                    key={alt.offerId}
                    className="p-2.5 rounded-lg bg-white border border-amber-200 flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{alt.title}</div>
                      <div className="text-[10px] text-slate-500">{alt.rationale}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="text-right font-extrabold text-emerald-700">
                        €{Number(alt.price || 0).toFixed(2)} ({alt.chainName})
                      </div>
                      {onReplacePlanB && (
                        <button
                          type="button"
                          onClick={async () => {
                            await onReplacePlanB(planBData.originalItem.id, alt);
                            setPlanBData(null);
                          }}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-extrabold bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer"
                        >
                          ✓ Sostituisci nel carrello
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Aisles List */}
          <div className="space-y-4">
            {(shoppingList.byAisle || []).map((grp) => (
              <section key={grp.id} className="space-y-2">
                <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-700 bg-slate-100 px-3 py-1.5 rounded-lg">
                  {grp.icon} {grp.label}
                </h3>
                <div className="space-y-2">
                  {grp.items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex flex-wrap items-center justify-between gap-2 p-3 rounded-xl border transition-all ${
                        item.checked
                          ? 'bg-emerald-50/70 border-emerald-300 text-slate-500 line-through'
                          : 'bg-white border-slate-200 text-slate-900'
                      }`}
                    >
                      <label className="flex items-start gap-3 cursor-pointer flex-1">
                        <input
                          type="checkbox"
                          checked={Boolean(item.checked)}
                          onChange={() => onToggleItem && onToggleItem(item.id)}
                          className="mt-1 w-4 h-4 rounded accent-[#1B5E3A]"
                        />
                        <div>
                          <div className="text-sm font-extrabold">{item.name}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.domain && item.domain !== 'food_human' ? (
                              <>
                                <strong>{item.packsToBuy} {item.packsToBuy === 1 ? 'pezzo' : 'pezzi'}</strong>
                                {' • Insegna: '}
                                <strong>{item.preferredChain}</strong>
                              </>
                            ) : (
                              <>
                                <strong>{item.packsToBuy} conf. intere</strong> ({item.totalPurchasedGrams}g acquistati ·
                                usati {item.totalRequiredGrams}g
                                {item.residualReturnedToPantryGrams > 0
                                  ? ` → +${item.residualReturnedToPantryGrams}g rientrano in Dispensa`
                                  : ''}
                                ) • Insegna: <strong>{item.preferredChain}</strong>
                              </>
                            )}
                          </div>
                        </div>
                      </label>

                      <div className="flex items-center gap-2">
                        <span className="text-sm font-extrabold text-emerald-800">
                          €{Number(item.lineTotalEur || 0).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleFetchPlanB(item.id)}
                          className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-amber-100 hover:bg-amber-200 text-amber-900 cursor-pointer"
                        >
                          {loadingPlanBId === item.id ? '...' : '🔄 Piano B Scaffale'}
                        </button>
                        {onRemoveItem && (
                          <button
                            type="button"
                            onClick={() => onRemoveItem(item.id)}
                            title="Rimuovi articolo dalla lista spesa"
                            aria-label={`Rimuovi ${item.name}`}
                            className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 cursor-pointer"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AisleChecklistModal;
