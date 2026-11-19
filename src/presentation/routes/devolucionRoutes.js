const express = require('express');
const router = express.Router();
const {
  getDevoluciones,
  getDevolucionesStats,
  getPoliticas,
  checkVentaElegibilidad,
  getMisDevoluciones,
  getDevolucionById,
  createDevolucion,
  updateEstadoDevolucion
} = require('../controllers/devolucionController');
const { protect, optionalProtect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheDevoluciones = cacheResponse('devoluciones', { ttlMs: 15000, cacheControl: 'private, max-age=10' });
const cachePoliticas = cacheResponse('devoluciones', { ttlMs: 60000, cacheControl: 'public, max-age=30, stale-while-revalidate=60' });

// Consulta pública de políticas de devolución
router.get('/politicas', cachePoliticas, getPoliticas);

// Verificación de elegibilidad de una venta (para modal de devolución de cliente o cajero)
router.get('/elegibilidad/:idVenta', optionalProtect, checkVentaElegibilidad);

// Rutas autenticadas
router.use(protect);

// Devoluciones del usuario cliente en sesión
router.get('/mis-devoluciones', getMisDevoluciones);

// Estadísticas para tarjetas KPI del módulo administrativo
router.get('/stats', requirePrivilege(['Devoluciones', 'Gestión de Ventas', 'Ventas', 'Dashboard'], 'Ver'), cacheDevoluciones, getDevolucionesStats);

// Listar devoluciones y registrar nueva solicitud
router.route('/')
  .get(requirePrivilege(['Devoluciones', 'Gestión de Ventas', 'Ventas'], 'Ver'), cacheDevoluciones, getDevoluciones)
  .post(createDevolucion); // Clientes y Administradores pueden crear solicitudes de devolución

// Detalle de devolución
router.route('/:id')
  .get(requirePrivilege(['Devoluciones', 'Gestión de Ventas', 'Ventas'], 'Ver'), getDevolucionById);

// Gestión y resolución de devolución (Aprobar, Rechazar, Completar)
router.put('/:id/estado', requirePrivilege(['Devoluciones', 'Gestión de Ventas', 'Ventas'], 'Editar'), updateEstadoDevolucion);

module.exports = router;

