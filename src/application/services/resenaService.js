const { Op } = require('sequelize');
const { Resena, Product, User, Cliente, Venta, DetalleVentaProducto, Variante } = require('../../persistence/models');

class ResenaService {
  /**
   * Obtiene todas las reseñas activas de un producto con info del usuario.
   */
  static async getByProducto(idProducto) {
    const resenas = await Resena.findAll({
      where: { idProducto, estado: 1 },
      include: [
        {
          model: User,
          as: 'usuario',
          attributes: ['idUsuario', 'nombre', 'apellidos']
        }
      ],
      order: [['fechaResena', 'DESC'], ['idResena', 'DESC']]
    });

    const total = resenas.length;
    const promedio = total > 0
      ? Math.round((resenas.reduce((s, r) => s + r.puntuacion, 0) / total) * 10) / 10
      : 0;

    return {
      promedio,
      total,
      resenas: resenas.map(r => {
        const nombreCompleto = `${r.usuario?.nombre || ''} ${r.usuario?.apellidos || ''}`.trim() || 'Cliente registrado';
        return {
          id: r.idResena,
          idResena: r.idResena,
          idUsuario: r.idUsuario,
          nombre: nombreCompleto,
          usuario: r.usuario ? {
            idUsuario: r.usuario.idUsuario,
            nombre: r.usuario.nombre || '',
            apellidos: r.usuario.apellidos || ''
          } : null,
          puntuacion: Number(r.puntuacion || 0),
          comentario: r.comentario || '',
          fecha: r.fechaResena
        };
      })
    };
  }

  /**
   * Obtiene las reseñas activas más recientes de toda la tienda junto con el promedio y total global real.
   */
  static async getRecientes(limit = 20) {
    const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const [resenas, todasPuntuaciones] = await Promise.all([
      Resena.findAll({
        where: { estado: 1 },
        include: [
          {
            model: User,
            as: 'usuario',
            attributes: ['idUsuario', 'nombre', 'apellidos']
          },
          {
            model: Product,
            as: 'producto',
            attributes: ['idProducto', 'nombre', 'imagen', 'categoria']
          }
        ],
        order: [['fechaResena', 'DESC'], ['idResena', 'DESC']],
        limit: safeLimit
      }),
      Resena.findAll({
        where: { estado: 1 },
        attributes: ['puntuacion'],
        raw: true
      })
    ]);

    const total = todasPuntuaciones.length;
    const promedioGlobal = total > 0
      ? Math.round((todasPuntuaciones.reduce((s, r) => s + Number(r.puntuacion || 0), 0) / total) * 10) / 10
      : 0;

    return {
      promedioGlobal,
      total,
      resenas: resenas.map(r => {
        const nombreCompleto = `${r.usuario?.nombre || ''} ${r.usuario?.apellidos || ''}`.trim() || 'Cliente registrado';
        return {
          id: r.idResena,
          idResena: r.idResena,
          idUsuario: r.idUsuario,
          idProducto: r.idProducto,
          nombre: nombreCompleto,
          usuario: r.usuario ? {
            idUsuario: r.usuario.idUsuario,
            nombre: r.usuario.nombre || '',
            apellidos: r.usuario.apellidos || ''
          } : null,
          productoNombre: r.producto?.nombre || `Producto #${r.idProducto}`,
          productoImagen: r.producto?.imagen || null,
          productoCategoria: r.producto?.categoria || '',
          puntuacion: Number(r.puntuacion || 0),
          comentario: r.comentario || '',
          fecha: r.fechaResena
        };
      })
    };
  }

  /**
   * Obtiene todas las reseñas activas hechas por un usuario con info del producto.
   */
  static async getByUsuario(idUsuario) {
    const resenas = await Resena.findAll({
      where: { idUsuario, estado: 1 },
      include: [
        {
          model: Product,
          as: 'producto',
          attributes: ['idProducto', 'nombre', 'imagen', 'categoria', 'precio']
        }
      ],
      order: [['fechaResena', 'DESC']]
    });

    return resenas.map(r => ({
      id: r.idResena,
      idResena: r.idResena,
      idProducto: r.idProducto,
      productoNombre: r.producto?.nombre || 'Producto no disponible',
      productoImagen: r.producto?.imagen || null,
      productoCategoria: r.producto?.categoria || '',
      puntuacion: r.puntuacion,
      comentario: r.comentario,
      fecha: r.fechaResena,
      fechaResena: r.fechaResena
    }));
  }

  /**
   * Obtiene el resumen de rating de múltiples productos a la vez (para lista de productos).
   * Retorna { [idProducto]: { promedio, total } }
   */
  static async getRatingResumenBulk(idProductos = []) {
    if (!idProductos.length) return {};

    const resenas = await Resena.findAll({
      where: { idProducto: { [Op.in]: idProductos }, estado: 1 },
      attributes: ['idProducto', 'puntuacion']
    });

    const mapa = {};
    resenas.forEach(r => {
      if (!mapa[r.idProducto]) mapa[r.idProducto] = { suma: 0, total: 0 };
      mapa[r.idProducto].suma += r.puntuacion;
      mapa[r.idProducto].total += 1;
    });

    const resultado = {};
    Object.entries(mapa).forEach(([id, { suma, total }]) => {
      resultado[id] = {
        promedio: Math.round((suma / total) * 10) / 10,
        total
      };
    });
    return resultado;
  }

