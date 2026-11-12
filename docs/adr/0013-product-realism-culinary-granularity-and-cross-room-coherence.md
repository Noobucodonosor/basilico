# ADR-0013: Maturazione del Realismo di Prodotto, Granularità Gastronomica e Coerenza Fisico-Scientifica tra le 6 Stanze

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P0 — Critica (Qualità Prodotto Finito & Collaudo Reale Utente)**
- **Data:** 2026-11-12
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Audit Forense di Granularità sulle 6 Stanze (`radiografia_granularita_basilico.md`), Vincoli d'Integrità [ADR-0006](./0006-honest-data-integrity-no-synthetic-fields.md) – [ADR-0012](./0012-zero-waste-whole-pack-meal-planner-and-multi-store-shopping-list.md)

---

## 1. Contesto e Problema

Il completamento architetturale delle 6 Stanze ([ADR-0007](./0007-multi-domain-catalog-unit-pricing-and-user-profiles.md) – [ADR-0012](./0012-zero-waste-whole-pack-meal-planner-and-multi-store-shopping-list.md)) ha reso operativi tutti i moduli previsti, ma un collaudo spietato sul campo ("Reality Dry-Run") ha evidenziato **5 famiglie sistemiche di scollamento dalla realtà quotidiana** che impedivano a `Basilico` di comportarsi come un prodotto finito:

1. **Cecità sui Pesi delle Offerte & Rumore di Dominio (Stanze 1 & 2):**
   - Nei volantini PromoQui/ShopFully la grammatura è spesso stampata solo nell'immagine ritagliata e non nel titolo testuale: il 99% delle offerte risultava privo di peso di riferimento, lasciando quasi vuota la classifica live *Nutrienti per Euro a Rapallo* in Stanza 2 (solo 2 referenze su 645).
   - Alcuni pattern lessicali ambigui classificavano pizze/patatine *"da forno"* in `kitchen_cookware` o tessili casa (*"Completo letto"*) in `food_human`, e lasciavano tile generici privi di nome prodotto (`"Al Kg"`) inquinare il matching.
2. **Conversione Scientifica Acidi Grassi CREA & Ritenzione Termica (Stanza 2):**
   - In `creaService.js`, `omega3G` e `saturatedFatG` leggevano direttamente le percentuali relative (`% degli acidi grassi totali`, incluso l'acido linoleico Omega-6) come se fossero grammi assoluti su 100g di alimento (portando l'aglio con 0,5g di lipidi in testa alla classifica Omega-3 davanti allo sgombro).
   - Mancavano i fattori di ritenzione vitaminica termolabile ($R_f$) nello switch Crudo ↔ Cotto e la paginazione completa degli 832 alimenti in UI.
3. **Sbilanciamento Catalogo Ricette, Matching Sottostringa Cieco, Sostituzioni Improprie & Passi Fotocopia (Stanza 3):**
   - Il seed contava solo 2 ricette *Scuola Base Single* e 1 solo piatto freddo da barca (`boat_cooler`), contro 230 voci di menu ristorante ricche di omonimi (*7 Pansotti alle noci*, *10 Paste al pesto*).
   - Il matching ingrediente↔offerta per sottostringa (`includes(headToken)`) generava falsi positivi gravi (`"Aglio"` $\rightarrow$ `"Battaglio Mango"`, `"Tonno rosso crudo"` $\rightarrow$ `"Rio Mare in scatola"`, `"Latte"` $\rightarrow$ `"Robiola"`, `"Prosciutto crudo"` $\rightarrow$ `"Prosciutto cotto"`), con confezioni minime irrealistiche (`300g–500g` per `3g` di erbe aromatiche).
   - La sostituzione automatica `Zero Formaggi` veniva applicata anche a piatti identitari di formaggio o dolci (*Tiramisù*, *Caprese*, *Focaccia al formaggio*), e la sessione *Science & Cooking* usava un unico template di 3 step identico per tutti i piatti.
4. **Disallineamento ID Pentole, Chimica Sottolavello & Parser Scontrini (Stanze 4 & 5):**
   - Disallineamento tra gli ID archetipo (`'mortaio'`, `'bistecchiera'`) e quelli normalizzati dalle ricette (`'mortaio_marmo'`, `'bistecchiera_ghisa'`), oltre a conteggi ROI statici non calcolati sul catalogo reale.
   - Parser scontrini vulnerabile a righe contabili (`SUBTOTALE`, `CONTANTI`, `RESTO`, `IVA`) e assenza di scarico diretto post-cottura verso la Dispensa.
