const { Op } = require('sequelize');
const { Insumo, LoteInsumo } = require('../../persistence/models');
const { getColombiaDateISO } = require('../../infrastructure/utils/colombiaDateUtils');
const { computeInsumoStockBreakdown, groupLotesByInsumo } = require('../../infrastructure/utils/stockFefoUtils');

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
      targetInsumo.esAdicion = 1;
      if (precio !== undefined) targetInsumo.precioAdicion = parseFloat(precio);
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
      targetInsumo = await Insumo.create({
        nombre: nombre.trim(),
        descripcion: descripcion || '',
        imagen: imagen || '',
        esAdicion: 1,
        precioAdicion: parseFloat(precio),
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
    });

    return formatAdicion(targetInsumo);
  }

  static async update(id, data) {
    const insumo = await Insumo.findByPk(id);
    if (!insumo) {
      const error = new Error('Adición no encontrada');
      error.statusCode = 404;
      throw error;
    }

    const { nombre, descripcion, imagen, precio, estado } = data;

    if (imagen !== undefined && insumo.imagen && insumo.imagen !== imagen && insumo.imagen.startsWith('http')) {
      const { deleteImage } = require('../../infrastructure/services/cloudinaryService');
      deleteImage(insumo.imagen).catch((err) => console.warn('⚠️ Error al eliminar imagen anterior de adición:', err.message));
    }

    if (nombre !== undefined) insumo.nombre = nombre.trim();
    if (descripcion !== undefined) insumo.descripcion = descripcion;
    if (imagen !== undefined) insumo.imagen = imagen;
    if (precio !== undefined) insumo.precioAdicion = parseFloat(precio);
    if (estado !== undefined) insumo.estado = (estado === 'Activo' || estado === 1 || estado === '1') ? 1 : 0;

    await insumo.save();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Editado',
      entidadNombre: `Adición: ${insumo.nombre}`,
      detalle: `Se actualizó la adición ${insumo.nombre}`,
      idInsumo: insumo.idInsumo,
      motivo: 'Actualización de adición',
      skipStockUpdate: true
    });

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
    });

    return { message: 'Adición deshabilitada correctamente' };
  }
}

module.exports = AdicionService;
