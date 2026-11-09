# Architecture Decision Records (ADR) & Master Task Backlog — Basilico

Questa cartella raccoglie gli **Architecture Decision Records (ADR)** e il **Backlog Operativo** del progetto **Basilico — Offerte e Volantini Supermercati e Negozi di Rapallo (GE)** (`Noobucodonosor/basilico`), consolidando le decisioni architetturali, di sicurezza/hardening, di interfaccia utente e di fedeltà territoriale dei dati.

---

## Indice degli ADR

| ID | Titolo | Stato | Priorità | Autori / Fonti |
| :--- | :--- | :--- | :--- | :--- |
| **[ADR-0001](./0001-core-architecture.md)** | Architettura Core, Stack Tecnologico e Modello Dati Multi-Tier (Live → Cache → Seed) | Accettato (Baseline) | **P1 — Alta** | Team Basilico / `PROJECT.md` |
| **[ADR-0002](./0002-security-input-hardening.md)** | Sicurezza HTTP, Protezione Path Traversal, Input Hardening e Sanitizzazione Ricerca | Accettato | **P0 — Critica** | Team Basilico / `TEST_READY.md` |
| **[ADR-0003](./0003-responsive-ui-flyer-viewer.md)** | Interfaccia Web Responsive (375px/1280px), Visualizzatore Volantini `<dialog>` e Resilienza Offline UI | Accettato | **P1 — Alta** | Team Basilico / `PROJECT.md` |
| **[ADR-0004](./0004-real-rapallo-stores-catalog.md)** | Catalogo Reale dei Punti Vendita di Rapallo (14 Insegne Verificate) e Filtro Anti-Rumore Geografico sui Volantini | Accettato | **P0 — Critica** | Direttore di Prodotto (@Noobucodonosor) |

---

## Diagramma Architetturale del Sistema

```mermaid
flowchart LR
  subgraph Client["Client Web Responsive (375px / 1280px)"]
    UI["React 19 + Tailwind SPA\n(StoreSwitcher, SearchBar, OfferGrid)"]
    MODAL["Native <dialog> Flyer Viewer\n(CSS Scroll Snap Carousel)"]
    BANNER["OfflineNotice Banner"]
  end

  subgraph Server["Backend Node.js + Express (Port 3000)"]
    API["REST API Layer\n(/api/stores, /api/offers, /api/flyers, /api/status, /api/sync)"]
    SEC["Security & Input Hardening\n(sanitizeStaticPath, Limit Clamping, Accent Normalizer)"]
    ING["IngestionService\n(Per-Retailer Connector + Geo-Filter + 5s Timeout)"]
  end

  subgraph Data["Multi-Tier Storage & Fallback Cascade"]
    LIVE["Tier 1: Live Aggregator\n(PromoQui /rapallo/<slug> + /volantino/<slug>/<id>)"]
    CACHE[("Tier 2: Atomic Disk Cache\n(data/cache/*.json — TTL 6h / Grace 7d)")]
    SEED[("Tier 3: Canonical Seed Dataset\n(data/seed/rapallo_*.json — 14 Real Chains)")]
  end

  UI -->|"GET / POST JSON"| SEC
  MODAL -->|"GET /api/flyers"| SEC
  BANNER -->|"POST /api/sync"| SEC
  SEC --> API
  API --> ING
  ING -->|"1. Fetch + Geo-Filter"| LIVE
  ING -->|"2. Read/Write Atomic"| CACHE
  ING -->|"3. Offline Fallback"| SEED
```

---

## Master Task Backlog (Tutti i Task Censiti)

> **Nota:** Lo stato live (`Open` / `Closed`) di ciascun task è tracciato sulle **GitHub Issues** del repository `Noobucodonosor/basilico`. Usa `closes #<NumeroIssue>` nei commit per chiuderle automaticamente.

| Task ID | Issue | ADR | Titolo Task | File Coinvolti | Priorità | Assegnatari |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-CORE-01** | `#1` | [ADR-0001](./0001-core-architecture.md) / [ADR-0004](./0004-real-rapallo-stores-catalog.md) | Allineamento Dataset Seed Reale di Rapallo (14 insegne verificate, indirizzi reali, rimozione Conad/Doro/Kasanova) e isolamento `data/cache/` | `data/seed/rapallo_*.json`, `.gitignore` | **P0 — Critica** | Team |
| **TASK-CORE-02** | `#2` | [ADR-0001](./0001-core-architecture.md) | Allineamento fallback `IngestionService` su errori di rete, timeout e deduplicazione `sync()` | `server/services/ingestionService.js` | **P1 — Alta** | Team |
| **TASK-SEC-01** | `#3` | [ADR-0002](./0002-security-input-hardening.md) | Hardening Clamping Paginazione (`limit` 1..100) e Normalizzazione Whitespace/Accenti in `OfferService` e `/api/offers` | `server/services/offerService.js`, `server/routes/offers.js`, `server/services/ingestionService.js` | **P0 — Critica** | Team |
| **TASK-UI-01** | `#4` | [ADR-0003](./0003-responsive-ui-flyer-viewer.md) | Allineamento Build Produzione (`dist/`), Viewport Meta e Verifica E2E Completa | `index.html`, `dist/index.html`, `src/index.css`, `server.js` | **P1 — Alta** | Team |
| **TASK-DATA-01** | `#5` | [ADR-0004](./0004-real-rapallo-stores-catalog.md) | Implementazione Connettore Per-Insegna (`/rapallo/<slug>`), Filtro Anti-Rumore Geografico sui Volantini e Allineamento Oracoli Test | `server/services/ingestionService.js`, `src/components/StoreSwitcher.jsx`, `tests/` | **P0 — Critica** | Team |
