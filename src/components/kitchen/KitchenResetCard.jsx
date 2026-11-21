import React from 'react';

export function KitchenResetCard({ protocol }) {
  if (!protocol) return null;

  return (
    <article className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-100 text-sky-900">
            Protocollo Chimico & Fisico
          </span>
          <h4 className="text-sm font-extrabold text-slate-900 mt-1">
            🧼 {protocol.toolName}
          </h4>
          <p className="text-[11px] text-slate-500">
            Substrato: <strong>{protocol.materialLabel}</strong>
          </p>
        </div>

        <div className="px-2.5 py-1 rounded-lg bg-amber-50 border border-amber-200 text-xs font-bold text-amber-900">
          ⏱️ Raffreddamento anti-shock: {protocol.cooldownMinutes} min
        </div>
      </div>

      {/* Physical / Chemical Warning */}
      <div className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 text-xs text-amber-950">
        <strong>🔬 Scienza dei Materiali:</strong> {protocol.thermalShockWarning}
      </div>

      {/* Prohibitions */}
      {protocol.prohibitions?.length > 0 && (
        <div className="space-y-1">
          <div className="text-[11px] font-extrabold text-rose-700 uppercase">Divieti Assoluti:</div>
          <ul className="list-disc list-inside text-xs text-rose-800 space-y-0.5">
            {protocol.prohibitions.map((pr, idx) => (
              <li key={idx}>{pr}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Step-by-Step Procedure */}
      <div className="space-y-1">
        <div className="text-[11px] font-extrabold text-slate-700 uppercase">Procedura Step-by-Step:</div>
        <ol className="list-decimal list-inside text-xs text-slate-700 space-y-1">
          {(protocol.steps || []).map((st, idx) => (
            <li key={idx}>{st}</li>
          ))}
        </ol>
      </div>

      {/* Required Under-Sink Supplies */}
      {protocol.requiredSupplies?.length > 0 && (
        <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-bold text-slate-500">Prodotti richiesti nel sottolavello:</span>
          {protocol.requiredSupplies.map((sup) => (
            <span
              key={sup.id}
              className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                sup.ownedInUnderSink
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {sup.ownedInUnderSink ? '✓ In casa: ' : '🛒 Da acquistare (Tigotà/PiùMe): '}
              {sup.name} ({sup.phRange})
            </span>
          ))}
        </div>
      )}
    </article>
  );
}

export default KitchenResetCard;
