import React, { useEffect, useState } from 'react';

export function formatValidityBadge(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `Valido fino al ${day} ${months[date.getUTCMonth()]}`;
}

const DOMAIN_BADGE_MAP = {
  food_human: { label: 'Alimentari', color: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  home_cleaning: { label: 'Chimica & Casa', color: 'bg-sky-50 text-sky-800 border-sky-200' },
  kitchen_cookware: { label: 'Pentole & Cucina', color: 'bg-amber-50 text-amber-800 border-amber-200' },
  personal_care: { label: 'Igiene Persona', color: 'bg-[#F3F1EC] text-[#4A524C] border-[#DFDCD2]' },
  pet_care: { label: 'Pet Care', color: 'bg-orange-50 text-orange-800 border-orange-200' },
  bazar_seasonal: { label: 'Giocattoli & Bazar', color: 'bg-pink-50 text-pink-800 border-pink-200' }
};

export function OfferCard({ offer, onOpenFlyer, onOpenCreaFood, onAddToShoppingList }) {
  const [addedToList, setAddedToList] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [cutoutScale, setCutoutScale] = useState(2);
  const [enhanceSharpen, setEnhanceSharpen] = useState(true);

  useEffect(() => {
    if (!zoomOpen) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setZoomOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoomOpen]);

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
  const brand = offer.brand || offer.storeName || (offer.chainId ? offer.chainId.toUpperCase() : 'Offerta');
  const validityText = formatValidityBadge(offer.validTo || offer.validityEnd);

  const normalizedPriceText = offer.formattedNormalizedPrice || offer.unitPrice || null;
  const unitLine = offer.quantityLabel || normalizedPriceText || null;
  const domainMeta = DOMAIN_BADGE_MAP[offer.domain] || null;
  const qualityBadges = Array.isArray(offer.qualityBadges) ? offer.qualityBadges.slice(0, 2) : [];
  const realDiscount = offer.realDiscountCheck || null;
  const isMemberOnly = Boolean(offer.isMemberOnly || offer.loyaltyCard?.requiredForPromo);
  const isFlaggedByProfile = offer.profileCompatibility && offer.profileCompatibility.isCompatible === false;

  const handleQuickAdd = async () => {
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
      preferredChain: offer.storeName || brand,
      storeId: offer.storeId || null,
      onPromo: true,
      creaId: offer.creaMatch?.creaFoodId || null
    });
    setAddedToList(true);
  };

  return (
    <article
      className={`bg-white rounded-xl border shadow-xs hover:shadow-md transition-shadow p-3.5 grid grid-rows-subgrid row-span-4 gap-2 relative group ${
        isFlaggedByProfile ? 'border-amber-300 bg-amber-50/20 opacity-85' : 'border-slate-200'
      }`}
    >
      {/* Track 1: Media (Image + Discount Badge + Domain/Profile Badges) */}
      <div
        onClick={() => {
          setCutoutScale(2);
          setZoomOpen(true);
        }}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setCutoutScale(2);
            setZoomOpen(true);
          }
        }}
        title="Clicca per ingrandire questo ritaglio in HD (fino a 400%)"
        className="relative aspect-square w-full bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center p-2 cursor-zoom-in"
      >
        <img
          src={imageUrl}
          alt={offer.title}
          loading="lazy"
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
          onError={(e) => {
            e.currentTarget.src = '/images/placeholder_deal.svg';
          }}
        />

        {discountText && (
          <span className="absolute top-2 right-2 bg-rose-600 text-white text-xs font-extrabold px-2 py-0.5 rounded-full shadow-xs">
            {discountText}
          </span>
        )}

        {domainMeta && offer.domain !== 'food_human' && (
          <span className={`absolute top-2 left-2 text-[10px] font-bold px-2 py-0.5 rounded-full border ${domainMeta.color}`}>
            {domainMeta.label}
          </span>
        )}

        <span className="absolute bottom-2 left-2 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-sm">
          {brand}
        </span>

        {realDiscount && (realDiscount.status === 'verified_best' || realDiscount.status === 'verified_good') && (
          <span
            className="absolute bottom-2 right-2 bg-emerald-700 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-sm shadow-xs"
            title={realDiscount.explanation}
          >
            ✓ {realDiscount.badge}
          </span>
        )}
      </div>

      {/* Track 2: Header (Title + Category + Store Address + Loyalty + Storage + Quality Lens) */}
      <div className="flex flex-col min-w-0">
        <div className="flex items-center justify-between gap-1 mb-0.5">
          <span className="text-[11px] font-medium text-emerald-700 line-clamp-1">
            {offer.category}
          </span>
          {isFlaggedByProfile && (
            <span
              className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded shrink-0"
              title={(offer.profileCompatibility.reasons || []).join(' • ')}
            >
              ⚠️ Escluso profilo
            </span>
          )}
        </div>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900" title={offer.title}>
          {offer.title}
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600 min-w-0">
          <span className="truncate max-w-full" title={offer.storeAddress || offer.storeFullName || offer.storeName}>
            📍 {offer.storeFullName || offer.storeName}
            {offer.storeAddress ? ` · ${offer.storeAddress}` : ''}
          </span>
          {isMemberOnly ? (
            <span
              className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300 text-[10px] font-bold shrink-0"
              title={`Richiede ${offer.loyaltyCard?.name || 'carta fedeltà'}`}
            >
              🪪 Solo soci ({offer.loyaltyCard?.name || 'Carta'})
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[10px] font-medium shrink-0">
              Aperta a tutti
            </span>
          )}
        </div>
        {offer.storageHint && (
          <p className="mt-1 text-[10px] text-slate-600 leading-snug" title={offer.storageHint}>
            {offer.storageHint}
          </p>
        )}
        {qualityBadges.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-1">
            {qualityBadges.map((b, idx) => (
              <span
                key={idx}
                className="text-[10px] font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 rounded"
              >
                {b.label || b}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Track 3: Pricing (Promo vs Full Price + Savings + Pack/€/kg + Complete CREA Macros) */}
      <div className="flex flex-col justify-end min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-xl font-extrabold text-emerald-700 tracking-tight tabular-nums">
            {promoFormatted}
          </span>
          {hasDiscount && originalFormatted ? (
            <span className="text-xs font-medium text-slate-600 tabular-nums">
              anziché <span className="line-through text-rose-700 font-bold">{originalFormatted}</span>
              <span className="ml-1 text-[11px] font-bold text-rose-700">
                (−{savingsFormatted})
              </span>
            </span>
          ) : (
            <span className="text-[10px] text-slate-400">
              prezzo pieno non indicato
            </span>
          )}
        </div>
        {unitLine && (
          <span className="text-[11px] text-slate-600 font-semibold tabular-nums">
            ⚖️ {unitLine}
          </span>
        )}
        {offer.creaMatch && (
          <button
            type="button"
            onClick={() => onOpenCreaFood && onOpenCreaFood(offer.creaMatch.creaFoodId)}
            className="mt-1 inline-flex flex-wrap items-center gap-1 text-[10px] font-bold text-[#1B5E3A] bg-[#F3F1EC] hover:bg-[#E7E4DC] border border-[#DFDCD2] px-1.5 py-0.5 rounded w-fit cursor-pointer text-left"
            title={`Scheda CREA: ${offer.creaMatch.creaFoodName}`}
          >
            <span>
              🔬 {offer.creaMatch.kcal100 ?? 0} kcal · {offer.creaMatch.prot100 ?? 0}g prot ·{' '}
              {offer.creaMatch.carbs100 ?? 0}g carb · {offer.creaMatch.fat100 ?? 0}g grassi /100g
            </span>
            <span>• CREA ↗</span>
          </button>
        )}
      </div>

      {/* Track 4: Footer (Validity + Quick Add to Shopping List + Flyer Page Action) */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
        <span className="text-[11px] text-slate-500 whitespace-nowrap truncate" title={validityText || ''}>
          {validityText || 'Offerta attiva'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {onAddToShoppingList && !offer.isNamelessTile && (
            <button
              type="button"
              onClick={handleQuickAdd}
              className={`px-1.5 py-0.5 rounded font-bold text-[10px] border transition-colors cursor-pointer ${
                addedToList
                  ? 'bg-emerald-700 text-white border-emerald-700'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
              }`}
              title="Aggiungi con 1 clic alla Lista Spesa Multi-Negozio di Rapallo"
            >
              {addedToList ? '✓ Lista' : '+ Lista'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onOpenFlyer && onOpenFlyer(offer)}
            className="text-emerald-700 font-semibold hover:text-emerald-800 text-[11px] shrink-0 hover:underline cursor-pointer"
            title={offer.pageNumber ? `Apri volantino a pagina ${offer.pageNumber}` : 'Apri volantino promozionale'}
          >
            {offer.pageNumber ? `Pag. ${offer.pageNumber} →` : 'Volantino →'}
          </button>
        </div>
      </div>

      {/* HD Cutout Lightbox (100%–400% + SVG Unsharp Mask) */}
      {zoomOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex flex-col items-center justify-between p-4"
          onClick={() => setZoomOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Ingrandimento ritaglio ${offer.title}`}
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
            className="w-full max-w-4xl flex flex-wrap items-center justify-between gap-2 bg-slate-900/90 text-white px-4 py-2.5 rounded-xl border border-white/15"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="min-w-0">
              <p className="text-sm font-bold truncate">{offer.title}</p>
              <p className="text-[11px] text-slate-300 truncate">
                {offer.storeFullName || offer.storeName} · {promoFormatted}
                {originalFormatted ? ` (era ${originalFormatted})` : ''}
                {discountText ? ` · ${discountText}` : ''}
                {unitLine ? ` · ${unitLine}` : ''}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {[1, 2, 3, 4].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setCutoutScale(s)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-bold cursor-pointer ${
                    cutoutScale === s ? 'bg-emerald-600 text-white' : 'bg-white/10 text-slate-200 hover:bg-white/20'
                  }`}
                >
                  {s * 100}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => setEnhanceSharpen((prev) => !prev)}
                className={`px-2.5 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                  enhanceSharpen
                    ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
                    : 'bg-white/10 text-slate-300 border-white/15'
                }`}
                title="Filtro convoluzione SVG Unsharp Mask + micro-contrasto per testi piccoli"
              >
                {enhanceSharpen ? '✨ Nitidezza HD: ON' : 'Nitidezza HD: OFF'}
              </button>
              {onOpenFlyer && (
                <button
                  type="button"
                  onClick={() => {
                    setZoomOpen(false);
                    onOpenFlyer(offer);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-emerald-300 text-xs font-bold cursor-pointer"
                >
                  {offer.pageNumber ? `Pag. ${offer.pageNumber} →` : 'Volantino →'}
                </button>
              )}
              <button
                type="button"
                onClick={() => setZoomOpen(false)}
                className="px-3 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold cursor-pointer"
              >
                ✕ Chiudi
              </button>
            </div>
          </div>

          <div
            className="flex-1 w-full overflow-auto flex items-center justify-center p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={imageUrl}
              alt={offer.title}
              onClick={() => setCutoutScale((prev) => (prev >= 4 ? 1 : prev + 1))}
              style={{
                width: `${cutoutScale * 360}px`,
                maxWidth: 'none',
                filter: enhanceSharpen
                  ? `url(#cibo-sharpen-${offer.id}) contrast(1.08) saturate(1.05)`
                  : 'none'
              }}
              className="bg-white rounded-xl p-3 shadow-2xl cursor-zoom-in transition-all duration-150 select-none"
              title="Clicca sull'immagine per aumentare lo zoom (100% -> 400%)"
            />
          </div>
        </div>
      )}
    </article>
  );
}

export default OfferCard;
