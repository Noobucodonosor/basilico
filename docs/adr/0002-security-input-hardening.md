# ADR-0002: Sicurezza HTTP, Protezione Path Traversal, Input Hardening e Sanitizzazione Ricerca

- **Stato:** Accettato (`Accepted`)
- **Priorità:** P0 — Critica
- **Data:** 2026-11-09
- **Autori:** Team Basilico (@Noobucodonosor)
- **Fonti:** `PROJECT.md`, `TEST_READY.md`, `server/index.js`, `server/services/offerService.js`, `tests/integration/startup_verification.test.js`

---

## 1. Contesto e Problema

Sebbene Basilico non gestisca pagamenti diretti o dati personali sensibili, l'esposizione pubblica delle API REST (`/api/offers`, `/api/stores`, `/api/flyers`, `/api/sync`) e del file server statico Express richiede difese rigorose contro:
1. **Directory / Path Traversal:** tentativi di lettura di file arbitrari sul filesystem tramite URL encoding multiplo (`%252e%252e%252f`, `..\\`, dot-collapse `....//`).
2. **Denial of Service applicativo via Query / Paginazione:** parametri HTTP ostili o estremi (`limit=500000`, `page=-99`, stringhe di ricerca con caratteri di controllo, regex injection o whitespace degenerati `\t\n`).
3. **Iniezione JSON o Payload Malformati:** richieste `POST /api/sync` con body JSON non valido che non devono mai esporre stack trace interni ma restituire `400 Bad Request` strutturato.
4. **Prevenzione Leak di Segreti e DB Locali:** garanzia che nessun file `.env`, `*.db` o chiave API venga committato nel repository.

---

## 2. Decisione Architetturale

### 2.1. Guardia Anti-Path Traversal Multi-Layer (`sanitizeStaticPath` in `server/index.js`)
- Decodifica iterativamente (`decodeURIComponent` fino a 5 passaggi) il path richiesto prima della normalizzazione.
- Rifiuta immediatamente qualsiasi sequenza di 2 o più punti (`\.{2,}`) e verifica che il path risolto (`path.normalize(path.join(baseDir, normalizedReq))`) inizi strettamente con `baseDir`.

### 2.2. Clamping Rigoroso della Paginazione e Sanitizzazione Parametri (`offerService.js` & `routes/offers.js`)
- Il parametro `limit` in `GET /api/offers` e `OfferService` deve essere sempre vincolato (**clamped**) nell'intervallo `[1, 100]` (`MAX_LIMIT = 100`), con default `20` quando omesso, non numerico o `<= 0`.
- Il parametro `page` deve essere sempre un intero `>= 1` (default `1`).
- Il parametro `minDiscount` deve essere vincolato nell'intervallo `[0, 99]`.

### 2.3. Normalizzazione Accenti e Whitespace nella Ricerca (`offerService.js`)
- Tutte le query di ricerca (`q`) vengono normalizzate tramite decomposizione Unicode `NFD`, rimozione dei diacritici (`[\u0300-\u036f]`), conversione in minuscolo, collasso di spazi multipli/tab/newline (`\s+` -> singolo spazio) ed escape dei metacaratteri RegExp.
- Query vuote, `null`, `undefined` o composte solo da spazi/tab/newline (`"   \t\n  "`) restituiscono l'intero catalogo filtrato senza errori.

---

## 3. Conseguenze

- **Positive:**
  - Immunità a path traversal, ReDoS (Regular Expression Denial of Service) e memory exhaustion da paginazione non limitata (`limit=500000`).
  - Simmetria perfetta nella ricerca in lingua italiana (`"caffè"`, `"caffe"`, `"CAFFÈ"`, `"Qualità"`, `"qualita"` producono gli stessi risultati).
- **Trade-off / Vincoli:**
  - I client che richiedono più di 100 offerte in una singola chiamata ricevono al massimo 100 elementi per pagina e devono usare `page=2, 3...`.

---

## 4. Task Operativi Collegati (con Definition of Done)

- [x] **TASK-SEC-01**: **Hardening Clamping Paginazione (`limit` 1..100) e Normalizzazione Whitespace/Accenti in `OfferService` e `/api/offers`**
  - *File coinvolti*: `server/services/offerService.js`, `server/routes/offers.js`, `server/services/ingestionService.js`
  - *Acceptance Criteria*:
    - `limit` viene sempre limitato tra `1` e `100` (`MAX_LIMIT = 100`) sia nel servizio sia nell'endpoint HTTP `GET /api/offers` (anche per valori estremi come `limit=500000` o `limit=0`).
    - Query contenenti tab, newline, spazi multipli o solo whitespace restituiscono i risultati attesi senza errori.
    - La ricerca per `"Caffè Macinato Qualità Rossa"` restituisce esattamente gli stessi risultati per tutte le varianti con o senza accenti e maiuscole/minuscole.
  - *Verification Step*: `node --test tests/api/offers_api.test.js tests/unit/search_tokenization.test.js`
