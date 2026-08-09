import { db } from '../db.js';

export interface OrderRow {
  id: string;
  merchant_id: string;
  customer_email: string;
  total_amount: number;
  type: 'sale' | 'refund';
  status: string;
  created_at: string;
}

/**
 * Data-access layer for orders. All order queries should go through here.
 *
 * - centralized place for query patterns
 * - the place to add auditing, caching, tenancy filters
 * - the seam for swapping the underlying store
 */
export const ordersDal = {
  listByMerchant(merchantId: string, opts: { from?: string; to?: string; limit?: number } = {}): OrderRow[] {
    const limit = opts.limit ?? 100;
    const conditions = ['merchant_id = ?'];
    const params: Array<string | number> = [merchantId];
    if (opts.from) {
      conditions.push('created_at >= ?');
      params.push(opts.from);
    }
    if (opts.to) {
      conditions.push('created_at < ?');
      params.push(opts.to);
    }
    params.push(limit);
    return db
      .prepare(
        `SELECT * FROM orders WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC LIMIT ?`,
      )
      .all(...params) as OrderRow[];
  },

  getById(id: string): OrderRow | undefined {
    return db.prepare(`SELECT * FROM orders WHERE id = ?`).get(id) as OrderRow | undefined;
  },

  create(order: Omit<OrderRow, 'created_at'>): OrderRow {
    db.prepare(
      `INSERT INTO orders (id, merchant_id, customer_email, total_amount, type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(order.id, order.merchant_id, order.customer_email, order.total_amount, order.type, order.status);
    return this.getById(order.id)!;
  },

  /**
   * Net revenue over a date range for a merchant: sales add, refunds subtract.
   * Used by the revenue endpoint.
   */
  sumAmountByMerchant(merchantId: string, from: string, to: string): number {
    const row = db
      .prepare(
        `SELECT COALESCE(SUM(
           CASE
             WHEN type = 'sale' THEN total_amount
             WHEN type = 'refund' THEN -total_amount
             ELSE 0
           END
         ), 0) AS total
         FROM orders
         WHERE merchant_id = ? AND created_at >= ? AND created_at < ?`,
      )
      .get(merchantId, from, to) as { total: number };
    return row.total;
  },
};
