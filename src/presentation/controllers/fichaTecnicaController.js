const FichaTecnicaService = require('../../application/services/fichaTecnicaService');
const { userHasPrivilege } = require('../../infrastructure/middlewares/authMiddleware');

const STAFF_FICHA_MODULES = ['Fichas Técnicas', 'Productos', 'Insumos', 'Gestión de Producción'];

/**
 * Proyección pública segura para la tienda cliente:
 * Conserva ingredientes personalizables y especificaciones visibles al comprador,
 * pero elimina costos unitarios, precios de insumos, stock interno y recetas propietarias.
 */
function sanitizePublicFicha(ficha) {
  if (!ficha || typeof ficha !== 'object') return ficha;
  const detalles = Array.isArray(ficha.detalles)
    ? ficha.detalles.map((d) => ({
        idDetalle: d.idDetalle,
        idInsumo: d.idInsumo,
        nombre: d.nombre || d.nombreInsumo || d.insumo?.nombre || '',
        nombreInsumo: d.nombreInsumo || d.nombre || d.insumo?.nombre || '',
        cantidad: d.cantidad,
        unidadMedida: d.unidadMedida || d.unidad || d.insumo?.unidadMedida || '',
        unidad: d.unidad || d.unidadMedida || d.insumo?.unidadMedida || '',
        esAdicion: Boolean(d.esAdicion || d.insumo?.esAdicion),
        personalizable: d.personalizable,
        insumo: d.insumo
          ? {
              idInsumo: d.insumo.idInsumo,
              nombre: d.insumo.nombre,
              unidadMedida: d.insumo.unidadMedida
            }
          : undefined
      }))
    : [];

  return {
    id: ficha.id || ficha.idFichaTecnica || ficha.idFicha,
    idFicha: ficha.idFicha || ficha.idFichaTecnica || ficha.id,
    idFichaTecnica: ficha.idFichaTecnica || ficha.idFicha || ficha.id,
    idProducto: ficha.idProducto || null,
    idVariante: ficha.idVariante || null,
    tipo: ficha.tipo || 'PRODUCTO',
    nombre: ficha.nombre || '',
    peso: ficha.peso || ficha.pesoAproximado || null,
    pesoAproximado: ficha.pesoAproximado || ficha.peso || null,
    rendimiento: ficha.rendimiento || null,
    porciones: ficha.porciones || null,
    tiempoPreparacion: ficha.tiempoPreparacion || ficha.tiempoEstimado || null,
    informacionNutricional: ficha.informacionNutricional || null,
    caracteristicasOrganolepticas: ficha.caracteristicasOrganolepticas || null,
    detalles
  };
}

function isStaffFichaViewer(req) {
  return userHasPrivilege(req.user, STAFF_FICHA_MODULES, 'Ver');
}

const getFichas = async (req, res, next) => {
  try {
    const fichas = await FichaTecnicaService.getAll();
    if (isStaffFichaViewer(req)) {
      return res.json(fichas);
    }
    const publicOnly = (Array.isArray(fichas) ? fichas : [])
      .filter((f) => Boolean(f.idProducto || f.idVariante))
      .map(sanitizePublicFicha);
    return res.json(publicOnly);
  } catch (error) {
    next(error);
  }
};

const getFichaById = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.getById(req.params.id);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const getFichaByProducto = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.getByProductoId(req.params.idProducto);
    if (!ficha) return res.json({});
    res.json(isStaffFichaViewer(req) ? ficha : sanitizePublicFicha(ficha));
  } catch (error) {
    next(error);
  }
};

const getFichaByVariante = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.getByVarianteId(req.params.idVariante);
    if (!ficha) return res.json({});
    res.json(isStaffFichaViewer(req) ? ficha : sanitizePublicFicha(ficha));
  } catch (error) {
    next(error);
  }
};

const saveFichaByVariante = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.saveForVariante(req.body?.idProducto || null, req.params.idVariante, req.body);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const getFichaByInsumo = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.getByInsumoId(req.params.idInsumo);
    res.json(ficha || {});
  } catch (error) {
    next(error);
  }
};

const saveFichaByProducto = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.saveForProducto(req.params.idProducto, req.body);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const saveFichaByInsumo = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.saveForInsumo(req.params.idInsumo, req.body);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const getFichaByInsumoPreparado = async (req, res, next) => {
  try {
    const id = req.params.idInsumoPreparado || req.params.idPreparado || req.params.id;
    const ficha = await FichaTecnicaService.getByInsumoPreparadoId(id);
    res.json(ficha || {});
  } catch (error) {
    next(error);
  }
};

const saveFichaByInsumoPreparado = async (req, res, next) => {
  try {
    const id = req.params.idInsumoPreparado || req.params.idPreparado || req.params.id;
    const ficha = await FichaTecnicaService.saveForInsumoPreparado(id, req.body);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const createFicha = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.create(req.body);
    res.status(201).json(ficha);
  } catch (error) {
    next(error);
  }
};

const updateFicha = async (req, res, next) => {
  try {
    const ficha = await FichaTecnicaService.update(req.params.id, req.body);
    res.json(ficha);
  } catch (error) {
    next(error);
  }
};

const deleteFicha = async (req, res, next) => {
  try {
    const result = await FichaTecnicaService.delete(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getFichas,
  getFichaById,
  getFichaByProducto,
  getFichaByVariante,
  saveFichaByVariante,
  getFichaByInsumo,
  getFichaByInsumoPreparado,
  saveFichaByProducto,
  saveFichaByInsumo,
  saveFichaByInsumoPreparado,
  createFicha,
  updateFicha,
  deleteFicha
};
