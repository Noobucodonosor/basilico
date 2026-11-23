import React, { useEffect, useRef, useState } from 'react';

function LeafMark() {
  return (
    <svg
      className="w-5 h-5 text-[#1B5E3A] shrink-0"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

const PROFILE_LABELS = {
  ospiti: 'Standard (Tutti gli ingredienti)',
  dany: 'Senza latticini',
  barca: 'Cambusa & Barca'
};

export function Header({
  status,
  isOnline = true,
  dataSource = 'live',
  activePhase = 'overview',
  activeRoom = 'room-1-negozi',
  mobileSearchOpen,
  isMobileSearchOpen,
  onToggleMobileSearch,
  onDeepSync,
  isRefreshing,
  profiles = [],
  activeProfileId = 'ospiti',
  onChangeProfile,
  onOpenCounterPriceModal,
  shoppingCount = 0,
  onOpenShoppingList,
  onOpenMaestro,
  onGoHome,
  onNavigateRoom,
  onOpenAcademy,
  onOpenNutritionCoach
}) {
  const [altOpen, setAltOpen] = useState(false);
  const altMenuRef = useRef(null);

  const online = status ? status.isOnline !== false && status.dataSource !== 'seed' : isOnline;
  const source = status?.dataSource || dataSource || 'live';
  const isOpen = isMobileSearchOpen ?? mobileSearchOpen;

  useEffect(() => {
    if (!altOpen) return undefined;
    const handleOutside = (e) => {
      if (altMenuRef.current && !altMenuRef.current.contains(e.target)) {
        setAltOpen(false);
      }
    };
    const handleKey = (e) => {
      if (e.key === 'Escape') setAltOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [altOpen]);

  const navItems = [
    {
      id: 'oggi',
      label: 'Oggi',
      isActive: activePhase === 'overview',
      onClick: () => onGoHome?.()
    },
    {
      id: 'offerte',
      label: 'Offerte',
      isActive: activePhase !== 'overview' && activeRoom === 'room-1-negozi',
      onClick: () => onNavigateRoom?.('room-1-negozi')
    },
    {
      id: 'ricette',
      label: 'Ricette',
      isActive: activePhase !== 'overview' && activeRoom === 'room-3-ricette',
      onClick: () => onNavigateRoom?.('room-3-ricette')
    },
    {
      id: 'lista',
      label: 'Lista',
      badge: shoppingCount > 0 ? shoppingCount : null,
      isActive: activePhase !== 'overview' && activeRoom === 'room-6-pianificatore',
      onClick: () => (onOpenShoppingList ? onOpenShoppingList() : onNavigateRoom?.('room-6-pianificatore'))
    }
  ];

  const toolItems = [
    { label: 'Dispensa e Scontrini', action: () => onNavigateRoom?.('room-5-dispensa') },
    { label: 'Database Nutrizionale CREA', action: () => onNavigateRoom?.('room-2-crea') },
    { label: 'Officina Pentole e Cottura', action: () => onNavigateRoom?.('room-4-cucina') },
    { label: 'Chimica e Cura della Casa', action: () => onNavigateRoom?.('room-7-chimica') },
    { label: 'Coach Nutrizionale', action: () => onOpenNutritionCoach?.() },
    { label: 'Scuola Culinaria', action: () => onOpenAcademy?.('skills') }
  ];

  const orderedProfiles =
    profiles.length > 0
      ? [...profiles].sort((a, b) => {
          const rank = { ospiti: 0, dany: 1, barca: 2 };
          return (rank[a.id] ?? 9) - (rank[b.id] ?? 9);
        })
      : [
          { id: 'ospiti', name: 'Standard' },
          { id: 'dany', name: 'Senza latticini' },
          { id: 'barca', name: 'In Barca' }
        ];

  return (
    <header
      className="sticky top-0 z-30 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#E5E2DA]"
      data-testid="consumer-header"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="h-16 flex items-center justify-between gap-4">
          {/* Brand Wordmark */}
          <button
            type="button"
            onClick={() => onGoHome?.()}
            className="inline-flex items-center gap-2.5 text-left cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B5E3A] rounded-lg py-1"
            aria-label="C.I.B.O. — Torna alla Home Oggi"
          >
            <LeafMark />
            <span className="font-editorial text-[22px] sm:text-2xl font-medium tracking-tight text-[#141A17]">
              C.I.B.O.
            </span>
          </button>

          {/* Desktop 4-item Primary Navigation */}
          <nav className="hidden md:flex items-center gap-7" aria-label="Navigazione principale">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                aria-current={item.isActive ? 'page' : undefined}
                className={`relative inline-flex items-center gap-1.5 py-5 text-sm font-medium transition-colors cursor-pointer ${
                  item.isActive
                    ? 'text-[#141A17] after:content-[""] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:bg-[#1B5E3A]'
                    : 'text-[#575E58] hover:text-[#141A17]'
                }`}
              >
                <span>{item.label}</span>
                {item.badge !== null && item.badge !== undefined && (
                  <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#F3F1EC] border border-[#E5E2DA] text-[11px] font-semibold text-[#141A17] tabular-nums">
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* Right Discreet Actions */}
          <div className="flex items-center gap-2 sm:gap-2.5">
            {activeRoom === 'room-1-negozi' && activePhase !== 'overview' && onToggleMobileSearch && (
              <button
                type="button"
                onClick={onToggleMobileSearch}
                className="sm:hidden p-2 text-[#575E58] hover:text-[#141A17] rounded-full hover:bg-[#F3F1EC] cursor-pointer"
                aria-label="Cerca offerte"
                aria-expanded={Boolean(isOpen)}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m1.7-4.8a6.5 6.5 0 11-13 0 6.5 6.5 0 0113 0z" />
                </svg>
              </button>
            )}

            {onOpenMaestro && (
              <button
                type="button"
                onClick={() => onOpenMaestro('')}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs sm:text-sm font-medium text-[#141A17] bg-white hover:bg-[#F3F1EC] border border-[#DFDCD2] taste-btn cursor-pointer"
                title="Chiedi consiglio su cucina, dispensa o spesa"
                aria-label="Chiedi a C.I.B.O."
                data-testid="header-open-maestro"
              >
                <svg
                  className="w-3.5 h-3.5 text-[#1B5E3A]"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8 10h8m-8 4h5m-9 6l1.4-3.7A7.9 7.9 0 014 12c0-4.4 3.8-8 8.5-8S21 7.6 21 12s-3.8 8-8.5 8c-1.3 0-2.5-.3-3.6-.8L4 20Z"
                  />
                </svg>
                <span>Chiedi</span>
              </button>
            )}

            {/* Secondary Drawer Menu: Altro */}
            <div className="relative" ref={altMenuRef}>
              <button
                type="button"
                onClick={() => setAltOpen((prev) => !prev)}
                aria-expanded={altOpen}
                aria-haspopup="menu"
                data-testid="header-alt-menu-btn"
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs sm:text-sm font-medium text-[#575E58] hover:text-[#141A17] hover:bg-[#F3F1EC] border border-transparent hover:border-[#E5E2DA] transition-colors cursor-pointer"
              >
                <span>Altro</span>
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${altOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.8}
                  aria-hidden="true"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {altOpen && (
                <div
                  role="menu"
                  aria-label="Strumenti avanzati e preferenze"
                  data-testid="header-alt-menu"
                  className="absolute right-0 mt-2 w-72 bg-white border border-[#E5E2DA] rounded-2xl shadow-lg p-3 z-50 space-y-3"
                >
                  <div className="space-y-0.5">
                    <p className="px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#575E58]">
                      Strumenti di casa
                    </p>
                    {toolItems.map((tool) => (
                      <button
                        key={tool.label}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAltOpen(false);
                          tool.action();
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-sm text-[#141A17] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
                      >
                        {tool.label}
                      </button>
                    ))}
                  </div>

                  <div className="border-t border-[#E5E2DA] pt-3 space-y-2">
                    {onChangeProfile && (
                      <div className="px-2.5 space-y-1">
                        <label
                          htmlFor="active-profile-select"
                          className="block text-[11px] font-semibold uppercase tracking-wider text-[#575E58]"
                        >
                          Preferenze alimentari
                        </label>
                        <select
                          id="active-profile-select"
                          value={activeProfileId}
                          onChange={(e) => onChangeProfile(e.target.value)}
                          className="w-full text-xs font-medium bg-[#FAF9F6] text-[#141A17] border border-[#DFDCD2] rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer"
                        >
                          {orderedProfiles.map((p) => (
                            <option key={p.id} value={p.id}>
                              {PROFILE_LABELS[p.id] || p.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {onOpenCounterPriceModal && (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAltOpen(false);
                          onOpenCounterPriceModal();
                        }}
                        className="w-full text-left px-2.5 py-2 rounded-lg text-xs font-medium text-[#141A17] hover:bg-[#F3F1EC] transition-colors cursor-pointer"
                      >
                        Registra prezzo al banco
                      </button>
                    )}

                    {onDeepSync && (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={isRefreshing}
                        onClick={() => {
                          setAltOpen(false);
                          onDeepSync();
                        }}
                        className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-xs font-medium text-[#575E58] hover:text-[#141A17] hover:bg-[#F3F1EC] transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        <span>{isRefreshing ? 'Aggiornamento in corso…' : 'Aggiorna volantini Rapallo'}</span>
                        <span className="inline-flex items-center gap-1.5 text-[11px]">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              online ? 'bg-[#1B5E3A]' : 'bg-[#9A5B25]'
                            }`}
                          />
                          {online ? 'Live' : source === 'cache' ? 'Locale' : 'Offline'}
                        </span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile 4-item Sub-Row */}
        <nav
          className="md:hidden flex items-center justify-between border-t border-[#E5E2DA] -mx-4 px-4"
          aria-label="Navigazione mobile"
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              aria-current={item.isActive ? 'page' : undefined}
              className={`relative flex-1 inline-flex items-center justify-center gap-1 py-2.5 text-xs font-medium cursor-pointer ${
                item.isActive
                  ? 'text-[#141A17] after:content-[""] after:absolute after:inset-x-4 after:bottom-0 after:h-[2px] after:bg-[#1B5E3A]'
                  : 'text-[#575E58]'
              }`}
            >
              <span>{item.label}</span>
              {item.badge !== null && item.badge !== undefined && (
                <span className="px-1.5 py-0.2 rounded-full bg-[#F3F1EC] border border-[#E5E2DA] text-[10px] font-semibold text-[#141A17] tabular-nums">
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </div>
    </header>
  );
}

export default Header;
