import React, { useState } from 'react';

export function LabNotebookModal({ isOpen, dish, heatSource, onClose, onSaved }) {
  const [rating, setRating] = useState(5);
  const [actualCookedWeightGrams, setActualCookedWeightGrams] = useState('');
  const [saltAndHydrationNotes, setSaltAndHydrationNotes] = useState('');
  const [saving, setSaving] = useState(false);

  if (!isOpen || !dish) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/recipes/${encodeURIComponent(dish.id)}/lab-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dishTitle: dish.title,
          rating: Number(rating),
          actualCookedWeightGrams: actualCookedWeightGrams ? Number(actualCookedWeightGrams) : null,
          saltAndHydrationNotes,
          heatSourceUsed: heatSource || 'gas'
        })
      });
      if (res.ok) {
        const data = await res.json();
        setActualCookedWeightGrams('');
        setSaltAndHydrationNotes('');
        if (onSaved) onSaved(data.entry);
        onClose();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/75 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Quaderno di Laboratorio Gastronomico"
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden">
        <div className="bg-[#141A17] text-white px-5 py-4 flex items-center justify-between">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-[#1B5E3A] text-white">
              Quaderno di Laboratorio
            </span>
            <h3 className="text-base font-extrabold mt-1">📓 Registra Sessione Sperimentale</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white text-sm font-bold px-2 py-1 cursor-pointer"
          >
            ✕ Chiudi
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <div>
              <strong>Piatto:</strong> {dish.title}
            </div>
            <div>
              <strong>Sorgente Termica:</strong> {heatSource || 'gas'}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Valutazione Risultato (1–5 ★)
              </label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 font-bold text-slate-800"
              >
                <option value={5}>★★★★★ (5/5 — Perfetto equilibrio)</option>
                <option value={4}>★★★★☆ (4/5 — Molto buono, piccoli ritocchi)</option>
                <option value={3}>★★★☆☆ (3/5 — Discreto, da ricalibrare)</option>
                <option value={2}>★★☆☆☆ (2/5 — Cottura/idratazione fuori target)</option>
                <option value={1}>★☆☆☆☆ (1/5 — Da ripetere)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Peso Cotto Reale Misurato (g)
              </label>
              <input
                type="number"
                min="10"
                max="5000"
                placeholder="Es. 285"
                value={actualCookedWeightGrams}
                onChange={(e) => setActualCookedWeightGrams(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Note di Calibrazione (Idratazione, Sapidità, Punto di Fumo, Tempi)
            </label>
            <textarea
              rows={3}
              required
              placeholder="Es. Scolato 2 min prima, emulsione a 60°C con 15g Olio EVO ligure: crema stabile senza formaggi."
              value={saltAndHydrationNotes}
              onChange={(e) => setSaltAndHydrationNotes(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 text-slate-800"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-xs font-extrabold bg-[#1B5E3A] hover:bg-[#14472C] text-white rounded-lg cursor-pointer"
            >
              {saving ? 'Salvataggio...' : '💾 Salva nel Quaderno Lab'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default LabNotebookModal;
