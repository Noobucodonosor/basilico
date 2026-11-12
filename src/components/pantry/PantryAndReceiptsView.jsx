import React, { useState, useEffect, useCallback } from 'react';
import ReceiptScannerModal from './ReceiptScannerModal.jsx';

const ZONE_META = {
  dry_pantry: {
    id: 'dry_pantry',
    title: '🥫 Dispensa Secca Casa',
    subtitle: 'Pasta, riso, legumi secchi, conserve, olio EVO e spezie',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200'
  },
  fridge_freezer: {
    id: 'fridge_freezer',
    title: '❄️ Frigo & Freezer Casa',
    subtitle: 'Pesce fresco del Tigullio, carni, verdure e freschi aperti con orologio T_open',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200'
  },
  boat_cooler: {
    id: 'boat_cooler',
    title: '⛵ Dotazione Barca & Borsa Termica',
    subtitle: 'Cambusa pronta per uscita in mare: conserve nobili, piatti one-pot, zero-forno',
    badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200'
  }
};

export function PantryAndReceiptsView({ stores = [], onPantryUpdated }) {
  const [pantryData, setPantryData] = useState({
    items: [],
    byZone: { dry_pantry: [], fridge_freezer: [], boat_cooler: [] },
    openedPriorityAlerts: []
  });
  const [receipts, setReceipts] = useState([]);
  const [activeZoneFilter, setActiveZoneFilter] = useState('ALL');
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);

  // Quick manual add item state
  const [newTitle, setNewTitle] = useState('');
  const [newWeight, setNewWeight] = useState('250');
  const [newZone, setNewZone] = useState('dry_pantry');

  const fetchPantryAndReceipts = useCallback(() => {
    fetch('/api/pantry')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setPantryData(data);
      })
      .catch(() => {});

    fetch('/api/receipts')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.receipts)) setReceipts(data.receipts);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetchPantryAndReceipts();
  }, [fetchPantryAndReceipts]);

  const handleAction = async (itemId, payload) => {
    try {
      const res = await fetch(`/api/pantry/items/${encodeURIComponent(itemId)}/consume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setPantryData(updated);
        if (onPantryUpdated) onPantryUpdated();
      }
    } catch (_) {}
  };

  const handleQuickAdd = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    const parsedWeight = Number(String(newWeight || '250').replace(',', '.'));
    const safeWeight = Number.isFinite(parsedWeight) && parsedWeight > 0 ? Math.round(parsedWeight) : 250;
    try {
      const res = await fetch('/api/pantry/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle.trim(),
          initialWeightGrams: safeWeight,
          zone: newZone,
          status: 'closed'
        })
      });
      if (res.ok) {
        const updated = await res.json();
        setPantryData(updated);
        setNewTitle('');
        if (onPantryUpdated) onPantryUpdated();
      }
    } catch (_) {}
  };

  const zonesToRender = activeZoneFilter === 'ALL'
    ? ['fridge_freezer', 'dry_pantry', 'boat_cooler']
    : [activeZoneFilter];

  return (
    <div className="space-y-6">
      {/* Top Header Banner */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🥫</span>
            <h2 className="text-xl font-extrabold text-slate-900">
              Stanza 5 — Dispensa Fisica a 3 Luoghi & Scontrini al Centesimo
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Inventario reale diviso tra <strong>Dispensa Secca</strong>, <strong>Frigo/Freezer</strong> e <strong>Dotazione Barca / Borsa Termica</strong> con orologio reale <code className="font-mono">T_open</code> sui freschi aperti e riconciliazione scontrini al centesimo.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsReceiptModalOpen(true)}
          className="px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-extrabold rounded-xl shadow-xs cursor-pointer shrink-0"
        >
          🧾 + Registra Scontrino (Quadratura al Centesimo)
        </button>
      </section>

      {/* Priority Alert Banner for Opened Perishables (T_open Clock) */}
      {pantryData.openedPriorityAlerts?.length > 0 && (
        <section className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-extrabold text-amber-950">
              ⏱️ Priorità Zero-Spreco: Confezioni Fresche Aperte (Orologio T_open attivo)
            </h3>
            <span className="text-[11px] font-bold text-amber-800 bg-amber-200/70 px-2 py-0.5 rounded">
              Usate per prime dal Pianificatore in Stanza 6
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {pantryData.openedPriorityAlerts.map((item) => (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-amber-200 p-3 flex items-center justify-between gap-3 text-xs"
              >
                <div>
                  <div className="font-bold text-slate-900">{item.title}</div>
                  <div className="text-[11px] text-slate-600">
                    Residuo: <strong>{item.remainingWeightGrams} {item.unit}</strong> (su {item.initialWeightGrams} {item.unit}) • Finestra T_open: <strong>{item.hoursRemaining}h rimanenti</strong>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, { gramsUsed: 100 })}
                    className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 font-bold rounded cursor-pointer"
                  >
                    -100g
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAction(item.id, { markFinished: true })}
                    className="px-2 py-1 bg-emerald-700 text-white font-bold rounded cursor-pointer"
                  >
                    ✓ Finito
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Zone Switcher + Quick Add Form */}
      <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-white p-4 rounded-xl border border-slate-200">
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => setActiveZoneFilter('ALL')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer ${
              activeZoneFilter === 'ALL' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
            }`}
          >
            Tutti i 3 Luoghi ({pantryData.items?.length || 0})
          </button>
          {Object.values(ZONE_META).map((z) => (
            <button
              key={z.id}
              type="button"
              onClick={() => setActiveZoneFilter(z.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap cursor-pointer ${
                activeZoneFilter === z.id ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'
              }`}
            >
              {z.title} ({pantryData.byZone?.[z.id]?.length || 0})
            </button>
          ))}
        </div>

        <form onSubmit={handleQuickAdd} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Aggiungi scorta rapida (es. Riso Carnaroli)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2.5 py-1.5 w-52"
          />
          <input
            type="number"
            placeholder="Grammi"
            value={newWeight}
            onChange={(e) => setNewWeight(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 w-20"
          />
          <select
            value={newZone}
            onChange={(e) => setNewZone(e.target.value)}
            className="text-xs border border-slate-300 rounded-lg px-2 py-1.5 bg-white"
          >
            <option value="dry_pantry">🥫 Dispensa Secca</option>
            <option value="fridge_freezer">❄️ Frigo / Freezer</option>
            <option value="boat_cooler">⛵ Barca / Termica</option>
          </select>
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-900 text-white text-xs font-bold rounded-lg cursor-pointer"
          >
            + Aggiungi
          </button>
        </form>
      </section>

      {/* 3 Zones Inventory Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {zonesToRender.map((zoneKey) => {
          const meta = ZONE_META[zoneKey];
          const zoneItems = pantryData.byZone?.[zoneKey] || [];
          return (
            <section key={zoneKey} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="border-b border-slate-100 pb-2.5">
                <h3 className="text-sm font-extrabold text-slate-900">{meta.title}</h3>
                <p className="text-[11px] text-slate-500">{meta.subtitle}</p>
              </div>

              {zoneItems.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">Nessun prodotto in questa zona.</p>
              ) : (
                <div className="space-y-2.5">
                  {zoneItems.map((item) => (
                    <div
                      key={item.id}
                      className={`p-3 rounded-xl border text-xs space-y-2 ${
                        item.status === 'opened'
                          ? 'bg-amber-50/40 border-amber-300'
                          : 'bg-slate-50/60 border-slate-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="font-bold text-slate-900">{item.title}</div>
                          <div className="text-[11px] text-slate-500">
                            {item.brand ? `${item.brand} • ` : ''}
                            Residuo: <strong>{item.remainingWeightGrams} {item.unit}</strong> / {item.initialWeightGrams} {item.unit}
                          </div>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold shrink-0 ${
                            item.status === 'opened'
                              ? 'bg-amber-200 text-amber-950'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {item.status === 'opened' ? `Aperto (${item.hoursRemaining ?? item.tOpenHours}h)` : 'Integro'}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-200/60">
                        <div className="flex items-center gap-1">
                          {item.status === 'closed' && (
                            <button
                              type="button"
                              onClick={() => handleAction(item.id, { openNow: true })}
                              className="px-2 py-1 bg-amber-500 text-white rounded text-[10px] font-bold cursor-pointer"
                            >
                              🔓 Apri confezione
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAction(item.id, { gramsUsed: 50 })}
                            className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[10px] font-semibold cursor-pointer"
                          >
                            -50{item.unit}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAction(item.id, { gramsUsed: 100 })}
                            className="px-2 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded text-[10px] font-semibold cursor-pointer"
                          >
                            -100{item.unit}
                          </button>
                        </div>

                        <div className="flex items-center gap-1">
                          {zoneKey !== 'boat_cooler' && (
                            <button
                              type="button"
                              onClick={() => handleAction(item.id, { targetZone: 'boat_cooler' })}
                              className="px-2 py-1 bg-indigo-50 text-indigo-800 border border-indigo-200 rounded text-[10px] font-semibold cursor-pointer"
                              title="Sposta nella Borsa Termica Barca"
                            >
                              → ⛵ Barca
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => handleAction(item.id, { markFinished: true })}
                            className="px-2 py-1 bg-rose-50 text-rose-700 hover:bg-rose-100 rounded text-[10px] font-bold cursor-pointer"
                          >
                            Finito
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>

      {/* Verified Receipts Ledger */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-extrabold text-slate-900">
              🧾 Registro Scontrini Riconciliati al Centesimo ({receipts.length})
            </h3>
            <p className="text-xs text-slate-500">
              Ogni scontrino confermato ha scarto 0,00 € e alimenta i prezzi ordinari fuori offerta di Rapallo.
            </p>
          </div>
        </div>
        {receipts.length === 0 ? (
          <p className="text-xs text-slate-400">
            Nessuno scontrino ancora registrato in questa sessione. Clicca su &ldquo;+ Registra Scontrino&rdquo; per provarlo.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {receipts.map((r) => (
              <div key={r.id} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">🏪 {r.storeName}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.linesCount} articoli • Caricati in dispensa: {r.pantryItemsAddedCount} • Rev: {r.pantryTransferRevision}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-extrabold text-emerald-700">€ {Number(r.declaredTotalEuro).toFixed(2)}</div>
                  <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-1.5 py-0.5 rounded">
                    ✓ Scarto 0,00 €
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <ReceiptScannerModal
        isOpen={isReceiptModalOpen}
        onClose={() => setIsReceiptModalOpen(false)}
        stores={stores}
        onConfirmed={() => {
          fetchPantryAndReceipts();
          if (onPantryUpdated) onPantryUpdated();
        }}
      />
    </div>
  );
}

export default PantryAndReceiptsView;