5. **Effetto Valanga nel Pianificatore Settimanale & Moltiplicatori Sintetici nella Spesa (Stanza 6):**
   - Il bonus di concatenazione confezioni (`+18` illimitato anche su dispensa secca) e il loop di budget privo di controllo duplicati/contesto producevano menu con **5–12 pasti al pesto**, **7 Pansotti di fila**, **8 Spaghetti al pomodoro identici** (anche in barca senza fornelli!) o pizze da `1.280 kcal` nel piano proteico sportivo.
   - Il simulatore 1/2/3 negozi usava moltiplicatori fissi (`×1.11`, `×1.02`) citando insegne assenti a Rapallo (*Esselunga*), e il *Piano B sullo scaffale* restituiva le prime 3 offerte generiche non correlate.

---

## 2. Decisione Architetturale

1. **Fondamenta Domini, Formato Tipico Dichiarato Onesto & Conversione FAO Acidi Grassi (Stanze 1 & 2):**
   - Rafforzamento di `domainClassifier.js` contro falsi positivi (`al forno / da forno` alimentari vs elettrodomestici; tessili casa in `home_cleaning`; esclusione tile anonimi `"Al Kg"` dal matching semantico).
   - Nel pieno rispetto di [ADR-0006](./0006-honest-data-integrity-no-synthetic-fields.md), `unitPrice` e `pricePerKg` restano valorizzati **solo** quando il peso è esplicito; in parallelo, `unitPriceExtractor.js` estrae i conteggi espliciti (`10 uova`) ed espone un campo **distinto e trasparente** `referencePackEstimate` (`estimatedEdiblePricePerKg`, `isEstimatedPackSize: true`) per i formati standard commerciali/ortofrutta sfusa, riattivando la classifica *Nutrienti per Euro* in Stanza 2 con badge esplicito `Peso dichiarato` vs `~ Formato standard stimato`.
   - Conversione rigorosa FAO Greenfield & Southgate in `creaService.js` per gli acidi grassi: $\text{g/100g} = \text{Lipidi (g)} \times F_{\text{lipid}} \times (\text{\% AG} / 100)$, distinguendo gli **Omega-3 reali** ($\text{C18:3 ALA} + \text{C20:5 EPA} + \text{C22:6 DHA}$) dagli Omega-6 ($\text{C18:2}$), applicando coefficienti di ritenzione vitaminica $R_f$ in cottura ed esponendo paginazione completa in Stanza 2.
2. **Catalogo Gastronomico Bilanciato, Politica `Zero Formaggi` a 3 Livelli, Matcher Head-Noun & Archetipi *Science & Cooking* (Stanza 3):**
   - Espansione di `recipes_and_dishes.json` con ~30 ricette autentiche per **Scuola Base Single**, **Colazioni Reali** e **Cambusa Fredda da Barca (`boat_cooler`)**, corredate da tassonomia `dishFamily`, `dairyRole` e raggruppamento comparativo dei piatti omonimi tra i 32 ristoranti del Tigullio.
   - **Politica `Zero Formaggi` a 3 Livelli:** i piatti strutturalmente di formaggio o pasticceria al mascarpone/latte (`dairyRole === 'structural_unsubstitutable'`, es. *Focaccia col formaggio, Caprese, Quattro formaggi, Tiramisù*) vengono **esclusi** dai piani `no_cheese` invece di subire sostituzioni innaturali; i piatti liguri dove il formaggio è rifinitura sapida (`secondary_umami_finisher`) o legante d'impasto erbaceo (`savory_herb_binder`) ricevono sostituzioni gastronomicamente coerenti.
   - Sostituzione del `.includes()` in `recipeAndArbitrageService.js` con matching *word-boundary + stato fisico + CREA ID* e grammature confezione realistiche per erbe fresche (`30g`), odori (`100g`), specialità (`50–100g`) e basici di dispensa.
   - Generatore *Science & Cooking* multi-archetipo (8 protocolli fisico-chimici specifici per tecnica, ingredienti e temperature reali del piatto).
3. **Coerenza Pentole/ROI Reale, Chimica Sottolavello + Matrice P0 & Flusso Scontrini↔Dispensa (Stanze 4 & 5):**
   - Allineamento 1:1 degli ID pentole tra `cookware_archetypes.json` e le ricette, con calcolo dinamico esatto dei piatti sbloccati sul catalogo reale.
   - Matching per funzione chimica (`acido`, `alcalino`, `neutro/enzimatico`, `ossidante`) sulle offerte di Tigotà/PiùMe/GDO ed esposizione della matrice `P0-Safety` sulle miscele chimiche letali (`Ipoclorito + Acido / Ammoniaca`).
   - Hardening del parser scontrini contro righe fiscali/pagamento, supporto pesi/moltiplicatori (`2 X`, `0,340 kg`) ed endpoint/pulsante `POST /api/pantry/consume-dish` (*"Ho cucinato questo piatto → Scala da Dispensa e avvia $T_{\text{open}}$"*).
