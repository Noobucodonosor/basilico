# ADR-0008: Stanza 2 — Database Scientifico CREA al 100% (832 Alimenti × 7 Sezioni), Rese Crudo↔Cotto & Ponte "Nutrienti per Euro Edibili"

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P1 — Alta (Milestone 2 — Livello 2 Bottom-Up)**
- **Data:** 2026-11-09
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Team Basilico
- **Fonti:** Master Blueprint Bottom-Up, Database Ufficiale CREA (`alimentinutrizione.it`, 832 alimenti, 26.622 valori nutrizionali, `crea_yield_factors`).

---

## 1. Contesto e Problema

Nelle iterazioni precedenti (`C.I.B.O. 1.0`, `2.0`, `cibbo`, `cibo_semplice`), il database nutrizionale CREA era stato:
- troncato in interfaccia tramite `.slice(0, 12)` nascondendo minerali e vitamine;
- sepolto in un quadrante secondario di `/v2` o rimosso in `cibo_semplice`;
- abbinato alle offerte commerciali tramite matching ingenuo che confondeva il complemento con il soggetto (*"Salsa di noci"* $\rightarrow$ *"Noci"*, *"Tonno all'olio"* $\rightarrow$ *"Olio"*).

L'obiettivo della **Milestone 2 (Stanza 2: Scienza & CREA)** è esporre in `Basilico` il **100% del patrimonio scientifico CREA** incrociandolo in modo rigoroso e bidirezionale con le offerte alimentari (`domain === 'food_human'`) di Rapallo.

---

## 2. Decisione Architetturale

1. **Dataset Seed Certificato CREA (`data/seed/crea_foods.json`, `data/seed/crea_yields.json`):**
   - Estrazione integrale dal seed verificato degli **832 alimenti ufficiali CREA**, delle **17 categorie merceologiche**, dei metadati scientifici (nome latino, nome inglese, `% parte edibile`, porzione standard LARN in grammi, codici LanguaL, riferimenti bibliografici, URL scheda ufficiale `alimentinutrizione.it`) e di tutti i **26.622 valori nutrizionali** strutturati nelle **7 sezioni ufficiali**:
     1. Macronutrienti e Fibre
     2. Minerali (Ferro, Calcio, Magnesio, Potassio, Sodio, Zinco, Fosforo, Selenio, Rame, Manganese, Iodio)
     3. Vitamine (A, B1, B2, B3, B5, B6, B12, C, D, E, K, Folati, Biotina)
     4. Acidi Grassi (Saturi, Monoinsaturi, Polinsaturi, Omega-3, Omega-6)
     5. Aminoacidi e Profilo Proteico
     6. Carboidrati Dettagliati (Amido, Zuccheri solubili, Fruttosio, Glucosio, Saccarosio, Lattosio)
     7. Colesterolo, Alcol e Altri Componenti
   - Distinzione rigorosa tra valore numerico `0.0`, `"traccia"` (`tr`) e dato non disponibile (`null`).
2. **Motore Matematico Deterministico di Ricalcolo Quantità, Parte Edibile e Resa Crudo ↔ Cotto (`server/services/creaService.js`):**
   - Ricalcolo istantaneo su:
     - `100g edibili` (standard CREA);
     - `100g peso lordo acquistato` (moltiplicato per `ediblePartPct / 100`);
     - `1 porzione standard LARN`;
     - qualsiasi `peso libero in grammi` scelto dall'utente;
     - *Invarianza delle frazioni relative:* le unità espresse come `% delle proteine` o `% degli acidi grassi` non vengono moltiplicate per il peso.
   - **Switch fisico Crudo ↔ Cotto:** applicazione dei fattori di resa fisica $Y$ (`crea_yield_factors`: idratazione di pasta/riso/legumi secchi $Y \approx 2{,}2\text{–}2{,}6$ vs disidratazione termica di carne/pesce/verdure $Y \approx 0{,}70\text{–}0{,}88$).
   - Calcolo automatico della `% VNR / LARN` giornaliera per ogni nutriente.
3. **Matcher Semantico Prudente *Head-Noun* Offerta ↔ CREA (`server/services/creaOfferMatcher.js`):**
   - Opera esclusivamente sui prodotti con `domain === 'food_human'`.
   - Verifica che l'alimento CREA sia la **testa semantica (head-noun)** del titolo commerciale e che lo stato fisico coincida (secco vs in scatola scolato, fresco vs surgelato, intero vs filetto).
   - Calcola i **Nutrienti per Euro Edibili** (`g proteine / €`, `kcal / €`, `mg ferro / €`, `mg calcio / €`, `mg magnesio / €`, `g fibre / €`, `g omega-3 / €`) usando il **prezzo al kg sgocciolato edibile** ($\text{Prezzo €/kg netto} / (\text{Parte edibile \%} / 100)$).
   - Supporta l'**override/conferma manuale in 1 clic** da parte dell'utente con persistenza dell'associazione appresa.
4. **Interfaccia Utente Stanza 2 (`src/components/crea/CreaExplorerView.jsx`, `CreaFoodModal.jsx`, `CreaCompareTray.jsx`):**
   - Classifiche scientifiche pure sugli 832 alimenti ordinabili per qualsiasi nutriente + filtro per categoria e rispetto automatico delle esclusioni del Profilo Utente attivo (con toggle *"Mostra anche alimenti esclusi per studio accademico"*).
   - Classifica economica live **"Nutrienti per Euro a Rapallo"** e filtri rapidi per obiettivo fisiologico (*Idratazione & Elettroliti in barca*, *Sazietà leggera serale*, *Alta densità proteica*, *Borsa termica senza frigo*).
   - Vassoio di confronto Side-by-Side (da 2 a 4 alimenti o offerte).
   - Collegamento bidirezionale: dalla scheda CREA vedi le offerte nei negozi di Rapallo; dalla card offerta in Stanza 1 apri il profilo CREA e i Nutrienti/€.

---

## 3. Task Operativi Collegati

- [x] **TASK-M2-01**: **Estrazione Seed Certificato CREA (832 Alimenti × 26.622 Valori in 7 Sezioni + Rese Crudo/Cotto) e Servizio Backend `CreaService` + `CreaOfferMatcher` (Head-Noun & Nutrienti/€ Edibili)**
  - *File coinvolti*: `data/seed/crea_foods.json`, `data/seed/crea_yields.json`, `server/services/creaService.js`, `server/services/creaOfferMatcher.js`, `server/routes/crea.js`, `tests/unit/crea_service.test.js`, `tests/api/crea_api.test.js`
  - *Verification Step*: `npm test`
- [x] **TASK-M2-02**: **Interfaccia Completa Stanza 2 ("Scienza & CREA"): Scheda Accademica a 7 Sezioni, Switch 100g/Lordo/LARN/Crudo↔Cotto, Confronto Side-by-Side e Classifica Live "Nutrienti per Euro" + Ponte Bidirezionale Stanza 1**
  - *File coinvolti*: `src/components/crea/CreaExplorerView.jsx`, `src/components/crea/CreaFoodModal.jsx`, `src/components/crea/CreaCompareTray.jsx`, `src/components/OfferCard.jsx`, `src/App.jsx`, `tests/e2e/crea_ui.test.js`
  - *Verification Step*: `npm test`
