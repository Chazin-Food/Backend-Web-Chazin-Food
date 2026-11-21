const express = require('express');
const router = express.Router();
const {
  getMovimientos,
  getUnreadCount,
  createMovimiento,
  markAllAsRead,
  clearAll
} = require('../controllers/trazabilidadController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheTrazabilidad = cacheResponse('trazabilidad', { ttlMs: 12000, cacheControl: 'private, max-age=8' });
const trazabilidadReadModules = ['Insumos', 'Gestión de Compras', 'Proveedores'];

router.use(protect);

router.route('/')
  .get(requirePrivilege(trazabilidadReadModules, 'Ver'), cacheTrazabilidad, getMovimientos)
  .post(requirePrivilege('Insumos', 'Editar'), createMovimiento);

router.get('/unread-count', requirePrivilege(trazabilidadReadModules, 'Ver'), cacheTrazabilidad, getUnreadCount);
router.put('/read-all', requirePrivilege(trazabilidadReadModules, 'Ver'), markAllAsRead);
router.delete('/clear', requirePrivilege('Insumos', 'Eliminar'), clearAll);

module.exports = router;
