import React from 'react';
import { OfferCard } from './OfferCard.jsx';

export function OfferGrid({
  offers = [],
  totalOffers = 0,
  hasMoreOffers = false,
  loadingMore = false,
  onLoadMore,
  loading = false,
  onOpenFlyer,
  onOpenCreaFood,
  onAddToShoppingList,
  onResetFilters
}) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-slate-200 p-4 h-80 animate-pulse flex flex-col gap-3">
            <div className="bg-slate-200 rounded-lg aspect-square w-full" />
            <div className="h-4 bg-slate-200 rounded w-3/4" />
            <div className="h-3 bg-slate-200 rounded w-1/2" />
            <div className="mt-auto h-6 bg-slate-200 rounded w-1/3" />
          </div>
        ))}
      </div>
    );
  }

  if (offers.length === 0) {
    return (
      <div className="text-center py-16 px-4 bg-white rounded-2xl border border-slate-200 my-6 shadow-xs">
        <span className="text-4xl select-none" aria-hidden="true">🔍</span>
        <h3 className="mt-3 text-lg font-bold text-slate-800">Nessuna offerta trovata</h3>
        <p className="mt-1 text-sm text-slate-500 max-w-sm mx-auto">
          Nessun prodotto corrisponde ai criteri di ricerca o ai filtri selezionati nei supermercati di Rapallo.
        </p>
        {onResetFilters && (
          <button
            type="button"
            onClick={onResetFilters}
            className="mt-4 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-semibold hover:bg-emerald-800 transition-colors cursor-pointer"
          >
            Azzera filtri di ricerca
          </button>
        )}
      </div>
    );
  }

  const effectiveTotal = totalOffers > 0 ? totalOffers : offers.length;
  const remainingCount = Math.max(0, effectiveTotal - offers.length);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs text-slate-500 px-0.5">
        <span>
          Visualizzate <strong className="text-slate-800">{offers.length}</strong> di{' '}
          <strong className="text-slate-800">{effectiveTotal}</strong> offerte attive
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-1">
        {offers.map((offer) => (
          <OfferCard
            key={offer.id}
            offer={offer}
            onOpenCreaFood={onOpenCreaFood}
            onAddToShoppingList={onAddToShoppingList}
            onOpenFlyer={(item) => {
              if (onOpenFlyer) {
                onOpenFlyer(item);
              }
            }}
          />
        ))}
      </div>

      {hasMoreOffers && onLoadMore && (
        <div className="pt-2 pb-4 flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="px-6 py-2.5 bg-slate-900 hover:bg-emerald-800 text-white text-xs sm:text-sm font-bold rounded-xl shadow-sm transition-colors disabled:opacity-60 cursor-pointer inline-flex items-center gap-2"
          >
            {loadingMore ? (
              <span>Caricamento offerte...</span>
            ) : (
              <span>
                Mostra altre offerte (+{Math.min(60, remainingCount)} di {remainingCount} rimanenti)
              </span>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default OfferGrid;
