const crypto = require('crypto');
const VentaService = require('./ventaService');
const { Venta, Cliente } = require('../../persistence/models');
const { userHasPrivilege } = require('../../infrastructure/middlewares/authMiddleware');
const {
  getColombiaDateISO,
  extractDateOnlyISO,
  formatColombiaTime12
} = require('../../infrastructure/utils/colombiaDateUtils');
const { invalidateNamespaces } = require('../../infrastructure/utils/apiCache');

const VALID_TX_ID_RE = /^[a-zA-Z0-9_-]{4,80}$/;
const MAX_WEBHOOK_AGE_MS = 24 * 60 * 60 * 1000; // 24 horas
const MAX_WEBHOOK_FUTURE_MS = 5 * 60 * 1000; // 5 minutos

class WompiService {
  static getBaseUrl() {
    const isProd = process.env.WOMPI_ENV === 'production';
    return isProd ? 'https://production.wompi.co/v1' : 'https://sandbox.wompi.co/v1';
  }

  static generarFirmaIntegridad(referencia, montoEnCentavos, moneda = 'COP') {
    const integritySecret = process.env.WOMPI_INTEGRITY_SECRET;
    if (!integritySecret) {
      throw new Error('WOMPI_INTEGRITY_SECRET no está configurado en las variables de entorno.');
    }
    const cadena = `${referencia}${montoEnCentavos}${moneda}${integritySecret}`;
    return crypto.createHash('sha256').update(cadena, 'utf8').digest('hex');
  }

  /**
   * Valida la firma criptográfica SHA-256 de un webhook de Wompi con comparación
   * en tiempo constante, acceso seguro a propiedades y verificación de timestamp.
   */
  static validarFirmaWebhook(body) {
    const eventsSecret = String(process.env.WOMPI_EVENTS_SECRET || '').trim();
    if (!eventsSecret || !body || typeof body !== 'object' || !body.signature) return false;

    const { properties, checksum } = body.signature;
    const timestamp = body.timestamp;
    if (!Array.isArray(properties) || properties.length === 0 || typeof checksum !== 'string' || !checksum.trim()) {
      return false;
    }
    if (timestamp === undefined || timestamp === null || !Number.isFinite(Number(timestamp))) {
      return false;
    }

    // Validar ventana temporal del timestamp (segundos o milisegundos Unix)
    const rawTs = Number(timestamp);
    const tsMs = rawTs < 1e12 ? rawTs * 1000 : rawTs;
    const ageMs = Date.now() - tsMs;
    if (ageMs > MAX_WEBHOOK_AGE_MS || ageMs < -MAX_WEBHOOK_FUTURE_MS) {
      return false;
    }

    let cadena = '';
    for (const prop of properties) {
      if (typeof prop !== 'string' || !/^[a-zA-Z0-9_.]{1,80}$/.test(prop)) {
        return false;
      }
      const parts = prop.split('.');
      let val = body.data;
      for (const p of parts) {
        if (p === '__proto__' || p === 'constructor' || p === 'prototype') return false;
        if (val && typeof val === 'object' && Object.prototype.hasOwnProperty.call(val, p)) {
          val = val[p];
        } else {
          val = undefined;
          break;
        }
      }
      cadena += (val !== undefined && val !== null) ? String(val) : '';
    }
    cadena += `${timestamp}${eventsSecret}`;

    const calculatedChecksum = crypto.createHash('sha256').update(cadena, 'utf8').digest('hex');
    const expectedBuf = Buffer.from(calculatedChecksum.toLowerCase(), 'utf8');
    const providedBuf = Buffer.from(checksum.trim().toLowerCase(), 'utf8');
    if (expectedBuf.length !== providedBuf.length) return false;

    return crypto.timingSafeEqual(expectedBuf, providedBuf);
  }

