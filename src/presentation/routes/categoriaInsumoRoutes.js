const express = require('express');
const router = express.Router();
const { cacheResponse } = require('../../infrastructure/utils/apiCache');
const cacheCatInsumo = cacheResponse('categorias-insumo', { ttlMs: 120000, cacheControl: 'private, max-age=60' });
const {
  getCategoriasInsumo,
  getCategoriaInsumoById,
  createCategoriaInsumo,
  updateCategoriaInsumo,
  deleteCategoriaInsumo
} = require('../controllers/categoriaInsumoController');
const { protect, authorize, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');

router.route('/')
  .get(protect, requirePrivilege(['Categoría Insumos', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheCatInsumo, getCategoriasInsumo)
  .post(protect, authorize('Administrador'), createCategoriaInsumo);

router.route('/:id')
  .get(protect, requirePrivilege(['Categoría Insumos', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheCatInsumo, getCategoriaInsumoById)
  .put(protect, authorize('Administrador'), updateCategoriaInsumo)
  .delete(protect, authorize('Administrador'), deleteCategoriaInsumo);

module.exports = router;
