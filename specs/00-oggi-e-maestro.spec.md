# SPEC-00 — Co-pilota `⚡ Oggi`, `🧭 Regia Settimanale` & `Basilico Maestro` (`?rhythm=oggi` / `?rhythm=regia`)

- **Riferimento ADR:** [ADR-0015](../docs/adr/0015-five-souls-causal-engine-three-rhythms-and-grounded-maestro.md) (`TASK-V2-04`, `TASK-V2-05`)
- **Servizi chiave:** `maestroCoachService.js`, `householdEconomicsService.js`, `nutritionPhysiologyService.js`, `TodayCopilotView.jsx`, `WeeklyRegiaView.jsx`, `MaestroDrawer.jsx`

## 1. Scopo Umano (1 frase)
Risolvere in **5 secondi alle 20:30** il dilemma *"Cosa cucino stasera con quello che ho in frigo, le mie pentole e la mia energia residua?"*, guidare in **10 minuti nel weekend** la regia tra scontrini, dispensa, barca e spesa a Rapallo, e offrire un **Maestro conversazionale grounded** sulle 5 Anime senza mai inventare un solo numero.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Ingresso Zero-Attrito sui 3 Ritmi & Deep-Link Intatti:** l'app si apre su **`⚡ Oggi (Co-pilota)`**, affiancato da **`🧭 Regia Settimanale`** e **`🎓 Accademia & Atlante (7 Stanze)`**, mantenendo sempre funzionanti gli URL diretti `?room=room-1-negozi`..`room-7-chimica`.
- **Frontiera di Pareto Reale (Zero Punteggi Magici `ADR-0006`):** le proposte di *Stasera in Cucina* (*⚡ Minimo Attrito*, *💶 Salva-Frigo `VaR_48h`*, *👨‍🍳 Gesto da Maestro*) devono superare tutti i **Veti P0** (profilo `Zero Formaggi`, limiti termici PTFE/Stagno, sicurezza alimentare $T_{\text{open}}$) ed esporre i trade-off fisici ed economici reali (minuti totali lavaggio incluso, `€` salvati, `€/pasto`, nutrienti cotti chiave, protocollo *Kitchen Reset*), mai "score unici" opachi.
- **Chat `Basilico Maestro` Ibrida & Incorruttibile sui Blocchi P0:**
  - Il motore locale deterministico deve rispondere al 100% anche **offline o senza API key**; quando una chiave LLM opzionale (`GEMINI_API_KEY` / `OPENAI_API_KEY` via env) è attiva, l'LLM legge **in sola lettura** lo snapshot certificato `HouseholdContextGraph` e non può mai inventare prezzi, kcal, LARN, temperature limite o dosi chimiche.
  - Qualsiasi domanda che tocchi miscele chimiche pericolose (`candeggina + acido/ammoniaca`, `soda + alluminio`, `percarbonato chiuso in spray`) o cortocircuiti termici (`PTFE + Boost`) attiva deterministicamente il **Blocco P0** non aggirabile.
- **Calibrazione Personale Dual-Tier:** i **Preset rapidi** (*Sera Stanca* `30 €/h · ≤15m`, *Feriale* `18 €/h · ≤30m`, *Weekend / Relax* `8 €/h` + profilo base) funzionano in 1 tap senza compilare moduli; la **Sezione Avanzata** (LARN puntuali, `€/h`, `€/kWh`, `€/Smc`) è sempre opzionale.
- **Coaching Adattivo Non-Punitivo:** i bottoni 1-tap *"Ho mangiato fuori"* (anche scegliendo un piatto vero dei ristoranti GE) ed *"Emergenza 5 min"* mettono in salvo i freschi in scadenza ($T_{\text{open}}$ / `VaR_48h`) nelle 48h successive e riequilibrano dolcemente i 3–7 giorni seguenti senza tagli calorici punitivi.

## 3. Golden Examples
- **Martedì ore 20:30 (`Sera Stanca`):** `⚡ Oggi` rileva `Alici fresche` in scadenza (`VaR_48h = €3,80`), propone scottatura dolce 90s su padella PTFE a `Livello 6/9 (≤170°C, NO Boost)` + emulsione limone crudo fuori fuoco (100% EPA/DHA preservati, Calcio `>30%` biodisponibile, Ferro ×2,5) + *Kitchen Reset* in 45s con acido citrico sulle ammine del pesce.
- **Sabato mattina (`🧭 Regia Settimanale`):** tunnel guidato *Scontrino riconciliato & Inflazione Laspeyres* $\rightarrow$ *Swipe Check 5s Frigo (`100% / 50% / 0%`)* $\rightarrow$ *Batch Cooking farro RS3 per Domenica in barca* $\rightarrow$ *2ª tappa Tigotà approvata solo perché rende `> w_t €/h` netti*.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui come vuoi affinare il Co-pilota Oggi, la Regia Settimanale o il tono del Maestro)*
