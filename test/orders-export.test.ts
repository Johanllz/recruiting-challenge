if (!process.env.DB_PATH) process.env.DB_PATH = ':memory:';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import express from 'express';
import { initSchema, db } from '../src/db.js';
import { authMiddleware } from '../src/auth.js';
import { ordersRouter } from '../src/routes/orders.js';

let testCounter = 0;

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/orders', authMiddleware, ordersRouter);
  return app;
}

async function fetchApp(app: express.Application, path: string, opts: { merchantId?: string; method?: string } = {}): Promise<{ status: number; body: string; text: string }> {
  return new Promise((resolve) => {
    const server = createServer(app);
    server.listen(0, () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') throw new Error('unexpected address');
      const port = addr.port;
      const url = `http://localhost:${port}${path}`;
      const headers: Record<string, string> = {};
      if (opts.merchantId) headers['X-Merchant-Id'] = opts.merchantId;

      const req = httpRequest(url, { method: opts.method ?? 'GET', headers }, (res: any) => {
        let body = '';
        res.on('data', (chunk: Buffer) => (body += chunk.toString()));
        res.on('end', () => {
          server.close();
          resolve({ status: res.statusCode, body, text: body });
        });
      });
      req.end();
    });
  });
}

test('CSV export: missing from/to returns 400', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export', { merchantId });
  assert.equal(res.status, 400);
  assert.match(res.body, /missing_date_range/);
});

test('CSV export: unknown merchant returns 401', async () => {
  initSchema();
  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2026-08-01&to=2026-08-15', { merchantId: 'm_unknown_999' });
  assert.equal(res.status, 401);
});

test('CSV export: valid range returns CSV with correct header and BOM', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  const orderId = `o_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  db.prepare(
    `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, merchantId, 'user@example.com', 5000, 'sale', 'completed');

  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2000-01-01&to=2100-01-01', { merchantId });
  assert.equal(res.status, 200);
  assert.match(res.text, /order_id,created_at,customer_email,type,status,amount_usd/);
  assert.match(res.text, /user@example.com/);
});

test('CSV export: refunds show as negative', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  const orderId = `o_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  db.prepare(
    `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, merchantId, 'user@example.com', 5000, 'refund', 'completed');

  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2000-01-01&to=2100-01-01', { merchantId });
  assert.equal(res.status, 200);
  assert.match(res.text, /-50\.00/);
});

test('CSV export: escapes commas in email', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  const orderId = `o_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  db.prepare(
    `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, merchantId, 'first,last@example.com', 5000, 'sale', 'completed');

  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2000-01-01&to=2100-01-01', { merchantId });
  assert.equal(res.status, 200);
  assert.match(res.text, /"first,last@example.com"/);
});

test('CSV export: escapes quotes in email', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  const orderId = `o_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  db.prepare(
    `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, merchantId, 'user"quoted@example.com', 5000, 'sale', 'completed');

  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2000-01-01&to=2100-01-01', { merchantId });
  assert.equal(res.status, 200);
  assert.match(res.text, /"user""quoted@example.com"/);
});

test('CSV export: empty date range returns only header', async () => {
  initSchema();
  testCounter++;
  const merchantId = `m_test_${testCounter}`;
  const orderId = `o_test_${testCounter}`;
  db.prepare(`INSERT OR IGNORE INTO merchants (id, name) VALUES (?, 'Test')`).run(merchantId);
  db.prepare(
    `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, merchantId, 'user@example.com', 5000, 'sale', 'completed');

  const app = createTestApp();
  const res = await fetchApp(app, '/api/orders/export?from=2099-01-01&to=2099-12-31', { merchantId });
  assert.equal(res.status, 200);
  const lines = res.text.split('\r\n').filter((l: string) => l);
  assert.equal(lines.length, 1);
  assert.match(res.text, /order_id,created_at/);
});
