const express = require('express');
const router = express.Router();
const { cacheResponse } = require('../../infrastructure/utils/apiCache');
const {
  protect,
  optionalProtect,
  requirePrivilege,
  userHasPrivilege
} = require('../../infrastructure/middlewares/authMiddleware');
const {
  getFichas,
  getFichaById,
  getFichaByProducto,
  getFichaByVariante,
  getFichaByInsumo,
  getFichaByInsumoPreparado,
  saveFichaByProducto,
  saveFichaByVariante,
  saveFichaByInsumo,
  saveFichaByInsumoPreparado,
  createFicha,
  updateFicha,
  deleteFicha
} = require('../controllers/fichaTecnicaController');

const fichaReadModules = ['Fichas Técnicas', 'Productos', 'Insumos', 'Gestión de Producción'];
const cacheFichas = cacheResponse('fichas', {
  ttlMs: 30000,
  cacheControl: 'private, max-age=15',
  keyResolver: (req) => (userHasPrivilege(req.user, fichaReadModules, 'Ver') ? 'staff' : 'public')
});

router.route('/')
  .get(optionalProtect, cacheFichas, getFichas)
  .post(protect, requirePrivilege(['Productos', 'Insumos', 'Fichas Técnicas'], 'Crear'), createFicha);

router.route('/producto/:idProducto')
  .get(optionalProtect, cacheFichas, getFichaByProducto)
  .put(protect, requirePrivilege(['Productos', 'Fichas Técnicas'], 'Editar'), saveFichaByProducto)
  .post(protect, requirePrivilege(['Productos', 'Fichas Técnicas'], 'Crear'), saveFichaByProducto);

router.route('/variante/:idVariante')
  .get(optionalProtect, cacheFichas, getFichaByVariante)
  .put(protect, requirePrivilege(['Productos', 'Fichas Técnicas'], 'Editar'), saveFichaByVariante)
  .post(protect, requirePrivilege(['Productos', 'Fichas Técnicas'], 'Crear'), saveFichaByVariante);

router.route('/insumo-preparado/:idInsumoPreparado')
  .get(protect, requirePrivilege(fichaReadModules, 'Ver'), cacheFichas, getFichaByInsumoPreparado)
  .put(protect, requirePrivilege(['Insumos', 'Fichas Técnicas'], 'Editar'), saveFichaByInsumoPreparado)
  .post(protect, requirePrivilege(['Insumos', 'Fichas Técnicas'], 'Crear'), saveFichaByInsumoPreparado);

router.route('/insumo/:idInsumo')
  .get(protect, requirePrivilege(fichaReadModules, 'Ver'), cacheFichas, getFichaByInsumo)
  .put(protect, requirePrivilege(['Insumos', 'Fichas Técnicas'], 'Editar'), saveFichaByInsumo)
  .post(protect, requirePrivilege(['Insumos', 'Fichas Técnicas'], 'Crear'), saveFichaByInsumo);

router.route('/:id')
  .get(protect, requirePrivilege(fichaReadModules, 'Ver'), cacheFichas, getFichaById)
  .put(protect, requirePrivilege(['Productos', 'Insumos', 'Fichas Técnicas'], 'Editar'), updateFicha)
  .delete(protect, requirePrivilege(['Productos', 'Insumos', 'Fichas Técnicas'], 'Eliminar'), deleteFicha);

module.exports = router;
