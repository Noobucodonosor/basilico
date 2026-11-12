import React, { useState, useMemo } from 'react';

const SAMPLE_RECEIPT_TEXT =
  'PASSATA MUTTI 700G 1,69\nTONNO RIO MARE 3X80G 3,99\nSCONTO SOCIO -0,50\nTOTALE EURO 5,18';

const LOCAL_ARTISAN_SHOPS = [
  { id: 'pescheria-locale-rapallo', name: '🐟 Pescheria / Mercato Rapallo' },
  { id: 'macelleria-locale-rapallo', name: '🥩 Macelleria / Polleria Rapallo' },
  { id: 'panificio-pastificio-rapallo', name: '🥖 Panificio / Pastificio Rapallo' }
];

export function ReceiptScannerModal({ isOpen, onClose, stores = [], onConfirmed }) {
  const [storeId, setStoreId] = useState(() => stores[0]?.id || 'rapallo-basko-colombo');
  const [rawText, setRawText] = useState('');
  const [declaredTotal, setDeclaredTotal] = useState('6,58');
  const [lines, setLines] = useState([
    { title: 'Spaghetti di Semola Rummo 500 g', lineTotal: '1,49', targetZone: 'dry_pantry', addToPantry: true },
    { title: 'Filetti di Acciughe del Mar Ligure 300 g', lineTotal: '3,89', targetZone: 'fridge_freezer', addToPantry: true },
    { title: 'Ceci Lessati al Vapore 400 g', lineTotal: '1,20', targetZone: 'boat_cooler', addToPantry: true }
  ]);
  const [discounts, setDiscounts] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const uniqueGdoStores = useMemo(() => {
    const seen = new Set();
    const list = [];
    const base =
      stores.length > 0
        ? stores
        : [
            { id: 'rapallo-basko-colombo', name: 'Basko Rapallo (Corso Colombo)' },
            { id: 'rapallo-coop-sciesa', name: 'Coop Rapallo (Via Sciesa)' },
            { id: 'rapallo-gulliver-mameli', name: 'Gulliver Rapallo (Corso Mameli)' },
            { id: 'rapallo-carrefour-assereto', name: 'Carrefour Market (Via Assereto)' },
            { id: 'rapallo-tigota-italia', name: 'Tigotà Rapallo (Corso Italia)' }
          ];
    for (const s of base) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      list.push(s);
    }
    return list;
  }, [stores]);

  const uniqueArtisanShops = useMemo(() => {
    const gdoIds = new Set(uniqueGdoStores.map((s) => s.id));
    return LOCAL_ARTISAN_SHOPS.filter((s) => !gdoIds.has(s.id));
  }, [uniqueGdoStores]);

  const toCents = (val) => {
    const n = parseFloat(String(val || '0').replace(',', '.'));
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  };

  const reconciliation = useMemo(() => {
    const linesCents = lines.reduce((acc, l) => acc + toCents(l.lineTotal), 0);
    const discCents = discounts.reduce((acc, d) => acc + Math.abs(toCents(d.amount)), 0);
    const computedCents = linesCents - discCents;
    const declaredCents = toCents(declaredTotal);
    const deltaCents = computedCents - declaredCents;
    const isReconciled = lines.length > 0 && declaredCents > 0 && deltaCents === 0;
    return {
      linesCents,
      discCents,
      computedCents,
      declaredCents,
      deltaCents,
      isReconciled
    };
  }, [lines, discounts, declaredTotal]);

  if (!isOpen) return null;

  const handleParseRawText = async (overrideText = null) => {
    const effectiveText = typeof overrideText === 'string' ? overrideText : (rawText.trim() ? rawText : SAMPLE_RECEIPT_TEXT);
    if (!rawText.trim()) {
      setRawText(effectiveText);
    }
    try {
      const res = await fetch('/api/receipts/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rawText: effectiveText, storeId })
      });
      const data = await res.json();
      if (res.ok && data.lines) {
        setLines(
          data.lines.map((l) => ({
            title: l.title,
            lineTotal: l.lineTotalEuro.toFixed(2).replace('.', ','),
            targetZone: l.targetZone || 'dry_pantry',
            addToPantry: l.addToPantry !== false
          }))
        );
        setDiscounts(
          (data.discounts || []).map((d) => ({
            label: d.label,
            amount: d.amountEuro.toFixed(2).replace('.', ',')
          }))
        );
        if (data.declaredTotalEuro > 0) {
          setDeclaredTotal(data.declaredTotalEuro.toFixed(2).replace('.', ','));
        }
      }
    } catch (_) {}
  };

  const handleConfirm = async (e) => {
    e.preventDefault();
    if (!reconciliation.isReconciled) return;
    setError(null);
    setSubmitting(true);
    try {
      const selectedStore = stores.find((s) => s.id === storeId);
      const res = await fetch('/api/receipts/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storeId,
          storeName: selectedStore ? selectedStore.name : storeId,
          declaredTotal: reconciliation.declaredCents / 100,
          lines: lines.map((l) => ({
            title: l.title,
            lineTotal: toCents(l.lineTotal) / 100,
            targetZone: l.targetZone,
            addToPantry: l.addToPantry
          })),
          discounts: discounts.map((d) => ({
            label: d.label,
            amount: Math.abs(toCents(d.amount)) / 100
          }))
        })
      });
      const body = await res.json();
      if (!res.ok) {
        throw new Error(body.error || 'Errore di riconciliazione scontrino');
      }
      if (onConfirmed) onConfirmed(body);
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="receipt-modal-title"
    >
      <div className="bg-white rounded-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h2 id="receipt-modal-title" className="text-base sm:text-lg font-extrabold">
              🧾 Acquisizione Scontrino con Quadratura al Centesimo
            </h2>
            <p className="text-xs text-slate-300">
              Effetto A: aggiorna i prezzi ordinari fuori offerta a Rapallo • Effetto B: carica la Dispensa a 3 luoghi (idempotente).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-300 hover:text-white p-1.5 rounded-lg bg-slate-800 cursor-pointer"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleConfirm} className="flex-1 overflow-y-auto p-4 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-xs text-rose-700 font-bold">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Negozio o Bottega di Rapallo
              </label>
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full text-xs border border-slate-300 rounded-lg px-3 py-2 bg-white"
              >
                <optgroup label="Supermercati & Negozi Rapallo">
                  {uniqueGdoStores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </optgroup>
                {uniqueArtisanShops.length > 0 && (
                  <optgroup label="Botteghe & Mercato Locale Rapallo">
                    {uniqueArtisanShops.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                Totale Pagato sullo Scontrino (€) *
              </label>
              <input
                type="text"
                value={declaredTotal}
                onChange={(e) => setDeclaredTotal(e.target.value)}
                className="w-full text-sm font-extrabold border-2 border-emerald-500 rounded-lg px-3 py-1.5 text-emerald-950"
              />
            </div>
          </div>

          {/* Optional OCR / Raw Text Paste Box */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-slate-700">
                📋 Incolla testo scontrino (OCR / copia-incolla rapido)
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleParseRawText(SAMPLE_RECEIPT_TEXT)}
                  className="px-2.5 py-1 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-300 rounded-lg cursor-pointer"
                >
                  📄 Carica esempio
                </button>
                <button
                  type="button"
                  onClick={() => handleParseRawText()}
                  className="px-2.5 py-1 text-xs font-bold bg-slate-800 hover:bg-slate-700 text-white rounded-lg cursor-pointer"
                >
                  Analizza righe →
                </button>
              </div>
            </div>
            <textarea
              rows={2}
              placeholder={SAMPLE_RECEIPT_TEXT}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              className="w-full text-xs font-mono border border-slate-300 rounded-lg p-2 bg-white"
            />
          </div>

          {/* Lines Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase">
                Righe Articoli Scontrino ({lines.length})
              </h3>
              <button
                type="button"
                onClick={() =>
                  setLines((prev) => [
                    ...prev,
                    { title: '', lineTotal: '0,00', targetZone: 'dry_pantry', addToPantry: true }
                  ])
                }
                className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg cursor-pointer"
              >
                + Aggiungi riga
              </button>
            </div>

            {lines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 p-2 rounded-lg border border-slate-200 text-xs">
                <input
                  type="text"
                  placeholder="Prodotto e grammatura (es. Riso Carnaroli 1kg)"
                  value={line.title}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLines((prev) => prev.map((it, i) => (i === idx ? { ...it, title: val } : it)));
                  }}
                  className="col-span-5 border border-slate-300 rounded px-2 py-1.5 bg-white"
                />
                <input
                  type="text"
                  placeholder="Prezzo €"
                  value={line.lineTotal}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLines((prev) => prev.map((it, i) => (i === idx ? { ...it, lineTotal: val } : it)));
                  }}
                  className="col-span-2 border border-slate-300 rounded px-2 py-1.5 text-right font-bold bg-white"
                />
                <select
                  value={line.targetZone}
                  onChange={(e) => {
                    const val = e.target.value;
                    setLines((prev) => prev.map((it, i) => (i === idx ? { ...it, targetZone: val } : it)));
                  }}
                  className="col-span-3 border border-slate-300 rounded px-1.5 py-1.5 bg-white text-[11px]"
                >
                  <option value="dry_pantry">🥫 Dispensa Secca</option>
                  <option value="fridge_freezer">❄️ Frigo / Freezer</option>
                  <option value="boat_cooler">⛵ Barca / Borsa Termica</option>
                </select>
                <div className="col-span-2 flex items-center justify-end gap-1.5">
                  <label className="inline-flex items-center gap-1 text-[10px] cursor-pointer" title="Carica in dispensa">
                    <input
                      type="checkbox"
                      checked={line.addToPantry}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setLines((prev) => prev.map((it, i) => (i === idx ? { ...it, addToPantry: checked } : it)));
                      }}
                    />
                    <span>Disp.</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-rose-500 hover:text-rose-700 font-bold px-1 cursor-pointer"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Discounts Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-extrabold text-slate-800 uppercase">
                Sconti & Buoni Fedeltà ({discounts.length})
              </h3>
              <button
                type="button"
                onClick={() => setDiscounts((prev) => [...prev, { label: 'Sconto Carta Fedeltà', amount: '0,50' }])}
                className="px-2.5 py-1 text-xs font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer"
              >
                + Aggiungi sconto
              </button>
            </div>
            {discounts.map((d, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs">
                <input
                  type="text"
                  value={d.label}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDiscounts((prev) => prev.map((it, i) => (i === idx ? { ...it, label: val } : it)));
                  }}
                  className="flex-1 border border-slate-300 rounded px-2 py-1"
                />
                <input
                  type="text"
                  value={d.amount}
                  onChange={(e) => {
                    const val = e.target.value;
                    setDiscounts((prev) => prev.map((it, i) => (i === idx ? { ...it, amount: val } : it)));
                  }}
                  className="w-24 border border-slate-300 rounded px-2 py-1 text-right font-bold text-rose-700"
                />
                <button
                  type="button"
                  onClick={() => setDiscounts((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-rose-500 font-bold px-1 cursor-pointer"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          {/* Cent-Exact Reconciliation Status Box */}
          <div
            className={`p-3.5 rounded-xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
              reconciliation.isReconciled
                ? 'bg-emerald-50 border-emerald-400 text-emerald-950'
                : 'bg-rose-50 border-rose-400 text-rose-950'
            }`}
          >
            <div className="text-xs space-y-0.5">
              <div className="font-extrabold">
                {reconciliation.isReconciled
                  ? '✅ Quadratura al centesimo verificata (Scarto € 0,00)'
                  : `⚠️ Blocco Quadratura: Scarto di ${(reconciliation.deltaCents / 100).toFixed(2)} € (${reconciliation.deltaCents} centesimi)`}
              </div>
              <div>
                Somma righe: € {(reconciliation.linesCents / 100).toFixed(2)} − Sconti: € {(reconciliation.discCents / 100).toFixed(2)} = Calcolato: <strong>€ {(reconciliation.computedCents / 100).toFixed(2)}</strong> vs Totale Scontrino: <strong>€ {(reconciliation.declaredCents / 100).toFixed(2)}</strong>
              </div>
            </div>

            <button
              type="submit"
              disabled={!reconciliation.isReconciled || submitting}
              className="px-4 py-2 text-xs font-extrabold text-white bg-emerald-700 hover:bg-emerald-800 rounded-xl shadow-xs disabled:opacity-40 cursor-pointer shrink-0"
            >
              {submitting ? 'Conferma in corso...' : 'Conferma Scontrino & Carica Dispensa'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default ReceiptScannerModal;
