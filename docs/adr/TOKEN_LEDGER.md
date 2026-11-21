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
| [#56](https://github.com/Noobucodonosor/basilico/issues/56) | `TASK-SEC-03` | `budget:S` | 22 | 64.857 | 3.191.684 | 20.974 | 43.2% | 0 | `2e0025e` | 2026-11-21 |
| [#58](https://github.com/Noobucodonosor/basilico/issues/58) | `TASK-INFRA-01` | `budget:S` | 1 | 2573 | 122.837 | 994 | 1.7% | 0 | `51d2c0a` | 2026-11-21 |
| [#60](https://github.com/Noobucodonosor/basilico/issues/60) | `TASK-DATA-04` | `budget:S` | 11 | 31.071 | 2.023.146 | 10.215 | 20.7% | 0 | `6121f23` | 2026-11-21 |
| [#47](https://github.com/Noobucodonosor/basilico/issues/47) | `TASK-CICLO-01` | `budget:M` | 19 | 62.758 | 4.367.117 | 18.359 | 15.7% | 0 | `b7f4f80` | 2026-11-21 |
| [#48](https://github.com/Noobucodonosor/basilico/issues/48) | `TASK-CICLO-02` | `budget:M` | 9 | 37.481 | 680.308 | 24.604 | 9.4% | 0 | `49c4688` | 2026-11-21 |
| [#49](https://github.com/Noobucodonosor/basilico/issues/49) | `TASK-CICLO-03` | `budget:L` | 14 | 344.997 | 4.076.542 | 14.210 | 43.1% | 0 | `832c1aa` | 2026-11-21 |
| [#50](https://github.com/Noobucodonosor/basilico/issues/50) | `TASK-CICLO-04` | `budget:M` | 8 | 29.829 | 2.786.439 | 9121 | 7.5% | 0 | `73e0d29` | 2026-11-21 |
| [#51](https://github.com/Noobucodonosor/basilico/issues/51) | `TASK-CICLO-05` | `budget:L` | 4 | 11.436 | 1.054.676 | 1956 | 1.4% | 0 | `645c022` | 2026-11-21 |
| [#52](https://github.com/Noobucodonosor/basilico/issues/52) | `TASK-CICLO-06` | `budget:S` | 8 | 434.848 | 2.839.646 | 3730 | 289.9% | 0 | `4fdabaa` | 2026-11-21 |
| [#68](https://github.com/Noobucodonosor/basilico/issues/68) | `TASK-UX-01` | `budget:M` | 27 | 630.388 | 7.264.616 | 24.427 | 157.6% | 0 | `e3d1598` | 2026-11-21 |
| [#70](https://github.com/Noobucodonosor/basilico/issues/70) | `TASK-PWA-01` | `budget:M` | 20 | 191.623 | 1.394.674 | 25.045 | 47.9% | 0 | `ccf8be9` | 2026-11-21 |
| [#72](https://github.com/Noobucodonosor/basilico/issues/72) | `TASK-QA-02` | `budget:S` | 9 | 25.213 | 777.450 | 1917 | 16.8% | 0 | `ee518f5` | 2026-11-21 |
