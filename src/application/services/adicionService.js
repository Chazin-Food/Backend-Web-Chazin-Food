const { Op } = require('sequelize');
const { Insumo, LoteInsumo } = require('../../persistence/models');
const { getColombiaDateISO } = require('../../infrastructure/utils/colombiaDateUtils');
const { computeInsumoStockBreakdown, groupLotesByInsumo } = require('../../infrastructure/utils/stockFefoUtils');
const { invalidateNamespaces } = require('../../infrastructure/utils/apiCache');

function formatAdicion(insumo, lotes = [], todayCol = getColombiaDateISO()) {
  const breakdown = computeInsumoStockBreakdown(insumo, lotes, todayCol);
  const stockOperativo = !breakdown.isInactive
    ? (breakdown.controlarStock ? breakdown.stockVigente : 99)
    : 0;
  return {
    idAdicion: insumo.idInsumo,
    id: insumo.idInsumo,
    idInsumo: insumo.idInsumo,
    nombre: insumo.nombre,
    descripcion: insumo.descripcion || '',
    imagen: insumo.imagen || '',
    precio: parseFloat(insumo.precioAdicion || 0),
    stock: stockOperativo,
    stockTotal: breakdown.stockTotal,
    stockVigente: breakdown.stockVigente,
    agotado: breakdown.isInactive || (breakdown.controlarStock && breakdown.stockVigente <= 0),
    unidadMedida: insumo.unidadMedida,
    estado: insumo.estado,
    esAdicion: 1,
    insumo: {
      idInsumo: insumo.idInsumo,
      nombre: insumo.nombre
    }
  };
}

class AdicionService {
  static async getAll() {
    const todayCol = getColombiaDateISO();
    const [insumos, allLotes] = await Promise.all([
      Insumo.findAll({
        where: { esAdicion: 1, estado: 1, eliminado: 0 }
      }),
      LoteInsumo.findAll({
        attributes: ['idLote', 'idInsumo', 'cantidad', 'cantidadDisponible', 'fechaVencimiento', 'estado'],
        where: { estado: { [Op.ne]: 'AGOTADO' } },
        raw: true
      }).catch(() => [])
    ]);
    const lotesByInsumo = groupLotesByInsumo(allLotes);
    return insumos.map(ins => formatAdicion(ins, lotesByInsumo.get(Number(ins.idInsumo)) || [], todayCol));
  }

  static async getById(id) {
    const todayCol = getColombiaDateISO();
    const [insumo, lotes] = await Promise.all([
      Insumo.findByPk(id),
      LoteInsumo.findAll({
        attributes: ['idLote', 'idInsumo', 'cantidad', 'cantidadDisponible', 'fechaVencimiento', 'estado'],
        where: { idInsumo: id, estado: { [Op.ne]: 'AGOTADO' } },
        raw: true
      }).catch(() => [])
    ]);
    if (!insumo || !insumo.esAdicion) {
      const error = new Error('Adición no encontrada');
      error.statusCode = 404;
      throw error;
    }
    return formatAdicion(insumo, lotes, todayCol);
  }

