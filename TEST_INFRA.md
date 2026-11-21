# E2E Test Infra: Basilico — Rapallo Supermarket Promotional Offers

## Test Philosophy
- Opaque-box, requirement-driven. Derived strictly from `ORIGINAL_REQUEST.md` (R1-R4) and user-facing specifications without coupling to internal private functions.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial Testing + Real-World Workload Testing.
- Progressive testability: Tests verify lower-level contracts first (HTTP responses, data shapes) before higher-level composite interactions.
- Robustness: Rigorous negative testing verifying graceful degradation on upstream network failures, invalid queries, and missing parameters.

## Feature Inventory & Test Coverage Matrix
| # | Feature | Source (Requirement) | Tier 1 (Min 5) | Tier 2 (Min 5) | Tier 3 (Pairwise) | Tier 4 (Scenario) |
|---|---------|---------------------|:--------------:|:--------------:|:-----------------:|:-----------------:|
| F1 | Rapallo Supermarket Store Directory | R2 (Coop, Carrefour, Conad, Basko, Doro) | 5 | 5 | ✓ | ✓ |
| F2 | Bundled Offline Seed Dataset | R3 (Local caching & storage) | 5 | 5 | ✓ | ✓ |
| F3 | Multi-Tier Ingestion & Parser Engine | R3 (Scrape & parse data) | 5 | 5 | ✓ | ✓ |
| F4 | Local Persistent Cache & Resilience Manager | R3 (Availability & resilience) | 5 | 5 | ✓ | ✓ |
| F5 | Store Overview REST API (`/api/stores`) | R2, R4 | 5 | 5 | ✓ | ✓ |
| F6 | Product Search & Filter Engine (`/api/offers`) | R4 (Search & filter) | 5 | 5 | ✓ | ✓ |
| F7 | Flyer Catalog & Page Viewer API (`/api/flyers`) | R1, R2, R4 | 5 | 5 | ✓ | ✓ |
| F8 | Ingestion Refresh & Health API (`/api/sync`) | R3 (Ingestion & caching) | 5 | 5 | ✓ | ✓ |
| F9 | Single Standard Command Startup (`npm start`) | AC Web App & UI 1 | 5 | 5 | ✓ | ✓ |
| F10 | Responsive Layout (375px mobile & 1280px desktop) | R1, AC Web App & UI 2 | 5 | 5 | ✓ | ✓ |
| F11 | Store Switcher & Navigation | R2, R4, AC Web App & UI 3 | 5 | 5 | ✓ | ✓ |
| F12 | Live Product Search & Category Filters | R4, AC Web App & UI 4 | 5 | 5 | ✓ | ✓ |
| F13 | Responsive Offer Grid & Deal Cards | R1, R4 | 5 | 5 | ✓ | ✓ |
| F14 | Touch-Friendly Flyer Viewer Modal | R1, R2 | 5 | 5 | ✓ | ✓ |
| F15 | Graceful Fallback & Offline UI Banner | AC Data & Backend 3 | 5 | 5 | ✓ | ✓ |

## Test Architecture & Directory Layout
- Test Runner: Node.js test runner (`node --test`) and Vitest
- Test Command: `npm test`
- Layout:
  - `tests/unit/`: Pure algorithmic, schema, discount math, accent normalization, TTL expiration.
  - `tests/integration/`: Ingestion parser with network simulation, cache fallback, atomic disk storage.
  - `tests/api/`: Express REST API contract testing (Supertest / in-process fetch) for all endpoints.
  - `tests/e2e/`: Full user scenarios (store switching, search filtering, flyer viewing, offline failure recovery, responsive viewport assertions).

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Rapallo resident searches for weekly pasta deals across all stores | F5, F6, F11, F12, F13 | Medium |
| 2 | Shopper opens flyer viewer on mobile (375px) to flip through Basko pages | F7, F10, F11, F14 | High |
| 3 | Network drop simulation: user launches app offline, views cached/seed deals with banner | F2, F4, F8, F9, F15 | High |
| 4 | User filters by supermarket (Coop Liguria) then filters by category "Freschi" | F1, F5, F6, F11, F12, F13 | Medium |
| 5 | Price-sensitive shopper sorts discounts descending to find highest % savings | F6, F12, F13 | Medium |
| 6 | Fresh checkout single-command startup verification (`npm start` listens on 3000) | F9, F10 | High |

## Coverage Thresholds
- Tier 1: ≥5 per feature (≥75 test cases)
- Tier 2: ≥5 boundary and corner cases per feature (≥75 test cases)
- Tier 3: Pairwise coverage across major feature pairs (≥15 interaction test cases)
- Tier 4: ≥6 realistic end-to-end user application workflows
- **Total test suite target: ≥170 test cases**
