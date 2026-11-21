const multer = require('multer');
const cloudinary = require('../config/cloudinary');

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp'
]);

/**
 * Verifica los magic bytes reales del buffer para confirmar JPEG, PNG o WEBP
 * (defensa adicional contra spoofing de Content-Type).
 */
function hasValidImageMagicBytes(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return false;
  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return true;
  }
  // WEBP: RIFF....WEBP
  if (
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return true;
  }
  return false;
}

const fileFilter = (req, file, cb) => {
  if (file && ALLOWED_MIME_TYPES.has(String(file.mimetype || '').toLowerCase())) {
    return cb(null, true);
  }
  const err = new Error('Tipo de archivo no permitido. Solo se aceptan imágenes JPG, PNG o WEBP.');
  err.statusCode = 400;
  return cb(err, false);
};

const baseMulter = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // Máximo 5 MB por archivo (AUD-022 / VULN-007)
    files: 1
  }
});

function uploadBufferToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: 'chazin-food-products',
        resource_type: 'image',
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        transformation: [{ width: 1000, height: 1000, crop: 'limit' }]
      },
      (err, result) => {
        if (err) return reject(err);
        return resolve(result);
      }
    );
    stream.end(buffer);
  });
}

/**
 * Middleware compatible con upload.single('image') usando Cloudinary SDK v2 directo
 * (elimina dependencia vulnerable multer-storage-cloudinary — AUD-016).
 */
const upload = {
  single(fieldName = 'image') {
    const parseSingle = baseMulter.single(fieldName);
    return (req, res, next) => {
      parseSingle(req, res, async (err) => {
        if (err) return next(err);
        if (!req.file || !req.file.buffer) return next();

        if (!hasValidImageMagicBytes(req.file.buffer)) {
          const invalidErr = new Error('El contenido del archivo no corresponde a una imagen JPG, PNG o WEBP válida.');
          invalidErr.statusCode = 400;
          return next(invalidErr);
        }

        try {
          const result = await uploadBufferToCloudinary(req.file.buffer);
          req.file.path = result.secure_url;
          req.file.filename = result.public_id;
          req.file.cloudinaryResult = result;
          return next();
        } catch (cloudErr) {
          return next(cloudErr);
        }
      });
    };
  }
};

upload.hasValidImageMagicBytes = hasValidImageMagicBytes;

module.exports = upload;
