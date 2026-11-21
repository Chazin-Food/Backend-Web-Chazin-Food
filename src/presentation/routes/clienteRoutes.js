const express = require('express');
const router = express.Router();
const {
  getClientes,
  getClientesStats,
  getClienteById,
  createCliente,
  updateCliente,
  deleteCliente,
  getFidelidadCatalogo
} = require('../controllers/clienteController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheClientes = cacheResponse('clientes', { ttlMs: 15000, cacheControl: 'private, max-age=10' });
const cacheFidelidad = cacheResponse('clientes', { ttlMs: 60000, cacheControl: 'public, max-age=30, stale-while-revalidate=60' });

router.get('/fidelidad/catalogo', cacheFidelidad, getFidelidadCatalogo);

router.route('/')
  .get(protect, requirePrivilege(['Clientes', 'Gestión de Ventas'], 'Ver'), cacheClientes, getClientes)
  .post(protect, requirePrivilege(['Clientes', 'Gestión de Ventas'], 'Crear'), createCliente);

router.get('/stats', protect, requirePrivilege(['Clientes', 'Dashboard'], 'Ver'), cacheClientes, getClientesStats);

router.route('/:id')
  .get(protect, getClienteById)
  .put(protect, requirePrivilege('Clientes', 'Editar'), updateCliente)
  .delete(protect, requirePrivilege('Clientes', 'Eliminar'), deleteCliente);

module.exports = router;
