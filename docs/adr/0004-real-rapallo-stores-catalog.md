# ADR-0004: Catalogo Reale dei Punti Vendita di Rapallo (14 Insegne Verificate) e Filtro Anti-Rumore Geografico sui Volantini

- **Stato:** Accettato (`Accepted`)
- **Priorità:** P0 — Critica (Allineamento Dati Reali & Territorio)
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Audit live PromoQui/ShopFully per CAP `16035 Rapallo (GE)`, verifica stradario comunale Rapallo, decisioni di prodotto del 2026-11-09.

---

## 1. Contesto e Problema

Dall'audit empirico effettuato sul territorio di Rapallo (16035 GE) e sulle sorgenti dati live (`PromoQui` / `ShopFully`) sono emerse tre criticità nel dataset originario del progetto:

1. **Insegne inesistenti a Rapallo o chiuse/sostituite:**
   - **Conad** (*Via alla Torre Civica, 12*) e **Doro Supermercati** non possiedono punti vendita attivi nel comune di Rapallo (i più vicini sono a Chiavari, Santa Margherita Ligure o Zoagli, e Doro non espone offerte prodotto digitalizzate).
   - **Kasanova** era censito con un indirizzo errato (*Via Mazzini, 34*), non risulta avere punti vendita attivi nell'indice locale di PromoQui per Rapallo (`storesData: []`) ed è stato sostituito sul territorio.
2. **Indirizzi stradali imprecisi e insegne mancanti:**
   - Alcune insegne reali avevano indirizzi inventati (es. *Eurospin* indicato in "Via Savagna 40" anziché **Via Aurelia Ponente 4/A**; *Despar* in "Via della Libertà 42" anziché **Via Fratelli Betti 43-45**; *Tigotà* in "Corso Mameli 95" anziché **Via Lamarmora 23**).
   - Mancavano punti vendita reali dotati di volantini e offerte strutturate a Rapallo: **DPiù Discount** (*Via Fioria 18*), **Carrefour Market** (*Corso Assereto 37*), **Carrefour Express** (*Corso Mameli, Viale Libertà, Piazza Cesare Battisti, Via Venezia*), **Unieuro City** (*Corso Matteotti 68*) e **Arcaplanet** (*Corso Italia 31 / Corso Mameli 260*).
3. **Inquinamento da Volantini di Altre Province/Regioni e Contatori Gonfiati:**
   - L'endpoint generico `/rapallo/supermercati` non restituisce più offerte locali (`topOffers: []`), mentre gli endpoint specifici per insegna (`/rapallo/<slug>`) contengono i dati reali (`flyersByRetailer` e `flyerGibsData`).
   - Tuttavia, alcune catene (es. *Basko*) pubblicano sotto lo stesso profilo anche volantini dedicati ad altre aree geografiche (*"Localismi Spezia"*, *"Localismo Piacentino e pavese"*, *"Localismo Piemontese"*), gonfiando artificialmente il numero di offerte.

---

## 2. Decisione Architetturale

### 2.1. Catalogo Canonico Ufficiale a 14 Insegne di Rapallo (Opzione B)
Il catalogo ufficiale di **Basilico** comprende esclusivamente le **14 insegne fisicamente presenti a Rapallo (16035 GE)** che dispongono sia di volantini digitali sfogliabili sia di offerte prodotto strutturate con prezzo e sconto:

