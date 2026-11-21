# ADR-0020: Hardening degli Endpoint Mutanti, Limiti di Collezione & Isolamento Stato su Cloud Run

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P1 — Alta (Cybersecurity / OOM & DoS Prevention su Cloud Run)**
- **Data:** 2026-11-21
- **Autori:** Direttore di Prodotto (@Noobucodonosor)
- **Estende:** [ADR-0017](./0017-public-cloud-run-security-and-llm-guardrails.md) (Sicurezza Cloud Run), [ADR-0018](./0018-storage-abstraction-and-cloud-run-persistence.md) (Dual-Mode Persistenza)

---

## 1. Contesto e Problema

In modalità demo pubblica Cloud Run (senza autenticazione e con `/app/data/cache` su `tmpfs` in RAM):
1. Nessuno dei servizi di persistenza JSON domestici applicava limiti massimi (`MAX_ITEMS`) né throttling sulle scritture (`POST`/`PUT`/`PATCH`/`DELETE`), esponendo l'istanza a crescita lineare in RAM fino a OOM.
2. `userProfileService.importProfilesJson()` eseguiva `this.upsertProfile()` in loop `.map()`, scatenando `O(N)` scritture sincrone (`fs.writeFileSync` + `fs.renameSync`) sull'event loop in un singolo request HTTP.
3. In produzione (`NODE_ENV === 'production'`), `POST /api/profiles` permetteva di sovrascrivere i profili di sistema built-in (`ospiti`, `dany`, `barca`), alterando i filtri per tutti i visitatori della stessa istanza.

---

## 2. Decisione Architetturale (Opzione A — Demo Mutabile Protetta)

1. **Write Rate Limiter sui Router Mutanti (`server/index.js`):**
   - Applicazione di un middleware zero-deps `createWriteRateLimiter` (`60` mutazioni/minuto per IP su `POST`, `PUT`, `PATCH`, `DELETE`, esclusi `GET`/`HEAD`/`OPTIONS`, bypassabile nei test via `skipInTest`) su `/api/pantry`, `/api/profiles`, `/api/receipts`, `/api/shopping-list`, `/api/prices`, `/api/kitchen`, `/api/planner`, `/api/recipes`.
2. **Batch I/O & Protezione Built-In Profiles (`userProfileService.js`):**
   - `importProfilesJson()` accetta al massimo `20` profili per import, esegue il merge in memoria e salva su disco **una sola volta** (`O(1)` `_save()`).
   - Cap complessivo di `25` profili in stato.
   - In `NODE_ENV === 'production'`, i profili built-in (`ospiti`, `dany`, `barca`) sono immutabili (`403 Forbidden` su `upsertProfile` e preservazione automatica durante `importProfilesJson`).
3. **Collection Caps Difensivi (`MAX_ITEMS = 500`, HTTP `413`):**
   - Limiti espliciti prima dell'inserimento in `pantryService.addItem`, `shoppingListService.addItem`, `receiptService.confirmReceipt` e `priceHistoryService.recordObservation`.

---

## 3. Conseguenze e Trade-off

- **Positivi:** elimina l'Event-Loop DoS su import profili, protegge `tmpfs`/RAM su Cloud Run da payload illimitati mantenendo interattiva la demo per i visitatori, e salvaguarda i profili predefiniti da poisoning.
- **Trade-off:** lo stato effimero della demo su una stessa istanza resta comunque condiviso fra visitatori concorrenti; un eventuale isolamento per-sessione richiederà storage client-side o autenticazione futura.
