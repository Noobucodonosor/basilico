# ADR-0001: Architettura Core, Stack Tecnologico e Modello Dati Multi-Tier (Live → Cache → Seed)

- **Stato:** Accettato (`Accepted`)
- **Priorità:** P1 — Alta (Baseline Core)
- **Data:** 2026-11-09
- **Autori:** Team Basilico (@Noobucodonosor)
- **Fonti:** `PROJECT.md`, `TEST_INFRA.md`, `TEST_READY.md`, `server/services/ingestionService.js`, `server/services/cacheManager.js`

---

## 1. Contesto e Problema

I residenti e i consumatori di Rapallo (16035 GE) consultano regolarmente i volantini e le offerte promozionali delle principali catene di supermercati presenti sul territorio (**Coop Liguria**, **Carrefour Market/Express**, **Conad City**, **Basko**, **Doro Supermercati Tigullio**, oltre a **Gulliver**, **Penny Market** ed **Ekom**).

Gli aggregatori web tradizionali (es. PromoQui / ShopFully) presentano due criticità:
1. **Disponibilità e latenza variabili:** il parsing live può fallire per rate-limiting, cambi di markup HTML o assenza di connettività mobile nei punti vendita.
2. **Avvio immediato e zero-config:** l'applicazione deve potersi avviare con un singolo comando standard (`npm start` su porta `3000`) su qualsiasi ambiente appena clonato, garantendo il 100% di disponibilità anche in totale assenza di rete.

---

## 2. Decisione Architetturale

Adottiamo un'architettura **Full-Stack JavaScript (ESM)** leggera, priva di dipendenze da database esterni pesanti, strutturata su 3 livelli principali:

### 2.1. Motore di Ingestion & Storage Resiliente a 4 Tier (`server/services/`)
- **Tier 1 — Connettore Live (`IngestionService`):** interroga gli endpoint aggregatori per Rapallo con guardia `AbortController` a **5000ms** ed estrae il payload JSON da `<script id="__NEXT_DATA__">`.
- **Tier 2 — Cache Persistente Atomica (`CacheManager`):** salva i dataset normalizzati in `data/cache/*.json` utilizzando scritture atomiche su file temporaneo + `rename`, con **TTL di 6 ore (`21600s`)** e **Stale Grace Period di 7 giorni** in caso di blackout upstream. I file JSON corrotti vengono isolati in quarantena (`.corrupted.<timestamp>`).
- **Tier 3 — Dataset Offline Seed (`data/seed/`):** dataset immutabile versionato nel repository (`rapallo_stores.json`, `rapallo_flyers.json`, `rapallo_offers.json`) che copre gli **11 punti vendita canonici di Rapallo** (inclusi Coop, Carrefour, Conad, Basko, Doro), i volantini attivi e le offerte categorizzate.
- **Tier 4 — Empty Shield:** fallback difensivo in memoria che impedisce qualsiasi crash (`500 Internal Server Error`) anche qualora sia la cache sia i file seed risultassero inaccessibili.

### 2.2. Backend REST API & Single-Command Startup (`server.js`, `server/index.js`)
- Server **Express 4** che espone i contratti REST:
  - `GET /api/stores` (elenco supermercati di Rapallo con contatori offerte/volantini)
  - `GET /api/offers` (ricerca full-text accent-insensitive, filtro per `storeId`, `category`, `minDiscount`, ordinamento e paginazione)
  - `GET /api/flyers` (metadati volantini e sequenza pagine ad alta risoluzione)
  - `GET /api/status` e `POST /api/sync` (stato sorgente dati `live | cache | seed` e trigger di sincronizzazione con deduplicazione in-flight)
- **Single-Command Entrypoint (`server.js`):** verifica all'avvio la presenza del bundle frontend in `dist/index.html` e serve sia le API sia la Single-Page Application sulla porta `3000`.

---

## 3. Conseguenze

- **Positive:**
  - Resilienza del 100% ai guasti di rete o ai blocchi degli scraper upstream.
  - Zero dipendenze esterne di database (nessun server Postgres/Redis richiesto per `npm start`).
  - Latenza API sub-millisecondo quando i dati sono serviti da cache o seed.
- **Trade-off / Vincoli:**
  - Il dataset seed (`data/seed/*.json`) è un contratto architetturale critico: **non deve mai essere sovrascritto da dump parziali** che rimuovano le 5 catene canoniche (`Coop`, `Carrefour`, `Conad`, `Basko`, `Doro`) o che alterino il conteggio degli 11 punti vendita di riferimento.
  - La cartella `data/cache/` contiene stato volatile generato a runtime e non deve essere tracciata da Git né inquinare i test di fallback sul seed.

---

## 4. Task Operativi Collegati (con Definition of Done)

- [x] **TASK-CORE-01**: **Ripristino integrità Dataset Seed Canonico (14 insegne verificate di Rapallo) e isolamento `data/cache/`**
  - *File coinvolti*: `data/seed/rapallo_stores.json`, `data/seed/rapallo_flyers.json`, `data/seed/rapallo_offers.json`, `.gitignore`
  - *Acceptance Criteria*:
    - `data/seed/rapallo_stores.json` contiene le 14 insegne reali verificate di Rapallo (ADR-0004).
    - `data/seed/rapallo_offers.json` include prodotti reali con percentuali di sconto coerenti con la formula matematica `Math.round(((originalPrice - promoPrice) / originalPrice) * 100)`.
    - `data/cache/` è ignorata in `.gitignore` e ripulita da artefatti stantii.
  - *Verification Step*: `node --test tests/unit/models.test.js tests/integration/ingestion_service.test.js`

- [x] **TASK-CORE-02**: **Allineamento fallback `IngestionService` su errori di rete, timeout e deduplicazione `sync()`**
  - *File coinvolti*: `server/services/ingestionService.js`
  - *Acceptance Criteria*:
    - Quando il fetch live fallisce (`ECONNREFUSED`, timeout abort, HTTP 404/500/502/503 o HTML corrotto) e la cache è vuota, `sync()` effettua il fallback sul dataset seed impostando `dataSource: 'seed'` e restituendo le 14 insegne di Rapallo.
    - Chiamate concorrenti a `sync()` condividono la stessa Promise in-flight (`inFlightSync`).
  - *Verification Step*: `node --test tests/integration/ingestion_service.test.js`
