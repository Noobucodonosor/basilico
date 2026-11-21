import React, { useEffect, useState } from 'react';
import { BASILICO_PHASES } from '../RoomNavigation.jsx';

/**
 * Panoramica editoriale d'ingresso del Ciclo Causale Domestico (ADR-0016 / TASK-UX-01).
 * Ordine causale reale: Prima sai -> poi compri -> poi metti in casa -> poi cucini e pulisci.
 */
export function CycleOverviewView({
  status = null,
  activeProfile = null,
  shoppingCount = 0,
  onSelectPhase,
  onNavigateRoom,
  onOpenMaestro,
  onTriggerSync,
  onCookWithIngredient
}) {
  const [pantrySummary, setPantrySummary] = useState(null);
  const [topOffers, setTopOffers] = useState([]);

  useEffect(() => {
    let active = true;
    fetch('/api/pantry')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!active || !data) return;
        const items = Array.isArray(data.items) ? data.items : [];
        const expiringItems = items.filter((it) => {
          const exp = it?.expiresAt ? Date.parse(it.expiresAt) : NaN;
          return Number.isFinite(exp) && exp - Date.now() <= 48 * 3600 * 1000;
        });
        setPantrySummary({
          totalItems: items.length,
          expiringCount: expiringItems.length,
          expiringNames: expiringItems.slice(0, 3).map((it) => it.title)
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const profileParam = activeProfile?.id ? `&profileId=${encodeURIComponent(activeProfile.id)}` : '';
    fetch(`/api/offers?limit=3&sortBy=discountDesc&hideIncompatible=true${profileParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && Array.isArray(data?.offers)) {
          setTopOffers(data.offers.slice(0, 3));
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [activeProfile?.id]);

  const offerCount = typeof status?.offerCount === 'number' ? status.offerCount : null;
  const storeCount = typeof status?.storeCount === 'number' ? status.storeCount : 14;
  const seedNeedsRefresh = Boolean(status?.seedHealth?.seedNeedsRefresh);
  const dataSourceLabel =
    status?.dataSource === 'live' ? 'Volantini Rapallo aggiornati' : 'Catalogo locale offline';

  const nextStepHint =
    pantrySummary && pantrySummary.expiringCount > 0
      ? `In scadenza entro 48h: ${pantrySummary.expiringNames.join(', ')}. Usali in Fase 4 prima che vadano persi.`
      : shoppingCount > 0
        ? `Hai ${shoppingCount} articoli in Lista Spesa: verifica offerte e tappe migliori a Rapallo in Fase 2.`
        : 'Parti dai principi nutrizionali e dagli obiettivi (Fase 1) oppure esplora le offerte attive a Rapallo (Fase 2).';

  const phaseCards = BASILICO_PHASES.filter((p) => p.id !== 'overview');

  return (
    <div className="space-y-6 taste-enter" data-testid="cycle-overview-view">
      {/* Hero editoriale split con fotografia reale */}
      <section className="bg-white border border-[#E5E2DA] rounded-2xl overflow-hidden">
        <div className="grid grid-cols-1 lg:grid-cols-12">
          <div className="lg:col-span-8 p-5 sm:p-7 flex flex-col justify-between gap-4">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-xs font-bold uppercase tracking-wider text-[#1B5E3A]">
                  Ciclo Causale Domestico · Rapallo 16035
                </p>
                {activeProfile && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[#F3F1EC] text-[#141A17] border border-[#DFDCD2]">
                    👤 {activeProfile.name}
                  </span>
                )}
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-[#141A17] tracking-tight leading-tight">
                Prima sai, poi compri, poi metti in casa, poi cucini e pulisci.
              </h1>
              <p className="text-sm text-[#4A524C] max-w-2xl leading-relaxed">
                Ogni fase alimenta la successiva con dati reali su nutrizione CREA, volantini di Rapallo,
                scontrini al centesimo e chimica domestica sicura.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {pantrySummary && pantrySummary.expiringCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    onCookWithIngredient && pantrySummary.expiringNames[0]
                      ? onCookWithIngredient(pantrySummary.expiringNames[0])
                      : onNavigateRoom('room-3-ricette')
                  }
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-[#9A5B25] hover:bg-[#7F4A1D] text-white taste-btn cursor-pointer"
                >
                  <span>⏱️ Cucina {pantrySummary.expiringNames[0] || 'freschi in scadenza'} →</span>
                </button>
              )}
              {seedNeedsRefresh && onTriggerSync && (
                <button
                  type="button"
                  onClick={onTriggerSync}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold bg-[#F3F1EC] hover:bg-[#E7E4DC] text-[#141A17] border border-[#DFDCD2] taste-btn cursor-pointer"
                >
                  <span>🔄 Aggiorna volantini live</span>
                </button>
              )}
              {onOpenMaestro && (
                <button
                  type="button"
                  onClick={() => onOpenMaestro('Aiutami a orientarmi nel ciclo di oggi')}
                  className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-[#141A17] text-white hover:bg-[#1B5E3A] taste-btn cursor-pointer"
                >
                  <span aria-hidden="true">🌿</span>
                  <span>Chiedi al Maestro</span>
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-4 relative min-h-[180px] lg:min-h-full bg-[#F3F1EC] border-t lg:border-t-0 lg:border-l border-[#E5E2DA]">
            <img
              src="/assets/img/photo-m61660576-960.jpg"
              alt="Ingredienti freschi di cucina mediterranea"
              className="w-full h-full object-cover max-h-60 lg:max-h-none"
              loading="eager"
            />
          </div>
        </div>

        {/* 3 Indicatori reali dello stato della casa */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-5 sm:px-7 bg-[#FAF9F6] border-t border-[#E5E2DA]">
          <div className="bg-white border border-[#E5E2DA] rounded-xl p-3.5">
            <div className="text-xs font-semibold text-[#575E58]">Mercato Rapallo ({storeCount} insegne)</div>
            <div className="text-lg font-extrabold text-[#141A17] mt-0.5">
              {offerCount !== null ? `${offerCount} offerte attive` : 'Catalogo Rapallo pronto'}
            </div>
            <div className="text-xs text-[#575E58] mt-1">
              {dataSourceLabel}
              {seedNeedsRefresh ? ' · consigliato sync live' : ''}
            </div>
          </div>

          <div className="bg-white border border-[#E5E2DA] rounded-xl p-3.5">
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

      {/* Top 3 Occasioni Compatibili a Rapallo (Azionabili in 1 click) */}
      {topOffers.length > 0 && (
        <section aria-label="Migliori offerte compatibili a Rapallo" className="bg-white border border-[#E5E2DA] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#1B5E3A]">
                Selezione Rapallo · Compatibile col profilo
              </span>
              <h2 className="text-base font-extrabold text-[#141A17]">
                🏷️ Occasioni in evidenza nei negozi della città
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateRoom('room-1-negozi')}
              className="text-xs font-bold text-[#1B5E3A] hover:underline cursor-pointer shrink-0"
            >
              Tutte le offerte →
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {topOffers.map((off) => (
              <button
                key={off.id}
                type="button"
                onClick={() => onNavigateRoom('room-1-negozi')}
                className="p-3.5 rounded-xl bg-[#FAF9F6] hover:bg-[#F3F1EC] border border-[#E5E2DA] text-left flex items-center justify-between gap-3 taste-card cursor-pointer"
              >
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#141A17] truncate">{off.title}</div>
                  <div className="text-[11px] text-[#575E58] truncate mt-0.5">
                    {off.storeName || off.chainId}
                    {off.unitPrice ? ` · ${off.unitPrice}` : ''}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-extrabold text-[#1B5E3A]">
                    €{Number(off.promoPrice || 0).toFixed(2).replace('.', ',')}
                  </div>
                  {off.discountPercentage > 0 && (
                    <span className="inline-block text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#1B5E3A] text-white">
                      -{off.discountPercentage}%
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      )}

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
