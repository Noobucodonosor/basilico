import React, { useEffect, useRef } from 'react';

/**
 * SyncStatusModal Component (ADR-0005)
 * Native HTML5 <dialog> modal that provides transparent, step-by-step live status
 * during Quick Sync and Deep Sync operations so the user always knows what is happening.
 */
export function SyncStatusModal({ isOpen, progress, onClose }) {
  const dialogRef = useRef(null);
  const logContainerRef = useRef(null);

  const isActive = Boolean(progress?.active);
  const mode = progress?.mode === 'deep' ? 'deep' : 'quick';
  const percent = typeof progress?.percent === 'number' ? Math.max(0, Math.min(100, progress.percent)) : (isActive ? 20 : 100);
  const completedStores = progress?.completedStores ?? 0;
  const totalStores = progress?.totalStores ?? 14;
  const flyersFound = progress?.flyersFound ?? 0;
  const offersFound = progress?.offersFound ?? 0;
  const logs = Array.isArray(progress?.logs) ? progress.logs : [];

  // Synchronize open/close state with native <dialog> top-layer API
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      if (!dialog.open) {
        dialog.showModal();
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  // Auto-scroll activity log to latest entry
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs.length]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="sync-dialog-title"
      aria-describedby="sync-dialog-desc"
      onCancel={(e) => {
        if (isActive) {
          e.preventDefault();
        } else {
          onClose?.();
        }
      }}
      className="fixed inset-0 m-auto w-[92vw] max-w-lg rounded-2xl bg-white text-slate-900 shadow-2xl border border-slate-200 p-0 overflow-hidden backdrop:bg-slate-900/60 backdrop:backdrop-blur-xs overscroll-contain"
    >
      {/* Top Banner Header */}
      <div className={`px-5 py-4 border-b flex items-center justify-between gap-3 ${
        isActive
          ? (mode === 'deep' ? 'bg-indigo-50/90 border-indigo-100' : 'bg-emerald-50/90 border-emerald-100')
          : 'bg-emerald-600 text-white border-emerald-700'
      }`}>
        <div className="flex items-center gap-3 min-w-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
            isActive
              ? (mode === 'deep' ? 'bg-indigo-600 text-white' : 'bg-emerald-600 text-white')
              : 'bg-white/20 text-white'
          }`}>
            {isActive ? (
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            )}
          </div>
          <div className="min-w-0">
            <span className={`inline-block text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full mb-0.5 ${
              isActive
                ? (mode === 'deep' ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800')
                : 'bg-white/20 text-white'
            }`}>
              {mode === 'deep' ? 'Deep Sync 14 Negozi Rapallo' : 'Controllo Rapido Rapallo'}
            </span>
            <h2
              id="sync-dialog-title"
              className={`text-base font-bold truncate ${isActive ? 'text-slate-900' : 'text-white'}`}
            >
              {progress?.title || (isActive ? 'Sincronizzazione in corso...' : 'Operazione Completata!')}
            </h2>
          </div>
        </div>

        {!isActive && (
          <button
            type="button"
            onClick={() => onClose?.()}
            aria-label="Chiudi finestra di stato"
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {/* Body Content */}
      <div className="p-5 space-y-4">
        <p id="sync-dialog-desc" className="text-xs text-slate-600 leading-relaxed">
          {isActive ? (
            mode === 'deep'
              ? 'Stiamo interrogando uno per uno i 14 punti vendita reali di Rapallo per scaricare i volantini attivi e i singoli prodotti in offerta, filtrando fuori le province non pertinenti.'
              : 'Stiamo verificando la disponibilità online e lo stato della cache dei volantini di Rapallo.'
          ) : (
            'Tutti i dati sono stati verificati e salvati nella memoria locale di C.I.B.O. Puoi chiudere questa finestra e consultare le offerte.'
          )}
        </p>

        {/* Progress Bar & Current Store */}
        <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-slate-700 truncate pr-2" aria-live="polite">
              {progress?.currentStore || (isActive ? 'Connessione in corso...' : 'Tutti i negozi di Rapallo aggiornati')}
            </span>
            <span className={`font-mono shrink-0 ${mode === 'deep' ? 'text-indigo-700' : 'text-emerald-700'}`}>
              {percent}%
            </span>
          </div>

          <div className="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                !isActive
                  ? 'bg-emerald-600'
                  : (mode === 'deep' ? 'bg-indigo-600' : 'bg-emerald-600')
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
            <span>
              Punti vendita: <strong className="text-slate-700">{completedStores} / {totalStores}</strong>
            </span>
            <span>
              Costo operazione: <strong className="text-emerald-700">Gratuito (€ 0,00)</strong>
            </span>
          </div>
        </div>

        {/* Live Counters Grid */}
        <div className="grid grid-cols-3 gap-2.5 text-center">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
            <div className="text-lg font-extrabold text-slate-900 font-mono">
              {completedStores}/{totalStores}
            </div>
            <div className="text-[11px] font-medium text-slate-500">Negozi Analizzati</div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
            <div className="text-lg font-extrabold text-emerald-700 font-mono">
              {flyersFound}
            </div>
            <div className="text-[11px] font-medium text-slate-500">Volantini Rapallo</div>
          </div>
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-2.5">
            <div className="text-lg font-extrabold text-indigo-700 font-mono">
              {offersFound}
            </div>
            <div className="text-[11px] font-medium text-slate-500">Offerte Estratte</div>
          </div>
        </div>

        {/* Step-by-Step Real-Time Activity Log */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Registro Operazioni in Tempo Reale
            </span>
            {isActive && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                In esecuzione
              </span>
            )}
          </div>
          <div
            ref={logContainerRef}
            className="bg-slate-900 text-slate-200 font-mono text-[11px] rounded-xl p-3 h-36 overflow-y-auto space-y-1 border border-slate-800"
            aria-live="polite"
          >
            {logs.length === 0 ? (
              <div className="text-slate-400">Avvio comunicazione con il server locale...</div>
            ) : (
              logs.map((entry, idx) => (
                <div key={idx} className="leading-relaxed break-words">
                  {entry}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
        <span className="text-[11px] text-slate-500">
          {isActive
            ? 'Attendere qualche secondo: chiusura automatica abilitata al termine.'
            : 'Dati pronti per la consultazione.'}
        </span>

        <button
          type="button"
          disabled={isActive}
          autoFocus={!isActive}
          onClick={() => onClose?.()}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            isActive
              ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
          }`}
        >
          {isActive ? 'Operazione in corso...' : 'Chiudi e Visualizza Offerte'}
        </button>
      </div>
    </dialog>
  );
}

export default SyncStatusModal;
