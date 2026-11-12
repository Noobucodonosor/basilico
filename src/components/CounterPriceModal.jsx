import React, { useState } from 'react';

export function CounterPriceModal({ isOpen, onClose, stores = [], defaultStoreId = null, onSaved }) {
  const [title, setTitle] = useState('');
  const [brand, setBrand] = useState('');
  const [price, setPrice] = useState('');
  const [unitString, setUnitString] = useState('1 kg');
  const [storeId, setStoreId] = useState(defaultStoreId || 'pescheria-locale-rapallo');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  React.useEffect(() => {
    if (defaultStoreId) {
      setStoreId(defaultStoreId);
    }
  }, [defaultStoreId, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const selectedStore = stores.find((s) => s.id === storeId);
      const res = await fetch('/api/prices/observe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          brand,
          price: parseFloat(String(price).replace(',', '.')),
          unitString,
          storeId,
          storeName: selectedStore ? selectedStore.name : storeId,
          notes,
          channel: 'counter_observed'
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Errore salvataggio prezzo');
      }
      setTitle('');
      setBrand('');
      setPrice('');
      setNotes('');
      if (onSaved) onSaved(data.observation);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="counter-price-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 id="counter-price-modal-title" className="text-base font-bold text-slate-900">
              🏷️ Registra &ldquo;Prezzo visto al banco&rdquo;
            </h2>
            <p className="text-xs text-slate-500">
              Salva un prezzo reale visto in pescheria, macelleria, panificio o scaffale a Rapallo.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Prodotto visto al banco *
            </label>
            <input
              type="text"
              required
              placeholder="es. Acciughe fresche del Mar Ligure / Focaccia al formaggio"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Prezzo (€) *
              </label>
              <input
                type="text"
                required
                placeholder="es. 9,80"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Unità / Formato *
              </label>
              <input
                type="text"
                required
                placeholder="es. 1 kg, all'etto, 500 g"
                value={unitString}
                onChange={(e) => setUnitString(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Bottega o Supermercato
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-2.5 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="pescheria-locale-rapallo">🐟 Pescheria / Mercato Rapallo</option>
                <option value="macelleria-locale-rapallo">🥩 Macelleria / Polleria Rapallo</option>
                <option value="panificio-pastificio-rapallo">🥖 Panificio / Pastificio Fresco</option>
                <option value="ortofrutta-locale-rapallo">🥬 Ortofrutta Locale Rapallo</option>
                <option value="casalinghi-ferramenta-rapallo">🍳 Casalinghi / Ferramenta Rapallo</option>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    🏪 {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Marca / Origine (opz.)
              </label>
              <input
                type="text"
                placeholder="es. Locale Tigullio"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Note (es. pescato del giorno, taglio, qualità)
            </label>
            <input
              type="text"
              placeholder="es. Pescato locale stamattina"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
            >
              Annulla
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Salvataggio...' : 'Salva Prezzo Osservato'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CounterPriceModal;
