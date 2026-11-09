# ADR-0003: Interfaccia Web Responsive (375px/1280px), Visualizzatore Volantini `<dialog>` e Resilienza Offline UI

- **Stato:** Accettato (`Accepted`)
- **Priorità:** P1 — Alta
- **Data:** 2026-11-09
- **Autori:** Team Basilico (@Noobucodonosor)
- **Fonti:** `PROJECT.md`, `src/App.jsx`, `src/components/FlyerModal.jsx`, `src/components/FlyerCarousel.jsx`, `src/components/OfflineNotice.jsx`, `index.html`

---

## 1. Contesto e Problema

Gli utenti consultano le offerte dei supermercati sia in mobilità da smartphone (**viewport 375px**, spesso all'interno del punto vendita con connessione instabile) sia da desktop a casa (**viewport 1280px** per pianificare la spesa settimanale).
L'interfaccia deve offrire:
1. Passaggio immediato tra le insegne di Rapallo (`Coop`, `Carrefour`, `Conad`, `Basko`, `Doro`).
2. Sfogliamento fluido delle pagine dei volantini senza dipendere da pesanti librerie carosello di terze parti.
3. Trasparenza sullo stato di freschezza dei dati quando l'app opera su cache locale o dataset seed offline.

---

## 2. Decisione Architetturale

### 2.1. Responsive Shell & Sincronizzazione URL (`src/App.jsx`, `index.html`)
- **HTML5 Viewport & Build Verification:** `index.html` e `dist/index.html` includono obbligatoriamente `<meta name="viewport" content="width=device-width, initial-scale=1.0" />` e il bundle CSS compilato con le regole Tailwind, `scroll-snap` e `subgrid`.
- **URL State Sync:** i filtri attivi (`?store=`, `?q=`, `?category=`, `?sortBy=`) sono sincronizzati bidirezionalmente con `window.history.replaceState` per consentire la condivisione diretta dei link.

### 2.2. Visualizzatore Volantini Nativo `<dialog>` + CSS Scroll Snap (`FlyerModal.jsx`, `FlyerCarousel.jsx`)
- Utilizzo dell'elemento HTML nativo `<dialog>` per accessibilità, gestione automatica del focus trap e chiusura con tasto `Escape` o click sul backdrop.
- Carosello pagine basato su **CSS Scroll Snap** (`scroll-snap-type: x mandatory`, `scroll-snap-align: center`, `100dvh` su mobile) per garantire swipe touch nativo a 60fps su smartphone e navigazione tramite frecce/miniature su desktop.

### 2.3. Banner di Resilienza Offline (`OfflineNotice.jsx`)
- Quando `/api/status` segnala `isOnline: false` oppure `dataSource` diverso da `'live'` (`'cache'` o `'seed'`), la UI mostra un banner non intrusivo che informa l'utente dell'ultimo aggiornamento disponibile e offre un pulsante **Riprova** (`POST /api/sync` con `force: true`).

---

## 3. Conseguenze

- **Positive:**
  - Zero dipendenze JS esterne per modali o slider; bundle frontend estremamente leggero e veloce da caricare su reti 3G/4G.
  - Conformità alle linee guida moderne di accessibilità e Web Vitals (CLS/INP ridotti grazie a CSS Scroll Snap e `<dialog>`).
- **Trade-off / Vincoli:**
  - Il bundle di produzione (`dist/`) deve essere mantenuto aggiornato tramite `npm run build` (o rigenerato da `server.js`) affinché i test di verifica startup e static asset (`dist/index.html` e CSS bundle) trovino tutti gli asset sincronizzati con `src/`.

---

## 4. Task Operativi Collegati (con Definition of Done)

- [ ] **TASK-UI-01**: **Allineamento Build Produzione (`dist/`), Viewport Meta e Verifica E2E Completa (444/444 test pass)**
  - *File coinvolti*: `index.html`, `dist/index.html`, `src/index.css`, `server.js`, `server/index.js`
  - *Acceptance Criteria*:
    - `npm run build` genera `dist/index.html` e il bundle CSS contenente le regole `scroll-snap` e `subgrid`.
    - Il server root risponde con HTTP 200 su `/` e sulle rotte SPA di fallback servendo la shell HTML con il meta tag viewport corretto.
    - Tutti i 444 test della suite completa (`npm test`) passano con **0 fallimenti**.
  - *Verification Step*: `npm run build && npm test`
