# Basilico — Living Product Specs (`specs/`)

> **Metodologia Spec-Driven Development (SDD — [ADR-0014](../docs/adr/0014-ai-native-product-engineering-specs-evals-agentation-and-board.md), [ADR-0015](../docs/adr/0015-five-souls-causal-engine-three-rhythms-and-grounded-maestro.md) & [ADR-0019](../docs/adr/0019-consumer-editorial-shell-and-progressive-disclosure.md)):**
> Il codice è un artefatto derivato. Queste **Living Specs di 1 pagina** (per la Home **Oggi / Maestro** e le **7 Stanze dell'Atlante**) sono la fonte di verità umana del prodotto.

## Come lavori nei prossimi giorni (Zero Carico Cognitivo)

1. **Vedi dove eravamo rimasti (1 secondo):**
   ```bash
   npm run board
   ```
   Ti mostra lo stato delle Stanze su GitHub (`status:taste-check` / `status:spec-review`), la Scorecard delle **Domain Evals** e quante note visive hai lasciato in **Agentation**.

2. **Due modi moderni per dire cosa cambiare (senza spiegazioni lunghe in chat):**
   - **Per UI / Layout / Card che stonano nel browser:** avvia `npm run dev` e clicca l'icona **Agentation** in basso a destra su `http://localhost:5173`, punta qualsiasi elemento nella pagina, scrivi 3 parole (es. *"togli questo badge"*, *"rendi più compatto"*) e clicca **Send to Agent**. Poi in chat mi scrivi solo: **`"smaltisci inbox"`**.
   - **Per regole di prodotto / logica di Home o di una Stanza:** apri una sola delle Spec qui sotto, aggiungi un punto sotto `## 4. Note & Cambiamenti Richiesti dal Regista` (oppure usa `/grill-me` su quella singola Spec) e dimmi: **`"allinea alla spec 00"`** (o `01`..`07`).

3. **Il filtro automatico di buon senso (`npm run eval`):**
   Prima che tu debba guardare qualsiasi modifica, l'agente esegue `npm run eval` (Domain Evals Suite) + `npm test` (suite tecnica Unit, Integration, API, E2E).

---

## Indice delle Living Specs (Home Oggi + 7 Stanze dell'Atlante)

| # | Area / Stanza | Living Spec | GitHub Issue | Ruolo nel Sistema ("Le 5 Anime") |
| :- | :--- | :--- | :--- | :--- |
| **0** | **Oggi & Basilico Maestro** | [`00-oggi-e-maestro.spec.md`](./00-oggi-e-maestro.spec.md) | `#42` / `#74` | **Ingresso Editoriale Consumer (`ADR-0019`, 3 Proposte Pareto & Chat Ibrida)** |
| **1** | **Negozi & Offerte Rapallo** | [`01-negozi.spec.md`](./01-negozi.spec.md) | `#28` | **Fondamenta Territoriali Prezzi & 5 Domini** |
| **2** | **Scienza & CREA** | [`02-crea.spec.md`](./02-crea.spec.md) | `#29` | **Anima 1: Fisiologia Cotta (24+ Nutrienti), Biodisponibilità & €/Nutrienti** |
| **3** | **Ricette, Ristoranti GE & Fornelli** | [`03-ricette.spec.md`](./03-ricette.spec.md) | `#30` | **Anima 2: Arbitraggio Ristoranti GE, Accademia 12 Competenze & SOS Fornelli** |
| **4** | **Officina Cucina (Fornelli, Pentole, Lame)** | [`04-cucina.spec.md`](./04-cucina.spec.md) | `#31` | **Anima 3: Termodinamica Strumenti, Lame, Contenitori & Ponte Kitchen Reset** |
| **5** | **Dispensa, Scontrini & `VaR_48h`** | [`05-dispensa.spec.md`](./05-dispensa.spec.md) | `#32` | **Anima 5 (Stock): Quadratura Centesimi, Casa/Barca & Euro a Rischio** |
| **6** | **Pianificatore & Economia Spesa** | [`06-pianificatore.spec.md`](./06-pianificatore.spec.md) | `#33` | **Anima 5 (Regia): Coaching Adattivo, Zero-Spreco & Rendimento `€/h` Negozi** |
| **7** | **Chimica & Cura della Casa/Barca** | [`07-chimica-casa.spec.md`](./07-chimica-casa.spec.md) | `#39` / `#43` | **Anima 4: Risolutore 4 Assi, Pietre Liguri, Acqua Rapallo °f & Kit 7 Pilastri** |
