const crypto = require('crypto');
const zlib = require('zlib');

const store = new Map();
const MAX_CACHE_ENTRIES = 40;
const MAX_CACHE_BYTES = 5 * 1024 * 1024; // 5 MB máximo total en RAM (seguro para heap V8 de ~252 MB en Render Free)
const MAX_ENTRY_BYTES = 1 * 1024 * 1024; // No cachear payloads individuales > 1 MB
let currentCacheBytes = 0;

function deleteCacheKey(key) {
  const entry = store.get(key);
  if (!entry) return;
  currentCacheBytes = Math.max(0, currentCacheBytes - (entry.sizeBytes || 0));
  store.delete(key);
}

function purgeExpiredEntries() {
  const now = Date.now();
  for (const [k, entry] of store.entries()) {
    if (entry.expiresAt <= now) {
      deleteCacheKey(k);
    }
  }
}

function pruneStoreIfNeeded(incomingBytes = 0) {
  purgeExpiredEntries();
  while (
    (store.size >= MAX_CACHE_ENTRIES || currentCacheBytes + incomingBytes > MAX_CACHE_BYTES) &&
    store.size > 0
  ) {
    const oldestKey = store.keys().next().value;
    if (!oldestKey) break;
    deleteCacheKey(oldestKey);
  }
}

// Limpieza periódica de entradas expiradas para mantener la RAM estable en Render
const cacheSweepTimer = setInterval(purgeExpiredEntries, 60000);
if (typeof cacheSweepTimer.unref === 'function') {
  cacheSweepTimer.unref();
}

function buildEtag(rawBuffer) {
  const hash = crypto.createHash('sha1').update(rawBuffer).digest('base64url').slice(0, 16);
  return `W/"${rawBuffer.length}-${hash}"`;
}

function storeEntry(namespace, key, payload, ttlMs) {
  const jsonString = JSON.stringify(payload);
  const raw = Buffer.from(jsonString, 'utf-8');
  if (raw.length > MAX_ENTRY_BYTES) {
    return null;
  }

  deleteCacheKey(key);
  pruneStoreIfNeeded(raw.length);

  const etag = buildEtag(raw);
  const entry = {
    namespace,
    raw,
    gzipped: null,
    sizeBytes: raw.length,
    etag,
    expiresAt: Date.now() + ttlMs
  };
  store.set(key, entry);
  currentCacheBytes += entry.sizeBytes;

  return entry;
}

/**
 * Middleware de caché en memoria con TTL corto, soporte ETag (304) y respuesta gzip precomputada.
 * Debe montarse DESPUÉS de middlewares de autenticación en rutas protegidas.
 */
function cacheResponse(namespace, { ttlMs = 30000, cacheControl = 'public, max-age=15, stale-while-revalidate=30' } = {}) {
  return (req, res, next) => {
    if (req.method !== 'GET' || req.query?.refresh === 'true' || req.headers['cache-control'] === 'no-cache') {
      return next();
    }

    const key = `${namespace}:${req.originalUrl}`;
    const existing = store.get(key);
    if (existing && existing.expiresAt > Date.now()) {
      if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
      }
      res.setHeader('ETag', existing.etag);
      res.vary('Accept-Encoding');
      res.setHeader('X-Cache', 'HIT');

      if (req.headers['if-none-match'] === existing.etag) {
        return res.status(304).end();
      }

      const acceptEncoding = req.headers['accept-encoding'] || '';
      if (acceptEncoding.includes('gzip') && existing.gzipped) {
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.setHeader('Content-Length', existing.gzipped.length);
        return res.status(200).send(existing.gzipped);
      }

      if (acceptEncoding.includes('gzip') && existing.raw.length > 1024) {
        return zlib.gzip(existing.raw, (err, compressed) => {
          if (res.headersSent) return;
          if (!err && compressed) {
            if (store.get(key) === existing && !existing.gzipped && currentCacheBytes + compressed.length <= MAX_CACHE_BYTES) {
              existing.gzipped = compressed;
              existing.sizeBytes += compressed.length;
              currentCacheBytes += compressed.length;
            }
            res.setHeader('Content-Encoding', 'gzip');
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.setHeader('Content-Length', compressed.length);
            return res.status(200).send(compressed);
          }
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', existing.raw.length);
          return res.status(200).send(existing.raw);
        });
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Length', existing.raw.length);
      return res.status(200).send(existing.raw);
    }

    if (existing) {
      deleteCacheKey(key);
    }

    const originalJson = res.json.bind(res);
    res.json = function (obj) {
      if (res.statusCode >= 200 && res.statusCode < 300 && obj !== undefined && !res.headersSent) {
        const saved = storeEntry(namespace, key, obj, ttlMs);
        if (saved) {
          if (cacheControl) {
            res.setHeader('Cache-Control', cacheControl);
          }
          res.setHeader('ETag', saved.etag);
          res.vary('Accept-Encoding');
          res.setHeader('X-Cache', 'MISS');

          // Enviar el buffer ya serializado UNA sola vez (evita doble JSON.stringify y doble gzip en memoria)
          const acceptEncoding = req.headers['accept-encoding'] || '';
          if (acceptEncoding.includes('gzip') && saved.raw.length > 1024) {
            return zlib.gzip(saved.raw, (err, compressed) => {
              if (res.headersSent) return;
              if (!err && compressed) {
                if (store.get(key) === saved && currentCacheBytes + compressed.length <= MAX_CACHE_BYTES) {
                  saved.gzipped = compressed;
                  saved.sizeBytes += compressed.length;
                  currentCacheBytes += compressed.length;
                }
                res.setHeader('Content-Encoding', 'gzip');
                res.setHeader('Content-Type', 'application/json; charset=utf-8');
                res.setHeader('Content-Length', compressed.length);
                return res.status(res.statusCode).send(compressed);
              }
              res.setHeader('Content-Type', 'application/json; charset=utf-8');
              res.setHeader('Content-Length', saved.raw.length);
              return res.status(res.statusCode).send(saved.raw);
            });
          }

          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', saved.raw.length);
          return res.status(res.statusCode).send(saved.raw);
        }
      }
      return originalJson(obj);
    };

    return next();
  };
}

