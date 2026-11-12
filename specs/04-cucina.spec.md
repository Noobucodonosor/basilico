# SPEC-04 — Stanza 4: Cucina, Pentole & Pulizia (`?room=room-4-cucina`)

- **GitHub Issue:** `#31` (`[ROOM-4]`)
- **Servizi chiave:** `kitchenInventoryService.js`, `kitchenResetService.js`, `KitchenCareView.jsx`

## 1. Scopo Umano (1 frase)
Mappare la dotazione reale di fornelli e pentole (casa a Rapallo vs barca), calcolare quali ricette sblocca davvero una pentola mancante e abbinare il protocollo chimico corretto (*Kitchen Reset*) alle offerte reali di Tigotà, PiùMe e supermercati.

## 2. Invarianti Inviolabili (Must Never Happen)
- **ROI Piatti Sbloccati Calcolato dal Vivo:** il numero di ricette sbloccate da un utensile (`mortaio_marmo`, `bistecchiera_ghisa`, `wok_acciaio`, ecc.) deve derivare dal conteggio reale sul catalogo ricette con ID 1:1 allineati, mai da numeri fissi cablati.
- **Compatibilità Fisica Fornelli:** se il piano selezionato è `Induzione`, segnalare subito pentole non ferromagnetiche (alluminio nudo / rame / terracotta).
- **Sicurezza Chimica P0 Inviolabile:** evidenziare sempre il divieto assoluto di miscelare **Ipoclorito (Candeggina) + Acidi (Anticalcare/Aceto/WC)** (cloro gassoso tossico) o **Candeggina + Ammoniaca** (clorammine), e vietare acidi su marmo/ardesia e abrasivi su PTFE/induzione.
- **Matching Chimico Funzionale:** abbinare alle schede *Kitchen Reset* solo vere offerte chimiche coerenti per classe (`acido`, `alcalino`, `neutro/enzimatico`, `ossidante`).

## 3. Golden Examples
- Protocollo post-frittura / grasso polimerizzato su acciaio inox $\rightarrow$ sgrassatore alcalino + offerte reali attive da Tigotà/PiùMe/GDO.
- Protocollo aloni calcarei bianchi su fondo pentola inox $\rightarrow$ acido citrico / aceto / anticalcare acido (con alert *Vietato sul mortaio di marmo*).

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui cosa vuoi potare o adattare alla tua cucina reale in Stanza 4)*
