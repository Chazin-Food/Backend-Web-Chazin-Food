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
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheProveedores = cacheResponse('proveedores', { ttlMs: 20000, cacheControl: 'private, max-age=10' });

router.use(protect);

router.get('/tipos', cacheProveedores, getTiposProveedor);
router.get('/papelera', requirePrivilege('Proveedores', 'Ver'), cacheProveedores, getPapeleraProveedores);

router.route('/')
  .get(cacheProveedores, getProveedores)
  .post(requirePrivilege(['Proveedores', 'Gestión de Compras'], 'Crear'), validateCreateProveedor, createProveedor);

router.route('/:id')
  .get(getProveedorById)
  .put(requirePrivilege('Proveedores', 'Editar'), validateUpdateProveedor, updateProveedor)
  .delete(requirePrivilege('Proveedores', 'Eliminar'), deleteProveedor);

router.put('/:id/estado', requirePrivilege('Proveedores', 'Editar'), toggleProveedorEstado);
router.patch('/:id/estado', requirePrivilege('Proveedores', 'Editar'), toggleProveedorEstado);
router.put('/:id/restaurar', requirePrivilege('Proveedores', 'Editar'), restoreProveedor);
router.delete('/:id/permanente', requirePrivilege('Proveedores', 'Eliminar'), deletePermanenteProveedor);

module.exports = router;
