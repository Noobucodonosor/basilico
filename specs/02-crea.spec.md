# SPEC-02 — Stanza 2: Scienza & CREA (`?room=room-2-crea`)

- **GitHub Issue:** `#29` (`[ROOM-2]`)
- **Servizi chiave:** `creaService.js`, `creaOfferMatcher.js`, `CreaExplorerView.jsx`, `CreaFoodModal.jsx`

## 1. Scopo Umano (1 frase)
Consultare tutti gli **832 alimenti ufficiali CREA** (senza tagli sui 26.622 valori nutrizionali), confrontare Crudo vs Cotto con resa reale e scoprire quali offerte oggi a Rapallo danno **più proteine, Omega-3 o micronutrienti veri per ogni Euro speso**.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Conversione FAO Acidi Grassi Obbligatoria:** le percentuali relative degli acidi grassi CREA vanno sempre convertite in `g/100g` di alimento tramite i lipidi totali ($\text{Lipidi} \times F_{\text{lipid}} \times \%/100$), separando gli Omega-3 veri (`ALA + EPA + DHA`) dall'acido linoleico Omega-6 (`C18:2`). Mai vedere l'aglio sopra lo sgombro per Omega-3!
- **Solo `food_human` con Nome Reale:** nessun prodotto non alimentare e nessun tile anonimo (`"Al Kg"`) può entrare nella classifica *Nutrienti per Euro*.
- **Trasparenza Peso Dichiarato vs Formato Standard:** quando il peso non è scritto nel titolo testuale dell'offerta, il badge deve dichiarare esplicitamente `~ Formato standard stimato` senza spacciarlo per peso stampato.
- **Integrità Scheda Accademica:** tutte le 7 sezioni CREA e tutte le modalità (`100g edibili`, `100g lordi`, `Porzione LARN`, `Grammi liberi`, `Crudo ↔ Cotto`) devono restare complete senza `.slice()` arbitrari.

## 3. Golden Examples
- Classifica *Omega-3 per €*: in testa compaiono pesce azzurro (sgombro, alici, sardine), salmone, noci o semi oleosi — mai ortaggi a lipidi zero.
- Switch `Crudo -> Cotto` su 100g di pasta secca o filetto di pesce: applica il fattore di resa $Y$ ufficiale e la ritenzione vitaminica termolabile $R_f$.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui cosa vuoi semplificare, mettere in evidenza o cambiare in Stanza 2)*
