# ADR-0018: Strategia Persistenza Cloud Run & Continuità Catalogo Offline

- **Stato:** Accettato
- **Data:** 2026-11-21
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Audit Multifocale
- **Priorità:** `P1-high`
- **Issue Collegata:** `#60` (`TASK-DATA-04`)

---

## 1. Contesto e Problema

1. **Persistenza stateless su Cloud Run:** i 12 file di stato domestico (`user_pantry.json`, `user_profiles.json`, `user_receipts.json`, `price_history.json`, `kitchen_inventory.json`, `weekly_plan.json`, `shopping_list.json`, `lab_notebook.json`, `household_economics_config.json`, `culinary_academy_state.json`, `cookware_calibration.json`, `crea_manual_overrides.json`) vengono salvati in `data/cache/` su filesystem locale. Sul container effimero Cloud Run (scale-to-zero, redeploy, multi-istanza), lo stato locale non è durevole né isolato per visitatore.
2. **Decay del Seed Offline (`data/seed/rapallo_flyers.json`):** dall'audit del `2026-11-21`, 20 volantini su 25 nel seed avevano `validTo <= 2026-11-16`. Nel rispetto di `ADR-0006` (divieto assoluto di falsificare o prorogare date), un container Cloud Run avviato offline ricade su un seed parzialmente scaduto senza esporre telemetria esplicita di freshness.

---

## 2. Decisione Architetturale

1. **Modello Dual-Mode Esplicito (Casa vs Cloud Run Demo):**
   - **Uso domestico locale (`localhost` / Mac):** i file JSON atomici in `data/cache/` restano il datastore primario zero-deps (`ADR-0001`).
   - **Uso Cloud Run pubblico:** finché non verrà introdotta autenticazione multi-utente, l'istanza Cloud Run opera esplicitamente come **demo effimera** (stato resettato ai seed ad ogni cold start, nessuna promessa di persistenza cross-deploy). L'eventuale evoluzione verso un `StorageAdapter` unificato (SQLite su volume persistente o Firestore per utenti autenticati) è separata da questa fase per non bloccare il ciclo `ADR-0016` (`#47`–`#52`).
2. **Telemetria Onesta `seedHealth` (`ADR-0006` compliant):**
   - `ingestionService.getStatus()` e `GET /api/status` espongono l'oggetto `seedHealth` (`totalSeedFlyers`, `activeSeedFlyers`, `expiredSeedFlyers`, `seedNeedsRefresh`).
   - Nessuna data `validTo` viene mai alterata sinteticamente; la UI e il monitoring possono segnalare con trasparenza quando oltre metà del seed offline richiede un refresh dal vivo (`seedNeedsRefresh: true`).

---

## 3. Conseguenze e Trade-off

- **Positivi:** chiarezza architetturale tra ambiente domestico locale e demo Cloud Run; visibilità immediata dello stato del seed offline senza violare `ADR-0006`.
- **Trade-off:** su Cloud Run le modifiche di stato (dispensa, scontrini) restano effimere fino a una futura fase multi-tenant autenticata.

---

## 4. Task Operativi Collegati

- [ ] **TASK-DATA-04** (`#60`): Telemetria `seedHealth` in `ingestionService.getStatus()` e `GET /api/status` + test dedicati.
