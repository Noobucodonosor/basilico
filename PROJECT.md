# Project: Basilico — Rapallo Supermarket Promotional Offers

## Architecture
Basilico is a responsive web application delivering real-time and offline-resilient access to promotional flyers and offers from all major supermarkets in Rapallo (GE), Italy.

### System Overview & Data Flow
1. **Data Ingestion & Storage Layer** (`server/services/ingestion/` & `server/services/cache/`):
   - Multi-tier ingestion engine: Live Aggregator Connector (PromoQui / ShopFully Next.js `__NEXT_DATA__` & CDN) -> Local Persistent Disk Cache (JSON + `node:sqlite`) with configurable TTL (6h) -> Bundled Offline Seed Dataset (`data/seed/`).
   - Guarantees 100% availability with zero runtime errors even if upstream aggregators fail or the server is completely offline.
2. **Backend API Service Layer** (`server/index.js`, `server/routes/`):
   - Node.js Express application providing REST endpoints (`/api/stores`, `/api/offers`, `/api/flyers`, `/api/sync`, `/api/status`).
   - Unified search & filter engine supporting keyword search with accent-insensitivity, category filtering, store filtering, and discount/price sorting.
   - Root `server.js` wrapper executing an automatic build verification check to guarantee single-standard-command startup (`npm start`) on clean checkouts.
3. **Responsive Web UI Layer** (`src/`):
   - React 19 + Vite 8 + Tailwind CSS responsive single-page application.
   - Mobile-first layout optimized for both 375px mobile viewports and 1280px desktop viewports.
   - Interactive store switcher covering Coop, Carrefour, Conad, Basko, Doro, and local discounters.
   - Native `<dialog>` modal flyer viewer with hardware-accelerated CSS Scroll Snap for fluid touch swiping on mobile and keyboard/thumbnail controls on desktop.
   - Clear user-facing offline/cached data banners when upstream live data is unreachable.

---

## Feature Inventory
Every feature identified during the Survey phase is mapped to a specific milestone:

| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| F1 | Rapallo Supermarket Store Directory | Complete catalog of supermarket branches in Rapallo (Coop, Carrefour Market/Express, Conad City, Basko, Doro Tigullio, Gulliver, Penny, Ekom) with GPS, addresses, and opening hours | M1 | Survey (Explorer 1 & 3) |
| F2 | Bundled Offline Seed Dataset | High-fidelity seed data for all 5+ Rapallo chains, active flyers, and 40+ categorized grocery promotions ensuring 100% instant offline boot | M1 | Survey (Explorer 1 & 3) |
| F3 | Multi-Tier Ingestion & Parser Engine | Automated scraper/connector parsing Rapallo flyer feeds from aggregator JSON structures with graceful error handling | M1 | Survey (Explorer 1 & 3) |
| F4 | Local Persistent Cache & Resilience Manager | Disk cache with TTL and stale grace period to prevent redundant upstream fetches and rate limiting | M1 | Survey (Explorer 2 & 3) |
| F5 | Store Overview REST API (`GET /api/stores`) | Returns Rapallo supermarkets with active flyer and offer badge counts | M2 | Survey (Explorer 2 & 3) |
| F6 | Product Search & Filter Engine (`GET /api/offers`) | Search by query keyword, store, category, discount percentage, and sort by price/discount | M2 | Survey (Explorer 1 & 3) |
| F7 | Flyer Catalog & Page Viewer API (`GET /api/flyers`) | Provides flyer metadata, cover images, page image sequences, and validity date ranges | M2 | Survey (Explorer 1 & 3) |
| F8 | Ingestion Refresh & Health API (`POST /api/sync`, `GET /api/status`) | On-demand ingestion trigger and real-time cache/upstream status health check | M2 | Survey (Explorer 3) |
| F9 | Single Standard Command Startup (`npm start`) | Zero-error single process startup on port 3000 with automatic build verification on clean checkout | M2 | Survey (Explorer 2) |
| F10 | Responsive Layout (Mobile 375px & Desktop 1280px) | Fluid viewport design with Tailwind CSS, container queries, and dynamic viewport units | M3 | Survey (Explorer 2) |
| F11 | Store Switcher & Navigation | Tabbed/pill selector allowing instant browsing of deals for Coop, Carrefour, Conad, Basko, Doro | M3 | Survey (Explorer 1 & 2) |
| F12 | Live Product Search & Category Filters | Debounced search bar with instant autocomplete, category pills, and active filter counters | M3 | Survey (Explorer 1 & 2) |
| F13 | Responsive Offer Grid & Deal Cards | Subgrid-aligned product cards showing discount badges, old/new prices, unit prices, and validity | M3 | Survey (Explorer 2) |
| F14 | Touch-Friendly Flyer Viewer Modal | Native `<dialog>` modal with CSS Scroll Snap carousel, swipe gestures, thumbnail strip, and desktop keyboard controls | M3 | Survey (Explorer 2) |
| F15 | Graceful Fallback & Offline UI Banner | User-facing indicator informing the user when cached/seed data is displayed due to network conditions | M3 | Survey (Explorer 3) |
| F16 | 100% E2E Verification & Adversarial Coverage Hardening | Full 4-Tier test suite execution (Tiers 1-4) plus Tier 5 adversarial stress testing | M4 | Project Architecture |

---

## Milestones