  /**
   * Verifica si el usuario ha comprado ese producto (tiene al menos 1 venta válida/no cancelada con ese producto).
   */
  static async usuarioComproProducto(idUsuario, idProducto) {
    const targetProdId = Number(idProducto);
    if (!idUsuario || !targetProdId) return false;

    const userWithClient = await User.findByPk(idUsuario, {
      include: [{ association: 'clienteInfo', attributes: ['idCliente'] }]
    });

    let idCliente = userWithClient?.clienteInfo?.idCliente || null;
    if (!idCliente) {
      const clienteRow = await Cliente.findOne({
        where: { idUsuario },
        attributes: ['idCliente']
      });
      idCliente = clienteRow?.idCliente || null;
    }
    if (!idCliente) return false;

    const validSaleWhere = {
      idCliente,
      estadoEntrega: { [Op.ne]: 'CANCELADO' },
      [Op.or]: [
        { estadoAprobacion: { [Op.ne]: 'RECHAZADO' } },
        { estadoAprobacion: { [Op.is]: null } }
      ]
    };

    const variantes = await Variante.findAll({
      where: { idProducto: targetProdId },
      attributes: ['idVariante'],
      raw: true
    });
    const varianteIds = variantes.map(v => v.idVariante);

    if (varianteIds.length > 0) {
      const ventaDirecta = await Venta.findOne({
        where: validSaleWhere,
        attributes: ['idVenta'],
        include: [{
          model: DetalleVentaProducto,
          as: 'detalles',
          where: { idVariante: { [Op.in]: varianteIds } },
          attributes: ['idDetalleVenta'],
          required: true
        }]
      });
      if (ventaDirecta) return true;
    }

    // Fallback estructural sobre ventas reales del cliente en BD (ej. combos o variantes guardadas en JSON de observaciones)
    const ventasCliente = await Venta.findAll({
      where: validSaleWhere,
      attributes: ['idVenta', 'observaciones'],
      order: [['idVenta', 'DESC']],
      limit: 50,
      raw: true
    });

    for (const v of ventasCliente) {
      if (!v.observaciones || typeof v.observaciones !== 'string' || !v.observaciones.trim().startsWith('{')) continue;
      try {
        const parsed = JSON.parse(v.observaciones);
        const productosObs = Array.isArray(parsed.productos) ? parsed.productos : [];
        const matched = productosObs.some(p => Number(p?.idProducto || p?.id) === targetProdId);
        if (matched) return true;
      } catch {
        // Ignorar observaciones no JSON
      }
    }

    return false;
  }

  /**
   * Crea una nueva reseña. Valida: usuario compró el producto, una reseña por producto.
   */
  static async create(idUsuario, { idProducto, puntuacion, comentario }) {
    const targetProdId = parseInt(idProducto, 10);
    if (isNaN(targetProdId) || targetProdId <= 0) {
      const err = new Error('Producto inválido para registrar la reseña.');
      err.statusCode = 400;
      throw err;
    }

    // Validar puntuación
    const pts = parseInt(puntuacion, 10);
    if (isNaN(pts) || pts < 1 || pts > 5) {
      const err = new Error('La puntuación debe ser un número entre 1 y 5.');
      err.statusCode = 400;
      throw err;
    }

    // Verificar que compró el producto
    const compro = await this.usuarioComproProducto(idUsuario, targetProdId);
    if (!compro) {
      const err = new Error('Solo puedes reseñar productos que hayas comprado.');
      err.statusCode = 403;
      throw err;
    }

    // Una reseña por usuario por producto
    const existente = await Resena.findOne({ where: { idUsuario, idProducto: targetProdId, estado: 1 } });
    if (existente) {
      const err = new Error('Ya has dejado una reseña para este producto. Puedes editarla.');
      err.statusCode = 409;
      throw err;
    }

    const resena = await Resena.create({
      idUsuario,
      idProducto: targetProdId,
      puntuacion: pts,
      comentario: (comentario || '').trim(),
      fechaResena: new Date(),
      estado: 1
    });

    return {
      id: resena.idResena,
      idResena: resena.idResena,
      idUsuario,
      idProducto: targetProdId,
      puntuacion: resena.puntuacion,
      comentario: resena.comentario,
      fecha: resena.fechaResena
    };
  }

  /**
   * Actualiza la reseña propia del usuario.
   */
  static async update(idResena, idUsuario, { puntuacion, comentario }) {
    const resena = await Resena.findOne({ where: { idResena, idUsuario, estado: 1 } });
    if (!resena) {
      const err = new Error('Reseña no encontrada o no tienes permisos para editarla.');
      err.statusCode = 404;
      throw err;
    }

    const pts = parseInt(puntuacion, 10);
    if (!isNaN(pts) && pts >= 1 && pts <= 5) resena.puntuacion = pts;
    if (comentario !== undefined) resena.comentario = (comentario || '').trim();
    await resena.save();

    return {
      id: resena.idResena,
      idResena: resena.idResena,
      idUsuario,
      idProducto: resena.idProducto,
      puntuacion: resena.puntuacion,
      comentario: resena.comentario,
      fecha: resena.fechaResena
    };
  }

  /**
   * Elimina (soft-delete) la reseña propia del usuario.
   */
  static async delete(idResena, idUsuario) {
    const resena = await Resena.findOne({ where: { idResena, idUsuario, estado: 1 } });
    if (!resena) {
      const err = new Error('Reseña no encontrada o no tienes permisos para eliminarla.');
      err.statusCode = 404;
      throw err;
    }
    resena.estado = 0;
    await resena.save();
    return { message: 'Reseña eliminada correctamente.' };
  }

  /**
   * Obtiene la reseña propia del usuario para un producto.
   */
  static async getMia(idUsuario, idProducto) {
    const resena = await Resena.findOne({ where: { idUsuario, idProducto, estado: 1 } });
    if (!resena) return null;
    return {
      id: resena.idResena,
      idResena: resena.idResena,
      puntuacion: resena.puntuacion,
      comentario: resena.comentario,
      fecha: resena.fechaResena
    };
  }
}

module.exports = ResenaService;
