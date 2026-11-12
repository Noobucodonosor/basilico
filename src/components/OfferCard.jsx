import React, { useState } from 'react';

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
  personal_care: { label: 'Igiene Persona', color: 'bg-purple-50 text-purple-800 border-purple-200' },
  pet_care: { label: 'Pet Care', color: 'bg-orange-50 text-orange-800 border-orange-200' },
  bazar_seasonal: { label: 'Giocattoli & Bazar', color: 'bg-pink-50 text-pink-800 border-pink-200' }
};

export function OfferCard({ offer, onOpenFlyer, onOpenCreaFood, onAddToShoppingList }) {
  const [addedToList, setAddedToList] = useState(false);
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

  const normalizedPriceText = offer.formattedNormalizedPrice || offer.unitPrice || null;
  const domainMeta = DOMAIN_BADGE_MAP[offer.domain] || null;
  const qualityBadges = Array.isArray(offer.qualityBadges) ? offer.qualityBadges.slice(0, 2) : [];
  const realDiscount = offer.realDiscountCheck || null;
  const isFlaggedByProfile = offer.profileCompatibility && offer.profileCompatibility.isCompatible === false;

  return (
    <article
      className={`bg-white rounded-xl border shadow-xs hover:shadow-md transition-shadow p-3.5 grid grid-rows-subgrid row-span-4 gap-2 relative group ${
        isFlaggedByProfile ? 'border-amber-300 bg-amber-50/20 opacity-85' : 'border-slate-200'
      }`}
    >
      {/* Track 1: Media (Image + Discount Badge + Domain/Profile Badges) */}
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

      {/* Track 2: Header (Title clamped to 2 lines + Category + Quality Lens Badges) */}
      <div className="flex flex-col">
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

      {/* Track 3: Pricing (Promo Price + Strikethrough + Normalized Edible €/kg Price) */}
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
        {normalizedPriceText && (
          <span className="text-[11px] text-slate-600 font-semibold">
            ⚖️ {normalizedPriceText}
          </span>
        )}
        {offer.creaMatch && (
          <button
            type="button"
            onClick={() => onOpenCreaFood && onOpenCreaFood(offer.creaMatch.creaFoodId)}
            className="mt-1 inline-flex items-center gap-1 text-[10px] font-bold text-indigo-800 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 px-1.5 py-0.5 rounded w-fit cursor-pointer"
            title={`Scheda CREA: ${offer.creaMatch.creaFoodName}`}
          >
            <span>🔬 {offer.creaMatch.nutrientsPerEuro?.proteinGPerEuro || 0}g prot/€</span>
            <span>• CREA ↗</span>
          </button>
        )}
      </div>

      {/* Track 4: Footer (Validity + Quick Add to Shopping List + Flyer Action) */}
      <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1 text-xs">
        <span className="text-[11px] text-slate-500 whitespace-nowrap truncate" title={validityText || ''}>
          {validityText || 'Offerta attiva'}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {onAddToShoppingList && !offer.isNamelessTile && (
            <button
              type="button"
              onClick={async () => {
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
              }}
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
    </article>
  );
}

export default OfferCard;
