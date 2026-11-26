const VentaService = require('../../application/services/ventaService');
const { Cliente } = require('../../persistence/models');
const { userHasPrivilege } = require('../../infrastructure/middlewares/authMiddleware');

const isClienteRole = (user) => String(user?.rol || '').toLowerCase().trim() === 'cliente' || Number(user?.idRol) === 4;
const STAFF_VENTAS_VIEW = ['Gestión de Ventas', 'Gestión de Producción', 'Dashboard'];

/**
 * Devuelve true si la venta pertenece al cliente autenticado (por cuenta de usuario o registro de cliente).
 */
const ventaPerteneceAlCliente = (venta, idUsuario, idCliente) => {
  if (!venta) return false;
  if (idCliente && Number(venta.idCliente) === Number(idCliente)) return true;
  if (idUsuario && Number(venta.idUsuario) === Number(idUsuario) && !idCliente) return true;
  return false;
};

const getClienteIdDeUsuario = async (idUsuario) => {
  if (!idUsuario) return null;
  const cliente = await Cliente.findOne({ where: { idUsuario } });
  return cliente ? cliente.idCliente : null;
};

const getVentas = async (req, res, next) => {
  try {
    const canViewAll = userHasPrivilege(req.user, STAFF_VENTAS_VIEW, 'Ver');
    if (!canViewAll && !isClienteRole(req.user)) {
      return res.status(403).json({ message: 'No tienes privilegios para consultar las ventas del sistema.' });
    }

    const filter = {
      periodo: req.query.periodo,
      estado: req.query.estado,
      search: req.query.search,
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
      origen: req.query.origen,
      tipoEntrega: req.query.tipoEntrega,
      metodoPago: req.query.metodoPago,
      page: req.query.page,
      limit: req.query.limit
    };

    // Los clientes solo pueden consultar sus propios pedidos ("Mis Pedidos") — filtrado directo en SQL
    if (!canViewAll) {
      const idUsuario = req.user.idUsuario || req.user.id;
      const idCliente = await getClienteIdDeUsuario(idUsuario);
      filter.scopeClienteId = idCliente;
      filter.scopeUsuarioId = idUsuario;
    }

    const ventas = await VentaService.getAll(filter);
    res.json(ventas);
  } catch (error) {
    next(error);
  }
};

const getVentasStats = async (req, res, next) => {
  try {
    const filter = {
      periodo: req.query.periodo,
      estado: req.query.estado,
      fechaInicio: req.query.fechaInicio,
      fechaFin: req.query.fechaFin,
      startDate: req.query.startDate,
      endDate: req.query.endDate
    };
    const stats = await VentaService.getStats(filter);
    res.json(stats);
  } catch (error) {
    next(error);
  }
};

const getVentaById = async (req, res, next) => {
  try {
    const canViewAll = userHasPrivilege(req.user, STAFF_VENTAS_VIEW, 'Ver');
    if (!canViewAll && !isClienteRole(req.user)) {
      return res.status(403).json({ message: 'No tienes privilegios para consultar este pedido.' });
    }
    const venta = await VentaService.getById(req.params.id);
    if (!canViewAll) {
      const idUsuario = req.user.idUsuario || req.user.id;
      const idCliente = await getClienteIdDeUsuario(idUsuario);
      if (!ventaPerteneceAlCliente(venta, idUsuario, idCliente)) {
        return res.status(403).json({ message: 'No tienes permiso para consultar este pedido.' });
      }
    }
    res.json(venta);
  } catch (error) {
    next(error);
  }
};

