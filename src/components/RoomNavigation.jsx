import React from 'react';

/**
 * Basilico — Causal Cycle Navigation Shell (ADR-0016 / TASK-CICLO-01)
 *  - `BASILICO_PHASES`: Panoramica + 4 Fasi del Ciclo Causale Domestico (`?phase=1..4`)
 *  - `BASILICO_ROOMS`:  7 Stanze dell'Atlante (deep-linkable via `?room=room-X-...`)
 */

export const BASILICO_PHASES = [
  {
    id: 'overview',
    number: 0,
    icon: '🌿',
    shortTitle: 'Panoramica',
    fullTitle: '🌿 Panoramica Ciclo',
    subtitle: 'Stato reale della casa: offerte attive a Rapallo, scorte in dispensa e prossimo passo',
    rooms: []
  },
  {
    id: 'phase-1',
    number: 1,
    icon: '🔬',
    shortTitle: '1. Sapere & Obiettivi',
    fullTitle: '1. Sapere & Obiettivi',
    subtitle: 'Nutrizione scientifica CREA, biodisponibilità, Coach nutrizionale e Scuola culinaria',
    rooms: [
      { id: 'room-2-crea', icon: '🔬', label: 'Scienza & CREA' }
    ],
    extraPanels: [
      { id: 'nutrition', icon: '🥗', label: 'Coach Nutrizionale' },
      { id: 'academy', icon: '👨‍🍳', label: 'Scuola Culinaria & SOS' }
    ]
  },
  {
    id: 'phase-2',
    number: 2,
    icon: '🏪',
    shortTitle: '2. Mercato & Spesa',
    fullTitle: '2. Mercato & Spesa',
    subtitle: '14+ insegne di Rapallo, prezzi €/kg edibili, Pianificatore Neo-Dieta e tappe €/h',
    rooms: [
      { id: 'room-1-negozi', icon: '🏪', label: 'Negozi & Offerte Rapallo' },
      { id: 'room-6-pianificatore', icon: '🛒', label: 'Pianificatore & Spesa' }
    ],
    extraPanels: []
  },
  {
    id: 'phase-3',
    number: 3,
    icon: '🥫',
    shortTitle: '3. Dispensa & Casa',
    fullTitle: '3. Dispensa & Dotazione Casa',
    subtitle: 'Scontrini al centesimo, storico prezzi, dispensa a 3 zone e Officina Pentole/Lame',
    rooms: [
      { id: 'room-5-dispensa', icon: '🥫', label: 'Dispensa & Scontrini' },
      { id: 'room-4-cucina', icon: '🍳', label: 'Officina Cucina' }
    ],
    extraPanels: []
  },
  {
    id: 'phase-4',
    number: 4,
    icon: '🍽️',
    shortTitle: '4. Cucina & Pulizie',
    fullTitle: '4. Azione: Cucina & Pulizie',
    subtitle: 'Ricette da dispensa reale, Ristoranti Provincia GE, Fornelli e Chimica Casa/Barca',
    rooms: [
      { id: 'room-3-ricette', icon: '🍽️', label: 'Ricette, Ristoranti & Fornelli' },
      { id: 'room-7-chimica', icon: '🧪', label: 'Chimica Casa & Barca' }
    ],
    extraPanels: []
  }
];

export const VALID_PHASE_IDS = new Set(BASILICO_PHASES.map((p) => p.id));

