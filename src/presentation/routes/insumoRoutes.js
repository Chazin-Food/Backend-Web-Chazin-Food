const express = require('express');
const router = express.Router();
const {
  getInsumos,
  checkVencimientos,
  getInsumosPapelera,
  getInsumoById,
  createInsumo,
  updateInsumo,
  deleteInsumo,
  restoreInsumo,
  hardDeleteInsumo,
  deleteLoteVencido,
  deleteLotesVencidos,
} = require('../controllers/insumoController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheInsumos = cacheResponse('insumos', { ttlMs: 15000, cacheControl: 'private, max-age=10' });

router.use(protect);

router.get('/check-vencimientos', checkVencimientos);
router.get('/papelera', cacheInsumos, getInsumosPapelera);
router.get('/deleted', cacheInsumos, getInsumosPapelera);

router.route('/')
  .get(cacheInsumos, getInsumos)
  .post(requirePrivilege(['Insumos', 'Gestión de Compras'], 'Crear'), createInsumo);

router.route('/:id')
  .get(getInsumoById)
  .put(requirePrivilege('Insumos', 'Editar'), updateInsumo)
  .delete(requirePrivilege('Insumos', 'Eliminar'), deleteInsumo);

router.put('/:id/restaurar', requirePrivilege('Insumos', 'Editar'), restoreInsumo);
router.patch('/:id/restaurar', requirePrivilege('Insumos', 'Editar'), restoreInsumo);
router.put('/:id/restore', requirePrivilege('Insumos', 'Editar'), restoreInsumo);
router.patch('/:id/restore', requirePrivilege('Insumos', 'Editar'), restoreInsumo);

router.delete('/:id/fisico', requirePrivilege('Insumos', 'Eliminar'), hardDeleteInsumo);
router.delete('/:id/permanent', requirePrivilege('Insumos', 'Eliminar'), hardDeleteInsumo);
router.delete('/:id/lotes-vencidos', requirePrivilege(['Insumos', 'Gestión de Compras'], 'Eliminar'), deleteLotesVencidos);
router.delete('/:id/lotes/:idLote', requirePrivilege(['Insumos', 'Gestión de Compras'], 'Eliminar'), deleteLoteVencido);

module.exports = router;
