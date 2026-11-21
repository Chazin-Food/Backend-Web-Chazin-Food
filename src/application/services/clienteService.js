const { Op } = require('sequelize');
const { Cliente, User, Role, Venta, DetalleVentaProducto } = require('../../persistence/models');
const { resetAutoIncrement, resequenceTableIds } = require('../../infrastructure/utils/dbUtils');
const { sanitizeTelefono, cleanNameAndLastName, formatNombreCompleto, sanitizeDocumento, isValidEmailStrict, isValidPersonName } = require('../../infrastructure/utils/validationUtils');
const bcrypt = require('bcryptjs');
const EmailService = require('./emailService');
const FidelidadService = require('./fidelidadService');
const AuthService = require('./authService');
const { formatColombiaDateES } = require('../../infrastructure/utils/colombiaDateUtils');
const { parsePaginationParams, buildPaginatedResponse } = require('../../infrastructure/utils/paginationUtils');

class ClienteService {
  static async formatCliente(c, preloadedVentas = null) {
    let meta = {};
    let cleanDireccion = '';

    if (c.direccion) {
      const raw = String(c.direccion).trim();
      if (raw.startsWith('{')) {
        try {
          meta = JSON.parse(raw);
          if (meta && typeof meta === 'object') {
            cleanDireccion = typeof meta.direccion === 'string' ? meta.direccion : (meta.d || '');
          }
        } catch (e) {
          // Truncated / malformed JSON fallback via regex
          const match = raw.match(/"direccion"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i) || raw.match(/"d"\s*:\s*"([^"]+)"/i);
          if (match && match[1]) {
            cleanDireccion = match[1];
          }
        }
      } else {
        cleanDireccion = raw;
      }
    }