  static async calcularSubtotalServidor(pedidoData) {
    const { Variante, Product, Insumo, Evento } = require('../../persistence/models');
    const items = pedidoData.detalles || pedidoData.items || pedidoData.productos || [];
    if (!Array.isArray(items) || items.length === 0) return null;

    const hoy = getColombiaDateISO();
    const eventosActivos = await Evento.findAll({ where: { estado: 1 } }).catch(() => []);
    const eventosVigentes = eventosActivos.filter(e => {
      const inicioISO = extractDateOnlyISO(e.fechaInicio);
      const finISO = extractDateOnlyISO(e.fechaFin);
      return (!inicioISO || inicioISO <= hoy) && (!finISO || finISO >= hoy);
    });

    let subtotal = 0;
    for (const it of items) {
      const cantidad = Math.floor(Number(it.cantidad || 0));
      if (!Number.isFinite(cantidad) || cantidad < 1 || cantidad > 100) return null;
      let precioBase = null;
      let idProducto = it.idProducto || null;
      let precioVariante = null;

      const reqVarId = !it.esVarianteBase ? (it.idVariante || it.varianteId) : null;
      if (reqVarId) {
        const variante = await Variante.findByPk(reqVarId).catch(() => null);
        if (variante) {
          const isDummyBase = String(variante.nombre || '').toLowerCase().includes('- base');
          if (!isDummyBase && Number(variante.estado) === 0) {
            const err = new Error(`La variante "${variante.nombre}" no está disponible en este momento.`);
            err.statusCode = 400;
            throw err;
          }
          idProducto = idProducto || variante.idProducto;
          if (!isDummyBase && Number(variante.precio) > 0) {
            precioVariante = Number(variante.precio);
          }
        }
      }
      let prodBasePrice = null;
      if (idProducto) {
        const producto = await Product.findByPk(idProducto).catch(() => null);
        if (producto) {
          prodBasePrice = Number(producto.precio || 0);
          precioBase = precioVariante !== null ? precioVariante : prodBasePrice;
        }
      } else if (precioVariante !== null) {
        precioBase = precioVariante;
      }
      if (precioBase === null || !(precioBase > 0)) return null;

      const { resolveBestEventUnitPrice } = require('../../infrastructure/utils/eventPricingUtils');
      const precioUnitario = resolveBestEventUnitPrice({
        eventosVigentes,
        idProducto,
        precioBase,
        prodBasePrice
      });

      let adicionesTotal = 0;
      if (Array.isArray(it.adiciones)) {
        for (const ad of it.adiciones) {
          const adId = typeof ad === 'object' ? (ad.idAdicion || ad.idInsumo || ad.id) : ad;
          const adCant = typeof ad === 'object' ? Math.max(1, Math.floor(Number(ad.cantidad || 1))) : 1;
          if (!adId) continue;
          const insumoAd = await Insumo.findByPk(adId).catch(() => null);
          if (insumoAd) adicionesTotal += Number(insumoAd.precioAdicion || 0) * adCant;
        }
      }

      subtotal += (precioUnitario + adicionesTotal) * cantidad;
    }
    return Math.round(subtotal);
  }

