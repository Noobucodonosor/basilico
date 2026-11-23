---
name: cibo-shopping-list
description: Guida operativa per estendere, verificare e collegare alla vetrina il modulo Lista della Spesa di C.I.B.O. (?room=room-6-pianificatore). Usa questa skill quando lavori su pianificazione pasti, lista della spesa, modalità In Corsia o deep-link dalla vetrina Noobucodonosor.
---

# Skill: Modulo Lista della Spesa (C.I.B.O. — Stanza 6)

## Obiettivo
Mantenere la Stanza 6 (`?room=room-6-pianificatore`) il miglior modulo possibile per generare e usare una **Lista della Spesa** reale, pronta subito con un clic anche per chi arriva direttamente dalla vetrina `Noobucodonosor`.

## File Chiave da Leggere Prima di Modificare
1. `specs/06-pianificatore.spec.md` — Invarianti inviolabili (zero duplicati settimanali, negozi reali, *Piano B in corsia*, export).
2. `server/services/mealPlannerService.js` — Generazione piano settimanale.
3. `server/services/shoppingListService.js` — Aggregazione lista spesa per reparto/corsia e simulatore negozi.
4. `src/components/PlannerAndShoppingView.jsx` e `src/components/AisleChecklistModal.jsx` — UI principale e modalità *In Corsia*.

## Regole di Qualità e Deep-Link Vetrina
- **Accesso immediato (`?room=room-6-pianificatore`):** chi apre direttamente questo URL dalla vetrina deve trovare una lista della spesa subito utilizzabile (o generabile in 1 tap), senza blocchi o configurazioni obbligatorie.
- **Zero dati inventati:** usare solo insegne, offerte e prodotti presenti nel dataset/servizi reali di C.I.B.O.
- **Branding coerente:** usare il nome **C.I.B.O.** nell'interfaccia e negli export condivisibili (WhatsApp/Telegram).

## Verifica Obbligatoria Prima della PR
1. Avvia in locale (`npm start` o `npm run dev`) e verifica visivamente `?room=room-6-pianificatore` nel browser (desktop 1280px e mobile 390px).
2. Esegui:
   - `npm run build`
   - `npm run eval`
   - `npm test`
3. Apri una **Draft PR** su `team104/cibo` allegando l'esito dei test e gli screenshot/Artifact della verifica.
