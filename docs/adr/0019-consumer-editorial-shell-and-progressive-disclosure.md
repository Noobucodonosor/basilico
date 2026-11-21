# ADR-0019: Shell Consumer Editoriale (`Oggi / Offerte / Ricette / Lista + Altro`) e Divulgazione Progressiva

- **Stato:** Accettato (`Accepted`)
- **Priorità:** **P1 — Alta (Architettura Informativa, Semplicità d'Ingresso & Anti-Slop Editoriale)**
- **Data:** 2026-11-21
- **Autori:** Direttore di Prodotto (@Noobucodonosor)
- **Supersede parzialmente:** [ADR-0016](./0016-causal-cycle-ontology-and-github-token-governance.md) §2.1 (barra primaria a 4 Fasi visibili e divieto ingresso *"Cosa cucinare stasera"*), preservandone integralmente §2.2 (Governance GitHub, "1 Issue = 1 Agente Singolo" e contabilità token `TOKEN_LEDGER.md`) e tutti i motori scientifici deterministici di `ADR-0015`.

---

## 1. Contesto e Problema

Il percorso a 4 Fasi + tendina delle 7 Stanze + sub-tab introdotto da `ADR-0016` rendeva l'interfaccia visivamente sovraccarica all'apertura (`2–3` barre di navigazione impilate, pill tecniche `Online` / `Sincronizza` / `Prezzo al banco`, profilo personale `Zero Formaggi` attivo di default e card dense di bottoni ed emoji), risultando ostico per un utente esterno o per la condivisione rapida con amici e colleghi.

---

## 2. Decisione Architetturale (Opzione B — Shell Consumer Editoriale)

1. **Header Unico a 4 Voci Primarie (`Oggi`, `Offerte`, `Ricette`, `Lista`) + `Chiedi` + `Altro`:**
   - Rimuove `CausalPhaseNavigation`, `RoomNavigation` e `phase-sub-navigation` dallo stack superiore della shell.
   - Tutte le 4 voci dirette restano accessibili con zero emoji e con il minimo controllo secondario `Chiedi` (`MaestroDrawer`).
   - Gli strumenti avanzati di casa (`Dispensa e Scontrini`, `Database CREA`, `Officina Pentole`, `Chimica e Cura della Casa`, `Coach Nutrizionale`, `Scuola Culinaria`), il selettore di preferenze alimentari, il prezzo al banco e il pulsante di sync manuale sono raccolti dentro il menu discreto **`Altro`** e dotati di una barra contestuale unica `← Torna a Oggi` quando aperti.
2. **Profilo Neutro di Apertura (`ospiti` — `Standard`):**
   - I nuovi visitatori partono sul profilo neutro `ospiti` (senza esclusioni automatiche sui latticini), salvando eventuali cambi profilo in `localStorage` (`basilico_profile_id`) e lasciando il toggle `Tutti i piatti / Senza latticini` a portata di 1 click in Home (riconoscendo sia `dany` sia `barca` come profili zero-latticini).
   - Il backend `/api/profiles` mantiene invariato il proprio stato di default per compatibilità retroattiva dei test API.
3. **Home `Oggi` Editoriale (`3 Dati + 1 Azione`) & Divulgazione Progressiva:**
   - Hero sobrio *"Cosa cucini stasera?"* seguito dalle **3 proposte reali** calcolate sulle offerte attive di Rapallo (`Stasera in tavola`).
   - Ogni card espone al massimo 3 informazioni (contesto/tempo, titolo serif, costo a porzione vs ristorante) e 1 azione (`Apri piatto`).
   - La complessità di ingredienti Rapallo, passi di cottura, valori nutrizionali CREA e pentole vive dentro **`DishDetailDrawer`**, con `<details>` chiusi di default e aggiunta esplicita in Lista Spesa.
4. **Preservazione Deep-Link e Spec:**
   - Tutti i deep-link `?room=room-1..7` e `?phase=1&section=nutrition|academy` restano funzionanti.

---

## 3. Conseguenze

- **Positive:** prima impressione consumer pulita su desktop e mobile (`390px`), nessun banner tecnico all'apertura quando i dati locali sono sani, piena conservazione di tutti i motori scientifici e delle 7 Stanze.
- **Impatto documentale:** `AGENTS.md`, `specs/README.md` ed `evals/` vanno mantenuti allineati alla nuova shell editoriale (`Oggi | Offerte | Ricette | Lista + Altro`) e al controllo anti-slop su `DishDetailDrawer.jsx`.
