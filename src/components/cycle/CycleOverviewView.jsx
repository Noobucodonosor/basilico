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

  const proposals = Array.isArray(copilot?.tonightParetoCards)
    ? copilot.tonightParetoCards.slice(0, 3)
    : [];

  const humanSummary =
    copilot?.humanSummary ||
    'Tre piatti cucinabili con il tuo set, incrociati con i valori nutrizionali CREA e le offerte attive a Rapallo.';

  return (
    <div className="space-y-8 sm:space-y-10" data-testid="cycle-overview-view">
      {/* Section 1: Compact Editorial Hero so 3 proposals fit Above-the-Fold at 1440x900 */}
      <section
        data-enter=""
        className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10 items-center pt-1 sm:pt-3 pb-6 sm:pb-8 border-b border-[#E5E2DA]"
      >
        <div className="lg:col-span-7 space-y-3.5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1B5E3A]">
            Rapallo · Cucina di casa
          </p>
          <h1 className="font-editorial text-3xl sm:text-4xl lg:text-[44px] font-normal text-[#141A17] tracking-tight leading-[1.08]">
            Cosa cucini stasera?
          </h1>
          <p className="text-sm sm:text-base text-[#575E58] max-w-xl leading-relaxed">
            {humanSummary}
          </p>
          <div className="pt-1">
            <a
              href="#proposte-stasera"
              className="inline-flex items-center px-5 py-2.5 rounded-full bg-[#1B5E3A] hover:bg-[#14492D] text-white text-sm font-medium taste-btn"
            >
              Scegli tra le 3 proposte
            </a>
          </div>
        </div>

        <div className="lg:col-span-5">
          <div className="rounded-2xl overflow-hidden aspect-[16/10] max-h-56 w-full bg-[#F3F1EC] border border-[#E5E2DA] taste-photo-frame">
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
