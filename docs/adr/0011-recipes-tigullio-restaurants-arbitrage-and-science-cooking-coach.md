# ADR-0011: Stanza 3 — Ricette Quotidiane, Ristoranti del Tigullio & Stellati (BOM + Arbitraggio Live + 80/20) e Scuola di Cucina Scientifica ("Harvard Science & Cooking" + Quaderno Lab)

- **Stato:** Proposto (`Proposed`)
- **Priorità:** **P1 — Alta (Milestone 5 — Livello 4 Bottom-Up)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up, Dataset 32 Ristoranti Tigullio (230 piatti + 1.134 righe `dish_bom`), `Cibo_Liguria_menu.xlsx`, Piatti Stellati Documentati, `coach/guidance_engine.py`, `cibbo/lib/lab.ts`.

---

## 1. Contesto e Problema

Nelle conversazioni storiche, la visione gastronomica poggiava su tre pilastri mai uniti in una sola interfaccia pulita:
1. **Imparare le basi quotidiane per una persona sola** (inclusi i pranzi freddi per la borsa termica in barca e le cene leggere senza formaggi);
2. **Esplorare i menu reali dei ristoranti del Tigullio/Liguria e dei ristoranti stellati**, vedendone la **Distinta Base (BOM)** collegata agli alimenti CREA, il **confronto economico (Arbitraggio)** tra il prezzo al tavolo e il costo degli ingredienti oggi a Rapallo, e l'analisi **80/20 Max-Coverage**;
3. **Cucinare passo-passo davanti ai fornelli con metodo scientifico (*Harvard Science & Cooking*)**, traducendo il calore per il proprio piano cottura (*Gas / Induzione / Elettrico*), riconoscendo i segnali fisici (vista, udito, olfatto), registrando le proprie prove nel **Quaderno di Laboratorio** e chiudendo con il **Kitchen Reset**.

---

## 2. Decisione Architetturale

1. **Dataset Gastronomico Certificato (`data/seed/recipes_and_dishes.json`, `data/seed/restaurants_tigullio.json`):**
   - Unificazione pulita di:
     - **Ricettario Base "Scuola di Cucina per Single"** (colazioni, pranzi freddi da barca per borsa termica, primi, secondi, contorni);
     - **32 Ristoranti Reali del Tigullio (230 piatti + 1.134 righe di Distinta Base `dish_bom`)** con prezzo reale del menu al tavolo;
     - **Selezione Piatti d'Autore e Stellati Documentati** (con etichetta trasparente di livello: `documented_original` vs `domestic_scientific_interpretation`).
   - Ogni piatto possiede:
     - `bom`: array di ingredienti con `creaId`, `rawGramsPerServing` (per 1 persona, scalabile a $N$ persone), ruolo nell'architettura del piatto e **sostituto scientifico automatico** (`substitutionRule`) qualora l'ingrediente sia escluso dal Profilo Utente attivo (es. variante senza formaggi bilanciata per sapidità e lipidi);
     - `cookwareRequired`: archetipi di pentole/utensili necessari;
     - `mealContexts`: `['boat_cooler', 'breakfast', 'light_dinner', 'lunch_home', 'sunday_lab']`;
     - `scientificSteps`: passaggi di cottura strutturati con fenomeno fisico-chimico (es. *Maillard $>140^\circ\text{C}$*, *Gelatinizzazione amidi $65\text{–}85^\circ\text{C}$*, *Emulsione fuori fuoco $<65^\circ\text{C}$*), livello termico richiesto, segnali sensoriali (`visual`, `acoustic`, `olfactory`) e timer attivi/passivi.
2. **Motore di Costo Reale, Arbitraggio Gastronomico & Copertura 80/20 (`server/services/recipeAndArbitrageService.js`):**
   - Per ogni piatto (e nella variante adattata al profilo utente attivo), incrocia in tempo reale la BOM con:
     1. le offerte attive nei negozi di Rapallo (`offerService`);
     2. i prezzi ordinari osservati dagli scontrini (`priceHistoryService`);
     3. le scorte già presenti nella dispensa dell'utente (`pantryService`).
   - Calcola:
     - **Costo Porzione Pura (`purePortionCostEur`):** il valore al centesimo dei soli grammi consumati nel piatto;
     - **Scontrino di Cassa Reale (`checkoutCashCostEur`):** quanto si spende alla cassa acquistando le confezioni intere degli ingredienti che mancano in dispensa;
     - **Arbitraggio Ristorante (`arbitrageSavingsEur`, `arbitrageSavingsPct`):** $\text{Prezzo Menu Ristorante} - \text{Costo Porzione Pura a Rapallo}$;
     - **Semaforo Fattibilità:** quanti ingredienti hai già in dispensa e se possiedi tutte le pentole necessarie.
   - **Solver 80/20 Max-Coverage (`computeMaxCoverageBasket`):** individua i $K$ ingredienti (prioritizzando quelli attualmente in offerta a Rapallo) che massimizzano il numero di piatti completi cucinabili al 100%.
3. **Modalità Fornelli a Schermo Intero, Quaderno di Laboratorio & De-costruzione Nuovo Menu (`src/components/recipes/CookingModeModal.jsx`, `LabNotebookPanel.jsx`):**
   - Traduzione automatica di ogni step per il piano cottura dell'utente (`Gas` vs `Induzione` vs `Piastra Elettrica`), check *Mise en place*, doppi timer sincronizzati, scheda finale **Quaderno di Laboratorio** (per salvare voto, peso cotto reale e note di calibrazione) e card **Kitchen Reset** post-cottura.
   - Funzione on-demand per caricare/incollare un nuovo piatto o menu di ristorante e generarne la scheda BOM scientifica.

---

## 3. Task Operativi Collegati

- [x] **TASK-M5-01**: **Importazione Seed Certificato (Ricette Base Single + 32 Ristoranti Tigullio con 1.134 righe BOM + Stellati), Motore Doppio Costo / Arbitraggio Live, Varianti Automatiche Profilo e Solver 80/20 Max-Coverage**
  - *File coinvolti*: `data/seed/recipes_and_dishes.json`, `data/seed/restaurants_tigullio.json`, `server/services/recipeAndArbitrageService.js`, `server/routes/recipes.js`, `tests/unit/recipe_arbitrage_8020.test.js`, `tests/api/recipes_api.test.js`
  - *Verification Step*: `npm test`
- [ ] **TASK-M5-02**: **Interfaccia Completa Stanza 3 ("Ricette, Ristoranti & Fornelli"): Catalogo con Arbitraggio & Vista 80/20, Modalità Fornelli a Schermo Intero (*Science & Cooking* + Timer + Kitchen Reset) e Quaderno di Laboratorio**
  - *File coinvolti*: `src/components/recipes/RecipesAndRestaurantsView.jsx`, `src/components/recipes/CookingModeModal.jsx`, `src/components/recipes/LabNotebookModal.jsx`, `src/App.jsx`, `tests/e2e/recipes_cooking_ui.test.js`
  - *Verification Step*: `npm test`
