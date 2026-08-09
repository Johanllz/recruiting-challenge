# API reference

> Reflects actual current behavior of the code, including known quirks/limitations
> called out inline rather than glossed over.

All endpoints except `/api/health` require the `X-Merchant-Id` header, and all
monetary fields (`total_amount`, `revenue_cents`, `avg_order_value_cents`,
`total_spent`) are **integer cents**, not dollars.

## Auth

Every protected route runs the same check: `X-Merchant-Id` header must be present
and must match a real row in the `merchants` table.

| Condition | Response |
|---|---|
| Header missing entirely | `401 { "error": "missing_merchant_id" }` |
| Header present but not a known merchant | `401 { "error": "unknown_merchant" }` |

This confirms the ID belongs to a real merchant — it is **not** a credential check.
Anyone who knows or guesses a valid merchant ID (e.g. `m_acme`) has full read/write
access to that merchant's data. There is no password, token, or signature involved.

## `GET /api/health`

No auth required. Returns `{ "ok": true }`.

## `GET /api/orders`

List orders for the authenticated merchant, most recent first.

**Query params (all optional):**
- `from` — `created_at >= from`. Applies independently of `to`.
- `to` — `created_at < to` (exclusive). Applies independently of `from`.
- `limit` — max rows returned, default `100`.

If neither `from` nor `to` is given, returns the merchant's most recent orders
unfiltered.

**Known quirks:**
- Date comparison is a plain string comparison against the stored ISO timestamp,
  not a parsed-date comparison. A malformed value (`?from=banana`) will not error —
  it silently produces whatever a lexicographic string comparison happens to yield,
  which is usually an empty or nonsensical result rather than a clean rejection.
- `to` is exclusive and compares against the full timestamp, so `?to=2026-08-09`
  excludes orders that happened *on* 2026-08-09 (anything before midnight that day),
  which can be surprising if you expect the end date to be inclusive.
- `?limit=<non-numeric>` (e.g. `?limit=abc`) currently crashes the request and
  returns a generic `500 { "error": "internal_error" }` instead of a `400`.
- `?limit` has no matching `offset`/cursor — there is no real pagination yet. A
  second page cannot be requested; `limit` only truncates.

**Response:** `{ "orders": OrderRow[] }`

```
OrderRow = {
  id: string
  merchant_id: string
  customer_email: string
  total_amount: number   // cents
  type: 'sale' | 'refund' // not enforced — see POST below
  status: string
  created_at: string     // ISO 8601
}
```

## `GET /api/orders/:id`

Get a single order by ID, regardless of merchant (no merchant-scoping check on this
lookup beyond the standard auth header).

**Response:** `200 { "order": OrderRow }`, or `404 { "error": "not_found" }` if the ID
doesn't exist.

## `POST /api/orders`

Create an order for the authenticated merchant.

**Body:** `{ customer_email: string, total_amount: number, type?: 'sale' | 'refund' }`

- `type` defaults to `'sale'` if omitted.
- `status` is always set to `'completed'` — not settable by the caller.

**Validation is minimal:** only checks that `customer_email` is present and
`total_amount` is *a* number.
- `type` is **not** checked against `'sale' | 'refund'` — any string is accepted and
  stored as-is (e.g. `type: "scam"` succeeds). A row with an unrecognized type is
  silently excluded from revenue and metrics calculations (see below) rather than
  rejected at creation time.
- `total_amount` is **not** checked for being positive or an integer — negative or
  fractional-cent values are accepted.

**Response:** `201 { "order": OrderRow }`, or `400 { "error": "invalid_body" }` if
`customer_email` is missing or `total_amount` isn't a number.

## `GET /api/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD`

Total revenue for the authenticated merchant in `[from, to)`.

Unlike `/api/orders`, **both `from` and `to` are required** — missing either returns
`400 { "error": "missing_date_range", "detail": "from and to are required (YYYY-MM-DD)" }`.

Revenue is net of refunds: rows with `type: 'sale'` add, `type: 'refund'` subtract,
and any other `type` value is ignored (contributes 0).

**Response:**
```
{
  merchant_id: string
  from: string
  to: string
  revenue_cents: number   // net, sales minus refunds
  revenue: number         // revenue_cents / 100
}
```

## `GET /api/metrics/summary`

Summary stats for the authenticated merchant, no date range (all-time).

**Response:**
```
{
  merchant_id: string
  total_orders: number            // count of type='sale' rows only — refunds and
                                   // any other type are excluded from this count
  unique_customers: number        // distinct customer_email across ALL rows,
                                   // including refunds and unrecognized types
  avg_order_value_cents: number   // average total_amount over type='sale' rows only
}
```

Note the inconsistency: `unique_customers` counts distinct emails across every row
regardless of type, while `total_orders` and `avg_order_value_cents` only consider
sales. A customer who only has a refund on record still counts toward
`unique_customers` but not `total_orders`.

## `GET /api/metrics/top-customers?limit=N`

Top customers by net spend for the authenticated merchant, no date range.
`limit` defaults to `5` and has the same non-numeric-crash quirk as `/api/orders`'s
`limit`.

**Response:**
```
{
  customers: Array<{
    customer_email: string
    order_count: number   // count of type='sale' rows for this customer only
    total_spent: number   // cents; sales add, refunds subtract, other types ignored
  }>
}
```

`total_spent` can be negative if a customer's refunds exceed their sales (e.g.
duplicate or over-amount refunds) — this is not currently guarded against anywhere,
so a customer in that state will show a negative value and sort to the bottom of
the list.

## Error response shapes

Every error response is `{ "error": string }`, sometimes with an extra `detail`
field. Known `error` values in use today:

| `error` | Status | Where |
|---|---|---|
| `missing_merchant_id` | 401 | any protected route, header absent |
| `unknown_merchant` | 401 | any protected route, header doesn't match a real merchant |
| `not_found` | 404 | `GET /api/orders/:id`, unknown ID |
| `invalid_body` | 400 | `POST /api/orders`, missing/malformed fields |
| `missing_date_range` | 400 | `GET /api/revenue`, missing `from` or `to` |
| `internal_error` | 500 | uncaught exception (e.g. non-numeric `limit`) — generic, not actionable |
