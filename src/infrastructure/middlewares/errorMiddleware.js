const errorHandler = (err, req, res, next) => {
  let statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  if (err.statusCode && typeof err.statusCode === 'number') {
    statusCode = err.statusCode;
  } else if (err.status && typeof err.status === 'number') {
    statusCode = err.status;
  } else if (err.name === 'MulterError') {
    statusCode = 400;
  }

  let friendlyMessage = err.message || 'Ha ocurrido un error inesperado en el servidor';

  const errName = err.name || '';
  const rawMsg = String(err.message || '');

  if (errName === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      friendlyMessage = 'El archivo supera el tamaño máximo permitido de 5 MB.';
    } else if (err.code === 'LIMIT_FILE_COUNT') {
      friendlyMessage = 'Solo se permite subir un archivo por solicitud.';
    } else {
      friendlyMessage = 'Error al procesar el archivo subido.';
    }
  } else if (errName === 'SequelizeForeignKeyConstraintError' || rawMsg.includes('foreign key constraint')) {
    statusCode = 400;
    if (rawMsg.includes('categoriaproducto') || rawMsg.includes('idCategoriaProducto')) {
      friendlyMessage = 'No se puede eliminar la categoría porque tiene productos asociados en el menú.';
    } else if (rawMsg.includes('producto') || rawMsg.includes('idProducto')) {
      friendlyMessage = 'No se puede eliminar este producto porque tiene ventas, pedidos o eventos asociados.';
    } else if (rawMsg.includes('insumo') || rawMsg.includes('idInsumo')) {
      friendlyMessage = 'No se puede eliminar el insumo porque está relacionado con compras o recetas activas.';
    } else {
      friendlyMessage = 'No se puede realizar esta acción porque el registro está asociado con otros elementos del sistema.';
    }
  } else if (errName === 'SequelizeUniqueConstraintError' || rawMsg.includes('Duplicate entry') || rawMsg.includes('unique constraint')) {
    statusCode = 400;
    if (rawMsg.toLowerCase().includes('nombre') || rawMsg.toLowerCase().includes('slug')) {
      friendlyMessage = 'Ya existe un registro con este nombre. Por favor ingresa uno diferente.';
    } else if (rawMsg.toLowerCase().includes('codigo')) {
      friendlyMessage = 'Ya existe un registro con este código en el sistema.';
    } else if (rawMsg.toLowerCase().includes('correo') || rawMsg.toLowerCase().includes('email')) {
      friendlyMessage = 'Ya existe un usuario registrado con este correo electrónico.';
    } else {
      friendlyMessage = 'Ya existe un registro con estos datos en el sistema. Por favor verifica los valores.';
    }
  } else if (errName === 'SequelizeValidationError') {
    statusCode = 400;
    if (Array.isArray(err.errors) && err.errors.length > 0) {
      friendlyMessage = err.errors.map(e => e.message).join('. ');
    } else {
      friendlyMessage = 'Los datos enviados no cumplen con el formato o las validaciones requeridas.';
    }
  } else if (errName === 'SequelizeConnectionError' || rawMsg.includes('ECONNREFUSED')) {
    statusCode = 503;
    friendlyMessage = 'No se pudo conectar con la base de datos en este momento. Por favor reintenta en breve.';
  } else if (statusCode >= 500) {
    console.error(`[HTTP ${statusCode}] ${req.method} ${req.originalUrl}:`, err.stack || err.message);
    if (process.env.NODE_ENV === 'production') {
      friendlyMessage = 'Ha ocurrido un error interno en el servidor. Intenta nuevamente más tarde.';
    }
  }

  // Seguridad (AUD-025 / VULN-012): nunca exponer stack traces en respuestas HTTP
  res.status(statusCode).json({
    message: friendlyMessage,
    error: friendlyMessage
  });
};

module.exports = { errorHandler };
