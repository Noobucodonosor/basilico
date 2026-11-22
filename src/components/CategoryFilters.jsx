import React, { useState } from 'react';

export const VALID_PRODUCT_CATEGORIES = [
  'Frutta e Verdura',
  'Carne e Pesce',
  'Latticini e Formaggi',
  'Pane e Pasticceria',
  'Dispensa e Pasta',
  'Colazione e Dolci',
  'Acqua e Bevande',
  'Surgelati',
  'Cura Casa e Bucato',
  'Cura Persona e Igiene',
  'Pentole, Cucina ed Elettrodomestici',
  'Animali Domestici',
  'Giocattoli, Natale e Tempo Libero',
  'Tessile, Abbigliamento e Bazar Casa'
];

export function CategoryFilters({
  categories = VALID_PRODUCT_CATEGORIES,
  selectedCategory,
  onToggleCategory,
  onSelectCategory,
  excludedCategories = [],
  onToggleExcludeCategory,
  categoryCounts = {},
  activeFilterCount = 0,
  onClearFilters
}) {
  const [excludeMode, setExcludeMode] = useState(false);

  const handleSelect = (cat) => {
    if (excludeMode && cat && onToggleExcludeCategory) {
      onToggleExcludeCategory(cat);
      return;
    }
    if (onToggleCategory) {
      onToggleCategory(cat);
    } else if (onSelectCategory) {
      onSelectCategory(cat);
    }
  };

  const activeCategories = selectedCategory ? String(selectedCategory).split(',').filter(Boolean) : [];
  const listToRender = (categories && categories.length > 0) ? categories : VALID_PRODUCT_CATEGORIES;

  return (
    <div className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Reparti & Categorie
          </span>
          {onToggleExcludeCategory && (
            <button
              type="button"
              onClick={() => setExcludeMode((prev) => !prev)}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer ${
                excludeMode || excludedCategories.length > 0
                  ? 'bg-rose-50 text-rose-700 border-rose-300'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {excludeMode
                ? 'Modalità: Escludi (clicca cosa nascondere)'
                : excludedCategories.length > 0
                  ? `Tutto tranne (${excludedCategories.length})`
                  : 'Mostra tutto tranne…'}
            </button>
          )}
        </div>

        {activeFilterCount > 0 && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              {activeFilterCount} {activeFilterCount === 1 ? 'filtro attivo' : 'filtri attivi'}
            </span>
            {onClearFilters && (
              <button
                type="button"
                onClick={onClearFilters}
                className="text-xs font-medium text-emerald-700 hover:text-emerald-900 underline cursor-pointer"
              >
                Azzera filtri
              </button>
            )}
          </div>
        )}
      </div>

      {/* Horizontal pill row scrollable on mobile */}
      <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1 scroll-smooth">
        {/* All Categories Option */}
        <button
          type="button"
          onClick={() => handleSelect(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer ${
            activeCategories.length === 0
              ? 'bg-slate-800 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Tutte
        </button>

        {/* 10 Valid Rapallo Categories */}
        {listToRender.map((cat) => {
          const isSelected = activeCategories.includes(cat);
          const isExcluded = excludedCategories.includes(cat);
          const count = categoryCounts[cat];

          return (
            <div
              key={cat}
              className={`inline-flex items-center rounded-full text-xs font-medium shrink-0 border ${
                isExcluded
                  ? 'bg-rose-50 text-rose-700 border-rose-200 line-through opacity-75'
                  : isSelected
                    ? 'bg-[#1B5E3A] text-white border-[#1B5E3A] shadow-xs'
                    : 'bg-white text-[#4A524C] border-[#E5E2DA] hover:bg-[#FAF9F6] hover:border-[#DFDCD2]'
              }`}
            >
              <button
                type="button"
                onClick={() => (isExcluded && onToggleExcludeCategory ? onToggleExcludeCategory(cat) : handleSelect(cat))}
                className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 cursor-pointer"
              >
                <span>{cat}</span>
                {typeof count === 'number' && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                      isSelected ? 'bg-[#14472C] text-[#FAF9F6]' : 'bg-[#F3F1EC] text-[#575E58]'
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
              {onToggleExcludeCategory && (
                <button
                  type="button"
                  onClick={() => onToggleExcludeCategory(cat)}
                  title={isExcluded ? `Mostra di nuovo ${cat}` : `Escludi categoria ${cat}`}
                  aria-label={isExcluded ? `Mostra di nuovo ${cat}` : `Escludi categoria ${cat}`}
                  className="pr-2.5 pl-0.5 py-1.5 text-[11px] opacity-70 hover:opacity-100 cursor-pointer"
                >
                  {isExcluded ? '↺' : '✕'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryFilters;
