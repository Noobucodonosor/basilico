# ADR-0017: Sicurezza Pubblica Cloud Run & Guardrail LLM

- **Stato:** Accettato
- **Data:** 2026-11-21
- **Autori:** Direttore di Prodotto (@Noobucodonosor) & Audit Multifocale
- **Priorità:** `P0-critical`
- **Issue Collegata:** `#56` (`TASK-SEC-03`)

---

## 1. Contesto e Problema

Con il deploy pubblico di Basilico su Google Cloud Run (`NODE_ENV=production`), diversi endpoint originariamente pensati per uso domestico locale erano esposti senza barriere minime contro abusi di quota, prompt/context injection e scraping ripetuto:

1. **`POST /api/maestro/chat`** ([`server/routes/maestro.js`](../../server/routes/maestro.js), [`server/services/maestroCoachService.js`](../../server/services/maestroCoachService.js)):
   - Accettava `body.contextOverride` direttamente nel `systemInstruction` (`JSON_CONTESTO_CERTIFICATO`) inviato a Gemini/OpenAI, permettendo a un client esterno di iniettare dati falsi o istruzioni arbitrarie.
   - Non applicava limiti di lunghezza su `message` o `history`, né rate limiting per IP, esponendo le chiavi LLM configurate.
   - Trasmetteva `GEMINI_API_KEY` come query parameter (`?key=...`) nell'URL invece che nell'header HTTP dedicato.
2. **`POST /api/sync`** ([`server/routes/status.js`](../../server/routes/status.js)):
   - Permetteva a qualsiasi client anonimo di innescare `deepSync()` (scraping di 14 endpoint esterni PromoQui) senza cooldown/rate limiting.
3. **Header HTTP di sicurezza** ([`server/index.js`](../../server/index.js)):
   - Impostava solo `X-Content-Type-Options` e `X-Frame-Options`, omettendo `Referrer-Policy`, `Permissions-Policy` e `Content-Security-Policy`.

*(Nota: l'isolamento di `Agentation` e l'hardening della build Vite sono stati già completati in `#54` / `TASK-SEC-02`; la strategia di persistenza multi-istanza su Cloud Run è demandata ad `ADR-0018`.)*

---

## 2. Decisione Architetturale

1. **Blocco `contextOverride` in produzione:** in `NODE_ENV === 'production'`, `POST /api/maestro/chat` ignora `req.body.contextOverride` (forzandolo a `null`) così che il Maestro utilizzi esclusivamente lo snapshot certificato dal server.
2. **Validazione input chat LLM:** `maestroCoachService.askMaestro` rifiuta (`400`) messaggi superiori a `2000` caratteri e normalizza `history` a massimo `12` turni recenti (ciascuno troncato a `1500` caratteri).
3. **Trasporto sicuro `GEMINI_API_KEY`:** rimozione di `?key=` dalla URL di chiamata Gemini; invio esclusivo tramite header `x-goog-api-key`.
4. **Rate Limiter Zero-Dependencies (`server/middleware/rateLimiter.js`):**
   - `POST /api/maestro/chat`: max `20` richieste ogni `10` minuti per IP.
   - `POST /api/sync`: max `3` richieste ogni `5` minuti per IP.
   - Il limiter risponde con `429 Too Many Requests` + header `Retry-After` ed è bypassato in `NODE_ENV === 'test'` (salvo istanziazione esplicita nei test unitari del middleware).
5. **Security Headers completi (`server/index.js`):**
   - `Referrer-Policy: strict-origin-when-cross-origin`
   - `Permissions-Policy: camera=(), microphone=(), geolocation=()`
   - `Content-Security-Policy` in `NODE_ENV === 'production'` (`default-src 'self'`, `script-src 'self'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob: https:`, `connect-src 'self'`, `frame-ancestors 'none'`).

---

## 3. Conseguenze e Trade-off

- **Positivi:** elimina l'iniezione di contesto LLM in produzione, protegge le chiavi API da leak in URL/log e mitiga il consumo incontrollato di quote LLM e scraping.
- **Trade-off:** il rate limiter in-memory è per singola istanza Cloud Run (senza Redis condiviso, coerente con `ADR-0001` zero-deps); in caso di scale-out multi-istanza, un eventuale throttling globale richiederà Cloud Armor o Redis a livello infrastrutturale.

---

## 4. Task Operativi Collegati

- [x] **TASK-SEC-03** (`#56`): Implementazione guardrail LLM (`contextOverride` prod-block, `x-goog-api-key`, limiti `message`/`history`), rate limiter su `/api/maestro/chat` e `/api/sync`, header HTTP di sicurezza e test dedicati. *(PR #57)*
