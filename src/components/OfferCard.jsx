import React, { useEffect, useState } from 'react';

export function formatValidityBadge(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `Valido fino al ${day} ${months[date.getUTCMonth()]}`;
}

function formatShortStore(offer) {
  const rawStore = String(offer.storeFullName || offer.storeName || '')
    .replace(/\s*-\s*Rapallo.*$/i, '')
    .replace(/^Supermercati\s+/i, '')
    .replace(/\s+Discount$/i, '')
    .trim();
  const rawAddr = String(offer.storeAddress || '')
    .replace(/,?\s*16035\b/g, '')
    .replace(/,?\s*Rapallo.*$/i, '')
    .replace(/\bCorso\b/gi, 'C.so')
    .replace(/\bFratelli\b/gi, 'F.lli')
    .replace(/\bCristoforo\b/gi, 'C.')
    .replace(/\bGoffredo\b/gi, 'G.')
    .replace(/\bGiuseppe\b/gi, 'G.')
    .trim();
  if (rawStore && rawAddr) return `${rawStore} · ${rawAddr}`;
  return rawStore || rawAddr || 'Rapallo';
}

export function OfferCard({ offer, onOpenFlyer, onOpenCreaFood, onAddToShoppingList }) {
  const [addedToList, setAddedToList] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [cutoutScale, setCutoutScale] = useState(1);
  const [enhanceSharpen, setEnhanceSharpen] = useState(true);

  useEffect(() => {
    if (!detailOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setDetailOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [detailOpen]);

  const promoVal = Number(offer.promoPrice ?? offer.price ?? offer.discountPrice ?? 0);
  const origVal = offer.originalPrice != null ? Number(offer.originalPrice) : null;
  const hasDiscount = Boolean(origVal && origVal > promoVal);
  const discountText = hasDiscount
    ? `-${Math.round(((origVal - promoVal) / origVal) * 100)}%`
    : (offer.discountPercentage > 0 ? `-${offer.discountPercentage}%` : null);

  const promoFormatted = `€ ${promoVal.toFixed(2).replace('.', ',')}`;
  const originalFormatted = hasDiscount ? `€ ${origVal.toFixed(2).replace('.', ',')}` : null;
  const savingsFormatted = hasDiscount ? `€ ${(origVal - promoVal).toFixed(2).replace('.', ',')}` : null;
  const imageUrl = offer.imageUrl || '/images/placeholder_deal.svg';
  const validityText = formatValidityBadge(offer.validTo || offer.validityEnd);

  // Single unit/quantity line — never concatenate normalizedPriceText if quantityLabel already exists
  const unitLine = offer.quantityLabel || offer.formattedNormalizedPrice || offer.unitPrice || null;
  const isMemberOnly = Boolean(offer.isMemberOnly || offer.loyaltyCard?.requiredForPromo);
  const isFlaggedByProfile = offer.profileCompatibility && offer.profileCompatibility.isCompatible === false;
  const shortStore = formatShortStore(offer);

  const handleQuickAdd = async (e) => {
    e?.stopPropagation?.();
    if (!onAddToShoppingList) return;
    await onAddToShoppingList({
      name: offer.title,
      domain: offer.domain || 'food_human',
      source: 'promo_flyer',
      unitPriceEur: promoVal > 0 ? promoVal : 2.5,
      packSizeGrams:
        offer.drainedWeightGrams ||
        offer.packWeightGrams ||
        offer.referencePackEstimate?.estimatedPackGrams ||
        300,
      preferredChain: offer.storeName || shortStore,
      storeId: offer.storeId || null,
      onPromo: true,
      creaId: offer.creaMatch?.creaFoodId || null
    });
    setAddedToList(true);
  };

  const openModal = () => {
    setCutoutScale(1);
    setDetailOpen(true);
  };

  return (
    <>
      <article
        onClick={openModal}
        className={`bg-white rounded-2xl border p-4 flex flex-col justify-between gap-3 transition-shadow hover:shadow-md cursor-pointer min-w-0 overflow-hidden ${
          isFlaggedByProfile ? 'border-amber-300 bg-amber-50/20 opacity-85' : 'border-[#E5E2DA]'
        }`}
      >
        {/* Top: Clean Image + Exception-Only Badges */}
        <div className="space-y-2.5 min-w-0">
          <div className="relative aspect-square w-full bg-[#FAF9F6] rounded-xl overflow-hidden flex items-center justify-center p-2.5">
            <img
              src={imageUrl}
              alt={offer.title}
              loading="lazy"
              className="max-h-full max-w-full object-contain transition-transform duration-200 hover:scale-105"
              onError={(e) => {
                e.currentTarget.src = '/images/placeholder_deal.svg';
              }}
            />

            {discountText && (
              <span className="absolute top-2.5 right-2.5 bg-rose-600 text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-xs">
                {discountText}
              </span>
            )}

            {isMemberOnly && (
              <span className="absolute top-2.5 left-2.5 bg-amber-100 text-amber-950 border border-amber-300 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                Solo soci
              </span>
            )}
          </div>

          {/* Store + Title */}
          <div className="space-y-1 min-w-0">
            <p className="text-[11px] font-medium text-[#575E58] truncate" title={offer.storeAddress || shortStore}>
              {shortStore}
            </p>
            <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-[#141A17]" title={offer.title}>
              {offer.title}
            </h3>
          </div>
        </div>

        {/* Bottom: Primary Price + Single €/kg Line + 1 Primary Action */}
        <div className="space-y-2.5 pt-2 border-t border-[#F0EDE6] min-w-0">
          <div className="space-y-0.5 min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-xl font-bold text-[#1B5E3A] tracking-tight tabular-nums">
                {promoFormatted}
              </span>
              {hasDiscount && originalFormatted && (
                <span className="text-xs text-[#575E58] tabular-nums">
                  anziché <span className="line-through font-semibold text-rose-700">{originalFormatted}</span>
                </span>
              )}
            </div>
            {unitLine && (
              <p className="text-[11px] text-[#575E58] truncate tabular-nums" title={unitLine}>
                {unitLine}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openModal();
              }}
              className="text-xs font-medium text-[#575E58] hover:text-[#141A17] underline underline-offset-2 decoration-[#D5D0C5] cursor-pointer shrink-0"
            >
              Dettagli & zoom
            </button>

            {onAddToShoppingList && !offer.isNamelessTile && (
              <button
                type="button"
                onClick={handleQuickAdd}
                className={`px-3 py-1.5 rounded-full font-semibold text-xs border transition-colors cursor-pointer shrink-0 ${
                  addedToList
                    ? 'bg-[#1B5E3A] text-white border-[#1B5E3A]'
                    : 'bg-[#FAF9F6] text-[#141A17] border-[#DFDCD2] hover:bg-[#1B5E3A] hover:text-white hover:border-[#1B5E3A]'
                }`}
              >
                {addedToList ? '✓ In lista' : '+ Lista'}
              </button>
            )}
          </div>
        </div>
      </article>

      {/* Progressive Disclosure: 2-Column Offer Detail & HD Cutout Zoom Modal */}
      {detailOpen && (
        <div
          className="fixed inset-0 z-[60] bg-[#141A17]/80 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
          onClick={() => setDetailOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Dettagli offerta ${offer.title}`}
        >
          <svg className="sr-only" aria-hidden="true">
            <defs>
              <filter id={`cibo-sharpen-${offer.id}`}>
                <feConvolveMatrix
                  order="3"
                  kernelMatrix="0 -0.65 0 -0.65 3.6 -0.65 0 -0.65 0"
                  preserveAlpha="true"
                />
              </filter>
            </defs>
          </svg>

          <div
            className="bg-white rounded-2xl border border-[#E5E2DA] shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden grid grid-cols-1 lg:grid-cols-12"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Left Column: Zoomable Cutout + Full Flyer Link */}
            <div className="lg:col-span-7 bg-[#141A17] text-white flex flex-col justify-between min-h-[320px] max-h-[52vh] lg:max-h-[90vh]">
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-white/10">
                <div className="flex items-center gap-1.5">
                  {[1, 2, 3, 4].map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setCutoutScale(s)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        cutoutScale === s ? 'bg-[#1B5E3A] text-white' : 'bg-white/10 text-stone-200 hover:bg-white/20'
                      }`}
                    >
                      {s * 100}%
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setEnhanceSharpen((prev) => !prev)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                      enhanceSharpen
                        ? 'bg-amber-400/20 text-amber-200 border-amber-300/40'
                        : 'bg-white/10 text-stone-300 border-white/15'
                    }`}
                  >
                    {enhanceSharpen ? 'Nitidezza HD attiva' : 'Nitidezza standard'}
                  </button>
                </div>

                {onOpenFlyer && (
                  <button
                    type="button"
                    onClick={() => {
                      setDetailOpen(false);
                      onOpenFlyer(offer);
                    }}
                    className="text-xs font-medium text-emerald-300 hover:text-emerald-200 underline underline-offset-2 cursor-pointer"
                  >
                    {offer.pageNumber ? `Apri volantino intero (Pag. ${offer.pageNumber}) →` : 'Apri volantino intero →'}
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-auto flex items-center justify-center p-5">
                <img
                  src={imageUrl}
                  alt={offer.title}
                  onClick={() => setCutoutScale((prev) => (prev >= 4 ? 1 : prev + 1))}
                  style={{
                    width: `${cutoutScale * 340}px`,
                    maxWidth: 'none',
                    filter: enhanceSharpen
                      ? `url(#cibo-sharpen-${offer.id}) contrast(1.08) saturate(1.04)`
                      : 'none'
                  }}
                  className="bg-white rounded-xl p-3 shadow-xl cursor-zoom-in transition-all duration-150 select-none"
                  title="Clicca sull'immagine per ingrandire fino al 400%"
                />
              </div>
            </div>

            {/* Right Column: Complete Structured Product Sheet */}
            <div className="lg:col-span-5 p-5 sm:p-6 overflow-y-auto space-y-5 flex flex-col justify-between">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[#1B5E3A]">
                      {offer.category}
                    </p>
                    <h2 className="text-lg font-bold text-[#141A17] leading-snug">
                      {offer.title}
                    </h2>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDetailOpen(false)}
                    aria-label="Chiudi dettagli offerta"
                    className="px-2.5 py-1 rounded-lg bg-[#F3F1EC] hover:bg-[#E5E2DA] text-xs font-semibold text-[#141A17] cursor-pointer shrink-0"
                  >
                    ✕ Chiudi
                  </button>
                </div>

                {/* Complete Pricing Box */}
                <div className="rounded-xl bg-[#FAF9F6] border border-[#E5E2DA] p-3.5 space-y-1.5">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-2xl font-bold text-[#1B5E3A] tabular-nums">{promoFormatted}</span>
                    {hasDiscount && originalFormatted ? (
                      <span className="text-xs text-[#575E58] tabular-nums">
                        anziché <span className="line-through font-semibold text-rose-700">{originalFormatted}</span>{' '}
                        <span className="font-semibold text-rose-700">
                          (risparmi {savingsFormatted} · {discountText})
                        </span>
                      </span>
                    ) : (
                      <span className="text-xs text-[#575E58]">Prezzo precedente non indicato sul volantino</span>
                    )}
                  </div>
                  {unitLine && (
                    <p className="text-xs font-medium text-[#141A17] tabular-nums">
                      Formato e peso: {unitLine}
                    </p>
                  )}
                </div>

                {/* Store, Address, Loyalty & Validity */}
                <div className="space-y-2 text-xs text-[#141A17]">
                  <div>
                    <span className="font-semibold">Dove trovarlo: </span>
                    <span>
                      {offer.storeFullName || offer.storeName}
                      {offer.storeAddress ? ` — ${offer.storeAddress}` : ''}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold">Condizioni: </span>
                    {isMemberOnly ? (
                      <span className="font-semibold text-amber-900">
                        Riservata ai titolari {offer.loyaltyCard?.name || 'carta fedeltà'}
                      </span>
                    ) : (
                      <span className="text-[#575E58]">Aperta a tutti (nessuna tessera richiesta)</span>
                    )}
                  </div>
                  {validityText && (
                    <div>
                      <span className="font-semibold">Validità: </span>
                      <span className="text-[#575E58]">{validityText}</span>
                    </div>
                  )}
                  {offer.storageHint && (
                    <div>
                      <span className="font-semibold">Conservazione: </span>
                      <span className="text-[#575E58]">{offer.storageHint.replace(/^[^\w]+/, '')}</span>
                    </div>
                  )}
                </div>

                {/* CREA Nutrition Section */}
                {offer.creaMatch && (
                  <div className="rounded-xl bg-[#F3F1EC] border border-[#E5E2DA] p-3.5 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-[#141A17]">
                        Valori medi CREA per 100 g ({offer.creaMatch.creaFoodName})
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-2 text-center">
                      <div className="bg-white rounded-lg p-2 border border-[#E5E2DA]">
                        <p className="text-xs font-bold text-[#141A17] tabular-nums">{offer.creaMatch.kcal100 ?? 0}</p>
                        <p className="text-[10px] text-[#575E58]">kcal</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-[#E5E2DA]">
                        <p className="text-xs font-bold text-[#141A17] tabular-nums">{offer.creaMatch.prot100 ?? 0} g</p>
                        <p className="text-[10px] text-[#575E58]">Proteine</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-[#E5E2DA]">
                        <p className="text-xs font-bold text-[#141A17] tabular-nums">{offer.creaMatch.carbs100 ?? 0} g</p>
                        <p className="text-[10px] text-[#575E58]">Carboidrati</p>
                      </div>
                      <div className="bg-white rounded-lg p-2 border border-[#E5E2DA]">
                        <p className="text-xs font-bold text-[#141A17] tabular-nums">{offer.creaMatch.fat100 ?? 0} g</p>
                        <p className="text-[10px] text-[#575E58]">Grassi</p>
                      </div>
                    </div>
                    {onOpenCreaFood && (
                      <button
                        type="button"
                        onClick={() => {
                          setDetailOpen(false);
                          onOpenCreaFood(offer.creaMatch.creaFoodId);
                        }}
                        className="w-full py-2 px-3 rounded-lg bg-white hover:bg-[#FAF9F6] border border-[#DFDCD2] text-xs font-semibold text-[#1B5E3A] cursor-pointer"
                      >
                        Scheda scientifica CREA completa ↗
                      </button>
                    )}
                  </div>
                )}
              </div>

              {onAddToShoppingList && !offer.isNamelessTile && (
                <button
                  type="button"
                  onClick={handleQuickAdd}
                  className="w-full py-3 px-4 rounded-full bg-[#1B5E3A] hover:bg-[#14492D] text-white text-sm font-semibold cursor-pointer"
                >
                  {addedToList ? '✓ Aggiunto alla lista spesa' : '+ Aggiungi alla lista spesa'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default OfferCard;
