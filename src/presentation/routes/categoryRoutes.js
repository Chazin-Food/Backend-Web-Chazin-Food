const express = require('express');
const router = express.Router();
const { getCategories, getCategoryById, createCategory, updateCategory, deleteCategory } = require('../controllers/categoryController');
const { protect, authorize, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheCategories = cacheResponse('categories', {
  ttlMs: 120000,
  cacheControl: 'private, max-age=60'
});

router.route('/')
  .get(protect, requirePrivilege(['Categoría Insumos', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheCategories, getCategories)
  .post(protect, authorize('Administrador'), createCategory);

router.route('/:id')
  .get(protect, requirePrivilege(['Categoría Insumos', 'Insumos', 'Gestión de Compras'], 'Ver'), cacheCategories, getCategoryById)
  .put(protect, authorize('Administrador'), updateCategory)
  .delete(protect, authorize('Administrador'), deleteCategory);

module.exports = router;
