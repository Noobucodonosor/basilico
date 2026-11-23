# SPEC-01 — Stanza 1: Negozi & Offerte Rapallo (`?room=room-1-negozi`)

- **GitHub Issue:** `#28` (`[ROOM-1]`)
- **Servizi chiave:** `domainClassifier.js`, `offerService.js`, `unitPriceExtractor.js`, `qualityLensService.js`, `ingestionService.js`

## 1. Scopo Umano (1 frase)
Mostrare tutte e sole le offerte realmente attive e verificate per i **14 punti vendita di Rapallo (16035 GE)** + botteghe storiche osservate al banco, separando con precisione chirurgica il cibo umano dai 5 domini extra-cibo (`home_cleaning`, `personal_care`, `kitchen_cookware`, `pet_care`, `bazar_seasonal`) con **categorie dedicate** e rivelando il vero costo `€/kg` sgocciolato.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Verità Territoriale Rapallo (16035 GE):** ogni volantino estratto da PromoQui viene validato anche su `storesData.stores`; qualsiasi volantino regionale privo di negozi in Provincia di Genova (`GE`) o nel Tigullio viene **scartato** (zero leak silenziosi da Catanzaro, Latina o Roma), mentre i redirect sponsor esterni (`next.doveconviene.it`) vengono risolti al path canonico `/volantino/<slug>/<id>` per non perdere offerte reali di Rapallo (es. Penny, Unieuro).
- **Zero Inquinamento di Dominio & Categorie Dedicate:** nessun giocattolo, addobbo di Natale, tessile (`Completo letto`, `Tovaglia`), candela, elettrodomestico (`Miele`, `Beper`) o cosmetico può mai finire in `food_human` né inquinare `Cura Casa e Bucato`: giocattoli/Natale vanno in `Giocattoli, Natale e Tempo Libero` (`bazar_seasonal`), tessili/bazar in `Tessile, Abbigliamento e Bazar Casa` (`bazar_seasonal`), pentole/elettrodomestici in `Pentole, Cucina ed Elettrodomestici` (`kitchen_cookware`) e pet in `Animali Domestici` (`pet_care`).
- **Zero Sottostringhe Cieche nei Reparti:** `verGINe` $\neq$ Gin, `MELEgatti` $\neq$ Mele, `SpumanTE` $\neq$ Tè, `letto` $\neq$ `l'etto`.
- **Zero Dati Sintetici & Trasparenza Tetto Upstream (ADR-0006):** mai inventare `originalPrice`, `pricePerKg` o offerte oltre quelle realmente indicizzate; quando PromoQui espone il tetto SSR di `50` offerte per volantino (`upstreamIndexedCap: 50`), la UI dichiara con trasparenza il limite upstream rimandando allo sfogliatore pagine per il resto.
- **Parità 1:1 Contatori & Paginazione Completa:** il numero sulla pillola del negozio coincide esattamente col totale delle offerte attive mostrate cliccandoci, e tutte le offerte oltre la 60ª sono caricabili senza troncamenti.
- **Lente Chimica Contestuale:** il badge `pH Neutro — Sicuro su Antiaderente PTFE` appare solo sui detersivi stoviglie a mano, mai su abbigliamento, carta o detersivi lavatrice.
- **Sfogliatore Pagina Esatta:** cliccando `Pag. X →` si apre il volantino esatto direttamente a Pagina `X` (con scheda multi-prodotto leggibile quando il CDN fornisce ritagli singoli `/flyergibs/`).

## 3. Golden Examples
- `Granarolo Latte Parzialmente Scremato` $\rightarrow$ `food_human` / `Latticini e Formaggi` (flaggato dal profilo *Casa Zero Formaggi/Latticini*, visibile per *Ospiti*).
- `Bassetti Completo Letto Trendy` (€ 26,99) $\rightarrow$ `bazar_seasonal` / `Tessile, Abbigliamento e Bazar Casa`, `pricePerKg: null`, zero badge chimici.
- `Albero di Natale / Lego / Peluche Orso` $\rightarrow$ `bazar_seasonal` / `Giocattoli, Natale e Tempo Libero` (mai in `Cura Casa e Bucato`).
- `Tonno Rio Mare 3x80g (sgocc. 156g)` a € 3,90 $\rightarrow$ `25,00 €/kg sgocc. (16,25 €/kg lordo)`.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui qualsiasi preferenza di UX, potatura badge o comportamento desiderato per Stanza 1)*
