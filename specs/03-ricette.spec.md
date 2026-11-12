# SPEC-03 — Stanza 3: Ricette, Ristoranti & Fornelli (`?room=room-3-ricette`)

- **GitHub Issue:** `#30` (`[ROOM-3]`)
- **Servizi chiave:** `recipeAndArbitrageService.js`, `RecipesAndRestaurantsView.jsx`, `CookingModeModal.jsx`

## 1. Scopo Umano (1 frase)
Confrontare quanto costa cucinare a casa un piatto quotidiano da single o un piatto dei **ristoranti del Tigullio con menu pubblico prezzato verificato** (23 locali attivi su 32 censiti) rispetto al prezzo reale del listino, con guida passo-passo scientifica ai fornelli e scarico diretto dalla dispensa.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Zero Ristoranti Vuoti o Prezzi Inventati in UI (`ADR-0006`):** i locali censiti privi di un listino pubblico con prezzi verificabili in euro (`no_public_priced_menu`, `dishCount === 0`) sono esclusi di default dalle tendine e dai contatori di Stanza 3; non si inventano mai piatti o prezzi sintetici per riempire un locale vuoto.
- **Zero Matching Sottostringa Cieco tra BOM e Offerte:** `"Aglio"` non deve mai matchare `"Battaglio Mango"`, `"Tonno rosso crudo"` non deve mai matchare `"Tonno in scatola"`, `"Prosciutto crudo"` $\neq$ `"Prosciutto cotto"`, `"Latte"` $\neq$ `"Robiola"`.
- **Politica `Zero Formaggi` a 3 Livelli:** i piatti strutturalmente fatti di formaggio o mascarpone (`Focaccia col formaggio`, `Caprese`, `Tiramisù`, `Quattro formaggi`) sono marcati `non adattabili` per il profilo *Dany* invece di proporre sostituzioni grottesche; i piatti dove il formaggio è solo finitura sapida ricevono varianti liguri sensate (es. pinoli tostati / mollica / lievito alimentare).
- **Doppio Costo Onesto:** distinguere sempre **Costo Porzione Pura** (grammi usati) da **Esborso Cassa Reale** (confezioni intere da comprare a Rapallo, con formati realistici `30g` erbe, `100g` odori).
- **Scuola Fornelli Differenziata:** i passi *Science & Cooking* dipendono dalla tecnica fisica reale del piatto (8 archetipi chimico-fisici, mai 3 frasi fotocopia uguali per un crudo di mare e un brasato).

## 3. Golden Examples
- Piatti omonimi nei ristoranti del Tigullio (es. *Pansotti in salsa di noci*) raggruppati/confrontabili senza intasare la vista base single.
- Fine cottura $\rightarrow$ pulsante *Scala ingredienti dalla Dispensa* che aggiorna quantità e apre il timer $T_{\text{open}}$ sulle confezioni appena aperte.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui cosa vuoi potare o migliorare in Stanza 3)*
