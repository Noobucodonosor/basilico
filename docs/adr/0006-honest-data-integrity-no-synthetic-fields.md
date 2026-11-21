# ADR-0006: Integrità Assoluta del Dato (Zero Dati Inventati su Prezzi, Sconti, Scadenze, Pagine e Filtro Geografico)

* **Stato:** Accettato
* **Data:** 2026-11-09
* **Priorità:** **P0 — Critica (Integrità del Dato & Fiducia dell'Utente)**
* **Autori / Fonti:** Direttore di Prodotto (@Noobucodonosor), Revisione Esterna (@cfiorentinoc-bot / Ciro Fiorentino)

---

## 1. Contesto e Audit di Integrità

Un audit esterno indipendente sul codice di `server/services/ingestionService.js` e dello script di generazione seed ha individuato **6 distorsioni del dato** introdotte in precedenza per soddisfare vecchi test sintetici:

1. **Tetto artificiale di 2 volantini e 25 offerte (`slice(0, 2)` / `slice(0, 25)`):**
   - Il codice troncava i volantini a 2 per insegna e i prodotti a 25 per volantino, mostrando solo un campione invece di tutte le offerte reali del volantino.
2. **Prezzo originale e sconto `-20%` inventati (`promoPrice * 1.25`):**
   - Quando PromoQui non forniva il prezzo di partenza (`starting_price`), il codice calcolava `originalPrice = promoPrice * 1.25`, generando uno sconto fittizio del `-20%` mai dichiarato dal supermercato.
3. **Proroga artificiale della scadenza (`validTo` spostato a +10 giorni):**
   - Se un volantino scadeva entro 3 giorni, la data di scadenza veniva spostata in avanti di 10 giorni, rischiando di mostrare come attivi volantini in realtà scaduti.
4. **Prezzo unitario fittizio (`X,XX € / pz`):**
   - Veniva costruita una stringa `unitPrice` ripetendo il prezzo promo seguito da `/ pz`, anche quando PromoQui non forniva alcun prezzo al kg/litro/pezzo.
5. **Iniezione forzata di 5 offerte di riserva in testa (`seedData.offers.slice(0, 5)`):**
   - Alla fine del `deepSync()` venivano sempre aggiunte in cima 5 offerte fisse del seed dataset anche su dati live.
6. **Pagine volantino limitate a 2 con distribuzione arbitraria e fallback geografico permissivo:**
   - Venivano mostrate solo 2 pagine (`firstPage`, `secondPage`) con 10 offerte fisse ciascuna invece di usare `g.settings.flyer_page`; inoltre l'espressione `validFlyers.length > 0 ? validFlyers : rawFlyers` faceva sì che, se un'insegna aveva solo volantini di altre province (es. *Pavese/Piemontese*), venissero comunque inclusi invece di scartarli.

---

## 2. Decisioni Architetturali (Regola "Zero Dati Inventati")

1. **Estrazione Integrale (Nessun taglio a 25 offerte o 2 volantini):**
   - Vengono acquisiti tutti i volantini validi per Rapallo dell'insegna e tutte le offerte (`flyerGibs`) presenti nel volantino.
2. **Onestà sui Prezzi e sugli Sconti (`originalPrice` e `discountPercentage`):**
   - `originalPrice` viene valorizzato **solo ed esclusivamente** se `starting_price.digits` è presente nel payload reale di PromoQui ed è maggiore di `promoPrice`.
   - In caso contrario, `originalPrice = null`, `discountPercentage = null` e `discountLabel = null`. La scheda prodotto (`OfferCard.jsx`) mostra solo il prezzo in offerta reale senza alcun badge di sconto inventato.
3. **Data di Scadenza Reale (`validTo`):**
   - Viene utilizzata esclusivamente la data di fine validità ufficiale del volantino (`unpublish_at_iso` o `end_date`). Nessuna proroga automatica viene mai applicata.
4. **Prezzo Unitario Reale (`unitPrice`):**
   - Valorizzato solo se esplicitamente fornito da PromoQui (`price_suffix` o analogo); altrimenti `null` (nascosto nella UI).
5. **Nessuna Iniezione di Offerte Fisse nel Live/Deep Sync:**
   - Rimossa completamente l'aggiunta automatica di offerte del seed in coda o in testa a `deepSync()`.
6. **Mappatura Reale delle Pagine (`flyer_page`) e Filtro Geografico Rigoroso:**
   - Le pagine del volantino vengono costruite usando gli URL reali disponibili e mappando ciascuna offerta sulla propria pagina effettiva (`Number(g.settings?.flyer_page)`).
   - Il filtro geografico usa esclusivamente `rawFlyers.filter(f => !NON_RAPALLO_FLYER_REGEX.test(f.title || ''))` **senza mai** ricadere su `rawFlyers` se tutti i volantini di un'insegna appartengono ad altre province.
7. **Allineamento dei Test Automatici al Dato Reale:**
   - I test di validazione (`tests/helpers/test_helper.js`, `tests/integration/challenger_stress.test.js`, `tests/integration/ingestion-service.test.js`) verificano la correttezza matematica dello sconto **quando `originalPrice` è presente**, e accettano legittimamente `originalPrice: null, discountPercentage: null` quando il volantino riporta solo il prezzo promozionale ("Solo € X,XX").

---

## 3. Task Operativi Collegati

| Task ID | Titolo | Priorità | File Coinvolti |
| :--- | :--- | :--- | :--- |
| **TASK-DATA-02** | Rimozione Dati Sintetici (Prezzi Originali `×1.25`, Scadenze Prorogate, Limite 25 Offerte, `unitPrice` Fittizio, Fallback Fuori Provincia) e Rigenerazione Pulita del Dataset Seed | **P0 — Critica** | `server/services/ingestionService.js`, `data/seed/rapallo_*.json`, `src/components/OfferCard.jsx`, `tests/` |
| **TASK-DATA-03** (`#35`) | Verifica Territoriale `GE`/Rapallo su `storesData.stores` PromoQui (esclusione leak silenziosi fuori provincia CZ/LT/RM + risoluzione redirect canonici `/volantino/<slug>/<id>` per Penny/Unieuro) e Trasparenza Cap `50` Offerte | **P0 — Critica** | `server/services/ingestionService.js`, `src/App.jsx`, `tests/integration/ingestion-service.test.js`, `evals/run_evals.mjs` |