    // Defensive guarantee: cleanDireccion must NEVER be a raw JSON string
    if (cleanDireccion.startsWith('{')) {
      try {
        const p = JSON.parse(cleanDireccion);
        cleanDireccion = p.direccion || p.d || '';
      } catch {
        const m = cleanDireccion.match(/"direccion"\s*:\s*"([^"]+)"/i);
        cleanDireccion = m ? m[1] : '';
      }
    }

    // Fetch real DB transactions for this client
    let transacciones = [];
    let comprasCount = 0;
    let totalGastadoSum = 0;
    let ticketPromedioVal = 0;

    try {
      const ventasDB = Array.isArray(preloadedVentas)
        ? preloadedVentas
        : await Venta.findAll({
            where: {
              [Op.or]: [
                { idCliente: c.idCliente },
                ...(c.idUsuario ? [{ idUsuario: c.idUsuario }] : [])
              ],
              estadoEntrega: { [Op.ne]: 'CANCELADO' },
              estadoAprobacion: { [Op.ne]: 'RECHAZADO' }
            },
            order: [['idVenta', 'DESC']],
            include: [{ model: DetalleVentaProducto, as: 'detalles' }]
          });

      comprasCount = ventasDB.length;
      totalGastadoSum = ventasDB.reduce((sum, v) => sum + Number(v.total || 0), 0);
      ticketPromedioVal = comprasCount > 0 ? Math.round(totalGastadoSum / comprasCount) : 0;

      transacciones = ventasDB.map(v => {
        let prodNombre = "Pedido de Comida";
        if (v.detalles && v.detalles.length > 0) {
          prodNombre = v.detalles[0].observaciones || `Producto #${v.detalles[0].idVariante}`;
          if (v.detalles.length > 1) {
            prodNombre += ` + ${v.detalles.length - 1} más`;
          }
        }
        return {
          idTrans: v.codigoPedido || `VEN-${String(v.idVenta).padStart(4, '0')}`,
          fecha: v.fechaVenta ? formatColombiaDateES(v.fechaVenta, 'Reciente') : 'Reciente',
          producto: prodNombre,
          total: `$${Number(v.total || 0).toLocaleString('es-CO')}`
        };
      });
    } catch (err) {
      console.warn(`Error cargando ventas para cliente #${c.idCliente}:`, err.message);
    }

    const isMostradorClient = Boolean(meta.esMostrador || (cleanDireccion && cleanDireccion.toLowerCase().includes('mostrador')) || (meta.tipo && String(meta.tipo).toLowerCase().includes('mostrador')) || (!c.idUsuario && meta.nombre === 'Cliente' && meta.apellidos === 'Mostrador'));

    const hasAccount = Boolean(c.idUsuario || c.usuario);

    let tipo = 'Nuevo';
    let descuentoPorcentaje = 0;
    let fidelidadEvaluada;

    if (isMostradorClient) {
      tipo = 'Mostrador';
      descuentoPorcentaje = 0;
      fidelidadEvaluada = {
        tipo: 'Mostrador',
        descuentoPorcentaje: 0,
        comprasCiclo: 0,
        comprasTotales: comprasCount,
        diasRestantes: 0,
        enGracia: false,
        tieneCuenta: false
      };
    } else if (!hasAccount) {
      tipo = 'Nuevo';
      descuentoPorcentaje = 0;
      fidelidadEvaluada = {
        tipo: 'Nuevo',
        descuentoPorcentaje: 0,
        comprasCiclo: 0,
        comprasTotales: comprasCount,
        diasRestantes: 0,
        enGracia: false,
        tieneCuenta: false
      };
    } else {
      const calculatedCicloFromPurchases = comprasCount % 3;

      // Regla oficial Ficha SENA 3209616: 15% de descuento en la siguiente compra tras cada 3 compras
      const fidelidadActual = meta.fidelidad || {
        tipo: meta.tipo || 'Nuevo',
        comprasCiclo: meta.ciclo !== undefined ? Number(meta.ciclo) : (meta.comprasCiclo !== undefined ? Number(meta.comprasCiclo) : calculatedCicloFromPurchases),
        comprasTotales: comprasCount,
        d15: meta.d15 !== undefined ? Boolean(meta.d15) : undefined
      };

      fidelidadEvaluada = FidelidadService.evaluarEstadoFidelidad(fidelidadActual, comprasCount);
      tipo = fidelidadEvaluada.tipo;
      descuentoPorcentaje = fidelidadEvaluada.descuentoPorcentaje;
    }

    // Determine state: if user account linked and not active, client state is Inactivo or Pendiente
    const isUserActive = c.usuario
      ? Boolean(String(c.usuario.estado).toUpperCase() === 'ACTIVO' || c.usuario.estado === 1 || c.usuario.estado === true)
      : (c.estado !== 0 && c.estado !== false && meta.estado !== 'Inactivo' && meta.estado !== 0);

    let estadoStr = 'Activo';
    if (c.usuario && String(c.usuario.estado).toUpperCase() === 'PENDIENTE') {
      estadoStr = 'Pendiente';
    } else if ((c.usuario && !isUserActive) || c.estado === 0 || c.estado === false || meta.estado === 'Inactivo' || meta.estado === 0) {
      estadoStr = 'Inactivo';
    }
    const rawNombre = c.usuario ? c.usuario.nombre : (meta.nombre || 'Cliente');
    const rawApellidos = c.usuario ? c.usuario.apellidos : (meta.apellidos || '');
    const { nombre: cleanNombre, apellidos: cleanApellidos } = cleanNameAndLastName(rawNombre, rawApellidos);
    const cleanTelefono = sanitizeTelefono(c.usuario ? c.usuario.telefono : (meta.telefono || ''));

    const rawTipoDoc = (c.usuario && c.usuario.tipoDocumento) || meta.tipoDocumento || 'C.C.';
    const rawDocumento = (c.usuario && c.usuario.numeroDocumento) || meta.documento || (c.idUsuario ? String(c.idUsuario) : '');

    return {
      id: c.idCliente,
      idCliente: c.idCliente,
      idUsuario: c.idUsuario || null,
      tieneCuenta: hasAccount,
      cuentaActiva: Boolean(hasAccount && isUserActive),
      tipoDocumento: rawTipoDoc,
      documento: rawDocumento,
      direccion: cleanDireccion,
      tipo,
      descuentoPorcentaje,
      fidelidad: fidelidadEvaluada,
      nombre: cleanNombre,
      apellidos: cleanApellidos,
      email: c.usuario ? c.usuario.email : (meta.email || ''),
      telefono: cleanTelefono,
      estado: estadoStr,
      estadoCuenta: c.usuario ? (c.usuario.estado || 'ACTIVO') : (c.estado === 1 ? 'ACTIVO' : 'INACTIVO'),
      compras: comprasCount,
      totalConsumido: `$${totalGastadoSum.toLocaleString('es-CO')}`,
      totalGastado: `$${totalGastadoSum.toLocaleString('es-CO')}`,
      ticketPromedio: comprasCount > 0 ? `$${Math.round(ticketPromedioVal / 1000)}K` : '$0',
      transacciones,
      usuario: c.usuario ? {
        id: c.usuario.idUsuario,
        nombre: cleanNombre,
        apellidos: cleanApellidos,
        tipoDocumento: rawTipoDoc,
        numeroDocumento: rawDocumento,
        email: c.usuario.email,
        telefono: cleanTelefono,
        estado: c.usuario.estado
      } : null
    };
  }

  static async getAll(filterObj = {}) {
    const { isPaginated, page, limit, offset } = parsePaginationParams(filterObj, { defaultLimit: 5, maxLimit: 100 });
    const [clientes, allVentas] = await Promise.all([
      Cliente.findAll({
        order: [['idCliente', 'ASC']],
        include: [
          {
            model: User,
            as: 'usuario',
            attributes: ['idUsuario', 'nombre', 'apellidos', 'tipoDocumento', 'numeroDocumento', 'email', 'telefono', 'estado', 'idRol'],
            include: [{ model: Role, as: 'rolInfo', attributes: ['idRol', 'nombre'] }]
          }
        ]
      }),
      // Elimina N+1: una única consulta por lotes para todas las ventas no anuladas
      Venta.findAll({
        where: {
          estadoEntrega: { [Op.ne]: 'CANCELADO' },
          estadoAprobacion: { [Op.ne]: 'RECHAZADO' }
        },
        order: [['idVenta', 'DESC']],
        include: [{ model: DetalleVentaProducto, as: 'detalles', separate: true }]
      }).catch(() => [])
    ]);

    const ventasByCliente = new Map();
    const ventasByUsuario = new Map();
    for (const v of allVentas) {
      if (v.idCliente) {
        if (!ventasByCliente.has(v.idCliente)) ventasByCliente.set(v.idCliente, []);
        ventasByCliente.get(v.idCliente).push(v);
      }
      if (v.idUsuario) {
        if (!ventasByUsuario.has(v.idUsuario)) ventasByUsuario.set(v.idUsuario, []);
        ventasByUsuario.get(v.idUsuario).push(v);
      }
    }

    const result = [];
    for (const c of clientes) {
      // Exclude Cliente Mostrador placeholder (id 26 or Mostrador) from registered clients list
      if (!c.idUsuario && (c.direccion && (c.direccion.toLowerCase().includes('mostrador') || c.direccion.toLowerCase().includes('"esmostrador":true')))) {
        continue;
      }

      // Exclude staff users (Administrador, Vendedor, Cocinero) from client list
      if (c.usuario) {
        const userRolId = c.usuario.idRol;
        const rolNom = String(c.usuario.rolInfo?.nombre || '').toLowerCase();
        if (userRolId === 1 || userRolId === 2 || userRolId === 3 ||
            rolNom.includes('admin') || rolNom.includes('vendedor') || rolNom.includes('cocinero')) {
          continue;
        }
      }

      const seenIds = new Set();
      const mergedVentas = [];
      for (const v of (ventasByCliente.get(c.idCliente) || [])) {
        if (!seenIds.has(v.idVenta)) {
          seenIds.add(v.idVenta);
          mergedVentas.push(v);
        }
      }
      if (c.idUsuario) {
        for (const v of (ventasByUsuario.get(c.idUsuario) || [])) {
          if (!seenIds.has(v.idVenta)) {
            seenIds.add(v.idVenta);
            mergedVentas.push(v);
          }
        }
      }
      mergedVentas.sort((a, b) => Number(b.idVenta || 0) - Number(a.idVenta || 0));

      result.push(await this.formatCliente(c, mergedVentas));
    }

    if (isPaginated) {
      let filtered = result;
      if (filterObj.estado && filterObj.estado !== 'Todos') {
        const eNorm = String(filterObj.estado).toLowerCase().trim();
        filtered = filtered.filter((c) => String(c.estado || '').toLowerCase().trim() === eNorm);
      }
      if (filterObj.tipo && filterObj.tipo !== 'Todos') {
        const tNorm = String(filterObj.tipo).toLowerCase().trim();
        filtered = filtered.filter((c) => String(c.tipo || '').toLowerCase().trim() === tNorm);
      }
      if (filterObj.search && String(filterObj.search).trim()) {
        const q = String(filterObj.search).toLowerCase().trim();
        filtered = filtered.filter((c) => {
          const haystack = [c.nombre, c.apellidos, c.email, c.telefono, c.numeroDocumento, c.documento, c.direccion, c.tipo]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          return haystack.includes(q);
        });
      }
      const total = filtered.length;
      return buildPaginatedResponse(filtered.slice(offset, offset + limit), total, page, limit);
    }

    return result;
  }

  static async getClientesStats() {
    const list = await this.getAll();
    const totalCount = list.length;
    const vipCount = list.filter((c) => (c.tipo || (c.esVip ? 'VIP' : '')) === 'VIP').length;
    const frecuentesCount = list.filter((c) => (c.tipo || '') === 'Frecuente').length;
    const nuevosCount = list.filter((c) => (c.tipo || '') === 'Nuevo').length;

    return {
      total: totalCount,
      vip: vipCount,
      frecuentes: frecuentesCount,
      nuevos: nuevosCount
    };
  }

  static async getById(id) {
    const c = await Cliente.findByPk(id, {
      include: [{ model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos', 'email', 'telefono', 'estado'] }]
    });

    if (!c) {
      const error = new Error('Cliente no encontrado');
      error.statusCode = 404;
      throw error;
    }

    return this.formatCliente(c);
  }

  static async create(data) {
    let idUsuario = data.idUsuario || null;

    if (data.nombre && !isValidPersonName(data.nombre)) {
      const error = new Error('El nombre contiene caracteres inválidos (no se permiten números ni arrobas).');
      error.statusCode = 400;
      throw error;
    }
    if (data.apellidos && !isValidPersonName(data.apellidos)) {
      const error = new Error('Los apellidos contienen caracteres inválidos (no se permiten números ni arrobas).');
      error.statusCode = 400;
      throw error;
    }

    if (data.email && data.email.trim()) {
      if (!isValidEmailStrict(data.email.trim())) {
        const error = new Error('El correo electrónico tiene un formato inválido o caracteres especiales no permitidos.');
        error.statusCode = 400;
        throw error;
      }
    }

    const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(data.nombre, data.apellidos);
    const cleanTel = sanitizeTelefono(data.telefono);
    const cleanDoc = data.documento ? sanitizeDocumento(data.documento, data.tipoDocumento) : null;

    // Validación de documento duplicado de inmediato en base de datos
    if (cleanDoc) {
      const existingUserDoc = await User.findOne({
        where: { numeroDocumento: cleanDoc }
      });
      if (existingUserDoc) {
        const error = new Error(`Ya existe un cliente registrado con el número de documento ${cleanDoc} (${existingUserDoc.nombre} ${existingUserDoc.apellidos || ''}).`);
        error.statusCode = 400;
        throw error;
      }
    }

    // Validación de correo duplicado
    if (data.email && data.email.trim()) {
      const existingEmail = await User.findOne({
        where: { email: data.email.trim().toLowerCase() }
      });
      if (existingEmail) {
        const error = new Error(`Ya existe un usuario registrado con el correo electrónico ${data.email.trim()}.`);
        error.statusCode = 400;
        throw error;
      }
    }

    // Siempre crear cuenta de acceso vinculada (Ítem 121: cuenta PENDIENTE con enlace de activación)
    if (!idUsuario && cleanNom) {
      const clienteRol = await Role.findOne({ where: { nombre: 'Cliente' } });
      const crypto = require('crypto');
      const randomSeed = crypto.randomBytes(32).toString('hex');
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(randomSeed, salt);
      const userEmail = data.email ? data.email.trim().toLowerCase() : `cliente_${cleanDoc || Date.now()}@chazinfood.com`;

      const user = await User.create({
        nombre: cleanNom,
        apellidos: cleanApe,
        tipoDocumento: data.tipoDocumento || 'C.C.',
        numeroDocumento: cleanDoc,
        email: userEmail,
        telefono: cleanTel,
        contrasena: hashedPassword,
        idRol: clienteRol ? clienteRol.idRol : 4,
        estado: 'PENDIENTE'
      });
      idUsuario = user.idUsuario;

      // Despachar correo electrónico con token de activación firmado (sin contraseña en texto plano)
      if (data.email && data.email.trim()) {
        try {
          const activationToken = AuthService.generateActivationToken(user);
          const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
          const activationLink = `${frontendUrl}/activar-cuenta?token=${encodeURIComponent(activationToken)}`;

          await EmailService.sendActivationEmail({
            email: userEmail,
            nombre: cleanNom,
            apellidos: cleanApe,
            password: '', // Sin contraseña en texto claro
            activationLink,
            usuario: user
          });
        } catch (mailErr) {
          console.error('Error enviando correo de activación:', mailErr.message);
        }
      }
    }

    const tipo = data.tipo || 'Nuevo';
    const now = new Date();
    const fechaVence = tipo !== 'Nuevo' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;

    const direccionMeta = JSON.stringify({
      tipoDocumento: data.tipoDocumento || 'C.C.',
      documento: cleanDoc,
      direccion: data.direccion || '',
      tipo,
      ciclo: 0,
      inicio: tipo !== 'Nuevo' ? now.toISOString() : null,
      vence: fechaVence
    });

    const cliente = await Cliente.create({
      idUsuario: idUsuario,
      direccion: direccionMeta,
      estado: 1
    });

    await resetAutoIncrement('cliente', 'idCliente');
    return this.getById(cliente.idCliente);
  }

  static async update(id, data) {
    if (data.nombre && !isValidPersonName(data.nombre)) {
      const error = new Error('El nombre contiene caracteres inválidos (no se permiten números ni arrobas).');
      error.statusCode = 400;
      throw error;
    }
    if (data.apellidos && !isValidPersonName(data.apellidos)) {
      const error = new Error('Los apellidos contienen caracteres inválidos (no se permiten números ni arrobas).');
      error.statusCode = 400;
      throw error;
    }
    if (data.email && data.email.trim()) {
      if (!isValidEmailStrict(data.email.trim())) {
        const error = new Error('El correo electrónico tiene un formato inválido o caracteres especiales no permitidos.');
        error.statusCode = 400;
        throw error;
      }
    }

    const c = await Cliente.findByPk(id, {
      include: [{ model: User, as: 'usuario' }]
    });

    if (!c) {
      const error = new Error('Cliente no encontrado');
      error.statusCode = 404;
      throw error;
    }

    let existingMeta = {};
    if (c.direccion && c.direccion.trim().startsWith('{')) {
      try {
        existingMeta = JSON.parse(c.direccion);
      } catch (e) {
        existingMeta = {};
      }
    } else {
      existingMeta = { direccion: c.direccion || '' };
    }

    const rawNom = data.nombre !== undefined ? data.nombre : existingMeta.nombre;
    const rawApe = data.apellidos !== undefined ? data.apellidos : existingMeta.apellidos;
    const { nombre: cleanNom, apellidos: cleanApe } = cleanNameAndLastName(rawNom, rawApe);
    const cleanTel = data.telefono !== undefined ? sanitizeTelefono(data.telefono) : existingMeta.telefono;

    const newDireccionStr = data.direccion !== undefined ? data.direccion : existingMeta.direccion || '';
    const newTipo = data.tipo !== undefined ? data.tipo : existingMeta.tipo || 'Nuevo';
    const defaultDesc = newTipo === 'VIP' ? 15 : newTipo === 'Frecuente' ? 10 : newTipo === 'Regular' ? 5 : 0;
    const newDesc = defaultDesc;

    // Handle account linkage / creation upon edit if requested
    if (data.crearCuenta && !c.idUsuario && data.email) {
      const clienteRol = await Role.findOne({ where: { nombre: 'Cliente' } });
      const defaultPass = data.contrasena || '123456';
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(defaultPass, salt);

      const user = await User.create({
        nombre: cleanNom || 'Cliente',
        apellidos: cleanApe || '',
        email: data.email.trim(),
        telefono: cleanTel || '',
        contrasena: hashedPassword,
        idRol: clienteRol ? clienteRol.idRol : 4,
        estado: 'ACTIVO'
      });
      c.idUsuario = user.idUsuario;
    } else if (data.idUsuario !== undefined) {
      c.idUsuario = data.idUsuario;
    }

    const now = new Date();
    let newInicio = existingMeta.inicio || existingMeta.fechaInicioNivel || null;
    let newVence = existingMeta.vence || existingMeta.fechaVencimientoNivel || null;
    let newCiclo = existingMeta.ciclo !== undefined ? Number(existingMeta.ciclo) : (existingMeta.comprasCiclo !== undefined ? Number(existingMeta.comprasCiclo) : 0);

    if (data.tipo !== undefined && data.tipo !== existingMeta.tipo) {
      newInicio = newTipo !== 'Nuevo' ? now.toISOString() : null;
      newVence = newTipo !== 'Nuevo' ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString() : null;
      newCiclo = 0;
    } else if (newTipo !== 'Nuevo' && !newVence) {
      newInicio = now.toISOString();
      newVence = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    }

    const incomingRawDoc = data.documento !== undefined ? data.documento : data.numeroDocumento;
    if (incomingRawDoc !== undefined || data.tipoDocumento !== undefined) {
      const currentTipoDoc = String(c.usuario?.tipoDocumento || existingMeta.tipoDocumento || 'C.C.').trim();
      const currentRealDoc = String(c.usuario?.numeroDocumento || existingMeta.documento || '').trim();
      const targetTipoDoc = data.tipoDocumento ? String(data.tipoDocumento).trim() : currentTipoDoc;
      const incomingCleanDoc =
        incomingRawDoc !== undefined && String(incomingRawDoc || '').trim() !== ''
          ? sanitizeDocumento(incomingRawDoc, targetTipoDoc)
          : '';

      const tipoChanged = data.tipoDocumento !== undefined && targetTipoDoc !== currentTipoDoc;
      const docChanged = incomingRawDoc !== undefined && incomingCleanDoc !== currentRealDoc;

      if (tipoChanged || docChanged) {
        const error = new Error('La identificación del cliente (tipo y número de documento) no se puede modificar.');
        error.statusCode = 400;
        throw error;
      }
    }

    const finalEstado = (!c.idUsuario || data.estado === 'Inactivo' || data.estado === 0) ? 0 : 1;
    c.direccion = JSON.stringify({
      direccion: newDireccionStr,
      tipo: newTipo,
      ciclo: newCiclo,
      inicio: newInicio,
      vence: newVence,
      ...(existingMeta.tipoDocumento ? { tipoDocumento: existingMeta.tipoDocumento } : {}),
      ...(existingMeta.documento ? { documento: existingMeta.documento } : {})
    });

    if (data.estado !== undefined) c.estado = finalEstado;
    await c.save();

    if (c.usuario) {
      const nameChanged = data.nombre !== undefined || data.apellidos !== undefined;
      if (nameChanged) {
        const newFullName = formatNombreCompleto(cleanNom, cleanApe).toLowerCase();
        const currentFullName = formatNombreCompleto(c.usuario.nombre, c.usuario.apellidos).toLowerCase();
        if (newFullName && newFullName !== currentFullName) {
          const otherUsers = await User.findAll({
            where: { idUsuario: { [Op.ne]: c.usuario.idUsuario } },
            attributes: ['idUsuario', 'nombre', 'apellidos']
          });
          const duplicateName = otherUsers.some(u => formatNombreCompleto(u.nombre, u.apellidos).toLowerCase() === newFullName);
          if (duplicateName) {
            const error = new Error(`Ya existe un usuario registrado con el nombre "${formatNombreCompleto(cleanNom, cleanApe)}"`);
            error.statusCode = 400;
            throw error;
          }
        }
        c.usuario.nombre = cleanNom;
        c.usuario.apellidos = cleanApe;
      }

      if (data.email !== undefined) {
        const finalEmail = data.email.trim().toLowerCase();
        if (finalEmail && finalEmail !== (c.usuario.email || '').toLowerCase()) {
          const existingEmail = await User.findOne({
            where: {
              email: finalEmail,
              idUsuario: { [Op.ne]: c.usuario.idUsuario }
            }
          });
          if (existingEmail) {
            const error = new Error('Ya existe un usuario registrado con este correo electrónico');
            error.statusCode = 400;
            throw error;
          }
          c.usuario.email = finalEmail;
        }
      }

      // La identificación del cliente (tipoDocumento y numeroDocumento) es inmutable en edición.

      if (data.telefono !== undefined) c.usuario.telefono = cleanTel;
      if (data.estado !== undefined) {
        c.usuario.estado = data.estado === 'Inactivo' || data.estado === 0 ? 'INACTIVO' : 'ACTIVO';
      }
      await c.usuario.save();

      // Send update notification email
      if (data.notificarEmail !== false) {
        EmailService.sendUserUpdatedEmail({
          email: c.usuario.email,
          nombre: c.usuario.nombre,
          apellidos: c.usuario.apellidos,
          modifiedFields: nameChanged ? 'Nombre / Apellidos' : 'Información de cuenta',
          usuario: c.usuario
        }).catch(err => console.error('Background email notification error in cliente update:', err.message));
      }
    }

    return this.getById(id);
  }

  static async delete(id) {
    const c = await Cliente.findByPk(id);
    if (!c) {
      const error = new Error('Cliente no encontrado');
      error.statusCode = 404;
      throw error;
    }

    // Proteger registros contables: no eliminar clientes con ventas asociadas
    const ventasAsociadas = await Venta.count({ where: { idCliente: id } });
    if (ventasAsociadas > 0) {
      const error = new Error(
        `No es posible eliminar el cliente porque cuenta con ${ventasAsociadas} ${ventasAsociadas === 1 ? 'venta asociada' : 'ventas asociadas'}. Solo se puede cambiar su estado a Inactivo para preservar el histórico de ventas.`
      );
      error.statusCode = 400;
      throw error;
    }

    await c.destroy();
    await resequenceTableIds('cliente', 'idCliente', [{ table: 'venta', column: 'idCliente' }]);

    return { message: 'Cliente eliminado exitosamente' };
  }

  static async registrarCompraFidelidad(idCliente) {
    if (!idCliente || Number(idCliente) === 26) return null;
    try {
      const c = await Cliente.findByPk(idCliente, {
        include: [{ model: User, as: 'usuario' }]
      });
      if (!c || !c.idUsuario) return null;
      if (c.estado === 0 || c.estado === false || (c.usuario && (String(c.usuario.estado).toUpperCase() === 'INACTIVO' || c.usuario.estado === 0))) {
        return null;
      }
      if (c.direccion && c.direccion.toLowerCase().includes('mostrador')) return null;

      let meta = {};
      let cleanDir = '';
      if (c.direccion) {
        const raw = String(c.direccion).trim();
        if (raw.startsWith('{')) {
          try {
            meta = JSON.parse(raw);
            cleanDir = meta.direccion || '';
          } catch (e) {
            const match = raw.match(/"direccion"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/i);
            if (match) cleanDir = match[1];
          }
        } else {
          cleanDir = raw;
        }
      }

      let prevPurchases = 0;
      if (meta.ciclo === undefined || !meta.tipo) {
        try {
          const { Venta } = require('../../persistence/models');
          prevPurchases = await Venta.count({
            where: {
              [Op.or]: [
                { idCliente: c.idCliente },
                ...(c.idUsuario ? [{ idUsuario: c.idUsuario }] : [])
              ],
              estadoEntrega: { [Op.ne]: 'CANCELADO' },
              estadoAprobacion: { [Op.ne]: 'RECHAZADO' }
            }
          });
        } catch (_) {}
      }

      const calculatedTier = prevPurchases >= 9 ? 'VIP' : prevPurchases >= 6 ? 'Frecuente' : prevPurchases >= 3 ? 'Regular' : 'Nuevo';
      const calculatedCiclo = prevPurchases % 3;

      const fidelidadActual = meta.fidelidad || {
        tipo: meta.tipo || 'Nuevo',
        comprasCiclo: meta.ciclo !== undefined ? Number(meta.ciclo) : (meta.comprasCiclo !== undefined ? Number(meta.comprasCiclo) : calculatedCiclo),
        comprasTotales: meta.comprasTotales !== undefined ? Number(meta.comprasTotales) : prevPurchases,
        d15: meta.d15 !== undefined ? Boolean(meta.d15) : undefined
      };

      const nuevaFidelidad = FidelidadService.registrarCompra(fidelidadActual);

      // Keep metadata compact to strictly fit inside VARCHAR(255)
      const compactMeta = {
        direccion: cleanDir,
        tipo: nuevaFidelidad.tipo,
        ciclo: nuevaFidelidad.comprasCiclo,
        d15: Boolean(nuevaFidelidad.descuentoDisponible)
      };

      c.direccion = JSON.stringify(compactMeta);
      await c.save();
      return nuevaFidelidad;
    } catch (err) {
      console.warn(`Error registrando compra de fidelidad para cliente #${idCliente}:`, err.message);
      return null;
    }
  }

  static getCatalogoFidelidad() {
    return FidelidadService.getCatalogoNiveles();
  }
}

module.exports = ClienteService;
