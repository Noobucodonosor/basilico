# SPEC-05 — Stanza 5: Dispensa & Scontrini (`?room=room-5-dispensa`)

- **GitHub Issue:** `#32` (`[ROOM-5]`)
- **Servizi chiave:** `receiptService.js`, `pantryService.js`, `PantryAndReceiptsView.jsx`, `ReceiptScannerModal.jsx`

## 1. Scopo Umano (1 frase)
Registrare gli scontrini reali con quadratura obbligatoria al centesimo (costruendo lo storico dei prezzi *fuori offerta* di Rapallo) e tenere sotto controllo cosa c'è davvero in **Dispensa Secca**, **Frigo/Freezer** e **Cambusa Barca** con l'orologio di sicurezza sui freschi aperti ($T_{\text{open}}$).

## 2. Invarianti Inviolabili (Must Never Happen)
- **Quadratura al Centesimo Obbligatoria (`delta === 0`):** uno scontrino non può essere confermato finché $\sum \text{righe} - \sum \text{sconti} \neq \text{Totale Scontrino}$ (HTTP 422 se sbilanciato).
- **Immunità da Righe Contabili:** il parser scontrini deve scartare automaticamente `SUBTOTALE`, `TOTALE COMPLESSIVO`, `CONTANTI`, `PAGAMENTO ELETTRONICO`, `RESTO`, `IVA DI CUI` e gestire moltiplicatori/pesi (`2 X`, `0,340 kg`).
- **Idempotenza Conferma Scontrino:** confermare due volte la stessa revisione non duplica mai né le scorte in dispensa né le osservazioni nello storico prezzi.
- **Orologio $T_{\text{open}}$ sui Freschi Aperti:** quando una confezione deperibile passa a stato `opened`, calcolare la scadenza effettiva $\min(\text{scadenza chiusa}, \text{apertura} + T_{\text{open}})$ per darle priorità anti-spreco nel pianificatore.

## 3. Golden Examples
- Scontrino Basko con 5 righe + 1 sconto carta fedeltà che quadra al centesimo $\rightarrow$ popola i 3 luoghi della dispensa e aggiorna il database prezzi reali per il controllo *"È un vero sconto?"* in Stanza 1.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui come vorresti rendere più veloce l'uso quotidiano della Dispensa in Stanza 5)*
