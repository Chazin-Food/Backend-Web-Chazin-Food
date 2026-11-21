const express = require('express');
const router = express.Router();
const {
  getProveedores,
  getPapeleraProveedores,
  getProveedorById,
  getTiposProveedor,
  createProveedor,
  updateProveedor,
  toggleProveedorEstado,
  deleteProveedor,
  restoreProveedor,
  deletePermanenteProveedor,
} = require('../controllers/proveedorController');
const {
  validateCreateProveedor,
  validateUpdateProveedor,
} = require('../../infrastructure/middlewares/proveedorValidation');
const { protect, authorize, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheProveedores = cacheResponse('proveedores', { ttlMs: 20000, cacheControl: 'private, max-age=10' });

router.use(protect);

router.get('/tipos', requirePrivilege(['Proveedores', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheProveedores, getTiposProveedor);
router.get('/papelera', authorize('Administrador'), cacheProveedores, getPapeleraProveedores);

router.route('/')
  .get(requirePrivilege(['Proveedores', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheProveedores, getProveedores)
  .post(authorize('Administrador'), validateCreateProveedor, createProveedor);

router.route('/:id')
  .get(requirePrivilege(['Proveedores', 'Insumos', 'Gestión de Compras'], 'Ver'), getProveedorById)
  .put(authorize('Administrador'), validateUpdateProveedor, updateProveedor)
  .delete(authorize('Administrador'), deleteProveedor);

router.put('/:id/estado', authorize('Administrador'), toggleProveedorEstado);
router.patch('/:id/estado', authorize('Administrador'), toggleProveedorEstado);
router.put('/:id/restaurar', authorize('Administrador'), restoreProveedor);
router.delete('/:id/permanente', authorize('Administrador'), deletePermanenteProveedor);

module.exports = router;
