import React from 'react';

/**
 * FlyerFallbackCard Component
 * Displays a store-branded offline placeholder card when CDN images cannot be retrieved.
 */
export function FlyerFallbackCard({ storeName = 'Rapallo', title = 'Volantino Promozionale', pageNumber = 1, onRetry }) {
  return (
    <div className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-2xl p-6 sm:p-8 flex flex-col items-center text-center shadow-xl">
      {/* Supermarket Flyer SVG Graphic */}
      <div className="w-20 h-20 mb-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
        <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.75"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      </div>

      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700 mb-2">
        {storeName}
      </span>

      <h3 className="text-base sm:text-lg font-bold text-white mb-1">
        {title}
      </h3>
      <p className="text-sm font-mono text-emerald-400 mb-3">
        Pagina {pageNumber}
      </p>

      <p className="text-xs text-slate-400 max-w-xs mb-6 leading-relaxed">
        L'immagine ad alta risoluzione del volantino non è al momento raggiungibile dal server CDN esterno. Le offerte complete sono consultabili nella schermata principale.
      </p>

      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Riprova caricamento
        </button>
      )}
    </div>
  );
}

export default FlyerFallbackCard;
