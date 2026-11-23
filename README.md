# Basilico (C.I.B.O.) — Food Intelligence, Nutrizione CREA & Spesa Zero-Sprechi (Rapallo)

[![Anteprima Basilico (C.I.B.O.) — Rapallo](./docs/preview/social-preview.png)](https://basilico-txfxsxuuma-ew.a.run.app)

**Demo Live (Cloud Run):** [https://basilico-txfxsxuuma-ew.a.run.app](https://basilico-txfxsxuuma-ew.a.run.app) · **Vista Offerte:** [Apri Negozi](https://basilico-txfxsxuuma-ew.a.run.app/?room=room-1-negozi)

Applicazione web full-stack PWA offline-first che unisce **offerte reali dei supermercati di Rapallo (GE)** e il motore scientifico **C.I.B.O. (*Five Souls Causal Engine*)**, governata da **20 Architecture Decision Records (`ADR-0001..0020`)** e dal principio **Zero Synthetic Numbers (`ADR-0006`)**.

## I Pilastri del Motore (`C.I.B.O.` / Five Souls)
- **Offerte & Volantini Reali Rapallo (`ADR-0004`, `0005`):** ingestione multi-tier con cache JSON atomica su disco + seed offline su **14 punti vendita reali**, **25 volantini** e **941 offerte** con ricerca full-text insensibile agli accenti e sfogliatore `<dialog>`.
- **Nutrizione Scientifica CREA (`ADR-0008`):** database reale di **832 alimenti CREA**, rese di cottura e metrica deterministica *Nutrienti per Euro* (zero numeri sintetici).
- **Dispensa 3-Zone & Scontrini al Centesimo (`ADR-0009`):** gestione dispensa (*fresco / dispensa / congelatore*) con riconciliazione contabile scontrini e profili alimentari personalizzabili (`casa`, `barca`, `ospiti`).
- **Ricette, Ristoranti Tigullio & Meal Planner Zero-Sprechi (`ADR-0011`, `0012`):** catalogo di **1.825 ricette**, arbitraggio su **129 ristoranti del Tigullio**, pianificatore pasti a confezione intera e lista della spesa multi-store.
- **Chimica Domestica & Fisica Pentole (`ADR-0010`):** matrice pulizia domestica (Reg. CE 648/2004, durezza acqua Rapallo) e ROI/fisica dei materiali da cucina.
- **Grounded Maestro Coach & AI Engineering (`ADR-0014`, `0015`, `0017`, `0020`):** assistente contestuale opzionale (`GEMINI_API_KEY` / `OPENAI_API_KEY`) con fallback 100% deterministico, Living Specs in `specs/`, suite di test automatici e Domain Evals in `evals/`.

## Stack Tecnologico
- **Backend:** Node.js 22, Express, JSON Disk Cache atomica (astrazione storage `ADR-0018`), Docker / Google Cloud Run
- **Frontend:** React 19, Vite, Tailwind CSS, PWA offline-first (`/sw.js`)
- **Governance & Documentazione:** [20 ADR & Master Backlog](./docs/adr/README.md) · [Specifica di Progetto](./docs/PROJECT.md) · [Living Specs](./specs/)

## Avvio Locale e Test
```bash
cp .env.example .env
npm install
npm run build
npm start

# Test e Domain Evals
npm run test:unit
npm run eval
```

## Licenza
Rilasciato sotto licenza [MIT](./LICENSE).
