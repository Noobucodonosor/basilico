import React, { useCallback, useEffect, useState } from 'react';
import DishDetailDrawer from './DishDetailDrawer.jsx';

function formatEuro(val) {
  const num = Number(val);
  if (!Number.isFinite(num)) return '€ 0,00';
  return `€ ${num.toFixed(2).replace('.', ',')}`;
}

export function CycleOverviewView({
  activeProfileId = 'ospiti',
  onChangeProfile,
  onNavigateRoom,
  onAddToShoppingList
}) {
  const [copilot, setCopilot] = useState(null);
  const [loadingProposals, setLoadingProposals] = useState(true);
  const [proposalsError, setProposalsError] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedDish, setSelectedDish] = useState(null);
  const [featuredOffers, setFeaturedOffers] = useState([]);

  const retryProposals = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoadingProposals(true);
    setProposalsError(false);
    const profileParam = encodeURIComponent(activeProfileId || 'ospiti');
    fetch(`/api/maestro/today-copilot?profileId=${profileParam}&rhythmPreset=feriale`, {
      signal: ctrl.signal
    })
      .then((r) => {
        if (!r.ok) throw new Error('Copilot request failed');
        return r.json();
      })
      .then((data) => {
        if (!ctrl.signal.aborted && data) {
          setCopilot(data);
        }
      })
      .catch(() => {
        if (!ctrl.signal.aborted) {
          setProposalsError(true);
        }
      })
      .finally(() => {
        if (!ctrl.signal.aborted) setLoadingProposals(false);
      });

    return () => ctrl.abort();
  }, [activeProfileId, reloadToken]);

  useEffect(() => {
    const ctrl = new AbortController();
    const profileParam = encodeURIComponent(activeProfileId || 'ospiti');
    fetch(`/api/offers?limit=4&sortBy=discountDesc&hideIncompatible=true&profileId=${profileParam}`, {
      signal: ctrl.signal
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!ctrl.signal.aborted && Array.isArray(data?.offers)) {
          setFeaturedOffers(data.offers.slice(0, 4));
        }
      })
      .catch(() => {});

    return () => ctrl.abort();
  }, [activeProfileId]);

  const proposals = Array.isArray(copilot?.tonightParetoCards)
    ? copilot.tonightParetoCards.slice(0, 3)
    : [];

  const isDairyFree = activeProfileId === 'casa' || activeProfileId === 'barca';

  return (
    <div className="space-y-14 sm:space-y-16" data-testid="cycle-overview-view">
      {/* Section 1: Editorial Hero */}
      <section
        data-enter=""
        className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center pt-4 sm:pt-8 pb-10 sm:pb-14 border-b border-[#E5E2DA]"
      >
        <div className="lg:col-span-7 space-y-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1B5E3A]">
            Rapallo · Cucina di casa
          </p>
          <h1 className="font-editorial text-4xl sm:text-5xl lg:text-[54px] font-normal text-[#141A17] tracking-tight leading-[1.08]">
            Cosa cucini stasera?
          </h1>
          <p className="text-base sm:text-lg text-[#575E58] max-w-xl leading-relaxed">
            Tre piatti scelti sulle offerte reali dei supermercati di Rapallo, con il costo esatto a porzione.
          </p>
          <div className="flex flex-wrap items-center gap-5 pt-2">
            <a
              href="#proposte-stasera"
              className="inline-flex items-center px-6 py-3 rounded-full bg-[#1B5E3A] hover:bg-[#14492D] text-white text-sm font-medium taste-btn"
            >
              Vedi le 3 proposte
            </a>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-1-negozi')}
              className="text-sm font-medium text-[#141A17] hover:text-[#1B5E3A] underline underline-offset-4 decoration-[#D5D0C5] hover:decoration-[#1B5E3A] cursor-pointer"
            >
              Esplora le offerte di oggi →
            </button>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl overflow-hidden aspect-[4/3] bg-[#F3F1EC] border border-[#E5E2DA] taste-photo-frame">
            <img
              src="/assets/img/photo-m61660576-960.jpg"
              alt="Ingredienti freschi della cucina mediterranea"
              className="w-full h-full object-cover"
              loading="eager"
            />
          </div>
        </div>
      </section>

      {/* Section 2: 3 Real Dinner Proposals ("3 data + 1 action") */}
      <section id="proposte-stasera" className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div className="space-y-1">
            <h2 className="font-editorial text-3xl font-normal text-[#141A17] tracking-tight">
              Stasera in tavola
            </h2>
            <p className="text-sm text-[#575E58]">
              Confronto diretto tra cucina di casa e prezzo al ristorante in Liguria.
            </p>
          </div>

          {onChangeProfile && (
            <div
              className="inline-flex p-1 rounded-full bg-[#F3F1EC] border border-[#E5E2DA] self-start sm:self-auto"
              role="group"
              aria-label="Filtro preferenze cena"
            >
              <button
                type="button"
                onClick={() => onChangeProfile('ospiti')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  !isDairyFree ? 'bg-white text-[#141A17] shadow-xs' : 'text-[#575E58] hover:text-[#141A17]'
                }`}
              >
                Tutti i piatti
              </button>
              <button
                type="button"
                onClick={() => onChangeProfile('casa')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition-colors cursor-pointer ${
                  isDairyFree ? 'bg-white text-[#141A17] shadow-xs' : 'text-[#575E58] hover:text-[#141A17]'
                }`}
              >
                Senza latticini
              </button>
            </div>
          )}
        </div>

        {loadingProposals && proposals.length === 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="bg-white border border-[#E5E2DA] rounded-2xl p-6 h-56 animate-pulse"
              />
            ))}
          </div>
        ) : proposalsError && proposals.length === 0 ? (
          <div className="bg-white border border-[#E5E2DA] rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <p className="text-sm text-[#575E58]">
              Non siamo riusciti a caricare le proposte per stasera in questo momento.
            </p>
            <button
              type="button"
              onClick={retryProposals}
              className="px-4 py-2 rounded-full border border-[#DFDCD2] bg-[#FAF9F6] hover:bg-[#F3F1EC] text-xs font-medium text-[#141A17] cursor-pointer shrink-0"
            >
              Riprova
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {proposals.map((card) => {
              const title = card.cleanTitle || card.title;
              const minutes = Math.round(card.totalHandsOnMinutes || 20);
              const cost = Number(card.purePortionCostEur || 0);
              const menuPrice = Number(card.menuPriceEuro || 0);
              const savings = menuPrice > cost ? menuPrice - cost : 0;

              return (
                <article
                  key={card.dishId}
                  onClick={() => setSelectedDish(card)}
                  className="bg-white border border-[#E5E2DA] rounded-2xl p-6 flex flex-col justify-between gap-6 taste-card cursor-pointer"
                  data-testid="home-proposal-card"
                >
                  <div className="space-y-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#575E58]">
                      {card.badge} · {minutes} min
                    </p>
                    <h3 className="font-editorial text-2xl font-normal text-[#141A17] leading-snug">
                      {title}
                    </h3>
                  </div>

                  <div className="space-y-4 pt-4 border-t border-[#E5E2DA]">
                    <div className="space-y-0.5">
                      <p className="text-lg font-semibold text-[#141A17] tabular-nums">
                        {formatEuro(cost)} <span className="text-xs font-normal text-[#575E58]">a porzione</span>
                      </p>
                      <p className="text-xs text-[#1B5E3A] font-medium">
                        {savings > 1
                          ? `Risparmi € ${Math.round(savings)} rispetto al ristorante`
                          : 'Ingredienti scelti sulle offerte di oggi'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDish(card);
                      }}
                      className="w-full py-2.5 px-4 rounded-full border border-[#DFDCD2] bg-[#FAF9F6] hover:bg-[#1B5E3A] hover:border-[#1B5E3A] hover:text-white text-sm font-medium text-[#141A17] transition-colors cursor-pointer"
                    >
                      Apri piatto
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 3: Selected Today Offers (below the fold, max 4 quiet cards) */}
      {featuredOffers.length > 0 && (
        <section className="space-y-5 pt-4 border-t border-[#E5E2DA]">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-editorial text-2xl sm:text-3xl font-normal text-[#141A17] tracking-tight">
              Occasioni selezionate oggi
            </h2>
            <button
              type="button"
              onClick={() => onNavigateRoom?.('room-1-negozi')}
              className="text-sm font-medium text-[#141A17] hover:text-[#1B5E3A] underline underline-offset-4 decoration-[#D5D0C5] hover:decoration-[#1B5E3A] cursor-pointer shrink-0"
            >
              Tutte le offerte →
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {featuredOffers.map((offer) => (
              <button
                key={offer.id}
                type="button"
                onClick={() => onNavigateRoom?.('room-1-negozi')}
                className="text-left bg-white border border-[#E5E2DA] rounded-2xl p-5 flex flex-col justify-between gap-4 taste-card cursor-pointer"
              >
                <div className="space-y-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#575E58] truncate">
                    {offer.storeName}
                  </p>
                  <p className="text-sm font-medium text-[#141A17] leading-snug line-clamp-2">
                    {offer.title}
                  </p>
                </div>
                <p className="text-lg font-semibold text-[#1B5E3A] tabular-nums">
                  {formatEuro(offer.promoPrice ?? offer.price)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Editorial Dish Detail Drawer */}
      <DishDetailDrawer
        dish={selectedDish}
        activeProfileId={activeProfileId}
        onClose={() => setSelectedDish(null)}
        onAddToShoppingList={onAddToShoppingList}
      />
    </div>
  );
}

export default CycleOverviewView;
