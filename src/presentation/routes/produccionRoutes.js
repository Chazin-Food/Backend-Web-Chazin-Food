const express = require('express');
const router = express.Router();
const { getOrdenes, createOrden, updateEstadoOrden, deleteOrden } = require('../controllers/produccionController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheProduccion = cacheResponse('produccion', { ttlMs: 8000, cacheControl: 'private, max-age=5' });

router.use(protect);

// Ítem 114: Las órdenes de producción se generan exclusivamente desde ventas aprobadas
router.route('/')
  .get(requirePrivilege(['Gestión de Producción', 'Gestión de Ventas'], 'Ver'), cacheProduccion, getOrdenes)
  .post(requirePrivilege('Gestión de Producción', 'Crear'), createOrden);

router.route('/:id')
  .delete(requirePrivilege('Gestión de Producción', 'Eliminar'), deleteOrden);

router.put('/:id/estado', requirePrivilege('Gestión de Producción', 'Editar'), updateEstadoOrden);

module.exports = router;
