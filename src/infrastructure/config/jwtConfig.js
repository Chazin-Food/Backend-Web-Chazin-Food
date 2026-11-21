const crypto = require('crypto');

const KNOWN_WEAK_SECRETS = new Set([
  'secret123',
  'chazin_food_secret_key_2026',
  'secret',
  'changeme',
  '123456',
  'jwt_secret'
]);

const MIN_SECRET_LENGTH = 32;
let ephemeralDevSecret = null;
let warnedMissingSecret = false;

/**
 * Devuelve el secreto JWT configurado.
 * - En producción: exige JWT_SECRET >= 32 caracteres y rechaza secretos débiles/conocidos (fallo cerrado).
 * - En desarrollo/pruebas sin JWT_SECRET: genera un secreto aleatorio efímero por proceso (nunca un literal predecible).
 */
function getJwtSecret() {
  const raw = String(process.env.JWT_SECRET || '').trim();
  const isProd = process.env.NODE_ENV === 'production';

  if (raw && raw.length >= MIN_SECRET_LENGTH && !KNOWN_WEAK_SECRETS.has(raw.toLowerCase())) {
    return raw;
  }

  if (isProd) {
    throw new Error(
      '[SEGURIDAD CRÍTICA] JWT_SECRET es obligatorio en producción, debe tener al menos 32 caracteres aleatorios y no puede ser una clave por defecto.'
    );
  }

  if (!ephemeralDevSecret) {
    ephemeralDevSecret = crypto.randomBytes(48).toString('hex');
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      '⚠️ [SEGURIDAD] JWT_SECRET ausente o débil (<32 caracteres) en entorno no productivo. Usando secreto efímero aleatorio en memoria. Define JWT_SECRET en .env.'
    );
  }
  return ephemeralDevSecret;
}

/**
 * Valida la configuración JWT al arrancar el servidor.
 */
function assertJwtConfigOnBoot() {
  return getJwtSecret();
}

// ── Almacén acotado en memoria para revocación de JWT al cerrar sesión o cambiar contraseña ──
const MAX_REVOKED_TOKENS = 5000;
const revokedTokens = new Map(); // tokenHash -> expiresAtMs
const userRevokedBefore = new Map(); // String(userId) -> timestampMs

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function sweepExpiredRevocations() {
  const now = Date.now();
  for (const [k, expMs] of revokedTokens.entries()) {
    if (expMs <= now) {
      revokedTokens.delete(k);
    }
  }
}

const sweepTimer = setInterval(sweepExpiredRevocations, 5 * 60 * 1000);
if (typeof sweepTimer.unref === 'function') {
  sweepTimer.unref();
}

function revokeToken(token, decoded = null) {
  if (!token) return;
  sweepExpiredRevocations();
  if (revokedTokens.size >= MAX_REVOKED_TOKENS) {
    const oldest = revokedTokens.keys().next().value;
    if (oldest) revokedTokens.delete(oldest);
  }
  const expMs = decoded?.exp ? Number(decoded.exp) * 1000 : Date.now() + 24 * 60 * 60 * 1000;
  revokedTokens.set(hashToken(token), expMs);
}

function revokeAllUserTokens(userId) {
  if (userId === undefined || userId === null) return;
  userRevokedBefore.set(String(userId), Date.now());
}

function isTokenRevoked(token, decoded = null) {
  if (!token) return true;
  const h = hashToken(token);
  const expMs = revokedTokens.get(h);
  if (expMs && expMs > Date.now()) {
    return true;
  }
  if (decoded && decoded.id !== undefined && decoded.iat) {
    const revokedAt = userRevokedBefore.get(String(decoded.id));
    if (revokedAt && Number(decoded.iat) * 1000 < revokedAt) {
      return true;
    }
  }
  return false;
}

module.exports = {
  getJwtSecret,
  assertJwtConfigOnBoot,
  revokeToken,
  revokeAllUserTokens,
  isTokenRevoked,
  JWT_VERIFY_OPTIONS: Object.freeze({ algorithms: ['HS256'] }),
  JWT_SESSION_TTL: process.env.JWT_EXPIRES_IN || '24h'
};
