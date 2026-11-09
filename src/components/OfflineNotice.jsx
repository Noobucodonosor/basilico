import React, { useState } from 'react';

/**
 * OfflineNotice component (F15)
 * Displays user-facing resilience banner when cached or seed data is served.
 * 
 * Complies with tests/e2e/offline_resilience.test.js:
 * - 15.1: dataSource === 'seed' -> "modalità offline"
 * - 15.2: dataSource === 'cache' -> "copia cache"
 * - 15.3: dataSource === 'live' -> banner hidden
 * - 15.4: retry button calling retrySync()
 * - 15.7: cached > 24 hours -> "24 ore fa"
 * - 15.8: manual dismiss button
 */
export function OfflineNotice({
  isOnline = true,
  dataSource = 'live',
  lastSyncTimestamp = null,
  isDismissed = false,
  isBannerDismissed = false,
  onDismiss,
  onRetry
}) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);

  const dismissed = isDismissed || isBannerDismissed;
  if (dismissed) return null;

  // Compute staleness (older than 24 hours = 86400000 ms)
  const isStale = Boolean(
    dataSource === 'cache' &&
    lastSyncTimestamp &&
    (Date.now() - new Date(lastSyncTimestamp).getTime()) > 86400000
  );

  const showBanner = dataSource === 'seed' || dataSource === 'cache' || !isOnline;
  if (!showBanner) return null;

  let bannerMessage = '';
  let badgeText = 'Cache';
  let badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';

  if (dataSource === 'seed' || !isOnline) {
    bannerMessage = 'Sei in modalità offline. Visualizzazione dati promozionali salvati per Rapallo.';
    badgeText = 'Offline';
    badgeClass = 'bg-sky-100 text-sky-800 border-sky-200';
  } else if (isStale) {
    bannerMessage = 'Dati promozionali memorizzati oltre 24 ore fa. Alcuni prezzi potrebbero variare.';
    badgeText = 'Obsoleto';
    badgeClass = 'bg-amber-200 text-amber-900 border-amber-300';
  } else if (dataSource === 'cache') {
    bannerMessage = 'Connessione upstream non disponibile. Visualizzazione copia cache.';
    badgeText = 'Copia Cache';
    badgeClass = 'bg-amber-100 text-amber-800 border-amber-200';
  }

  const handleRetry = async () => {
    if (!onRetry) return;
    setIsRetrying(true);
    setRetryError(null);
    try {
      const res = await onRetry();
      if (res && res.success === false) {
        setRetryError('Riconnessione non riuscita.');
      }
    } catch (err) {
      setRetryError(err.message || 'Errore sincronizzazione.');
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <aside
      role="status"
      aria-live="polite"
      className="w-full bg-amber-500/15 border-b border-amber-300 px-4 py-2.5 text-xs sm:text-sm font-medium text-amber-950 transition-all shadow-xs"
    >
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-base select-none" aria-hidden="true">⚠️</span>
          <span className={`inline-block px-2 py-0.5 text-xs font-semibold rounded-full border ${badgeClass} shrink-0`}>
            {badgeText}
          </span>
          <span className="truncate">{bannerMessage}</span>
          {retryError && (
            <span className="text-red-700 text-xs font-semibold ml-1 shrink-0">
              ({retryError})
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          {onRetry && (
            <button
              type="button"
              onClick={handleRetry}
              disabled={isRetrying}
              className="px-3 py-1 bg-slate-900 text-white rounded-md text-xs font-bold hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isRetrying && (
                <svg className="animate-spin h-3.5 w-3.5 text-white" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
              )}
              <span>{isRetrying ? 'Riconnessione...' : 'Riprova'}</span>
            </button>
          )}

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="p-1 text-slate-800 hover:bg-amber-400/40 rounded transition-colors cursor-pointer"
              aria-label="Chiudi avviso"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}

export default OfflineNotice;
