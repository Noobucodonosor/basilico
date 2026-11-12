import React from 'react';

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
  categoryCounts = {},
  activeFilterCount = 0,
  onClearFilters
}) {
  const handleSelect = (cat) => {
    if (onToggleCategory) {
      onToggleCategory(cat);
    } else if (onSelectCategory) {
      onSelectCategory(cat);
    }
  };

  const listToRender = (categories && categories.length > 0) ? categories : VALID_PRODUCT_CATEGORIES;

  return (
    <div className="py-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Reparti & Categorie
        </span>

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
            selectedCategory === null
              ? 'bg-slate-800 text-white shadow-xs'
              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
          }`}
        >
          Tutte
        </button>

        {/* 10 Valid Rapallo Categories */}
        {listToRender.map((cat) => {
          const isSelected = selectedCategory === cat;
          const count = categoryCounts[cat];

          return (
            <button
              key={cat}
              type="button"
              onClick={() => handleSelect(cat)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium shrink-0 transition-all cursor-pointer ${
                isSelected
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              <span>{cat}</span>
              {typeof count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                    isSelected ? 'bg-emerald-700 text-emerald-100' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CategoryFilters;