| # | Name | Scope | Dependencies | Status | Key Outputs |
|---|------|-------|-------------|--------|-------------|
| M1 | Data Ingestion, Local Cache & Seed Engine | Supermarket data schemas, Rapallo store directory (Coop, Carrefour, Conad, Basko, Doro), bundled offline seed dataset, live aggregator connector with fallback, persistent disk cache (F1, F2, F3, F4) | none | DONE | `data/seed/*`, `server/services/cacheManager.js`, `server/services/ingestionService.js`, 295/295 tests pass |
| M2 | Backend REST API & Server Startup | Express server setup, REST endpoints (`/api/stores`, `/api/offers`, `/api/flyers`, `/api/sync`, `/api/status`), search & filter service, single-command startup `npm start` (F5, F6, F7, F8, F9) | M1 | DONE | `server/index.js`, `server/routes/*`, `server/services/offerService.js`, `server.js`, 330/330 tests pass |
| M3 | Responsive Web UI & Touch Flyer Viewer | React 19 + Vite + Tailwind CSS frontend, responsive layout (375px/1280px), store switcher, search bar, category filters, offer grid, native `<dialog>` flyer modal with CSS scroll snap, offline notice (F10, F11, F12, F13, F14, F15) | M2 | DONE | `src/*`, responsive UI, touch flyer modal, 385/385 tests pass |
| M4 | Final Milestone: E2E Test Suite Pass (Tiers 1-4) & Adversarial Hardening (Tier 5) | Verification of all E2E test tiers against running application, coverage audit, adversarial edge case hardening (F16) | M1, M2, M3, TEST_READY | DONE | 100% E2E test pass (444/444 tests pass across 103 suites), Tier 5 adversarial hardening, Forensic Audit CLEAN |

---

## Interface Contracts

### Ingestion Service ↔ Cache & Storage Layer
```typescript
export interface IngestionService {
  sync(force?: boolean): Promise<IngestionResult>;
  getStores(): Promise<SupermarketStore[]>;
  getOffers(filter: SearchFilter): Promise<PaginatedOffers>;
  getFlyers(storeId?: string): Promise<Flyer[]>;
  getStatus(): Promise<SyncStatus>;
}
```

### Backend API ↔ Frontend Client
- `GET /api/stores`:
  - Output: `{ stores: SupermarketStore[], totalStores: number, totalFlyers: number, totalOffers: number }`
- `GET /api/offers`:
  - Query: `storeId`, `q`, `category`, `minDiscount`, `sortBy`, `page`, `limit`
  - Output: `{ offers: PromotionItem[], totalOffers: number, page: number, totalPages: number, categories: string[] }`
- `GET /api/flyers`:
  - Query: `storeId`
  - Output: `{ flyers: Flyer[], totalFlyers: number }`
- `POST /api/sync`:
  - Body: `{ force?: boolean }`
  - Output: `IngestionResult`
- `GET /api/status`:
  - Output: `{ isOnline: boolean, dataSource: 'live' | 'cache' | 'seed', lastSyncTimestamp: string, storeCount: number }`

---

## Code Layout
```
basilico/
├── data/
│   ├── seed/
│   │   ├── rapallo_stores.json       # Canonical Rapallo stores (Coop, Carrefour, Conad, Basko, Doro)
│   │   ├── rapallo_flyers.json       # Active promotional flyers & page image lists
│   │   └── rapallo_offers.json       # Categorized promotion items with pricing & discounts
│   └── cache/                        # Persistent disk cache with TTL envelope
├── server/
│   ├── index.js                      # Express app, middleware, route mounting
│   ├── routes/
│   │   ├── stores.js                 # /api/stores endpoint
│   │   ├── offers.js                 # /api/offers endpoint with search/filter
│   │   ├── flyers.js                 # /api/flyers endpoint
│   │   └── status.js                 # /api/status and /api/sync endpoints
│   └── services/
│       ├── storeService.js           # Store listing & metadata
│       ├── offerService.js           # Search tokenization, accent-normalization, category filtering
│       ├── ingestionService.js       # Live fetcher with timeout & fallback to cache/seed
│       └── cacheManager.js           # Atomic disk cache with TTL and stale grace period
├── src/
│   ├── main.jsx                      # React 19 app entry
│   ├── App.jsx                       # Master state coordinator & responsive shell
│   ├── index.css                     # Tailwind CSS & scroll-snap rules
│   ├── components/
│   │   ├── Header.jsx                # Responsive navbar with Rapallo badge & status
│   │   ├── StoreSwitcher.jsx         # Supermarket brand switcher (Coop, Carrefour, Conad, Basko, Doro)
│   │   ├── SearchBar.jsx             # Debounced product search input
│   │   ├── CategoryFilters.jsx       # Category tag pills
│   │   ├── OfferGrid.jsx             # Responsive CSS grid of deal cards
│   │   ├── OfferCard.jsx             # Product card with discount badge and price comparison
│   │   ├── FlyerModal.jsx            # Native <dialog> flyer modal
│   │   ├── FlyerCarousel.jsx         # Touch-friendly CSS Scroll Snap flyer viewer
│   │   └── OfflineNotice.jsx         # Fallback / offline data banner
│   └── hooks/
│       ├── useSupermarketData.js     # Unified data hook for stores, offers, flyers
│       └── useDebounce.js            # Input debouncing hook
├── tests/
│   ├── unit/                         # Unit tests: data models, discount math, search tokens
│   ├── integration/                  # Ingestion, cache TTL, fallback behavior
│   ├── api/                          # Express REST API contract tests
│   └── e2e/                          # Full browser/workflow E2E tests (Tiers 1-4)
├── server.js                         # Root entrypoint with automatic build verification for npm start
├── vite.config.js                    # Vite frontend configuration with /api proxy
├── tailwind.config.js                # Tailwind CSS configuration
├── package.json                      # Single root manifest with scripts and dependencies
└── PROJECT.md                        # Master project index & specification
```
