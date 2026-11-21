import React from 'react';

const COMPARE_METRICS = [
  { key: 'kcal', label: 'Energia (kcal/100g)', unit: 'kcal', highlightMax: false },
  { key: 'proteinG', label: 'Proteine (g/100g)', unit: 'g', highlightMax: true },
  { key: 'fatG', label: 'Lipidi (g/100g)', unit: 'g', highlightMax: false },
  { key: 'carbsG', label: 'Carboidrati (g/100g)', unit: 'g', highlightMax: false },
  { key: 'fiberG', label: 'Fibre (g/100g)', unit: 'g', highlightMax: true },
  { key: 'omega3G', label: 'Omega-3 Totali (g/100g)', unit: 'g', highlightMax: true },
  { key: 'ironMg', label: 'Ferro (mg/100g)', unit: 'mg', highlightMax: true },
  { key: 'calciumMg', label: 'Calcio (mg/100g)', unit: 'mg', highlightMax: true },
  { key: 'potassiumMg', label: 'Potassio (mg/100g)', unit: 'mg', highlightMax: true },
  { key: 'magnesiumMg', label: 'Magnesio (mg/100g)', unit: 'mg', highlightMax: true },
  { key: 'vitaminCMg', label: 'Vitamina C (mg/100g)', unit: 'mg', highlightMax: true },
  { key: 'waterG', label: 'Acqua (g/100g)', unit: 'g', highlightMax: false }
];

export function CreaCompareTray({ items = [], onRemoveItem, onClearAll, onInspectFood }) {
  if (!items || items.length === 0) return null;

  return (
    <section
      aria-label="Vassoio di confronto nutrizionale Side-by-Side"
      className="bg-white rounded-2xl border border-[#E5E2DA] p-4 sm:p-5 space-y-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-[#141A17]">
            ⚖️ Confronto Side-by-Side ({items.length}/4 alimenti selezionati)
          </h3>
          <p className="text-xs text-[#575E58]">
            Confronto normalizzato per 100 g di parte edibile secondo le tabelle ufficiali CREA.
          </p>
        </div>
        <button
          type="button"
          onClick={onClearAll}
          className="px-2.5 py-1 text-xs font-semibold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-lg cursor-pointer"
        >
          Svuota confronto
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#E5E2DA] bg-[#FAF9F6]">
              <th className="py-2 px-3 text-left font-bold text-[#4A524C]">Parametro (per 100g edibili)</th>
              {items.map((item) => (
                <th key={item.id} className="py-2 px-3 text-right font-bold text-[#141A17] min-w-[140px]">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => onInspectFood && onInspectFood(item.id)}
                      className="hover:underline text-[#1B5E3A] truncate max-w-[130px] cursor-pointer"
                      title={item.name}
                    >
                      {item.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveItem(item.id)}
                      className="text-[#575E58] hover:text-rose-600 cursor-pointer"
                      aria-label={`Rimuovi ${item.name}`}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="text-[10px] font-normal text-[#575E58]">
                    Edibile: {item.ediblePartPct}% • Resa Y={item.yieldFactor?.multiplier ?? 1}x
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#F0EDE6]">
            {COMPARE_METRICS.map((m) => {
              const vals = items.map((it) => it.keyMetrics?.[m.key] ?? -1);
              const maxVal = Math.max(...vals);
              return (
                <tr key={m.key} className="hover:bg-[#FAF9F6]">
                  <td className="py-1.5 px-3 font-medium text-[#4A524C]">{m.label}</td>
                  {items.map((it) => {
                    const v = it.keyMetrics?.[m.key];
                    const isBest =
                      m.highlightMax &&
                      v !== null &&
                      v !== undefined &&
                      v > 0 &&
                      v === maxVal &&
                      items.length > 1;
                    return (
                      <td
                        key={it.id}
                        className={`py-1.5 px-3 text-right font-semibold ${
                          isBest ? 'text-[#1B5E3A] bg-[#F3F1EC] font-extrabold' : 'text-[#141A17]'
                        }`}
                      >
                        {v !== null && v !== undefined ? `${v} ${m.unit}` : 'n.d.'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default CreaCompareTray;
