const express = require('express');
const router = express.Router();
const { getCompras, getCompraById, createCompra, updateCompra, cancelarCompra } = require('../controllers/compraController');
const { protect, authorize, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheCompras = cacheResponse('compras', { ttlMs: 15000, cacheControl: 'private, max-age=10' });

router.use(protect);

router.route('/')
  .get(requirePrivilege(['Gestión de Compras', 'Dashboard'], 'Ver'), cacheCompras, getCompras)
  .post(requirePrivilege('Gestión de Compras', 'Crear'), createCompra);

router.route('/:id')
  .get(requirePrivilege(['Gestión de Compras', 'Dashboard'], 'Ver'), getCompraById)
  .put(requirePrivilege('Gestión de Compras', 'Editar'), updateCompra);

// Ficha SENA 3209616: solamente el Administrador puede anular compras
router.put('/:id/cancelar', authorize('Administrador'), cancelarCompra);

module.exports = router;
