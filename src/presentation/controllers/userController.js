const bcrypt = require('bcryptjs');
const UserService = require('../../application/services/userService');
const { User } = require('../../persistence/models');

const SELF_EDIT_ALLOWLIST = ['nombre', 'apellidos', 'apellido', 'telefono', 'direccion', 'foto', 'avatar'];

const getUsers = async (req, res, next) => {
  try {
    const users = await UserService.getAllUsers({
      page: req.query.page,
      limit: req.query.limit,
      search: req.query.search,
      rol: req.query.rol,
      estado: req.query.estado
    });
    res.json(users);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const getUserById = async (req, res, next) => {
  try {
    const user = await UserService.getUserById(req.params.id);
    res.json(user);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const createUser = async (req, res, next) => {
  try {
    const newUser = await UserService.createUser(req.body);
    res.status(201).json(newUser);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const updateUser = async (req, res, next) => {
  try {
    let payload = req.body || {};
    // Seguridad (AUD-002): si el usuario se autoedita sin permiso Usuarios:Editar, aplicar lista blanca estricta (sin idRol, estado ni contraseña directa)
    if (req.isSelfOnlyEdit) {
      const sanitized = {};
      for (const k of SELF_EDIT_ALLOWLIST) {
        if (payload[k] !== undefined) sanitized[k] = payload[k];
      }
      payload = sanitized;
    }
    const updatedUser = await UserService.updateUser(req.params.id, payload);
    res.json(updatedUser);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const toggleUserStatus = async (req, res, next) => {
  try {
    const { estado } = req.body;
    const updatedUser = await UserService.toggleStatus(req.params.id, estado);
    res.json(updatedUser);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const changeUserPassword = async (req, res, next) => {
  try {
    const { passwordActual, currentPassword, password, contrasena, contraseña, notificarEmail, notificarCambios } = req.body || {};
    const newPass = password || contrasena || contraseña;

    if (!newPass || String(newPass).length < 6) {
      return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres' });
    }

    // Seguridad (AUD-018): si un usuario cambia su propia contraseña sin privilegio Usuarios:Editar,
    // exigir contraseña actual salvo cuando es usuario Google OAuth sin contraseña local asignada aún.
    if (req.isSelfOnlyEdit) {
      const AuthService = require('../../application/services/authService');
      const { Cliente } = require('../../persistence/models');
      const dbUser = await User.findByPk(req.params.id, {
        include: [{ model: Cliente, as: 'clienteInfo' }]
      });
      if (!dbUser) {
        return res.status(404).json({ message: 'Usuario no encontrado' });
      }
      const authFlags = AuthService.resolveUserAuthFlags(dbUser, dbUser.clienteInfo);
      const canCreateFirstLocalPassword = authFlags.esUsuarioGoogle && !authFlags.tienePassword;

      if (!canCreateFirstLocalPassword) {
        const providedCurrent = passwordActual || currentPassword;
        if (!providedCurrent) {
          return res.status(400).json({ message: 'Debes ingresar tu contraseña actual para cambiarla' });
        }
        const isMatch = await bcrypt.compare(String(providedCurrent), dbUser.contrasena);
        if (!isMatch) {
          return res.status(400).json({ message: 'La contraseña actual es incorrecta' });
        }
      }
    }

    const updatedUser = await UserService.updateUser(req.params.id, {
      contrasena: newPass,
      notificarEmail: notificarEmail !== undefined ? notificarEmail : notificarCambios
    });
    res.json(updatedUser);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

const deleteUser = async (req, res, next) => {
  try {
    const result = await UserService.deleteUser(req.params.id);
    res.json(result);
  } catch (error) {
    if (error.statusCode) res.status(error.statusCode);
    next(error);
  }
};

module.exports = {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  changeUserPassword,
  toggleUserStatus,
  deleteUser,
};
