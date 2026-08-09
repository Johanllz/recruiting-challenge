# Known issues — working notes

Internal reference doc, not a submission artifact. Built by reading the code and
by actually running the app / hitting the API (not just static review). Every
item below marked "Confirmed" was reproduced live against a running instance of
the server, usually more than once. Nothing in this file has been acted on yet —
see the bottom section for the fix proposals under discussion.

Two independent passes (one from a Claude Code review, one cross-checked with
Gemini) converged on the same list. Noted below where a finding originated.

---

## 1. Real bugs (behavior is wrong)

### 1.1 Revenue and metrics don't net out refunds — and don't filter by type at all
- **Where:** `src/dal/orders-dal.ts` — `sumAmountByMerchant()` (used by `GET /api/revenue`),
  and `src/routes/metrics.ts` — `/summary` (`avg_order_value_cents`) and `/top-customers`.
- **What happens:** These queries sum/average `total_amount` over *all* rows for a
  merchant/date-range with no `WHERE type = ...` condition at all. Refunds are stored
  as positive amounts, so a refund adds to revenue instead of subtracting from it.
- **Confirmed:** Measured live — sales totaled 435,983¢ and refunds totaled 56,059¢ for
  `m_acme`; correct net revenue should be 379,924¢, but the API reported 492,042¢
  (sales + refunds summed together). Re-run later in the session also showed the
  query picking up a manually-created order with an invalid `type` ("scam") as
  revenue too — confirming there's no type filter whatsoever, not just a sign bug.
- **Severity:** High — this is the core number the dashboard exists to show.

### 1.2 Partial date range on `/api/orders` is silently ignored
- **Where:** `src/dal/orders-dal.ts:23` — `listByMerchant()`.
- **What happens:** The date filter only applies `if (opts.from && opts.to)` — both
  must be present. If a caller supplies only `from` or only `to`, the code doesn't
  error and doesn't apply a partial filter — it silently falls through to "return the
  merchant's most recent orders, unfiltered."
- **Confirmed:** `?from=2099-01-01` alone (a future date that should return zero
  orders) still returned all of the merchant's orders. Same for `?to=2000-01-01`
  alone. Reproduced twice, in separate process runs. When both params are supplied,
  filtering works correctly.
- **Scope note:** `GET /api/revenue` is NOT affected — it explicitly 400s if either
  `from` or `to` is missing (`src/routes/revenue.ts:14`).
- **Severity:** Medium-high — silent wrong data is worse than an error.
- **Source:** found via Gemini cross-check, reproduced independently.

### 1.3 No validation on order creation — garbage `type` and negative amounts are accepted
- **Where:** `src/routes/orders.ts` — `POST /` handler.
- **What happens:** Only `customer_email` presence and `total_amount` being *a* number
  are checked. `type` isn't checked against `'sale' | 'refund'`, and there's no check
  that `total_amount` is positive or an integer.
- **Confirmed:** `POST /api/orders` with `type: "scam"` returned `201 Created` and
  saved verbatim. `POST` with `total_amount: -9999` also returned `201 Created`.
  Reproduced twice.
- **Compounds with 1.1:** a bogus `type` still gets counted as revenue, since the
  revenue query has no type filter either.
- **Severity:** Medium — data integrity issue that gets worse over time.

### 1.4 Unvalidated `limit` query param crashes the request
- **Where:** `src/routes/orders.ts` (`GET /`) and `src/routes/metrics.ts` (`/top-customers`).
- **What happens:** `Number(req.query.limit)` on a non-numeric string produces `NaN`.
  Since `NaN ?? 100` doesn't fall back (NaN isn't null/undefined), `NaN` gets bound
  directly into the SQL `LIMIT ?` and better-sqlite3 throws, which the global handler
  turns into a raw `500`.
- **Confirmed:** `GET /api/orders?limit=abc` → `500 {"error":"internal_error"}`,
  reproduced twice. Separately, `?limit=-1` returns *all* rows (SQLite treats a
  negative LIMIT as "no limit") — no clamping on the low end either.
- **Severity:** Medium.

