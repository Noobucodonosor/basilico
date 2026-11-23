import React, { useState, useEffect } from 'react';

export function CreaFoodModal({
  foodId,
  activeProfileId = 'casa',
  isOpen,
  onClose,
  onSelectOfferStore,
  onSearchMarketOffer
}) {
  const [sheet, setSheet] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState('100g_edible');
  const [customGrams, setCustomGrams] = useState(100);
  const [cookingState, setCookingState] = useState('as_is');
  const [per100gCooked, setPer100gCooked] = useState(false);
  const [activeSection, setActiveSection] = useState('ALL');

  // Reset calculation controls when inspecting a different food
  useEffect(() => {
    setMode('100g_edible');
    setCustomGrams(100);
    setCookingState('as_is');
    setPer100gCooked(false);
    setActiveSection('ALL');
  }, [foodId]);

  // Close modal on Escape key
  useEffect(() => {
    if (!isOpen) return undefined;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen || !foodId) return undefined;
    const controller = new AbortController();
    setLoading(true);
    const effectivePer100gCooked = mode === '100g_edible' && cookingState === 'cooked_from_raw' && per100gCooked;
    const params = new URLSearchParams({
      mode,
      grams: String(customGrams || 100),
      state: cookingState,
      per100gCooked: String(effectivePer100gCooked)
    });
    if (activeProfileId) {
      params.set('profileId', activeProfileId);
    }
    fetch(`/api/crea/foods/${encodeURIComponent(foodId)}?${params.toString()}`, {
      signal: controller.signal
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && !controller.signal.aborted) setSheet(data);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [foodId, activeProfileId, isOpen, mode, customGrams, cookingState, per100gCooked]);

  if (!isOpen || !foodId) return null;

  const sectionNames = sheet?.sections ? Object.keys(sheet.sections) : [];

  return (
    <div
      className="fixed inset-0 z-50 bg-[#141A17]/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="crea-modal-title"
    >
      <div className="bg-white rounded-2xl border border-[#E5E2DA] max-w-4xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-[#141A17] text-white flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider bg-[#1B5E3A] rounded">
                CREA #{sheet?.id || foodId}
              </span>
              {sheet?.category && (
                <span className="px-2 py-0.5 text-[10px] font-semibold bg-[#242D28] text-[#FAF9F6] rounded border border-[#38433D]">
                  {sheet.category}
                </span>
              )}
              <span className="text-[11px] text-[#D7D4CC]">
                Parte edibile: <strong>{sheet?.ediblePartPct ?? 100}%</strong> • Porzione LARN: <strong>{sheet?.defaultPortionG ?? 100} g</strong>
              </span>
            </div>
            <h2 id="crea-modal-title" className="text-lg sm:text-xl font-extrabold mt-1">
              {sheet?.name || 'Caricamento scheda CREA...'}
            </h2>
            {(sheet?.scientificName || sheet?.nameEn) && (
              <p className="text-xs text-[#D7D4CC] italic mt-0.5">
                {sheet.scientificName ? `${sheet.scientificName} ` : ''}
                {sheet.nameEn ? `(${sheet.nameEn})` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {onSearchMarketOffer && sheet?.name && (
              <button
                type="button"
                onClick={() => onSearchMarketOffer(sheet.name)}
                className="px-2.5 py-1.5 rounded-lg bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-bold cursor-pointer transition-colors"
                title="Cerca offerte compatibili nei 14 negozi di Rapallo"
              >
                🏪 Cerca a Rapallo →
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="text-slate-300 hover:text-white p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 cursor-pointer shrink-0"
              aria-label="Chiudi scheda CREA"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Dynamic Calculation Controls (100g edibili / 100g lordi / LARN / grammi liberi + Crudo/Cotto) */}
        <div className="p-3.5 bg-slate-50 border-b border-slate-200 space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs font-bold text-slate-700 mr-1">Base calcolo:</span>
              {[
                { id: '100g_edible', label: '100 g Edibili (Standard)' },
                { id: '100g_gross', label: `100 g Lordi Acquistati (${sheet?.ediblePartPct ?? 100}% ed.)` },
                { id: 'portion_larn', label: `Porzione LARN (${sheet?.defaultPortionG ?? 100} g)` },
                { id: 'custom_grams', label: 'Grammi Liberi' }
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setMode(opt.id);
                    if (opt.id !== '100g_edible') {
                      setPer100gCooked(false);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                    mode === opt.id
                      ? 'bg-emerald-700 text-white border-emerald-700'
                      : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              {mode === 'custom_grams' && (
                <input
                  type="number"
                  min="1"
                  max="5000"
                  value={customGrams}
                  onChange={(e) => setCustomGrams(Math.max(1, parseInt(e.target.value || '100', 10)))}
                  className="w-20 text-xs font-bold border border-emerald-500 rounded-lg px-2 py-1 bg-white"
                  aria-label="Grammi personalizzati"
                />
              )}
            </div>

            {/* Physical Raw <-> Cooked Switch */}
            {sheet?.yieldFactor && sheet.yieldFactor.multiplier !== 1.0 && (
              <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg">
                <label className="inline-flex items-center gap-1.5 text-xs font-bold text-amber-900 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={cookingState === 'cooked_from_raw'}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCookingState(checked ? 'cooked_from_raw' : 'as_is');
                      if (!checked) setPer100gCooked(false);
                    }}
                    className="rounded border-amber-400 text-amber-600"
                  />
                  <span>🔥 Converti in Cotto (Resa Y={sheet.yieldFactor.multiplier}x)</span>
                </label>
                {cookingState === 'cooked_from_raw' && mode === '100g_edible' && (
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800 border-l border-amber-300 pl-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={per100gCooked}
                      onChange={(e) => setPer100gCooked(e.target.checked)}
                      className="rounded border-amber-400 text-amber-600"
                    />
                    <span>per 100 g di cotto</span>
                  </label>
                )}
              </div>
            )}
          </div>

          {sheet?.calculationContext && (
            <div className="flex flex-wrap items-center justify-between text-[11px] text-slate-600">
              <span>
                Peso edibile crudo di partenza: <strong>{sheet.calculationContext.effectiveEdibleGramsRaw} g</strong>
                {sheet.yieldFactor?.multiplier !== 1.0 && (
                  <>
                    {' '}→ Peso cotto risultante nel piatto: <strong>{sheet.calculationContext.resultingCookedWeightGrams} g</strong> ({sheet.yieldFactor.method})
                    {sheet.calculationContext.per100gCooked && (
                      <span className="ml-1 text-amber-800 font-bold">• Valori riferiti a 100 g di cotto</span>
                    )}
                  </>
                )}
              </span>
              <span>
                Totale parametri certificati: <strong>{sheet.totalValuesCount}</strong> (0 troncamenti)
              </span>
            </div>
          )}

          {/* Section Filter Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pt-1 no-scrollbar">
            <button
              type="button"
              onClick={() => setActiveSection('ALL')}
              className={`px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                activeSection === 'ALL' ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
              }`}
            >
              Tutte le {sectionNames.length} Sezioni ({sheet?.totalValuesCount || 0})
            </button>
            {sectionNames.map((sec) => (
              <button
                key={sec}
                type="button"
                onClick={() => setActiveSection(sec)}
                className={`px-2.5 py-1 rounded text-[11px] font-bold whitespace-nowrap cursor-pointer ${
                  activeSection === sec ? 'bg-slate-900 text-white' : 'bg-white text-slate-600 border border-slate-200'
                }`}
              >
                {sec} ({sheet.sections[sec].length})
              </button>
            ))}
          </div>
        </div>

        {/* Body: 7 Complete Sections + Matching Rapallo Offers */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5">
          {loading ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Caricamento dei {sheet?.totalValuesCount || ''} valori chimico-nutrizionali CREA...
            </div>
          ) : (
            <>
              {/* Matching Rapallo Supermarket Offers Bridge */}
              {(() => {
                const visibleOffers = (sheet?.matchingRapalloOffers || []).filter(
                  (off) => off.profileCompatibility?.action !== 'hide'
                );
                if (visibleOffers.length === 0) return null;
                return (
                  <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 space-y-2">
                    <div className="text-xs font-extrabold text-emerald-900">
                      🏪 Offerte Attive a Rapallo collegate a questo alimento CREA ({visibleOffers.length}):
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {visibleOffers.map((off) => {
                        const flagged = off.profileCompatibility && off.profileCompatibility.isCompatible === false;
                        return (
                          <div
                            key={off.id}
                            className={`p-2.5 rounded-lg bg-white border flex items-center justify-between gap-2 text-xs ${
                              flagged ? 'border-amber-300 opacity-85' : 'border-emerald-200'
                            }`}
                          >
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 truncate">
                                {off.title}
                                {flagged && (
                                  <span className="ml-1.5 text-[10px] text-amber-700 font-bold">⚠️ Profilo</span>
                                )}
                              </div>
                              <div className="text-[11px] text-slate-500">
                                {off.brand} • <strong>€ {Number(off.promoPrice).toFixed(2)}</strong> ({off.formattedNormalizedPrice || off.unitPrice || 'prezzo cassa'})
                              </div>
                            </div>
                            {onSelectOfferStore && (
                              <button
                                type="button"
                                onClick={() => {
                                  onClose();
                                  onSelectOfferStore(off.storeId, off.title);
                                }}
                                className="px-2 py-1 bg-emerald-700 text-white rounded text-[11px] font-bold shrink-0 cursor-pointer"
                              >
                                Vai in Stanza 1 →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Academic Nutrient Tables */}
              {sectionNames
                .filter((sec) => activeSection === 'ALL' || activeSection === sec)
                .map((secName) => {
                  const rows = sheet.sections[secName] || [];
                  return (
                    <div key={secName} className="border border-slate-200 rounded-xl overflow-hidden">
                      <div className="bg-slate-100 px-3.5 py-2 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wide">
                          {secName}
                        </h3>
                        <span className="text-[11px] text-slate-500 font-medium">
                          {rows.length} parametri
                        </span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] text-slate-500 bg-slate-50/50">
                              <th className="py-2 px-3 font-semibold">Componente Nutrizionale</th>
                              <th className="py-2 px-3 font-semibold text-right">Valore Calcolato</th>
                              <th className="py-2 px-3 font-semibold text-right">100g Tabella CREA</th>
                              <th className="py-2 px-3 font-semibold text-right">% VNR Giornaliero</th>
                              <th className="py-2 px-3 font-semibold text-center">Fonte</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {rows.map((r, i) => (
                              <tr key={i} className="hover:bg-slate-50/80">
                                <td className="py-1.5 px-3 font-medium text-slate-800">
                                  {r.component}
                                  {r.isRelativeFraction && (
                                    <span className="ml-1.5 text-[10px] text-[#1B5E3A] bg-[#F3F1EC] px-1.5 py-0.5 rounded border border-[#DFDCD2]">
                                      frazione invariante
                                    </span>
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-right font-bold text-[#1B5E3A]">
                                  {r.displayValue}
                                </td>
                                <td className="py-1.5 px-3 text-right text-[#575E58]">
                                  {r.value100gRaw ?? 'n.d.'}
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  {r.vnrPct !== null ? (
                                    <span className="inline-block px-1.5 py-0.5 rounded bg-[#F3F1EC] text-[#1B5E3A] font-bold text-[10px] border border-[#DFDCD2]">
                                      {r.vnrPct}% VNR
                                    </span>
                                  ) : (
                                    <span className="text-[#9AA09B]">—</span>
                                  )}
                                </td>
                                <td className="py-1.5 px-3 text-center text-[10px] text-slate-400" title={r.bibliographicRef || ''}>
                                  {r.sourceCode || '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
            </>
          )}
        </div>

        {/* Footer with official link and LanguaL codes */}
        <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
          <div className="truncate max-w-xl" title={sheet?.langualCodes || ''}>
            {sheet?.langualCodes ? `Codici LanguaL: ${sheet.langualCodes}` : 'Fonte: Tabelle di Composizione degli Alimenti CREA'}
          </div>
          {sheet?.officialUrl && (
            <a
              href={sheet.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="text-emerald-700 font-bold hover:underline shrink-0"
            >
              Scheda ufficiale alimentinutrizione.it ↗
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreaFoodModal;
