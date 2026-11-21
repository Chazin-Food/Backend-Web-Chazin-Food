// Environment Configuration - Wompi Enabled
const dotenv = require('dotenv');
dotenv.config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const connectDB = require('./src/persistence/config/db');
const { assertJwtConfigOnBoot } = require('./src/infrastructure/config/jwtConfig');
const { errorHandler } = require('./src/infrastructure/middlewares/errorMiddleware');
const { swaggerUi, swaggerSpec } = require('./src/infrastructure/swagger/swagger');
const { cacheInvalidationMiddleware } = require('./src/infrastructure/utils/apiCache');

// Validar configuración de secreto JWT antes de aceptar tráfico (AUD-006 / VULN-001)
assertJwtConfigOnBoot();

const app = express();
const isProduction = process.env.NODE_ENV === 'production';

// Ocultar tecnología del servidor y confiar en 1 salto de proxy (Render / Cloudflare) para req.ip
app.disable('x-powered-by');
app.set('trust proxy', 1);

// ── Cabeceras de seguridad Helmet montadas ANTES de CORS/OPTIONS (AUD-019 / AUD-023) ──
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"]
      }
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
  })
);

// ── Configuración de CORS Explícita y Restrictiva (AUD-019 / VULN-010) ──
const envFrontendOrigins = String(process.env.FRONTEND_URL || '')
  .split(',')
  .map((o) => o.trim().replace(/\/+$/, ''))
  .filter(Boolean);

const allowedOrigins = new Set([
  'https://frontend-web-chazin-food.vercel.app',
  ...envFrontendOrigins,
  ...(!isProduction
    ? [
        'http://localhost:5173',
        'http://127.0.0.1:5173',
        'http://localhost:5174',
        'http://127.0.0.1:5174',
        'http://localhost:4173',
        'http://127.0.0.1:4173',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ]
    : [])
]);

