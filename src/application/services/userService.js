const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { User, Role, Cliente, Permiso } = require('../../persistence/models');
const { sanitizeTelefono, sanitizeDocumento, cleanNameAndLastName, formatNombreCompleto, isValidEmailStrict, isValidPersonName } = require('../../infrastructure/utils/validationUtils');
const EmailService = require('./emailService');
const { revokeAllUserTokens } = require('../../infrastructure/config/jwtConfig');
const { parsePaginationParams, buildPaginatedResponse } = require('../../infrastructure/utils/paginationUtils');

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

class UserService {
  static async getAllUsers(filterObj = {}) {
    const { isPaginated, page, limit, offset } = parsePaginationParams(filterObj, { defaultLimit: 5, maxLimit: 100 });
    const where = {};
    const andClauses = [];

    if (filterObj.estado && filterObj.estado !== 'Todos') {
      const eNorm = String(filterObj.estado).toLowerCase().trim();
      if (eNorm === 'activo' || eNorm === '1') {
        andClauses.push({ estado: { [Op.in]: ['ACTIVO', 'Activo', '1', 1] } });
      } else if (eNorm === 'inactivo' || eNorm === '0') {
        andClauses.push({ estado: { [Op.in]: ['INACTIVO', 'Inactivo', '0', 0] } });
      }
    }

    if (filterObj.rol && filterObj.rol !== 'Todos') {
      const rVal = String(filterObj.rol).trim();
      if (/^\d+$/.test(rVal)) {
        andClauses.push({ idRol: Number(rVal) });
      } else {
        andClauses.push({ '$rolInfo.nombre$': { [Op.like]: `%${rVal}%` } });
      }
    }

    if (filterObj.search && String(filterObj.search).trim()) {
      const q = String(filterObj.search).trim();
      const digits = q.replace(/\D/g, '');
      const searchOr = [
        { nombre: { [Op.like]: `%${q}%` } },
        { apellidos: { [Op.like]: `%${q}%` } },
        { email: { [Op.like]: `%${q}%` } },
        { numeroDocumento: { [Op.like]: `%${q}%` } },
        { telefono: { [Op.like]: `%${q}%` } },
        { '$rolInfo.nombre$': { [Op.like]: `%${q}%` } }
      ];
      if (digits && /^\d+$/.test(digits)) {
        searchOr.push({ idUsuario: Number(digits) });
      }
      andClauses.push({ [Op.or]: searchOr });
    }

    if (andClauses.length > 0) {
      where[Op.and] = andClauses;
    }

    const queryOptions = {
      where,
      include: [{ model: Role, as: 'rolInfo' }, { model: Cliente, as: 'clienteInfo' }],
      order: [['fechaRegistro', 'DESC']],
      subQuery: false
    };

    const formatUserRow = (user) => {
      const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(user.nombre, user.apellidos);
      const cleanTel = sanitizeTelefono(user.telefono);
      const docVal = (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '';
      return {
        _id: user.idUsuario,
        id: user.idUsuario,
        idUsuario: user.idUsuario,
        nombre: cleanNom,
        apellidos: cleanApe,
        apellido: cleanApe,
        tipoDocumento: user.tipoDocumento || 'C.C.',
        numeroDocumento: docVal,
        documento: docVal,
        telefono: cleanTel,
        email: user.email,
        correo: user.email,
        idRol: user.idRol,
        rol: user.rolInfo ? user.rolInfo.nombre : 'Usuario',
        estado: user.estado,
        direccion: getCleanDireccion(user.clienteInfo ? user.clienteInfo.direccion : ''),
        fechaRegistro: user.fechaRegistro
      };
    };

    if (isPaginated) {
      const { count, rows } = await User.findAndCountAll({
        ...queryOptions,
        limit,
        offset,
        distinct: true
      });
      return buildPaginatedResponse(rows.map(formatUserRow), count, page, limit);
    }

    const users = await User.findAll(queryOptions);
    return users.map(formatUserRow);
  }

  static async getUserById(id) {
    const user = await User.findByPk(id, {
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

    const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(user.nombre, user.apellidos);
    const cleanTel = sanitizeTelefono(user.telefono);
    const docVal = (user.numeroDocumento && String(user.numeroDocumento).trim().length >= 6) ? String(user.numeroDocumento).trim() : '';
    const permisos = user.rolInfo && user.rolInfo.permisos
      ? user.rolInfo.permisos.map(p => p.nombrePermiso)
      : [];

    let metaFoto = null;
    if (user.clienteInfo?.direccion && user.clienteInfo.direccion.trim().startsWith('{')) {
      try {
        const meta = JSON.parse(user.clienteInfo.direccion);
        metaFoto = meta.foto || meta.avatar || null;
      } catch (e) {}
    }
    const finalFoto = user.foto || metaFoto || null;

    return {
      _id: user.idUsuario,
      id: user.idUsuario,
      idUsuario: user.idUsuario,
      nombre: cleanNom,
      apellidos: cleanApe,
      apellido: cleanApe,
      tipoDocumento: user.tipoDocumento || 'C.C.',
      numeroDocumento: docVal,
      documento: docVal,
      telefono: cleanTel,
      email: user.email,
      correo: user.email,
      idRol: user.idRol,
      rol: user.rolInfo ? user.rolInfo.nombre : 'Usuario',
      rolEstado: user.rolInfo ? user.rolInfo.estado : 1,
      permisos,
      estado: user.estado,
      direccion: getCleanDireccion(user.clienteInfo ? user.clienteInfo.direccion : ''),
      foto: finalFoto,
      avatar: finalFoto,
      fechaRegistro: user.fechaRegistro
    };
  }

  static async createUser(userData) {
    const { nombre, apellidos, apellido, email, correo, contrasena, contraseña, password, idRol, rol_id, tipoDocumento, documento, numeroDocumento, telefono, direccion, estado } = userData;
    const finalEmail = (email || correo || '').trim().toLowerCase();
    const finalPassword = contrasena || contraseña || password || crypto.randomBytes(12).toString('hex');
    const rawApellido = apellidos || apellido || '';
    const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(nombre, rawApellido);
    const cleanTel = sanitizeTelefono(telefono);
    const targetTipoDoc = tipoDocumento || 'C.C.';
    const cleanDoc = sanitizeDocumento(documento || numeroDocumento || '', targetTipoDoc);
    const finalRolId = idRol || rol_id || 4;

    if (!cleanNom || !finalEmail) {
      const error = new Error('Nombre y correo son requeridos');
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

    // 1. Email Uniqueness Validation
    const existing = await User.findOne({ where: { email: finalEmail } });
    if (existing) {
      const error = new Error('El usuario ya existe con este correo');
      error.statusCode = 400;
      throw error;
    }

    // 2. Full Name Uniqueness Validation
    const newFullName = formatNombreCompleto(cleanNom, cleanApe).toLowerCase();
    const allUsers = await User.findAll({ attributes: ['idUsuario', 'nombre', 'apellidos'] });
    const duplicateName = allUsers.some(u => formatNombreCompleto(u.nombre, u.apellidos).toLowerCase() === newFullName);
    if (duplicateName) {
      const error = new Error(`Ya existe un usuario registrado con el nombre "${formatNombreCompleto(cleanNom, cleanApe)}"`);
      error.statusCode = 400;
      throw error;
    }

    // 3. Document Uniqueness Validation
    if (cleanDoc) {
      const existingDoc = await User.findOne({
        where: {
          numeroDocumento: cleanDoc
        }
      });
      if (existingDoc) {
        const error = new Error(`Ya existe un usuario registrado con el número de documento "${cleanDoc}"`);
        error.statusCode = 400;
        throw error;
      }
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(finalPassword, salt);

    const user = await User.create({
      nombre: cleanNom,
      apellidos: cleanApe,
      tipoDocumento: targetTipoDoc,
      numeroDocumento: cleanDoc || null,
      telefono: cleanTel,
      email: finalEmail,
      contrasena: hashedPassword,
      idRol: finalRolId,
      estado: estado || 'ACTIVO',
      fechaRegistro: new Date()
    });

    const cleanCreatedDir = direccion ? getCleanDireccion(direccion) : '';
    if (direccion) {
      const metaStr = JSON.stringify({ direccion: cleanCreatedDir, tipo: 'Nuevo', descuentoPorcentaje: 0, nombre: cleanNom, apellidos: cleanApe, telefono: cleanTel });
      await Cliente.create({
        idUsuario: user.idUsuario,
        direccion: metaStr
      });
    }

    // Send welcome email if requested (sin contraseña en texto plano)
    if (userData.enviarCorreoBienvenida || userData.notificarEmail) {
      const userPlain = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
      EmailService.sendWelcomeEmail({
        email: user.email,
        nombre: user.nombre,
        apellidos: user.apellidos,
        usuario: { ...userPlain, direccion: cleanCreatedDir }
      }).catch(err => console.error('Background welcome email error:', err.message));
    }

    return this.getUserById(user.idUsuario);
  }

  static async updateUser(id, userData) {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    // Capturar snapshot exacto ANTES de aplicar cambios para notificar SOLO los campos realmente modificados
    const existingCliente = await Cliente.findOne({ where: { idUsuario: id } }).catch(() => null);
    const prevSnapshot = {
      nombre: String(user.nombre || '').trim(),
      apellidos: String(user.apellidos || '').trim(),
      email: String(user.email || '').trim().toLowerCase(),
      tipoDocumento: String(user.tipoDocumento || '').trim(),
      numeroDocumento: String(user.numeroDocumento || '').trim(),
      telefono: String(user.telefono || '').trim(),
      idRol: Number(user.idRol),
      estado: String(user.estado || '').trim().toUpperCase(),
      foto: String(user.foto || '').trim(),
      direccion: existingCliente ? getCleanDireccion(existingCliente.direccion || '') : ''
    };

    const { nombre, apellidos, apellido, email, correo, contrasena, contraseña, password, idRol, rol_id, tipoDocumento, documento, numeroDocumento, telefono, direccion, estado, foto, avatar } = userData;

    // 1. Name & Uniqueness Check (ignoring current user)
    if (nombre !== undefined || apellidos !== undefined || apellido !== undefined) {
      const rawNom = nombre !== undefined ? nombre : user.nombre;
      const rawApe = (apellidos !== undefined || apellido !== undefined) ? (apellidos || apellido || '') : user.apellidos;
      const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(rawNom, rawApe);
      if (!isValidPersonName(cleanNom) || (cleanApe && !isValidPersonName(cleanApe))) {
        const error = new Error('El nombre y los apellidos no pueden contener números ni el símbolo @');
        error.statusCode = 400;
        throw error;
      }
      const newFullName = formatNombreCompleto(cleanNom, cleanApe).toLowerCase();
      const currentFullName = formatNombreCompleto(user.nombre, user.apellidos).toLowerCase();

      if (newFullName && newFullName !== currentFullName) {
        const otherUsers = await User.findAll({
          where: { idUsuario: { [Op.ne]: id } },
          attributes: ['idUsuario', 'nombre', 'apellidos']
        });
        const duplicateName = otherUsers.some(u => formatNombreCompleto(u.nombre, u.apellidos).toLowerCase() === newFullName);
        if (duplicateName) {
          const error = new Error(`Ya existe un usuario registrado con el nombre "${formatNombreCompleto(cleanNom, cleanApe)}"`);
          error.statusCode = 400;
          throw error;
        }
      }
      user.nombre = cleanNom;
      user.apellidos = cleanApe;
    }

    // 2. Email & Uniqueness Check (ignoring current user)
    const finalEmail = (email || correo || '').trim().toLowerCase();
    if (finalEmail && finalEmail !== (user.email || '').toLowerCase()) {
      if (!isValidEmailStrict(finalEmail)) {
        const error = new Error('El correo electrónico debe incluir @ y un dominio válido (ej: usuario@dominio.com)');
        error.statusCode = 400;
        throw error;
      }
      const existingEmail = await User.findOne({
        where: {
          email: finalEmail,
          idUsuario: { [Op.ne]: id }
        }
      });
      if (existingEmail) {
        const error = new Error('Ya existe un usuario registrado con este correo electrónico');
        error.statusCode = 400;
        throw error;
      }
      user.email = finalEmail;
    }

    // 3. Document Type & Number Uniqueness Check (ignoring current user)
    if (tipoDocumento !== undefined) user.tipoDocumento = tipoDocumento;
    const rawDoc = documento !== undefined ? documento : (numeroDocumento !== undefined ? numeroDocumento : undefined);
    if (rawDoc !== undefined) {
      const targetTipoDoc = user.tipoDocumento || 'C.C.';
      const cleanDoc = sanitizeDocumento(rawDoc, targetTipoDoc);
      const currentDoc = String(user.numeroDocumento || '');
      if (cleanDoc && cleanDoc !== currentDoc) {
        const existingDoc = await User.findOne({
          where: {
            idUsuario: { [Op.ne]: id },
            numeroDocumento: cleanDoc
          }
        });
        if (existingDoc) {
          const error = new Error(`Ya existe un usuario registrado con el número de documento "${cleanDoc}"`);
          error.statusCode = 400;
          throw error;
        }
      }
      user.numeroDocumento = cleanDoc;
    }

    const prevRol = user.idRol;
    const prevEstado = user.estado;
    if (telefono !== undefined) user.telefono = sanitizeTelefono(telefono);
    if (idRol || rol_id) user.idRol = idRol || rol_id;
    if (estado) user.estado = estado;
    if (foto !== undefined || avatar !== undefined) {
      user.foto = foto !== undefined ? foto : (avatar !== undefined ? avatar : null);
    }

    let passwordUpdated = false;
    if (contrasena || contraseña || password) {
      const rawNewPass = String(contrasena || contraseña || password);
      if (rawNewPass.length < 6) {
        const error = new Error('La contraseña debe tener al menos 6 caracteres');
        error.statusCode = 400;
        throw error;
      }
      const salt = await bcrypt.genSalt(10);
      user.contrasena = await bcrypt.hash(rawNewPass, salt);
      passwordUpdated = true;
    }

    await user.save();

    if (passwordUpdated || Number(user.idRol) !== Number(prevRol) || String(user.estado || '').toUpperCase() !== String(prevEstado || '').toUpperCase()) {
      revokeAllUserTokens(id);
    }

    let currentDireccion = prevSnapshot.direccion;
    if (passwordUpdated || direccion !== undefined || foto !== undefined || avatar !== undefined || (Number(user.idRol) === 4 && !existingCliente)) {
      const cleanDir = direccion !== undefined ? getCleanDireccion(direccion) : undefined;
      if (cleanDir !== undefined) currentDireccion = cleanDir;
      let cliente = existingCliente;
      if (cliente) {
        let meta = {};
        if (cliente.direccion && cliente.direccion.trim().startsWith('{')) {
          try { meta = JSON.parse(cliente.direccion); } catch (e) { meta = {}; }
        }
        if (cleanDir !== undefined) meta.direccion = cleanDir;
        meta.nombre = user.nombre;
        meta.apellidos = user.apellidos;
        meta.email = user.email;
        meta.telefono = user.telefono;
        if (user.foto !== undefined) meta.foto = user.foto;
        if (passwordUpdated) meta.tienePasswordLocal = true;
        cliente.direccion = JSON.stringify(meta);
        await cliente.save();
      } else if (cleanDir || Number(user.idRol) === 4) {
        const metaStr = JSON.stringify({
          direccion: cleanDir || '',
          tipo: 'Nuevo',
          descuentoPorcentaje: 0,
          nombre: user.nombre,
          apellidos: user.apellidos,
          email: user.email,
          telefono: user.telefono,
          foto: user.foto || null,
          ...(passwordUpdated ? { tienePasswordLocal: true } : {})
        });
        await Cliente.create({ idUsuario: id, direccion: metaStr });
      }
    }

    // Send notification email unless explicitly set to false
    if (userData.notificarEmail !== false && userData.notificarEmail !== 0) {
      if (passwordUpdated) {
        EmailService.sendPasswordChangedEmail({
          email: user.email,
          nombre: user.nombre,
          apellidos: user.apellidos
        }).catch(err => console.error('Background password email error:', err.message));
      }

      // Comparar valores reales ANTES vs DESPUÉS para reportar estrictamente los campos modificados
      const modifiedList = [];
      if (String(user.nombre || '').trim() !== prevSnapshot.nombre) modifiedList.push('Nombre');
      if (String(user.apellidos || '').trim() !== prevSnapshot.apellidos) modifiedList.push('Apellidos');
      if (String(user.telefono || '').trim() !== prevSnapshot.telefono) modifiedList.push('Teléfono');
      if (String(user.email || '').trim().toLowerCase() !== prevSnapshot.email) modifiedList.push('Correo Electrónico');
      if (String(user.tipoDocumento || '').trim() !== prevSnapshot.tipoDocumento) modifiedList.push('Tipo de Documento');
      if (String(user.numeroDocumento || '').trim() !== prevSnapshot.numeroDocumento) modifiedList.push('Número de Documento');
      if (Number(user.idRol) !== prevSnapshot.idRol) modifiedList.push('Rol de Usuario');
      if (String(user.estado || '').trim().toUpperCase() !== prevSnapshot.estado) modifiedList.push('Estado de Cuenta');
      if (String(currentDireccion || '').trim() !== prevSnapshot.direccion) modifiedList.push('Dirección');
      if (String(user.foto || '').trim() !== prevSnapshot.foto) modifiedList.push('Foto de Perfil');

      if (modifiedList.length > 0) {
        const userPlain = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
        EmailService.sendUserUpdatedEmail({
          email: user.email,
          nombre: user.nombre,
          apellidos: user.apellidos,
          modifiedFields: modifiedList.join(', '),
          usuario: { ...userPlain, direccion: currentDireccion }
        }).catch(err => console.error('Background user update email error:', err.message));
      }
    }

    return this.getUserById(id);
  }

  static async toggleStatus(id, estado) {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    user.estado = estado || (user.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO');
    await user.save();
    if (user.estado !== 'ACTIVO') {
      revokeAllUserTokens(id);
    }
    return this.getUserById(id);
  }

  static async deleteUser(id) {
    const user = await User.findByPk(id);
    if (!user) {
      const error = new Error('Usuario no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const { Venta, Compra } = require('../../persistence/models');

    // 1. Proteger integridad si el usuario tiene un perfil de Cliente con ventas
    const cliente = await Cliente.findOne({ where: { idUsuario: id } });
    if (cliente) {
      const ventasCliente = await Venta.count({ where: { idCliente: cliente.idCliente } }).catch(() => 0);
      if (ventasCliente > 0) {
        const error = new Error(
          `No es posible eliminar al usuario "${user.nombre}" porque cuenta con ${ventasCliente} ${ventasCliente === 1 ? 'venta o pedido asociado' : 'ventas o pedidos asociados'} como cliente. Por integridad contable y legal, solo puedes cambiar su estado a Inactivo.`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    // 2. Proteger integridad si el usuario ha registrado ventas como cajero/vendedor
    const ventasUsuario = await Venta.count({ where: { idUsuario: id } }).catch(() => 0);
    if (ventasUsuario > 0) {
      const error = new Error(
        `No es posible eliminar al usuario "${user.nombre}" porque tiene ${ventasUsuario} ${ventasUsuario === 1 ? 'venta registrada' : 'ventas registradas'} en el sistema. Para suspender su acceso, cambia su estado a Inactivo.`
      );
      error.statusCode = 400;
      throw error;
    }

    // 3. Proteger integridad si el usuario ha intervenido en anulaciones/gestión de compras
    if (Compra) {
      const comprasUsuario = await Compra.count({ where: { usuarioCancelacionId: id } }).catch(() => 0);
      if (comprasUsuario > 0) {
        const error = new Error(
          `No es posible eliminar al usuario "${user.nombre}" porque cuenta con ${comprasUsuario} ${comprasUsuario === 1 ? 'registro de compra asociado' : 'registros de compra asociados'}. Solo puedes cambiar su estado a Inactivo.`
        );
        error.statusCode = 400;
        throw error;
      }
    }

    // 4. Intentar eliminación protegida
    try {
      if (cliente) {
        await cliente.destroy();
      }
      await user.destroy();
    } catch (err) {
      if (err.name === 'SequelizeForeignKeyConstraintError' || (err.message && err.message.toLowerCase().includes('foreign key constraint fails'))) {
        const error = new Error(
          `No es posible eliminar al usuario "${user.nombre}" porque tiene registros históricos vinculados en la base de datos (ventas, pedidos o compras). Por integridad de datos, cambia su estado a Inactivo para suspender su acceso.`
        );
        error.statusCode = 400;
        throw error;
      }
      throw err;
    }

    const { resetAutoIncrement } = require('../../infrastructure/utils/dbUtils');
    await resetAutoIncrement('usuario', 'idUsuario');

    return { message: 'Usuario eliminado exitosamente' };
  }
}

module.exports = UserService;
