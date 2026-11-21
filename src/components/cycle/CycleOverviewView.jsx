import React, { useEffect, useState } from 'react';
import { BASILICO_PHASES } from '../RoomNavigation.jsx';

/**
 * Panoramica sobria d'ingresso del Ciclo Causale Domestico (ADR-0016 / TASK-CICLO-01).
 * Ordine causale reale: Prima sai -> poi compri -> poi metti in casa -> poi cucini e pulisci.
 */
export function CycleOverviewView({
  status = null,
  activeProfile = null,
  shoppingCount = 0,
  onSelectPhase,
  onNavigateRoom,
  onOpenMaestro
}) {
  const [pantrySummary, setPantrySummary] = useState(null);

  useEffect(() => {
    let active = true;
    fetch('/api/pantry')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const items = Array.isArray(data.items) ? data.items : [];
        const expiringCount = items.filter((it) => {
          const exp = it?.expiresAt ? Date.parse(it.expiresAt) : NaN;
          return Number.isFinite(exp) && exp - Date.now() <= 48 * 3600 * 1000;
        }).length;
        setPantrySummary({ totalItems: items.length, expiringCount });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const offerCount = typeof status?.offerCount === 'number' ? status.offerCount : null;
  const storeCount = typeof status?.storeCount === 'number' ? status.storeCount : 14;
  const seedNeedsRefresh = Boolean(status?.seedHealth?.seedNeedsRefresh);
  const dataSourceLabel =
    status?.dataSource === 'live' ? 'Volantini Rapallo aggiornati' : 'Catalogo locale offline';

  const nextStepHint =
    pantrySummary && pantrySummary.expiringCount > 0
      ? `Hai ${pantrySummary.expiringCount} scorte fresche in scadenza entro 48h: controlla la Fase 3 o cucina subito in Fase 4.`
      : shoppingCount > 0
        ? `Hai ${shoppingCount} articoli in Lista Spesa: verifica le offerte e le tappe migliori a Rapallo in Fase 2.`
        : 'Parti dai principi nutrizionali e dagli obiettivi della casa (Fase 1) oppure esplora le offerte attive a Rapallo (Fase 2).';

  const phaseCards = BASILICO_PHASES.filter((p) => p.id !== 'overview');

  return (
    <div className="space-y-6" data-testid="cycle-overview-view">
      {/* Intestazione editoriale sobria */}
      <section className="bg-white border border-[#E5E2DA] rounded-2xl p-5 sm:p-7">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <p className="text-xs font-bold uppercase tracking-wider text-[#1B5E3A]">
              Ciclo Causale Domestico · Rapallo 16035
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141A17] tracking-tight">
              Prima sai, poi compri, poi metti in casa, poi cucini e pulisci.
            </h1>
            <p className="text-sm text-[#4A524C] max-w-2xl">
              {activeProfile
                ? `Profilo attivo: ${activeProfile.name}. `
                : ''}
              Ogni fase alimenta la successiva con dati reali su nutrizione CREA, prezzi a Rapallo,
              scorte in dispensa e chimica sicura.
            </p>
          </div>
          {onOpenMaestro && (
            <button
              type="button"
              onClick={() => onOpenMaestro('Aiutami a orientarmi nel ciclo di oggi')}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs sm:text-sm font-bold bg-[#141A17] text-white hover:bg-[#1B5E3A] taste-btn cursor-pointer shrink-0"
            >
              <span aria-hidden="true">🌿</span>
              <span>Chiedi al Maestro</span>
            </button>
          )}
        </div>

        {/* 3 Indicatori reali dello stato della casa */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5 pt-5 border-t border-[#E5E2DA]">
          <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-xl p-3.5">
            <div className="text-xs font-semibold text-[#575E58]">Mercato Rapallo ({storeCount} insegne)</div>
            <div className="text-lg font-extrabold text-[#141A17] mt-0.5">
              {offerCount !== null ? `${offerCount} offerte attive` : 'Catalogo Rapallo pronto'}
            </div>
            <div className="text-xs text-[#575E58] mt-1">
              {dataSourceLabel}
              {seedNeedsRefresh ? ' · consigliato sync live' : ''}
            </div>
          </div>

          <div className="bg-[#FAF9F6] border border-[#E5E2DA] rounded-xl p-3.5">
            <div className="text-xs font-semibold text-[#575E58]">Dispensa &amp; Lista Spesa</div>
            <div className="text-lg font-extrabold text-[#141A17] mt-0.5">
              {pantrySummary ? `${pantrySummary.totalItems} scorte in casa` : '3 zone attive'}
            </div>
            <div className="text-xs text-[#575E58] mt-1">
              {shoppingCount > 0 ? `${shoppingCount} articoli in lista spesa` : 'Secca, Frigo e Barca sincronizzate'}
            </div>
          </div>

          <div className="bg-[#F3F1EC] border border-[#DFDCD2] rounded-xl p-3.5">
            <div className="text-xs font-semibold text-[#1B5E3A]">Prossimo passo logico</div>
            <p className="text-xs sm:text-sm font-medium text-[#141A17] mt-1 leading-snug">
              {nextStepHint}
            </p>
          </div>
        </div>
      </section>

      {/* Le 4 Fasi lineari del Ciclo */}
      <section aria-label="Le 4 Fasi del Ciclo Causale" className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {phaseCards.map((phase) => (
          <article
            key={phase.id}
            className="bg-white border border-[#E5E2DA] rounded-2xl p-5 flex flex-col justify-between gap-4 hover:border-[#1B5E3A]/50 transition-colors"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-[#1B5E3A]">
                  <span aria-hidden="true">{phase.icon}</span>
                  <span>Fase {phase.number}</span>
                </span>
                <button
                  type="button"
                  onClick={() => onSelectPhase(phase.id)}
                  className="text-xs font-bold text-[#1B5E3A] hover:underline cursor-pointer"
                >
                  Apri fase →
                </button>
              </div>
              <h2 className="text-lg font-extrabold text-[#141A17]">{phase.shortTitle}</h2>
              <p className="text-sm text-[#4A524C] leading-relaxed">{phase.subtitle}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[#F0EDE6]">
              {phase.rooms.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onNavigateRoom(r.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] taste-btn cursor-pointer"
                >
                  <span aria-hidden="true">{r.icon}</span>
                  <span>{r.label}</span>
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}

export default CycleOverviewView;
