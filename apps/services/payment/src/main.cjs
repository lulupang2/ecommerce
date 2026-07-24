const { eq } = require('drizzle-orm');
const { database } = require('../../shared/db');
const { payments } = require('../../shared/schema');
const { server, listen } = require('../../shared/http');
const { publish, subscribe, registerReliability } = require('../../shared/bus');
const { requireAuth, requireRole, requireInternal, requirePermission } = require('../../shared/auth');
const { idempotency } = require('../../platform/idempotency');
const { validateDto } = require('../../platform/validation');
const { PaymentConfirmDto, RefundDto } = require('../../contracts/dtos');

const db = database('payments');
const app = server('payment');

async function init() {
  await db.wait();
  await registerReliability('payment', db);
  await db.query(`DO $$ BEGIN CREATE TYPE payment_status AS ENUM ('pending','approved','partially_refunded','refunded','cancelled','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await db.query(`CREATE TABLE IF NOT EXISTS payments(id UUID PRIMARY KEY,order_id UUID UNIQUE NOT NULL,status payment_status NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),refunded_amount INTEGER NOT NULL DEFAULT 0 CHECK(refunded_amount>=0),provider TEXT NOT NULL,payment_key TEXT,approved_at TIMESTAMPTZ)`);
  await db.query(`CREATE TABLE IF NOT EXISTS payment_transactions(id UUID PRIMARY KEY,payment_id UUID NOT NULL,order_id UUID NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,amount INTEGER NOT NULL CHECK(amount>=0),reason TEXT,created_at TIMESTAMPTZ DEFAULT now())`);
  await subscribe('payment', ['order.created'], async event => { if (!process.env.TOSS_SECRET_KEY) await approve(event.payload, event.payload.paymentMethod || 'card', `mock_${event.payload.orderId}`); });
}
async function approve(payload, provider, paymentKey) {
  const existing = await db.query(`SELECT * FROM payments WHERE order_id=$1`, [payload.orderId]);
  if (existing.rows[0]?.status === 'approved') return existing.rows[0];
  const paymentId = existing.rows[0]?.id || crypto.randomUUID();
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`INSERT INTO payments(id,order_id,status,amount,provider,payment_key,approved_at) VALUES($1,$2,'approved',$3,$4,$5,now()) ON CONFLICT(order_id) DO UPDATE SET status='approved',amount=EXCLUDED.amount,provider=EXCLUDED.provider,payment_key=EXCLUDED.payment_key,approved_at=now()`, [paymentId, payload.orderId, Number(payload.totalAmount), provider, paymentKey]);
    await client.query(`INSERT INTO payment_transactions(id,payment_id,order_id,type,status,amount) VALUES($1,$2,$3,'approval','completed',$4)`, [crypto.randomUUID(), paymentId, payload.orderId, Number(payload.totalAmount)]);
    await publish('payment.approved', { ...payload, paymentId, provider }, { client });
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
  return { id: paymentId, status: 'approved' };
}

app.post('/payments/confirm', validateDto(PaymentConfirmDto), idempotency(db, 'payment.confirm'), async (req, res) => {
  const { paymentKey, orderId, amount, order } = req.body || {};
  if (!orderId || !Number.isInteger(Number(amount)) || Number(amount) < 0) return res.status(400).json({ code: 'INVALID_PAYMENT' });
  try {
    if (!process.env.TOSS_SECRET_KEY) {
      const provider=req.body.provider||req.body.method||'card';
      await approve({ ...order, orderId, totalAmount: Number(amount) }, provider, paymentKey || `mock_${orderId}`);
      return res.json({ status: 'approved', provider, orderId });
    }
    const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', { method: 'POST', headers: { authorization: `Basic ${Buffer.from(`${process.env.TOSS_SECRET_KEY}:`).toString('base64')}`, 'content-type': 'application/json' }, body: JSON.stringify({ paymentKey, orderId, amount: Number(amount) }) });
    const data = await response.json();
    if (!response.ok) return res.status(response.status).json({ code: data.code || 'PAYMENT_FAILED', message: data.message });
    await approve({ ...order, orderId, totalAmount: Number(amount) }, 'toss', paymentKey);
    res.json({ status: 'approved', provider: 'toss', orderId, paymentKey });
  } catch (error) { res.status(502).json({ code: 'PAYMENT_PROVIDER_ERROR', message: error.message }); }
});
app.post('/payments/:orderId/refunds', requireAuth, requireRole('admin'), requirePermission('payments.refund'), validateDto(RefundDto), idempotency(db, 'payment.refund'), async (req, res) => {
  const payment = await db.query(`SELECT * FROM payments WHERE order_id=$1`, [req.params.orderId]);
  if (!payment.rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const amount = Number(req.body.amount);
  const remaining = Number(payment.rows[0].amount) - Number(payment.rows[0].refunded_amount);
  if (!Number.isInteger(amount) || amount <= 0 || amount > remaining) return res.status(400).json({ code: 'INVALID_REFUND_AMOUNT', refundableAmount: remaining });
  const refunded = Number(payment.rows[0].refunded_amount) + amount;
  const status = refunded === Number(payment.rows[0].amount) ? 'refunded' : 'partially_refunded';
  await db.query(`UPDATE payments SET refunded_amount=$2,status=$3 WHERE order_id=$1`, [req.params.orderId, refunded, status]);
  await db.query(`INSERT INTO payment_transactions(id,payment_id,order_id,type,status,amount,reason) VALUES($1,$2,$3,'refund','completed',$4,$5)`, [crypto.randomUUID(), payment.rows[0].id, req.params.orderId, amount, req.body.reason || '관리자 환불']);
  await publish('payment.refunded', { orderId: req.params.orderId, paymentId: payment.rows[0].id, refundAmount: amount, refundedAmount: refunded, status, actorId: req.user.sub, reason: req.body.reason || '관리자 환불' });
  res.status(201).json({ orderId: req.params.orderId, refundAmount: amount, refundedAmount: refunded, status });
});
app.get('/payments/:orderId', async (req, res) => {
  const rows = await db.orm.select().from(payments).where(eq(payments.orderId, req.params.orderId)).limit(1);
  if (!rows[0]) return res.status(404).json({ code: 'NOT_FOUND' });
  const transactions = await db.query(`SELECT * FROM payment_transactions WHERE order_id=$1 ORDER BY created_at`, [req.params.orderId]);
  res.json({ ...rows[0], transactions: transactions.rows });
});
app.get('/internal/payments', requireInternal, async (_, res) => { const result = await db.query(`SELECT * FROM payments ORDER BY approved_at DESC NULLS LAST`); res.json({ items: result.rows }); });

init().then(() => listen(app, 'payment')).catch(error => { console.error(error); process.exitCode = 1; });
