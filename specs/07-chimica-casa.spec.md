# SPEC-07 — Stanza 7: Chimica & Cura della Casa/Barca (`?room=room-7-chimica`)

- **Riferimento ADR:** [ADR-0015](../docs/adr/0015-five-souls-causal-engine-three-rhythms-and-grounded-maestro.md) (`TASK-V2-01`, `TASK-V2-05`)
- **Servizi chiave:** `homeChemistryService.js`, `qualityLensService.js`, `domainClassifier.js`, `HomeChemistryView.jsx`

## 1. Scopo Umano (1 frase)
Risolvere scientificamente qualsiasi problema di pulizia, macchia, bucato o manutenzione in **tutta la casa a Rapallo e in barca** (`8 sporchi × superfici/tessuti × Cerchio di Sinner`), proteggendo materiali delicati e salute da miscele pericolose o bufale web, e confrontando il vero costo `€/ciclo` tra il **Kit Minimo a 7 Pilastri** e i volantini di Tigotà, PiùMe e supermercati.

## 2. Invarianti Inviolabili (Must Never Happen)
- **Sicurezza Chimica P0 Assoluta (Zero Compromessi):**
  - Bloccare sempre con alert rosso P0 le miscele letali/pericolose: **Ipoclorito (Candeggina) + Acidi** ($\rightarrow \text{Cl}_2\uparrow$ cloro gassoso), **Ipoclorito + Ammoniaca** ($\rightarrow$ clorammine), **Acido Peracetico improvvisato**, **Soda Caustica / Alcali forti + Alluminio anfotero (moka, filtri cappa)** ($\rightarrow \text{H}_2\uparrow$ e corrosione), e **Anionici + Disinfettanti Cationici** (inattivazione biocida).
  - Non classificare **mai** la candeggina (`NaClO`) come sgrassatore né come sicura su **Acciaio Inox 18/10 (AISI 304)** (rischio *pitting* da $\text{ClO}^-/\text{Cl}^-$).
  - Imporre sempre le **3 Guardie P0 sulle Polveri Pure**: **`P0-PRESSURE-BURST`** (*vietato chiudere percarbonato disciolto in flaconi/spruzzini ermetici*: rilascia $\text{O}_2\uparrow$ e fa esplodere il contenitore), **`P0-CAV-INGESTION`** (*vietato usare bottiglie d'acqua/bibite*, solo flaconi child-proof etichettati) e **`P0-DUST-AEROSOL`** (ugello *foamer* schiumogeno o applicazione su panno, mai aerosol fine respirabile).
- **Tutela Materiali Liguri, Tessuti & Elettrodomestici:** vietare qualsiasi acido ($\text{pH}<6$, inclusi acido citrico, aceto e anticalcare) su **Marmo di Carrara, Ardesia ligure e Graniglia genovese**; imporre acqua fredda ($<35^\circ\text{C}$) sulle macchie proteiche (sangue/uovo); vietare proteasi/percarbonato su **lana e seta**; vietare ammorbidenti cationici su **microfibra e capi tecnici da vela**; tenere **disaccoppiati** i cicli di manutenzione lavatrice (acido citrico anticalcare $\neq$ percarbonato igienizzante).
- **Purezza Dominio & Onestà Stechiometrica (`ADR-0006`):** profumi, eau de parfum e cofanetti cosmetici di Tigotà/PiùMe appartengono a `personal_care` (mai `home_cleaning`); il confronto economico coi flaconi commerciali usa fasce legali `Reg. CE 648/2004` e `€/ciclo` calibrato sulla durezza dell'acqua Iren di Rapallo (`14–22 °f`), senza mai inventare percentuali segrete.

## 3. Golden Examples
- **SOS Macchia 3-Tap:** *Vino/Caffè su cotone bianco* $\rightarrow$ Percarbonato di sodio + TAED a $40^\circ\text{C}$ in vaschetta/bacinella aperta (con guardia `P0-PRESSURE-BURST` attiva).
- **Bagno & Pietre Liguri:** *Calcare su box doccia con piatto/soglia in ardesia o marmo* $\rightarrow$ alert P0 di schermatura pietra carbonatica prima di usare acido citrico al 15% con panno su cristallo/cromature.
- **Myth-Buster:** *Aceto + Bicarbonato* smascherato stechiometricamente come effervescenza scenografica che produce acqua + acetato di sodio neutro (potere sgrassante e anticalcare azzerati).

## 4. Note & Cambiamenti Richiesti dal Regista (Scrivi qui sotto o usa Agentation)
- *(Vuoto — aggiungi qui superfici specifiche di casa/barca o prodotti del tuo sottolavello da calibrare in Stanza 7)*
