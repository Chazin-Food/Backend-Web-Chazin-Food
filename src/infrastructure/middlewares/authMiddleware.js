const jwt = require('jsonwebtoken');
const UserService = require('../../application/services/userService');
const {
  getJwtSecret,
  JWT_VERIFY_OPTIONS,
  isTokenRevoked
} = require('../config/jwtConfig');

const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret(), JWT_VERIFY_OPTIONS);

      if (isTokenRevoked(token, decoded)) {
        return res.status(401).json({ message: 'No autorizado, la sesión ha sido revocada o cerrada' });
      }

      const user = await UserService.getUserById(decoded.id);

      if (!user) {
        return res.status(401).json({ message: 'No autorizado, usuario no encontrado' });
      }

      if (
        user.estado === 'INACTIVO' ||
        user.estado === 'PENDIENTE' ||
        user.estado === 0 ||
        user.estado === '0'
      ) {
        return res.status(401).json({ message: 'No autorizado, esta cuenta se encuentra inactiva o pendiente de activación' });
      }

      if (user.rolEstado === 0 || user.rolEstado === '0' || user.rolEstado === 'INACTIVO') {
        return res.status(401).json({ message: 'No autorizado, el rol asignado a esta cuenta ha sido desactivado' });
      }

      req.user = user;
      req.authToken = token;
      req.authDecoded = decoded;
      return next();
    } catch (error) {
      console.error('Error en autenticación de token:', error.message);
      return res.status(401).json({ message: 'No autorizado, token fallido' });
    }
  }

  if (!token) {
    return res.status(401).json({ message: 'No autorizado, sin token' });
  }
};

const authorize = (...roles) => {
  return (req, res, next) => {
    if (req.user && req.user.rol) {
      const userRol = String(req.user.rol).toLowerCase().trim();
      const allowedRoles = roles.map(role => String(role).toLowerCase().trim());

      if (allowedRoles.includes(userRol) || (allowedRoles.includes('administrador') && Number(req.user.idRol) === 1)) {
        return next();
      }
      return res.status(403).json({ message: 'No tienes permisos para acceder a esta ruta' });
    }
    return res.status(403).json({ message: 'No tienes permisos para acceder a esta ruta' });
  };
};

const optionalProtect = async (req, res, next) => {
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      const token = req.headers.authorization.split(' ')[1];
      const decoded = jwt.verify(token, getJwtSecret(), JWT_VERIFY_OPTIONS);
      if (!isTokenRevoked(token, decoded)) {
        const user = await UserService.getUserById(decoded.id);
        if (
          user &&
          user.estado !== 'INACTIVO' &&
          user.estado !== 'PENDIENTE' &&
          user.estado !== 0 &&
          user.estado !== '0' &&
          user.rolEstado !== 0 &&
          user.rolEstado !== '0' &&
          user.rolEstado !== 'INACTIVO'
        ) {
          req.user = user;
          req.authToken = token;
          req.authDecoded = decoded;
        }
      }
    } catch (e) {
      // Token inválido o expirado, continuar sin req.user
    }
  }
  return next();
};

/**
 * Helper reutilizable para comprobar privilegios granulares ("Modulo" y "Modulo:Accion").
 * - Administrador siempre tiene acceso total.
 * - Cocinero solo tiene lectura en Producción/Fichas Técnicas/Productos/Insumos y edición únicamente en Gestión de Producción.
 */
const userHasPrivilege = (user, modulos, accion = 'Ver') => {
  if (!user) return false;
  const targetModulos = Array.isArray(modulos) ? modulos : [modulos];
  const normAccion = String(accion || 'Ver');
  const capAccion = normAccion.charAt(0).toUpperCase() + normAccion.slice(1).toLowerCase();

  const userRol = String(user.rol || '').toLowerCase().trim();
  if (userRol === 'administrador' || userRol === 'admin' || Number(user.idRol) === 1) {
    return true;
  }

  // Permisos estrictos del rol Cocinero: sin escritura en Productos, Insumos ni Fichas Técnicas
  if (userRol === 'cocinero') {
    if (targetModulos.includes('Gestión de Producción') && (capAccion === 'Ver' || capAccion === 'Editar')) {
      return true;
    }
    const cocinaReadOnly = ['Fichas Técnicas', 'Productos', 'Insumos'];
    if (targetModulos.some(m => cocinaReadOnly.includes(m)) && capAccion === 'Ver') {
      return true;
    }
  }

  const permisos = Array.isArray(user.permisos) ? user.permisos : [];

  const expandedTargets = [...targetModulos];
  if (targetModulos.includes('Gestión de Ventas') && !expandedTargets.includes('Punto de Venta')) {
    expandedTargets.push('Punto de Venta');
  }

  return expandedTargets.some((mod) => {
    const hasModule = permisos.includes(mod) || permisos.some(p => p.startsWith(`${mod}:`));
    if (!hasModule) return false;
    const hasGranular = permisos.some(p => p.startsWith(`${mod}:`));
    if (!hasGranular) return true;
    return permisos.includes(`${mod}:${capAccion}`);
  });
};

const requirePrivilege = (modulos, accion = 'Ver') => {
  const targetModulos = Array.isArray(modulos) ? modulos : [modulos];
  const normAccion = String(accion || 'Ver');
  const capAccion = normAccion.charAt(0).toUpperCase() + normAccion.slice(1).toLowerCase();

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'No autorizado, debes iniciar sesión' });
    }

    if (!userHasPrivilege(req.user, targetModulos, capAccion)) {
      return res.status(403).json({
        message: `No tienes privilegios de "${capAccion}" para realizar esta acción en ${targetModulos[0]}.`
      });
    }

    return next();
  };
};

module.exports = {
  protect,
  optionalProtect,
  authorize,
  requirePrivilege,
  userHasPrivilege
};
