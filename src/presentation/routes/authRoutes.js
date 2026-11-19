const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getUserProfile, updateUserProfile, forgotPassword, resetPassword, googleAuth, verifyEmail, verifyDocument, verifyActivation, activateAccount } = require('../controllers/authController');
const { protect, optionalProtect } = require('../../infrastructure/middlewares/authMiddleware');

router.post('/register', registerUser);
router.post('/registro', registerUser);
router.post('/login', loginUser);
router.post('/google', googleAuth);
router.post('/verificar-correo', verifyEmail);
router.get('/verificar-correo', verifyEmail);
router.post('/check-email', verifyEmail);
router.post('/verificar-documento', optionalProtect, verifyDocument);
router.get('/verificar-documento', optionalProtect, verifyDocument);
router.post('/check-document', optionalProtect, verifyDocument);
router.get('/check-document', optionalProtect, verifyDocument);
router.post('/recuperar-contrasena', forgotPassword);
router.post('/forgot-password', forgotPassword);
router.post('/restablecer-contrasena', resetPassword);
router.post('/reset-password', resetPassword);
router.get('/verificar-activacion', verifyActivation);
router.post('/activar-cuenta', activateAccount);
router.get('/me', protect, getUserProfile);
router.get('/perfil', protect, getUserProfile);
router.put('/me', protect, updateUserProfile);
router.put('/perfil', protect, updateUserProfile);

module.exports = router;
