const { Op } = require('sequelize');
const { Evento, Product, Variante, VarianteInsumo, FichaTecnica, DetalleFichaInsumo, Insumo } = require('../../persistence/models');
const FichaTecnicaService = require('./fichaTecnicaService');
const { ensureVarianteEventoSchemaOnce } = require('../../infrastructure/utils/dbUtils');
const {
  MS_PER_DAY,
  getColombiaDateISO,
  extractDateOnlyISO,
  colombiaStartOfDay,
  colombiaEndOfDay,
  diffCalendarDaysColombia
} = require('../../infrastructure/utils/colombiaDateUtils');

const stripEmojis = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/\p{Extended_Pictographic}/gu, '')
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    .replace(/^\s*[-–—:]\s*/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
};

const isVariantCreatingEventType = (tipoEvento = '', data = {}) => {
  if (data && (data.crearVarianteEvento === true || data.varianteEvento || (Array.isArray(data.variantesEventoPorProducto) && data.variantesEventoPorProducto.length > 0))) {
    return true;
  }
  const low = String(tipoEvento || '').toLowerCase().trim();
  if (!low) return false;
  if (low.includes('2x1')) return false;
  return (
    low === 'añadir insumos' ||
    low.includes('topping') ||
    low.includes('insumo') ||
    low.includes('edición especial') ||
    low.includes('edicion especial') ||
    low === 'edicion_especial' ||
    low === 'edicion_limitada' ||
    low.includes('edición limitada') ||
    low.includes('edicion limitada')
  );
};

const isDummyVariantCollisionName = (vName = '', pName = '') => {
  const vn = String(vName || '').trim().toLowerCase();
  const pn = String(pName || '').trim().toLowerCase();
  if (!vn) return true;
  if (pn && vn === pn) return true;
  return ['base', 'estándar', 'estandar', 'completo', 'combo', 'única', 'unica', 'edición especial', 'edicion especial'].includes(vn);
};

function evaluarVigenciaEvento(e, now = new Date()) {
  const inicioISO = extractDateOnlyISO(e.fechaInicio);
  const finISO = extractDateOnlyISO(e.fechaFin);

  if (!finISO) {
    return {
      estadoVigencia: 'PERMANENTE',
      estaVigente: e.estado === 1,
      diasRestantes: null,
      horasRestantes: null,
      urgente: false,
      label: 'Vigencia Permanente',
      shortLabel: 'Permanente',
      fechaInicio: inicioISO,
      fechaFin: null
    };
  }

  const todayISO = getColombiaDateISO(now);
  const finDate = colombiaEndOfDay(finISO);
  const inicioDate = inicioISO ? colombiaStartOfDay(inicioISO) : null;

  const msRestantes = finDate.getTime() - now.getTime();
  const diasCalendario = diffCalendarDaysColombia(finISO, todayISO);
  const horasRestantes = Math.max(0, Math.floor(msRestantes / (1000 * 60 * 60)));
  const minutosRestantes = Math.max(0, Math.floor((msRestantes % (1000 * 60 * 60)) / (1000 * 60)));
  const segundosRestantes = Math.max(0, Math.floor((msRestantes % (1000 * 60)) / 1000));

  if (inicioDate && now.getTime() < inicioDate.getTime()) {
    const diasParaInicio = Math.max(1, diffCalendarDaysColombia(inicioISO, todayISO) ?? Math.ceil((inicioDate.getTime() - now.getTime()) / MS_PER_DAY));
    return {
      estadoVigencia: 'PROGRAMADO',
      estaVigente: false,
      diasRestantes: Math.max(0, diasCalendario ?? Math.ceil(msRestantes / MS_PER_DAY)),
      horasRestantes,
      minutosRestantes,
      segundosRestantes,
      diasParaInicio,
      urgente: false,
      label: `Inicia en ${diasParaInicio} día${diasParaInicio !== 1 ? 's' : ''}`,
      shortLabel: `En ${diasParaInicio}d`,
      fechaInicio: inicioISO,
      fechaFin: finISO
    };
  }

  if (msRestantes < 0) {
    const calDiff = diffCalendarDaysColombia(todayISO, finISO);
    const diasExpirado = calDiff !== null && calDiff > 0 ? calDiff : 1;
    const expiredLabel = calDiff === 0
      ? 'Finalizado hoy'
      : `Finalizado hace ${diasExpirado} día${diasExpirado !== 1 ? 's' : ''}`;
    return {
      estadoVigencia: 'EXPIRADO',
      estaVigente: false,
      diasRestantes: 0,
      horasRestantes: 0,
      minutosRestantes: 0,
      segundosRestantes: 0,
      diasExpirado,
      urgente: false,
      label: expiredLabel,
      shortLabel: 'Finalizado',
      fechaInicio: inicioISO,
      fechaFin: finISO
    };
  }

  // Activo dentro de la vigencia
  const diasRestantes = Math.max(0, diasCalendario ?? Math.ceil(msRestantes / MS_PER_DAY));
  const urgente = diasRestantes <= 3;
  let label = `Quedan ${diasRestantes} días`;
  let shortLabel = `${diasRestantes}d restantes`;

  if (horasRestantes === 0) {
    label = `¡Termina pronto! (Quedan ${minutosRestantes}m)`;
    shortLabel = `${minutosRestantes}m restantes`;
  } else if (diasCalendario === 0 || horasRestantes < 24) {
    label = `¡Termina hoy! (Quedan ${horasRestantes}h ${minutosRestantes > 0 ? `${minutosRestantes}m` : ''})`.trim();
    shortLabel = `${horasRestantes}h restantes`;
  } else if (diasCalendario === 1) {
    label = `Finaliza mañana (Quedan ${horasRestantes}h)`;
    shortLabel = 'Finaliza mañana';
  }

  return {
    estadoVigencia: 'ACTIVO',
    estaVigente: e.estado === 1,
    diasRestantes,
    horasRestantes,
    minutosRestantes,
    segundosRestantes,
    urgente,
    label,
    shortLabel,
    fechaInicio: inicioISO,
    fechaFin: finISO
  };
}

