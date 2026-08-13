const BASE = 'http://localhost:3000';

async function raw(path, opts = {}) {
  const res = await fetch(BASE + path, opts);
  let body;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

async function api(path, merchant = 'm_acme', opts = {}) {
  return raw(path, { ...opts, headers: { 'X-Merchant-Id': merchant, ...(opts.headers || {}) } });
}

let failures = 0;
function check(label, condition, detail) {
  const mark = condition ? '✓ PASS' : '✗ FAIL';
  if (!condition) failures++;
  console.log(`  [${mark}] ${label}${detail ? ' → ' + detail : ''}`);
}

async function run() {
  console.log('\n================ VALIDATING FIXES ================');

  // --- Fix 1: date range filtering ---
  console.log('\n-- FIX 1: Partial date range filtering --');
  const onlyFrom = await api('/api/orders?from=2099-01-01');
  check('from=2099-01-01 (future) returns 0 orders', onlyFrom.body.orders.length === 0, `got ${onlyFrom.body.orders.length}`);

  const onlyTo = await api('/api/orders?to=2000-01-01');
  check('to=2000-01-01 (past) returns 0 orders', onlyTo.body.orders.length === 0, `got ${onlyTo.body.orders.length}`);

  const neither = await api('/api/orders');
  check('neither from nor to returns recent orders (unfiltered)', neither.body.orders.length > 0, `got ${neither.body.orders.length}`);

  // --- Fix 2: merchant validation ---
  console.log('\n-- FIX 2: Unknown merchant validation --');
  const ghostId = 'm_ghost_test_' + Date.now();
  const postUnknown = await raw('/api/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Merchant-Id': ghostId },
    body: JSON.stringify({ customer_email: 'x@y.com', total_amount: 100 }),
  });
  check('POST with unknown merchant → 401', postUnknown.status === 401, `status ${postUnknown.status}`);
  check('Unknown merchant error is "unknown_merchant"', postUnknown.body?.error === 'unknown_merchant', `got ${postUnknown.body?.error}`);

  const getUnknown = await raw('/api/orders', { headers: { 'X-Merchant-Id': ghostId } });
  check('GET with unknown merchant → 401', getUnknown.status === 401, `status ${getUnknown.status}`);

  const validAcme = await api('/api/orders?limit=1', 'm_acme');
  check('Known merchant m_acme still works', validAcme.status === 200, `status ${validAcme.status}`);

  // --- Fix 3: revenue/metrics refund netting ---
  console.log('\n-- FIX 3: Refund netting in revenue & metrics --');
  for (const merchant of ['m_acme', 'm_bistro']) {
    const all = await api('/api/orders?limit=200', merchant);
    const orders = all.body.orders;
    const sales = orders.filter(o => o.type === 'sale');
    const refunds = orders.filter(o => o.type === 'refund');
    const saleSum = sales.reduce((s, o) => s + o.total_amount, 0);
    const refundSum = refunds.reduce((s, o) => s + o.total_amount, 0);
    const expectedNet = saleSum - refundSum;

    const rev = await api('/api/revenue?from=2000-01-01&to=2100-01-01', merchant);
    check(`[${merchant}] revenue nets refunds`,
      rev.body.revenue_cents === expectedNet,
      `expected ${expectedNet}, got ${rev.body.revenue_cents}`);

    const summary = await api('/api/metrics/summary', merchant);
    check(`[${merchant}] total_orders excludes refunds`,
      summary.body.total_orders === sales.length,
      `expected ${sales.length}, got ${summary.body.total_orders}`);

    const expectedAvg = sales.length > 0 ? Math.round(saleSum / sales.length) : 0;
    check(`[${merchant}] avg_order_value excludes refunds`,
      summary.body.avg_order_value_cents === expectedAvg,
      `expected ${expectedAvg}, got ${summary.body.avg_order_value_cents}`);
  }

  console.log(`\n================ RESULT: ${failures === 0 ? '✓ ALL PASS' : `✗ ${failures} FAILURES`} ================\n`);
  process.exit(failures > 0 ? 1 : 0);
}

await run();
