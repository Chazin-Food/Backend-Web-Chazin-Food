const express = require('express');
const router = express.Router();
const {
  getInsumosPreparados,
  getInsumosPreparadosPapelera,
  getInsumoPreparadoById,
  createInsumoPreparado,
  updateInsumoPreparado,
  deleteInsumoPreparado,
  restoreInsumoPreparado,
  hardDeleteInsumoPreparado,
} = require('../controllers/insumoPreparadoController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cachePreparados = cacheResponse('insumos-preparados', { ttlMs: 15000, cacheControl: 'private, max-age=10' });
const insumoReadModules = ['Insumos', 'Fichas Técnicas', 'Gestión de Compras', 'Gestión de Producción'];

router.use(protect);

router.get('/papelera', requirePrivilege('Insumos', 'Ver'), cachePreparados, getInsumosPreparadosPapelera);
router.get('/deleted', requirePrivilege('Insumos', 'Ver'), cachePreparados, getInsumosPreparadosPapelera);

router.route('/')
  .get(requirePrivilege(insumoReadModules, 'Ver'), cachePreparados, getInsumosPreparados)
  .post(requirePrivilege('Insumos', 'Crear'), createInsumoPreparado);

router.route('/:id')
  .get(requirePrivilege(insumoReadModules, 'Ver'), getInsumoPreparadoById)
  .put(requirePrivilege('Insumos', 'Editar'), updateInsumoPreparado)
  .delete(requirePrivilege('Insumos', 'Eliminar'), deleteInsumoPreparado);

router.put('/:id/restaurar', requirePrivilege('Insumos', 'Editar'), restoreInsumoPreparado);
router.patch('/:id/restaurar', requirePrivilege('Insumos', 'Editar'), restoreInsumoPreparado);
router.put('/:id/restore', requirePrivilege('Insumos', 'Editar'), restoreInsumoPreparado);
router.patch('/:id/restore', requirePrivilege('Insumos', 'Editar'), restoreInsumoPreparado);

router.delete('/:id/fisico', requirePrivilege('Insumos', 'Eliminar'), hardDeleteInsumoPreparado);
router.delete('/:id/permanent', requirePrivilege('Insumos', 'Eliminar'), hardDeleteInsumoPreparado);

module.exports = router;
