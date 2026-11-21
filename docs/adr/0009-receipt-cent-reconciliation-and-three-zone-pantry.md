# ADR-0009: Stanza 5 — Acquisizione Scontrini con Quadratura al Centesimo, Storico Prezzi Fuori Offerta & Dispensa Fisica a 3 Luoghi (Casa, Frigo, Barca)

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P1 — Alta (Milestone 3 — Livello 3.1 Bottom-Up)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up, Modulo Riconciliazione Contabile Scontrini (`cibbo/lib/receipts.ts`).

---

## 1. Contesto e Problema

I volantini promozionali coprono solo il 5–10% dei prodotti in vendita. Il restante 90% dei prezzi reali (inclusi i prodotti base fuori offerta e gli acquisti presso botteghe fisiche di Rapallo come pescherie, macellerie e panifici) proviene dagli **scontrini della spesa**.
Inoltre, per pianificare i pasti di una persona sola senza sprechi, il sistema deve sapere cosa c'è già in casa o a bordo della barca e quali prodotti freschi sono stati **aperti** e devono essere consumati entro la finestra di conservazione reale $T_{\text{open}}$ (senza alcuna formula fittizia di decadimento esponenziale o finti pulsanti di sync).

---

## 2. Decisione Architetturale

1. **Validatore Contabile Scontrini al Centesimo (`server/services/receiptService.js`):**
   - Acquisizione scontrino tramite foto/OCR assistito (Gemini Vision quando configurato, o inserimento/correzione strutturata sempre funzionante anche offline).
   - **Blocco di Quadratura al Centesimo:** uno scontrino può essere confermato solo quando:
     $$\sum_{i} \text{prezzoRiga}_i - \sum_{j} \text{sconto}_j = \text{totaleScontrino}$$
     con scarto pari a `0,00 €`. In caso di differenza, la UI evidenzia lo scarto al centesimo per permettere la correzione immediata della riga mal letta dall'OCR.
2. **Doppio Effetto Disaccoppiato e Idempotente alla Conferma:**
   - **Effetto A (Catalogo Condiviso — Prezzi Reali di Rapallo):** ogni riga confermata aggiorna automaticamente `priceHistoryService` per quel negozio di Rapallo, alimentando il listino dei **prezzi ordinari fuori offerta** e l'indicatore *"È un vero sconto?"*.
   - **Effetto B (Dispensa Personale dell'Utente Attivo):** l'utente seleziona quali righe dello scontrino caricare nella propria dispensa. Ogni trasferimento è marcato con `pantryTransferRevision` per garantire **idempotenza assoluta** (impossibile caricare due volte lo stesso scontrino).
3. **Dispensa Fisica a 3 Luoghi e Orologio Reale sui Freschi Aperti (`server/services/pantryService.js`):**
   - Ogni articolo in dispensa appartiene a uno dei **3 luoghi fisici reali**:
     1. `dry_pantry` (**Dispensa Secca Casa**: pasta, riso, legumi secchi, conserve, olio);
     2. `fridge_freezer` (**Frigo / Freezer Casa**: freschi, verdure, carne, pesce, latticini concessi);
     3. `boat_cooler` (**Dotazione Barca / Borsa Termica**: alimenti pronti, non deperibili o adatti a giornata in mare senza fornelli né frigo fisso).
   - **Stato Confezione (`closed` vs `opened`) e Finestra $T_{\text{open}}$:**
     - Quando l'utente apre una confezione fresca (es. usa 100g di una confezione da 250g) o completa una ricetta, il sistema scala i grammi usati, passa i 150g residui allo stato `opened`, registra `openedAt` e calcola la scadenza reale in ore/giorni ($\text{expiresAt} = \text{openedAt} + T_{\text{open}}$ tipico dell'alimento CREA, es. 48h/72h), ordinando in cima alla dispensa i **Freschi Aperti da consumare con priorità**.

---

## 3. Task Operativi Collegati

- [x] **TASK-M3-01**: **Motore Scontrini con Quadratura Obbligatoria al Centesimo, Alimentazione Automatica Prezzi Fuori Offerta e Servizio Dispensa a 3 Luoghi (`dry_pantry`, `fridge_freezer`, `boat_cooler`) con Finestra $T_{\text{open}}$**
  - *File coinvolti*: `server/services/receiptService.js`, `server/services/pantryService.js`, `server/routes/receipts.js`, `server/routes/pantry.js`, `tests/unit/receipt_reconciliation.test.js`, `tests/api/pantry_and_receipts.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-M3-02**: **Interfaccia Completa Stanza 5 ("Dispensa & Scontrini"): Scanner/Editor Scontrino con Controllo Centesimi, Vista 3 Luoghi (Secca / Frigo / Barca), Alert Freschi Aperti e Controlli Rapidi Scorte (`+ / - / Apri / Finito`)**
  - *File coinvolti*: `src/components/pantry/PantryAndReceiptsView.jsx`, `src/components/pantry/ReceiptScannerModal.jsx`, `src/App.jsx`, `tests/e2e/pantry_receipts_ui.test.js`
  - *Verification Step*: `npm test`
