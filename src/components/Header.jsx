import React from 'react';

export function Header({
  status,
  isOnline = true,
  dataSource = 'live',
  activeStoreName,
  mobileSearchOpen,
  isMobileSearchOpen,
  onToggleMobileSearch,
  onRefresh,
  onDeepSync,
  isRefreshing
}) {
  const online = status ? (status.isOnline !== false && status.dataSource !== 'seed') : isOnline;
  const source = status?.dataSource || dataSource || 'live';
  const isOpen = isMobileSearchOpen ?? mobileSearchOpen;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200 transition-all">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Logo & Rapallo Badge */}
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-2xl select-none" aria-hidden="true">🌿</span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-emerald-800 tracking-tight truncate">
                  Basilico
                </span>
                {/* Rapallo Badge (always visible, complies with F10) */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 shrink-0">
                  Rapallo 16035
                </span>
              </div>
              <span className="text-xs text-slate-500 truncate hidden sm:block">
                {activeStoreName || 'Tutti i Supermercati'}
              </span>
            </div>
          </div>

          {/* Right Actions: Live status & mobile search toggle */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live Status Indicator */}
            <div
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                online
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border-amber-200'
              }`}
              title={`Sorgente: ${source}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  online ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'
                }`}
              />
              <span className="hidden sm:inline">
                {online ? 'Online' : source === 'cache' ? 'Copia Cache' : 'Offline'}
              </span>
            </div>

            {/* Quick Refresh / Sync Button */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 hover:border-emerald-200 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                title="Controllo rapido stato online e cache (1-2 secondi)"
                aria-label="Aggiorna offerte"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-600' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span className="hidden md:inline">Rapido</span>
              </button>
            )}

            {/* Deep Sync 14 Stores Button (ADR-0005) */}
            {onDeepSync && (
              <button
                type="button"
                onClick={onDeepSync}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                title="Deep Sync completo: scarica volantini e offerte negozio per negozio da tutti i 14 punti vendita di Rapallo"
                aria-label="Deep Sync 14 negozi Rapallo"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
                <span>Deep Sync</span>
              </button>
            )}

            {/* Compact Search Button on Mobile (complies with Contract 10.4) */}
            <button
              type="button"
              onClick={onToggleMobileSearch}
              className="sm:hidden p-2 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              aria-label="Cerca prodotti"
              aria-expanded={Boolean(isOpen)}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
