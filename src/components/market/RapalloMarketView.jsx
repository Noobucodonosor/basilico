import React from 'react';
import StoreSwitcher from '../StoreSwitcher.jsx';
import SearchBar from '../SearchBar.jsx';
import CategoryFilters from '../CategoryFilters.jsx';
import OfferGrid from '../OfferGrid.jsx';
import EmptyState from '../EmptyState.jsx';

const DOMAIN_PILLS = [
  { id: null, label: 'Tutti i Domini', icon: '🌐' },
  { id: 'food_human', label: 'Alimentari & Bevande', icon: '🥩' },
  { id: 'home_cleaning', label: 'Chimica & Cura Casa', icon: '🧼' },
  { id: 'kitchen_cookware', label: 'Pentole & Elettrodomestici', icon: '🍳' },
  { id: 'personal_care', label: 'Igiene Persona', icon: '🧴' },
  { id: 'pet_care', label: 'Animali (Pet)', icon: '🐾' },
  { id: 'bazar_seasonal', label: 'Giocattoli, Natale & Bazar', icon: '🎄' }
];

export function RapalloMarketView({
  stores,
  selectedStoreId,
  onSelectStore,
  activeProfile,
  hideIncompatible,
  onChangeHideIncompatible,
  selectedDomain,
  onSelectDomain,
  facets,
  totalOffers,
  activeStore,
  currentStoreFlyers,
  onOpenFlyer,
  isMobileSearchOpen,
  searchQuery,
  onChangeSearchQuery,
  sortBy,
  onChangeSortBy,
  visibleCategoriesForDomain,
  selectedCategory,
  onToggleCategory,
  activeFilterCount,
  onClearFilters,
  loading,
  offers,
  hasMoreOffers,
  loadingMore,
  onLoadMore,
  onAddToShoppingList,
  onOpenCreaFood,
  onOpenOfferFlyer,
  localShops,
  counterObservations,
  onOpenCounterModal
}) {
  return (
    <>
      <StoreSwitcher
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelectStore={onSelectStore}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 space-y-4 sm:space-y-6">
        {activeProfile && (
          <section className="bg-white border border-[#E5E2DA] text-[#141A17] rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start sm:items-center gap-2.5">
              <span className="text-xl" aria-hidden="true">🛡️</span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider bg-[#1B5E3A] text-white px-2 py-0.5 rounded">
                    Profilo: {activeProfile.name}
                  </span>
                  {activeProfile.excludedIngredients?.length > 0 && (
                    <span className="text-[11px] text-[#575E58]">
                      Esclusioni attive: {activeProfile.excludedIngredients.slice(0, 5).join(', ')}
                      {activeProfile.excludedIngredients.length > 5 ? ` (+${activeProfile.excludedIngredients.length - 5})` : ''}
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#575E58] mt-0.5">
                  {activeProfile.description}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#141A17] cursor-pointer">
                <input
                  type="checkbox"
                  checked={hideIncompatible}
                  onChange={(e) => onChangeHideIncompatible(e.target.checked)}
                  className="rounded border-[#DFDCD2] accent-[#1B5E3A] focus:ring-[#1B5E3A]"
                />
                <span>Nascondi prodotti esclusi</span>
              </label>
            </div>
          </section>
        )}

        <section className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar" aria-label="Domini merceologici">
          {DOMAIN_PILLS.map((dom) => {
            const isSelected = selectedDomain === dom.id;
            const count = dom.id ? facets?.domains?.[dom.id] : totalOffers;
            return (
              <button
                key={dom.id || 'all'}
                type="button"
                onClick={() => onSelectDomain(isSelected ? null : dom.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border taste-btn whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? 'bg-[#141A17] text-white border-[#141A17] shadow-xs'
                    : 'bg-white text-[#4A524C] border-[#E5E2DA] hover:border-[#1B5E3A]/40 hover:bg-[#F3F1EC]'
                }`}
              >
                <span aria-hidden="true">{dom.icon}</span>
                <span>{dom.label}</span>
                {count !== undefined && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${isSelected ? 'bg-[#2B332E] text-white' : 'bg-[#F3F1EC] text-[#575E58]'}`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </section>

        {activeStore && (
          <section className="bg-white rounded-xl border border-[#E5E2DA] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[#141A17]">{activeStore.name}</h2>
                {activeStore.isRegionalServing && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-[#F3F1EC] text-[#1B5E3A] border border-[#DFDCD2]">
                    Servizio Rapallo &amp; Tigullio
                  </span>
                )}
                {activeStore.loyaltyCard && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-[#9A5B25] border border-amber-200">
                    💳{' '}
                    {typeof activeStore.loyaltyCard === 'string'
                      ? activeStore.loyaltyCard
                      : activeStore.loyaltyCard?.name || 'Carta Fedeltà'}
                    {typeof activeStore.loyaltyCard === 'object' && activeStore.loyaltyCard?.requiredForPromo
                      ? ' (richiesta per promo)'
                      : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#575E58] mt-0.5 truncate max-w-xl">
                {activeStore.address}
                {activeStore.logistics?.distanceKmFromHarbor != null
                  ? ` • 📍 ${activeStore.logistics.distanceKmFromHarbor} km dal Porto`
                  : ''}
                {activeStore.logistics?.avgVisitMinutes != null
                  ? ` • ⏱️ ~${activeStore.logistics.avgVisitMinutes} min visita`
                  : ''}
              </p>
            </div>

            <div className="flex flex-col items-start sm:items-end gap-1.5">
              {currentStoreFlyers.length > 0 && (
                <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2">
                  {currentStoreFlyers.map((flyerItem, idx) => (
                    <button
                      key={flyerItem.id || idx}
                      type="button"
                      onClick={() => onOpenFlyer(flyerItem)}
                      className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-semibold rounded-lg shadow-xs taste-btn whitespace-nowrap cursor-pointer"
                    >
                      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                      <span>
                        {currentStoreFlyers.length > 1
                          ? `Volantino ${idx + 1}: ${flyerItem.title || 'Sfoglia'} (${flyerItem.pageCount} pag.)`
                          : `Sfoglia volantino (${flyerItem.pageCount} pag.)`}
                      </span>
                    </button>
                  ))}
                </div>
              )}
              {currentStoreFlyers.some((f) => f.upstreamIndexedCap) && (
                <span className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md font-medium">
                  ℹ️ Nota trasparenza: PromoQui indicizza max {currentStoreFlyers.find((f) => f.upstreamIndexedCap)?.upstreamIndexedCap} prodotti per volantino (verificato prov. GE)
                </span>
              )}
            </div>
          </section>
        )}

        <section className={`flex flex-col sm:flex-row items-stretch sm:items-center gap-3 ${
          isMobileSearchOpen ? 'flex' : 'hidden sm:flex'
        }`}>
          <div className="flex-1">
            <SearchBar
              value={searchQuery}
              onChange={onChangeSearchQuery}
              onClear={() => onChangeSearchQuery('')}
              matchCount={totalOffers}
              autoFocus={isMobileSearchOpen}
            />
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <label htmlFor="sort-select" className="text-xs font-semibold text-[#575E58] whitespace-nowrap">
              Ordina:
            </label>
            <select
              id="sort-select"
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value)}
              className="text-xs font-medium bg-white border border-[#DFDCD2] rounded-lg px-2.5 py-2 text-[#141A17] focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer shadow-xs"
            >
              <option value="discountDesc">Sconto più alto (% decrescente)</option>
              <option value="pricePerKgAsc">Prezzo €/kg edibile più basso</option>
              <option value="priceAsc">Prezzo confezione più basso (€ crescente)</option>
              <option value="priceDesc">Prezzo confezione più alto (€ decrescente)</option>
            </select>
          </div>
        </section>

        {(!visibleCategoriesForDomain || visibleCategoriesForDomain.length > 1) ? (
          <section>
            <CategoryFilters
              categories={visibleCategoriesForDomain}
              selectedCategory={selectedCategory}
              onToggleCategory={onToggleCategory}
              categoryCounts={facets?.categories || {}}
              activeFilterCount={activeFilterCount}
              onClearFilters={onClearFilters}
            />
          </section>
        ) : activeFilterCount > 0 ? (
          <section className="flex items-center justify-end">
            <button
              type="button"
              onClick={onClearFilters}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
            >
              ✕ Azzera filtri ({activeFilterCount})
            </button>
          </section>
        ) : null}

        <section aria-label="Offerte promozionali">
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 py-6">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-[#E5E2DA] p-4 h-80 animate-pulse flex flex-col gap-3">
                  <div className="bg-[#F3F1EC] rounded-lg aspect-square w-full" />
                  <div className="h-4 bg-[#F3F1EC] rounded w-3/4" />
                  <div className="h-3 bg-[#F3F1EC] rounded w-1/2" />
                  <div className="mt-auto h-6 bg-[#F3F1EC] rounded w-1/3" />
                </div>
              ))}
            </div>
          ) : offers.length === 0 ? (
            <EmptyState
              searchQuery={searchQuery}
              selectedCategory={selectedCategory}
              selectedDomain={selectedDomain}
              selectedStoreName={activeStore ? activeStore.name : null}
              hideIncompatible={hideIncompatible}
              onClearFilters={onClearFilters}
              onApplyQuery={onChangeSearchQuery}
            />
          ) : (
            <OfferGrid
              offers={offers}
              totalOffers={totalOffers}
              hasMoreOffers={hasMoreOffers}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              loading={loading}
              onAddToShoppingList={onAddToShoppingList}
              onOpenCreaFood={onOpenCreaFood}
              onOpenFlyer={onOpenOfferFlyer}
              onResetFilters={onClearFilters}
            />
          )}
        </section>

        {localShops.length > 0 && (
          <section className="bg-white rounded-xl border border-[#E5E2DA] p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-[#141A17]">
                  🐟 Botteghe Storiche, Mercato &amp; Casalinghi Osservati a Rapallo
                </h3>
                <p className="text-xs text-[#575E58]">
                  Prezzi reali rilevati dai tuoi scontrini e al banco di quartiere (zero finti volantini).
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenCounterModal('')}
                className="px-3 py-1.5 text-xs font-bold bg-[#9A5B25] hover:bg-[#7F4A1D] text-white rounded-lg taste-btn cursor-pointer shrink-0"
              >
                + Prezzo visto al banco
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
              {localShops.map((shop) => (
                <button
                  key={shop.id}
                  type="button"
                  onClick={() => onOpenCounterModal(shop.id)}
                  className="p-2.5 rounded-lg border border-[#E5E2DA] bg-[#FAF9F6] hover:bg-[#F3F1EC] hover:border-[#9A5B25]/50 text-left text-xs taste-card cursor-pointer"
                >
                  <div className="font-bold text-[#141A17] truncate">{shop.name}</div>
                  <div className="text-[11px] text-[#575E58] truncate">{shop.address}</div>
                  <div className="mt-1 inline-block text-[10px] font-semibold bg-[#F3F1EC] text-[#9A5B25] border border-[#DFDCD2] px-1.5 py-0.5 rounded">
                    + Registra prezzo al banco
                  </div>
                </button>
              ))}
            </div>
            {counterObservations.length > 0 && (
              <div className="pt-2 border-t border-[#E5E2DA] space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-[#575E58]">
                  📌 Ultimi prezzi reali rilevati al banco a Rapallo ({counterObservations.length})
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {counterObservations.map((obs) => (
                    <div
                      key={obs.id}
                      className="p-2.5 rounded-lg bg-[#FAF9F6] border border-[#E5E2DA] flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-bold text-[#141A17] truncate">{obs.title}</div>
                        <div className="text-[10px] text-[#575E58] truncate">
                          {obs.storeName || obs.storeId} • {obs.unitString || '1 pz'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-extrabold text-[#1B5E3A]">
                          € {Number(obs.price || 0).toFixed(2).replace('.', ',')}
                        </div>
                        {(obs.normalizedPricePerKgOrL ?? obs.ediblePricePerKg) ? (
                          <div className="text-[10px] text-[#575E58]">
                            {Number(obs.normalizedPricePerKgOrL ?? obs.ediblePricePerKg).toFixed(2).replace('.', ',')} €/{obs.referenceUnit || 'kg'}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </main>
    </>
  );
}

export default RapalloMarketView;
