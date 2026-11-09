# AGENTS.md — Contesto & Linee Guida per Agenti AI e Sviluppatori

> **REGOLA AUREA (MANDATORY):**
> Prima di modificare l'architettura, toccare il modello dati, aggiungere endpoint o sviluppare nuove feature, **DEVI leggere [`docs/adr/README.md`](./docs/adr/README.md)** e gli ADR specifici nella cartella [`docs/adr/`](./docs/adr/).

---

## 1. Panoramica del Progetto

- **Nome Progetto:** `Basilico` — Offerte e Volantini Supermercati Rapallo (GE)
- **Repository:** `Noobucodonosor/basilico`
- **Descrizione Sintetica:** Web application responsive (mobile-first 375px e desktop 1280px) per la consultazione in tempo reale e resiliente offline di volantini promozionali e offerte dei 14 punti vendita reali di Rapallo (Basko, Coop, Gulliver, Carrefour Market, Carrefour Express, Ekom, Penny, Eurospin, Despar, DPiù, Tigotà, PiùMe, Unieuro, Arcaplanet).
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
| [`tests/`](./tests/) | Suite di test automatizzata a 5 Tier (`unit`, `integration`, `api`, `e2e`) eseguita con `node --test`. |

---

## 3. Metodologia di Lavoro (ADR + GitHub Issues)

1. **Ogni decisione architetturale o di sicurezza** è documentata in un file `docs/adr/NNNN-titolo.md`.
2. **Ogni task operativo** ha un codice univoco (`TASK-<MODULO>-XX`) censito sia nell'ADR di origine, sia in `docs/adr/README.md`, sia come **GitHub Issue**.
3. **Priorità Standard:**
   - `P0-critical`: Sicurezza (path traversal, input clamping, secret protection), integrità del dataset seed/cache, bug bloccanti sui test E2E.
   - `P1-high`: Feature core (ingestion, ricerca accenti, API REST, UI responsive, flyer viewer).
   - `P2-medium`: Evoluzioni pianificate, ottimizzazioni UX/performance, moduli secondari.
4. **Sviluppo & Commit Atomici:**
   - Lavora su un `TASK-<MODULO>-XX` alla volta.
   - Esegui sempre il **Verification Step** (test/check) previsto nella GitHub Issue prima di concludere.
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

# Audit di sicurezza e conformità ADR pre-release
python3 ~/.gemini/config/skills/adr-github-methodology/scripts/pre_release_check.py

# Lista GitHub Issues attive per priorità
gh issue list --limit 30
```