let lastAutoExpireAt = 0;
const AUTO_EXPIRE_TTL_MS = 5 * 60 * 1000;

class EventoService {
  static async _attachVariantesCreadasMap(eventoIds = []) {
    await ensureVarianteEventoSchemaOnce();
    const map = new Map();
    if (!Array.isArray(eventoIds) || eventoIds.length === 0) return map;
    try {
      const vars = await Variante.findAll({
        where: { idEvento: eventoIds },
        include: [
          {
            model: VarianteInsumo,
            as: 'insumosModificados',
            include: [
              { model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida', 'precioUnitario', 'stock'] },
              { model: Insumo, as: 'insumoReemplazado', attributes: ['idInsumo', 'nombre', 'unidadMedida'] }
            ]
          },
          {
            model: FichaTecnica,
            as: 'fichasTecnicas',
            required: false,
            where: { tipo: 'VARIANTE', estado: 1 },
            include: [
              {
                model: DetalleFichaInsumo,
                as: 'detalles',
                include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida', 'precioUnitario', 'stock'] }]
              }
            ]
          }
        ],
        order: [['idVariante', 'ASC']]
      });

      for (const v of vars) {
        const eid = Number(v.idEvento);
        if (!map.has(eid)) map.set(eid, []);
        const vf = Array.isArray(v.fichasTecnicas) && v.fichasTecnicas.length > 0 ? v.fichasTecnicas[0] : null;
        map.get(eid).push({
          id: v.idVariante,
          idVariante: v.idVariante,
          idProducto: v.idProducto,
          idEvento: eid,
          creadaPorEvento: Boolean(v.creadaPorEvento || v.idEvento),
          nombre: v.nombre,
          descripcion: v.descripcion || '',
          precio: Number(v.precio || 0),
          imagen: typeof v.imagen === 'string' ? v.imagen.trim() : '',
          estado: v.estado !== undefined && v.estado !== null ? Number(v.estado) : 1,
          activo: Number(v.estado ?? 1) !== 0,
          fichaTecnica: vf ? {
            idFichaTecnica: vf.idFichaTecnica,
            descripcion: vf.descripcion || '',
            procedimiento: vf.procedimiento || '',
            tiempoPreparacion: Number(vf.tiempoPreparacion || 0),
            rendimiento: vf.rendimiento || '1 porción',
            especificaciones: vf.especificaciones || '',
            observaciones: vf.observaciones || '',
            detalles: (vf.detalles || []).map(d => ({
              idDetalleFicha: d.idDetalleFicha,
              idInsumo: d.idInsumo,
              cantidad: Number(d.cantidad || 0),
              unidadMedida: d.unidadMedida || d.insumo?.unidadMedida || 'und',
              insumo: d.insumo ? {
                idInsumo: d.insumo.idInsumo,
                nombre: d.insumo.nombre,
                unidadMedida: d.insumo.unidadMedida,
                precioUnitario: Number(d.insumo.precioUnitario || 0),
                stock: d.insumo.stock
              } : null
            }))
          } : null,
          insumosModificados: (v.insumosModificados || []).map(im => ({
            idVarianteInsumo: im.idVarianteInsumo,
            tipoAccion: im.tipoAccion,
            idInsumo: im.idInsumo,
            idInsumoReemplazado: im.idInsumoReemplazado,
            cantidad: Number(im.cantidad || 0),
            unidadMedida: im.unidadMedida,
            observaciones: im.observaciones || null,
            insumo: im.insumo ? { idInsumo: im.insumo.idInsumo, nombre: im.insumo.nombre, unidadMedida: im.insumo.unidadMedida, precioUnitario: Number(im.insumo.precioUnitario || 0), stock: im.insumo.stock } : null,
            insumoReemplazado: im.insumoReemplazado ? { idInsumo: im.insumoReemplazado.idInsumo, nombre: im.insumoReemplazado.nombre, unidadMedida: im.insumoReemplazado.unidadMedida } : null
          }))
        });
      }
    } catch (err) {
      console.warn('Error cargando variantes asociadas a eventos:', err.message);
    }
    return map;
  }

  static async getAll() {
    await ensureVarianteEventoSchemaOnce();
    const now = new Date();
    const todayStr = getColombiaDateISO(now);

    // Auto-expirar eventos vencidos como máximo una vez cada 5 minutos para no escribir en cada GET público
    if (Date.now() - lastAutoExpireAt >= AUTO_EXPIRE_TTL_MS) {
      try {
        await Evento.update(
          { estado: 0 },
          {
            where: {
              estado: 1,
              fechaFin: { [Op.ne]: null, [Op.lt]: todayStr }
            }
          }
        );
        lastAutoExpireAt = Date.now();
      } catch (e) {
        // Ignorar si hay algún bloqueo transaccional menor
      }
    }

    const eventos = await Evento.findAll({
      order: [['idEvento', 'ASC']],
      include: [
        {
          model: Product,
          as: 'producto',
          attributes: ['idProducto', 'nombre', 'precio', 'imagen', 'eliminado'],
          required: false
        }
      ]
    });

    const visibleEventos = eventos.filter((e) => !e.producto || Number(e.producto.eliminado || 0) !== 1);
    const varMap = await this._attachVariantesCreadasMap(visibleEventos.map(e => e.idEvento));

    return visibleEventos.map((e) => {
      const vigencia = evaluarVigenciaEvento(e, now);
      const variantesCreadas = varMap.get(Number(e.idEvento)) || [];
      return {
        id: e.idEvento,
        idEvento: e.idEvento,
        nombreEvento: e.nombreEvento,
        nombre: e.nombreEvento,
        descripcion: e.descripcion || '',
        fechaInicio: e.fechaInicio,
        fechaFin: e.fechaFin,
        estado: e.estado === 1 ? 'Activo' : 'Inactivo',
        idProducto: e.idProducto,
        tipoEvento: e.tipoEvento,
        icono: e.icono || '🎉',
        imagen: e.imagen || null,
        descuento: e.descuento,
        nuevoPrecio: e.nuevoPrecio,
        accionInsumo: e.accionInsumo,
        insumosAsociados: this.normalizeInsumos(e.insumosAsociados),
        productosAsociados: e.productosAsociados ? (typeof e.productosAsociados === 'string' ? JSON.parse(e.productosAsociados) : e.productosAsociados) : [],
        variantesCreadas,
        producto: e.producto ? {
          id: e.producto.idProducto,
          idProducto: e.producto.idProducto,
          nombre: e.producto.nombre,
          precio: e.producto.precio,
          imagen: e.producto.imagen
        } : null,
        vigencia
      };
    });
  }

  static async getById(id) {
    await ensureVarianteEventoSchemaOnce();
    const e = await Evento.findByPk(id, {
      include: [
        {
          model: Product,
          as: 'producto',
          attributes: ['idProducto', 'nombre', 'precio', 'imagen'],
          required: false
        }
      ]
    });
    if (!e) {
      const error = new Error('Evento no encontrado');
      error.statusCode = 404;
      throw error;
    }
    const vigencia = evaluarVigenciaEvento(e);
    const varMap = await this._attachVariantesCreadasMap([e.idEvento]);
    const variantesCreadas = varMap.get(Number(e.idEvento)) || [];
    return {
      id: e.idEvento,
      idEvento: e.idEvento,
      nombreEvento: e.nombreEvento,
      nombre: e.nombreEvento,
      descripcion: e.descripcion || '',
      fechaInicio: e.fechaInicio,
      fechaFin: e.fechaFin,
      estado: e.estado === 1 ? 'Activo' : 'Inactivo',
      idProducto: e.idProducto,
      tipoEvento: e.tipoEvento,
      icono: e.icono || '🎉',
      imagen: e.imagen || null,
      descuento: e.descuento,
      nuevoPrecio: e.nuevoPrecio,
      accionInsumo: e.accionInsumo,
      insumosAsociados: this.normalizeInsumos(e.insumosAsociados),
      productosAsociados: e.productosAsociados ? (typeof e.productosAsociados === 'string' ? JSON.parse(e.productosAsociados) : e.productosAsociados) : [],
      variantesCreadas,
      producto: e.producto ? {
        id: e.producto.idProducto,
        idProducto: e.producto.idProducto,
        nombre: e.producto.nombre,
        precio: e.producto.precio,
        imagen: e.producto.imagen
      } : null,
      vigencia
    };
  }

  static parseJsonArray(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
        return parsed && typeof parsed === 'object' ? [parsed] : [];
      } catch {
        return [];
      }
    }
    return typeof raw === 'object' ? [raw] : [];
  }

  static normalizeInsumos(raw) {
    return this.parseJsonArray(raw)
      .filter(item => item && typeof item === 'object' && (item.idInsumo || item.id || item.nombre))
      .map(item => {
        const numericId = Number(item.idInsumo || item.id);
        const idVal = Number.isFinite(numericId) && numericId > 0 ? numericId : (item.idInsumo || item.id || null);
        const unitVal = String(item.unidadMedida || item.unidad || 'und').trim() || 'und';
        const qty = Number(item.cantidad);
        return {
          id: idVal,
          idInsumo: idVal,
          nombre: String(item.nombre || '').trim(),
          cantidad: Number.isFinite(qty) && qty > 0 ? qty : 1,
          unidad: unitVal,
          unidadMedida: unitVal
        };
      });
  }

  static serializeEventoRelation(ev, targetProductId = null, targetProductBasePrice = null) {
    const plain = ev && typeof ev.get === 'function' ? ev.get({ plain: true }) : { ...ev };
    const productosAsociados = this.parseJsonArray(plain.productosAsociados);
    let nuevoPrecio = plain.nuevoPrecio;
    let descuento = plain.descuento;

    if (targetProductId !== null && targetProductId !== undefined) {
      const assocMatch = productosAsociados.find(
        (a) => a && Number(a.idProducto ?? a.id) === Number(targetProductId)
      );
      if (assocMatch) {
        const matchDesc = assocMatch.descuento !== undefined && assocMatch.descuento !== null
          ? Number(assocMatch.descuento)
          : (plain.descuento !== undefined && plain.descuento !== null ? Number(plain.descuento) : 0);
        const matchPrecio = Number(assocMatch.precioPromocional || assocMatch.nuevoPrecio || 0);
        descuento = matchDesc;
        if (matchPrecio > 0) {
          nuevoPrecio = matchPrecio;
        } else if (matchDesc > 0 && matchDesc < 100 && Number(targetProductBasePrice) > 0) {
          nuevoPrecio = Math.round(Number(targetProductBasePrice) * (1 - matchDesc / 100));
        } else {
          nuevoPrecio = Number(plain.idProducto) === Number(targetProductId) ? plain.nuevoPrecio : null;
        }
      }
    }

    return {
      ...plain,
      descuento,
      nuevoPrecio,
      accionInsumo: plain.accionInsumo || null,
      insumosAsociados: this.normalizeInsumos(plain.insumosAsociados),
      productosAsociados
    };
  }

  static async _syncVariantesParaEventoExistente(eventoRow, data = {}, { isUpdate = false } = {}) {
    await ensureVarianteEventoSchemaOnce();

    const tipoEv = eventoRow?.tipoEvento || data?.tipoEvento || '';
    if (!isVariantCreatingEventType(tipoEv, data)) {
      return [];
    }

    const rawInsumosInput = data.insumos !== undefined ? data.insumos : data.insumosAsociados;
    const hasRecipeInput = Boolean(
      data.varianteEvento !== undefined ||
      (Array.isArray(data.variantesEventoPorProducto) && data.variantesEventoPorProducto.length > 0) ||
      rawInsumosInput !== undefined
    );

    const parsedProds = this.parseJsonArray(data.productos !== undefined ? data.productos : eventoRow.productosAsociados);
    const targetProductsMap = new Map();
    for (const p of parsedProds) {
      const pid = Number(p?.idProducto || p?.id || 0);
      if (pid > 0 && !targetProductsMap.has(pid)) {
        targetProductsMap.set(pid, p);
      }
    }
    if (targetProductsMap.size === 0 && eventoRow.idProducto) {
      targetProductsMap.set(Number(eventoRow.idProducto), { idProducto: Number(eventoRow.idProducto) });
    }
    if (targetProductsMap.size === 0) return [];

    const perProductConfigs = Array.isArray(data.variantesEventoPorProducto) ? data.variantesEventoPorProducto : [];
    const sharedCfg = (data.varianteEvento && typeof data.varianteEvento === 'object') ? data.varianteEvento : {};
    const eventExtraToppings = this.normalizeInsumos(
      rawInsumosInput !== undefined ? rawInsumosInput : eventoRow.insumosAsociados
    );

    const syncedIds = [];

    for (const [prodId, prodEntry] of targetProductsMap.entries()) {
      const prodRow = await Product.findByPk(prodId);
      if (!prodRow || Number(prodRow.eliminado || 0) === 1) continue;

      const existingVar = await Variante.findOne({
        where: { idEvento: eventoRow.idEvento, idProducto: prodId }
      });

      // Avoid clobbering existing variant recipe when EventoService.update only toggled estado/dates
      if (isUpdate && existingVar && !hasRecipeInput && data.nuevoPrecio === undefined && data.descuento === undefined && data.nombreEvento === undefined && data.nombre === undefined) {
        syncedIds.push(existingVar.idVariante);
        continue;
      }

      const baseFicha = await FichaTecnica.findOne({
        where: {
          idProducto: prodId,
          estado: 1,
          [Op.or]: [{ tipo: 'PRODUCTO' }, { tipo: null }]
        },
        include: [
          {
            model: DetalleFichaInsumo,
            as: 'detalles',
            include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida'] }]
          }
        ],
        order: [['idFichaTecnica', 'ASC']]
      });

      const prodCfg = perProductConfigs.find(c => Number(c?.idProducto) === prodId) || (targetProductsMap.size === 1 ? sharedCfg : {});
      const baseNameCandidate = stripEmojis(prodCfg.nombre || sharedCfg.nombre || eventoRow.nombreEvento || '').trim();
      let varNombre = baseNameCandidate;
      if (!varNombre || isDummyVariantCollisionName(varNombre, prodRow.nombre)) {
        const suffix = stripEmojis(eventoRow.nombreEvento || 'Edición Especial');
        varNombre = `${prodRow.nombre} (${suffix && suffix.toLowerCase() !== prodRow.nombre.toLowerCase() ? suffix : 'Edición Evento'})`;
      }
      varNombre = varNombre.slice(0, 80);

      const prodBasePrecio = Number(prodRow.precio || 0);
      const explicitVarPrecio = prodCfg.precio !== undefined && prodCfg.precio !== '' ? Number(prodCfg.precio) : NaN;
      const entryNuevoPrecio = Number(prodEntry?.nuevoPrecio || eventoRow.nuevoPrecio || 0);
      const entryDescuento = Number(prodEntry?.descuento || eventoRow.descuento || 0);
      let varPrecio = prodBasePrecio;
      if (Number.isFinite(explicitVarPrecio) && explicitVarPrecio > 0) {
        varPrecio = explicitVarPrecio;
      } else if (entryNuevoPrecio > 0) {
        varPrecio = entryNuevoPrecio;
      } else if (entryDescuento > 0 && entryDescuento < 100 && prodBasePrecio > 0) {
        varPrecio = Math.round(prodBasePrecio * (1 - entryDescuento / 100));
      }

      const rawExtraToppings = Array.isArray(prodCfg.toppingsExtra)
        ? this.normalizeInsumos(prodCfg.toppingsExtra)
        : eventExtraToppings;
      const extraIds = new Set(rawExtraToppings.map(t => Number(t.idInsumo || t.id)).filter(Boolean));
      const extraText = rawExtraToppings.map(t => `${t.nombre} (${t.cantidad} ${t.unidadMedida})`).filter(Boolean).join(' + ');

      const varDesc = stripEmojis(
        prodCfg.descripcion ||
        sharedCfg.descripcion ||
        eventoRow.descripcion ||
        (extraText ? `Incluye extra: ${extraText}` : `Variante creada desde evento: ${eventoRow.nombreEvento}`)
      ).trim();

      const varSpecs = (
        prodCfg.especificaciones ||
        sharedCfg.especificaciones ||
        varDesc ||
        baseFicha?.especificaciones ||
        ''
      ).trim();

      const varEstado = prodCfg.estado !== undefined
        ? (prodCfg.estado === 0 || prodCfg.estado === '0' || prodCfg.estado === false ? 0 : 1)
        : (existingVar ? Number(existingVar.estado ?? 1) : 1);

      let varRow = existingVar;
      if (varRow) {
        await varRow.update({
          nombre: varNombre,
          descripcion: varDesc || null,
          precio: varPrecio,
          imagen: prodCfg.imagen || sharedCfg.imagen || eventoRow.imagen || prodRow.imagen || varRow.imagen || null,
          estado: varEstado,
          idEvento: eventoRow.idEvento,
          creadaPorEvento: 1
        });
      } else {
        varRow = await Variante.create({
          idProducto: prodId,
          nombre: varNombre,
          descripcion: varDesc || null,
          precio: varPrecio,
          imagen: prodCfg.imagen || sharedCfg.imagen || eventoRow.imagen || prodRow.imagen || null,
          estado: varEstado,
          idEvento: eventoRow.idEvento,
          creadaPorEvento: 1
        });
      }
      syncedIds.push(varRow.idVariante);

      // Si es actualización sin cambios de receta y ya existía ficha, mantener la ficha/deltas existentes
      if (isUpdate && existingVar && !hasRecipeInput) {
        continue;
      }

      const baseDetalles = (baseFicha?.detalles || []).map(d => ({
        idInsumo: Number(d.idInsumo),
        nombre: d.insumo?.nombre || `Insumo #${d.idInsumo}`,
        cantidad: Number(d.cantidad || 1),
        unidadMedida: String(d.unidadMedida || d.insumo?.unidadMedida || 'und').trim() || 'und'
      }));
      const baseMap = new Map(baseDetalles.map(b => [b.idInsumo, b]));

      const finalMap = new Map();
      const replacedBaseIds = new Set();
      const replacementByVarId = new Map();

      const incomingDetalles = Array.isArray(prodCfg.detalles) && prodCfg.detalles.length > 0
        ? prodCfg.detalles
        : (Array.isArray(prodCfg.insumos) && prodCfg.insumos.length > 0 ? prodCfg.insumos : null);

      if (incomingDetalles) {
        for (const item of incomingDetalles) {
          const insId = Number(item?.idInsumo || item?.id || 0);
          const qty = Number(item?.cantidad || 0);
          if (!insId || !(qty > 0)) continue;
          const unit = String(item.unidadMedida || item.unidad || 'und').trim() || 'und';
          const repId = Number(item?.reemplazaA?.idInsumo || item?.idInsumoReemplazado || 0);
          if (repId > 0 && repId !== insId && baseMap.has(repId)) {
            replacedBaseIds.add(repId);
            replacementByVarId.set(insId, repId);
          }
          if (finalMap.has(insId)) {
            const prev = finalMap.get(insId);
            finalMap.set(insId, {
              ...prev,
              cantidad: Math.round((prev.cantidad + qty) * 1000) / 1000
            });
          } else {
            finalMap.set(insId, {
              idInsumo: insId,
              cantidad: qty,
              unidadMedida: unit,
              esToppingExtra: Boolean(item.esExtraTopping || item.esToppingExtra || extraIds.has(insId))
            });
          }
        }
        // Asegurar que toppings extra del evento también queden incluidos si no estaban en incomingDetalles
        for (const tp of rawExtraToppings) {
          const tpId = Number(tp.idInsumo || tp.id || 0);
          if (!tpId || finalMap.has(tpId)) continue;
          finalMap.set(tpId, {
            idInsumo: tpId,
            cantidad: Number(tp.cantidad || 1),
            unidadMedida: tp.unidadMedida || 'und',
            esToppingExtra: true
          });
        }
      } else {
        for (const b of baseDetalles) {
          finalMap.set(b.idInsumo, {
            idInsumo: b.idInsumo,
            cantidad: b.cantidad,
            unidadMedida: b.unidadMedida,
            esToppingExtra: false
          });
        }
        for (const tp of rawExtraToppings) {
          const tpId = Number(tp.idInsumo || tp.id || 0);
          const tpQty = Number(tp.cantidad || 1);
          if (!tpId || !(tpQty > 0)) continue;
          if (finalMap.has(tpId)) {
            const prev = finalMap.get(tpId);
            finalMap.set(tpId, {
              ...prev,
              cantidad: Math.round((prev.cantidad + tpQty) * 1000) / 1000,
              esToppingExtra: true
            });
          } else {
            finalMap.set(tpId, {
              idInsumo: tpId,
              cantidad: tpQty,
              unidadMedida: tp.unidadMedida || 'und',
              esToppingExtra: true
            });
          }
        }
      }

      const finalDetalles = Array.from(finalMap.values());
      const deltasToCreate = [];
      const handledVarIds = new Set();

      for (const [varInsId, repId] of replacementByVarId.entries()) {
        if (!finalMap.has(repId)) {
          const item = finalMap.get(varInsId);
          handledVarIds.add(varInsId);
          deltasToCreate.push({
            tipoAccion: 'REEMPLAZAR',
            idInsumo: varInsId,
            idInsumoReemplazado: repId,
            cantidad: item.cantidad,
            unidadMedida: item.unidadMedida,
            observaciones: item.esToppingExtra ? 'Reemplazo / Topping extra de evento' : 'Reemplazo en evento'
          });
        }
      }

      for (const [baseId, baseItem] of baseMap.entries()) {
        if (replacedBaseIds.has(baseId)) continue;
        const finalItem = finalMap.get(baseId);
        if (!finalItem) {
          deltasToCreate.push({
            tipoAccion: 'QUITAR',
            idInsumo: baseId,
            idInsumoReemplazado: null,
            cantidad: 0,
            unidadMedida: baseItem.unidadMedida,
            observaciones: 'Retirado en variante de evento'
          });
        } else if (
          Math.abs(Number(finalItem.cantidad) - Number(baseItem.cantidad)) > 0.001 ||
          String(finalItem.unidadMedida).toLowerCase() !== String(baseItem.unidadMedida).toLowerCase()
        ) {
          deltasToCreate.push({
            tipoAccion: 'MODIFICAR_CANTIDAD',
            idInsumo: baseId,
            idInsumoReemplazado: null,
            cantidad: finalItem.cantidad,
            unidadMedida: finalItem.unidadMedida,
            observaciones: extraIds.has(baseId)
              ? 'Topping extra de evento sumado a insumo base'
              : 'Cantidad base editada desde evento'
          });
        }
      }

      for (const item of finalDetalles) {
        if (!baseMap.has(item.idInsumo) && !handledVarIds.has(item.idInsumo)) {
          deltasToCreate.push({
            tipoAccion: 'AGREGAR',
            idInsumo: item.idInsumo,
            idInsumoReemplazado: null,
            cantidad: item.cantidad,
            unidadMedida: item.unidadMedida,
            observaciones: item.esToppingExtra || extraIds.has(item.idInsumo)
              ? 'Topping extra añadido por evento'
              : 'Insumo añadido en variante de evento'
          });
        }
      }

      await VarianteInsumo.destroy({ where: { idVariante: varRow.idVariante } });
      for (const dl of deltasToCreate) {
        await VarianteInsumo.create({
          idVariante: varRow.idVariante,
          ...dl
        });
      }

      if (finalDetalles.length > 0 || baseFicha) {
        await FichaTecnicaService.saveForVariante(prodId, varRow.idVariante, {
          varianteNombre: varNombre,
          descripcion: varDesc || `Variante de evento: ${eventoRow.nombreEvento}`,
          procedimiento: prodCfg.procedimiento || sharedCfg.procedimiento || baseFicha?.procedimiento || '',
          tiempoPreparacion: Number(prodCfg.tiempoPreparacion ?? sharedCfg.tiempoPreparacion ?? baseFicha?.tiempoPreparacion ?? 0),
          rendimiento: prodCfg.rendimiento || sharedCfg.rendimiento || baseFicha?.rendimiento || '1 porción',
          especificaciones: varSpecs,
          caracteristicas: baseFicha?.caracteristicas || `Variante de Evento: ${eventoRow.nombreEvento}`,
          informacionNutricional: baseFicha?.informacionNutricional || '',
          condicionesAlmacenamiento: baseFicha?.condicionesAlmacenamiento || '',
          vidaUtil: baseFicha?.vidaUtil || '',
          observaciones: `Creada por evento "${eventoRow.nombreEvento}"${extraText ? ` • Toppings extra: ${extraText}` : ''}`,
          detalles: finalDetalles
        });
      }
    }

    return syncedIds;
  }

  static async create(data) {
    await ensureVarianteEventoSchemaOnce();
    const {
      nombreEvento, nombre, descripcion, fechaInicio, fechaFin, estado,
      productoId, tipoEvento, icono, imagen, descuento, nuevoPrecio, accion, insumos, insumosAsociados, productos, isTemporal,
      crearComoProducto, productoNuevo
    } = data;
    const rawInsumos = insumos !== undefined ? insumos : insumosAsociados;
    const normalizedInsumos = rawInsumos !== undefined ? this.normalizeInsumos(rawInsumos) : [];
    const finalNombre = nombreEvento || nombre;

    if (!finalNombre || !finalNombre.trim()) {
      const error = new Error('El título/nombre del evento es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    const inicioNorm = isTemporal ? extractDateOnlyISO(fechaInicio) : null;
    const finNorm = isTemporal ? extractDateOnlyISO(fechaFin) : null;
    if (inicioNorm && finNorm && finNorm < inicioNorm) {
      const error = new Error('La fecha de finalización no puede ser anterior a la fecha de inicio del evento.');
      error.statusCode = 400;
      throw error;
    }

    let finalProductoId = productoId ? Number(productoId) : null;
    const modeBCreatedVariantIds = [];
    let modeBPrimaryVarianteId = null;

    // Bidireccional: Crear producto desde el evento si se solicita
    if (crearComoProducto) {
      const pData = productoNuevo || {};
      const fData = pData.fichaTecnica || {};
      const listaInsumos = (Array.isArray(fData.detalles) && fData.detalles.length > 0)
        ? fData.detalles
        : (Array.isArray(pData.insumosFicha) ? pData.insumosFicha : []);

      const isCombo = Boolean(
        pData.configuracionCombo?.esCombo ||
        pData.tipoEvento === 'COMBO_ESPECIAL' ||
        tipoEvento === 'COMBO_ESPECIAL' ||
        pData.idCategoriaProducto === 2 ||
        (pData.categoria && String(pData.categoria).toLowerCase().includes('combo'))
      );

      if (!isCombo && listaInsumos.length === 0) {
        const error = new Error('La ficha técnica es obligatoria para crear un producto individual. Debe incluir al menos un insumo o ingrediente base para costeo y receta.');
        error.statusCode = 400;
        throw error;
      }

      const prodNombre = pData.nombre || finalNombre;
      const prodDesc = pData.descripcion || descripcion || (isCombo ? 'Combo especial festivo agrupando platillos favoritos' : 'Edición especial de temporada festiva');
      const prodPrecio = pData.precio || (nuevoPrecio ? parseFloat(nuevoPrecio) * 1.15 : 25000);
      const prodCategoria = isCombo ? 2 : (pData.idCategoriaProducto || 3);
      const prodImagen = pData.imagen || '';

      let comboConfigStr = null;
      if (pData.configuracionCombo) {
        comboConfigStr = typeof pData.configuracionCombo === 'string' ? pData.configuracionCombo : JSON.stringify(pData.configuracionCombo);
      } else if (isCombo) {
        comboConfigStr = JSON.stringify({ esCombo: true, itemsCombo: pData.itemsCombo || [] });
      }

      const nuevoProd = await Product.create({
        idCategoriaProducto: prodCategoria,
        nombre: prodNombre,
        descripcion: prodDesc,
        precio: prodPrecio,
        imagen: prodImagen,
        categoria: isCombo ? 'Combos' : undefined,
        adiciones: pData.adiciones ? (typeof pData.adiciones === 'string' ? pData.adiciones : JSON.stringify(pData.adiciones)) : '[]',
        configuracionCombo: comboConfigStr,
        estado: pData.estado === 'Inactivo' || pData.estado === 0 ? 0 : 1
      });

      finalProductoId = nuevoProd.idProducto;

      // Sincronizar items del combo si aplica (Ítems #97, #106)
      const comboItemsToSave = pData.itemsCombo || (pData.configuracionCombo && typeof pData.configuracionCombo === 'object' ? (pData.configuracionCombo.itemsCombo || pData.configuracionCombo.productosAsociados) : null);
      if (isCombo && Array.isArray(comboItemsToSave) && comboItemsToSave.length > 0) {
        try {
          const ProductService = require('./productService');
          await ProductService.syncItemsCombo(nuevoProd.idProducto, comboItemsToSave);
        } catch (comboErr) {
          console.warn('Error sincronizando combo en evento:', comboErr.message);
        }
      }

      // Crear Variantes (si vienen variantes personalizadas, crearlas; de lo contrario crear la predeterminada)
      let primaryVarianteId = null;
      if (Array.isArray(pData.variantes) && pData.variantes.length > 0) {
        for (let i = 0; i < pData.variantes.length; i++) {
          const v = pData.variantes[i];
          const createdV = await Variante.create({
            idProducto: nuevoProd.idProducto,
            nombre: v.nombre || (i === 0 ? `Edición ${stripEmojis(finalNombre)}` : `Opción #${i + 1}`),
            precio: v.precio !== undefined && v.precio !== "" ? Number(v.precio) : (nuevoPrecio || prodPrecio),
            estado: 1,
            creadaPorEvento: 1
          });
          modeBCreatedVariantIds.push(createdV.idVariante);
          if (i === 0) primaryVarianteId = createdV.idVariante;
        }
      } else {
        const nuevaVariante = await Variante.create({
          idProducto: nuevoProd.idProducto,
          nombre: stripEmojis(finalNombre) || 'Edición Especial',
          precio: nuevoPrecio || prodPrecio,
          estado: 1,
          creadaPorEvento: 1
        });
        modeBCreatedVariantIds.push(nuevaVariante.idVariante);
        primaryVarianteId = nuevaVariante.idVariante;
      }
      modeBPrimaryVarianteId = primaryVarianteId;

      // Crear Ficha Técnica Oficial Completa
      const nuevaFicha = await FichaTecnica.create({
        idProducto: nuevoProd.idProducto,
        idVariante: primaryVarianteId,
        tipo: 'PRODUCTO',
        descripcion: fData.descripcion || (isCombo ? `Paquete comercial Combo Festivo: ${prodNombre}` : `Ficha técnica oficial para ${prodNombre} (Producto de Evento)`),
        procedimiento: fData.procedimiento || pData.procedimiento || (isCombo ? 'Armar paquete gastronómico reuniendo los productos vinculados del pedido y bebidas seleccionadas para entrega en mesa o despacho.' : 'Preparar los ingredientes selectos con los más altos estándares artesanales. Cocinar a la plancha a fuego medio-alto, tostar pan con mantequilla clarificada, montar capas con salsa festiva y servir de inmediato.'),
        tiempoPreparacion: Number(fData.tiempoPreparacion || pData.tiempoPreparacion) || (isCombo ? 8 : 12),
        rendimiento: fData.rendimiento || pData.rendimiento || '1 porción',
        especificaciones: fData.especificaciones || pData.especificaciones || '',
        caracteristicas: fData.caracteristicas || pData.caracteristicas || '',
        informacionNutricional: fData.informacionNutricional || pData.informacionNutricional || '',
        condicionesAlmacenamiento: fData.condicionesAlmacenamiento || pData.condicionesAlmacenamiento || '',
        vidaUtil: fData.vidaUtil || pData.vidaUtil || '',
        observaciones: fData.observaciones || pData.observaciones || '',
        versionActual: Number(fData.versionActual) || 1,
        fechaInicioVigencia: fData.fechaInicioVigencia || new Date(),
        versionesAnteriores: fData.versionesAnteriores ? (typeof fData.versionesAnteriores === 'string' ? fData.versionesAnteriores : JSON.stringify(fData.versionesAnteriores)) : '[]',
        estado: 1
      });

      // Si vienen insumos para la ficha técnica, asociarlos
      if (listaInsumos.length > 0) {
        for (const item of listaInsumos) {
          const insId = item.idInsumo || item.id;
          if (insId) {
            await DetalleFichaInsumo.create({
              idFichaTecnica: nuevaFicha.idFichaTecnica,
              idInsumo: Number(insId),
              cantidad: Number(item.cantidad || 1),
              unidadMedida: item.unidadMedida || 'und'
            });
          }
        }
      }
    }

    const cleanNombre = stripEmojis(finalNombre);
    const cleanDesc = stripEmojis(descripcion || '');
    const cleanIcon = stripEmojis(icono || '') || 'party';

    if (!finalProductoId && Array.isArray(productos) && productos.length > 0) {
      const firstPid = Number(productos[0]?.idProducto || productos[0]?.id || 0);
      if (firstPid > 0) finalProductoId = firstPid;
    }

    const created = await Evento.create({
      nombreEvento: cleanNombre,
      descripcion: cleanDesc,
      fechaInicio: inicioNorm,
      fechaFin: finNorm,
      estado: estado === 'Inactivo' || estado === 0 ? 0 : 1,
      idProducto: finalProductoId,
      tipoEvento: tipoEvento || 'EDICION_LIMITADA',
      icono: cleanIcon,
      imagen: imagen ? imagen.trim() : (productoNuevo?.imagen ? productoNuevo.imagen.trim() : null),
      descuento: descuento || null,
      nuevoPrecio: nuevoPrecio || null,
      accionInsumo: accion || (normalizedInsumos.length > 0 ? 'Añadir' : null),
      insumosAsociados: normalizedInsumos.length > 0 ? JSON.stringify(normalizedInsumos) : null,
      productosAsociados: productos ? JSON.stringify(productos) : null
    });

    if (crearComoProducto) {
      if (modeBCreatedVariantIds.length > 0) {
        await Variante.update(
          { idEvento: created.idEvento, creadaPorEvento: 1 },
          { where: { idVariante: modeBCreatedVariantIds } }
        );
      }
      if (modeBPrimaryVarianteId && normalizedInsumos.length > 0) {
        for (const extra of normalizedInsumos) {
          if (extra.idInsumo) {
            await VarianteInsumo.create({
              idVariante: modeBPrimaryVarianteId,
              tipoAccion: 'AGREGAR',
              idInsumo: Number(extra.idInsumo),
              cantidad: Number(extra.cantidad || 1),
              unidadMedida: extra.unidadMedida || 'und',
              observaciones: 'Topping extra añadido por evento'
            });
          }
        }
      }
    } else {
      await this._syncVariantesParaEventoExistente(created, data, { isUpdate: false });
    }

    return this.getById(created.idEvento);
  }

  static async update(id, data) {
    await ensureVarianteEventoSchemaOnce();
    const e = await Evento.findByPk(id);
    if (!e) {
      const error = new Error('Evento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const {
      nombreEvento, nombre, descripcion, fechaInicio, fechaFin, estado,
      productoId, tipoEvento, icono, imagen, descuento, nuevoPrecio, accion, insumos, insumosAsociados, productos, isTemporal
    } = data;
    const rawInsumos = insumos !== undefined ? insumos : insumosAsociados;
    const finalNombre = nombreEvento || nombre;

    if (finalNombre !== undefined && finalNombre.trim()) {
      e.nombreEvento = stripEmojis(finalNombre);
    }
    if (descripcion !== undefined) e.descripcion = stripEmojis(descripcion);
    if (icono !== undefined) e.icono = stripEmojis(icono) || 'party';
    if (isTemporal !== undefined) {
      if (isTemporal) {
        if (fechaInicio !== undefined) e.fechaInicio = extractDateOnlyISO(fechaInicio);
        if (fechaFin !== undefined) e.fechaFin = extractDateOnlyISO(fechaFin);
      } else {
        e.fechaInicio = null;
        e.fechaFin = null;
      }
    } else {
      if (fechaInicio !== undefined) e.fechaInicio = extractDateOnlyISO(fechaInicio);
      if (fechaFin !== undefined) e.fechaFin = extractDateOnlyISO(fechaFin);
    }

    const checkInicio = extractDateOnlyISO(e.fechaInicio);
    const checkFin = extractDateOnlyISO(e.fechaFin);
    if (checkInicio && checkFin && checkFin < checkInicio) {
      const error = new Error('La fecha de finalización no puede ser anterior a la fecha de inicio del evento.');
      error.statusCode = 400;
      throw error;
    }

    if (estado !== undefined) e.estado = estado === 'Activo' || estado === 1 ? 1 : 0;
    if (productoId !== undefined) e.idProducto = productoId;
    if (tipoEvento !== undefined) e.tipoEvento = tipoEvento;
    if (icono !== undefined) e.icono = icono;
    if (imagen !== undefined) e.imagen = imagen ? imagen.trim() : null;
    if (descuento !== undefined) e.descuento = descuento;
    if (nuevoPrecio !== undefined) e.nuevoPrecio = nuevoPrecio;
    if (accion !== undefined) e.accionInsumo = accion;
    if (rawInsumos !== undefined) {
      const normalizedInsumos = this.normalizeInsumos(rawInsumos);
      e.insumosAsociados = normalizedInsumos.length > 0 ? JSON.stringify(normalizedInsumos) : null;
      if (accion === undefined && normalizedInsumos.length > 0 && !e.accionInsumo) {
        e.accionInsumo = 'Añadir';
      }
    }
    if (productos !== undefined) e.productosAsociados = productos ? JSON.stringify(productos) : null;

    await e.save();
    await this._syncVariantesParaEventoExistente(e, data, { isUpdate: true });
    return this.getById(id);
  }

  static async delete(id) {
    const e = await Evento.findByPk(id);
    if (!e) {
      const error = new Error('Evento no encontrado');
      error.statusCode = 404;
      throw error;
    }

    try {
      const { Venta } = require('../../persistence/models');
      await Venta.update({ idDescuento: null }, { where: { idDescuento: e.idEvento } });
    } catch (unlinkErr) {
      // Ignorar si no aplica relación directa en ventas
    }

    await e.destroy();

    return { message: 'Evento eliminado correctamente' };
  }
}

module.exports = EventoService;
