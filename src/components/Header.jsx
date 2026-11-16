import React from 'react';

export function Header({
  status,
  isOnline = true,
  dataSource = 'live',
  activeRoom = 'room-1-negozi',
  activeStoreName,
  mobileSearchOpen,
  isMobileSearchOpen,
  onToggleMobileSearch,
  onRefresh,
  onDeepSync,
  isRefreshing,
  profiles = [],
  activeProfileId = 'dany',
  onChangeProfile,
  onOpenCounterPriceModal,
  shoppingCount = 0,
  onOpenShoppingList,
  onOpenMaestro
}) {
  const online = status ? (status.isOnline !== false && status.dataSource !== 'seed') : isOnline;
  const source = status?.dataSource || dataSource || 'live';
  const isOpen = isMobileSearchOpen ?? mobileSearchOpen;

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#E5E2DA] transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap sm:flex-nowrap items-center justify-between py-2 sm:py-0 sm:h-16 gap-y-2 gap-x-2 sm:gap-3">
          {/* Logo & Rapallo Badge (Row 1 Left on mobile, never clipped at 375px) */}
          <div className="order-1 flex items-center gap-2 min-w-0 shrink-0">
            <span className="text-xl sm:text-2xl select-none" aria-hidden="true">🌿</span>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 sm:gap-2">
                <span className="font-extrabold text-base sm:text-lg text-[#1B5E3A] tracking-tight whitespace-nowrap">
                  Basilico
                </span>
                {/* Rapallo Badge (always visible, complies with F10) */}
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-semibold bg-[#F3F1EC] text-[#1B5E3A] border border-[#DFDCD2] shrink-0">
                  Rapallo 16035
                </span>
              </div>
              <span className="text-xs text-[#575E58] truncate hidden sm:block">
                {activeStoreName || 'Tutti i Supermercati'}
              </span>
            </div>
          </div>

          {/* Profile Selector & Mobile Counter Price (Row 2 full-width on <640px, inline on >=640px) */}
          {(profiles.length > 0 || onOpenCounterPriceModal) && (
            <div className="order-3 sm:order-2 w-full sm:w-auto flex items-center gap-2 sm:ml-auto">
              {profiles.length > 0 && onChangeProfile && (
                <div className="flex-1 sm:flex-initial min-w-0">
                  <label htmlFor="active-profile-select" className="sr-only">
                    Profilo Alimentare Attivo
                  </label>
                  <select
                    id="active-profile-select"
                    value={activeProfileId}
                    onChange={(e) => onChangeProfile(e.target.value)}
                    className="w-full sm:w-auto text-xs font-semibold bg-[#F3F1EC] text-[#141A17] border border-[#DFDCD2] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer sm:max-w-[250px] truncate"
                    title="Seleziona il profilo alimentare attivo (Dany / In Barca / Ospiti)"
                  >
                    {profiles.map((p) => (
                      <option key={p.id} value={p.id}>
                        👤 {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {onOpenCounterPriceModal && (
                <button
                  type="button"
                  onClick={onOpenCounterPriceModal}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] rounded-lg taste-btn cursor-pointer shrink-0"
                  title="Registra un prezzo visto al banco in pescheria, macelleria o scaffale"
                >
                  <span aria-hidden="true">🏷️</span>
                  <span>Prezzo al banco</span>
                </button>
              )}
            </div>
          )}

          {/* Right Actions: Maestro CTA, Shopping list, live status, sync & mobile search toggle */}
          <div className="order-2 sm:order-3 flex items-center gap-1.5 sm:gap-2 shrink-0">

            {/* Global Basilico Maestro Chat Drawer (ADR-0015) — single primary CTA */}
            {onOpenMaestro && (
              <button
                type="button"
                onClick={() => onOpenMaestro('')}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-[#1B5E3A] hover:bg-[#14492D] rounded-lg shadow-xs taste-btn cursor-pointer"
                title="Apri la chat con Basilico Maestro sui dati reali di casa tua"
                aria-label="Apri chat Basilico Maestro"
                data-testid="header-open-maestro"
              >
                <span aria-hidden="true">💬</span>
                <span>Maestro</span>
              </button>
            )}

            {/* Live Smart Shopping List Shortcut */}
            {onOpenShoppingList && (
              <button
                type="button"
                onClick={onOpenShoppingList}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] rounded-lg taste-btn cursor-pointer"
                title="Apri la Lista Spesa Multi-Negozio di Rapallo (Stanza 6)"
              >
                <span aria-hidden="true">🛒</span>
                <span className="hidden sm:inline">Lista</span>
                <span className="px-1.5 py-0.2 rounded-full bg-[#1B5E3A] text-white text-[10px] font-bold">
                  {shoppingCount}
                </span>
              </button>
            )}

            {/* Live Status Indicator */}
            <div
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border bg-[#FAF9F6] text-[#575E58] border-[#E5E2DA]"
              title={`Sorgente: ${source}`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  online ? 'bg-[#1B5E3A]' : 'bg-[#9A5B25]'
                }`}
              />
              <span className="hidden lg:inline">
                {online ? 'Online' : source === 'cache' ? 'Copia Cache' : 'Offline'}
              </span>
            </div>

            {/* Quick Refresh / Sync Button */}
            {onRefresh && (
              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] rounded-lg taste-btn disabled:opacity-50 cursor-pointer"
                title="Aggiornamento rapido stato online e cache (1-2 secondi)"
                aria-label="Aggiorna offerte"
              >
                <svg
                  className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-[#1B5E3A]' : ''}`}
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
                <span className="hidden md:inline">Aggiorna</span>
              </button>
            )}

            {/* Sync 14 Rapallo Stores Button */}
            {onDeepSync && (
              <button
                type="button"
                onClick={onDeepSync}
                disabled={isRefreshing}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] rounded-lg taste-btn disabled:opacity-50 cursor-pointer"
                title="Sincronizza volantini e offerte negozio per negozio da tutti i 14 punti vendita di Rapallo"
                aria-label="Sincronizza 14 negozi Rapallo"
              >
                <svg
                  className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-[#1B5E3A]' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10"
                  />
                </svg>
                <span className="hidden lg:inline">Sincronizza 14 negozi</span>
                <span className="hidden sm:inline lg:hidden">Sincronizza</span>
              </button>
            )}

            {/* Compact Search Button on Mobile (complies with Contract 10.4; Room 1 only) */}
            {activeRoom === 'room-1-negozi' && onToggleMobileSearch && (
              <button
                type="button"
                onClick={onToggleMobileSearch}
                className="sm:hidden p-2 text-[#575E58] hover:text-[#1B5E3A] hover:bg-[#F3F1EC] rounded-lg taste-btn cursor-pointer"
                aria-label="Cerca prodotti"
                aria-expanded={Boolean(isOpen)}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

export default Header;
