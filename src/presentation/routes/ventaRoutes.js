const express = require('express');
const router = express.Router();
const {
  getVentas,
  getVentasStats,
  getVentaById,
  createVenta,
  updateEstadoVenta,
  updateTiempoEntregaVenta,
  cancelarVenta,
  aprobarPagoVenta,
  confirmarEntregaCliente
} = require('../controllers/ventaController');
const { protect, requirePrivilege, userHasPrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const STAFF_VENTAS_VIEW = ['Gestión de Ventas', 'Gestión de Producción', 'Dashboard'];

// Aísla la caché entre clientes (solo ven sus propios pedidos) y staff autorizado
const cacheVentasScoped = cacheResponse('ventas', {
  ttlMs: 12000,
  cacheControl: 'private, max-age=8',
  keyResolver: (req) => {
    if (userHasPrivilege(req.user, STAFF_VENTAS_VIEW, 'Ver')) {
      return 'staff';
    }
    const uid = req.user?.idUsuario || req.user?.id;
    return uid ? `cliente:${uid}` : false;
  }
});
const cacheVentasStats = cacheResponse('ventas', { ttlMs: 15000, cacheControl: 'private, max-age=10' });

router.route('/')
  .get(protect, cacheVentasScoped, getVentas)
  .post(protect, createVenta);

router.get('/stats', protect, requirePrivilege(['Gestión de Ventas', 'Dashboard'], 'Ver'), cacheVentasStats, getVentasStats);

router.route('/:id')
  .get(protect, getVentaById);

router.put('/:id/estado', protect, requirePrivilege(['Gestión de Ventas', 'Gestión de Producción'], 'Editar'), updateEstadoVenta);
router.put('/:id/aprobar-pago', protect, requirePrivilege('Gestión de Ventas', 'Editar'), aprobarPagoVenta);
router.put('/:id/tiempo-entrega', protect, requirePrivilege(['Gestión de Ventas', 'Gestión de Producción'], 'Editar'), updateTiempoEntregaVenta);
router.put('/:id/cancelar', protect, cancelarVenta);
router.put('/:id/confirmar-entrega', protect, confirmarEntregaCliente);

module.exports = router;
