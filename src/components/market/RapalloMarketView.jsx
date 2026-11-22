import React, { useEffect, useState } from 'react';
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
  excludeMemberOnly = false,
  onChangeExcludeMemberOnly,
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
  excludedCategories = [],
  onToggleExcludeCategory,
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
  const [listsState, setListsState] = useState({ activeListId: 'list-default', lists: [] });
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);

  useEffect(() => {
    fetch('/api/shopping-list')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.lists)) {
          setListsState({ activeListId: data.activeListId, lists: data.lists });
        }
      })
      .catch(() => {});
  }, []);

  const visibleOffers = offers;

  const handleClearAllFilters = () => {
    onClearFilters?.();
  };

  const handleAddWithTargetList = (payload) =>
    onAddToShoppingList?.({ ...payload, listId: listsState.activeListId });
  return (
    <>
      <StoreSwitcher
        stores={stores}
        selectedStoreId={selectedStoreId}
        onSelectStore={onSelectStore}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4 space-y-3">
        {activeStore && (
          <section className="bg-white rounded-xl border border-[#E5E2DA] px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-[#141A17]">{activeStore.name}</h2>
                {activeStore.loyaltyCard && (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-amber-50 text-[#9A5B25] border border-amber-200">
                    {typeof activeStore.loyaltyCard === 'string'
                      ? activeStore.loyaltyCard
                      : activeStore.loyaltyCard?.name || 'Carta Fedeltà'}
                  </span>
                )}
              </div>
              <p className="text-xs text-[#575E58] mt-0.5 truncate max-w-xl">{activeStore.address}</p>
            </div>

            {currentStoreFlyers.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {currentStoreFlyers.map((flyerItem, idx) => (
                  <button
                    key={flyerItem.id || idx}
                    type="button"
                    onClick={() => onOpenFlyer(flyerItem)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#1B5E3A] hover:bg-[#14492D] text-white text-xs font-semibold rounded-lg cursor-pointer"
                  >
                    <span>
                      {currentStoreFlyers.length > 1
                        ? `Volantino ${idx + 1} (${flyerItem.pageCount} pag.)`
                        : `Sfoglia volantino (${flyerItem.pageCount} pag.)`}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Single Compact Search + Sort + Progressive Disclosure Filters Row */}
        <section className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="flex-1 min-w-0">
            <SearchBar
              value={searchQuery}
              onChange={onChangeSearchQuery}
              onClear={() => onChangeSearchQuery('')}
              matchCount={totalOffers}
              autoFocus={isMobileSearchOpen}
            />
          </div>

          <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
            <select
              id="sort-select"
              aria-label="Ordina offerte"
              value={sortBy}
              onChange={(e) => onChangeSortBy(e.target.value)}
              className="text-xs font-medium bg-white border border-[#DFDCD2] rounded-lg px-2.5 py-2 text-[#141A17] focus:outline-none focus:ring-2 focus:ring-[#1B5E3A] cursor-pointer"
            >
              <option value="discountDesc">Sconto più alto</option>
              <option value="pricePerKgAsc">Prezzo €/kg più basso</option>
              <option value="priceAsc">Prezzo più basso</option>
              <option value="priceDesc">Prezzo più alto</option>
            </select>

            <button
              type="button"
              onClick={() => setShowAdvancedFilters((prev) => !prev)}
              aria-expanded={showAdvancedFilters}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border whitespace-nowrap cursor-pointer ${
                showAdvancedFilters || excludeMemberOnly || selectedDomain
                  ? 'bg-[#141A17] text-white border-[#141A17]'
                  : 'bg-white text-[#141A17] border-[#DFDCD2] hover:bg-[#F3F1EC]'
              }`}
            >
              Opzioni &amp; Liste
            </button>
          </div>
        </section>

        {/* Progressive Disclosure: Domains, Member Exclusion, Profile Exclusion & Target Shopping List */}
        {showAdvancedFilters && (
          <section className="bg-white border border-[#E5E2DA] rounded-xl p-3.5 space-y-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              {onChangeExcludeMemberOnly && (
                <label className="inline-flex items-center gap-1.5 font-semibold text-[#141A17] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={excludeMemberOnly}
                    onChange={(e) => onChangeExcludeMemberOnly(e.target.checked)}
                    className="rounded border-[#DFDCD2] accent-[#1B5E3A]"
                  />
                  <span>Solo offerte aperte a tutti (escludi tessere soci)</span>
                </label>
              )}

              {activeProfile && (
                <label className="inline-flex items-center gap-1.5 font-semibold text-[#141A17] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={hideIncompatible}
                    onChange={(e) => onChangeHideIncompatible(e.target.checked)}
                    className="rounded border-[#DFDCD2] accent-[#1B5E3A]"
                  />
                  <span>Nascondi ingredienti esclusi ({activeProfile.name})</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              {DOMAIN_PILLS.map((dom) => {
                const activeDomains = selectedDomain ? String(selectedDomain).split(',').filter(Boolean) : [];
                const isSelected = dom.id === null ? activeDomains.length === 0 : activeDomains.includes(dom.id);
                const count = dom.id ? facets?.domains?.[dom.id] : totalOffers;
                return (
                  <button
                    key={dom.id || 'all'}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => onSelectDomain(dom.id)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border cursor-pointer ${
                      isSelected
                        ? 'bg-[#141A17] text-white border-[#141A17]'
                        : 'bg-[#FAF9F6] text-[#4A524C] border-[#E5E2DA] hover:bg-[#F3F1EC]'
                    }`}
                  >
                    <span>{dom.label}</span>
                    {count !== undefined && <span className="opacity-75">({count})</span>}
                  </button>
                );
              })}
            </div>

            {listsState.lists.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[#E5E2DA]">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-[#141A17]">Aggiungi articoli a:</span>
                  <select
                    aria-label="Scegli lista della spesa attiva"
                    value={listsState.activeListId}
                    onChange={async (e) => {
                      const res = await fetch('/api/shopping-list/lists/active', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ listId: e.target.value })
                      });
                      if (res.ok) {
                        const data = await res.json();
                        setListsState({ activeListId: data.activeListId, lists: data.lists || [] });
                      }
                    }}
                    className="bg-[#FAF9F6] border border-[#DFDCD2] rounded-lg px-2.5 py-1 text-xs font-medium text-[#141A17] cursor-pointer"
                  >
                    {listsState.lists.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({(l.items || []).length})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    const name = `Spesa ${listsState.lists.length + 1}`;
                    const res = await fetch('/api/shopping-list/lists', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ name })
                    });
                    if (res.ok) {
                      const data = await res.json();
                      setListsState({ activeListId: data.activeListId, lists: data.lists || [] });
                    }
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#FAF9F6] border border-[#DFDCD2] hover:bg-[#F3F1EC] font-semibold text-[#1B5E3A] cursor-pointer"
                >
                  + Nuova lista
                </button>
              </div>
            )}
          </section>
        )}

        {(!visibleCategoriesForDomain || visibleCategoriesForDomain.length > 1) ? (
          <section>
            <CategoryFilters
              categories={visibleCategoriesForDomain}
              selectedCategory={selectedCategory}
              onToggleCategory={onToggleCategory}
              excludedCategories={excludedCategories}
              onToggleExcludeCategory={onToggleExcludeCategory}
              categoryCounts={facets?.categories || {}}
              activeFilterCount={activeFilterCount}
              onClearFilters={handleClearAllFilters}
            />
          </section>
        ) : activeFilterCount > 0 ? (
          <section className="flex items-center justify-end">
            <button
              type="button"
              onClick={handleClearAllFilters}
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
          ) : visibleOffers.length === 0 ? (
            <EmptyState
              searchQuery={searchQuery}
              selectedCategory={selectedCategory}
              selectedDomain={selectedDomain}
              selectedStoreName={activeStore ? activeStore.name : null}
              hideIncompatible={hideIncompatible}
              onClearFilters={handleClearAllFilters}
              onApplyQuery={onChangeSearchQuery}
            />
          ) : (
            <OfferGrid
              offers={visibleOffers}
              totalOffers={totalOffers}
              hasMoreOffers={hasMoreOffers}
              loadingMore={loadingMore}
              onLoadMore={onLoadMore}
              loading={loading}
              onAddToShoppingList={handleAddWithTargetList}
              onOpenCreaFood={onOpenCreaFood}
              onOpenFlyer={onOpenOfferFlyer}
              onResetFilters={handleClearAllFilters}
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
