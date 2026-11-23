---
name: multifocal-audit
description: Esegue un audit multifocale in sola lettura del repository incrociando codice, ADR accettati e AGENTS.md, producendo rischi verificati, trade-off inter-disciplinari e un piano P0/P1/P2 diviso tra nuovi ADR e GitHub Issues pronte. Usa quando richiesto un audit architetturale, di sicurezza e di prodotto senza modificare file.
---

# Protocollo Multifocal Audit (Read-Only)

**Modalità richiesta:** `DeepInvestigator` — Audit Architetturale e di Prodotto in Sola Lettura.

## Vincoli Tassativi di Sicurezza (Hard Guardrails)

1. **Solo ispezione statica:** è vietato creare, modificare o eliminare file nel workspace (non invocare tool di scrittura/modifica file).
2. **Zero side-effect shell o Git:** è vietato eseguire comandi shell mutanti o con effetti collaterali tramite terminale (inclusi `git checkout`, `git branch`, `git commit`, `git stash`, installazione dipendenze, migrazioni DB, generatori di codice o `gh issue create`). Limita gli strumenti a lettura e ricerca (e, solo se indispensabile, `git status` / `git log` in sola lettura).
3. **Chiusura senza patch:** questo task termina con la consegna del report e del piano; non predisporre patch e non restare in stato sospeso di scrittura.

---

## Fase 1 — Gerarchia delle Fonti e Rilevamento Drift

1. Individua e leggi `AGENTS.md` (inclusi eventuali `AGENTS.md` o `CLAUDE.md` annidati nelle sottodirectory), l'indice e i file in `docs/adr/`, i manifest di progetto, le pipeline CI/CD e gli entrypoint del codice attuale.
2. Applica rigorosamente questa gerarchia epistemologica:
   - **Codice attuale e config CI/CD** = verità fattuale di ciò che il sistema esegue oggi.
   - **ADR in `docs/adr/` con stato `Accepted`** = vincoli architetturali vigenti (`Proposed`, `Deprecated`, `Rejected` e `Superseded` vanno trattati solo come contesto storico, mai come regole attive).
   - **`AGENTS.md`** = istruzioni operative dichiarate: verifica se contiene comandi obsoleti, path inesistenti o regole contraddittorie rispetto al codice e agli ADR `Accepted`, segnalando esplicitamente ogni disallineamento (**3-way drift**).

---

## Fase 2 — Selezione Dinamica e Ortogonale delle Discipline

1. Deduci dal codice il dominio reale e la topologia runtime del progetto. Attiva **solo** le **4–7 discipline** tecniche e di prodotto effettivamente rilevanti (scegliendo tra Architettura Software, Sviluppo/Manutenibilità, DevOps/SRE, Cybersecurity/AppSec, QA/Reliability, Logica di Prodotto/Dominio, UX/UI/Accessibilità, Data/Storage, Performance/FinOps, Privacy/Compliance o ruoli verticali specifici del caso).
2. Escludi esplicitamente le discipline prive di superficie nel repository (es. escludi UX/UI su API o CLI headless) motivando in una riga inclusioni ed esclusioni.
3. Assegna a ogni disciplina un perimetro di indagine disgiunto per evitare sovrapposizioni (*persona collapse*).

---

## Fase 3 — Analisi Critica Evidence-Based e Conflitti Inter-Disciplinari

Per ciascuna disciplina attivata produci:

1. **Rischi e punti critici reali:** ogni rilievo DEVE indicare:
   - `percorso/file:righe` e simbolo o componente coinvolto;
   - meccanismo concreto di innesco/impatto;
   - eventuale ADR `Accepted` o regola `AGENTS.md` violata.
   - **Regola Anti-Allucinazione (Zero-Padding):** se per una disciplina non emergono rischi dimostrabili nel codice, dichiara `"Nessuna criticità rilevante riscontrata con evidenza diretta"`. Non inventare vulnerabilità teoriche e non inserire best practice generiche da manuale. Scarta nei round di verifica ogni rilievo privo di riscontro esatto nel codice.
2. **Conflitti e trade-off reali:** esplicita le tensioni concrete tra questa disciplina e le altre attive (es. Cybersecurity vs UX/Latenza, Purezza Architetturale vs Velocità di Delivery/Complessità operativa), ancorandole a scelte specifiche presenti nel repository senza attenuare i disaccordi.

---

## Fase 4 — Piano Prioritizzato (P0/P1/P2) e Triage ADR vs GitHub Issues

Deduplica i rilievi per causa radice (elencando le discipline convergenti) e sintetizza un piano d'azione ordinato secondo questa rubrica:

- **P0 (Critico / Immediato):** vulnerabilità sfruttabili, rischio perdita/corruzione dati, rottura di flussi core o blocchi di build/produzione privi di workaround.
- **P1 (Alto):** degrado di funzionalità primarie, violazioni attive di ADR `Accepted`, race condition, colli di bottiglia o debito tecnico ad alto rischio di regressione ravvicinata.
- **P2 (Medio):** debito tecnico circoscritto, lacune di test/osservabilità non bloccanti, refactoring migliorativi, pulizia di istruzioni obsolete in `AGENTS.md` o `docs/adr/`.

Per **ogni** punto del piano stabilisci l'artefatto di destinazione applicando il **Test ADR a 3 Domande**:
- *(a)* Invertire la scelta richiederebbe migrazione o coordinamento rilevante?
- *(b)* Altri moduli, team o client dipendono dal contratto risultante?
- *(c)* La scelta vincola decisioni future o sostituisce (`Supersedes`) un ADR `Accepted` esistente?

Smistamento risultante:
- **Se SÌ ad almeno una domanda** (o se restano opzioni progettuali aperte con trade-off non risolti) → classifica come **`[RICHIEDE NUOVO ADR]`** e fornisci in formato MADR neutrale:
  - Titolo decisionale proposto
  - Eventuale ADR esistente da marcare `Superseded`
  - Decision Drivers
  - 2–3 Considered Options neutre con pro e contro espliciti
  - Quesiti aperti per la decisione umana (distinguendo fatti accertati nel codice da ipotesi)
- **Se NO a tutte** (implementazione diretta o applicazione di un ADR `Accepted` già consolidato) → classifica come **`[GITHUB ISSUE PRONTA]`**, segnala eventuali dipendenze bloccanti da nuovi ADR e fornisci una bozza strutturata con:
  - Titolo
  - File target
  - Problema ed Evidenza (`file:righe`)
  - Acceptance Criteria misurabili
  - Negative Constraints (cosa NON modificare)
  - Comando/Metodo di verifica

---

## Uso rapido con gli Orchestratori

- **Singola traccia approfondita (`/boost`):** `/boost Applica la skill multifocal-audit su questo repository.`
- **Tracce parallele (`/swarm`):** usa 1 worker `read-only` per disciplina pertinente con citazioni `file:righe` obbligatorie sulla bacheca condivisa più un `@verifier` incaricato di respingere rilievi privi di evidenza diretta o basati su ADR non `Accepted`.

---

## Stop Gate Finale

Consegna **esclusivamente** il report strutturato e attendi l'approvazione esplicita dell'utente prima di qualunque modifica, creazione di file o apertura di branch.
