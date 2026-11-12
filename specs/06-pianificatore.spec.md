# SPEC-06 — Stanza 6: Pianificatore & Lista Spesa (`?room=room-6-pianificatore`)

- **GitHub Issue:** `#33` (`[ROOM-6]`)
- **Servizi chiave:** `mealPlannerService.js`, `shoppingListService.js`, `PlannerAndShoppingView.jsx`, `AisleChecklistModal.jsx`

## 1. Scopo Umano (1 frase)
Generare un menu settimanale da single **umano, vario e appetibile** (rispettando Zero Formaggi, giorni in Barca senza fornelli e consumo di confezioni intere senza sprechi) e trasformarlo nella **Lista della Spesa ottimale tra 1, 2 o 3 negozi veri di Rapallo**.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Zero Effetto Valanga / Monotonia:** nessun piatto può ripetersi due volte nella stessa settimana (0 duplicati su 21 pasti) e nessuna famiglia gastronomica (`pasta_pesto`, `pasta_pomodoro`, `pansotti_noci`, ecc.) può superare **max 2 presenze a settimana** né comparire in giorni adiacenti.
- **Coerenza Biologica Oraria & Barca:** a colazione vanno solo vere colazioni; nei giorni `boat_day` il pranzo usa esclusivamente piatti freddi sicuri da borsa termica (`boatSafeCold === true`, mai pasta calda da scolare o fritti); pranzo e cena dello stesso giorno non ripetono la stessa famiglia né abbinano due piatti pesanti/fritti.
- **Rispetto Rigoroso Profilo Attivo:** con profilo *Dany*, zero piatti con `dairyRole === 'structural_unsubstitutable'` (niente Tiramisù, Caprese o Focaccia al formaggio).
- **Simulatore Negozi 100% Reale su Rapallo:** il confronto *1 solo negozio vs 2 negozi vs 3 negozi* usa solo insegne realmente presenti a Rapallo (mai Esselunga/Conad) calcolando prezzi reali + tempo extra di spostamento, e il *Piano B in corsia* propone solo alternative dello stesso reparto/ingrediente.

## 3. Golden Examples
- Settimana *Mediterranea Ligure* con Sabato e Domenica in `boat_day` $\rightarrow$ 21 pasti tutti diversi, pranzi in barca freddi pronti per la rada, confezioni di freschi aperte consumate entro $T_{\text{open}}$ e lista spesa divisa per corsia esportabile su WhatsApp/Telegram.

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui le tue regole personali su pasti, porzioni o giro spesa a Rapallo)*
