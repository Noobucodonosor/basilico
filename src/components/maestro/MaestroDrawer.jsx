import React, { useState, useEffect, useRef, useCallback } from 'react';

const FIVE_SOULS_CHIPS = [
  {
    soul: '🥗 Nutrizione',
    prompt: 'Cosa cucino stasera col mio frigo per fare il pieno di Calcio biodisponibile e Omega-3 senza formaggi?'
  },
  {
    soul: '👨‍🍳 Arte Culinaria',
    prompt: 'SOS Fornelli: l\'emulsione della pasta si è slegata e il pesce fa acqua in padella, come recupero?'
  },
  {
    soul: '🍳 Fisica Strumenti',
    prompt: 'Posso mettere la padella antiaderente PTFE sul Boost induzione o mi conviene usare l\'acciaio inox?'
  },
  {
    soul: '🧼 Chimica Casa',
    prompt: 'Posso usare candeggina sull\'inox o aceto sul marmo di Carrara? E aceto + bicarbonato funziona?'
  },
  {
    soul: '💶 Economia Rapallo',
    prompt: 'Conviene dividere la spesa in 2 o 3 negozi a Rapallo oggi tenendo conto del valore del mio tempo?'
  }
];

export function MaestroDrawer({
  isOpen,
  onClose,
  activeProfileId = 'dany',
  rhythmPreset = 'feriale',
  initialPrompt = ''
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome-maestro',
      role: 'assistant',
      mode: 'deterministic_scientific_engine',
      content:
        'Benvenuto! Sono **Basilico Maestro**. Leggo in sola lettura il tuo frigo (`VaR_48h`), il tuo piano cottura, le tue pentole, il profilo *Zero Formaggi* e le offerte reali di Rapallo — con zero numeri inventati e guardie chimico-fisiche P0 sempre attive. Chiedimi qualsiasi cosa sulle 5 Anime!',
      p0Alerts: [],
      groundedCitations: []
    }
  ]);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeEngineMode, setActiveEngineMode] = useState('deterministic_scientific_engine');
  const [contextSummary, setContextSummary] = useState(null);
  const lastHandledInitialPromptRef = useRef('');
  const bottomRef = useRef(null);

  const sendPrompt = useCallback(
    async (rawText) => {
      const trimmed = String(rawText || '').trim();
      if (!trimmed || sending) return;

      const userMsg = {
        id: `usr-${Date.now()}`,
        role: 'user',
        content: trimmed
      };

      const historyPayload = messages
        .filter((m) => m.id !== 'welcome-maestro')
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [...prev, userMsg]);
      setInputText('');
      setSending(true);

      try {
        const res = await fetch('/api/maestro/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: trimmed,
            history: historyPayload,
            profileId: activeProfileId,
            rhythmPreset
          })
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Errore risposta Maestro');
        }

        if (data.mode) setActiveEngineMode(data.mode);
        if (data.contextSummary) setContextSummary(data.contextSummary);

        setMessages((prev) => [
          ...prev,
          {
            id: `mst-${Date.now()}`,
            role: 'assistant',
            mode: data.mode || 'deterministic_scientific_engine',
            content: data.reply || '',
            p0Alerts: Array.isArray(data.p0Alerts) ? data.p0Alerts : [],
            groundedCitations: Array.isArray(data.groundedCitations) ? data.groundedCitations : [],
            detectedIntents: Array.isArray(data.detectedIntents) ? data.detectedIntents : []
          }
        ]);
      } catch (err) {
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            role: 'assistant',
            mode: 'deterministic_scientific_engine',
            content: `Non sono riuscito a completare la richiesta: ${err.message || 'riprova tra un istante'}.`,
            p0Alerts: [],
            groundedCitations: []
          }
        ]);
      } finally {
        setSending(false);
      }
    },
    [activeProfileId, messages, rhythmPreset, sending]
  );

  // Hydrate context summary when drawer opens and handle optional initialPrompt
  useEffect(() => {
    if (!isOpen) return;

    fetch(
      `/api/maestro/today-copilot?profileId=${encodeURIComponent(activeProfileId)}&rhythmPreset=${encodeURIComponent(rhythmPreset)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          setContextSummary({
            profileId: data.activeProfile?.id || activeProfileId,
            profileName: data.activeProfile?.name || activeProfileId,
            rhythmPreset: data.activeRhythm?.activeRhythmPreset || rhythmPreset,
            hourlyValueEuro: data.activeRhythm?.hourlyValueEuro ?? 18,
            valueAtRisk48hEuro: data.valueAtRisk48h?.totalAtRiskEuro ?? 0
          });
        }
      })
      .catch(() => {});

    const cleanInit = String(initialPrompt || '').trim();
    if (cleanInit && cleanInit !== lastHandledInitialPromptRef.current) {
      lastHandledInitialPromptRef.current = cleanInit;
      sendPrompt(cleanInit);
    }
  }, [isOpen, initialPrompt, activeProfileId, rhythmPreset, sendPrompt]);

  useEffect(() => {
    if (!isOpen) {
      lastHandledInitialPromptRef.current = '';
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!isOpen) return null;

  const isLiveLlm = activeEngineMode && activeEngineMode !== 'deterministic_scientific_engine';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-950/55 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Chat con Basilico Maestro"
      data-testid="maestro-drawer"
    >
      <div className="fixed inset-0" onClick={() => onClose?.()} aria-hidden="true" />

      <aside className="relative z-10 w-full sm:max-w-lg bg-white h-full shadow-2xl flex flex-col border-l border-slate-200">
        {/* Top Header + Active Engine Mode Badge + Grounded Context Strip */}
        <header className="bg-slate-900 text-white p-4 space-y-2.5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold">🌿 Basilico Maestro</h2>
                <span
                  className={`text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                    isLiveLlm
                      ? 'bg-violet-500/20 text-violet-200 border-violet-400/40'
                      : 'bg-emerald-500/20 text-emerald-200 border-emerald-400/40'
                  }`}
                >
                  {isLiveLlm ? '✨ LLM Grounded Live' : '🛡️ Grounded Deterministico Offline'}
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                Co-pilota scientifico a 5 Anime • Zero numeri inventati (ADR-0006) • Guardie P0 attive
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-bold text-slate-200 cursor-pointer"
              aria-label="Chiudi chat Maestro"
            >
              ✕ Chiudi
            </button>
          </div>

          {/* Grounded Household Context Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded bg-slate-800 text-emerald-300 font-semibold">
              👤 Profilo: {contextSummary?.profileName || activeProfileId}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold">
              ⏰ VaR 48h: €{Number(contextSummary?.valueAtRisk48hEuro || 0).toFixed(2)}
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-800 text-sky-300 font-semibold">
              ⚡ Ritmo: {contextSummary?.rhythmPreset || rhythmPreset} (€{contextSummary?.hourlyValueEuro ?? 18}/h)
            </span>
            {contextSummary?.heatSource && (
              <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-200 font-semibold">
                🔥 Piano: {contextSummary.heatSource}
              </span>
            )}
          </div>
        </header>

        {/* 5 Quick Chips (1 per Soul) */}
        <div className="px-3.5 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {FIVE_SOULS_CHIPS.map((chip) => (
            <button
              key={chip.soul}
              type="button"
              disabled={sending}
              onClick={() => sendPrompt(chip.prompt)}
              className="px-2.5 py-1.5 rounded-full bg-white hover:bg-emerald-50 border border-slate-200 hover:border-emerald-300 text-[11px] font-bold text-slate-800 whitespace-nowrap transition-colors cursor-pointer shrink-0"
            >
              {chip.soul}
            </button>
          ))}
        </div>

        {/* Conversation Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-slate-50/50">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* High-Visibility Red P0 Safety Alert Box */}
                {!isUser && Array.isArray(msg.p0Alerts) && msg.p0Alerts.length > 0 && (
                  <div
                    className="w-full mb-2 p-3.5 rounded-xl bg-rose-950 text-white border-2 border-rose-500 shadow-xs space-y-2"
                    role="alert"
                  >
                    <div className="text-xs font-extrabold uppercase tracking-wider text-rose-300">
                      🛑 Blocco di Sicurezza Chimico-Fisica P0 Attivato
                    </div>
                    {msg.p0Alerts.map((al) => (
                      <div key={al.code} className="text-xs space-y-0.5 border-t border-rose-800/80 pt-1.5">
                        <div className="font-extrabold text-white">
                          [{al.code}] {al.title}
                        </div>
                        <p className="text-[11px] text-rose-100 leading-relaxed">
                          {al.scientificWarning}
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                <div
                  className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed whitespace-pre-line shadow-xs ${
                    isUser
                      ? 'bg-emerald-700 text-white font-medium'
                      : 'bg-white text-slate-800 border border-slate-200'
                  }`}
                >
                  {msg.content}

                  {!isUser && Array.isArray(msg.groundedCitations) && msg.groundedCitations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-slate-400">Fonti verificate:</span>
                      {msg.groundedCitations.map((cit, i) => (
                        <span
                          key={`${cit.source}-${i}`}
                          className="text-[10px] font-mono bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded"
                        >
                          {cit.source}
                          {cit.code ? `:${cit.code}` : ''}
                          {cit.dishId ? `:${cit.dishId}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="text-xs text-slate-500 font-medium px-2 animate-pulse">
              Il Maestro sta consultando i motori deterministici della tua casa...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Message Input Bar */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            sendPrompt(inputText);
          }}
          className="p-3 bg-white border-t border-slate-200 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Es. Cosa cucino stasera in 12 min? Come tolgo il calcare?"
            className="flex-1 rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer"
          >
            Invia
          </button>
        </form>
      </aside>
    </div>
  );
}

export default MaestroDrawer;
