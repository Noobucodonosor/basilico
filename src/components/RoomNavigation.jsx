import React from 'react';

export const BASILICO_ROOMS = [
  {
    id: 'room-1-negozi',
    number: 1,
    icon: '🏪',
    shortTitle: 'Negozi & Offerte',
    fullTitle: '1. Negozi & Offerte Rapallo',
    subtitle: '14+ insegne, 5 domini, €/kg sgocciolato e Lente Qualità'
  },
  {
    id: 'room-2-crea',
    number: 2,
    icon: '🔬',
    shortTitle: 'Scienza & CREA',
    fullTitle: '2. Scienza & CREA',
    subtitle: '832 alimenti ufficiali × 7 sezioni, Crudo↔Cotto e Nutrienti/€'
  },
  {
    id: 'room-3-ricette',
    number: 3,
    icon: '🍽️',
    shortTitle: 'Ricette & Fornelli',
    fullTitle: '3. Ricette, Ristoranti & Fornelli',
    subtitle: 'Scuola base, 32 ristoranti Tigullio, Arbitraggio, 80/20 e Fornelli'
  },
  {
    id: 'room-4-cucina',
    number: 4,
    icon: '🍳',
    shortTitle: 'Cucina & Pulizia',
    fullTitle: '4. Cucina, Pentole & Pulizia',
    subtitle: 'Fornello, ROI Pentole sbloccate e Kitchen Reset chimico (Tigotà/PiùMe)'
  },
  {
    id: 'room-5-dispensa',
    number: 5,
    icon: '🥫',
    shortTitle: 'Dispensa & Scontrini',
    fullTitle: '5. Dispensa & Scontrini',
    subtitle: 'Scontrini al centesimo, 3 zone (Secca, Frigo, Barca) e orologio T_open'
  },
  {
    id: 'room-6-pianificatore',
    number: 6,
    icon: '🛒',
    shortTitle: 'Pianificatore & Spesa',
    fullTitle: '6. Pianificatore & Lista Spesa',
    subtitle: '6 Neo-Diete, confezioni intere zero-spreco, 1/2/3 negozi e In Corsia'
  }
];

export function RoomNavigation({ activeRoom, onSelectRoom }) {
  return (
    <nav
      aria-label="Navigazione 6 Stanze Principali di Basilico"
      className="bg-slate-900 text-white border-b border-slate-800 sm:sticky sm:top-16 z-20 shadow-xs relative"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative">
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 pr-8 lg:pr-0 no-scrollbar">
          {BASILICO_ROOMS.map((room) => {
            const isActive = activeRoom === room.id;
            return (
              <button
                key={room.id}
                type="button"
                onClick={() => onSelectRoom(room.id)}
                title={room.subtitle}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-xs ring-1 ring-emerald-400'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800'
                }`}
              >
                <span aria-hidden="true">{room.icon}</span>
                <span>{room.shortTitle}</span>
              </button>
            );
          })}
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none lg:hidden absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-slate-900 via-slate-900/70 to-transparent"
        />
      </div>
    </nav>
  );
}

export default RoomNavigation;