const corsOptions = {
  origin: function (origin, callback) {
    // Permitir peticiones sin origen (webhooks, health checks o servidor a servidor)
    if (!origin) return callback(null, true);
    const normalized = String(origin).trim().replace(/\/+$/, '');
    const isLocalDev = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(normalized);
    if (allowedOrigins.has(normalized) || (!isProduction && isLocalDev)) {
      return callback(null, true);
    }
    const corsErr = new Error(`Origen CORS no autorizado: ${origin}`);
    corsErr.statusCode = 403;
    return callback(corsErr, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Middlewares
app.use(express.json({ limit: '5mb' }));

// Compresión gzip asíncrona para no bloquear el Event Loop (optimización Lighthouse y latencia p95)
const zlib = require('zlib');
app.use((req, res, next) => {
  const acceptEncoding = req.headers['accept-encoding'] || '';
  if (!acceptEncoding.includes('gzip')) return next();

  const originalJson = res.json;
  res.json = function (obj) {
    if (res.headersSent || res.getHeader('Content-Encoding')) {
      return originalJson.call(this, obj);
    }
    try {
      const jsonString = JSON.stringify(obj);
      if (jsonString.length > 1024) {
        return zlib.gzip(Buffer.from(jsonString, 'utf-8'), (err, compressed) => {
          if (err || !compressed || res.headersSent) {
            return originalJson.call(this, obj);
          }
          res.setHeader('Content-Encoding', 'gzip');
          res.vary('Accept-Encoding');
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Content-Length', compressed.length);
          return res.send(compressed);
        });
      }
    } catch (e) {}
    return originalJson.call(this, obj);
  };
  next();
});

// Invalidación automática de caché en memoria tras mutaciones exitosas
app.use(cacheInvalidationMiddleware);

if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Swagger UI deshabilitado en producción por seguridad (AUD-024 / VULN-009)
const exposeSwagger = !isProduction || process.env.ENABLE_SWAGGER === 'true';
if (exposeSwagger) {
  app.use(
    '/api-docs',
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' }
    }),
    swaggerUi.serve,
    swaggerUi.setup(swaggerSpec, {
      customCss: '.swagger-ui .topbar { background-color: #F05454; }',
      customSiteTitle: 'Chazin Food - Documentación API'
    })
  );
}

// API Routes (Presentation Layer)
app.use('/api/auth', require('./src/presentation/routes/authRoutes'));
app.use('/api/categories', require('./src/presentation/routes/categoryRoutes'));
app.use('/api/users', require('./src/presentation/routes/userRoutes'));
app.use('/api/products', require('./src/presentation/routes/productRoutes'));
app.use('/api/orders', require('./src/presentation/routes/ventaRoutes'));
app.use('/api/upload', require('./src/presentation/routes/uploadRoutes'));

// Rutas en Español
app.use('/api/autenticacion', require('./src/presentation/routes/authRoutes'));
app.use('/api/categorias', require('./src/presentation/routes/categoriaProductoRoutes'));
app.use('/api/usuarios', require('./src/presentation/routes/userRoutes'));
app.use('/api/productos', require('./src/presentation/routes/productRoutes'));
app.use('/api/pedidos', require('./src/presentation/routes/ventaRoutes'));
app.use('/api/roles', require('./src/presentation/routes/roleRoutes'));
app.use('/api/insumos', require('./src/presentation/routes/insumoRoutes'));
app.use('/api/categorias-insumo', require('./src/presentation/routes/categoriaInsumoRoutes'));
app.use('/api/categorias-insumos', require('./src/presentation/routes/categoriaInsumoRoutes'));
app.use('/api/insumos-preparados', require('./src/presentation/routes/insumoPreparadoRoutes'));
app.use('/api/proveedores', require('./src/presentation/routes/proveedorRoutes'));
app.use('/api/trazabilidad', require('./src/presentation/routes/trazabilidadRoutes'));
app.use('/api/clientes', require('./src/presentation/routes/clienteRoutes'));
app.use('/api/categorias-producto', require('./src/presentation/routes/categoriaProductoRoutes'));
app.use('/api/categorias-productos', require('./src/presentation/routes/categoriaProductoRoutes'));
app.use('/api/compras', require('./src/presentation/routes/compraRoutes'));
app.use('/api/ventas', require('./src/presentation/routes/ventaRoutes'));
app.use('/api/devoluciones', require('./src/presentation/routes/devolucionRoutes'));
app.use('/api/fichas-tecnicas', require('./src/presentation/routes/fichaTecnicaRoutes'));
app.use('/api/produccion', require('./src/presentation/routes/produccionRoutes'));
app.use('/api/empleados', require('./src/presentation/routes/empleadoRoutes'));
app.use('/api/dashboard', require('./src/presentation/routes/dashboardRoutes'));
app.use('/api/eventos', require('./src/presentation/routes/eventoRoutes'));
app.use('/api/adiciones', require('./src/presentation/routes/adicionRoutes'));
app.use('/api/resenas', require('./src/presentation/routes/resenaRoutes'));
app.use('/api/wompi', require('./src/presentation/routes/wompiRoutes'));

// Health Check Endpoints ligeros para Render y monitoreo keep-alive
const healthHandler = (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
};
app.get('/healthz', healthHandler);
app.get('/api/health', healthHandler);

// Root route
app.get('/', (req, res) => {
  if (exposeSwagger) {
    return res.redirect('/api-docs');
  }
  return res.status(200).json({ status: 'ok', service: 'Chazin Food API' });
});

// Error Handler Middleware
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
let server;

if (require.main === module) {
  server = app.listen(PORT, () => {
    console.log(`Servidor monolítico unificado escuchando en el puerto ${PORT} en modo ${process.env.NODE_ENV || 'development'}`);
    if (process.env.RUN_MIGRATIONS_ON_BOOT === 'true') {
      const { initializeDatabaseSchema } = require('./scripts/migrate');
      initializeDatabaseSchema().catch((err) => {
        console.error('Error al verificar esquemas en segundo plano:', err.message);
      });
    } else {
      connectDB().catch((err) => {
        console.error('Error conectando a MySQL en arranque:', err.message);
      });
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ El puerto ${PORT} ya está en uso. Cierra el proceso anterior o cambia el valor de PORT.`);
    } else {
      console.error('❌ Error al iniciar el servidor:', error.message);
    }
    process.exit(1);
  });
}

// Manejo de cierre limpio para evitar errores EADDRINUSE con nodemon
const handleShutdown = (signal) => {
  console.log(`Recibida señal ${signal}. Cerrando servidor en puerto ${PORT}...`);
  if (!server) process.exit(0);
  server.close(() => {
    console.log('Servidor HTTP cerrado correctamente.');
    process.exit(0);
  });
};

process.once('SIGUSR2', () => {
  if (!server) {
    process.kill(process.pid, 'SIGUSR2');
    return;
  }
  server.close(() => {
    process.kill(process.pid, 'SIGUSR2');
  });
});
process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('unhandledRejection', (reason) => {
  console.error('❌ Unhandled Promise Rejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err?.stack || err?.message || err);
});

module.exports = app;