4. **Solver Settimanale *Neo-Dieta* ad Alta Varietà, Simulatore Reale Negozi Rapallo & Pulsante Universale `+ Lista` (Stanza 6 & Cross-Room UI):**
   - Struttura giornaliera reale: **Colazione con BOM vera** + **Pranzo contestuale** (solo piatti freddi sicuri `boatSafeCold` nei `boat_day`; primi/piatti unici bilanciati a terra) + **Cena leggera proteica/verdure** (mai doppi fritti o doppi piatti pesanti).
   - **Vincoli anti-monotonia:** zero piatti duplicati per ID o titolo normalizzato nell'intera settimana; tetto massimo di **2 pasti/settimana per `dishFamily`** (es. max 2 paste al pesto distanziate); bonus concatenazione confezioni limitato ai soli ingredienti deperibili con residuo effettivo non ancora allocato; loop di budget rispettoso di varietà, profilo e `dayMode`.
   - Simulatore 1 vs 2 vs 3 negozi calcolato realmente sulla matrice prezzi/offerte/logistica delle **sole insegne reali di Rapallo**, *Piano B sullo scaffale* semantico per stesso reparto/famiglia ingrediente, contatore live `🛒 Lista` nell'Header e pulsante `+ Lista` su Stanza 1 e Stanza 2.

---

## 3. Task Operativi Collegati

- [x] **TASK-REAL-01**: **Hardening Domini/Categorie, Formato Tipico Trasparente per Prezzi/CREA, Fix Conversione FAO Omega-3 & Paginazione Stanza 2**
  - *File coinvolti*: `server/services/domainClassifier.js`, `server/services/unitPriceExtractor.js`, `server/services/offerService.js`, `server/services/priceHistoryService.js`, `server/services/creaService.js`, `server/services/creaOfferMatcher.js`, `src/components/crea/CreaExplorerView.jsx`, `tests/unit/crea_service.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-REAL-02**: **Espansione Catalogo Ricette (Scuola Base Single, Colazioni Reali, Cambusa Fredda Barca), Tassonomia `dishFamily` e Deduplica Comparativa Ristoranti**
  - *File coinvolti*: `data/seed/recipes_and_dishes.json`, `server/services/recipeAndArbitrageService.js`, `src/components/recipes/RecipesAndRestaurantsView.jsx`, `tests/unit/recipe_arbitrage_8020.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-REAL-03**: **Matcher Semantico Rigoroso BOM↔Offerte, Formati Confezione Reali, Politica `Zero Formaggi` a 3 Livelli & 8 Archetipi *Science & Cooking***
  - *File coinvolti*: `server/services/recipeAndArbitrageService.js`, `src/components/recipes/RecipesAndRestaurantsView.jsx`, `src/components/recipes/CookingModeModal.jsx`, `tests/unit/recipe_arbitrage_8020.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-REAL-04**: **Allineamento ID Pentole con ROI Dinamico Reale, Matching Chimico + Matrice Sicurezza P0 Sottolavello, Parser Scontrini Reale & Scarico Post-Cottura Dispensa**
  - *File coinvolti*: `server/services/kitchenInventoryService.js`, `server/services/kitchenResetService.js`, `server/services/receiptService.js`, `server/services/pantryService.js`, `server/routes/pantry.js`, `src/components/kitchen/KitchenCareView.jsx`, `src/components/recipes/CookingModeModal.jsx`, `tests/unit/kitchen_services.test.js`, `tests/unit/receipt_reconciliation.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-REAL-05**: **Solver Settimanale *Neo-Dieta* Umano (Varietà, Colazioni Vere, Barca Sicura, Pranzo≠Cena), Vero Simulatore Multi-Negozio Rapallo, Piano B Semantico & `+ Lista` Cross-Room**
  - *File coinvolti*: `server/services/mealPlannerService.js`, `server/services/shoppingListService.js`, `src/App.jsx`, `src/components/Header.jsx`, `src/components/OfferCard.jsx`, `src/components/planner/PlannerAndShoppingView.jsx`, `tests/unit/meal_planner_zero_waste.test.js`, `tests/e2e/planner_shopping_ui.test.js`
  - *Verification Step*: `npm test`
