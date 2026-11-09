import React from 'react';

export function formatValidityBadge(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (isNaN(date.getTime())) return null;
  const day = date.getUTCDate();
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  return `Valido fino al ${day} ${months[date.getUTCMonth()]}`;
}

export function OfferCard({ offer, onOpenFlyer }) {
  const promoVal = Number(offer.promoPrice ?? offer.price ?? offer.discountPrice ?? 0);
  const origVal = offer.originalPrice != null ? Number(offer.originalPrice) : null;
  const hasDiscount = Boolean(origVal && origVal > promoVal);
  const discountText = hasDiscount
    ? `-${Math.round(((origVal - promoVal) / origVal) * 100)}%`
    : (offer.discountPercentage > 0 ? `-${offer.discountPercentage}%` : null);

  const promoFormatted = `€ ${promoVal.toFixed(2).replace('.', ',')}`;
  const originalFormatted = hasDiscount ? `€ ${origVal.toFixed(2).replace('.', ',')}` : null;
  const imageUrl = offer.imageUrl || '/images/placeholder_deal.svg';
  const brand = offer.brand || offer.storeName || (offer.chainId ? offer.chainId.toUpperCase() : 'Offerta');
  const validityText = formatValidityBadge(offer.validTo || offer.validityEnd);

  return (
    <article
      className="bg-white rounded-xl border border-slate-200 shadow-xs hover:shadow-md transition-shadow p-3.5 grid grid-rows-subgrid row-span-4 gap-2 relative group"
    >
      {/* Track 1: Media (Image + Discount Badge) */}
      <div className="relative aspect-square w-full bg-slate-50 rounded-lg overflow-hidden flex items-center justify-center p-2">
        <img
          src={imageUrl}
          alt={offer.title}
          loading="lazy"
          className="max-h-full max-w-full object-contain group-hover:scale-105 transition-transform duration-200"
          onError={(e) => {
            e.currentTarget.src = '/images/placeholder_deal.svg';
          }}
        />

        {hasDiscount && discountText && (
          <span className="absolute top-2 right-2 bg-rose-600 text-white text-xs font-extrabold px-2 py-0.5 rounded-full shadow-xs">
            {discountText}
          </span>
        )}

        <span className="absolute bottom-2 left-2 bg-slate-900/70 text-white text-[10px] font-semibold px-2 py-0.5 rounded-sm">
          {brand}
        </span>
      </div>

      {/* Track 2: Header (Title clamped to 2 lines + Category) */}
      <div className="flex flex-col">
        <span className="text-[11px] font-medium text-emerald-700 line-clamp-1 mb-0.5">
          {offer.category}
        </span>
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900" title={offer.title}>
          {offer.title}
        </h3>
      </div>

      {/* Track 3: Pricing (Promo Price + Strikethrough + Unit Price) */}
      <div className="flex flex-col justify-end">
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-extrabold text-emerald-700 tracking-tight">
            {promoFormatted}
          </span>
          {hasDiscount && originalFormatted && (
            <span className="text-xs text-slate-400 line-through">
              {originalFormatted}
            </span>
          )}
        </div>
        {offer.unitPrice && (
          <span className="text-[11px] text-slate-500 font-medium">
            {offer.unitPrice}
          </span>
        )}
      </div>

      {/* Track 4: Footer (Validity + Store Name / Action) */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
        <span className="text-[11px] text-slate-500 truncate" title={validityText || ''}>
          {validityText || 'Offerta attiva'}
        </span>
        <button
          type="button"
          onClick={() => onOpenFlyer && onOpenFlyer(offer)}
          className="text-emerald-700 font-semibold hover:text-emerald-800 text-[11px] shrink-0 hover:underline cursor-pointer"
        >
          Sfoglia volantino →
        </button>
      </div>
    </article>
  );
}

export default OfferCard;
