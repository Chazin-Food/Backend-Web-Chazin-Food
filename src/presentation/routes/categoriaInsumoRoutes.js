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
  .post(protect, requirePrivilege(['Categoría Insumos', 'Insumos'], 'Crear'), createCategoriaInsumo);

router.route('/:id')
  .get(protect, requirePrivilege(['Categoría Insumos', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheCatInsumo, getCategoriaInsumoById)
  .put(protect, requirePrivilege('Categoría Insumos', 'Editar'), updateCategoriaInsumo)
  .delete(protect, requirePrivilege('Categoría Insumos', 'Eliminar'), deleteCategoriaInsumo);

router.put('/:id/estado', protect, requirePrivilege('Categoría Insumos', 'Editar'), updateCategoriaInsumo);
router.patch('/:id/estado', protect, requirePrivilege('Categoría Insumos', 'Editar'), updateCategoriaInsumo);

module.exports = router;
