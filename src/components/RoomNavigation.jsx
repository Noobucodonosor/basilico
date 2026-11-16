import React from 'react';

/**
 * Basilico 2.0 — Navigation Shell (ADR-0015 / TASK-V2-05)
 *  - `BASILICO_RHYTHMS`: the 3 Daily Rhythms (⚡ Oggi · 🧭 Regia Settimanale · 🎓 Accademia & Atlante)
 *  - `BASILICO_ROOMS`:   the 7 Rooms of the Atlas (deep-linkable via `?room=room-X-...`)
 */

export const BASILICO_RHYTHMS = [
  {
    id: 'oggi',
    icon: '⚡',
    shortTitle: 'Oggi',
    fullTitle: '⚡ Oggi (Co-pilota)',
    subtitle: 'Stasera in cucina in 5 secondi: tre proposte su misura, freschi in scadenza, SOS Fornelli e Smacchiatore'
  },
  {
    id: 'regia',
    icon: '🧭',
    shortTitle: 'Regia',
    fullTitle: '🧭 Regia Settimanale',
    subtitle: 'Weekend in 10 minuti: andamento prezzi, controllo frigo rapido, cotture multiple e giro spesa'
  },
  {
    id: 'atlante',
    icon: '🎓',
    shortTitle: 'Accademia & Atlante',
    fullTitle: '🎓 Accademia & Atlante',
    subtitle: 'Scuola culinaria scientifica, Coach nutrizionale e le 7 Stanze di Basilico'
  }
];

export const VALID_RHYTHM_IDS = new Set(BASILICO_RHYTHMS.map((r) => r.id));

export const BASILICO_ROOMS = [
  {
    id: 'room-1-negozi',
    number: 1,
    icon: '🏪',
    shortTitle: 'Negozi & Offerte',
    fullTitle: '1. Negozi & Offerte Rapallo',
    subtitle: '14+ insegne, 5 domini merceologici, €/kg sgocciolato e Lente Qualità'
  },
  {
    id: 'room-2-crea',
    number: 2,
    icon: '🔬',
    shortTitle: 'Scienza & CREA',
    fullTitle: '2. Scienza & CREA',
    subtitle: '832 alimenti ufficiali × 7 sezioni, Crudo↔Cotto, Nutrienti/€ e Coach Nutrizionale'
  },
  {
    id: 'room-3-ricette',
    number: 3,
    icon: '🍽️',
    shortTitle: 'Ricette & Fornelli',
    fullTitle: '3. Ricette, Ristoranti & Fornelli',
    subtitle: 'Scuola base, ristoranti Provincia di Genova (Genova, Golfo Paradiso, Tigullio & Entroterra) vs spesa a Rapallo, Arbitraggio, 80/20 e Fornelli'
  },
  {
    id: 'room-4-cucina',
    number: 4,
    icon: '🍳',
    shortTitle: 'Officina Cucina',
    fullTitle: '4. Officina Cucina: Fornelli, Pentole & Lame',
    subtitle: 'Fornello, fisica delle pentole, piatti sbloccati, lame, contenitori e pulizia post-cottura'
  },
  {
    id: 'room-5-dispensa',
    number: 5,
    icon: '🥫',
    shortTitle: 'Dispensa & Scontrini',
    fullTitle: '5. Dispensa & Scontrini',
    subtitle: 'Scontrini al centesimo, 3 zone (Secca, Frigo, Barca), durata dopo apertura e freschi in scadenza'
  },
  {
    id: 'room-6-pianificatore',
    number: 6,
    icon: '🛒',
    shortTitle: 'Pianificatore & Spesa',
    fullTitle: '6. Pianificatore & Lista Spesa',
    subtitle: '6 Neo-Diete, confezioni intere zero-spreco, 1/2/3 negozi e In Corsia'
  },
  {
    id: 'room-7-chimica',
    number: 7,
    icon: '🧪',
    shortTitle: 'Chimica Casa',
    fullTitle: '7. Chimica & Cura della Casa/Barca',
    subtitle: 'Smacchiatore guidato, i 7 prodotti base, acqua Rapallo 14–22 °f, elettrodomestici, barca e sicurezza'
  }
];

/**
 * Top-level bar of the 3 Daily Rhythms + always-available quick jump to any of the 7 Rooms.
 */
export function RhythmNavigation({ activeRhythm, onSelectRhythm, activeRoom, onSelectRoom }) {
  return (
    <nav
      aria-label="I 3 Ritmi Quotidiani di Basilico"
      className="bg-[#FAF9F6] text-[#141A17] border-b border-[#E5E2DA]"
      data-testid="rhythm-navigation"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2">
        <div className="w-full sm:w-auto sm:flex-1 flex flex-wrap items-center gap-1.5" role="tablist">
          {BASILICO_RHYTHMS.map((r) => {
            const isActive = activeRhythm === r.id;
            return (
              <button
                key={r.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectRhythm(r.id)}
                title={r.subtitle}
                className={`min-h-[38px] sm:min-h-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap taste-btn cursor-pointer ${
                  isActive
                    ? 'bg-[#141A17] text-white shadow-xs'
                    : 'text-[#4A524C] hover:text-[#141A17] hover:bg-[#EFECE6]'
                }`}
              >
                <span aria-hidden="true">{r.icon}</span>
                <span>{r.shortTitle}</span>
              </button>
            );
          })}
        </div>

        {onSelectRoom && (
          <div className="w-full sm:w-auto shrink-0">
            <label htmlFor="quick-room-select" className="sr-only">
              Vai direttamente a una delle 7 Stanze
            </label>
            <select
              id="quick-room-select"
              value={activeRhythm === 'atlante' && activeRoom ? activeRoom : ''}
              onChange={(e) => {
                if (e.target.value) onSelectRoom(e.target.value);
              }}
              className="w-full sm:w-auto sm:max-w-[190px] min-h-[38px] sm:min-h-0 text-xs font-semibold bg-[#F3F1EC] text-[#141A17] border border-[#DFDCD2] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer"
              title="Accesso rapido alle 7 Stanze dell'Atlante"
            >
              <option value="">🗂️ Vai alla Stanza…</option>
              {BASILICO_ROOMS.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.icon} {room.number}. {room.shortTitle}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </nav>
  );
}

export function RoomNavigation({ activeRoom, onSelectRoom }) {
  return (
    <nav
      aria-label="Navigazione 7 Stanze dell'Atlante di Basilico"
      className="bg-white text-[#141A17] border-b border-[#E5E2DA] sm:sticky sm:top-16 z-20 relative"
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
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap taste-btn cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#1B5E3A] text-white shadow-xs'
                    : 'text-[#4A524C] hover:text-[#141A17] hover:bg-[#F3F1EC]'
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
          className="pointer-events-none lg:hidden absolute right-0 top-0 bottom-0 w-10 bg-gradient-to-l from-white via-white/80 to-transparent"
        />
      </div>
    </nav>
  );
}

export default RoomNavigation;
