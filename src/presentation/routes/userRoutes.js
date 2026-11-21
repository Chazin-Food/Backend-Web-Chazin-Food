const express = require('express');
const router = express.Router();
const {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  toggleUserStatus,
  deleteUser
} = require('../controllers/userController');
const {
  registerUser,
  loginUser,
  logoutUser,
  forgotPassword,
  resetPassword,
  getUserProfile,
  updateUserProfile,
  googleAuth,
  verifyEmail,
  verifyDocument,
  verifyActivation,
  activateAccount
} = require('../controllers/authController');
const {
  protect,
  optionalProtect,
  requirePrivilege,
  userHasPrivilege
} = require('../../infrastructure/middlewares/authMiddleware');
const {
  authLoginLimiter,
  authSensitiveLimiter,
  authLookupLimiter
} = require('../../infrastructure/middlewares/rateLimitMiddleware');
const { cacheResponse } = require('../../infrastructure/utils/apiCache');

const cacheUsuarios = cacheResponse('usuarios', { ttlMs: 15000, cacheControl: 'private, max-age=10' });

const allowSelfOrViewUsers = (req, res, next) => {
  if (req.user && String(req.user.id || req.user.idUsuario) === String(req.params.id)) {
    return next();
  }
  return requirePrivilege('Usuarios', 'Ver')(req, res, next);
};

const allowSelfOrEditUsers = (req, res, next) => {
  const hasAdminEdit = userHasPrivilege(req.user, 'Usuarios', 'Editar');
  if (hasAdminEdit) {
    req.isSelfOnlyEdit = false;
    return next();
  }
  if (req.user && String(req.user.id || req.user.idUsuario) === String(req.params.id)) {
    req.isSelfOnlyEdit = true;
    return next();
  }
  return requirePrivilege('Usuarios', 'Editar')(req, res, next);
};

router.post('/login', authLoginLimiter, loginUser);
router.post('/google', authLoginLimiter, googleAuth);
router.post('/logout', protect, logoutUser);
router.post('/registro', authSensitiveLimiter, registerUser);
router.post('/register', authSensitiveLimiter, registerUser);

router.post('/verificar-correo', authLookupLimiter, verifyEmail);
router.get('/verificar-correo', authLookupLimiter, verifyEmail);
router.post('/check-email', authLookupLimiter, verifyEmail);

router.post('/verificar-documento', authLookupLimiter, optionalProtect, verifyDocument);
router.get('/verificar-documento', authLookupLimiter, optionalProtect, verifyDocument);
router.post('/check-document', authLookupLimiter, optionalProtect, verifyDocument);
router.get('/check-document', authLookupLimiter, optionalProtect, verifyDocument);

router.post('/recuperar-contrasena', authSensitiveLimiter, forgotPassword);
router.post('/forgot-password', authSensitiveLimiter, forgotPassword);
router.post('/restablecer-contrasena', authSensitiveLimiter, resetPassword);
router.post('/reset-password', authSensitiveLimiter, resetPassword);
router.get('/verificar-activacion', authLookupLimiter, verifyActivation);
router.post('/activar-cuenta', authSensitiveLimiter, activateAccount);

// Perfil de usuario autenticado
router.route('/perfil')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile);

router.route('/')
  .get(protect, requirePrivilege('Usuarios', 'Ver'), cacheUsuarios, getUsers)
  .post(protect, requirePrivilege('Usuarios', 'Crear'), createUser);

router.route('/:id')
  .get(protect, allowSelfOrViewUsers, getUserById)
  .put(protect, allowSelfOrEditUsers, updateUser)
  .delete(protect, requirePrivilege('Usuarios', 'Eliminar'), deleteUser);

router.put('/:id/password', protect, allowSelfOrEditUsers, changeUserPassword);
router.put('/:id/contrasena', protect, allowSelfOrEditUsers, changeUserPassword);
router.patch('/:id/password', protect, allowSelfOrEditUsers, changeUserPassword);
router.patch('/:id/contrasena', protect, allowSelfOrEditUsers, changeUserPassword);

router.patch('/:id/estado', protect, requirePrivilege('Usuarios', 'Editar'), toggleUserStatus);
router.put('/:id/estado', protect, requirePrivilege('Usuarios', 'Editar'), toggleUserStatus);

module.exports = router;
