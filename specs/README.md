# Basilico — Living Product Specs (`specs/`)

> **Metodologia Spec-Driven Development (SDD — [ADR-0014](../docs/adr/0014-ai-native-product-engineering-specs-evals-agentation-and-board.md)):**
> Il codice (15.000+ righe) è un artefatto derivato. Queste **6 Specifiche di 1 pagina** sono la fonte di verità umana del prodotto.

## Come lavori nei prossimi giorni (Zero Carico Cognitivo)

1. **Vedi dove eravamo rimasti (1 secondo):**
   ```bash
   npm run board
   ```
   Ti mostra lo stato delle 6 Stanze su GitHub (`status:taste-check` / `status:spec-review`), la Scorecard delle **Domain Evals** e quante note visive hai lasciato in **Agentation**.

2. **Due modi moderni per dire cosa cambiare (senza spiegazioni lunghe in chat):**
   - **Per UI / Layout / Card che stonano nel browser:** clicca l'icona **Agentation** in basso a destra su `http://localhost:3000`, punta qualsiasi elemento nella pagina, scrivi 3 parole (es. *"togli questo badge"*, *"rendi più compatto"*) e clicca **Send to Agent**. Poi in chat mi scrivi solo: **`"smaltisci inbox"`**.
   - **Per regole di prodotto / logica di una Stanza:** apri una sola delle 6 Spec qui sotto, aggiungi un punto sotto `## 4. Note & Cambiamenti Richiesti dal Regista` (oppure usa `/grill-me` su quella singola Spec) e dimmi: **`"allinea alla spec 01"`**.

3. **Il filtro automatico di buon senso (`npm run eval`):**
   Prima che tu debba guardare qualsiasi modifica, l'agente esegue `npm run eval` (Domain Evals Suite) + `npm test` (514+ test tecnici).

---

## Indice delle 6 Living Specs

| # | Stanza | Living Spec | GitHub Issue | Ordine Consigliato |
| :- | :--- | :--- | :--- | :--- |
| **1** | **Negozi & Offerte Rapallo** | [`01-negozi.spec.md`](./01-negozi.spec.md) | `#28` | **1° (Fondamenta Prezzi/Domini)** |
| **2** | **Scienza & CREA** | [`02-crea.spec.md`](./02-crea.spec.md) | `#29` | **3° (Nutrienti per €)** |
| **3** | **Ricette, Ristoranti & Fornelli** | [`03-ricette.spec.md`](./03-ricette.spec.md) | `#30` | **5° (Arbitraggio & Cottura)** |
| **4** | **Cucina, Pentole & Pulizia** | [`04-cucina.spec.md`](./04-cucina.spec.md) | `#31` | **4° (Dotazione & Chimica)** |
| **5** | **Dispensa & Scontrini** | [`05-dispensa.spec.md`](./05-dispensa.spec.md) | `#32` | **2° (Realtà Casa/Barca)** |
| **6** | **Pianificatore & Lista Spesa** | [`06-pianificatore.spec.md`](./06-pianificatore.spec.md) | `#33` | **6° (Direttore d'Orchestra)** |