### 1.5 Unknown merchant ID on write returns a raw 500
- **Where:** `src/auth.ts` (doesn't check the merchant exists) + FK constraint in `src/db.ts`.
- **What happens:** `authMiddleware` accepts any string as a merchant ID. On
  `POST /api/orders`, an unknown ID hits the `orders.merchant_id` foreign-key
  constraint and throws, which surfaces as a generic `500`. On `GET`, an unknown ID
  just returns an empty list — indistinguishable from "real merchant, no orders yet."
- **Confirmed:** reproduced twice, both giving `500 {"error":"internal_error"}`.
- **Severity:** Medium.

---

## 2. Architecture / quality issues (code smells)

### 2.1 `metrics.ts` bypasses the DAL and opens a second DB connection
- **Where:** `src/routes/metrics.ts:1-5`.
- **What happens:** The architecture doc states all order queries should go through
  `ordersDal` so there's one place to add auditing/caching/tenancy rules. `metrics.ts`
  ignores that and opens its own separate `better-sqlite3` connection
  (`new Database(DB_PATH, { readonly: true })`) with hand-written SQL duplicating
  logic that already exists in the DAL.
- **Extra fragility:** this second connection only works today because `db.ts`
  happens to be imported first in `server.ts` (which creates the DB file before the
  readonly connection tries to open it). Reorder the imports or load `metrics.ts`
  from a different entry point and it throws on startup — nothing enforces the
  ordering, it's an accident of import sequence.
- **Severity:** Medium — not a live bug today, but a real seam being ignored, exactly
  the kind of thing the architecture doc already flags as unresolved.

### 2.2 No real authentication
- **Where:** `src/auth.ts`.
- **What happens:** Any client can read/write any merchant's data just by setting
  `X-Merchant-Id`. Documented as an intentional placeholder in `architecture.md`
  ("Eventually this becomes a real signed token").
- **Confirmed:** read `m_bistro`'s orders using nothing but the header, no
  credential of any kind, reproduced twice.
- **Severity:** High in a real deployment, but explicitly out of scope per the docs
  — noted here for completeness, not proposed as one of the 4 being fixed now.

### 2.3 Weak error handling / no async-safety net
- **Where:** `src/server.ts` — single global error middleware, no per-route try/catch.
- **What happens:** Works today because every DB call is synchronous
  (better-sqlite3), so Express's default sync error catching is enough. But nothing
  guards against unhandled rejections if an async call (e.g. a future webhook POST)
  gets added — that could hang or crash the process instead of returning a clean error.
- **Severity:** Low today, worth naming before the feature work adds async I/O.

---

## 3. Missing pieces / scaling concerns

### 3.1 No DB-level constraints
- **Where:** `src/db.ts` schema.
- **What's missing:** No `CHECK (total_amount >= 0)`, no `CHECK (type IN ('sale','refund'))`.
  The API is the only guard (see 1.3), and it doesn't guard either — so nothing stops
  bad data at any layer.
- **Confirmed:** same test as 1.3 — negative amounts and invalid types both persist.

### 3.2 No real pagination
- **Where:** `src/routes/orders.ts`, `src/dal/orders-dal.ts`.
- **What's missing:** `limit` exists but there's no `offset`/cursor. Confirmed
  `?limit=5&offset=5` returns the identical page as `?limit=5` alone — the param is
  silently accepted and does nothing, which reads as "it works" when it doesn't.
- **Severity:** low today (80-order dataset), real once a merchant has thousands of orders.

### 3.3 Composite index missing
- **Where:** `src/db.ts` — `idx_orders_merchant`, `idx_orders_created` are separate
  single-column indexes, but the hot query filters on both `merchant_id` AND
  `created_at` together. A composite `(merchant_id, created_at)` index would serve
  that query far better at scale.

### 3.4 Test suite is minimal
- **Where:** `test/orders.test.ts` — 2 tests, both DAL happy-path only.
- **What's missing:** no coverage of routes, revenue math, metrics, auth, or error
  paths — meaning 1.1 through 1.5 above all currently ship with zero regression
  protection.

### 3.5 No CI
- No `.github/workflows` or equivalent — nothing runs tests/typecheck automatically
  on a change.

### 3.6 Docs are stale/incomplete
- `docs/architecture.md` is a self-described draft. `docs/api.md` has two endpoints
  marked "TODO: document fields", doesn't mention `total_amount` is in cents, and
  doesn't document any error response shapes.

---

## 4. Currently proposed for fixing (discussion only — no code changed yet)

Shortlist, chosen for severity + fit with what the challenge evaluates:

1. §1.1 — Revenue/metrics refund + type-filter bug
2. §1.2 — Partial date-range silently ignored
3. §1.3 + §1.4 + §3.1 — Input validation across order creation/listing, backed by DB constraints
4. §2.1 — `metrics.ts` DAL bypass / duplicate connection

Deferred (not being fixed in this pass, reasons noted): §2.2 (documented placeholder,
real fix is out of scope), §2.3 (no live bug yet), §3.2 (better tackled alongside
the feature work), §3.3/§3.4/§3.5/§3.6 (ongoing/lower priority, revisit after the four above).

Fix proposals for the four are being discussed in conversation before anything is written.