export const BASILICO_ROOMS = [
  {
    id: 'room-1-negozi',
    phaseId: 'phase-2',
    number: 1,
    icon: '🏪',
    shortTitle: 'Negozi & Offerte',
    fullTitle: '1. Negozi & Offerte Rapallo',
    subtitle: '14+ insegne, 5 domini merceologici, €/kg sgocciolato e Lente Qualità'
  },
  {
    id: 'room-2-crea',
    phaseId: 'phase-1',
    number: 2,
    icon: '🔬',
    shortTitle: 'Scienza & CREA',
    fullTitle: '2. Scienza & CREA',
    subtitle: '832 alimenti ufficiali × 7 sezioni, Crudo↔Cotto, Nutrienti/€ e Coach Nutrizionale'
  },
  {
    id: 'room-3-ricette',
    phaseId: 'phase-4',
    number: 3,
    icon: '🍽️',
    shortTitle: 'Ricette & Fornelli',
    fullTitle: '3. Ricette, Ristoranti & Fornelli',
    subtitle: 'Scuola base, ristoranti Provincia di Genova (Genova, Golfo Paradiso, Tigullio & Entroterra) vs spesa a Rapallo, Arbitraggio, 80/20 e Fornelli'
  },
  {
    id: 'room-4-cucina',
    phaseId: 'phase-3',
    number: 4,
    icon: '🍳',
    shortTitle: 'Officina Cucina',
    fullTitle: '4. Officina Cucina: Fornelli, Pentole & Lame',
    subtitle: 'Fornello, fisica delle pentole, piatti sbloccati, lame, contenitori e pulizia post-cottura'
  },
  {
    id: 'room-5-dispensa',
    phaseId: 'phase-3',
    number: 5,
    icon: '🥫',
    shortTitle: 'Dispensa & Scontrini',
    fullTitle: '5. Dispensa & Scontrini',
    subtitle: 'Scontrini al centesimo, 3 zone (Secca, Frigo, Barca), durata dopo apertura e freschi in scadenza'
  },
  {
    id: 'room-6-pianificatore',
    phaseId: 'phase-2',
    number: 6,
    icon: '🛒',
    shortTitle: 'Pianificatore & Spesa',
    fullTitle: '6. Pianificatore & Lista Spesa',
    subtitle: '6 Neo-Diete, confezioni intere zero-spreco, 1/2/3 negozi e In Corsia'
  },
  {
    id: 'room-7-chimica',
    phaseId: 'phase-4',
    number: 7,
    icon: '🧪',
    shortTitle: 'Chimica Casa',
    fullTitle: '7. Chimica & Cura della Casa/Barca',
    subtitle: 'Smacchiatore guidato, i 7 prodotti base, acqua Rapallo 14–22 °f, elettrodomestici, barca e sicurezza'
  }
];

export function getPhaseForRoom(roomId) {
  const room = BASILICO_ROOMS.find((r) => r.id === roomId);
  return room ? room.phaseId : 'phase-2';
}

/**
 * Single linear navigation bar for the 4 Causal Cycle Phases + Panoramica + Quick Room Jump.
 */
export function CausalPhaseNavigation({ activePhase, onSelectPhase, activeRoom, onSelectRoom }) {
  return (
    <nav
      aria-label="Ciclo Causale Domestico di Basilico"
      className="bg-[#FAF9F6] text-[#141A17] border-b border-[#E5E2DA]"
      data-testid="causal-phase-navigation"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-2 flex flex-wrap items-center gap-2">
        <div className="w-full lg:w-auto lg:flex-1 flex items-center gap-1.5 overflow-x-auto no-scrollbar" role="tablist">
          {BASILICO_PHASES.map((phase) => {
            const isActive = activePhase === phase.id;
            return (
              <button
                key={phase.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onSelectPhase(phase.id)}
                title={phase.subtitle}
                className={`min-h-[38px] sm:min-h-0 flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap taste-btn cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-[#141A17] text-white shadow-xs'
                    : 'text-[#4A524C] hover:text-[#141A17] hover:bg-[#EFECE6]'
                }`}
              >
                <span aria-hidden="true">{phase.icon}</span>
                <span>{phase.shortTitle}</span>
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
              value={activePhase !== 'overview' && activeRoom ? activeRoom : ''}
              onChange={(e) => {
                if (e.target.value) onSelectRoom(e.target.value);
              }}
              className="w-full sm:w-auto sm:max-w-[190px] min-h-[38px] sm:min-h-0 text-xs font-semibold bg-[#F3F1EC] text-[#141A17] border border-[#DFDCD2] rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer"
              title="Accesso rapido alle 7 Stanze"
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

export function RoomNavigation({ activeRoom, onSelectRoom, rooms = BASILICO_ROOMS }) {
  return (
    <nav
      aria-label="Navigazione 7 Stanze dell'Atlante di Basilico"
      className="bg-white text-[#141A17] border-b border-[#E5E2DA] sm:sticky sm:top-16 z-20 relative"
      data-testid="room-navigation"
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 relative">
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 pr-8 lg:pr-0 no-scrollbar">
          {rooms.map((room) => {
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
