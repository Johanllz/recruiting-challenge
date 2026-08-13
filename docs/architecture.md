# Architecture

Current as of commit f51776c. Reflects actual implementation after bug fixes (date filtering, merchant validation, refund netting) and Feature A (CSV export).

## Overview

A minimal merchant dashboard backend: SQLite database, Express REST API, static frontend (HTML + vanilla JS). Single-tenant-per-request via `X-Merchant-Id` header. No real auth yet — placeholder for future JWT/token.

**Tech stack:**
- Runtime: Node.js 20+
- Server: Express 4.21
- Database: SQLite 3 (better-sqlite3), WAL mode, in-process
- Frontend: Static HTML + vanilla ES2020 JS, no build step
- Tests: Node's built-in `node:test` runner + `node:assert`
- TypeScript: Yes, via tsx (no build step, direct execution)

## Modules

### Core
- **`server.ts`** — Express bootstrapper, router registration, error middleware.
- **`db.ts`** — SQLite connection + schema init. Single shared `db` export. WAL mode + foreign keys enabled. Indexes created declaratively in `initSchema()`.
- **`auth.ts`** — Request authentication middleware. Validates `X-Merchant-Id` header exists and matches a row in `merchants` table. Returns `401` for missing/unknown ID.

### Data access
- **`dal/orders-dal.ts`** — All order queries go through here. Methods:
  - `listByMerchant()` — paginated list with optional date range filtering
  - `getById()` — single order lookup
  - `create()` — insert new order
  - `sumAmountByMerchant()` — revenue calculation (sales add, refunds subtract)
  - `iterateByMerchant()` — streaming iterator (used by CSV export)

### Routes
- **`routes/orders.ts`** — `GET /`, `GET /export`, `GET /:id`, `POST /`
  - `GET /` lists orders with optional `from`, `to`, `limit` params
  - `GET /export?from=...&to=...` streams CSV file (requires both dates)
  - `GET /:id` retrieves single order
  - `POST /` creates new order (minimal validation: email + amount required)
- **`routes/revenue.ts`** — `GET /?from=...&to=...` net revenue for date range
- **`routes/metrics.ts`** — Summary stats, top customers. (Routes through DAL since the refund-netting fix.)

### Frontend
- **`public/index.html`** — Single-page dashboard. Merchant picker, summary cards, recent orders table, CSV export section.
- **`public/app.js`** — Event listeners + API calls. Fetches with `X-Merchant-Id` header. Handles CSV download via blob + object URL.

## Data model

**Tables:**
- `merchants(id TEXT PK, name TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP)`
- `orders(id TEXT PK, merchant_id TEXT FK, customer_email TEXT, total_amount INTEGER, type TEXT DEFAULT 'sale', status TEXT DEFAULT 'completed', created_at TEXT DEFAULT CURRENT_TIMESTAMP)`

**Indexes:**
- `idx_orders_merchant(merchant_id)` — list by merchant
- `idx_orders_created(created_at)` — range queries
- `idx_orders_merchant_created(merchant_id, created_at)` — composite for export/revenue queries

**Semantics:**
- `total_amount` is in cents (integer), not dollars.
- `orders.type` is one of `'sale' | 'refund'`. Refund rows have negative semantic value in revenue calculations (they subtract, not add).
- `created_at` is stored as ISO 8601 string (SQLite CURRENT_TIMESTAMP).
- No validation constraints at DB level (CHECK clauses absent); all validation is API-layer.

## Bug fixes applied (Aug 2026)

### 1. Revenue/metrics don't net refunds (FIXED)
- **Was:** `sumAmountByMerchant()` summed all rows blindly; refunds added to revenue instead of subtracting.
- **Fix:** CASE expression in `sumAmountByMerchant()` (sales add, refunds subtract). Same logic replicated in `metrics.ts` (/summary, /top-customers).
- **Residual risk:** Logic is duplicated across three places (revenue + 2 metrics queries). A fourth aggregation point that forgets the CASE will silently miss refunds again. Mitigated by test coverage.

