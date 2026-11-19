const WompiService = require('../../application/services/wompiService');
const AuthService = require('../../application/services/authService');

const crearIntencionPago = async (req, res, next) => {
  try {
    const user = req.user || { idUsuario: req.body.idUsuario || req.body.userId };
    const currentUserId = user?.idUsuario || user?.id || user?._id || null;
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
    const resultado = await WompiService.verificarTransaccion(idTransaccion);
    res.json(resultado);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const handleWebhook = async (req, res, next) => {
  try {
    // Responder 200 inmediatamente a Wompi para confirmar recepción
    res.status(200).json({ status: 'ok' });

    // Procesar asíncronamente el evento
    const evento = req.body;
    await WompiService.procesarWebhook(evento);
  } catch (error) {
    console.error('Error procesando webhook de Wompi:', error);
  }
};

module.exports = {
  crearIntencionPago,
  verificarTransaccion,
  handleWebhook,
};
