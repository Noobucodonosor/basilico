# ADR-0010: Stanza 4 — Inventario Fisico della Cucina (Fornelli, Pentole & ROI Sblocco Piatti) e Protocollo Chimico "Kitchen Reset" (Sinergia Tigotà / PiùMe)

- **Stato:** Proposto (`Proposed`)
- **Priorità:** **P1 — Alta (Milestone 4 — Livello 3.2 Bottom-Up)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up, Moduli `coach/inventory.py`, `coach/gap_analysis.py`, `coach/kitchen_reset.py` e catalogo chimico `seed_cleaning_chemistry_rapallo.json`.

---

## 1. Contesto e Problema

Per chi vive da solo e impara a cucinare, la riuscita di un piatto e la durata dell'attrezzatura dipendono dall'interazione fisica tra **piano cottura**, **pentole/coltelli posseduti** e **chimica dei prodotti di pulizia**:
- Usare una pentola non ferromagnetica sull'induzione è impossibile; usare una padella antiaderente graffiata o sottile ad alta temperatura brucia i grassi e rovina il PTFE;
- Raffreddare una padella rovente sotto l'acqua fredda provoca shock termico e deforma il fondo; usare il lato verde abrasivo della spugna sul PTFE o sulla ghisa stagionata distrugge il rivestimento;
- Nei vecchi tentativi questi moduli erano nascosti in fondo a `/v2` e scollegati dalle offerte vive di **Tigotà** e **PiùMe** a Rapallo.

In `Basilico`, questo dominio ottiene la **Stanza 4 dedicata ("Cucina, Pentole & Pulizia")** e si innesta direttamente a fine ricetta.

---

## 2. Decisione Architetturale

1. **Inventario Attrezzatura Cucina & Piano Cottura (`server/services/kitchenInventoryService.js`, `data/seed/cookware_archetypes.json`):**
   - Configurazione per utente del piano cottura principale (`gas`, `induction`, `electric_radiant`, `boat_no_stove`) e degli elettrodomestici disponibili (forno, frullatore a immersione, mortaio, bilancia di precisione).
   - Catalogo degli archetipi di pentole e coltelli con proprietà fisiche (materiale: `stainless_steel_18_10`, `cast_iron`, `aluminum_ptfe`, `carbon_steel`, `copper`; fondo ferromagnetico per induzione; inerzia termica; $T_{\max}$; stato d'uso: *Ottimo*, *Rivestimento usurato*, *Lama da affilare*).
2. **Motore di Gap Analysis & Calcolo ROI Utensili Mancanti:**
   - Incrocia le pentole possedute dall'utente (filtrate per compatibilità con il suo piano cottura, es. scartando pentole non ferromagnetiche se ha l'induzione) con i requisiti `cookwareRequired` dell'intero catalogo di ricette e piatti dei ristoranti del Tigullio.
   - Calcola per ogni utensile mancante il **ROI di Sblocco Ricette** (*"Acquistando una Casseruola a fondo spesso compatibile induzione sblocchi +42 piatti del catalogo"*) e mostra le offerte/fornitori pertinenti a Rapallo (negozi di casalinghi, Unieuro, GDO).
3. **Motore Chimico "Kitchen Reset" & Inventario Sottolavello (`server/services/kitchenResetService.js`, `data/seed/cleaning_chemistry.json`):**
   - Matrice deterministica `Materiale Superficie × Tipo di Sporco` (*grassi polimerizzati, residui amidacei, proteine coagulate, aloni minerali/calcare, odori persistenti di pesce*):
     - **Regole fisiche di sicurezza:** tempo di raffreddamento anti-shock termico, divieto assoluto di abrasivi su PTFE/ghisa, divieto di acidi forti su marmo/alluminio/ghisa;
     - **Regole chimiche (pH):** sgrassatore alcalino/tensioattivo per lipidi polimerizzati; acido debole (acido citrico) per depositi minerali/calcare su inox; detergente neutro enzimatico per amidi e proteine;
   - Collegamento diretto in tempo reale tra i prodotti del **Sottolavello** dell'utente e le offerte attive di **Tigotà** (`rapallo-tigota-lamarmora`) e **PiùMe** (`rapallo-piume-neri`) già presenti in `Basilico`.

---

## 3. Task Operativi Collegati

- [x] **TASK-M4-01**: **Seed Archetipi Pentole & Chimica Detergenza, `KitchenInventoryService` (Compatibilità Induzione/Gas & Calcolo ROI Piatti Sbloccati) e `KitchenResetService` (Abbinamento Live Offerte Tigotà/PiùMe)**
  - *File coinvolti*: `data/seed/cookware_archetypes.json`, `data/seed/cleaning_chemistry.json`, `server/services/kitchenInventoryService.js`, `server/services/kitchenResetService.js`, `server/routes/kitchen.js`, `tests/unit/kitchen_services.test.js`
  - *Verification Step*: `npm test`
- [ ] **TASK-M4-02**: **Interfaccia Completa Stanza 4 ("Cucina, Pentole & Pulizia"): Configuratore Piano Cottura, Cassetto Pentole con ROI Sblocco, Sottolavello e Guida Interattiva "Kitchen Reset" con Offerte Tigotà/PiùMe**
  - *File coinvolti*: `src/components/kitchen/KitchenCareView.jsx`, `src/components/kitchen/KitchenResetCard.jsx`, `src/App.jsx`, `tests/e2e/kitchen_care_ui.test.js`
  - *Verification Step*: `npm test`