### 2. Partial date-range filters silently ignored (FIXED)
- **Was:** `listByMerchant()` only applied date filter if both `from` AND `to` were present. Single param silently ignored.
- **Fix:** `from` and `to` conditions built independently, both applied when present.
- **Residual risk:** Date comparison is lexicographic string match (not parsed), so malformed dates produce silent wrong results, not errors.

### 3. Unknown merchant ID crashes downstream (FIXED)
- **Was:** Auth middleware accepted any header string; unknown ID wasn't checked until DB FK constraint threw on write.
- **Fix:** `authMiddleware` now checks merchant exists in `merchants` table, rejects unknown ID with `401` before routing.
- **Residual risk:** Not a credential check — anyone who knows a valid merchant ID has full read/write access.

## Feature A: CSV export (implemented)

New endpoint `GET /api/orders/export?from=YYYY-MM-DD&to=YYYY-MM-DD` streams orders as CSV.

**Why needed:** Answered the README's open question "how do you handle large result sets?"

**Implementation:**
- Route registered before `/:id` to avoid being consumed as an order ID.
- DAL method `iterateByMerchant()` uses better-sqlite3's `.iterate()` to stream rows instead of loading all into memory.
- Composite index `(merchant_id, created_at)` added for query performance.
- CSV escaping per RFC 4180 (quote fields with commas/quotes/newlines, double internal quotes).
- Columns: `order_id, created_at, customer_email, type, status, amount_usd`. Refunds negative.
- Frontend: date pickers + download button. Button uses `fetch()` + blob (not plain `<a href>`, since auth is a header not a query param).

**Tests:** 7 new tests covering headers, escaping, refund signs, empty ranges, error cases. All pass.

## Known architectural smells (not fixed, noted for future)

### 1. Input validation absent
- `POST /api/orders` doesn't check `type` is one of `'sale'|'refund'`, doesn't check `total_amount >= 0`.
- Result: garbage types and negative amounts persist in DB, silently excluded from revenue/metrics (not rejected at insertion).
- **Would need:** Check constraints at DB level + API validation + tests.

### 2. No real pagination
- `limit` param exists but no `offset`/cursor. Second page can't be requested.
- **Would need:** Offset param or cursor-based pagination.

### 3. No async-safety
- Global error middleware only catches sync errors. Unhandled Promise rejections would crash the process.
- **Would need:** Per-route try/catch for any async calls, or unhandledRejection handler at process level.

### 4. No observability
- No structured logging, no metrics, no tracing.
- **Would need:** Winston/Pino + OpenTelemetry or equivalent.

## Decisions made during challenge

| What | Decision | Why |
|---|---|---|
| Auth model | Keep `X-Merchant-Id` header, no new mechanism | Scope — real auth is out of scope |
| Date filtering | Required both `from`/`to` for revenue, optional independent for orders | Consistent with revenue endpoint; safer default for file download |
| CSV library | Hand-rolled escaping, no dependency | 6 columns, fixed shape; not worth a new dep |
| Streaming vs. buffering | Streaming (iterate + write per row) | Directly addresses README's "large result set" question |
| Frontend download | fetch() + blob + object URL, not plain link | Custom auth header can't be sent via `<a href>` |
| Refund sign convention | Negative in exports/revenue | Matches netting fix; merchants sum the column directly for net |
| Index strategy | Composite `(merchant_id, created_at)` alongside singles | Explicitly aids the export query; others remain for flexibility |

## Files changed (Aug 2026 session)

- `src/db.ts` — added composite index
- `src/auth.ts` — added merchant existence check
- `src/dal/orders-dal.ts` — fixed refund netting in sumAmountByMerchant, added iterateByMerchant
- `src/routes/metrics.ts` — fixed refund netting in summary + top-customers (CASE expressions)
- `src/routes/orders.ts` — fixed date filtering in listByMerchant, added /export route + CSV serialization
- `public/index.html` — added date pickers + export button
- `public/app.js` — added export download handler
- `test/orders-export.test.ts` — new test file
- `docs/api.md` — complete rewrite to document actual behavior + quirks
- `docs/architecture.md` — this file (was stale, now current)
