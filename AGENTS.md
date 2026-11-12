# AGENTS.md — Contesto & Linee Guida per Agenti AI e Sviluppatori

> **REGOLA AUREA (MANDATORY):**
> Prima di modificare l'architettura, toccare il modello dati, aggiungere endpoint o sviluppare nuove feature, **DEVI leggere [`docs/adr/README.md`](./docs/adr/README.md)** e gli ADR specifici nella cartella [`docs/adr/`](./docs/adr/).

---

## 1. Panoramica del Progetto

- **Nome Progetto:** `Basilico` — Sistema Domestico, Nutrizionale (CREA), Gastronomico e Catalogo Offerte di Rapallo (GE)
- **Repository:** `Noobucodonosor/basilico`
- **Descrizione Sintetica:** Web application responsive (mobile-first 375px e desktop 1280px) organizzata in **6 Stanze Principali** (costruite bottom-up secondo [ADR-0001..0012](./docs/adr/README.md)):
  1. **Negozi & Offerte Rapallo** (14+ insegne e botteghe reali di Rapallo, 5 Domini Chiusi, prezzi `€/kg` sgocciolato, storico *"È un vero sconto?"*, Lente Qualità);
  2. **Scienza & CREA** (832 alimenti ufficiali × 26.622 valori in 7 sezioni complete, switch Crudo↔Cotto, confronto e classifica live *Nutrienti per Euro Edibili*);
  3. **Ricette, Ristoranti & Fornelli** (Scuola base single, 32 ristoranti del Tigullio + stellati, BOM, Arbitraggio live, analisi 80/20, guida Fornelli *Science & Cooking* e Quaderno Lab);
  4. **Cucina, Pentole & Pulizia** (Piano cottura Gas/Induzione, dotazione pentole con ROI piatti sbloccati, sottolavello e protocollo chimico *Kitchen Reset* abbinato a Tigotà/PiùMe);
  5. **Dispensa & Scontrini** (Scontrini riconciliati al centesimo -> prezzi fuori offerta, e dispensa a 3 luoghi: Secca, Frigo/Freezer, Dotazione Barca/Borsa Termica con finestra $T_{\text{open}}$ sui freschi aperti);
  6. **Pianificatore & Lista Spesa** (6 modelli *Neo-Dieta*, giorni Barca/Terra, concatenazione confezioni intere zero-spreco, simulatore 1/2/3 negozi a Rapallo e modalità *In Corsia*).
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
| [`src/App.jsx`](./src/App.jsx) | Shell applicativa React 19, sincronizzazione stato/URL e coordinamento componenti UI. |
| [`src/components/FlyerModal.jsx`](./src/components/FlyerModal.jsx) | Visualizzatore volantini nativo `<dialog>` con carosello CSS Scroll Snap e controlli touch/tastiera. |
| [`specs/`](./specs/README.md) | **Living Specs** (1 pagina umana per ciascuna delle 6 Stanze: `01-negozi.spec.md` .. `06-pianificatore.spec.md`). |
| [`evals/run_evals.mjs`](./evals/run_evals.mjs) | **Domain & Common-Sense Evals Suite** (`npm run eval`) con scorecard quantitativa per le 6 Stanze. |
| [`server/routes/agentation.js`](./server/routes/agentation.js) | Bridge REST per la toolbar visuale **Agentation** (`data/cache/agentation_inbox.json` & `.md`). |
| [`scripts/board.mjs`](./scripts/board.mjs) | **Mission Control CLI** (`npm run board` / `npm run inbox`) sincronizzata con le 6 Room Issues GitHub (`#28`..`#33`). |
| [`tests/`](./tests/) | Suite di test automatizzata a 5 Tier (`unit`, `integration`, `api`, `e2e`) eseguita con `node --test`. |

---

## 3. Metodologia di Lavoro (ADR + Living Specs + Evals + Agentation)

1. **Ogni decisione architetturale o di sicurezza** è documentata in un file `docs/adr/NNNN-titolo.md`.
2. **Living Specs (`specs/`):** Ogni Stanza ha un contratto umano di 1 pagina (`specs/01-negozi.spec.md` .. `06-pianificatore.spec.md`) collegato a una Issue permanente su GitHub (`#28`..`#33` con label `status:spec-review`, `status:agent-ready`, `status:taste-check`). Prima di modificare una Stanza, leggi sempre la sua spec (inclusa la sezione `## 4. Note & Cambiamenti Richiesti dal Regista`).
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

# Scorecard automatica di dominio e buon senso sulle 6 Stanze (Eval-Driven Development)
npm run eval

# Mission Control CLI (stato 6 Stanze GitHub + Eval Score + Agentation Inbox)
npm run board
npm run inbox

# Audit di sicurezza e conformità ADR pre-release
python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py

# Lista GitHub Issues attive per priorità
gh issue list --limit 30
```
