import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useDialogA11y } from '../../hooks/useDialogA11y.js';

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

function formatRhythmLabel(preset) {
  if (preset === 'sera_stanca') return 'Sera stanca';
  if (preset === 'weekend_relax') return 'Weekend';
  return 'Feriale';
}

function formatHeatSourceLabel(heatSource) {
  if (heatSource === 'induction') return 'Induzione';
  if (heatSource === 'gas') return 'Gas';
  if (heatSource === 'electric_radiant') return 'Vetroceramica';
  if (heatSource === 'boat_no_stove') return 'Cambusa barca';
  return heatSource;
}

function formatCitationLabel(cit) {
  const sourceLabels = {
    NutritionPhysiologyEngine: 'Nutrizione CREA',
    ScienceAndCookingEngine: 'Tecnica di cottura',
    HomeChemistryMatrix: 'Chimica della casa',
    CookwarePhysicsAndTco: 'Fisica pentole',
    HouseholdEconomicsEngine: 'Economia domestica',
    TonightParetoFrontier: 'Proposta cena'
  };
  return sourceLabels[cit?.source] || cit?.source || 'Fonte locale';
}

export function MaestroDrawer({
  isOpen,
  onClose,
  activeProfileId = 'casa',
  rhythmPreset = 'feriale',
  initialPrompt = ''
}) {
  const [messages, setMessages] = useState([
    {
      id: 'welcome-maestro',
      role: 'assistant',
      mode: 'deterministic_scientific_engine',
      content:
        "Ciao! Vedo cosa hai in dispensa, che piano cottura usi e quali offerte ci sono oggi a Rapallo. Chiedimi pure un'idea per cena, come rimediare a una salsa slegata o come togliere una macchia senza rovinare le superfici.",
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

  // Hydrate context summary ONLY when drawer opens or profile/rhythm changes (never per chat turn)
  useEffect(() => {
    if (!isOpen) return undefined;
    let active = true;

    fetch(
      `/api/maestro/today-copilot?profileId=${encodeURIComponent(activeProfileId)}&rhythmPreset=${encodeURIComponent(rhythmPreset)}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (active && data) {
          setContextSummary({
            profileId: data.activeProfile?.id || activeProfileId,
            profileName: data.activeProfile?.name || activeProfileId,
            rhythmPreset: data.activeRhythm?.activeRhythmPreset || rhythmPreset,
            hourlyValueEuro: data.activeRhythm?.hourlyValueEuro ?? 18,
            valueAtRisk48hEuro: data.valueAtRisk48h?.totalAtRiskEuro ?? 0,
            heatSource: data.activeKitchen?.heatSource || data.householdContext?.heatSource || null
          });
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen, activeProfileId, rhythmPreset]);

  // Trigger optional initialPrompt once per drawer opening
  const sendPromptRef = useRef(sendPrompt);
  sendPromptRef.current = sendPrompt;

  useEffect(() => {
    if (!isOpen) {
      lastHandledInitialPromptRef.current = '';
      return;
    }
    const cleanInit = String(initialPrompt || '').trim();
    if (cleanInit && cleanInit !== lastHandledInitialPromptRef.current) {
      lastHandledInitialPromptRef.current = cleanInit;
      sendPromptRef.current(cleanInit);
    }
  }, [isOpen, initialPrompt]);

  const asideRef = useRef(null);
  useDialogA11y({ isOpen, containerRef: asideRef, onClose });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  if (!isOpen) return null;

  const isLiveLlm = activeEngineMode && activeEngineMode !== 'deterministic_scientific_engine';

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-[#141A17]/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Chat con C.I.B.O. Maestro"
      data-testid="maestro-drawer"
    >
      <div className="fixed inset-0" onClick={() => onClose?.()} aria-hidden="true" />

      <aside
        ref={asideRef}
        tabIndex={-1}
        className="relative z-10 w-full sm:max-w-lg bg-[#FAF9F6] h-full shadow-2xl flex flex-col border-l border-[#E5E2DA] focus:outline-none"
      >
        {/* Top Header + Active Engine Mode Badge + Grounded Context Strip */}
        <header className="bg-[#141A17] text-white p-4 space-y-2.5 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-extrabold">🌿 C.I.B.O. Maestro</h2>
                <span
                  className={`text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border ${
                    isLiveLlm
                      ? 'bg-[#1B5E3A] text-white border-emerald-400/50'
                      : 'bg-white/10 text-emerald-200 border-white/20'
                  }`}
                >
                  {isLiveLlm ? 'AI sui dati di casa' : 'Motore locale verificato'}
                </span>
              </div>
              <p className="text-[11px] text-stone-300 mt-1">
                Conosce la tua dispensa, le tue pentole e le offerte attive a Rapallo.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onClose?.()}
              className="px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-bold text-stone-100 cursor-pointer"
              aria-label="Chiudi chat Maestro"
            >
              ✕ Chiudi
            </button>
          </div>

          {/* Grounded Household Context Pills */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-emerald-200 font-semibold">
              Profilo: {contextSummary?.profileName || activeProfileId}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-amber-300 font-semibold">
              Freschi in scadenza: €{Number(contextSummary?.valueAtRisk48hEuro || 0).toFixed(2)}
            </span>
            <span className="px-2 py-0.5 rounded-md bg-white/10 text-stone-200 font-semibold">
              Ritmo: {formatRhythmLabel(contextSummary?.rhythmPreset || rhythmPreset)} (€{contextSummary?.hourlyValueEuro ?? 18}/h)
            </span>
            {contextSummary?.heatSource && (
              <span className="px-2 py-0.5 rounded-md bg-white/10 text-stone-200 font-semibold">
                Piano: {formatHeatSourceLabel(contextSummary.heatSource)}
              </span>
            )}
          </div>
        </header>

        {/* 5 Quick Chips (1 per Soul) */}
        <div className="px-3.5 py-2.5 bg-[#F3F1EC] border-b border-[#E5E2DA] flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
          {FIVE_SOULS_CHIPS.map((chip) => (
            <button
              key={chip.soul}
              type="button"
              disabled={sending}
              onClick={() => sendPrompt(chip.prompt)}
              className="px-2.5 py-1.5 rounded-full bg-white hover:bg-emerald-50 border border-[#E5E2DA] hover:border-[#1B5E3A] text-[11px] font-bold text-[#141A17] whitespace-nowrap transition-colors cursor-pointer shrink-0"
            >
              {chip.soul}
            </button>
          ))}
        </div>

        {/* Conversation Feed */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5 bg-[#FAF9F6]">
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}
              >
                {/* High-Visibility Red Safety Alert Box */}
                {!isUser && Array.isArray(msg.p0Alerts) && msg.p0Alerts.length > 0 && (
                  <div
                    className="w-full mb-2 p-3.5 rounded-xl bg-rose-950 text-white border-2 border-rose-500 shadow-xs space-y-2"
                    role="alert"
                  >
                    <div className="text-xs font-extrabold uppercase tracking-wider text-rose-200">
                      🛑 Avviso di Sicurezza Chimica o Termica
                    </div>
                    {msg.p0Alerts.map((al) => (
                      <div key={al.code} className="text-xs space-y-0.5 border-t border-rose-800/80 pt-1.5">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="font-extrabold text-white">{al.title}</span>
                          {al.code && (
                            <span className="text-[10px] font-mono text-rose-200/80">{al.code}</span>
                          )}
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
                      ? 'bg-[#1B5E3A] text-white font-medium'
                      : 'bg-white text-[#141A17] border border-[#E5E2DA]'
                  }`}
                >
                  {msg.content}

                  {!isUser && Array.isArray(msg.groundedCitations) && msg.groundedCitations.length > 0 && (
                    <div className="mt-2.5 pt-2 border-t border-[#E5E2DA] flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#575E58]">Dati consultati:</span>
                      {msg.groundedCitations.map((cit, i) => (
                        <span
                          key={`${cit.source}-${i}`}
                          className="text-[10px] bg-[#F3F1EC] text-[#575E58] px-2 py-0.5 rounded-md font-medium"
                        >
                          {formatCitationLabel(cit)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {sending && (
            <div className="text-xs text-[#575E58] font-medium px-2 animate-pulse">
              Controllo dispensa, pentole e offerte attive a Rapallo...
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
          className="p-3 bg-white border-t border-[#E5E2DA] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Es. Cosa cucino stasera in 15 min? Come tolgo il calcare?"
            className="flex-1 rounded-xl border border-[#E5E2DA] px-3 py-2 text-xs text-[#141A17] bg-white focus:outline-none focus:ring-2 focus:ring-[#1B5E3A]"
          />
          <button
            type="submit"
            disabled={sending || !inputText.trim()}
            className="px-4 py-2 rounded-xl bg-[#1B5E3A] hover:bg-[#14492D] disabled:opacity-50 text-white text-xs font-extrabold cursor-pointer transition-colors"
          >
            Invia
          </button>
        </form>
      </aside>
    </div>
  );
}

export default MaestroDrawer;
