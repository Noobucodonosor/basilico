import React, { useState, useEffect } from 'react';
import { useDebounce } from '../hooks/useDebounce.js';

export function SearchBar({
  value,
  onChange,
  onClear,
  matchCount,
  resultCount,
  autoFocus = false,
  placeholder = "Cerca prodotti (es. pasta, caffè, latte)..."
}) {
  const [internalValue, setInternalValue] = useState(value || '');
  const debouncedValue = useDebounce(internalValue, 200);

  // Sync with prop if changed externally
  useEffect(() => {
    setInternalValue(value || '');
  }, [value]);

  // Propagate debounced search change to parent
  useEffect(() => {
    const trimmed = debouncedValue.trim();
    if (trimmed !== (value || '').trim()) {
      onChange(trimmed);
    }
  }, [debouncedValue, onChange, value]);

  const handleClear = () => {
    setInternalValue('');
    if (onClear) {
      onClear();
    } else {
      onChange('');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      handleClear();
    }
  };

  const displayCount = typeof matchCount === 'number' ? matchCount : resultCount;

  return (
    <div className="relative w-full">
      <div className="relative flex items-center">
        {/* Search Icon */}
        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Search Input */}
        <input
          type="search"
          autoFocus={autoFocus}
          value={internalValue}
          onChange={(e) => setInternalValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          aria-label="Cerca prodotti o sconti"
          className="w-full pl-10 pr-24 py-2.5 text-sm bg-white border border-slate-300 rounded-xl shadow-xs placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition-all"
        />

        {/* Clear Button & Match Count Badge */}
        <div className="absolute inset-y-0 right-0 pr-2.5 flex items-center gap-1.5">
          {typeof displayCount === 'number' && (
            <span className="text-[11px] font-medium text-slate-500 px-2 py-0.5 bg-slate-100 rounded-full select-none">
              {displayCount} {displayCount === 1 ? 'offerta' : 'offerte'}
            </span>
          )}

          {internalValue.length > 0 && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors cursor-pointer"
              aria-label="Cancella ricerca"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default SearchBar;
