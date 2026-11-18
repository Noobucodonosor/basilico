# Registro Storico Consumi Token (Token Ledger) — Basilico

Questo file traccia in modo trasparente e riproducibile i **token reali consumati** per ciascun intervento su GitHub, letti direttamente dai log `transcript.jsonl` tramite [`scripts/tokenLedger.mjs`](../../scripts/tokenLedger.mjs).

## Riferimento Storico Pre-Governance (Sessione `/swarm`)

| Periodo / Scope | Modalità | Sub-agenti | Steps | Input Nuovi | Cache Read | Output | Note |
| :--- | :--- | ---: | ---: | ---: | ---: | ---: | :--- |
| Issues `#39`–`#45` (Wave V2 + Restyling Oggi) | `/swarm` multi-agente | 11 | 742 | 12.863.646 | 115.890.324 | 911.622 | Baseline storica da non ripetere ([ADR-0016](./0016-causal-cycle-ontology-and-github-token-governance.md)) |

---

## Consumi per Singola GitHub Issue (Protocollo `ADR-0016`: 1 Issue = 1 Agente Singolo)

| Issue | Task ID | Taglia | Steps | Input Nuovi | Cache Read | Output | % Budget Input | Sub-agenti Extra | Commit | Data |
| :--- | :--- | :--- | ---: | ---: | ---: | ---: | ---: | ---: | :--- | :--- |
| [#46](https://github.com/Noobucodonosor/basilico/issues/46) | `TASK-GOV-01` | `budget:S` | 40 | 997.751 | 14.762.355 | 50.276 | 665.2% | 0 | `1790468` | 2026-11-18 |
