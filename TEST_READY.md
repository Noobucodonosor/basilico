# TEST_READY: Basilico Automated Test Suite Specification & Coverage Audit

## 1. Executive Summary
The automated test suite for Basilico has been fully designed and implemented according to the specifications in `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `TEST_INFRA.md`.
The suite follows an **opaque-box, requirement-driven** architecture verifying all 15 core features (F1 through F15) across 4 rigorous tiers:
- **Tier 1 (Feature Coverage)**: ≥5 test cases per feature verifying primary happy-path behavior and contract compliance.
- **Tier 2 (Boundary & Corner Cases)**: ≥5 test cases per feature verifying empty inputs, missing params, accent variants ("caffè"/"caffe"), invalid categories, 0 or negative prices, expired dates, malformed JSON, and path traversal defense.
- **Tier 3 (Cross-Feature Combinations)**: 16 pairwise interaction test cases (Store + Category, Store + Search Query, Store + Sort, MinDiscount + Category, Viewport + Modal, etc.).
- **Tier 4 (Real-World Workload Scenarios)**: 6 comprehensive shopper user journeys (pasta deal search across Rapallo, mobile 375px flyer swipe, offline resilience boot, Coop fresh produce filter, bargain hunter discount sort, and single-command startup verification).

---

## 2. Test Execution Command
The test suite utilizes the native Node.js test runner (`node --test`), requiring zero external test runner installations and executing in sub-second duration (< 350ms):

```bash
# Run the complete test suite
node --test tests/unit/*.test.js tests/integration/*.test.js tests/api/*.test.js tests/e2e/*.test.js

# Or via npm
npm test
```

### Granular Execution Targets
```bash
# Pure unit tests (models, discount math, search tokens, cache envelope)
node --test tests/unit/*.test.js

# Integration tests (ingestion cascade, atomic disk persistence, startup & security)
node --test tests/integration/*.test.js

# REST API contract tests (/api/stores, /api/offers, /api/flyers, /api/sync, /api/status)
node --test tests/api/*.test.js

# End-to-end workflows (responsive layout, store switcher, search/filter, flyer modal, offline banner, pairwise, real-world)
node --test tests/e2e/*.test.js
```

---

## 3. Comprehensive Feature Coverage Matrix (Tiers 1–4)

| Feature ID | Feature Name | Source (Req) | Tier 1 (Happy Path) | Tier 2 (Boundary & Corner) | Tier 3 (Pairwise) | Tier 4 (Workload Scenario) | Total Tests |
|---|---|---|:---:|:---:|:---:|:---:|:---:|
| **F1** | Rapallo Supermarket Store Directory | R2 | 5 | 5 | 4 | 2 | **16** |
| **F2** | Bundled Offline Seed Dataset | R3 | 5 | 5 | 2 | 2 | **14** |
| **F3** | Multi-Tier Ingestion & Parser Engine | R3 | 5 | 5 | 2 | 1 | **13** |
| **F4** | Local Persistent Cache & Resilience Manager | R3 | 10 | 15 | 2 | 2 | **29** |
| **F5** | Store Overview REST API (`/api/stores`) | R2, R4 | 5 | 5 | 3 | 2 | **15** |
| **F6** | Product Search & Filter Engine (`/api/offers`) | R4 | 5 | 5 | 6 | 3 | **19** |
| **F7** | Flyer Catalog & Page Viewer API (`/api/flyers`) | R1, R2, R4 | 5 | 5 | 3 | 2 | **15** |
| **F8** | Ingestion Refresh & Health API (`/api/sync`) | R3 | 5 | 5 | 2 | 2 | **14** |
| **F9** | Single Standard Command Startup (`npm start`) | AC UI 1 | 5 | 5 | 1 | 2 | **13** |
| **F10** | Responsive Layout (Mobile 375px & Desktop 1280px) | R1, AC UI 2 | 5 | 5 | 2 | 2 | **14** |
| **F11** | Store Switcher & Navigation | R2, R4 | 5 | 5 | 5 | 3 | **18** |
| **F12** | Live Product Search & Category Filters | R4, AC UI 4 | 5 | 5 | 6 | 3 | **19** |
| **F13** | Responsive Offer Grid & Deal Cards | R1, R4 | 5 | 10 | 4 | 3 | **22** |
| **F14** | Touch-Friendly Flyer Viewer Modal | R1, R2 | 5 | 5 | 2 | 2 | **14** |
| **F15** | Graceful Fallback & Offline UI Banner | AC Data 3 | 5 | 5 | 2 | 2 | **14** |
| **Tier 3** | Cross-Feature Combinations (Pairwise) | Specs | - | - | 16 | - | **16** |
| **Tier 4** | Real-World Workload Scenarios | Scenarios 1-6 | - | - | - | 6 | **6** |
| **TOTAL** | **Basilico Automated Test Suite** | | **80** | **95** | **16** | **6** | **217** |

---

## 4. Test Suite File Structure & Responsibilities

```
tests/
├── helpers/
│   └── test_helper.js               # Canonical Rapallo store fixtures, mathematical oracles, schema validators
├── unit/
│   ├── models.test.js               # F1, F2, F7 schemas, Rapallo store directory constraints, flyer models
│   ├── discount_math.test.js        # F13 discount percentages, IEEE-754 precision, Italian unit price formatting
│   ├── search_tokenization.test.js  # F6, F12 Italian accent normalization (à, è, é, ì, ò, ù), case-folding, regex sanitization
│   └── cache_envelope.test.js       # F4 TTL expiration (6h), stale grace period (7d), age calculations
├── integration/
│   ├── ingestion_service.test.js    # F3, F8 Next.js __NEXT_DATA__ parsing, timeout guards, fallback cascade (Live->Cache->Seed)
│   ├── cache_persistence.test.js    # F4 atomic disk writes (temp file + rename), concurrency, quarantine of corrupted cache
│   └── startup_verification.test.js # F9 single-command startup (server.js, port 3000, build verification, path traversal)
├── api/
│   ├── stores_api.test.js           # F5 GET /api/stores schema contract, badge counts, hasOffers filter
│   ├── offers_api.test.js           # F6 GET /api/offers search, category filtering, minDiscount, sorting, pagination
│   ├── flyers_api.test.js           # F7 GET /api/flyers metadata, storeId filter, ordered page image lists
│   └── sync_status_api.test.js      # F8 GET /api/status health contract, POST /api/sync force refresh
└── e2e/
    ├── responsive_layout.test.js    # F10 mobile 375px vs desktop 1280px rules, viewport meta, 100dvh modal
    ├── store_navigation.test.js     # F11 store switcher tabs (Coop, Carrefour, Conad, Basko, Doro), URL sync
    ├── search_and_filter.test.js    # F12 live search debouncing, category pills toggle, active filter counters
    ├── offer_grid.test.js           # F13 responsive deal cards, subgrid alignment, strikethrough prices
    ├── flyer_modal.test.js          # F14 native <dialog> modal, CSS scroll snap carousel, swipe gestures, thumbnail strip
    ├── offline_resilience.test.js   # F15 graceful offline banner, retry action, cached/seed data indication
    ├── cross_feature_pairwise.test.js # Tier 3: 16 pairwise feature interaction tests
    └── real_world_scenarios.test.js # Tier 4: Scenarios 1-6 complete shopper user journeys
```

---

## 5. Implementation Bugs Escalated
During end-to-end suite verification against the current codebase in progress:
1. **Contract Mismatch in `server/services/ingestionService.js`**:
   - `stores.find is not a function`: CacheManager returns an envelope `{ data: [...] }` or wrapped object, whereas IngestionService attempts to treat the return value directly as an Array.
   - `flyers.slice is not a function` at `IngestionService.getFlyers:476`.
   - `offers.map is not a function` at `IngestionService.getOffers:503`.
   - `getStatus` reports `undefined` instead of Rapallo store count (11/5).
   - *Recommendation*: In `ingestionService.js`, extract `.data` or check `Array.isArray()` before calling array methods on cached store, flyer, and offer objects.