| # | ID Punto Vendita Principale | Insegna (`brand`) | Catena (`chainId`) | Indirizzo Reale Verificato a Rapallo | Categoria |
| :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | `rapallo-basko-colombo` | **Basko** | `basko` | Corso Cristoforo Colombo, 4-6 | Supermercato |
| 2 | `rapallo-coop-sciesa` | **Coop** | `coop` | Via Amatore Sciesa, 15 *(+ Via F.lli Bandiera 14)* | Supermercato |
| 3 | `rapallo-gulliver-mameli` | **Gulliver** | `gulliver` | Corso Goffredo Mameli, 194 / 219 *(+ Via Lamarmora 13)* | Supermercato |
| 4 | `rapallo-carrefour-assereto` | **Carrefour Market** | `carrefour-market` | Corso Giuseppe Assereto, 37 | Supermercato |
| 5 | `rapallo-carrefour-express-mameli` | **Carrefour Express** | `carrefour-express` | Corso Goffredo Mameli, 102R / 234 *(+ P.zza Battisti 6, V.le Libertà 60)* | Supermercato di prossimità |
| 6 | `rapallo-ekom-mameli` | **Ekom** | `ekom` | Corso Goffredo Mameli, 172 *(+ Via S. Filippo Neri 27-29)* | Discount Alimentare |
| 7 | `rapallo-penny-milano` | **Penny** | `penny` | Viale Milano, 33 | Discount Alimentare |
| 8 | `rapallo-eurospin-aurelia` | **Eurospin** | `eurospin` | Via Aurelia Ponente, 4/A | Discount Alimentare |
| 9 | `rapallo-despar-betti` | **Despar** | `despar` | Via Fratelli Betti, 43-45 | Supermercato |
| 10 | `rapallo-dpiu-fioria` | **DPiù** | `dpiu` | Via Fioria, 18 | Discount Alimentare |
| 11 | `rapallo-tigota-lamarmora` | **Tigotà** | `tigota` | Via Lamarmora, 23 | Cura Casa e Persona |
| 12 | `rapallo-piume-neri` | **PiùMe** | `piume` | Via San Filippo Neri, 18 *(+ C.so Assereto 47, C.so Mameli 200)* | Cura Casa e Persona |
| 13 | `rapallo-unieuro-matteotti` | **Unieuro** | `unieuro` | Corso Giacomo Matteotti, 68 | Elettronica e Casalinghi |
| 14 | `rapallo-arcaplanet-italia` | **Arcaplanet** | `arcaplanet` | Corso Italia, 31 *(+ Corso Mameli 260)* | Animali / Pet Store |

*(Le insegne non presenti a Rapallo o prive di punto vendita attivo — `Conad`, `Doro`, `Kasanova` — vengono rimosse dal catalogo attivo di Rapallo).*

### 2.2. Filtro Anti-Rumore Geografico sui Volantini (`isValidRapalloFlyer`)
Durante l'ingestion (sia live sia di generazione seed), ogni volantino viene validato scartando quelli il cui titolo contiene indicatori espliciti di altre province o regioni estranee al Tigullio/Genova:
- Pattern esclusi: `/spezia|piacentin|pavese|piemont|lombard|sardegn|sicili| pugli|calabri|campani|lazio|toscan|venet|friul|trentin|emili|romagn|umbria|marche|abruzz|molis|basilicat|aosta/i`.
- Per ciascuna insegna vengono mantenuti al massimo i **2 volantini principali più rilevanti e correnti**, estraendo fino a **50 offerte reali** per volantino dalla pagina specifica del volantino (`/volantino/<slug>/<flyerId>`).

---

## 3. Conseguenze

- **Positive:**
  - **100% fedeltà territoriale:** chi abita a Rapallo vede solo negozi realmente esistenti a Rapallo con i loro veri indirizzi stradali.
  - **Offerte pulite e pertinenti:** nessun volantino del Piemonte, Pavia o La Spezia mescolato con le offerte di Rapallo; numero di offerte per negozio realistico e facilmente consultabile (~20–60 offerte per insegna).
- **Trade-off / Vincoli:**
  - I test automatici e gli oracoli (`tests/helpers/test_helper.js`, `tests/unit/models.test.js`, `tests/integration/ingestion_service.test.js`) devono essere allineati al nuovo catalogo reale di Rapallo (sostituendo i riferimenti ai negozi rimossi Conad/Doro/Kasanova con le insegne reali verificate).

---

## 4. Task Operativi Collegati (con Definition of Done)

- [x] **TASK-DATA-01**: **Aggiornamento Catalogo Reale Negozi Rapallo (14 insegne Opzione B), Filtro Volantini Extra-Regione e Rigenerazione Seed Reale (`data/seed/`)**
  - *File coinvolti*: `data/seed/rapallo_stores.json`, `data/seed/rapallo_flyers.json`, `data/seed/rapallo_offers.json`, `server/services/ingestionService.js`, `src/components/StoreSwitcher.jsx`
  - *Acceptance Criteria*:
    - `rapallo_stores.json` contiene le 14 insegne reali di Rapallo con indirizzi stradali verificati (rimossi Conad, Doro e Kasanova).
    - `rapallo_flyers.json` e `rapallo_offers.json` contengono i volantini e i prodotti reali scaricati da PromoQui per le 14 insegne di Rapallo, filtrando via i volantini di altre province (Spezia, Piacentino, Piemontese) e normalizzando le percentuali di sconto.
    - `IngestionService` interroga gli endpoint per-retailer (`/rapallo/<slug>`) e applica il filtro geografico sui titoli dei volantini.
  - *Verification Step*: `node --test tests/unit/models.test.js tests/integration/ingestion_service.test.js`
