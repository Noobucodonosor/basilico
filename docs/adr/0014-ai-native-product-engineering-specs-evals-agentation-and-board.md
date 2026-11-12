# ADR-0014: Stack AI-Native di Product Engineering — Spec-Driven Development (`specs/`), Domain Evals (`evals/`), Visual Point-to-Agent (`Agentation`) & GitHub State Machine

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P0 — Critica (Scalabilità Cognitiva & Governance del Prodotto Finito)**
- **Data:** 2026-11-12
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico

---

## 1. Contesto e Problema

Con 6 Stanze interconnesse, oltre 15.000 righe di codice e centinaia di regole nutrizionali, gastronomiche e merceologiche, il collaudo tradizionale tramite conversazione libera in chat genera **sovraccarico cognitivo** per il Direttore di Prodotto:
1. I test unitari/API classici (`npm test`, 514 asserzioni) verificano che il codice non vada in crash, ma non misurano il **buon senso di dominio** (es. monotonia dei menu, inquinamento lessicale, badge chimici fuori luogo).
2. Gli ADR storici documentano il *perché* architetturale, ma sono troppo lunghi per fungere da contratto rapido di comportamento quotidiano per ciascuna Stanza.
3. Descrivere a parole in chat un difetto visivo visto nel browser (*"la terza card sotto Coop ha un bottone storto"*) introduce attrito inutile rispetto al puntamento diretto DOM/React.

---

## 2. Decisione Architetturale (I 4 Pilastri AI Engineer 2026)

1. **Living Product Specs (`specs/01..06-*.spec.md` — Spec-Driven Development):**
   - Ogni Stanza possiede una **Specifica Eseguibile di 1 pagina** in linguaggio umano netto con 4 sezioni fisse: *Scopo Umano*, *Invarianti Inviolabili (Must Never Happen)*, *Golden Examples* e *Decisioni Aperte del Regista*.
   - L'utente governa il prodotto leggendo o ritoccando 3 righe nella Spec di una Stanza (o lanciando `/grill-me` su un singolo file `specs/0X-*.spec.md`), lasciando all'agente l'onere di allineare codice e test.
2. **Domain & Common-Sense Evals Suite (`evals/run_evals.mjs` — `npm run eval`):**
   - Pipeline di valutazione quantitativa indipendente dai test unitari che sottopone l'intero sistema a rubriche di realismo reale (purezza tassonomica sulle ~900 offerte live, conversione FAO Omega-3, matcher BOM anti-sottostringa, sicurezza chimica P0, varietà umana sui 6 piani settimanali *Neo-Dieta*, coerenza 1:1 contatori negozi) producendo una **Scorecard percentuale** per Stanza e salvando l'ultimo report in `data/cache/latest_eval_scorecard.json`.
3. **Visual Point-to-Agent Toolbar (`agentation` + `/api/agentation`):**
   - Integrazione del pacchetto open-source **`agentation`** (`PageFeedbackToolbarCSS`) montato nella shell React (disattivabile o attivabile con 1 clic in basso a destra su `localhost`).
   - Puntando qualsiasi elemento DOM nella pagina, `Agentation` cattura selettore CSS, gerarchia componenti React, testo adiacente, bounding box, URL/stanza corrente e nota dell'utente; cliccando **Send to Agent**, il payload viene persistito automaticamente in `data/cache/agentation_inbox.json` e `data/cache/agentation_inbox.md`, pronto per essere smaltito in blocco dall'agente al comando `"smaltisci inbox"` / `npm run inbox`.
4. **GitHub State-Machine & Mission Control (`scripts/board.mjs` — `npm run board`):**
   - 6 GitHub Issues permanenti (`#28`..`#33`, una per Stanza) governate da 3 label di stato AI-native:
     - `status:spec-review` (da definire/rifinire sulla Spec)
     - `status:agent-ready` (Spec chiara o annotazioni Agentation pronte -> lavora l'agente)
     - `status:taste-check` (Evals al 100% -> pronto per 3 minuti di verifica gusto umano)
   - Il comando rapido `npm run board` stampa in un istante: stato delle 6 Stanze su GitHub, Scorecard delle Domain Evals e numero di annotazioni visive `Agentation` in coda.

---

## 3. Task Operativi Collegati

- [x] **TASK-AIENG-01** (`#27`): **Implementazione completa Stack AI-Native (`specs/`, `evals/`, `agentation` + `/api/agentation`, GitHub Room State Machine `#28..#33` e CLI `npm run board`)**
  - *File coinvolti*: `specs/README.md`, `specs/01-negozi.spec.md`..`specs/06-pianificatore.spec.md`, `evals/run_evals.mjs`, `server/routes/agentation.js`, `server/index.js`, `src/App.jsx`, `scripts/board.mjs`, `package.json`, `AGENTS.md`
  - *Verification Step*: `npm run eval && npm run board && npm test`
- [x] **TASK-AIENG-02** (`#34`): **Audit Avversariale Autonomo sulle 6 Stanze (Data Layer + Desktop `1280x900` + Mobile `375x812`) & Espansione Rubriche `evals/`**
  - *File coinvolti*: `server/services/domainClassifier.js`, `server/services/qualityLensService.js`, `server/services/offerService.js`, `server/services/ingestionService.js`, `server/services/unitPriceExtractor.js`, `server/services/creaService.js`, `server/services/creaOfferMatcher.js`, `server/routes/crea.js`, `server/services/recipeAndArbitrageService.js`, `server/services/kitchenResetService.js`, `server/services/shoppingListService.js`, `src/App.jsx`, `src/components/Header.jsx`, `src/components/RoomNavigation.jsx`, `src/components/crea/CreaExplorerView.jsx`, `src/components/recipes/RecipesAndRestaurantsView.jsx`, `src/components/recipes/CookingModeModal.jsx`, `src/components/pantry/ReceiptScannerModal.jsx`, `evals/run_evals.mjs`
  - *Verification Step*: `npm run build && npm run eval && npm test`
