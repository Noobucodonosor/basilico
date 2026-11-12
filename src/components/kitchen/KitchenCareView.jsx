import React, { useState, useEffect, useCallback } from 'react';
import KitchenResetCard from './KitchenResetCard.jsx';

const HEAT_SOURCE_LABELS = {
  gas: { label: '🔥 Fiamma Viva a Gas', desc: 'Conduzione + convezione anulare; compatibile con qualsiasi metallo (incluso rame e terracotta).' },
  induction: { label: '🧲 Piano a Induzione Elettromagnetica', desc: 'Correnti parassite di Foucault (20-100 kHz); richiede fondo ferromagnetico.' },
  electric_radiant: { label: '⚡ Piastra Elettrica / Vetroceramica Radiante', desc: 'Alta inerzia termica; richiede fondo perfettamente piatto.' },
  boat_no_stove: { label: '⛵ Cambusa Barca / Borsa Termica (Senza Forno)', desc: 'Fornello basculante singolo o zero-fuoco; privilegiate preparazioni one-pot.' }
};

export function KitchenCareView({ onNavigateToStoreDomain }) {
  const [kitchenState, setKitchenState] = useState(null);
  const [resetData, setResetData] = useState({ protocols: [], underSinkCatalog: [], liveRapalloCleaningOffers: [] });
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stateRes, resetRes] = await Promise.all([
        fetch('/api/kitchen/state').then((r) => (r.ok ? r.json() : null)),
        fetch('/api/kitchen/reset-protocol').then((r) => (r.ok ? r.json() : null))
      ]);
      if (stateRes) setKitchenState(stateRes);
      if (resetRes) setResetData(resetRes);
    } catch (_) {}
    setLoading(false);
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleUpdateConfig = async (payload) => {
    try {
      const res = await fetch('/api/kitchen/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        const updated = await res.json();
        setKitchenState(updated);
        const resetRes = await fetch(
          `/api/kitchen/reset-protocol?tools=${encodeURIComponent((updated.ownedToolIds || []).join(','))}`
        );
        if (resetRes.ok) {
          setResetData(await resetRes.json());
        }
      }
    } catch (_) {}
  };

  if (loading && !kitchenState) {
    return <div className="py-12 text-center text-sm text-slate-500">Caricamento configurazione cucina...</div>;
  }

  const activeHeatSource = kitchenState?.heatSource || 'gas';

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🍳</span>
            <h2 className="text-xl font-extrabold text-slate-900">
              Stanza 4 — Cucina, Pentole (ROI Sblocco Piatti) & Protocollo Chimico &ldquo;Kitchen Reset&rdquo;
            </h2>
          </div>
          <p className="text-xs text-slate-600 mt-1">
            Configura il tuo piano cottura (con verifica ferromagnetica sull&apos;induzione), scopri quanti piatti sblocca ogni pentola mancante e gestisci il sottolavello chimico collegato alle offerte di <strong>Tigotà</strong> e <strong>PiùMe</strong> a Rapallo.
          </p>
        </div>

        {onNavigateToStoreDomain && (
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => onNavigateToStoreDomain('home_cleaning')}
              className="px-3 py-2 bg-sky-700 hover:bg-sky-800 text-white text-xs font-extrabold rounded-xl cursor-pointer"
            >
              🧼 Offerte Tigotà & PiùMe →
            </button>
            <button
              type="button"
              onClick={() => onNavigateToStoreDomain('kitchen_cookware')}
              className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl cursor-pointer"
            >
              🍳 Offerte Pentole →
            </button>
          </div>
        )}
      </section>

      {/* Stove / Heat Source Configurator */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">
          1. Sorgente Termica Attiva (Piano Cottura)
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {Object.entries(HEAT_SOURCE_LABELS).map(([key, info]) => {
            const isSelected = activeHeatSource === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => handleUpdateConfig({ heatSource: key })}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-emerald-900 text-white border-emerald-700 shadow-xs'
                    : 'bg-slate-50 text-slate-800 border-slate-200 hover:border-emerald-300'
                }`}
              >
                <div className="text-xs font-extrabold">{info.label}</div>
                <p className={`text-[11px] mt-1 ${isSelected ? 'text-emerald-100' : 'text-slate-500'}`}>
                  {info.desc}
                </p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Disqualified Cookware Alert (e.g. Non-ferromagnetic on Induction) */}
      {kitchenState?.disqualifiedTools?.length > 0 && (
        <section className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-4 space-y-2">
          <h3 className="text-sm font-extrabold text-rose-900">
            ⚠️ Pentole Squalificate dal Piano Cottura Attivo ({kitchenState.disqualifiedTools.length})
          </h3>
          {kitchenState.disqualifiedTools.map((dt) => (
            <div key={dt.id} className="bg-white p-3 rounded-xl border border-rose-200 text-xs flex items-center justify-between gap-3">
              <div>
                <div className="font-bold text-slate-900">{dt.name}</div>
                <div className="text-rose-700 font-medium">{dt.disqualificationReason}</div>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateConfig({ toggleToolId: dt.id })}
                className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded font-bold shrink-0 cursor-pointer"
              >
                Rimuovi
              </button>
            </div>
          ))}
        </section>
      )}

      {/* Owned Cookware & Missing Cookware Unlock ROI */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Owned & Effective Tools */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                2. Dotazione Pentole & Lame Attive ({kitchenState?.effectiveTools?.length || 0})
              </h3>
              <p className="text-[11px] text-slate-500">
                Stoviglie fisicamente compatibili • Sbloccano{' '}
                <strong className="text-emerald-800">
                  {kitchenState?.totalUnlockedDishes || 0} / {kitchenState?.totalCatalogDishes || 264} piatti
                </strong>{' '}
                completi del catalogo.
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {(kitchenState?.effectiveTools || []).map((tool) => (
              <div key={tool.id} className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 text-xs space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">✓ {tool.name}</div>
                    <div className="text-[11px] text-emerald-800 font-semibold">
                      Abilita {tool.unlockedDishesCount} piatti del catalogo • T_max: {tool.maxTempC}°C
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateConfig({ toggleToolId: tool.id })}
                    className="px-2 py-1 text-[10px] font-bold text-rose-700 bg-white border border-rose-200 rounded cursor-pointer shrink-0"
                  >
                    Togli da dotazione
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">{tool.physicalJustification}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Missing Cookware & Recipe Unlock ROI */}
        <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          <div className="border-b border-slate-100 pb-2.5">
            <h3 className="text-sm font-extrabold text-amber-950">
              3. Analisi Gap & ROI Utensili Mancanti ({kitchenState?.missingRoiOpportunities?.length || 0})
            </h3>
            <p className="text-[11px] text-slate-500">
              Ordinati per numero di nuove ricette e piatti della tradizione ligure che sbloccano.
            </p>
          </div>

          <div className="space-y-2.5">
            {(kitchenState?.missingRoiOpportunities || []).map((opp) => (
              <div key={opp.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50/30 text-xs space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-slate-900">{opp.name}</div>
                    <div className="text-[11px] font-extrabold text-amber-800">
                      🔓 {opp.roiSummary}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateConfig({ toggleToolId: opp.id })}
                    className="px-2.5 py-1 text-[10px] font-extrabold bg-emerald-700 text-white rounded-lg cursor-pointer shrink-0"
                  >
                    + Ho questo utensile
                  </button>
                </div>
                <p className="text-[11px] text-slate-600">{opp.physicalJustification}</p>
                <div className="text-[10px] text-slate-500">
                  📍 Riferimento a Rapallo: <strong>{opp.rapalloSource}</strong> (~€ {Number(opp.referencePriceEuro).toFixed(2)})
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Under-Sink Chemical Inventory */}
      <section className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
        <div>
          <h3 className="text-sm font-extrabold text-slate-900">
            4. Dotazione Chimica Sottolavello (Acido / Neutro / Alcalino / Microfibra)
          </h3>
          <p className="text-xs text-slate-500">
            Spunta i prodotti che hai già in casa sotto il lavello: il protocollo Kitchen Reset segnalerà solo ciò che ti manca da Tigotà o PiùMe.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {(resetData.underSinkCatalog || []).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleUpdateConfig({ toggleCleaningKey: item.key })}
              className={`p-3 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                item.ownedInUnderSink
                  ? 'bg-sky-50 border-sky-300 text-sky-950'
                  : 'bg-slate-50 border-slate-200 text-slate-600'
              }`}
            >
              <div className="font-extrabold flex items-center justify-between">
                <span>{item.ownedInUnderSink ? '✓ In Sottolavello' : '🛒 Mancante'}</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-white border border-slate-200">
                  {item.phRange}
                </span>
              </div>
              <div className="font-bold text-slate-900 mt-1">{item.name}</div>
              <div className="text-[10px] text-slate-500 mt-0.5">{item.brand} • ~€ {item.referencePriceEuro}</div>
              {item.matchedOffers?.length > 0 && (
                <div className="mt-1.5 text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
                  🏷️ Promo {item.matchedOffers[0].storeName}: €{Number(item.matchedOffers[0].promoPrice).toFixed(2)}
                </div>
              )}
            </button>
          ))}
        </div>
      </section>

      {/* P0-Safety Chemical Incompatibility Matrix */}
      {resetData.chemicalSafetyMatrix?.length > 0 && (
        <section className="bg-rose-50/80 rounded-2xl border-2 border-rose-300 p-4 shadow-xs space-y-3">
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-rose-700 text-white">
              P0-Safety · Sicurezza Chimica Domestica
            </span>
            <h3 className="text-sm font-extrabold text-rose-950 mt-1">
              ☠️ Matrice Incompatibilità Chimiche Critiche (Miscele Vietate Sottolavello)
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {resetData.chemicalSafetyMatrix.map((rule) => (
              <div key={rule.id} className="bg-white rounded-xl border border-rose-200 p-3 text-xs space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-extrabold text-rose-900">
                    ⛔ {rule.reagentA} + {rule.reagentB}
                  </span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-extrabold bg-rose-100 text-rose-900 shrink-0">
                    {rule.severity}
                  </span>
                </div>
                <div className="font-mono text-[11px] text-slate-700 bg-slate-50 px-2 py-1 rounded border border-slate-200">
                  {rule.hazardFormula} → {rule.toxicProduct}
                </div>
                <p className="text-[11px] text-slate-700">{rule.clinicalRisk}</p>
                <p className="text-[11px] font-bold text-rose-800">Regola: {rule.mandatoryRule}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chemical Kitchen Reset Protocols */}
      <section className="space-y-3">
        <h3 className="text-sm font-extrabold text-slate-900">
          5. Protocolli Operativi Post-Cottura &ldquo;Kitchen Reset&rdquo; per le tue Pentole
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(resetData.protocols || []).map((proto) => (
            <KitchenResetCard key={proto.toolId} protocol={proto} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default KitchenCareView;
