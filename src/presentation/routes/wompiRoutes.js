const express = require('express');
const router = express.Router();
const {
  crearIntencionPago,
  verificarTransaccion,
  handleWebhook,
} = require('../controllers/wompiController');
const { protect } = require('../../infrastructure/middlewares/authMiddleware');
const { paymentLimiter } = require('../../infrastructure/middlewares/rateLimitMiddleware');

// Crear intención de pago con firma de integridad SHA-256 (requiere usuario autenticado)
router.post('/intencion', protect, paymentLimiter, crearIntencionPago);

// Consultar y verificar estado de una transacción Wompi (requiere usuario autenticado)
router.get('/verificar/:idTransaccion', protect, paymentLimiter, verificarTransaccion);

// Webhook para recepción de notificaciones asíncronas de Wompi (verificación criptográfica interna)
router.post('/webhook', handleWebhook);

module.exports = router;
