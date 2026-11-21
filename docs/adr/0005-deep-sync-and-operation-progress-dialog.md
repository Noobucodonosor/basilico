# ADR-0005: Controlli Dual Sync (Aggiornamento Rapido vs Deep Sync 14 Insegne) e Finestra di Dialogo Informativa sullo Stato delle Operazioni

* **Stato:** Accettato
* **Data:** 2026-11-09
* **Priorità:** **P1 — Alta (Trasparenza UX Operativa & Aggiornamento Per-Insegna)**
* **Autori / Fonti:** Direttore di Prodotto (@Noobucodonosor), Team Basilico

---

## 1. Contesto e Problema

Dopo l'introduzione del catalogo reale delle **14 insegne di Rapallo** ([ADR-0004](./0004-real-rapallo-stores-catalog.md)), sono emerse due esigenze fondamentali espresse dal Direttore di Prodotto:

1. **Doppio livello di aggiornamento (Rapido vs Deep Sync):**
   - Il pulsante di aggiornamento originale (`POST /api/sync` con `{ force: true }`) esegue un **controllo rapido** sull'endpoint aggregato generale di Rapallo (`/rapallo/supermercati`), impiegando circa 1–2 secondi con sole 1–2 richieste HTTP.
   - Per scaricare invece **tutte le offerte prodotto individuali (`flyerGibs`) e tutti i volantini attivi negozio per negozio** delle **14 insegne di Rapallo**, serve un secondo pulsante dedicato (**"Deep Sync"**) collocato a fianco di quello rapido nell'Header in alto a destra.
2. **Finestra di Dialogo Informativa sullo Stato delle Operazioni (`<dialog>`):**
   - Quando l'utente avvia un'operazione di scaricamento o sincronizzazione (sia **Aggiornamento Rapido** sia **Deep Sync**), una semplice icona che gira senza spiegazioni genera incertezza ("panico da rotella che gira").
   - È necessario mostrare sempre una **finestra di dialogo modale nativa (`<dialog>`) chiara e rassicurante** (`SyncStatusModal.jsx`) che spieghi in tempo reale:
     - Quale operazione è in corso (*Aggiornamento Rapido* o *Deep Sync Completo dei 14 Negozi di Rapallo*);
     - A che punto siamo (barra di avanzamento percentuale, quale negozio si sta analizzando su 14, quanti volantini e quante offerte sono stati trovati finora);
     - Il registro passo-passo in italiano delle operazioni eseguite in tempo reale;
     - Il riepilogo finale al termine dell'operazione, con possibilità di chiudere la finestra in tranquillità.

---

## 2. Decisioni Architetturali

### 2.1 Doppio Comando nell'Header (`Header.jsx`)
Nell'Header in alto a destra vengono esposti due pulsanti distinti e chiaramente etichettati:
1. **Aggiorna Rapido (`onRefresh`):** Verifica veloce (1–2s) dello stato online e dei volantini principali di Rapallo (`POST /api/sync` con `{ force: true, deep: false }`).
2. **Deep Sync (`onDeepSync`):** Scansione approfondita (~10–20s) di tutte le **14 insegne reali di Rapallo** (`POST /api/sync` con `{ force: true, deep: true }`), con estrazione dei singoli prodotti in offerta (`flyerGibs`), filtro anti-rumore geografico (`NON_RAPALLO_FLYER_REGEX`) e salvataggio nella cache persistente (`data/cache/`), senza mai sovrascrivere il dataset di emergenza `data/seed/` a runtime (in conformità con `AGENTS.md` Sez. 4).

### 2.2 Telemetria in Tempo Reale dell'Operazione (`GET /api/sync/progress`)
- `IngestionService` mantiene uno stato osservabile `syncProgress`:
  ```json
  {
    "active": true,
    "mode": "deep",
    "phase": "scanning_stores",
    "title": "Deep Sync 14 Negozi di Rapallo in corso...",
    "currentStore": "Basko Rapallo",
    "completedStores": 3,
    "totalStores": 14,
    "flyersFound": 5,
    "offersFound": 98,
    "percent": 21,
    "logs": [
      "Avvio Deep Sync completo per i 14 negozi di Rapallo...",
      "✔ Basko Rapallo: 3 volantini validi, 36 offerte estratte"
    ],
    "startedAt": "2026-11-09T19:30:00.000Z",
    "completedAt": null,
    "error": null
  }
  ```
- L'endpoint `GET /api/sync/progress` espone istantaneamente questo stato al frontend mentre l'operazione `POST /api/sync` è in corso.

### 2.3 Finestra di Dialogo Informativa `<dialog>` (`SyncStatusModal.jsx`)
- Implementata con l'elemento HTML5 nativo `<dialog>` aperto tramite `.showModal()` secondo le linee guida moderne (`modern-web-guidance`: `dialog`, `prevent-page-scroll-under-modal-dialog`):
  - Nessun attributo ridondante `role="dialog"` o `aria-modal` sull'elemento `<dialog>`;
  - Intestazione accessibile collegata tramite `aria-labelledby="sync-dialog-title"`;
  - Blocco della chiusura accidentale con `Esc` mentre lo scaricamento è attivo (`onCancel` previene la chiusura se `progress.active === true`), lasciando comunque sempre visibile lo stato e sbloccando il pulsante **"Chiudi e Visualizza Offerte"** (con `autofocus`) non appena l'operazione termina.

---

## 3. Conseguenze

* **Positiva:** L'utente ha pieno controllo sia per un controllo istantaneo (1s) sia per una scansione profonda di tutti i 14 negozi (Deep Sync), a costo economico **€ 0,00**.
* **Positiva:** Eliminato qualsiasi effetto "scatola nera" o "rotella muta": la finestra di dialogo mostra ogni singolo negozio controllato e il conteggio live di volantini e offerte.
* **Compatibilità Test:** Il comportamento predefinito di `sync(force)` (senza `deep: true`) rimane invariato (2 chiamate HTTP: primario + fallback), garantendo il 100% di compatibilità con i 444 test esistenti.

---

## 4. Task Operativi Collegati

| Task ID | Titolo | Priorità | File Coinvolti |
| :--- | :--- | :--- | :--- |
| **TASK-SYNC-01** | Pulsante Deep Sync 14 Negozi, Endpoint Telemetria `/api/sync/progress` e Finestra di Dialogo Informativa `<dialog>` (`SyncStatusModal`) | **P1 — Alta** | `server/services/ingestionService.js`, `server/routes/status.js`, `src/components/Header.jsx`, `src/components/SyncStatusModal.jsx`, `src/hooks/useSupermarketData.js`, `src/App.jsx` |
