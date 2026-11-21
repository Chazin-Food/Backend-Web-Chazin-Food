const express = require('express');
const router = express.Router();
const upload = require('../../infrastructure/middlewares/uploadMiddleware');
const { deleteImage } = require('../../infrastructure/services/cloudinaryService');
const { protect, requirePrivilege } = require('../../infrastructure/middlewares/authMiddleware');

router.use(protect);

const uploadWriteModules = ['Productos', 'Insumos', 'Categoría Productos', 'Categoría Insumos', 'Usuarios'];
const uploadDeleteModules = ['Productos', 'Insumos', 'Categoría Productos', 'Categoría Insumos'];

router.post('/', requirePrivilege(uploadWriteModules, 'Editar'), upload.single('image'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No se subió ninguna imagen válida' });
  }

  res.status(200).json({
    success: true,
    message: 'Imagen subida exitosamente',
    url: req.file.path
  });
});

router.post('/delete', requirePrivilege(uploadDeleteModules, 'Eliminar'), async (req, res) => {
  try {
    const { url, publicId } = req.body || {};
    const target = url || publicId;

    if (!target || typeof target !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'Se requiere proporcionar "url" o "publicId" válido para eliminar la imagen'
      });
    }

    const result = await deleteImage(target);
    return res.status(200).json({
      success: true,
      message: 'Operación de eliminación en Cloudinary procesada',
      ...result
    });
  } catch (error) {
    console.error('Error en ruta /upload/delete:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Error interno al procesar la eliminación de imagen'
    });
  }
});

module.exports = router;