  /**
   * Crea una intención de pago: calcula estrictamente el total desde BD,
   * registra la orden en estado PENDIENTE y genera la firma SHA-256 de integridad.
   */
  static async crearIntencionPago(pedidoData, user) {
    const userId = user?.idUsuario || user?.id || user?._id;
    if (!userId) {
      const err = new Error('Usuario no autenticado para iniciar el pago.');
      err.statusCode = 401;
      throw err;
    }

    // Liberar inventario de intenciones Wompi abandonadas (>30 min) con throttle interno
    VentaService.expirarVentasWompiAbandonadas().catch(() => {});

    // Seguridad (AUD-004): el subtotal del servidor es obligatorio (sin omitir validación si devuelve null)
    const subtotalServidor = await this.calcularSubtotalServidor(pedidoData);
    if (subtotalServidor === null || !(subtotalServidor > 0)) {
      const err = new Error('No se pudieron verificar los productos o precios vigentes del carrito. Actualiza la página e inténtalo de nuevo.');
      err.statusCode = 400;
      throw err;
    }

    const timestamp = Date.now();
    const randomSuffix = crypto.randomInt(1000, 9999);
    const referencia = `CHAZIN-${timestamp}-${randomSuffix}`;
    const moneda = 'COP';

    // Eliminar cualquier campo sensible de precio/estado/descuento enviado por el cliente
    const sanitizedPedido = { ...(pedidoData || {}) };
    delete sanitizedPedido.esDevolucion;
    delete sanitizedPedido._trustedDevolucion;
    delete sanitizedPedido.subtotal;
    delete sanitizedPedido.total;
    delete sanitizedPedido.descuento;
    delete sanitizedPedido.descuentoAplicado;
    delete sanitizedPedido.estadoAprobacion;
    delete sanitizedPedido.estadoPago;
    delete sanitizedPedido.estadoEntrega;
    delete sanitizedPedido.idCliente;
    delete sanitizedPedido.aprobadoPorUsuarioId;

    const existingObs = typeof sanitizedPedido.observaciones === 'string'
      ? (() => { try { return JSON.parse(sanitizedPedido.observaciones); } catch (e) { return { nota: sanitizedPedido.observaciones }; } })()
      : (sanitizedPedido.observaciones || {});

    const datosConWompi = {
      ...sanitizedPedido,
      idUsuario: userId,
      origen: 'ONLINE',
      metodoPago: 'Wompi',
      estadoPago: 'Pendiente',
      estadoAprobacion: 'PENDIENTE',
      estadoEntrega: 'PENDIENTE',
      observaciones: JSON.stringify({
        ...existingObs,
        wompiReference: referencia,
        moneda,
        metodoPago: 'Wompi',
        estadoPago: 'Pendiente',
        estadoAprobacion: 'PENDIENTE',
        fechaIntencion: new Date().toISOString()
      })
    };

    const ventaCreada = await VentaService.create(datosConWompi);

    const totalServidor = Number(ventaCreada.total || 0);
    if (!(totalServidor > 0)) {
      const err = new Error('El total calculado en el servidor es inválido para iniciar el pago.');
      err.statusCode = 400;
      throw err;
    }

    const montoEnCentavos = Math.round(totalServidor * 100);
    const firmaIntegridad = this.generarFirmaIntegridad(referencia, montoEnCentavos, moneda);

    try {
      const ventaRow = await Venta.findByPk(ventaCreada.idVenta || ventaCreada.id);
      if (ventaRow) {
        let obs = {};
        try { obs = JSON.parse(ventaRow.observaciones || '{}'); } catch (e) { obs = {}; }
        obs.wompiReference = referencia;
        obs.moneda = moneda;
        obs.esIntencionWompi = true;
        obs.montoEnCentavos = montoEnCentavos;
        ventaRow.observaciones = JSON.stringify(obs);
        await ventaRow.save();
      }
    } catch (e) {
      console.warn('No se pudo guardar el monto Wompi en la venta:', e.message);
    }

    return {
      success: true,
      referencia,
      montoEnCentavos,
      moneda,
      firma: firmaIntegridad,
      publicKey: process.env.WOMPI_PUBLIC_KEY,
      ventaId: ventaCreada.idVenta || ventaCreada.id,
      numeroVenta: ventaCreada.numeroVenta || ventaCreada.codigoPedido
    };
  }

  /**
   * Consulta el estado de una transacción en la API oficial de Wompi con validación estricta
   * de formato de ID, verificación de pertenencia y conciliación estricta de montos.
   */
  static async verificarTransaccion(idTransaccion, currentUser = null) {
    const cleanTxId = String(idTransaccion || '').trim();
    if (!cleanTxId || !VALID_TX_ID_RE.test(cleanTxId)) {
      const err = new Error('ID de transacción inválido');
      err.statusCode = 400;
      throw err;
    }

    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error('WOMPI_PRIVATE_KEY no está configurada.');
    }

