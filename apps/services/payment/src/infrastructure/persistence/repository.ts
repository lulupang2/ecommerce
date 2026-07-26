import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

const crypto = require('node:crypto') as typeof import('node:crypto');
const { database } = require('@techzone/database/db') as { database(service: string): any };
import { payments } from './schema';
const { publish, registerReliability } = require('@techzone/messaging/bus') as {
  publish(event: string, payload: Record<string, unknown>, options?: Record<string, unknown>): Promise<void>;
  registerReliability(service: string, database: any): Promise<void>;
};

@Injectable()
export class PaymentRepository {
  readonly owner = 'payment';
  readonly db = database('payments');

  async initialize(): Promise<void> {
    await this.db.wait();
    await registerReliability('payment', this.db);
  }

  async approve(payload: any, provider: string, paymentKey: string): Promise<any> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [payload.orderId]);
      const existing = await client.query(
        `SELECT * FROM payments WHERE order_id=$1 FOR UPDATE`,
        [payload.orderId],
      );
      if (
        existing.rows[0]
        && ['approved', 'partially_refunded', 'refunded'].includes(existing.rows[0].status)
      ) {
        await client.query('COMMIT');
        return existing.rows[0];
      }
      const paymentId = existing.rows[0]?.id || crypto.randomUUID();
      await client.query(
        `INSERT INTO payments(id,order_id,status,amount,provider,payment_key,approved_at)
         VALUES($1,$2,'approved',$3,$4,$5,now())
         ON CONFLICT(order_id) DO UPDATE SET
           status='approved',amount=EXCLUDED.amount,provider=EXCLUDED.provider,
           payment_key=EXCLUDED.payment_key,approved_at=now()`,
        [paymentId, payload.orderId, Number(payload.totalAmount), provider, paymentKey],
      );
      await client.query(
        `INSERT INTO payment_transactions(id,payment_id,order_id,type,status,amount)
         VALUES($1,$2,$3,'approval','completed',$4)`,
        [crypto.randomUUID(), paymentId, payload.orderId, Number(payload.totalAmount)],
      );
      await publish('payment.approved', { ...payload, paymentId, provider }, { client });
      await client.query('COMMIT');
      return { id: paymentId, status: 'approved' };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async refund(orderId: string, amount: number, reason: string, actorId: string): Promise<any | null> {
    const client = await this.db.pool.connect();
    try {
      await client.query('BEGIN');
      const payment = await client.query(
        `SELECT * FROM payments WHERE order_id=$1 FOR UPDATE`,
        [orderId],
      );
      if (!payment.rows[0]) {
        await client.query('COMMIT');
        return null;
      }
      const remaining = Number(payment.rows[0].amount)
        - Number(payment.rows[0].refunded_amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        await client.query('COMMIT');
        return { invalidAmount: true, refundableAmount: remaining };
      }
      const refundedAmount = Number(payment.rows[0].refunded_amount) + amount;
      const status = refundedAmount === Number(payment.rows[0].amount)
        ? 'refunded'
        : 'partially_refunded';
      await client.query(
        `UPDATE payments SET refunded_amount=$2,status=$3 WHERE order_id=$1`,
        [orderId, refundedAmount, status],
      );
      await client.query(
        `INSERT INTO payment_transactions(
          id,payment_id,order_id,type,status,amount,reason
        ) VALUES($1,$2,$3,'refund','completed',$4,$5)`,
        [crypto.randomUUID(), payment.rows[0].id, orderId, amount, reason],
      );
      await publish('payment.refunded', {
        orderId,
        paymentId: payment.rows[0].id,
        refundAmount: amount,
        refundedAmount,
        status,
        actorId,
        reason,
      }, { client });
      await client.query('COMMIT');
      return { orderId, refundAmount: amount, refundedAmount, status };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async refundCancelledOrder(orderId: string, reason: string): Promise<void> {
    const payment = await this.db.query(
      `SELECT amount,refunded_amount,status FROM payments WHERE order_id=$1`,
      [orderId],
    );
    if (!payment.rows[0]) return;
    const remaining = Number(payment.rows[0].amount)
      - Number(payment.rows[0].refunded_amount);
    if (remaining <= 0) return;
    await this.refund(orderId, remaining, reason, 'system');
  }

  async detail(orderId: string): Promise<any | null> {
    const rows = await this.db.orm
      .select()
      .from(payments)
      .where(eq(payments.orderId, orderId))
      .limit(1);
    if (!rows[0]) return null;
    const transactions = await this.db.query(
      `SELECT * FROM payment_transactions WHERE order_id=$1 ORDER BY created_at`,
      [orderId],
    );
    return { ...rows[0], transactions: transactions.rows };
  }

  async all(): Promise<any[]> {
    const result = await this.db.query(`SELECT * FROM payments ORDER BY approved_at DESC NULLS LAST`);
    return result.rows;
  }
}
