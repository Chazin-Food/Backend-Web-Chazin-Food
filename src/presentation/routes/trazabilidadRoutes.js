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

router.use(protect);

router.route('/')
  .get(cacheTrazabilidad, getMovimientos)
  .post(createMovimiento);

router.get('/unread-count', cacheTrazabilidad, getUnreadCount);
router.put('/read-all', markAllAsRead);
router.delete('/clear', requirePrivilege('Insumos', 'Eliminar'), clearAll);

module.exports = router;

