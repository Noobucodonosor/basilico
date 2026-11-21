import React from 'react';

/**
 * EmptyState component (F12, F13)
 * Displayed when product search or category filtering yields zero offers.
 */
export function EmptyState({
  searchQuery = '',
  selectedCategory = null,
  selectedDomain = null,
  selectedStoreName = null,
  hideIncompatible = false,
  onClearFilters,
  onApplyQuery
}) {
  const hasDomainFilter = Boolean(selectedDomain && selectedDomain !== 'all');
  const hasFilters = Boolean(
    searchQuery.trim() ||
    selectedCategory ||
    hasDomainFilter ||
    hideIncompatible ||
    selectedStoreName
  );
  const showFoodSuggestions = !hasDomainFilter || selectedDomain === 'food_human';

  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-white rounded-2xl border border-slate-200 shadow-xs my-6">
      <div className="w-16 h-16 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4">
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7"
          />
        </svg>
      </div>

      <h3 className="text-lg font-bold text-slate-800 mb-1">
        Nessuna offerta trovata
      </h3>

      <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
        {searchQuery ? (
          <>
            Nessun prodotto corrisponde a <span className="font-semibold text-slate-900">"{searchQuery}"</span>
            {selectedCategory && (
              <> nella categoria <span className="font-semibold text-slate-900">"{selectedCategory}"</span></>
            )}
            {selectedStoreName && (
              <> per <span className="font-semibold text-slate-900">{selectedStoreName}</span></>
            )}.
          </>
        ) : selectedCategory ? (
          <>
            Non ci sono promozioni attive al momento nella categoria{' '}
            <span className="font-semibold text-slate-900">"{selectedCategory}"</span>
            {selectedStoreName && (
              <> per <span className="font-semibold text-slate-900">{selectedStoreName}</span></>
            )}.
          </>
        ) : hasDomainFilter && selectedStoreName ? (
          <>
            Non ci sono offerte attive per <span className="font-semibold text-slate-900">{selectedStoreName}</span>{' '}
            nel dominio merceologico selezionato.
          </>
        ) : (
          'Al momento non ci sono offerte attive disponibili per i filtri selezionati.'
        )}
      </p>

      {/* Suggestion Chips (shown only when compatible with food domain) */}
      {onApplyQuery && showFoodSuggestions && (
        <div className="flex flex-wrap items-center justify-center gap-2 mb-6">
          <span className="text-xs text-slate-400 mr-1">Ricerche frequenti a Rapallo:</span>
          {['Pasta', 'Caffè', 'Olio', 'Latte', 'Biscotti'].map((term) => (
            <button
              key={term}
              type="button"
              onClick={() => onApplyQuery(term)}
              className="text-xs px-2.5 py-1 rounded-full bg-slate-100 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border border-slate-200 cursor-pointer"
            >
              {term}
            </button>
          ))}
        </div>
      )}

      {hasFilters && onClearFilters && (
        <button
          type="button"
          onClick={onClearFilters}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Azzera tutti i filtri
        </button>
      )}
    </div>
  );
}

export default EmptyState;