const createVenta = async (req, res, next) => {
  try {
    const canCreateStaffSale = userHasPrivilege(req.user, ['Gestión de Ventas', 'Punto de Venta'], 'Crear');
    if (!canCreateStaffSale && !isClienteRole(req.user)) {
      return res.status(403).json({ message: 'No tienes privilegios para registrar ventas.' });
    }

    // Seguridad (AUD-004 / AUD-005): nunca permitir esDevolucion ni _trustedDevolucion desde HTTP, ni suplantar idUsuario
    const payload = { ...(req.body || {}) };
    delete payload.esDevolucion;
    delete payload._trustedDevolucion;
    delete payload.aprobadoPorUsuarioId;
    payload.idUsuario = req.user.idUsuario || req.user.id;

    if (!canCreateStaffSale) {
      // Un cliente nunca puede auto-aprobar su pago ni fijar estado entregado ni suplantar otro cliente
      delete payload.estadoAprobacion;
      delete payload.estadoPago;
      delete payload.estadoEntrega;
      delete payload.estado;
      delete payload.idCliente;
      delete payload.subtotal;
      delete payload.total;
      delete payload.descuento;
      delete payload.descuentoAplicado;
      payload.origen = 'ONLINE';
    }

    const venta = await VentaService.create(payload);
    res.status(201).json(venta);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const updateEstadoVenta = async (req, res, next) => {
  try {
    const venta = await VentaService.updateEstado(req.params.id, req.body.estado);
    res.json(venta);
  } catch (error) {
    next(error);
  }
};

const updateTiempoEntregaVenta = async (req, res, next) => {
  try {
    const venta = await VentaService.updateTiempoEntrega(req.params.id, req.body.tiempoEstimadoEntrega || req.body.tiempoEstimado, req.body.modoTiempoEntrega || req.body.modo);
    res.json(venta);
  } catch (error) {
    next(error);
  }
};

const aprobarPagoVenta = async (req, res, next) => {
  try {
    const venta = await VentaService.aprobarPago(req.params.id, req.user);
    res.json({ message: 'Pago aprobado exitosamente. El pedido ha pasado a producción.', venta });
  } catch (error) {
    next(error);
  }
};

const cancelarVenta = async (req, res, next) => {
  try {
    const canManageSales = userHasPrivilege(req.user, 'Gestión de Ventas', 'Editar');
    if (!canManageSales) {
      // Un usuario autenticado solo puede cancelar sus propios pedidos mientras sigan pendientes
      // (incluye intenciones Wompi no pagadas cerradas antes de confirmar)
      const venta = await VentaService.getById(req.params.id);
      const idUsuario = req.user.idUsuario || req.user.id;
      const idCliente = await getClienteIdDeUsuario(idUsuario);
      const esPropietario =
        ventaPerteneceAlCliente(venta, idUsuario, idCliente) ||
        (idUsuario && Number(venta?.idUsuario) === Number(idUsuario));
      if (!esPropietario) {
        return res.status(403).json({ message: 'No tienes permiso para cancelar este pedido.' });
      }
      if (String(venta.estadoEntrega || '').toUpperCase() !== 'PENDIENTE') {
        return res.status(400).json({ message: 'Solo puedes cancelar pedidos que aún no han entrado a preparación.' });
      }
    }
    const venta = await VentaService.cancelar(req.params.id);
    res.json(venta);
  } catch (error) {
    next(error);
  }
};

const confirmarEntregaCliente = async (req, res, next) => {
  try {
    const venta = await VentaService.confirmarEntregaCliente(req.params.id, req.user);
    res.json({
      message: 'Entrega confirmada exitosamente. ¡Gracias por tu compra!',
      venta
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const agregarProductosVenta = async (req, res, next) => {
  try {
    const canManageSales =
      userHasPrivilege(req.user, ['Gestión de Ventas', 'Punto de Venta'], 'Editar') ||
      userHasPrivilege(req.user, ['Gestión de Ventas', 'Punto de Venta'], 'Crear');
    if (!canManageSales && !isClienteRole(req.user)) {
      return res.status(403).json({ message: 'No tienes permiso para agregar productos a este pedido.' });
    }

    if (!canManageSales) {
      const existing = await VentaService.getById(req.params.id);
      const idUsuario = req.user.idUsuario || req.user.id;
      const idCliente = await getClienteIdDeUsuario(idUsuario);
      const esPropietario =
        ventaPerteneceAlCliente(existing, idUsuario, idCliente) ||
        (idUsuario && Number(existing?.idUsuario) === Number(idUsuario));
      if (!esPropietario) {
        return res.status(403).json({ message: 'No tienes permiso para modificar este pedido.' });
      }
    }

    const venta = await VentaService.agregarProductos(req.params.id, req.body, req.user);
    res.json({
      message: 'Productos agregados correctamente al pedido.',
      venta
    });
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

module.exports = {
  getVentas,
  getVentasStats,
  getVentaById,
  createVenta,
  updateEstadoVenta,
  updateTiempoEntregaVenta,
  cancelarVenta,
  aprobarPagoVenta,
  confirmarEntregaCliente,
  agregarProductosVenta
};
