import React from 'react';
import { OfferCard } from './OfferCard.jsx';

export function OfferGrid({
  offers = [],
  loading = false,
  onOpenFlyer,
  onOpenCreaFood,
  onResetFilters,
  allFlyers = []
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

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-4">
      {offers.map((offer) => (
        <OfferCard
          key={offer.id}
          offer={offer}
          onOpenCreaFood={onOpenCreaFood}
          onOpenFlyer={(item) => {
            if (onOpenFlyer) {
              const matchedFlyer = allFlyers.find((f) => f.storeId === item.storeId) || allFlyers[0] || item;
              onOpenFlyer(matchedFlyer);
            }
          }}
        />
      ))}
    </div>
  );
}

export default OfferGrid;
