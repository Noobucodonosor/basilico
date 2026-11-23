# SPEC-03 — Stanza 3: Ricette, Ristoranti & Fornelli (`?room=room-3-ricette`)

- **GitHub Issue:** `#30` (`[ROOM-3]`)
- **Servizi chiave:** `recipeAndArbitrageService.js`, `RecipesAndRestaurantsView.jsx`, `CookingModeModal.jsx`

## 1. Scopo Umano (1 frase)
Confrontare quanto costa cucinare a casa un piatto quotidiano da single o un piatto dei **ristoranti verificati dell'intera Provincia di Genova (Genova Centro & Mare, Ponente, Golfo Paradiso, Tigullio Ovest/Est ed Entroterra)** con listino pubblico prezzato rispetto al prezzo reale del menu e alla spesa nei negozi di Rapallo, con guida passo-passo scientifica ai fornelli e scarico diretto dalla dispensa.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Zero Ristoranti Vuoti, Zero Prezzi Inventati e Zero Nuove Pizzerie (`ADR-0006`):** i locali censiti privi di un listino pubblico con prezzi verificabili in euro (`no_public_priced_menu`, `dishCount === 0`) sono esclusi di default dalle tendine e dai contatori di Stanza 3; l'espansione provinciale su Città Metropolitana di Genova copre esclusivamente ristoranti, trattorie, osterie, sciamadde, focaccerie tradizionali liguri e alta cucina (escludendo pizzerie e piatti `pizza`), rigorosamente entro i confini della Provincia di Genova (`GE`).
- **Filtro Territoriale per Zone e Comuni GE:** l'utente può filtrare i ristoranti e i piatti per **Zona GE** (`Genova Centro & Porto Antico`, `Genova Mare (Boccadasse-Nervi)`, `Ponente Genovese`, `Golfo Paradiso`, `Tigullio Ovest (Rapallo-SML-Portofino)`, `Tigullio Est (Chiavari-Sestri-Moneglia)`, `Entroterra Genovese`) e per **Comune**, con raggruppamento `<optgroup>` per zona nel selettore ristorante.
- **Zero Matching Sottostringa Cieco tra BOM e Offerte:** `"Aglio"` non deve mai matchare `"Battaglio Mango"`, `"Tonno rosso crudo"` non deve mai matchare `"Tonno in scatola"`, `"Prosciutto crudo"` $\neq$ `"Prosciutto cotto"`, `"Latte"` $\neq$ `"Robiola"`.
- **Politica `Zero Formaggi` a 3 Livelli:** i piatti strutturalmente fatti di formaggio, cagliata o mascarpone (`Focaccia di Recco`, `Focaccia col formaggio`, `Pizzata di Recco`, `Fonduta`, `Cacio e pepe`, `Parmigiana` strutturale, `Caprese`, `Seirass`, `Cheesecake`, `Tiramisù`, `Quattro formaggi`) sono marcati `non adattabili` (`isExcludedByProfileIdentity: true`) per il profilo *Casa* invece di proporre sostituzioni grottesche; i piatti dove il formaggio è solo finitura sapida o legante erbaceo ricevono varianti liguri sensate (*di magro*).
- **Doppio Costo Onesto:** distinguere sempre **Costo Porzione Pura** (grammi usati) da **Esborso Cassa Reale** (confezioni intere da comprare a Rapallo, con formati realistici `30g` erbe, `100g` odori).
- **Scuola Fornelli Differenziata:** i passi *Science & Cooking* dipendono dalla tecnica fisica reale del piatto (8 archetipi chimico-fisici, mai 3 frasi fotocopia uguali per un crudo di mare e un brasato).

## 3. Golden Examples
- Piatti omonimi nei ristoranti della Provincia di Genova (es. *Pansotti in salsa di noci*, *Trofie al pesto*, *Cappon magro*) raggruppati/confrontabili per fascia di prezzo attraverso le diverse zone GE senza intasare la vista base single.
- Selezione della zona *Golfo Paradiso* o *Genova Centro & Porto Antico* $\rightarrow$ aggiornamento immediato dei ristoranti raggruppati e reset automatico del singolo ristorante se appartenente a un'altra zona.
- Fine cottura $\rightarrow$ pulsante *Scala ingredienti dalla Dispensa* che aggiorna quantità e apre il timer $T_{\text{open}}$ sulle confezioni appena aperte.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui cosa vuoi potare o migliorare in Stanza 3)*