  static async create(data) {
    const { idInsumo, nombre, descripcion, imagen, precio, estado } = data;

    let targetInsumo = null;
    if (idInsumo) {
      targetInsumo = await Insumo.findByPk(idInsumo);
    }

    if (targetInsumo) {
      if (nombre !== undefined && String(nombre).trim()) {
        targetInsumo.nombre = String(nombre).trim();
      }
      targetInsumo.esAdicion = 1;
      if (precio !== undefined) {
        const parsedPrecio = parseFloat(precio);
        if (isNaN(parsedPrecio) || parsedPrecio <= 0) {
          const error = new Error('El precio de la adición / topping debe ser mayor a $0');
          error.statusCode = 400;
          throw error;
        }
        targetInsumo.precioAdicion = parsedPrecio;
      }
      if (imagen !== undefined) targetInsumo.imagen = imagen;
      if (descripcion !== undefined) targetInsumo.descripcion = descripcion;
      if (estado !== undefined) targetInsumo.estado = (estado === 'Activo' || estado === 1 || estado === '1') ? 1 : 0;
      await targetInsumo.save();
    } else {
      if (!nombre || precio === undefined) {
        const error = new Error('Nombre y precio son obligatorios para la adición');
        error.statusCode = 400;
        throw error;
      }
      const parsedPrecio = parseFloat(precio);
      if (isNaN(parsedPrecio) || parsedPrecio <= 0) {
        const error = new Error('El precio de la adición / topping debe ser mayor a $0');
        error.statusCode = 400;
        throw error;
      }
      targetInsumo = await Insumo.create({
        nombre: nombre.trim(),
        descripcion: descripcion || '',
        imagen: imagen || '',
        esAdicion: 1,
        precioAdicion: parsedPrecio,
        precioUnitario: 0,
        stock: 0,
        stockMinimo: 5,
        unidadMedida: 'und',
        estado: estado === 'Inactivo' || estado === 0 ? 0 : 1
      });
    }

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Creado',
      entidadNombre: `Adición: ${targetInsumo.nombre}`,
      detalle: `Se habilitó como adición ${targetInsumo.nombre} por $${targetInsumo.precioAdicion}`,
      idInsumo: targetInsumo.idInsumo,
      motivo: 'Creación/Habilitación de adición',
      skipStockUpdate: true
    }).catch(() => {});

    invalidateNamespaces(['adiciones', 'insumos', 'insumos-preparados', 'productos']);

    return formatAdicion(targetInsumo);
  }

  static async update(id, data) {
    const insumo = await Insumo.findByPk(id);
    if (!insumo) {
      const error = new Error('Adición no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const { nombre, descripcion, imagen, precio, estado, esAdicion } = data;

    if (nombre !== undefined && !String(nombre).trim()) {
      const error = new Error('El nombre del topping / adición no puede estar vacío');
      error.statusCode = 400;
      throw error;
    }

    if (precio !== undefined) {
      const parsedPrecio = parseFloat(precio);
      if (isNaN(parsedPrecio) || parsedPrecio <= 0) {
        const error = new Error('El precio del topping / adición debe ser mayor a $0');
        error.statusCode = 400;
        throw error;
      }
      insumo.precioAdicion = parsedPrecio;
    }

    if (imagen !== undefined && insumo.imagen && insumo.imagen !== imagen && insumo.imagen.startsWith('http')) {
      const { deleteImage } = require('../../infrastructure/services/cloudinaryService');
      deleteImage(insumo.imagen).catch((err) => console.warn('⚠️ Error al eliminar imagen anterior de adición:', err.message));
    }

    if (nombre !== undefined) insumo.nombre = String(nombre).trim();
    if (descripcion !== undefined) insumo.descripcion = descripcion;
    if (imagen !== undefined) insumo.imagen = imagen;
    if (estado !== undefined) insumo.estado = (estado === 'Activo' || estado === 1 || estado === '1' || estado === true) ? 1 : 0;
    if (esAdicion !== undefined) insumo.esAdicion = (esAdicion === 1 || esAdicion === true || esAdicion === '1') ? 1 : 0;
    else insumo.esAdicion = 1;

    await insumo.save();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Editado',
      entidadNombre: `Adición: ${insumo.nombre}`,
      detalle: `Se actualizó el topping/adición ${insumo.nombre} ($${insumo.precioAdicion})`,
      idInsumo: insumo.idInsumo,
      motivo: 'Actualización de adición',
      skipStockUpdate: true
    }).catch(() => {});

    invalidateNamespaces(['adiciones', 'insumos', 'insumos-preparados', 'productos']);

    return formatAdicion(insumo);
  }

  static async softDelete(id) {
    const insumo = await Insumo.findByPk(id);
    if (!insumo) {
      const error = new Error('Adición no encontrada');
      error.statusCode = 404;
      throw error;
    }

    insumo.esAdicion = 0;
    await insumo.save();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Eliminado',
      entidadNombre: `Adición: ${insumo.nombre}`,
      detalle: `Se deshabilitó como adición el insumo: ${insumo.nombre}`,
      idInsumo: insumo.idInsumo,
      motivo: 'Deshabilitación de adición',
      skipStockUpdate: true
    }).catch(() => {});

    invalidateNamespaces(['adiciones', 'insumos', 'insumos-preparados', 'productos']);

    return { message: 'Adición deshabilitada correctamente' };
  }
}

module.exports = AdicionService;
