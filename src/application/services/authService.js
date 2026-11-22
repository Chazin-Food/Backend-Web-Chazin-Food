const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Role, Cliente, Permiso } = require('../../persistence/models');
const { sanitizeTelefono, sanitizeDocumento, cleanNameAndLastName, formatNombreCompleto, isValidEmailStrict, isValidPersonName } = require('../../infrastructure/utils/validationUtils');
const EmailService = require('./emailService');
const {
  getJwtSecret,
  JWT_VERIFY_OPTIONS,
  JWT_SESSION_TTL,
  revokeAllUserTokens
} = require('../../infrastructure/config/jwtConfig');

// Hash dummy para igualar el tiempo de respuesta cuando el correo no existe (mitigación de timing oracle)
const DUMMY_BCRYPT_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';
const GOOGLE_OAUTH_NO_PASSWORD_PREFIX = 'OAUTH_GOOGLE_UNSET_';

function isBcryptHash(value) {
  return /^\$2[aby]\$\d{2}\$.{53}$/.test(String(value || ''));
}

function parseClienteMeta(clienteInfo) {
  const raw = clienteInfo?.direccion;
  if (!raw || typeof raw !== 'string') return {};
  const trimmed = raw.trim();
  if (!trimmed.startsWith('{')) return {};
  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function resolveUserAuthFlags(user, clienteInfo = null) {
  const rawPass = String(user?.contrasena || '');
  const hasUnsetMarker = !rawPass || rawPass.startsWith(GOOGLE_OAUTH_NO_PASSWORD_PREFIX) || !isBcryptHash(rawPass);
  const meta = parseClienteMeta(clienteInfo || user?.clienteInfo);
  const esUsuarioGoogle = Boolean(
    meta.googleVinculado === true ||
    meta.authProvider === 'google' ||
    rawPass.startsWith(GOOGLE_OAUTH_NO_PASSWORD_PREFIX) ||
    (user?.foto && String(user.foto).includes('googleusercontent.com'))
  );

  let tienePassword = true;
  if (hasUnsetMarker) {
    tienePassword = false;
  } else if (meta.tienePasswordLocal === true) {
    tienePassword = true;
  } else if (meta.tienePasswordLocal === false) {
    tienePassword = false;
  } else if (esUsuarioGoogle) {
    // Usuarios Google creados previamente con hash aleatorio placeholder que aún no han creado contraseña local
    tienePassword = false;
  }

  return {
    esUsuarioGoogle,
    tienePassword,
    tiene_password: tienePassword
  };
}

async function persistClienteAuthMeta(user, patch = {}) {
  if (!user || !user.idUsuario || !patch || Object.keys(patch).length === 0) return;
  try {
    let cliente = user.clienteInfo || await Cliente.findOne({ where: { idUsuario: user.idUsuario } });
    if (cliente) {
      const existingRaw = typeof cliente.direccion === 'string' ? cliente.direccion.trim() : '';
      let meta = parseClienteMeta(cliente);
      if (Object.keys(meta).length === 0 && existingRaw && !existingRaw.startsWith('{')) {
        meta = { direccion: existingRaw };
      }
      const nextMeta = { ...meta, ...patch };
      cliente.direccion = JSON.stringify(nextMeta);
      await cliente.save();
      if (user.clienteInfo) {
        user.clienteInfo.direccion = cliente.direccion;
      }
    }
  } catch (err) {
    console.warn('Advertencia actualizando metadata auth en cliente:', err.message);
  }
}

function getCleanDireccion(raw) {
  if (!raw) return '';
  if (typeof raw === 'string' && raw.trim().startsWith('{')) {
    try {
      const obj = JSON.parse(raw);
      return obj.direccion !== undefined ? obj.direccion : raw;
    } catch (e) {
      return raw;
    }
  }
  return raw;
}

class AuthService {
  static generateToken(id) {
    return jwt.sign(
      { id, jti: crypto.randomUUID() },
      getJwtSecret(),
      {
        algorithm: 'HS256',
        expiresIn: JWT_SESSION_TTL,
      }
    );
  }

  static async register(userData) {
    // Seguridad (AUD-002): el registro público ignora idRol/rol_id/estado del cliente y asigna siempre el rol Cliente
    const { idUsuario, documento, numeroDocumento, nombre, apellidos, apellido, email, correo, contrasena, contraseña, tipoDocumento, telefono, direccion } = userData || {};
    const finalEmail = (email || correo || '').trim().toLowerCase();
    const finalPassword = contrasena || contraseña;
    const rawApellido = apellidos || apellido || '';
    const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(nombre, rawApellido);
    const cleanTel = sanitizeTelefono(telefono);
    const cleanTipoDoc = tipoDocumento || 'C.C.';
    const finalDocumento = sanitizeDocumento(documento || numeroDocumento || idUsuario || '', cleanTipoDoc);

    if (!finalEmail || !finalPassword || !cleanNom) {
      const error = new Error('Por favor complete todos los campos requeridos');
      error.statusCode = 400;
      throw error;
    }

    if (String(finalPassword).length < 6) {
      const error = new Error('La contraseña debe tener al menos 6 caracteres');
      error.statusCode = 400;
      throw error;
    }

    if (!isValidPersonName(cleanNom) || (cleanApe && !isValidPersonName(cleanApe))) {
      const error = new Error('El nombre y los apellidos no pueden contener números ni el símbolo @');
      error.statusCode = 400;
      throw error;
    }

    if (!isValidEmailStrict(finalEmail)) {
      const error = new Error('El correo electrónico debe incluir @ y un dominio válido (ej: usuario@dominio.com)');
      error.statusCode = 400;
      throw error;
    }

    // 1. Email Uniqueness
    const existingUser = await User.findOne({ where: { email: finalEmail } });
    if (existingUser) {
      const error = new Error('El usuario ya existe con este correo');
      error.statusCode = 400;
      throw error;
    }

    // 2. Full Name Uniqueness
    const newFullName = formatNombreCompleto(cleanNom, cleanApe).toLowerCase();
    const allUsers = await User.findAll({ attributes: ['idUsuario', 'nombre', 'apellidos'] });
    const duplicateName = allUsers.some(u => formatNombreCompleto(u.nombre, u.apellidos).toLowerCase() === newFullName);
    if (duplicateName) {
      const error = new Error(`Ya existe un usuario registrado con el nombre "${formatNombreCompleto(cleanNom, cleanApe)}"`);
      error.statusCode = 400;
      throw error;
    }

    // 3. Document Number Uniqueness
    if (finalDocumento) {
      const existingDoc = await User.findOne({
        where: {
          [Op.or]: [
            { numeroDocumento: finalDocumento },
            ...(!isNaN(parseInt(finalDocumento)) ? [{ idUsuario: parseInt(finalDocumento) }] : [])
          ]
        }
      });
      if (existingDoc) {
        const error = new Error(`Ya existe un usuario registrado con el número de documento "${finalDocumento}"`);
        error.statusCode = 400;
        throw error;
      }
    }

    const clienteRol = await Role.findOne({ where: { nombre: 'Cliente' } });
    const finalRolId = clienteRol ? clienteRol.idRol : 4;

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(finalPassword, salt);

    const userPayload = {
      nombre: cleanNom,
      apellidos: cleanApe,
      tipoDocumento: cleanTipoDoc,
      numeroDocumento: finalDocumento || null,
      telefono: cleanTel,
      email: finalEmail,
      contrasena: hashedPassword,
      idRol: finalRolId,
      estado: 'ACTIVO',
      fechaRegistro: new Date()
    };

    const user = await User.create(userPayload);

    let createdCliente = null;
    if (finalRolId === 4) {
      try {
        const cleanDir = getCleanDireccion(direccion || '');
        const metaStr = JSON.stringify({
          direccion: cleanDir,
          tipo: 'Nuevo',
          descuentoPorcentaje: 0,
          nombre: cleanNom,
          apellidos: cleanApe,
          telefono: cleanTel,
          ciclo: 0,
          tienePasswordLocal: true
        });
        createdCliente = await Cliente.create({
          idUsuario: user.idUsuario,
          direccion: metaStr,
          estado: 1
        });
      } catch (err) {
        console.warn('Advertencia al crear registro de cliente:', err.message);
      }
    }

    // Send welcome email upon registration (sin exponer la contraseña en texto plano)
    const userPlainReg = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
    EmailService.sendWelcomeEmail({
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      esGoogle: false,
      usuario: { ...userPlainReg, direccion: getCleanDireccion(direccion || '') }
    }).catch(err => console.error('Background welcome email error in register:', err.message));

    const role = await Role.findByPk(user.idRol);

    return {
      _id: user.idUsuario,
      id: user.idUsuario,
      idUsuario: user.idUsuario,
      idCliente: createdCliente ? createdCliente.idCliente : null,
      nombre: user.nombre,
      apellidos: user.apellidos,
      apellido: user.apellidos,
      tipoDocumento: user.tipoDocumento || 'C.C.',
      numeroDocumento: (finalDocumento && String(finalDocumento).trim().length >= 6) ? String(finalDocumento).trim() : '',
      documento: (finalDocumento && String(finalDocumento).trim().length >= 6) ? String(finalDocumento).trim() : '',
      tieneCedulaRegistrada: Boolean(finalDocumento && String(finalDocumento).trim().length >= 6),
      esUsuarioGoogle: false,
      tienePassword: true,
      tiene_password: true,
      telefono: user.telefono || '',
      email: user.email,
      correo: user.email,
      rol: role ? role.nombre : 'Cliente',
      idRol: user.idRol,
      direccion: getCleanDireccion(direccion || ''),
      tipo: 'Nuevo',
      descuentoPorcentaje: 0,
      fidelidad: {
        tipo: 'Nuevo',
        descuentoPorcentaje: 0,
        comprasCiclo: 0,
        comprasTotales: 0,
        comprasFaltantes: 3,
        comprasMeta: 3,
        progresoPorcentaje: 0,
        siguienteNivel: 'Regular',
        diasRestantes: null,
        enGracia: false,
        diasGraciaRestantes: 0,
        estadoCiclo: 'ACTIVO'
      },
      token: this.generateToken(user.idUsuario)
    };
  }

  static async login(email, password) {
    const finalEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!finalEmail || !password) {
      const error = new Error('Por favor proporcione correo y contraseña');
      error.statusCode = 400;
      throw error;
    }

    const normalizedEmail = finalEmail.replace(/@chanzinfood\.com$/i, '@chazinfood.com');

    const { Sequelize, Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        [Op.or]: [
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), finalEmail),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), normalizedEmail),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), `${finalEmail}.com`),
          Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), `${normalizedEmail}.com`)
        ]
      },
      include: [
        { model: Role, as: 'rolInfo', include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] },
        { model: Cliente, as: 'clienteInfo' }
      ]
    });

    if (!user) {
      await bcrypt.compare(String(password), DUMMY_BCRYPT_HASH);
      const error = new Error('Credenciales inválidas');
      error.statusCode = 401;
      throw error;
    }

    // Verificar contraseña ANTES de revelar estados de cuenta (mitiga enumeración pre-bcrypt)
    const isMatch = isBcryptHash(user.contrasena)
      ? await bcrypt.compare(password, user.contrasena)
      : await bcrypt.compare(String(password), DUMMY_BCRYPT_HASH).then(() => false);
    if (!isMatch) {
      const error = new Error('Credenciales inválidas');
      error.statusCode = 401;
      throw error;
    }

    // Confirmar bandera de contraseña local tras login exitoso con correo/contraseña
    if (user.clienteInfo) {
      const loginMeta = parseClienteMeta(user.clienteInfo);
      if (loginMeta.tienePasswordLocal !== true) {
        await persistClienteAuthMeta(user, { tienePasswordLocal: true });
      }
    }

    if (user.estado === 'PENDIENTE') {
      const error = new Error('Tu cuenta está pendiente de activación. Revisa tu correo electrónico para activar tu acceso y definir tu contraseña.');
      error.statusCode = 403;
      throw error;
    }

    if (user.estado === 'INACTIVO' || user.estado === '0' || user.estado === 0) {
      const error = new Error('Tu usuario está inactivo. Comunícate con el administrador para activar tu cuenta.');
      error.statusCode = 403;
      throw error;
    }

    if (user.rolInfo && (user.rolInfo.estado === 0 || user.rolInfo.estado === '0')) {
      const error = new Error('El rol asignado a tu cuenta se encuentra inactivo. Comunícate con el administrador.');
      error.statusCode = 403;
      throw error;
    }

    const rolNombre = user.rolInfo ? user.rolInfo.nombre : 'Usuario';
    const direccion = getCleanDireccion(user.clienteInfo ? user.clienteInfo.direccion : '');
    // Extract permission names from the role's associated permissions
    const permisos = user.rolInfo && user.rolInfo.permisos
      ? user.rolInfo.permisos.map(p => p.nombrePermiso)
      : [];

    let fidelidadObj = null;
    let preferenciasCompra = null;
    let idCliente = null;
    let tipoCliente = 'Nuevo';
    let descuentoPorcentaje = 0;

    if (!user.clienteInfo && (user.idRol === 4 || user.rolInfo?.nombre?.toLowerCase() === 'cliente')) {
      try {
        const [clientRecord] = await Cliente.findOrCreate({
          where: { idUsuario: user.idUsuario },
          defaults: {
            idUsuario: user.idUsuario,
            direccion: JSON.stringify({
              direccion: '',
              tipo: 'Nuevo',
              ciclo: 0,
              nombre: user.nombre,
              apellidos: user.apellidos,
              telefono: user.telefono,
              estado: 'Activo',
              tienePasswordLocal: true
            }),
            estado: 1
          }
        });
        user.clienteInfo = clientRecord;
      } catch (err) {
        console.warn('Error asegurando clienteInfo en login:', err.message);
      }
    }

    if (user.clienteInfo) {
      try {
        const ClienteService = require('./clienteService');
        user.clienteInfo.usuario = user;
        const formattedCliente = await ClienteService.formatCliente(user.clienteInfo);
        idCliente = formattedCliente.id;
        fidelidadObj = formattedCliente.fidelidad;
        preferenciasCompra = formattedCliente.preferenciasCompra || null;
        tipoCliente = formattedCliente.tipo;
        descuentoPorcentaje = formattedCliente.descuentoPorcentaje;
      } catch (e) {
        idCliente = user.clienteInfo.idCliente;
      }
    }

    let metaFoto = null;
    if (user.clienteInfo?.direccion && user.clienteInfo.direccion.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(user.clienteInfo.direccion);
        metaFoto = meta.foto || meta.avatar || null;
      } catch (e) {}
    }
    const finalFoto = user.foto || metaFoto || null;
    const authFlags = resolveUserAuthFlags(user, user.clienteInfo);

    return {
      _id: user.idUsuario,
      id: user.idUsuario,
      idUsuario: user.idUsuario,
      idCliente,
      nombre: user.nombre,
      apellidos: user.apellidos,
      apellido: user.apellidos,
      tipoDocumento: user.tipoDocumento || 'C.C.',
      numeroDocumento: (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '',
      tieneCedulaRegistrada: Boolean(user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6),
      esUsuarioGoogle: authFlags.esUsuarioGoogle,
      tienePassword: authFlags.tienePassword,
      tiene_password: authFlags.tiene_password,
      documento: (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '',
      telefono: user.telefono,
      email: user.email,
      correo: user.email,
      rol: rolNombre,
      idRol: user.idRol,
      permisos,
      direccion,
      tipo: tipoCliente,
      descuentoPorcentaje,
      fidelidad: fidelidadObj,
      preferenciasCompra,
      foto: finalFoto,
      avatar: finalFoto,
      token: this.generateToken(user.idUsuario)
    };
  }

  static async getUserProfile(userId) {
    const user = await User.findByPk(userId, {
      include: [
        { model: Role, as: 'rolInfo', include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] },
        { model: Cliente, as: 'clienteInfo' }
      ]
    });

    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const permisos = user.rolInfo && user.rolInfo.permisos
      ? user.rolInfo.permisos.map(p => p.nombrePermiso)
      : [];

    let fidelidadObj = null;
    let preferenciasCompra = null;
    let idCliente = null;
    let tipoCliente = 'Nuevo';
    let descuentoPorcentaje = 0;

    if (!user.clienteInfo && (user.idRol === 4 || user.rolInfo?.nombre?.toLowerCase() === 'cliente')) {
      try {
        const [clientRecord] = await Cliente.findOrCreate({
          where: { idUsuario: user.idUsuario },
          defaults: {
            idUsuario: user.idUsuario,
            direccion: JSON.stringify({
              direccion: '',
              tipo: 'Nuevo',
              ciclo: 0,
              nombre: user.nombre,
              apellidos: user.apellidos,
              telefono: user.telefono,
              estado: 'Activo'
            }),
            estado: 1
          }
        });
        user.clienteInfo = clientRecord;
      } catch (err) {
        console.warn('Error asegurando clienteInfo en getUserProfile:', err.message);
      }
    }

    if (user.clienteInfo) {
      try {
        const ClienteService = require('./clienteService');
        user.clienteInfo.usuario = user;
        const formattedCliente = await ClienteService.formatCliente(user.clienteInfo);
        idCliente = formattedCliente.id;
        fidelidadObj = formattedCliente.fidelidad;
        preferenciasCompra = formattedCliente.preferenciasCompra || null;
        tipoCliente = formattedCliente.tipo;
        descuentoPorcentaje = formattedCliente.descuentoPorcentaje;
      } catch (e) {
        idCliente = user.clienteInfo.idCliente;
      }
    }

    const docVal = (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '';

    let metaFoto = null;
    if (user.clienteInfo?.direccion && user.clienteInfo.direccion.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(user.clienteInfo.direccion);
        metaFoto = meta.foto || meta.avatar || null;
      } catch (e) {}
    }
    const finalFoto = user.foto || metaFoto || null;
    const authFlags = resolveUserAuthFlags(user, user.clienteInfo);

    return {
      _id: user.idUsuario,
      id: user.idUsuario,
      idUsuario: user.idUsuario,
      idCliente,
      nombre: user.nombre,
      apellidos: user.apellidos,
      apellido: user.apellidos,
      tipoDocumento: user.tipoDocumento || 'C.C.',
      numeroDocumento: docVal,
      documento: docVal,
      tieneCedulaRegistrada: Boolean(docVal && docVal.length >= 6),
      esUsuarioGoogle: authFlags.esUsuarioGoogle,
      tienePassword: authFlags.tienePassword,
      tiene_password: authFlags.tiene_password,
      telefono: user.telefono,
      email: user.email,
      correo: user.email,
      rol: user.rolInfo ? user.rolInfo.nombre : 'Usuario',
      rolEstado: user.rolInfo ? user.rolInfo.estado : 1,
      idRol: user.idRol,
      permisos,
      estado: user.estado,
      direccion: getCleanDireccion(user.clienteInfo ? user.clienteInfo.direccion : ''),
      tipo: tipoCliente,
      descuentoPorcentaje,
      fidelidad: fidelidadObj,
      preferenciasCompra,
      foto: finalFoto,
      avatar: finalFoto
    };
  }

  static async updateProfile(userId, profileData = {}) {
    const { passwordActual, passwordNueva } = profileData || {};

    const user = await User.findByPk(userId, {
      include: [{ model: Cliente, as: 'clienteInfo' }]
    });
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const authFlags = resolveUserAuthFlags(user, user.clienteInfo);

    if (passwordNueva) {
      if (String(passwordNueva).length < 6) {
        const error = new Error('La nueva contraseña debe tener al menos 6 caracteres');
        error.statusCode = 400;
        throw error;
      }

      const canCreateFirstLocalPassword = authFlags.esUsuarioGoogle && !authFlags.tienePassword;

      if (!canCreateFirstLocalPassword) {
        if (!passwordActual) {
          const error = new Error('Debes ingresar tu contraseña actual para cambiarla.');
          error.statusCode = 400;
          throw error;
        }

        const isMatch = isBcryptHash(user.contrasena)
          ? await bcrypt.compare(String(passwordActual), user.contrasena)
          : false;
        if (!isMatch) {
          const error = new Error('La contraseña actual es incorrecta');
          error.statusCode = 400;
          throw error;
        }
      }

      const salt = await bcrypt.genSalt(10);
      const hashed = await bcrypt.hash(String(passwordNueva), salt);
      await user.update({ contrasena: hashed });
      await persistClienteAuthMeta(user, { tienePasswordLocal: true });
      revokeAllUserTokens(userId);

      EmailService.sendPasswordChangedEmail({
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos
      }).catch(err => console.warn('Error notificando cambio de contraseña:', err.message));
    }

    // Seguridad (AUD-002): lista blanca estricta de campos de perfil editables por el propio usuario (prohibido idRol, rol_id, estado, contrasena)
    const allowedProfileUpdate = {};
    const selfAllowedKeys = ['nombre', 'apellidos', 'apellido', 'telefono', 'direccion', 'foto', 'avatar'];
    for (const key of selfAllowedKeys) {
      if (profileData[key] !== undefined) {
        // Evitar spoofing de URL de Google OAuth en foto/avatar por usuarios locales (AUD-018)
        if ((key === 'foto' || key === 'avatar') && typeof profileData[key] === 'string') {
          const candidateUrl = profileData[key].trim();
          if (candidateUrl.includes('googleusercontent.com') && candidateUrl !== String(user.foto || '').trim()) {
            continue;
          }
        }
        allowedProfileUpdate[key] = profileData[key];
      }
    }

    // Permitir completar documento únicamente si el usuario aún no tiene uno válido registrado (onboarding Google/checkout)
    const hasExistingDoc = Boolean(user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6);
    if (!hasExistingDoc) {
      if (profileData.tipoDocumento !== undefined) allowedProfileUpdate.tipoDocumento = profileData.tipoDocumento;
      if (profileData.documento !== undefined) allowedProfileUpdate.documento = profileData.documento;
      if (profileData.numeroDocumento !== undefined) allowedProfileUpdate.numeroDocumento = profileData.numeroDocumento;
    }

    if (Object.keys(allowedProfileUpdate).length > 0) {
      const UserService = require('./userService');
      await UserService.updateUser(userId, allowedProfileUpdate);
    }

    const profile = await this.getUserProfile(userId);
    return {
      ...profile,
      token: this.generateToken(userId)
    };
  }


  static async checkEmail(email) {
    const targetEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!targetEmail) {
      const error = new Error('El correo electrónico es requerido');
      error.statusCode = 400;
      throw error;
    }

    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        email: { [Op.like]: targetEmail }
      },
      attributes: ['idUsuario']
    });

    if (!user) {
      return {
        exists: false,
        registered: false,
        message: 'Correo disponible.'
      };
    }

    return {
      exists: true,
      registered: true,
      message: 'El correo se encuentra registrado.'
    };
  }

  static async checkDocument(rawDocumento, currentUserId = null) {
    const cleanDoc = typeof rawDocumento === 'string' || typeof rawDocumento === 'number'
      ? String(rawDocumento).trim()
      : '';
    if (!cleanDoc) {
      const error = new Error('El número de documento es requerido');
      error.statusCode = 400;
      throw error;
    }

    const { Op } = require('sequelize');
    const numericId = /^\d+$/.test(cleanDoc) ? Number(cleanDoc) : null;
    const whereClauses = [{ numeroDocumento: cleanDoc }];
    if (numericId && Number.isSafeInteger(numericId) && numericId <= 2147483647) {
      whereClauses.push({ idUsuario: numericId });
    }

    const found = await User.findOne({
      where: { [Op.or]: whereClauses },
      attributes: ['idUsuario', 'numeroDocumento', 'tipoDocumento']
    });

    if (!found) {
      return {
        exists: false,
        registered: false,
        isOwnDocument: false,
        conflict: false,
        message: 'Documento disponible.'
      };
    }

    const isOwn = Boolean(currentUserId && Number(found.idUsuario) === Number(currentUserId));
    if (isOwn) {
      return {
        exists: true,
        registered: true,
        isOwnDocument: true,
        conflict: false,
        message: 'Documento verificado de tu cuenta.'
      };
    }

    return {
      exists: true,
      registered: true,
      isOwnDocument: false,
      conflict: true,
      message: `El número de documento "${cleanDoc}" ya pertenece a otro usuario registrado.`
    };
  }

  static async forgotPassword(data, options = {}) {
    const { email, correo } = data || {};
    const targetEmail = (email || correo || '').trim().toLowerCase();

    if (!targetEmail) {
      const error = new Error('El correo electrónico es requerido');
      error.statusCode = 400;
      throw error;
    }

    const { Op } = require('sequelize');
    const user = await User.findOne({
      where: {
        email: { [Op.like]: targetEmail }
      }
    });

    const genericMessage = 'Si el correo está registrado, recibirás las instrucciones para restablecer tu contraseña.';

    if (!user) {
      // Respuesta unificada para prevenir enumeración de correos (AUD-018)
      return { message: genericMessage };
    }

    const jwtSecret = getJwtSecret();
    const resetToken = jwt.sign(
      { id: user.idUsuario, email: user.email, purpose: 'password_reset' },
      jwtSecret + user.contrasena,
      { algorithm: 'HS256', expiresIn: '1h' }
    );

    const frontendUrl = EmailService.resolveFrontendUrl(options.requestOrigin);
    const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;

    // Envío del correo con diseño React Email a través de EmailService
    const sent = await EmailService.sendPasswordResetEmail({
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos,
      resetLink
    });

    if (!sent) {
      const error = new Error(
        'No fue posible enviar el correo de recuperación en este momento. Intenta nuevamente más tarde.'
      );
      error.statusCode = 503;
      throw error;
    }

    return { message: genericMessage };
  }

  static async resetPassword(data) {
    let { token, email, contrasena, contraseña, password } = data || {};
    const newPassword = contrasena || contraseña || password;

    if (!email && token) {
      try {
        const decoded = jwt.decode(token);
        if (decoded && decoded.email) {
          email = decoded.email;
        }
      } catch (err) {}
    }

    if (!token || !email || !newPassword) {
      const error = new Error('Token, email y nueva contraseña son requeridos');
      error.statusCode = 400;
      throw error;
    }

    if (String(newPassword).length < 6) {
      const error = new Error('La contraseña debe tener al menos 6 caracteres');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ where: { email: String(email).trim().toLowerCase() } });
    if (!user) {
      const error = new Error('El enlace de restablecimiento es inválido o ha expirado');
      error.statusCode = 400;
      throw error;
    }

    const jwtSecret = getJwtSecret();
    try {
      const verified = jwt.verify(token, jwtSecret + user.contrasena, JWT_VERIFY_OPTIONS);
      if (verified.purpose && verified.purpose !== 'password_reset') {
        throw new Error('Propósito de token inválido');
      }
      if (verified.email && String(verified.email).toLowerCase() !== String(user.email).toLowerCase()) {
        throw new Error('Correo del token no coincide');
      }
    } catch (err) {
      const error = new Error('El enlace de restablecimiento es inválido o ha expirado');
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(newPassword), salt);

    await user.update({ contrasena: hashedPassword });
    await persistClienteAuthMeta(user, { tienePasswordLocal: true });
    revokeAllUserTokens(user.idUsuario);

    // Notificar al usuario por correo sin incluir la contraseña en texto plano
    try {
      EmailService.sendPasswordChangedEmail({
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos
      });
    } catch (e) {
      console.warn('Error al enviar notificación de contraseña actualizada:', e.message);
    }

    return { message: 'Contraseña restablecida exitosamente' };
  }

  static async googleLogin(credential, options = {}) {
    // Seguridad (AUD-001): exigir estrictamente un ID Token JWT firmado de Google y verificado con OAuth2Client
    if (!credential || typeof credential !== 'string' || credential.trim().startsWith('{') || credential.split('.').length !== 3) {
      const error = new Error('Token de Google inválido o malformado');
      error.statusCode = 401;
      throw error;
    }

    const mode = options?.mode || 'login';
    const allowRegister = options?.allowRegister !== undefined
      ? Boolean(options.allowRegister)
      : (mode === 'register');

    const googleClientId = String(process.env.GOOGLE_CLIENT_ID || process.env.VITE_GOOGLE_CLIENT_ID || '').trim();
    if (!googleClientId) {
      const error = new Error('Autenticación con Google no configurada en el servidor');
      error.statusCode = 503;
      throw error;
    }

    let payload = null;
    try {
      const { OAuth2Client } = require('google-auth-library');
      const client = new OAuth2Client(googleClientId);
      const ticket = await client.verifyIdToken({
        idToken: credential.trim(),
        audience: googleClientId
      });
      payload = ticket.getPayload();
    } catch (verifyError) {
      console.warn('Verificación criptográfica de Google OAuth rechazada:', verifyError.message);
      const error = new Error('No se pudo verificar el token de Google. Inicia sesión nuevamente.');
      error.statusCode = 401;
      throw error;
    }

    if (!payload || !payload.email || payload.email_verified !== true) {
      const error = new Error('La cuenta de Google no tiene un correo electrónico verificado.');
      error.statusCode = 401;
      throw error;
    }

    const email = String(payload.email).trim().toLowerCase();
    const givenName = payload.given_name || payload.name || 'Usuario';
    const familyName = payload.family_name || '';
    const picture = payload.picture || null;

    const { Sequelize } = require('sequelize');
    let user = await User.findOne({
      where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('email')), email),
      include: [
        { model: Role, as: 'rolInfo', include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] },
        { model: Cliente, as: 'clienteInfo' }
      ]
    });

    if (user) {
      if (user.estado === 'INACTIVO' || user.estado === '0' || user.estado === 0) {
        const error = new Error('Tu usuario está inactivo. Comunícate con el administrador para activar tu cuenta.');
        error.statusCode = 403;
        throw error;
      }

      if (user.rolInfo && (user.rolInfo.estado === 0 || user.rolInfo.estado === '0')) {
        const error = new Error('El rol asignado a tu cuenta se encuentra inactivo. Comunícate con el administrador.');
        error.statusCode = 403;
        throw error;
      }

      // Si estaba PENDIENTE y es cuenta Cliente verificada por Google, queda activada (cuentas administrativas requieren activación explícita)
      if (user.estado === 'PENDIENTE') {
        const isClientAccount = Number(user.idRol) === 4 || String(user.rolInfo?.nombre || '').toLowerCase() === 'cliente';
        if (!isClientAccount) {
          const error = new Error('Tu cuenta administrativa está pendiente de activación. Usa el enlace enviado a tu correo electrónico.');
          error.statusCode = 403;
          throw error;
        }
        await user.update({ estado: 'ACTIVO' });
        user.estado = 'ACTIVO';
      }

      if (!user.foto && picture) {
        try {
          await user.update({ foto: picture });
        } catch (e) {
          console.warn('No se pudo actualizar foto de Google:', e.message);
        }
      }

      if (user.clienteInfo) {
        const existingMeta = parseClienteMeta(user.clienteInfo);
        if (existingMeta.googleVinculado !== true) {
          await persistClienteAuthMeta(user, { googleVinculado: true });
        }
      }
    } else {
      if (!allowRegister && mode !== 'register') {
        const error = new Error('La cuenta no existe');
        error.statusCode = 404;
        throw error;
      }

      // Registrar automáticamente nuevo usuario con rol Cliente sin contraseña local (solo Google OAuth)
      const unsetPasswordMarker = `${GOOGLE_OAUTH_NO_PASSWORD_PREFIX}${crypto.randomBytes(16).toString('hex')}`;

      const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(givenName, familyName);

      const clienteRol = await Role.findOne({
        where: Sequelize.where(Sequelize.fn('LOWER', Sequelize.col('nombre')), 'cliente')
      });
      const finalRolId = clienteRol ? clienteRol.idRol : 4;

      user = await User.create({
        nombre: cleanNom,
        apellidos: cleanApe,
        tipoDocumento: 'C.C.',
        numeroDocumento: null,
        telefono: null,
        email,
        contrasena: unsetPasswordMarker,
        idRol: finalRolId,
        estado: 'ACTIVO',
        foto: picture,
        fechaRegistro: new Date()
      });

      // Crear registro de cliente asociado con fidelidad
      try {
        const metaStr = JSON.stringify({
          direccion: '',
          tipo: 'Nuevo',
          descuentoPorcentaje: 0,
          nombre: cleanNom,
          apellidos: cleanApe,
          telefono: '',
          ciclo: 0,
          foto: picture,
          authProvider: 'google',
          googleVinculado: true,
          tienePasswordLocal: false
        });
        await Cliente.create({
          idUsuario: user.idUsuario,
          direccion: metaStr,
          estado: 1
        });
      } catch (err) {
        console.warn('Advertencia al crear registro de cliente para Google:', err.message);
      }

      // Re-consultar usuario con relaciones
      user = await User.findByPk(user.idUsuario, {
        include: [
          { model: Role, as: 'rolInfo', include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] },
          { model: Cliente, as: 'clienteInfo' }
        ]
      });

      // Enviar correo de bienvenida en segundo plano
      const userPlainGoogle = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
      EmailService.sendWelcomeEmail({
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        password: '',
        esGoogle: true,
        usuario: { ...userPlainGoogle, direccion: '' }
      }).catch(err => console.error('Background welcome email error in googleLogin:', err.message));
    }

    const rolNombre = user.rolInfo ? user.rolInfo.nombre : 'Cliente';
    const direccion = getCleanDireccion(user.clienteInfo ? user.clienteInfo.direccion : '');
    const permisos = user.rolInfo && user.rolInfo.permisos
      ? user.rolInfo.permisos.map(p => p.nombrePermiso)
      : [];

    let fidelidadObj = null;
    let preferenciasCompra = null;
    let idCliente = null;
    let tipoCliente = 'Nuevo';
    let descuentoPorcentaje = 0;

    if (!user.clienteInfo && (user.idRol === 4 || user.rolInfo?.nombre?.toLowerCase() === 'cliente')) {
      try {
        const [clientRecord] = await Cliente.findOrCreate({
          where: { idUsuario: user.idUsuario },
          defaults: {
            idUsuario: user.idUsuario,
            direccion: JSON.stringify({
              direccion: '',
              tipo: 'Nuevo',
              ciclo: 0,
              nombre: user.nombre,
              apellidos: user.apellidos,
              telefono: user.telefono || '',
              estado: 'Activo',
              googleVinculado: true
            }),
            estado: 1
          }
        });
        user.clienteInfo = clientRecord;
      } catch (err) {
        console.warn('Error asegurando clienteInfo en googleLogin:', err.message);
      }
    }

    if (user.clienteInfo) {
      try {
        const ClienteService = require('./clienteService');
        user.clienteInfo.usuario = user;
        const formattedCliente = await ClienteService.formatCliente(user.clienteInfo);
        idCliente = formattedCliente.id;
        fidelidadObj = formattedCliente.fidelidad;
        preferenciasCompra = formattedCliente.preferenciasCompra || null;
        tipoCliente = formattedCliente.tipo;
        descuentoPorcentaje = formattedCliente.descuentoPorcentaje;
      } catch (e) {
        idCliente = user.clienteInfo.idCliente;
      }
    }

    let metaFoto = null;
    if (user.clienteInfo?.direccion && user.clienteInfo.direccion.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(user.clienteInfo.direccion);
        metaFoto = meta.foto || meta.avatar || null;
      } catch (e) {}
    }
    const finalFoto = user.foto || metaFoto || picture || null;
    const authFlags = resolveUserAuthFlags(user, user.clienteInfo);

    return {
      _id: user.idUsuario,
      id: user.idUsuario,
      idUsuario: user.idUsuario,
      idCliente,
      nombre: user.nombre,
      apellidos: user.apellidos,
      apellido: user.apellidos,
      tipoDocumento: user.tipoDocumento || 'C.C.',
      numeroDocumento: (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '',
      tieneCedulaRegistrada: Boolean(user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6),
      esUsuarioGoogle: true,
      tienePassword: authFlags.tienePassword,
      tiene_password: authFlags.tiene_password,
      documento: (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '',
      telefono: user.telefono || '',
      email: user.email,
      correo: user.email,
      rol: rolNombre,
      idRol: user.idRol,
      estado: user.estado,
      permisos,
      direccion,
      tipo: tipoCliente,
      descuentoPorcentaje,
      fidelidad: fidelidadObj,
      preferenciasCompra,
      foto: finalFoto,
      avatar: finalFoto,
      token: this.generateToken(user.idUsuario)
    };
  }

  static generateActivationToken(user) {
    const jwtSecret = getJwtSecret();
    return jwt.sign(
      { id: user.idUsuario, email: user.email, purpose: 'activate_account' },
      jwtSecret + user.contrasena,
      { algorithm: 'HS256', expiresIn: '72h' }
    );
  }

  static async verifyActivationToken(token) {
    if (!token) {
      const error = new Error('Token de activación no proporcionado');
      error.statusCode = 400;
      throw error;
    }

    const decoded = jwt.decode(token);
    if (!decoded || !decoded.id || decoded.purpose !== 'activate_account') {
      const error = new Error('El enlace de activación es inválido');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findByPk(decoded.id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const jwtSecret = getJwtSecret();
    try {
      const verified = jwt.verify(token, jwtSecret + user.contrasena, JWT_VERIFY_OPTIONS);
      if (verified.purpose !== 'activate_account') {
        throw new Error('Propósito de token inválido');
      }
    } catch (err) {
      const error = new Error('El enlace de activación es inválido o ha expirado.');
      error.statusCode = 400;
      throw error;
    }

    if (user.estado !== 'PENDIENTE') {
      const error = new Error(
        user.estado === 'ACTIVO'
          ? 'Esta cuenta ya fue activada anteriormente. Ya puedes iniciar sesión.'
          : 'Esta cuenta no está habilitada para activación. Comunícate con el administrador.'
      );
      error.statusCode = 400;
      throw error;
    }

    return {
      valid: true,
      email: user.email,
      nombre: user.nombre,
      apellidos: user.apellidos || '',
      estado: user.estado
    };
  }

  static async activateAccount(data = {}) {
    const { token, contrasena, contraseña, password } = data;
    const newPassword = contrasena || contraseña || password;

    if (!token || !newPassword) {
      const error = new Error('El enlace de activación y la nueva contraseña son obligatorios');
      error.statusCode = 400;
      throw error;
    }

    if (String(newPassword).length < 6) {
      const error = new Error('La contraseña debe tener al menos 6 caracteres');
      error.statusCode = 400;
      throw error;
    }

    const decoded = jwt.decode(token);
    if (!decoded || !decoded.id || decoded.purpose !== 'activate_account') {
      const error = new Error('El enlace de activación es inválido');
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findByPk(decoded.id, {
      include: [
        { model: Role, as: 'rolInfo', include: [{ model: Permiso, as: 'permisos', through: { attributes: [] } }] },
        { model: Cliente, as: 'clienteInfo' }
      ]
    });

    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const jwtSecret = getJwtSecret();
    try {
      const verified = jwt.verify(token, jwtSecret + user.contrasena, JWT_VERIFY_OPTIONS);
      if (verified.purpose !== 'activate_account') {
        throw new Error('Propósito de token inválido');
      }
    } catch (err) {
      const error = new Error('El enlace de activación es inválido o ha expirado.');
      error.statusCode = 400;
      throw error;
    }

    if (user.estado !== 'PENDIENTE') {
      const error = new Error(
        user.estado === 'ACTIVO'
          ? 'Esta cuenta ya fue activada. Inicia sesión con tu contraseña.'
          : 'Esta cuenta se encuentra inactiva. Comunícate con el administrador.'
      );
      error.statusCode = 400;
      throw error;
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(String(newPassword), salt);
    await user.update({ contrasena: hashedPassword, estado: 'ACTIVO' });
    revokeAllUserTokens(user.idUsuario);

    if (user.clienteInfo) {
      try {
        let meta = {};
        if (user.clienteInfo.direccion && user.clienteInfo.direccion.trim().startsWith('{')) {
          meta = JSON.parse(user.clienteInfo.direccion);
        }
        meta.estado = 'Activo';
        meta.tienePasswordLocal = true;
        await user.clienteInfo.update({ direccion: JSON.stringify(meta), estado: 1 });
      } catch (e) {}
    }

    const profile = await this.getUserProfile(user.idUsuario);
    return {
      message: 'Cuenta activada exitosamente',
      ...profile,
      token: this.generateToken(user.idUsuario)
    };
  }
}

AuthService.resolveUserAuthFlags = resolveUserAuthFlags;
AuthService.GOOGLE_OAUTH_NO_PASSWORD_PREFIX = GOOGLE_OAUTH_NO_PASSWORD_PREFIX;

module.exports = AuthService;
