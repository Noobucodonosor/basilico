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
| [#53](https://github.com/Noobucodonosor/basilico/issues/53) | `TASK-QA-01` | `budget:S` | 6 | 25.306 | 470.912 | 9051 | 16.9% | 0 | `24e6f55` | 2026-11-21 |
| [#54](https://github.com/Noobucodonosor/basilico/issues/54) | `TASK-SEC-02` | `budget:S` | 8 | 26.670 | 1.189.647 | 8085 | 17.8% | 0 | `9556f16` | 2026-11-21 |
