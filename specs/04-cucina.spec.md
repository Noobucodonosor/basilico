# SPEC-04 — Stanza 4: Officina Cucina — Fornelli, Pentole, Lame & Termodinamica (`?room=room-4-cucina`)

- **GitHub Issue:** `#31` (`[ROOM-4]`) · **Riferimenti ADR:** [ADR-0010](../docs/adr/0010-kitchen-equipment-roi-and-cleaning-chemistry-reset.md), [ADR-0015](../docs/adr/0015-five-souls-causal-engine-three-rhythms-and-grounded-maestro.md)
- **Servizi chiave:** `kitchenInventoryService.js`, `cookwarePhysicsEngine.js`, `kitchenResetService.js`, `KitchenCareView.jsx`

## 1. Scopo Umano (1 frase)
Mappare la dotazione reale di fornelli, pentole, lame e contenitori (casa a Rapallo vs barca), governare la fisica termica in cottura (inerzia, geometria, turni di rosolatura, limiti P0), calcolare ROI piatti sbloccati + TCO pluriennale e attivare il ponte immediato col protocollo *Kitchen Reset* post-cottura (demandando la chimica dell'intera casa a [Stanza 7](./07-chimica-casa.spec.md)).

## 2. Invarianti Inviolabili (Must Never Happen)
- **ROI Piatti Sbloccati Calcolato dal Vivo:** il numero di ricette sbloccate da un utensile (`mortaio_marmo`, `bistecchiera_ghisa`, `wok_acciaio`, ecc.) deve derivare dal conteggio reale sul catalogo ricette con ID 1:1 allineati, mai da numeri fissi cablati.
- **Separazione Fisica Materiali & Compatibilità Fornelli (`ADR-0006`):** separare sempre fisicamente **Rame stagnato** ($\alpha \approx 111\text{ mm}^2/\text{s}$) da **Terracotta/Coccio** ($\alpha \approx 0,4\text{ mm}^2/\text{s}$), mantenendo compatibilità con gli ID legacy; su piano `Induzione`, segnalare subito pentole non ferromagnetiche (rame, alluminio nudo, terracotta).
- **Blocchi Termici e di Superficie P0:**
  - **Mai** consigliare `Induzione Boost` o temperature $>200^\circ\text{C}$ su rivestimenti **PTFE / antiaderenti**;
  - **Mai** preriscaldare a secco il **Rame stagnato** (fusione dello stagno a $231,9^\circ\text{C}$);
  - Segnalare la reattività agli acidi lunghi su **Ghisa nuda / Ferro blu** e vietare il sale in acqua fredda su **Inox 18/10** (*pitting* da cloruri $\text{Cl}^-$).
- **Lame, Contenitori Casa/Barca & Ponte *Kitchen Reset*:** distinguere manutenzione lame europee (`56–58 HRC`) vs giapponesi (`60–63 HRC`, mai lavastoviglie né taglieri vetro/marmo), consigliare **Vetro borosilicato** e **Inox AISI 316 marino** in barca rispetto a `PP #5` con grassi caldi/licopene, e mantenere attivo il protocollo *Kitchen Reset* post-cottura coerente con le guardie P0 di [SPEC-07](./07-chimica-casa.spec.md).

## 3. Golden Examples
- Rosolatura di 400g di bocconcini o pesce su padella leggera da 24cm $\rightarrow$ `cookwarePhysicsEngine` prescrive **2 turni separati** per non crollare sotto i $140^\circ\text{C}$ ed evitare l'effetto bollito.
- Valutazione acquisto padella Inox tri-ply / Ferro blu (*Buy-It-For-Life*) vs rinnovo ciclico antiaderente PTFE $\rightarrow$ confronto onesto di TCO / costo per utilizzo + numero esatto di ricette sbloccate, con link diretto al *Kitchen Reset* post-uso.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui cosa vuoi potare o adattare alla tua Officina Cucina reale in Stanza 4)*
