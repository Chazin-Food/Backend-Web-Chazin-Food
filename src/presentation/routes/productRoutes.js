const express = require('express');
const router = express.Router();
const {
  getProducts,
  getProductsPapelera,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  restoreProduct,
  hardDeleteProduct,
  toggleVarianteEstado,
} = require('../controllers/productController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheProductos = cacheResponse('productos', {
  ttlMs: 60000,
  cacheControl: 'public, max-age=30, stale-while-revalidate=60'
});

router.get('/papelera', protect, requirePrivilege('Productos', 'Ver'), getProductsPapelera);
router.get('/deleted', protect, requirePrivilege('Productos', 'Ver'), getProductsPapelera);

router.route('/')
  .get(cacheProductos, getProducts)
  .post(protect, requirePrivilege('Productos', 'Crear'), createProduct);

router.route('/:id')
  .get(cacheProductos, getProductById)
  .put(protect, requirePrivilege('Productos', 'Editar'), updateProduct)
  .delete(protect, requirePrivilege('Productos', 'Eliminar'), deleteProduct);

router.put('/:id/restaurar', protect, requirePrivilege('Productos', 'Editar'), restoreProduct);
router.patch('/:id/restaurar', protect, requirePrivilege('Productos', 'Editar'), restoreProduct);
router.put('/:id/restore', protect, requirePrivilege('Productos', 'Editar'), restoreProduct);
router.patch('/:id/restore', protect, requirePrivilege('Productos', 'Editar'), restoreProduct);

router.patch('/:id/variantes/:idVariante/estado', protect, requirePrivilege('Productos', 'Editar'), toggleVarianteEstado);
router.put('/:id/variantes/:idVariante/estado', protect, requirePrivilege('Productos', 'Editar'), toggleVarianteEstado);

router.delete('/:id/fisico', protect, requirePrivilege('Productos', 'Eliminar'), hardDeleteProduct);
router.delete('/:id/permanent', protect, requirePrivilege('Productos', 'Eliminar'), hardDeleteProduct);

module.exports = router;
