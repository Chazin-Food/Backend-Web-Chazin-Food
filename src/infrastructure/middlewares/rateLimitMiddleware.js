/**
 * Middleware ligero de Rate Limiting en memoria con ventana deslizante y tamaño acotado.
 * Diseñado sin dependencias externas adicionales y seguro para memoria en Render Free.
 */

const MAX_BUCKETS = 5000;

function extractClientIp(req) {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  keyPrefix = 'rl',
  message = 'Demasiados intentos. Por favor espera unos minutos antes de volver a intentarlo.'
} = {}) {
  const store = new Map();

  const sweep = () => {
    const now = Date.now();
    for (const [key, entry] of store.entries()) {
      if (entry.resetAt <= now) {
        store.delete(key);
      }
    }
  };

  const timer = setInterval(sweep, Math.min(windowMs, 5 * 60 * 1000));
  if (typeof timer.unref === 'function') {
    timer.unref();
  }

  return (req, res, next) => {
    const now = Date.now();
    const ip = extractClientIp(req);
    const key = `${keyPrefix}:${ip}`;

    let entry = store.get(key);
    if (!entry || entry.resetAt <= now) {
      if (store.size >= MAX_BUCKETS) {
        sweep();
        if (store.size >= MAX_BUCKETS) {
          const oldest = store.keys().next().value;
          if (oldest) store.delete(oldest);
        }
      }
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(remaining));
    res.setHeader('RateLimit-Reset', String(retryAfterSec));

    if (entry.count > max) {
      res.setHeader('Retry-After', String(retryAfterSec));
      return res.status(429).json({
        message,
        error: message,
        retryAfterSeconds: retryAfterSec
      });
    }

    return next();
  };
}

const authLoginLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyPrefix: 'auth-login',
  message: 'Demasiados intentos de inicio de sesión. Intenta nuevamente en 15 minutos.'
});

const authSensitiveLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 8,
  keyPrefix: 'auth-sensitive',
  message: 'Demasiadas solicitudes de seguridad. Espera unos minutos e inténtalo nuevamente.'
});

const authLookupLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyPrefix: 'auth-lookup',
  message: 'Has excedido el límite de verificaciones permitidas. Intenta más tarde.'
});

const paymentLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 20,
  keyPrefix: 'payment-api',
  message: 'Demasiadas solicitudes a la pasarela de pago. Intenta en unos minutos.'
});

module.exports = {
  createRateLimiter,
  authLoginLimiter,
  authSensitiveLimiter,
  authLookupLimiter,
  paymentLimiter
};
