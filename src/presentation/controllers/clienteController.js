const ClienteService = require('../../application/services/clienteService');
const { userHasPrivilege } = require('../../infrastructure/middlewares/authMiddleware');

const getClientes = async (req, res, next) => {
  try {
    const clientes = await ClienteService.getAll({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      estado: req.query.estado,
      tipo: req.query.tipo
    });
    res.json(clientes);
  } catch (error) {
    next(error);
  }
};

const getClientesStats = async (req, res, next) => {
  try {
    const stats = await ClienteService.getClientesStats();
    res.json(stats);
  } catch (error) {
    next(error);
  }
};

const getClienteById = async (req, res, next) => {
  try {
    const canViewAll = userHasPrivilege(req.user, ['Clientes', 'Gestión de Ventas'], 'Ver');
    const cliente = await ClienteService.getById(req.params.id);
    if (!canViewAll) {
      const reqUserId = Number(req.user?.idUsuario || req.user?.id || 0);
      const ownerUserId = Number(cliente?.idUsuario || 0);
      if (!reqUserId || reqUserId !== ownerUserId) {
        return res.status(403).json({ message: 'No tienes permisos para consultar la información de este cliente.' });
      }
    }
    res.json(cliente);
  } catch (error) {
    next(error);
  }
};

const createCliente = async (req, res, next) => {
  try {
    const cliente = await ClienteService.create(req.body);
    res.status(201).json(cliente);
  } catch (error) {
    next(error);
  }
};

const updateCliente = async (req, res, next) => {
  try {
    const cliente = await ClienteService.update(req.params.id, req.body);
    res.json(cliente);
  } catch (error) {
    next(error);
  }
};

const deleteCliente = async (req, res, next) => {
  try {
    const result = await ClienteService.delete(req.params.id);
    res.json(result);
  } catch (error) {
    next(error);
  }
};

const getFidelidadCatalogo = async (req, res, next) => {
  try {
    const catalogo = ClienteService.getCatalogoFidelidad();
    res.json(catalogo);
  } catch (error) {
    next(error);
  }
};

module.exports = { getClientes, getClientesStats, getClienteById, createCliente, updateCliente, deleteCliente, getFidelidadCatalogo };

