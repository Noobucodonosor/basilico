# Architecture Decision Records (ADR) & Master Task Backlog — Basilico

Questa cartella raccoglie gli **Architecture Decision Records (ADR)** e il **Backlog Operativo** del progetto **Basilico — Offerte e Volantini Supermercati Rapallo (GE)** (`Noobucodonosor/basilico`), consolidando le decisioni architetturali, di sicurezza/hardening e di interfaccia utente.

---

## Indice degli ADR

| ID | Titolo | Stato | Priorità | Autori / Fonti |
| :--- | :--- | :--- | :--- | :--- |
| **[ADR-0001](./0001-core-architecture.md)** | Architettura Core, Stack Tecnologico e Modello Dati Multi-Tier (Live → Cache → Seed) | Accettato (Baseline) | **P1 — Alta** | Team Basilico / `PROJECT.md` |
| **[ADR-0002](./0002-security-input-hardening.md)** | Sicurezza HTTP, Protezione Path Traversal, Input Hardening e Sanitizzazione Ricerca | Proposto | **P0 — Critica** | Team Basilico / `TEST_READY.md` |
| **[ADR-0003](./0003-responsive-ui-flyer-viewer.md)** | Interfaccia Web Responsive (375px/1280px), Visualizzatore Volantini `<dialog>` e Resilienza Offline UI | Accettato | **P1 — Alta** | Team Basilico / `PROJECT.md` |

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
    ING["IngestionService\n(5000ms Timeout + In-Flight Dedup)"]
  end

  subgraph Data["Multi-Tier Storage & Fallback Cascade"]
    LIVE["Tier 1: Live Aggregator\n(PromoQui / ShopFully __NEXT_DATA__)"]
    CACHE[("Tier 2: Atomic Disk Cache\n(data/cache/*.json — TTL 6h / Grace 7d)")]
    SEED[("Tier 3: Canonical Seed Dataset\n(data/seed/rapallo_*.json — 11 Stores)")]
  end

  UI -->|"GET / POST JSON"| SEC
  MODAL -->|"GET /api/flyers"| SEC
  BANNER -->|"POST /api/sync"| SEC
  SEC --> API
  API --> ING
  ING -->|"1. Fetch (5s max)"| LIVE
  ING -->|"2. Read/Write Atomic"| CACHE
  ING -->|"3. Offline Fallback"| SEED
```

---

## Master Task Backlog (Tutti i Task Censiti)

> **Nota:** Lo stato live (`Open` / `Closed`) di ciascun task è tracciato sulle **GitHub Issues** del repository `Noobucodonosor/basilico`. Usa `closes #<NumeroIssue>` nei commit per chiuderle automaticamente.

| Task ID | Issue | ADR | Titolo Task | File Coinvolti | Priorità | Assegnatari |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **TASK-CORE-01** | `#1` | [ADR-0001](./0001-core-architecture.md) | Ripristino integrità Dataset Seed Canonico (11 negozi Rapallo con Coop, Carrefour, Conad, Basko, Doro) e isolamento `data/cache/` | `data/seed/rapallo_*.json`, `.gitignore` | **P0 — Critica** | Team |
| **TASK-CORE-02** | `#2` | [ADR-0001](./0001-core-architecture.md) | Allineamento fallback `IngestionService` su errori di rete, timeout e deduplicazione `sync()` | `server/services/ingestionService.js` | **P1 — Alta** | Team |
| **TASK-SEC-01** | `#3` | [ADR-0002](./0002-security-input-hardening.md) | Hardening Clamping Paginazione (`limit` 1..100) e Normalizzazione Whitespace/Accenti in `OfferService` e `/api/offers` | `server/services/offerService.js`, `server/routes/offers.js`, `server/services/ingestionService.js` | **P0 — Critica** | Team |
| **TASK-UI-01** | `#4` | [ADR-0003](./0003-responsive-ui-flyer-viewer.md) | Allineamento Build Produzione (`dist/`), Viewport Meta e Verifica E2E Completa (444/444 test pass) | `index.html`, `dist/index.html`, `src/index.css`, `server.js` | **P1 — Alta** | Team |
