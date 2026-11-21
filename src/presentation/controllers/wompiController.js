const WompiService = require('../../application/services/wompiService');
const AuthService = require('../../application/services/authService');

const crearIntencionPago = async (req, res, next) => {
  try {
    // Seguridad (AUD-005): usar exclusivamente el usuario autenticado (nunca req.body.idUsuario)
    const user = req.user;
    const currentUserId = user?.idUsuario || user?.id || user?._id || null;
    if (!currentUserId) {
      return res.status(401).json({ message: 'Debes iniciar sesión para realizar un pago.' });
    }

    const submittedDoc = String(req.body?.clienteDocumento || req.body?.documento || '').trim();
    if (submittedDoc.length >= 6) {
      const check = await AuthService.checkDocument(submittedDoc, currentUserId);
      if (check.conflict) {
        return res.status(400).json({ message: check.message });
      }
    }
    const resultado = await WompiService.crearIntencionPago(req.body, user);
    res.status(201).json(resultado);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const verificarTransaccion = async (req, res, next) => {
  try {
    const { idTransaccion } = req.params;
    const resultado = await WompiService.verificarTransaccion(idTransaccion, req.user);
    res.json(resultado);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    const evento = req.body;
    // Seguridad (AUD-007): validar obligatoriamente la firma criptográfica del webhook antes de aceptar o procesar
    if (!WompiService.validarFirmaWebhook(evento)) {
      console.warn('⚠️ [Wompi Webhook] Firma criptográfica inválida o WOMPI_EVENTS_SECRET ausente.');
      return res.status(401).json({ status: 'unauthorized', message: 'Firma de webhook inválida' });
    }

    res.status(200).json({ status: 'ok' });

    // Procesar asíncronamente el evento ya autenticado
    await WompiService.procesarWebhook(evento);
  } catch (error) {
    console.error('Error procesando webhook de Wompi:', error.message);
  }
};

module.exports = {
  crearIntencionPago,
  verificarTransaccion,
  handleWebhook,
};
