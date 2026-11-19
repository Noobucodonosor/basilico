# Basilico — Offerte & Volantini Rapallo (GE)

[![Anteprima Basilico — Offerte & Volantini Rapallo](./docs/preview/social-preview.png)](https://basilico-txfxsxuuma-ew.a.run.app)

**Demo Live (Cloud Run):** [https://basilico-txfxsxuuma-ew.a.run.app](https://basilico-txfxsxuuma-ew.a.run.app)

Applicazione web full-stack responsive per consultare in tempo reale (e con resilienza offline) offerte promozionali e volantini dei supermercati di **Rapallo (GE)**, sviluppata con architettura **ADR-Driven**.

## Funzionalità Principali
- **Multi-tier Ingestion & Resilienza Offline:** connettore live + cache persistente locale (`node:sqlite` + JSON con TTL) + dataset seed offline integrato per garantire disponibilità costante anche in assenza di rete.
- **API REST Express:** ricerca full-text insensibile agli accenti, filtri per punto vendita (Coop, Carrefour, Conad, Basko, Doro, discount), categoria, prezzo e sconto (`/api/stores`, `/api/offers`, `/api/flyers`, `/api/status`).
- **Interfaccia Responsive Mobile-First:** React 19 + Vite + Tailwind CSS con sfogliatore volantini nativo `<dialog>` e scroll-snap touch.
- **Containerizzazione & QA:** `Dockerfile` pronto per il deploy e suite di test automatici.

## Stack Tecnologico
- **Backend:** Node.js, Express, `node:sqlite`, Docker
- **Frontend:** React 19, Vite, Tailwind CSS
- **Architettura & Governance:** Architecture Decision Records in [`docs/adr/README.md`](./docs/adr/README.md) e specifica completa in [`PROJECT.md`](./PROJECT.md)

## Avvio Locale
```bash
npm install
npm start
```
