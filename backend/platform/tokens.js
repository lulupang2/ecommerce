const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');

let signingKey;
let verificationCache;

function keyId(publicKey) {
  return crypto.createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('base64url').slice(0, 16);
}

function loadSigningKey() {
  if (signingKey) return signingKey;
  const encoded = process.env.AUTH_PRIVATE_KEY_BASE64;
  const privateKey = encoded
    ? crypto.createPrivateKey(Buffer.from(encoded, 'base64').toString('utf8'))
    : crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
  const publicKey = crypto.createPublicKey(privateKey);
  signingKey = { privateKey, publicKey, kid: process.env.AUTH_KEY_ID || keyId(publicKey) };
  if (!encoded) console.warn(JSON.stringify({ level: 'warn', service: 'auth', message: 'ephemeral_signing_key', detail: 'AUTH_PRIVATE_KEY_BASE64 is not configured' }));
  return signingKey;
}

function publicJwks() {
  const { publicKey, kid } = loadSigningKey();
  return { keys: [{ ...publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'RS256' }] };
}

function signAccessToken(claims, options = {}) {
  const { privateKey, kid } = loadSigningKey();
  return jwt.sign(claims, privateKey, {
    algorithm: 'RS256',
    keyid: kid,
    issuer: process.env.JWT_ISSUER || 'techzone-auth',
    audience: options.audience || 'techzone-api',
    expiresIn: options.expiresIn || '15m',
  });
}

async function loadVerificationKeys(force = false) {
  if (!force && verificationCache?.expiresAt > Date.now()) return verificationCache.keys;
  const url = process.env.AUTH_JWKS_URL || `${process.env.AUTH_URL || 'http://localhost:3001'}/.well-known/jwks.json`;
  const response = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!response.ok) throw new Error('JWKS_UNAVAILABLE');
  const payload = await response.json();
  const keys = new Map(payload.keys.map(jwk => [jwk.kid, crypto.createPublicKey({ key: jwk, format: 'jwk' })]));
  verificationCache = { keys, expiresAt: Date.now() + 5 * 60_000 };
  return keys;
}

async function verifyAccessToken(token, options = {}) {
  const header = jwt.decode(token, { complete: true })?.header;
  if (!header) throw new Error('INVALID_TOKEN');
  if (header.alg === 'HS256' && process.env.ALLOW_LEGACY_HS256 === '1') return jwt.verify(token, process.env.JWT_SECRET || 'canvas-dev-secret');
  if (header.alg !== 'RS256' || !header.kid) throw new Error('UNSUPPORTED_TOKEN');
  let keys = await loadVerificationKeys();
  let key = keys.get(header.kid);
  if (!key) {
    keys = await loadVerificationKeys(true);
    key = keys.get(header.kid);
  }
  if (!key) throw new Error('UNKNOWN_SIGNING_KEY');
  return jwt.verify(token, key, {
    algorithms: ['RS256'],
    issuer: process.env.JWT_ISSUER || 'techzone-auth',
    audience: options.audience || 'techzone-api',
  });
}

function accessCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60_000,
  };
}

function refreshCookieOptions() {
  return {
    ...accessCookieOptions(),
    path: '/api/auth',
    maxAge: 14 * 24 * 60 * 60_000,
  };
}

module.exports = { loadSigningKey, publicJwks, signAccessToken, verifyAccessToken, accessCookieOptions, refreshCookieOptions };
