const express = require('express');
const router = express.Router();
const {
  registerUser,
  loginUser,
  logoutUser,
  getUserProfile,
  updateUserProfile,
  forgotPassword,
  resetPassword,
  googleAuth,
  verifyEmail,
  verifyDocument,
  verifyActivation,
  activateAccount
} = require('../controllers/authController');
const { protect, optionalProtect } = require('../../infrastructure/middlewares/authMiddleware');
const {
  authLoginLimiter,
  authSensitiveLimiter,
  authLookupLimiter
} = require('../../infrastructure/middlewares/rateLimitMiddleware');

router.post('/register', authSensitiveLimiter, registerUser);
router.post('/registro', authSensitiveLimiter, registerUser);
router.post('/login', authLoginLimiter, loginUser);
router.post('/google', authLoginLimiter, googleAuth);
router.post('/logout', protect, logoutUser);

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

router.get('/me', protect, getUserProfile);
router.get('/perfil', protect, getUserProfile);
router.put('/me', protect, updateUserProfile);
router.put('/perfil', protect, updateUserProfile);

module.exports = router;
