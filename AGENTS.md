# AGENTS.md — Contesto & Linee Guida per Agenti AI e Sviluppatori

> **REGOLA AUREA (MANDATORY):**
> Prima di modificare l'architettura, toccare il modello dati, aggiungere endpoint o sviluppare nuove feature, **DEVI leggere [`docs/adr/README.md`](./docs/adr/README.md)** e gli ADR specifici nella cartella [`docs/adr/`](./docs/adr/).

---

## 1. Panoramica del Progetto

- **Nome Progetto:** `C.I.B.O.` (ex `Basilico`) — Sistema Domestico, Nutrizionale (CREA), Gastronomico, Lista della Spesa e Catalogo Offerte
- **Repository Incubatore (`team104`):** `team104/cibo` *(origine storica: `Noobucodonosor/basilico`)*
- **Vetrina Noobucodonosor — Modulo Prioritario:** `?room=room-6-pianificatore` (**Pianificatore & Lista Spesa**) è il punto d'ingresso principale esposto dalla vetrina.
- **Descrizione Sintetica:** Web application responsive (mobile-first 390px e desktop 1280px) evoluta in **Sistema Operativo Fisico-Economico della Casa ("Le 5 Anime" — [ADR-0001..0020](./docs/adr/README.md))**, strutturata sulla **Shell Consumer Editoriale (`ADR-0019`: `Oggi | Offerte | Ricette | Lista + Altro`)** con **Home `Oggi` (`CycleOverviewView` + `DishDetailDrawer`)**, **Chat conversazionale Ibrida Grounded (`MaestroDrawer`)** e tutte le **7 Stanze dell'Atlante** accessibili in primo piano o dal menu `Altro`:
  0. **Oggi & C.I.B.O. Maestro** (Home editoriale "Cosa cucini stasera?" con le 3 proposte reali a confronto ristorante + Chat Maestro ibrida read-only sullo *Household Context Graph* e motore deterministico offline);
  1. **Negozi & Offerte Rapallo** (14+ insegne e botteghe reali di Rapallo, 5 Domini Chiusi, prezzi `€/kg` sgocciolato, storico *"È un vero sconto?"*, Lente Qualità);
  2. **Scienza & CREA** (832 alimenti ufficiali × 26.622 valori in 7 sezioni complete, fisiologia del pasto cotto su 24+ nutrienti con ritenzione USDA, biodisponibilità Calcio/Ferro, RS3 e classifica live *Nutrienti per Euro Edibili*);
  3. **Ricette, Ristoranti & Fornelli** (Scuola base single, ristoranti verificati dell'intera Provincia di Genova + stellati, BOM, Arbitraggio live, analisi 80/20, Accademia delle 12 Competenze, *SOS Fornelli* e Quaderno Lab 1-Tap);
  4. **Officina Cucina (Fornelli, Pentole, Lame & Termodinamica)** (Piano cottura Gas/Induzione, `cookwarePhysicsEngine` per inerzia/geometria/batching e blocchi P0 PTFE/Stagno, ROI piatti sbloccati, TCO pentole, lame, contenitori Casa/Barca e ponte col *Kitchen Reset* post-cottura);
  5. **Dispensa & Scontrini** (Scontrini riconciliati al centesimo con `lineTotalEuro` preservato -> prezzi fuori offerta, valore a rischio `VaR_48h`, *Swipe Check* 5s e dispensa a 3 luoghi: Secca, Frigo/Freezer, Dotazione Barca/Borsa Termica con finestra $T_{\text{open}}$);
  6. **Pianificatore & Lista Spesa** (6 modelli *Neo-Dieta* + coaching adattivo non-punitivo, giorni Barca/Terra, concatenazione confezioni intere zero-spreco, simulatore tappe spesa a Rapallo sul rendimento orario netto `€/h` e modalità *In Corsia*);
  7. **Chimica & Cura della Casa/Barca** (`homeChemistryService` a 4 assi per cucina, bagno/muffe, marmi/ardesie liguri, bucato calibrato sull'acqua Iren di Rapallo `14–22 °f`, manutenzione elettrodomestici, barca, Kit Minimo a 7 Pilastri, guardie P0 polveri pure, Myth-Buster e arbitraggio `€/ciclo` Tigotà/PiùMe).
- **Stack Tecnologico:**
  - **Backend:** Node.js (ESM) + Express 4 (`server/index.js`, `server.js`)
  - **Frontend:** React 19 + Vite 6 + Tailwind CSS 3 (`src/App.jsx`, `src/components/`)
  - **Storage / Cache:** Local Persistent Disk Cache atomica con TTL (6h) + Stale Grace Period (7d) (`data/cache/`) + Bundled Offline Seed Dataset (`data/seed/`)
  - **Servizi Esterni / Aggregator:** Connettore live con timeout guard (5000ms) verso PromoQui / ShopFully Next.js `__NEXT_DATA__` e CDN (`server/services/ingestionService.js`)

---

## 2. Mappa dei File Principali

| File / Cartella | Ruolo |
| :--- | :--- |
| [`docs/adr/README.md`](./docs/adr/README.md) | **Indice degli ADR**, diagramma architetturale Mermaid e **Master Task Backlog**. |
| [`docs/adr/NNNN-*.md`](./docs/adr/) | Singoli Architecture Decision Records con contesto, decisioni e task collegati. |
| `.github/ISSUE_TEMPLATE/` | Template standard per l'apertura di GitHub Issues (`adr_task.yml`, `bug_report.yml`). |
| [`PROJECT.md`](./PROJECT.md) | Specifica architetturale di riferimento, contratti d'interfaccia e Feature Inventory (F1–F16). |
| [`server.js`](./server.js) | Entrypoint unico (`npm start`, porta 3000) con verifica automatica del build frontend. |
| [`server/index.js`](./server/index.js) | App factory Express, security path traversal guard (`sanitizeStaticPath`), SPA fallback e route mounting. |
| [`server/services/ingestionService.js`](./server/services/ingestionService.js) | Motore di ingestion multi-tier (Live -> Cache -> Seed -> Empty Shield) con timeout 5s. |
| [`server/services/cacheManager.js`](./server/services/cacheManager.js) | Gestore cache su disco atomica (`.tmp` + rename) con TTL 6h, grace period 7d e quarantena file corrotti. |
| [`server/services/offerService.js`](./server/services/offerService.js) | Motore di ricerca/filtro con normalizzazione accenti italiani, filtri categoria/catena e paginazione. |
| `server/services/{homeChemistryService,cookwarePhysicsEngine,culinaryAcademyService,nutritionPhysiologyService,householdEconomicsService,maestroCoachService}.js` | **I 5 Motori Scientifici Deterministici & Maestro Ibrido Grounded ([ADR-0015](./docs/adr/0015-five-souls-causal-engine-three-rhythms-and-grounded-maestro.md)):** chimica casa/barca, fisica pentole/lame, accademia culinaria/SOS, fisiologia pasto cotto USDA, economia `VaR_48h`/`€/h` e co-pilota Pareto/chat. |
| [`src/App.jsx`](./src/App.jsx) | Shell consumer React 19 su **4 voci (`Oggi`, `Offerte`, `Ricette`, `Lista`) + menu `Altro`** (`ADR-0019`), sincronizzazione URL e `MaestroDrawer`. |
| [`src/components/FlyerModal.jsx`](./src/components/FlyerModal.jsx) | Visualizzatore volantini nativo `<dialog>` con carosello CSS Scroll Snap e controlli touch/tastiera. |
| [`specs/`](./specs/README.md) | **Living Specs** (contratti umani di 1 pagina: `00-oggi-e-maestro.spec.md` + le 7 Stanze `01-negozi.spec.md` .. `07-chimica-casa.spec.md`). |
| [`evals/run_evals.mjs`](./evals/run_evals.mjs) | **Domain & Common-Sense Evals Suite** (`npm run eval`) con scorecard quantitativa per la Home Oggi, il Maestro e le 7 Stanze. |
| [`server/routes/agentation.js`](./server/routes/agentation.js) | Bridge REST per la toolbar visuale **Agentation** (`data/cache/agentation_inbox.json` & `.md`). |
| [`scripts/board.mjs`](./scripts/board.mjs) | **Mission Control CLI** (`npm run board` / `npm run inbox`) sincronizzata con GitHub (`#28`..`#52`) e contabilità token. |
| [`scripts/tokenLedger.mjs`](./scripts/tokenLedger.mjs) | **Token Accounting CLI** (`npm run task:start` / `task:status` / `task:close`): delta reale token da `transcript.jsonl` -> GitHub & [`TOKEN_LEDGER.md`](./docs/adr/TOKEN_LEDGER.md). |
| [`tests/`](./tests/) | Suite di test automatizzata a 5 Tier (`unit`, `integration`, `api`, `e2e`) eseguita con `node --test`. |

---

## 3. Metodologia di Lavoro (`team104` Incubatore + ADR + Living Specs + Evals)

0. **Regole Incubatore `team104` (3 soci):**
   - **Worktree & Branch:** usa branch dedicati (`feat/...`, `fix/...`) e **New Worktree Mode** quando lavori con più agenti in parallelo per non sporcare la working directory.
   - **Sicurezza locale:** usa il preset `Default` o `Auto` in `.antigravity/settings.json` (**vietato `Turbo`**); mai committare `.env` o chiavi.
   - **Pull Request & Review:** apri sempre una **Draft PR** con l'esito di `npm run build`, `npm run eval` e `npm test` (e screenshot/Artifact per modifiche UI su `?room=room-6-pianificatore`), poi richiedi review via `.github/CODEOWNERS` prima del merge su `main`.
1. **Regola "1 Issue GitHub = 1 Agente Singolo + Contabilità Token" ([ADR-0016](./docs/adr/0016-causal-cycle-ontology-and-github-token-governance.md) §2.2):**
   - **NON usare `/swarm` né sub-agenti multipli** salvo richiesta esplicita del Regista. Lavora sempre **su una sola GitHub Issue alla volta**, dopo approvazione esplicita del piano.
   - Avvia sempre il contatore prima di iniziare (`npm run task:start -- <issue> --tier S|M|L --task TASK-...`) e chiudi a fine commit (`npm run task:close -- <issue> --commit <sha> --summary "..."`), pubblicando i token reali consumati sulla Issue e in [`docs/adr/TOKEN_LEDGER.md`](./docs/adr/TOKEN_LEDGER.md).
2. **Ogni decisione architetturale o di sicurezza** è documentata in un file `docs/adr/NNNN-titolo.md`.
3. **Living Specs (`specs/`):** La Home (`00-oggi-e-maestro.spec.md`) e ciascuna delle 7 Stanze (`01-negozi.spec.md` .. `07-chimica-casa.spec.md`) possiedono un contratto umano di 1 pagina collegato alle Issues su GitHub (`#28`..`#33` e `#39`..`#44`). Prima di modificare Home o una Stanza, leggi sempre la sua spec.
4. **Visual Point-to-Agent Inbox (`Agentation`):** Quando l'utente annota elementi nel browser (`npm run dev` su `http://localhost:5173`) tramite `<Agentation />`, le annotazioni vengono salvate automaticamente in `data/cache/agentation_inbox.json` e `data/cache/agentation_inbox.md`. Quando l'utente chiede *"smaltisci inbox"*, leggi `data/cache/agentation_inbox.json`, applica le modifiche, verifica con `npm run eval` + `npm test`, e marca gli ID risolti.
4. **Ogni task operativo** ha un codice univoco (`TASK-<MODULO>-XX`) censito sia nell'ADR di origine, sia in `docs/adr/README.md`, sia come **GitHub Issue**.
5. **Priorità Standard:**
   - `P0-critical`: Sicurezza (path traversal, input clamping, secret protection), integrità del dataset seed/cache, bug bloccanti sui test E2E.
   - `P1-high`: Feature core (ingestion, ricerca accenti, API REST, UI responsive, flyer viewer).
   - `P2-medium`: Evoluzioni pianificate, ottimizzazioni UX/performance, moduli secondari.
6. **Sviluppo & Commit Atomici:**
   - Lavora su un `TASK-<MODULO>-XX` alla volta.
   - Esegui sempre `npm run eval` (100% Domain Evals) e `npm test` prima di concludere.
   - Usa messaggi di commit che referenziano il Task ID e chiudono automaticamente la Issue su GitHub:
     ```bash
     git commit -m "feat(TASK-XXX-01): descrizione sintetica della modifica (closes #N)"
     ```

---

## 4. Sicurezza & Regole Critiche

- **Mai committare segreti o cache volatile:** Il file `.env`, i database locali (`*.db`, `*.sqlite`) e i file generati a runtime in `data/cache/` devono restare in `.gitignore`.
- **Integrità del Seed Dataset (`data/seed/`):** I test e il fallback dipendono dall'integrità di `data/seed/rapallo_stores.json`, `rapallo_flyers.json` e `rapallo_offers.json`. Nessun processo runtime deve sovrascrivere `data/seed/`.
- **Verifica Pre-Release:** Prima di generare pacchetti di deploy o fare push di rilascio, esegui:
  ```bash
  python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py
  ```

---

## 5. Comandi Rapidi di Sviluppo e Test

```bash
# Avvio server di produzione / single-command startup (porta 3000)
npm start

# Avvio ambiente di sviluppo frontend Vite
npm run dev

# Build bundle frontend in dist/
npm run build

# Esecuzione completa della suite di test (Unit, Integration, API, E2E)
npm test

# Scorecard automatica di dominio e buon senso sulla Home Oggi, Maestro e 7 Stanze (Eval-Driven Development)
npm run eval

# Mission Control CLI (stato Stanze/Roadmap GitHub + Eval Score + Token Attivi + Inbox)
npm run board
npm run inbox

# Tracciamento esatto token su GitHub per singola Issue (ADR-0016)
npm run task:start -- <issue> --tier S|M|L --task TASK-XXX-01
npm run task:status
npm run task:close -- <issue> --commit <sha> --summary "..."

# Audit di sicurezza e conformità ADR pre-release
python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py

# Lista GitHub Issues attive per priorità
gh issue list --limit 30
```