    const url = `${this.getBaseUrl()}/transactions/${encodeURIComponent(cleanTxId)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${privateKey}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Error consultando transacción ${cleanTxId} a Wompi:`, errorText);
      const err = new Error(`Error al consultar Wompi: ${response.statusText}`);
      err.statusCode = response.status;
      throw err;
    }

    const wompiResult = await response.json();
    const tx = wompiResult.data;
    if (!tx) {
      throw new Error('Respuesta inválida de Wompi');
    }

    const { mapWompiPaymentMethodType } = require('../../infrastructure/utils/paymentMethodUtils');
    const referencia = String(tx.reference || '').trim();
    const estadoWompi = tx.status;
    const metodoPagoTipoRaw = tx.payment_method_type || tx.payment_method?.type || null;
    const metodoPagoDetalle = mapWompiPaymentMethodType(metodoPagoTipoRaw, tx.payment_method);

    // Buscar candidatas y exigir coincidencia EXACTA de wompiReference en JSON
    const { Op } = require('sequelize');
    const safeLikeRef = referencia.replace(/[%_\\]/g, '');
    const candidatas = safeLikeRef
      ? await Venta.findAll({
          where: { observaciones: { [Op.like]: `%${safeLikeRef}%` } },
          order: [['idVenta', 'DESC']],
          limit: 5
        })
      : [];

    const ventaEncontrada = candidatas.find((v) => {
      try {
        const parsed = JSON.parse(v.observaciones || '{}');
        return String(parsed.wompiReference || '') === referencia;
      } catch (_) {
        return false;
      }
    }) || null;

    if (ventaEncontrada) {
      // Si la consulta viene de un usuario HTTP (no webhook), comprobar propiedad o privilegio de ventas
      if (currentUser) {
        const canViewAll = userHasPrivilege(currentUser, ['Gestión de Ventas', 'Dashboard'], 'Ver');
        if (!canViewAll) {
          const reqUid = Number(currentUser.idUsuario || currentUser.id || 0);
          const cliente = reqUid ? await Cliente.findOne({ where: { idUsuario: reqUid } }) : null;
          const belongsByClient = cliente && Number(ventaEncontrada.idCliente) === Number(cliente.idCliente);
          const belongsByUser = reqUid && Number(ventaEncontrada.idUsuario) === reqUid;
          if (!belongsByClient && !belongsByUser) {
            const err = new Error('No tienes permiso para verificar esta transacción.');
            err.statusCode = 403;
            throw err;
          }
        }
      }

      let obsObj = {};
      try {
        obsObj = JSON.parse(ventaEncontrada.observaciones || '{}');
      } catch (e) {
        obsObj = {};
      }

      // Seguridad (AUD-007): exigir ambos montos > 0 para aprobar coincidencia
      const montoEsperado = Number(obsObj.montoEnCentavos || Math.round(Number(ventaEncontrada.total || 0) * 100));
      const montoPagado = Number(tx.amount_in_cents || 0);
      const montoCoincide = montoPagado > 0 && montoEsperado > 0 && Math.abs(montoPagado - montoEsperado) <= 100;

      obsObj.wompiTransactionId = tx.id;
      obsObj.wompiStatus = estadoWompi;
      obsObj.paymentMethodType = metodoPagoTipoRaw || 'Wompi';
      obsObj.wompiPaymentMethod = tx.payment_method;
      if (metodoPagoDetalle) {
        obsObj.metodoPagoDetalle = metodoPagoDetalle;
        obsObj.metodo_pago_detalle = metodoPagoDetalle;
      }

      if (estadoWompi === 'APPROVED' && montoCoincide) {
        const yaCancelada = String(ventaEncontrada.estadoEntrega || '').toUpperCase() === 'CANCELADO';
        if (yaCancelada) {
          // No reactivar silenciosamente una venta cancelada cuyo inventario ya fue reintegrado
          obsObj.estadoPago = 'En revisión (venta cancelada)';
          obsObj.alertaPagoEnVentaCancelada = true;
          await ventaEncontrada.update({ observaciones: JSON.stringify(obsObj) });
        } else {
          const yaAprobada = ventaEncontrada.estadoAprobacion === 'APROBADO';
          obsObj.estadoPago = 'Pagado';
          // Mantener el campo principal como "Wompi" para no alterar los filtros de Ventas del Admin
          obsObj.metodoPago = 'Wompi';
          obsObj.estadoAprobacion = 'APROBADO';
          if (!yaAprobada) {
            obsObj.horaEstado = formatColombiaTime12(new Date());
            obsObj.fechaAprobacionPago = new Date().toISOString();
          }

          await ventaEncontrada.update({
            estadoEntrega: yaAprobada ? ventaEncontrada.estadoEntrega : 'PENDIENTE',
            estadoAprobacion: 'APROBADO',
            observaciones: JSON.stringify(obsObj)
          });

          await VentaService.registrarFidelidadUnaVez(ventaEncontrada.idVenta);
          invalidateNamespaces(['ventas', 'productos', 'insumos', 'dashboard', 'produccion']);
        }
      } else if (estadoWompi === 'APPROVED' && !montoCoincide) {
        obsObj.estadoPago = 'En revisión';
        obsObj.alertaMonto = `Monto pagado (${montoPagado}) distinto al esperado (${montoEsperado})`;
        await ventaEncontrada.update({ observaciones: JSON.stringify(obsObj) });
        invalidateNamespaces(['ventas', 'dashboard']);
      } else if (estadoWompi === 'DECLINED' || estadoWompi === 'ERROR' || estadoWompi === 'VOIDED') {
        obsObj.estadoPago = 'Rechazado';
        obsObj.estadoAprobacion = 'RECHAZADO';
        const yaCancelada = ventaEncontrada.estadoEntrega === 'CANCELADO';

        await ventaEncontrada.update({ observaciones: JSON.stringify(obsObj) });

        if (!yaCancelada) {
          await VentaService.updateEstado(ventaEncontrada.idVenta, 'CANCELADO').catch(err =>
            console.warn('Error reintegrando inventario por pago rechazado:', err.message)
          );
        }
        invalidateNamespaces(['ventas', 'productos', 'insumos', 'dashboard', 'produccion']);
      }

      return {
        success: true,
        estado: estadoWompi,
        aprobado: estadoWompi === 'APPROVED' && montoCoincide && String(ventaEncontrada.estadoEntrega || '').toUpperCase() !== 'CANCELADO',
        referencia,
        transaccionId: tx.id,
        metodoPago: 'Wompi',
        metodoPagoDetalle: metodoPagoDetalle || null,
        metodo_pago_detalle: metodoPagoDetalle || null,
        ventaId: ventaEncontrada.idVenta,
        numeroVenta: obsObj.codigoPedido || `VEN-${String(ventaEncontrada.idVenta).padStart(4, '0')}`
      };
    }

    return {
      success: true,
      estado: estadoWompi,
      aprobado: false,
      referencia,
      transaccionId: tx.id,
      metodoPago: 'Wompi',
      metodoPagoDetalle: metodoPagoDetalle || null,
      metodo_pago_detalle: metodoPagoDetalle || null
    };
  }

  static async procesarWebhook(eventData) {
    if (!eventData || eventData.event !== 'transaction.updated') {
      return { received: true, ignored: true };
    }

    const tx = eventData.data?.transaction;
    if (!tx || !tx.id || !VALID_TX_ID_RE.test(String(tx.id).trim())) {
      return { received: true, error: 'Invalid transaction id in webhook' };
    }

    return this.verificarTransaccion(String(tx.id).trim(), null);
  }
}

module.exports = WompiService;
