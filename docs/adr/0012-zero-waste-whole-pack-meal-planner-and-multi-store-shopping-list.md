# ADR-0012: Stanza 6 — Pianificatore Settimanale "Neo-Dieta" a Confezioni Intere Zero-Spreco & Lista della Spesa Smart Multi-Negozio a Rapallo

- **Stato:** Proposto (`Proposed`)
- **Priorità:** **P1 — Alta (Milestone 6 — Livello 5 Bottom-Up)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up, Modello Confezioni Intere ($K_p = \lceil Q_p / S_p \rceil$) e Logistica Negozi Rapallo.

---

## 1. Contesto e Problema

Il vertice operativo dell'ecosistema `Basilico` è trasformare i 5 livelli sottostanti (Negozi e Offerte di Rapallo, Nutrizione CREA, Dispensa con Freschi Aperti, Pentole, Ricette/Ristoranti) in un **piano settimanale concreto per una persona sola** e in una **lista della spesa eseguibile nei negozi di Rapallo**.

Nei prototipi precedenti si erano verificati tre difetti gravi che qui vengono banditi per design:
1. Quando il carrello superava il budget, `while total > budget: items.pop()` cancellava singoli ingredienti dalla lista lasciando i piatti incucinabili;
2. Uno shortcut `if days >= 7: required_g = total_available_g` mascherava gli avanzi nei test;
3. Prodotti non alimentari (pentole, detersivi) finivano mescolati automaticamente nei pasti.

---

## 2. Decisione Architetturale

1. **Pianificatore Settimanale Deterministico a Confezioni Intere (`server/services/mealPlannerService.js`):**
   - **6 Modelli di Ingresso Immediati ("da nonno o bambino"):**
     1. `balanced_daily` (*Equilibrata Quotidiana*)
     2. `ligurian_traditional` (*Tradizionale Ligure & Italiana*)
     3. `promo_driven_neodiet` (*Neo-Dieta Offerte Rapallo*: guidata al 100% dai migliori sconti attivi e Nutrienti/€ della settimana)
     4. `high_protein_sport` (*Alta Densità Proteica & Recupero*)
     5. `pescetarian_sea` (*Pescetariana & Mare*)
     6. `tigullio_gourmet_home` (*Esplorazione Ristoranti a Casa*)
   - **Configurazione Giornaliera Fisica (`dayMode`):** ogni giorno ($1..7$ o $1..14$) può essere impostato come:
     - `boat_day` (**Giornata in Barca**: Colazione a casa + Pranzo freddo da Borsa Termica senza fornelli/frigo + Cena leggera a casa con Primo + Secondo e Dolce opzionale);
     - `land_day` (**Giornata a Terra/Casa**: tutti i pasti cucinabili a casa con le pentole possedute);
     - `eat_out` (**Fuori a pranzo/cena**: slot disattivato).
   - **Algoritmo di Concatenazione Confezioni Intere e Priorità Freschi Aperti:**
     1. **Passo 1 (Svuota Freschi Aperti):** i primi slot della settimana vengono assegnati a ricette compatibili con il profilo utente che consumano i prodotti `opened` già presenti in dispensa prima della loro scadenza $T_{\text{open}}$;
     2. **Passo 2 (Acquisto a Confezioni Intere $K_p = \lceil Q_p / S_p \rceil$):** ogni volta che una ricetta introduce un ingrediente deperibile non presente in dispensa (venduto in confezione di peso $S_p > Q_p$), il solver assegna un bonus di concatenazione alle ricette diverse nei $2\text{–}3$ giorni successivi che consumano il residuo $S_p - Q_p$ entro $T_{\text{open}}$, mostrando nel piano la **Tracciabilità di ogni Confezione Condivisa**;
     3. **Passo 3 (Rispetto Onesto del Budget):** se il totale di cassa delle confezioni intere supera il `budgetEur` impostato, il solver **sostituisce intere ricette** (partendo da quelle con il costo di cassa marginale più alto) con ricette complete più economiche o che condividono confezioni già nel carrello. **Nessun singolo ingrediente viene mai rimosso da una ricetta confermata.**
   - Possibilità di sostituire qualsiasi singolo pasto con 1 clic (*"Cambia questo piatto con un'alternativa compatibile"*).
2. **Lista della Spesa Smart & Simulatore Logistico Multi-Negozio a Rapallo (`server/services/shoppingListService.js`):**
   - **3 Fonti Sincronizzate con Subtotali Separati:**
     - Articoli generati dal **Pianificatore Settimanale** (`domain === 'food_human'`);
     - Offerte aggiunte con **1 clic (`+ Lista`)** dai volantini in Stanza 1 o dalla scheda CREA in Stanza 2;
     - Prodotti aggiunti da **Cucina, Pentole & Pulizia** (Stanza 4: detersivi Tigotà/PiùMe, spugne, utensili) o a mano, mantenendo sempre separati il **Subtotale Alimentare** e il **Subtotale Casa & Attrezzatura**.
   - **Simulatore "1 Negozio vs 2 Negozi vs 3 Negozi" a Rapallo:** calcola e confronta il costo totale del carrello e il tempo logistico stimato (visita + spostamento a Rapallo) se acquisti tutto in 1 solo supermercato oppure se dividi la spesa tra i 2 o 3 negozi più convenienti.
   - **Modalità "In Corsia" per Reparti, Piano B sullo Scaffale ed Export:**
     - Raggruppamento per corsia/reparto (`Ortofrutta -> Banco Freschi -> Carne/Pesce -> Scaffale Secco -> Surgelati -> Cura Casa`), spunta rapida col pollice, contatore live del carrello prima della cassa;
     - Pulsante **"Prodotto Finito / Piano B"** davanti allo scaffale che suggerisce all'istante il sostituto nello stesso negozio (o nel negozio vicino a Rapallo) compatibile con le ricette del piano;
     - Export formattato in 1 clic per WhatsApp / Telegram / Note.

---

## 3. Task Operativi Collegati

- [ ] **TASK-M6-01**: **Servizio `MealPlannerService` (6 Modelli Neo-Dieta, Giorni Barca/Terra, Priorità Freschi Aperti, Concatenazione Confezioni Intere Zero-Spreco e Budget Onesto) e `ShoppingListService` (Simulatore 1/2/3 Negozi Rapallo, Corsie & Piano B)**
  - *File coinvolti*: `server/services/mealPlannerService.js`, `server/services/shoppingListService.js`, `server/routes/planner.js`, `server/routes/shoppingList.js`, `tests/unit/meal_planner_zero_waste.test.js`, `tests/api/planner_and_shopping_list.test.js`
  - *Verification Step*: `npm test`
- [ ] **TASK-M6-02**: **Interfaccia Completa Stanza 6 ("Pianificatore & Lista Spesa"): Selettore 6 Modelli, Calendario Barca/Terra con Tracciabilità Confezioni, Simulatore Multi-Negozio, Modalità "In Corsia" ed Export WhatsApp/Telegram**
  - *File coinvolti*: `src/components/planner/PlannerAndShoppingView.jsx`, `src/components/planner/AisleChecklistModal.jsx`, `src/App.jsx`, `tests/e2e/planner_shopping_ui.test.js`
  - *Verification Step*: `npm test`
