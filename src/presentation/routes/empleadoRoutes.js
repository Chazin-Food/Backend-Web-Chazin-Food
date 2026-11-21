const express = require('express');
const router = express.Router();
const {
  getEmpleados,
  getEmpleadoById,
  createEmpleado,
  updateEmpleado,
  toggleEstadoEmpleado,
  deleteEmpleado,
  restoreEmpleado
} = require('../controllers/empleadoController');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheEmpleados = cacheResponse('empleados', { ttlMs: 20000, cacheControl: 'private, max-age=10' });

router.use(protect);

router.get('/', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Ver'), cacheEmpleados, getEmpleados);
router.post('/', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Crear'), createEmpleado);
router.get('/:id', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Ver'), getEmpleadoById);
router.put('/:id', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Editar'), updateEmpleado);
router.patch('/:id/estado', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Editar'), toggleEstadoEmpleado);
router.put('/:id/estado', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Editar'), toggleEstadoEmpleado);
router.delete('/:id', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Eliminar'), deleteEmpleado);
router.patch('/:id/restaurar', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Editar'), restoreEmpleado);
router.put('/:id/restaurar', requirePrivilege(['Empleados', 'Gestión de Empleados'], 'Editar'), restoreEmpleado);

module.exports = router;
