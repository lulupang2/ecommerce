const crypto = require('crypto');

async function ensureTable(db) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      scope TEXT NOT NULL,
      idempotency_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'processing',
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL DEFAULT now()+interval '24 hours',
      PRIMARY KEY(scope,idempotency_key)
    )
  `);
}

function hashRequest(req) {
  return crypto.createHash('sha256').update(JSON.stringify(req.body || {})).digest('hex');
}

function idempotency(db, name) {
  ensureTable(db).catch(() => {});
  return async (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (key.length > 128) return res.status(400).json({ code: 'INVALID_IDEMPOTENCY_KEY', message: 'Idempotency-Key는 128자 이하여야 합니다.' });
    const actor = req.user?.sub || req.body?.userId || 'anonymous';
    const scope = `${name}:${req.method}:${req.path}:${actor}`;
    const requestHash = hashRequest(req);
    try {
      const inserted = await db.query(
        `INSERT INTO idempotency_keys(scope,idempotency_key,request_hash) VALUES($1,$2,$3)
         ON CONFLICT(scope,idempotency_key) DO NOTHING RETURNING idempotency_key`,
        [scope, key, requestHash],
      );
      if (!inserted.rowCount) {
        const existing = await db.query(
          `SELECT * FROM idempotency_keys WHERE scope=$1 AND idempotency_key=$2`,
          [scope, key],
        );
        const record = existing.rows[0];
        if (record.request_hash !== requestHash) {
          return res.status(409).json({ code: 'IDEMPOTENCY_KEY_REUSED', message: '같은 키를 다른 요청에 사용할 수 없습니다.' });
        }
        if (record.status === 'completed') {
          res.setHeader('x-idempotency-replayed', 'true');
          return res.status(record.response_status).json(record.response_body);
        }
        return res.status(409).json({ code: 'REQUEST_IN_PROGRESS', message: '동일한 요청이 처리 중입니다.' });
      }
      const originalJson = res.json.bind(res);
      res.json = body => {
        const responseStatus = res.statusCode;
        db.query(
          `UPDATE idempotency_keys SET status=$3,response_status=$4,response_body=$5
           WHERE scope=$1 AND idempotency_key=$2`,
          [scope, key, responseStatus >= 500 ? 'failed' : 'completed', responseStatus, body],
        ).catch(() => {});
        return originalJson(body);
      };
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = { ensureIdempotencyTable: ensureTable, idempotency };
