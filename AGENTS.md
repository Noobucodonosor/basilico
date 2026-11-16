# AGENTS.md — Contesto & Linee Guida per Agenti AI e Sviluppatori

> **REGOLA AUREA (MANDATORY):**
> Prima di modificare l'architettura, toccare il modello dati, aggiungere endpoint o sviluppare nuove feature, **DEVI leggere [`docs/adr/README.md`](./docs/adr/README.md)** e gli ADR specifici nella cartella [`docs/adr/`](./docs/adr/).

---

## 1. Panoramica del Progetto

- **Nome Progetto:** `Basilico` — Sistema Domestico, Nutrizionale (CREA), Gastronomico e Catalogo Offerte di Rapallo (GE)
- **Repository:** `Noobucodonosor/basilico`
- **Descrizione Sintetica:** Web application responsive (mobile-first 375px e desktop 1280px) evoluta in **Sistema Operativo Fisico-Economico della Casa ("Le 5 Anime" — [ADR-0001..0015](./docs/adr/README.md))**, organizzata sui **3 Ritmi Quotidiani** con ingresso predefinito su **`⚡ Oggi (Co-pilota)`** (`Oggi · Regia Settimanale · Accademia & Atlante`), **Chat conversazionale Ibrida Grounded col Maestro** (`MaestroDrawer`) e **7 Stanze dell'Atlante**:
  0. **⚡ Oggi (Co-pilota), Regia Settimanale & Basilico Maestro** (Preset rapidi *Sera Stanca / Feriale / Weekend* + calibrazione avanzata opzionale, 3 opzioni Pareto *Stasera in Cucina*, *SOS Fornelli*, *SOS Macchia 3-Tap*, tunnel weekend in 4 passi e Chat Maestro ibrida read-only sullo *Household Context Graph* + motore deterministico locale offline);
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
| [`src/App.jsx`](./src/App.jsx) | Shell applicativa React 19 sui **3 Ritmi** (`⚡ Oggi`, `🧭 Regia Settimanale`, `🎓 Accademia & Atlante` a 7 Stanze), sincronizzazione stato/URL e `MaestroDrawer`. |
| [`src/components/FlyerModal.jsx`](./src/components/FlyerModal.jsx) | Visualizzatore volantini nativo `<dialog>` con carosello CSS Scroll Snap e controlli touch/tastiera. |
| [`specs/`](./specs/README.md) | **Living Specs** (contratti umani di 1 pagina: `00-oggi-e-maestro.spec.md` + le 7 Stanze `01-negozi.spec.md` .. `07-chimica-casa.spec.md`). |
| [`evals/run_evals.mjs`](./evals/run_evals.mjs) | **Domain & Common-Sense Evals Suite** (`npm run eval`) con scorecard quantitativa per i 3 Ritmi, il Maestro e le 7 Stanze. |
| [`server/routes/agentation.js`](./server/routes/agentation.js) | Bridge REST per la toolbar visuale **Agentation** (`data/cache/agentation_inbox.json` & `.md`). |
| [`scripts/board.mjs`](./scripts/board.mjs) | **Mission Control CLI** (`npm run board` / `npm run inbox`) sincronizzata con le Room/V2 Issues GitHub (`#28`..`#33`, `#39`..`#44`). |
| [`tests/`](./tests/) | Suite di test automatizzata a 5 Tier (`unit`, `integration`, `api`, `e2e`) eseguita con `node --test`. |

---

## 3. Metodologia di Lavoro (ADR + Living Specs + Evals + Agentation)

1. **Ogni decisione architetturale o di sicurezza** è documentata in un file `docs/adr/NNNN-titolo.md`.
2. **Living Specs (`specs/`):** Ogni Ritmo e ciascuna delle 7 Stanze possiede un contratto umano di 1 pagina (`specs/00-oggi-e-maestro.spec.md` e `specs/01-negozi.spec.md` .. `07-chimica-casa.spec.md`) collegato alle Issues su GitHub (`#28`..`#33` e `#39`..`#44`, con label `status:spec-review`, `status:agent-ready`, `status:taste-check`). Prima di modificare un Ritmo o una Stanza, leggi sempre la sua spec (inclusa la sezione `## 4. Note & Cambiamenti Richiesti dal Regista`).
3. **Visual Point-to-Agent Inbox (`Agentation`):** Quando l'utente annota elementi nel browser tramite `<Agentation />` (`localhost`), le annotazioni strutturate (selettore DOM, React component stack, URL stanza, commento) vengono salvate automaticamente in `data/cache/agentation_inbox.json` e `data/cache/agentation_inbox.md`. Quando l'utente chiede *"smaltisci inbox"*, leggi `data/cache/agentation_inbox.json`, applica le modifiche, verifica con `npm run eval` + `npm test`, e marca gli ID risolti (`POST /api/agentation/resolve` o helper).
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

# Scorecard automatica di dominio e buon senso sui 3 Ritmi, Maestro e 7 Stanze (Eval-Driven Development)
npm run eval

# Mission Control CLI (stato Stanze/Task GitHub + Eval Score + Agentation Inbox)
npm run board
npm run inbox

# Audit di sicurezza e conformità ADR pre-release
python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py

# Lista GitHub Issues attive per priorità
gh issue list --limit 30
```
