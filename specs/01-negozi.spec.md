# SPEC-01 — Stanza 1: Negozi & Offerte Rapallo (`?room=room-1-negozi`)

- **GitHub Issue:** `#28` (`[ROOM-1]`)
- **Servizi chiave:** `domainClassifier.js`, `offerService.js`, `unitPriceExtractor.js`, `qualityLensService.js`, `ingestionService.js`

## 1. Scopo Umano (1 frase)
Mostrare tutte e sole le offerte realmente attive nei **14 punti vendita di Rapallo (16035)** + botteghe osservate, separando con precisione chirurgica il cibo umano dai prodotti casa/persona/cucina/animali e rivelando il vero costo `€/kg` sgocciolato.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Zero Inquinamento di Dominio:** nessun giocattolo, tessile (`Completo letto`, `Tovaglia`), candela, elettrodomestico (`Miele`, `Beper`) o cosmetico può mai finire in `food_human`, e nessun alimento (`Latte Scremato`, `Lavazza Crema e Gusto`, `Crema Zucca`) può mai finire in `personal_care`.
- **Zero Sottostringhe Cieche nei Reparti:** `verGINe` $\neq$ Gin, `MELEgatti` $\neq$ Mele, `SpumanTE` $\neq$ Tè, `letto` $\neq$ `l'etto`.
- **Zero Dati Sintetici (ADR-0006):** mai inventare `originalPrice` o `pricePerKg` esplicito se assente; eventuali formati tipici GDO vivono separati in `referencePackEstimate`.
- **Parità 1:1 Contatori & Paginazione Completa:** il numero sulla pillola del negozio (`Basko 116`) deve coincidere esattamente col totale delle offerte attive mostrate cliccandoci, e tutte le offerte oltre la 60ª devono essere caricabili senza troncamenti.
- **Lente Chimica Contestuale:** il badge `pH Neutro — Sicuro su Antiaderente PTFE` appare solo sui detersivi stoviglie a mano, mai su abbigliamento, carta o detersivi lavatrice.
- **Sfogliatore Pagina Esatta:** cliccando `Pag. X →` si apre il volantino esatto direttamente a Pagina `X` (con scheda multi-prodotto leggibile quando il CDN fornisce ritagli singoli `/flyergibs/`).

## 3. Golden Examples
- `Granarolo Latte Parzialmente Scremato` $\rightarrow$ `food_human` / `Latticini e Formaggi` (flaggato dal profilo *Dany Zero Formaggi/Latticini*, visibile per *Ospiti*).
- `Bassetti Completo Letto Trendy` (€ 26,99) $\rightarrow$ `home_cleaning` / `Cura Casa e Bucato`, `pricePerKg: null`, zero badge chimici.
- `Tonno Rio Mare 3x80g (sgocc. 156g)` a € 3,90 $\rightarrow$ `25,00 €/kg sgocc. (16,25 €/kg lordo)`.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui qualsiasi preferenza di UX, potatura badge o comportamento desiderato per Stanza 1)*
