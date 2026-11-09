# ADR-0007: Fondamenta Multi-Dominio (Livelli 0–1), Normalizzatore Prezzi Edibili (`€/kg`), Storico Prezzi & Profilo Utente Universale

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P0 — Critica (Fondamenta Bottom-Up Livelli 0, 1 e 2.4)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up (`ADR-0007`..`ADR-0012`), Audit Post-Mortem Ecosistema C.I.B.O.

---

## 1. Contesto e Problema

Il catalogo attuale di `Basilico` ([ADR-0001](./0001-core-architecture.md) – [ADR-0006](./0006-honest-data-integrity-no-synthetic-fields.md)) fornisce già le offerte attive e i volantini reali delle 14 insegne con presenza digitale a Rapallo. Per permettere la costruzione bottom-up dei moduli successivi (CREA, Dispensa/Scontrini, Pentole/Pulizia, Ricette/Ristoranti, Pianificatore/Lista Spesa) senza mai ricadere nelle distorsioni dei prototipi precedenti, occorre consolidare le fondamenta sui **Livelli 0, 1 e 2.4**:

1. **Livello 0 — Estensione Anagrafica Negozi Fisici di Rapallo (6 Categorie + Botteghe Locali):**
   - Oltre alle 14 insegne con volantino digitale, a Rapallo (16035 GE, con estensione opzionale a Santa Margherita Ligure / Chiavari / Zoagli) esistono botteghe fisiche fondamentali (pescherie, macellerie, ortofrutta, panifici, negozi di casalinghi/pentole sostitutivi dell'ex-Kasanova) i cui prezzi non passano da PromoQui ma da **scontrini reali** o **rilevazione diretta al banco**.
   - Ogni negozio deve esporre: categoria merceologica strutturata (`gdo`, `bottega_freschi`, `casalinghi_cucina`, `cura_casa_persona`, `elettronica_cucina`, `pet`), canale dati (`flyer_live`, `online_catalog`, `receipt_observed`), logistica reale (orari, distanza/tempo da casa/porto, facilità di parcheggio, tempo medio di visita) e requisito Carta Fedeltà (es. *Socio Coop*, *Prima Card Basko*, *Tigotà Fidelity*).
2. **Livello 1 — Tassonomia Invalicabile a 5 Domini, Prezzo Normalizzato `€/kg` Edibile, Lente Qualità & Storico Prezzi:**
   - Nei vecchi tentativi la mancanza di un confine netto di dominio faceva entrare detersivi e pentole nei piani alimentari. Ogni prodotto/offerta deve appartenere a uno e un solo dominio chiuso:
     - `food_human` (Alimenti e bevande umane)
     - `home_cleaning` (Cura casa e detergenza: pH acido/neutro/alcalino, funzione, superfici vietate)
     - `kitchen_cookware` (Pentole, coltelli e attrezzatura cucina: materiale, compatibilità induzione ferromagnetica, diametro, $T_{\max}$)
     - `personal_care` (Igiene e cura persona)
     - `pet_care` (Alimenti e accessori animali)
   - **Normalizzazione deterministica dei prezzi unitari (`unitPriceExtractor.js`):** conversione rigorosa di *"all'etto / per 100g"* ($\times 10 \rightarrow \text{€/kg}$), multipack (`3x80g`, `6x1.5L`) e distinzione tra peso lordo e **peso sgocciolato/edibile**, separando sempre il **Prezzo di Cassa della Confezione** dal **Prezzo Normalizzato (`€/kg`, `€/L`, `€/pz`, `€/lavaggio`)** con guardrail su anomalie OCR.
   - **Storico Prezzi & Verità dello Sconto ("È un vero sconto?"):** archiviazione delle osservazioni di prezzo (da volantini, scontrini e prezzi visti al banco) per confrontare il prezzo promo attuale con il prezzo ordinario reale osservato a Rapallo, senza mai inventare prezzi mancanti (`"Prezzo da rilevare"`).
   - **Lente Qualità Scientifica & Barcode OpenFoodFacts:** analisi deterministica delle diciture di qualità (zona FAO tonno, codice allevamento uova `0..3`, estrazione olio EVO, nitriti `E249/E250`, pescato vs allevato) e lookup barcode OpenFoodFacts (Nutri-Score, NOVA `1..4`, additivi).
3. **Livello 2.4 & 7.1 — Profilo Utente Multiplo con Esclusioni a 4 Livelli & Separazione Dati:**
   - Supporto multi-profilo (`Dany`, `Barca`, `Ospiti`, `Amici/Tester`) con switch rapido nell'header e calcolo dell'intersezione sicura per più commensali.
   - Regole di esclusione configurabili dall'utente su 4 livelli: (a) Regimi alimentari, (b) Categorie merceologiche/CREA, (c) 14 Allergeni UE, (d) Singoli ingredienti/alimenti (es. *Hard Ban: Zero Formaggi* vs *Soft Filter*), con separazione fisica totale tra **Catalogo Condiviso** e **Dati Personali Utente** e sandbox obbligatoria per tutti i test automatici.

---

## 2. Decisione Architetturale

1. **Modello Negozi Esteso (`server/models/schemas.js`, `data/seed/rapallo_stores.json`):**
   - Arricchimento dello schema negozio con `storeCategory`, `dataChannel`, `loyaltyCard`, `logistics` (`distanceKmFromHarbor`, `parkingEase`, `avgVisitMinutes`, `municipality`).
2. **Classificatore a 5 Domini, Normalizzatore `€/kg` e Lente Qualità (`server/services/domainClassifier.js`, `server/services/unitPriceExtractor.js`, `server/services/qualityLensService.js`):**
   - Ogni offerta/prodotto viene classificato deterministicamente in uno dei 5 domini (`food_human`, `home_cleaning`, `kitchen_cookware`, `personal_care`, `pet_care`). I moduli nutrizionali e gastronomici interrogano esclusivamente `domain === 'food_human'`.
   - Calcolo deterministico di `packWeightGrams`, `drainedWeightGrams`, `normalizedPricePerKg`, `normalizedPricePerLiter` e flag `priceAnomalyFlag`.
3. **Servizio Storico Prezzi & Osservazioni al Banco (`server/services/priceHistoryService.js`):**
   - Persistenza atomica isolata per utente/ambiente (in sandbox temporanea durante `npm test`) delle serie storiche prezzi, calcolo dell'indicatore `realDiscountVerification` (*"È un vero sconto?"*) ed endpoint `POST /api/prices/observe` per registrare un *"Prezzo visto al banco"*.
4. **Servizio Profili Utente & Filtro Esclusioni Universale (`server/services/userProfileService.js`):**
   - Gestione profili multipli (`GET /api/profiles`, `POST /api/profiles`, `PUT /api/profiles/:id`), filtro deterministico `matchesUserExclusions(item, activeProfiles)` a 4 livelli (`hardBan` e `softFilter`) ed export/import JSON completo dei dati utente.
5. **Shell UI a 6 Stanze Principali + Header Profilo/Lista (`src/App.jsx`, `src/components/Header.jsx`):**
   - Predisposizione della navigazione principale a **6 Stanze**:
     1. `Negozi & Offerte Rapallo`
     2. `Scienza & CREA`
     3. `Ricette, Ristoranti & Fornelli`
     4. `Cucina, Pentole & Pulizia`
     5. `Dispensa & Scontrini`
     6. `Pianificatore & Lista Spesa`
   - Selettore rapido del **Profilo Attivo** (con filtro esclusioni live anche sulle offerte di Stanza 1) e contatore Lista Spesa nell'Header.

---

## 3. Conseguenze

- **Positive:**
  - Impossibilità strutturale di mescolare detersivi/pentole/pet con il cibo umano grazie al filtro di dominio alla radice.
  - Confronto onesto `€/kg` sgocciolato/edibile e trasparenza totale sulla veridicità degli sconti e sulla qualità nutrizionale/chimica dei prodotti.
  - I 444+ test esistenti continuano a passare senza regressioni e senza mai toccare i file utente reali.

---

## 4. Task Operativi Collegati

- [x] **TASK-M1-01**: **Estensione Anagrafica Negozi Rapallo (6 Categorie, Logistica, Carte Fedeltà), Classificatore a 5 Domini Chiusi, Normalizzatore `€/kg` Edibile e Lente Qualità Scientifica**
  - *File coinvolti*: `data/seed/rapallo_stores.json`, `server/services/domainClassifier.js`, `server/services/unitPriceExtractor.js`, `server/services/qualityLensService.js`, `server/services/offerService.js`, `tests/unit/domain_and_units.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-M1-02**: **Storico Prezzi Osservati ("È un vero sconto?"), Inserimento Prezzo al Banco, Profili Utente Multipli con Esclusioni a 4 Livelli e Shell UI a 6 Stanze**
  - *File coinvolti*: `server/services/priceHistoryService.js`, `server/services/userProfileService.js`, `server/routes/profiles.js`, `server/routes/prices.js`, `src/App.jsx`, `src/components/Header.jsx`, `src/components/OfferCard.jsx`, `tests/api/profiles_and_prices.test.js`
  - *Verification Step*: `npm test`
