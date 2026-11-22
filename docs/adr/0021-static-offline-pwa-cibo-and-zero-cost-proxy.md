# ADR-0021: PWA Statica Full-Offline (C.I.B.O.), Filtri Sticky/Esclusione, OCR Apple Vision & Proxy LLM a €0

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P1 — Alta (Zero-Cost Showcase, Offline-First & User Filtering)**
- **Data:** 2026-11-22
- **Autori:** Direttore di Prodotto (@Noobucodonosor)
- **Estende:** [ADR-0018](./0018-storage-abstraction-and-cloud-run-persistence.md), [ADR-0019](./0019-consumer-editorial-shell-and-progressive-disclosure.md)

---

## 1. Contesto e Problema

Per fungere da vetrina pubblica su GitHub/Pages senza generare costi di compute/banda né dipendere da container Cloud Run sempre accesi o scraper fragili a runtime:
1. L'app deve funzionare come **PWA statica full-offline** (`VITE_STATIC_MODE=true`), scaricando una sola volta i 14 dataset di conoscenza (`crea_foods.json`, `recipes_and_dishes.json`, `rapallo_offers.json`, ecc.) e salvando profilo, dispensa, liste multiple e piano pasti localmente sul dispositivo del visitatore (`IndexedDB` + `localStorage`).
2. La sintesi conversazionale LLM (`POST /api/maestro/chat`) deve restare opzionale e protetta da un proxy gratuito con muro rigido (`429` senza fatturazione).
3. In `Offerte`, i dati estratti solo come testo dai volantini mancano spesso di peso confezione (`1 kg`, `110 g`) e bollini `SCONTO SOCI`, e i filtri per supermercati, domini e categorie devono supportare selezione multipla **sticky** ed esclusione esplicita (`Mostra tutto tranne…`, `Escludi solo soci`).
4. Il pianificatore mensile deve partire dalla base scientifica **CREA vegana** + scienza culinaria (`culinary_academy.json`), rispettare `Fresh Start` (ciò che è già in casa) e la deperibilità (`shelfLifeDays`), e suggerire 6 momenti al giorno (Colazione, Brunch, Pranzo, Merenda, Cena, Spuntino), restando espandibile in senso onnivoro.

---

## 2. Decisione Architetturale

1. **Build-Time Static Snapshot (`scripts/exportStaticData.mjs`, `npm run build:static`):**
   - Esporta i 14 dataset `data/seed/*.json` in `public/data/` con `manifest.json` versionato (hash SHA-256).
   - `src/offline/localStore.js` invalida automaticamente la cache `IndexedDB` quando `manifest.json` cambia versione.
2. **In-Browser Virtual Router (`src/offline/localRouter.js`, `src/services/apiClient.js`):**
   - Intercetta `/api/*` quando `VITE_STATIC_MODE=true`, risolvendo ricerche, filtri semantici (`resolveOfferCategory`, `resolveCreaMatch`, `resolveStorageHint`, `resolveQuantityLabel`), multi-lista spesa, set cucina/upgrade Tier e `POST /api/planner/generate-month` (base vegana + Fresh Start + 6 pasti/giorno + estensioni onnivore).
3. **Filtri Sticky Multi-Selezione & Esclusione (`App.jsx`, `StoreSwitcher.jsx`, `CategoryFilters.jsx`, `RapalloMarketView.jsx`, `OfferCard.jsx`):**
   - Supermercati, Domini e Categorie usano selezione **sticky** (riclicca per deselezionare).
   - Aggiunta modalità `Mostra tutto tranne…` (`excludeCategories`) e filtro `Escludi solo soci` (`excludeMemberOnly`), oltre a indirizzo punto vendita, stato soci, conservazione, quantità e macro CREA direttamente su `OfferCard`.
4. **Arricchimento Immagini Batch a €0 (`scripts/enrichOffersFromImages.mjs` + `scripts/vision_ocr.swift`):**
   - Usa Apple Vision nativo (upscale 3× per ritagli piccoli) o `GEMINI_API_KEY` opzionale in batch per estrarre `packWeightGrams`, `unitPrice` e `isMemberOnly` in `data/seed/rapallo_offers.json`.
5. **Cloudflare Worker Free Proxy & Deploy Pages (`workers/maestro-proxy.js`, `.github/workflows/deploy-pages.yml`):**
   - Worker standalone con cascata free key (`GEMINI_API_KEY` → `GROQ_API_KEY` → `OPENROUTER_API_KEY`) e ritorno `429` esplicito; workflow CI per pubblicazione automatica su GitHub Pages.

---

## 3. Task Operativi Collegati
- [ ] **TASK-OFFLINE-01**: Migrazione C.I.B.O. Full-Offline Static PWA, Filtri Sticky/Esclusione, Apple Vision OCR & Cloudflare Worker Proxy (`P1 — Alta`).