function invalidateNamespaces(namespaces = []) {
  const targets = Array.isArray(namespaces) ? namespaces : [namespaces];
  if (targets.length === 0) return;

  if (targets.includes('*')) {
    store.clear();
    currentCacheBytes = 0;
    return;
  }

  for (const [key, entry] of store.entries()) {
    if (targets.includes(entry.namespace)) {
      deleteCacheKey(key);
    }
  }
}

const MUTATION_INVALIDATION_MAP = [
  { prefix: '/api/productos', namespaces: ['productos', 'categorias', 'eventos', 'fichas', 'dashboard', 'produccion'] },
  { prefix: '/api/products', namespaces: ['productos', 'categorias', 'eventos', 'fichas', 'dashboard', 'produccion'] },
  { prefix: '/api/categorias-producto', namespaces: ['categorias', 'productos'] },
  { prefix: '/api/categorias-productos', namespaces: ['categorias', 'productos'] },
  { prefix: '/api/categorias-insumo', namespaces: ['categorias-insumo', 'categories', 'insumos'] },
  { prefix: '/api/categorias-insumos', namespaces: ['categorias-insumo', 'categories', 'insumos'] },
  { prefix: '/api/categorias', namespaces: ['categorias', 'productos', 'categories'] },
  { prefix: '/api/categories', namespaces: ['categories', 'categorias', 'categorias-insumo'] },
  { prefix: '/api/roles', namespaces: ['roles'] },
  { prefix: '/api/usuarios', namespaces: ['roles', 'dashboard'] },
  { prefix: '/api/users', namespaces: ['roles', 'dashboard'] },
  { prefix: '/api/autenticacion', namespaces: ['roles', 'dashboard'] },
  { prefix: '/api/auth', namespaces: ['roles', 'dashboard'] },
  { prefix: '/api/adiciones', namespaces: ['adiciones', 'productos', 'insumos'] },
  { prefix: '/api/eventos', namespaces: ['eventos', 'productos', 'fichas', 'produccion'] },
  { prefix: '/api/fichas-tecnicas', namespaces: ['fichas', 'productos', 'produccion'] },
  { prefix: '/api/insumos-preparados', namespaces: ['fichas', 'productos', 'insumos'] },
  { prefix: '/api/insumos', namespaces: ['insumos', 'adiciones', 'productos', 'fichas', 'categorias-insumo', 'categories', 'dashboard'] },
  { prefix: '/api/compras', namespaces: ['insumos', 'adiciones', 'productos', 'dashboard'] },
  { prefix: '/api/ventas', namespaces: ['productos', 'adiciones', 'dashboard', 'produccion'] },
  { prefix: '/api/pedidos', namespaces: ['productos', 'adiciones', 'dashboard', 'produccion'] },
  { prefix: '/api/orders', namespaces: ['productos', 'adiciones', 'dashboard', 'produccion'] },
  { prefix: '/api/produccion', namespaces: ['productos', 'insumos', 'dashboard', 'produccion'] },
  { prefix: '/api/devoluciones', namespaces: ['productos', 'insumos', 'dashboard', 'produccion'] },
  { prefix: '/api/clientes', namespaces: ['dashboard'] },
  { prefix: '/api/empleados', namespaces: ['roles', 'dashboard'] },
  { prefix: '/api/resenas', namespaces: ['productos', 'dashboard'] },
  { prefix: '/api/wompi', namespaces: ['productos', 'adiciones', 'dashboard', 'produccion'] }
];

function cacheInvalidationMiddleware(req, res, next) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    return next();
  }

  res.on('finish', () => {
    if (res.statusCode >= 200 && res.statusCode < 400) {
      const path = (req.originalUrl || req.url || '').split('?')[0];
      const toInvalidate = new Set();
      for (const rule of MUTATION_INVALIDATION_MAP) {
        if (path.startsWith(rule.prefix)) {
          rule.namespaces.forEach((ns) => toInvalidate.add(ns));
        }
      }
      if (toInvalidate.size > 0) {
        invalidateNamespaces(Array.from(toInvalidate));
      }
    }
  });

  return next();
}

module.exports = {
  cacheResponse,
  invalidateNamespaces,
  cacheInvalidationMiddleware
};
