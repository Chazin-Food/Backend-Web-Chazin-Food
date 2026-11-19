const express = require('express');
const router = express.Router();
const { getVentas, getVentasStats, getVentaById, createVenta, updateEstadoVenta, updateTiempoEntregaVenta, cancelarVenta, aprobarPagoVenta } = require('../controllers/ventaController');
const { protect, optionalProtect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

// Aísla la caché entre clientes (solo ven sus propios pedidos) y staff administrativo
const cacheVentasScoped = cacheResponse('ventas', {
  ttlMs: 12000,
  cacheControl: 'private, max-age=8',
  keyResolver: (req) => {
    const rol = String(req.user?.rol || '').toLowerCase().trim();
    if (rol === 'cliente') {
      const uid = req.user?.idUsuario || req.user?.id;
      return uid ? `cliente:${uid}` : false;
    }
    return 'staff';
  }
});
const cacheVentasStats = cacheResponse('ventas', { ttlMs: 15000, cacheControl: 'private, max-age=10' });

router.route('/')
  .get(protect, cacheVentasScoped, getVentas)
  .post(optionalProtect, createVenta);

router.get('/stats', protect, requirePrivilege(['Gestión de Ventas', 'Dashboard'], 'Ver'), cacheVentasStats, getVentasStats);

router.route('/:id')
  .get(protect, getVentaById);

router.put('/:id/estado', protect, requirePrivilege(['Gestión de Ventas', 'Gestión de Producción'], 'Editar'), updateEstadoVenta);
router.put('/:id/aprobar-pago', protect, requirePrivilege('Gestión de Ventas', 'Editar'), aprobarPagoVenta);
router.put('/:id/tiempo-entrega', protect, requirePrivilege(['Gestión de Ventas', 'Gestión de Producción'], 'Editar'), updateTiempoEntregaVenta);
router.put('/:id/cancelar', protect, cancelarVenta);

module.exports = router;
