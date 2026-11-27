const { Op } = require('sequelize');
const { Insumo, CategoriaInsumo, Proveedor, FichaTecnica, DetalleFichaInsumo, Trazabilidad, DetalleInsumoPreparadoInsumo, InsumoPreparado, LoteInsumo, DetalleCompraInsumo } = require('../../persistence/models');
const database = require('../../persistence/config/db');
const { parsePaginationParams, buildPaginatedResponse } = require('../../infrastructure/utils/paginationUtils');
const { ensureZanahoriaInsumoRealOnce, ensureInsumoPaqueteSchemaOnce } = require('../../infrastructure/utils/dbUtils');
const {
  getColombiaDateISO,
  extractDateOnlyISO,
  diffCalendarDaysColombia
} = require('../../infrastructure/utils/colombiaDateUtils');
const {
  NO_STOCK_TAG,
  isLoteExpired: isLoteExpiredByDateOrState,
  computeInsumoStockBreakdown
} = require('../../infrastructure/utils/stockFefoUtils');

function normalizeStockUnit(raw) {
  if (!raw) return 'und';
  const s = String(raw).toLowerCase().trim();
  if (s === 'kg' || s.startsWith('kilo') || s.includes('(kg)')) return 'kg';
  if (s === 'gr' || s === 'g' || s.startsWith('gram') || s.includes('(gr)')) return 'gr';
  if (s === 'mg' || s.startsWith('miligram')) return 'mg';
  if (s === 'lb' || s.startsWith('libra') || s.includes('(lb)')) return 'lb';
  if (s === 'lt' || s === 'l' || s.startsWith('litr') || s.includes('(lt)')) return 'lt';
  if (s === 'ml' || s.startsWith('mililit') || s === 'cc' || s.includes('(ml)')) return 'ml';
  if (s === 'paq' || s.startsWith('paquet')) return 'paq';
  if (s === 'porcion' || s === 'porción' || s.startsWith('porci')) return 'porción';
  return 'und';
}

function convertStockUnits(amount, fromUnit, toUnit) {
  const num = parseFloat(amount || 0);
  if (isNaN(num) || num === 0) return 0;
  const from = normalizeStockUnit(fromUnit);
  const to = normalizeStockUnit(toUnit);
  if (from === to) return num;

  // Convertir peso a gramos como base intermedia
  const weightToGr = { kg: 1000, gr: 1, mg: 0.001, lb: 453.592 };
  if (weightToGr[from] && weightToGr[to]) {
    const inGr = num * weightToGr[from];
    return Math.round((inGr / weightToGr[to]) * 100) / 100;
  }

  // Convertir volumen a ml como base intermedia
  const volToMl = { lt: 1000, ml: 1 };
  if (volToMl[from] && volToMl[to]) {
    const inMl = num * volToMl[from];
    return Math.round((inMl / volToMl[to]) * 100) / 100;
  }

  return num;
}

function getExpirationMeta(fechaVencimiento, todayCol = getColombiaDateISO(), forceExpired = false) {
  const fechaISO = extractDateOnlyISO(fechaVencimiento);
  const diasParaVencer = fechaISO ? diffCalendarDaysColombia(fechaISO, todayCol) : null;
  const estaVencido = Boolean(forceExpired || (diasParaVencer !== null && diasParaVencer < 0));
  const venceHoy = !estaVencido && diasParaVencer === 0;
  const proximoAVencer = !estaVencido && diasParaVencer !== null && diasParaVencer >= 0 && diasParaVencer <= 5;
  return { diasParaVencer, estaVencido, venceHoy, proximoAVencer };
}

function parseNoStockFlag(rawDescripcion) {
  const str = String(rawDescripcion || '');
  const sinControl = str.includes(NO_STOCK_TAG);
  const cleanDescripcion = str.replace(/\[SIN_CONTROL_STOCK\]\s*/g, '').trim();
  return { controlarStock: !sinControl, cleanDescripcion };
}

function encodeDescripcionWithStockFlag(rawDescripcion, controlarStock) {
  const clean = String(rawDescripcion || '').replace(/\[SIN_CONTROL_STOCK\]\s*/g, '').trim();
  if (controlarStock === false || controlarStock === 0 || controlarStock === 'false') {
    return clean ? `${NO_STOCK_TAG} ${clean}` : NO_STOCK_TAG;
  }
  return clean;
}

function formatInsumo(i, options = {}) {
  const todayCol = getColombiaDateISO();
  const catNombre = i.categoria ? i.categoria.nombre : 'Sin categoría';
  const provNombre = i.proveedor ? i.proveedor.nombre : 'Sin Proveedor';
  const lotesList = (i.lotes || []).map(l => {
    const expired = isLoteExpiredByDateOrState(l, todayCol);
    const expMeta = getExpirationMeta(l.fechaVencimiento, todayCol, expired);
    return {
      idLote: l.idLote,
      idInsumo: l.idInsumo,
      idCompra: l.idCompra,
      numeroLote: l.numeroLote,
      cantidad: parseFloat(l.cantidad || 0),
      cantidadDisponible: parseFloat(l.cantidadDisponible !== undefined ? l.cantidadDisponible : l.cantidad || 0),
      fechaVencimiento: l.fechaVencimiento || null,
      estado: expired ? 'VENCIDO' : (l.estado || 'ACTIVO'),
      estaVencido: expMeta.estaVencido,
      diasParaVencer: expMeta.diasParaVencer,
      venceHoy: expMeta.venceHoy,
      proximoAVencer: expMeta.proximoAVencer
    };
  });

  const insExpMeta = getExpirationMeta(i.fechaVencimiento, todayCol, false);

  const { controlarStock, cleanDescripcion } = parseNoStockFlag(i.descripcion);
  const breakdown = computeInsumoStockBreakdown(i, i.lotes || [], todayCol);
  const stockNum = parseFloat(i.stock || 0);
  const countCompras = options.comprasMap ? (options.comprasMap.get(Number(i.idInsumo)) || 0) : 0;
  const tieneCompras = countCompras > 0;
  const tieneStockActivo = controlarStock ? stockNum > 0 : false;
  const puedeEliminarse = !tieneStockActivo && !tieneCompras;
  const isDisponible = Number(i.estado) === 1 || i.estado === 'Activo' || i.estado === '1';

  return {
    idInsumo: i.idInsumo,
    id: i.idInsumo,
    nombre: i.nombre,
    idCategoriaInsumo: i.idCategoriaInsumo,
    controlarStock,
    disponibilidad: isDisponible ? 'Disponible' : 'Agotado',
    stock: stockNum,
    stockVigente: breakdown.stockVigente,
    stockVencido: breakdown.stockVencido,
    stockOperativo: breakdown.stockOperativo,
    tieneLotesVencidos: breakdown.hasExpiredLots,
    stockMinimo: parseFloat(i.stockMinimo || 0),
    stockMaximo: parseFloat(i.stockMaximo !== undefined && i.stockMaximo !== null ? i.stockMaximo : 100),
    fechaExpedicion: i.fechaExpedicion || null,
    fechaVencimiento: i.fechaVencimiento || null,
    diasParaVencer: insExpMeta.diasParaVencer,
    estaVencido: insExpMeta.estaVencido,
    venceHoy: insExpMeta.venceHoy,
    proximoAVencer: insExpMeta.proximoAVencer,
    unidadMedida: i.unidadMedida,
    precioUnitario: parseFloat(i.precioUnitario || 0),
    idProveedor: i.idProveedor,
    descripcion: cleanDescripcion,
    estado: i.estado,
    esAdicion: i.esAdicion ? 1 : 0,
    precioAdicion: parseFloat(i.precioAdicion || 0),
    porcionMinimaCantidad: i.porcionMinimaCantidad !== null && i.porcionMinimaCantidad !== undefined ? parseFloat(i.porcionMinimaCantidad) : null,
    porcionMinimaUnidad: i.porcionMinimaUnidad || null,
    tamanioPaquete: i.tamanioPaquete || null,
    imagen: i.imagen || '',
    incluyeIva: i.incluyeIva ? 1 : 0,
    porcentajeIva: (i.incluyeIva && (i.porcentajeIva === undefined || i.porcentajeIva === null || Number(i.porcentajeIva) === 0))
      ? 19.00
      : parseFloat(i.porcentajeIva || 0),
    categoria: catNombre,
    categoriaNombre: catNombre,
    proveedor: provNombre,
    proveedorNombre: provNombre,
    lotes: lotesList,
    tieneCompras,
    totalCompras: countCompras,
    tieneStockActivo,
    puedeEliminarse,
    estaEnPreparado: Boolean(options.preparadoSet ? options.preparadoSet.has(Number(i.idInsumo)) : options.estaEnPreparado)
  };
}

class InsumoService {
  static async checkVencimientos() {
    try {
      const today = getColombiaDateISO();
      const { Op } = require('sequelize');

      // 1. Lotes cuya fecha de vencimiento ya pasó (< hoy Colombia) que sigan activos
      const lotesVencidos = await LoteInsumo.findAll({
        where: {
          fechaVencimiento: { [Op.lt]: today },
          estado: 'ACTIVO'
        },
        include: [{ model: Insumo, as: 'insumo' }]
      });

      const affectedInsumosMap = new Map();

      for (const lote of lotesVencidos) {
        await lote.update({ estado: 'VENCIDO' });
        if (lote.insumo) {
          affectedInsumosMap.set(lote.idInsumo, lote.insumo);
        }
      }

      // 2. Insumos con fecha de vencimiento directa anterior a hoy Colombia y estado activo
      const directVencidos = await Insumo.findAll({
        where: {
          eliminado: 0,
          estado: 1,
          fechaVencimiento: { [Op.lt]: today }
        }
      });
      for (const ins of directVencidos) {
        affectedInsumosMap.set(ins.idInsumo, ins);
      }

      // 3. Inactivar insumos solo si no tienen lotes vigentes (incluyendo los que vencen hoy) y su stock es <= 0
      const inactivados = [];
      for (const [idInsumo, insumo] of affectedInsumosMap.entries()) {
        const remainingStock = Math.max(0, Number(insumo.stock || 0));
        const activeLotesCount = await LoteInsumo.count({
          where: {
            idInsumo,
            estado: 'ACTIVO',
            [Op.or]: [
              { fechaVencimiento: { [Op.gte]: today } },
              { fechaVencimiento: null }
            ],
            cantidadDisponible: { [Op.gt]: 0 }
          }
        }).catch(() => 0);

        if (remainingStock > 0 || activeLotesCount > 0) {
          continue;
        }

        if (Number(insumo.estado) === 1 || insumo.estado === 'Activo' || insumo.estado === '1') {
          await Insumo.update({ estado: 0 }, { where: { idInsumo } });
          inactivados.push({
            idInsumo,
            id: idInsumo,
            nombre: insumo.nombre,
            stock: remainingStock,
            unidadMedida: insumo.unidadMedida
          });

          await Trazabilidad.create({
            tipo: 'Inactivación por Vencimiento',
            entidadNombre: insumo.nombre,
            detalle: `El insumo "${insumo.nombre}" fue inactivado automáticamente por cumplimiento de fecha de vencimiento de lote. Requiere reabastecimiento en el módulo de compras.`,
            idInsumo,
            tipoMovimiento: 'Ajuste',
            cantidad: 0,
            motivo: 'Lote vencido',
            skipStockUpdate: true
          }).catch(() => { });
        }
      }

      return inactivados;
    } catch (err) {
      console.warn('[InsumoService.checkVencimientos] Error:', err.message);
      return [];
    }
  }

  static async getComprasMap() {
    try {
      const { Op } = require('sequelize');
      const { Compra } = require('../../persistence/models');
      const detalleCounts = await DetalleCompraInsumo.findAll({
        attributes: ['idInsumo', [database.sequelize.fn('COUNT', database.sequelize.col('DetalleCompraInsumo.idDetalleCompra')), 'totalCompras']],
        include: [{
          model: Compra,
          as: 'compra',
          attributes: [],
          where: {
            estado: { [Op.notIn]: ['CANCELADA', 'ANULADA'] }
          }
        }],
        group: ['idInsumo'],
        raw: true
      });
      const comprasMap = new Map();
      (detalleCounts || []).forEach(dc => {
        comprasMap.set(Number(dc.idInsumo), Number(dc.totalCompras || 0));
      });
      return comprasMap;
    } catch {
      return new Map();
    }
  }

  static async getPreparadoSet() {
    try {
      const rows = await DetalleInsumoPreparadoInsumo.findAll({
        attributes: ['idInsumo'],
        include: [{
          model: InsumoPreparado,
          as: 'preparado',
          attributes: [],
          where: { eliminado: 0 }
        }],
        group: ['idInsumo'],
        raw: true
      });
      return new Set((rows || []).map(r => Number(r.idInsumo)));
    } catch {
      return new Set();
    }
  }

  static async getAll(filterObj = {}) {
    await ensureZanahoriaInsumoRealOnce();
    await ensureInsumoPaqueteSchemaOnce();
    const nowTs = Date.now();
    if (!this._lastVencimientoCheckAt || nowTs - this._lastVencimientoCheckAt >= 3 * 60 * 1000) {
      await this.checkVencimientos();
      this._lastVencimientoCheckAt = Date.now();
    }
    const { isPaginated, page, limit, offset } = parsePaginationParams(filterObj, { defaultLimit: 5, maxLimit: 100 });
    const where = { eliminado: 0 };

    if (filterObj.estado && filterObj.estado !== 'Todos') {
      const eNorm = String(filterObj.estado).toLowerCase().trim();
      if (eNorm === 'activo' || eNorm === '1') where.estado = 1;
      else if (eNorm === 'inactivo' || eNorm === '0') where.estado = 0;
    }

    if (filterObj.categoria && filterObj.categoria !== 'Todas' && filterObj.categoria !== 'Todos') {
      if (/^\d+$/.test(String(filterObj.categoria).trim())) {
        where.idCategoriaInsumo = Number(filterObj.categoria);
      } else {
        where['$categoria.nombre$'] = { [Op.like]: `%${String(filterObj.categoria).trim()}%` };
      }
    }

    if (filterObj.search && String(filterObj.search).trim()) {
      const q = String(filterObj.search).trim();
      const digits = q.replace(/\D/g, '');
      const searchOr = [
        { nombre: { [Op.like]: `%${q}%` } },
        { descripcion: { [Op.like]: `%${q}%` } },
        { '$categoria.nombre$': { [Op.like]: `%${q}%` } }
      ];
      if (digits && /^\d+$/.test(digits)) {
        searchOr.push({ idInsumo: Number(digits) });
      }
      where[Op.or] = searchOr;
    }

    const queryOptions = {
      where,
      include: [
        { model: CategoriaInsumo, as: 'categoria', required: false },
        { model: Proveedor, as: 'proveedor', required: false },
        { model: LoteInsumo, as: 'lotes', separate: true, required: false }
      ],
      order: [['idInsumo', 'DESC']],
      subQuery: false
    };

    if (isPaginated) {
      const [paged, comprasMap, preparadoSet] = await Promise.all([
        Insumo.findAndCountAll({
          ...queryOptions,
          limit,
          offset,
          distinct: true
        }),
        this.getComprasMap(),
        this.getPreparadoSet()
      ]);
      const formatted = paged.rows.map(i => formatInsumo(i, { comprasMap, preparadoSet }));
      return buildPaginatedResponse(formatted, paged.count, page, limit);
    }

    const [insumos, comprasMap, preparadoSet] = await Promise.all([
      Insumo.findAll(queryOptions),
      this.getComprasMap(),
      this.getPreparadoSet()
    ]);

    return insumos.map(i => formatInsumo(i, { comprasMap, preparadoSet }));
  }

  static async getDeleted() {
    const [insumos, comprasMap] = await Promise.all([
      Insumo.findAll({
        where: { eliminado: 1 },
        include: [
          { model: CategoriaInsumo, as: 'categoria', required: false },
          { model: Proveedor, as: 'proveedor', required: false },
          { model: LoteInsumo, as: 'lotes', required: false }
        ]
      }),
      this.getComprasMap()
    ]);

    return insumos.map(i => formatInsumo(i, { comprasMap }));
  }

  static async getById(idInsumo) {
    await ensureInsumoPaqueteSchemaOnce();
    const id = parseInt(idInsumo, 10);
    const { Op } = require('sequelize');
    const { Compra } = require('../../persistence/models');
    const [i, count, prepCount] = await Promise.all([
      Insumo.findByPk(id, {
        include: [
          { model: CategoriaInsumo, as: 'categoria', required: false },
          { model: Proveedor, as: 'proveedor', required: false },
          { model: LoteInsumo, as: 'lotes', required: false }
        ]
      }),
      DetalleCompraInsumo.count({
        where: { idInsumo: id },
        include: [{
          model: Compra,
          as: 'compra',
          where: {
            estado: { [Op.notIn]: ['CANCELADA', 'ANULADA'] }
          }
        }]
      }).catch(() => 0),
      DetalleInsumoPreparadoInsumo.count({
        where: { idInsumo: id },
        include: [{
          model: InsumoPreparado,
          as: 'preparado',
          where: { eliminado: 0 }
        }]
      }).catch(() => 0)
    ]);

    if (!i) {
      const error = new Error('Insumo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const comprasMap = new Map([[id, count]]);
    return formatInsumo(i, { comprasMap, estaEnPreparado: prepCount > 0 });
  }

  static async create(insumoData) {
    await ensureInsumoPaqueteSchemaOnce();
    let {
      nombre, idCategoriaInsumo, stock, stockMinimo, stockMaximo,
      fechaExpedicion, fechaVencimiento, unidadMedida,
      precioUnitario, idProveedor, descripcion, estado,
      categoria, proveedor, fichaTecnica
    } = insumoData;

    if (!nombre || !nombre.trim()) {
      const error = new Error('El nombre del insumo es requerido');
      error.statusCode = 400;
      throw error;
    }

    if (!idCategoriaInsumo && categoria) {
      const cat = await CategoriaInsumo.findOne({ where: { nombre: categoria } });
      if (cat) idCategoriaInsumo = cat.idCategoriaInsumo;
    }

    if (!idProveedor && proveedor) {
      const prov = await Proveedor.findOne({ where: { nombre: proveedor } });
      if (prov) idProveedor = prov.idProveedor;
    }

    const existing = await Insumo.findOne({ where: { nombre: nombre.trim(), eliminado: 0 } });
    if (existing) {
      const error = new Error('Ya existe un insumo activo registrado con ese nombre');
      error.statusCode = 400;
      throw error;
    }

    if (idProveedor) {
      const provExists = await Proveedor.findByPk(parseInt(idProveedor));
      if (!provExists) idProveedor = null;
    }

    if (idCategoriaInsumo) {
      const catExists = await CategoriaInsumo.findByPk(parseInt(idCategoriaInsumo));
      if (!catExists) {
        const firstCat = (await CategoriaInsumo.findOne({ where: { estado: 1 } })) || (await CategoriaInsumo.findOne());
        idCategoriaInsumo = firstCat ? (firstCat.idCategoriaInsumo || firstCat.id) : null;
      } else if (catExists.estado === 0 || catExists.estado === false || String(catExists.estado).toLowerCase() === 'inactivo') {
        const error = new Error(`La categoría "${catExists.nombre}" está inhabilitada. Habilítala o selecciona una categoría activa.`);
        error.statusCode = 400;
        throw error;
      }
    }

    const normalizedEstado = estado !== undefined
      ? (estado === 'Activo' || estado === 1 || estado === '1' ? 1 : 0)
      : 1;

    const controlarStockFlag = insumoData.controlarStock !== undefined
      ? !(insumoData.controlarStock === false || insumoData.controlarStock === 0 || insumoData.controlarStock === 'false')
      : true;

    let stockVal = 0;
    let minVal = 0;
    let maxVal = 0;

    if (controlarStockFlag) {
      stockVal = stock !== undefined && stock !== null && stock !== '' ? parseFloat(stock) : 0;
      minVal = stockMinimo !== undefined && stockMinimo !== null && stockMinimo !== '' ? parseFloat(stockMinimo) : 0;
      maxVal = stockMaximo !== undefined && stockMaximo !== null && stockMaximo !== '' ? parseFloat(stockMaximo) : 100;

      if (!Number.isFinite(stockVal) || stockVal < 0) {
        const error = new Error('El stock inicial debe ser un número válido mayor o igual a 0.');
        error.statusCode = 400;
        throw error;
      }
      if (!Number.isFinite(minVal) || minVal < 0) {
        const error = new Error('El stock mínimo debe ser un número válido mayor o igual a 0.');
        error.statusCode = 400;
        throw error;
      }
      if (!Number.isFinite(maxVal) || maxVal <= 0) {
        const error = new Error('El stock máximo / capacidad debe ser mayor a 0.');
        error.statusCode = 400;
        throw error;
      }
      if (maxVal <= minVal) {
        const error = new Error('El stock máximo debe ser estrictamente mayor al stock mínimo.');
        error.statusCode = 400;
        throw error;
      }
      if (stockVal > maxVal) {
        const error = new Error('El stock inicial no puede superar el stock máximo / capacidad.');
        error.statusCode = 400;
        throw error;
      }
    }

    const encodedDescripcion = encodeDescripcionWithStockFlag(descripcion || '', controlarStockFlag);

    const transaction = await database.sequelize.transaction();
    try {
      const insumo = await Insumo.create({
        nombre: nombre.trim(),
        idCategoriaInsumo: idCategoriaInsumo ? parseInt(idCategoriaInsumo) : null,
        stock: 0, // El stock inicial siempre es 0; solo se abastece mediante compras
        stockMinimo: controlarStockFlag ? minVal : 0,
        stockMaximo: controlarStockFlag ? maxVal : 0,
        fechaExpedicion: (fechaExpedicion && String(fechaExpedicion).trim() !== '') ? fechaExpedicion : null,
        fechaVencimiento: (fechaVencimiento && String(fechaVencimiento).trim() !== '') ? fechaVencimiento : null,
        unidadMedida: unidadMedida || 'und',
        tamanioPaquete: insumoData.tamanioPaquete ? String(insumoData.tamanioPaquete).trim() : null,
        precioUnitario: precioUnitario !== undefined && precioUnitario !== null ? parseFloat(precioUnitario) : 0,
        idProveedor: idProveedor ? parseInt(idProveedor) : null,
        descripcion: encodedDescripcion,
        esAdicion: insumoData.esAdicion ? 1 : 0,
        precioAdicion: insumoData.precioAdicion !== undefined && insumoData.precioAdicion !== null ? parseFloat(insumoData.precioAdicion) : 0,
        porcionMinimaCantidad: insumoData.porcionMinimaCantidad !== undefined && insumoData.porcionMinimaCantidad !== null && insumoData.porcionMinimaCantidad !== '' ? parseFloat(insumoData.porcionMinimaCantidad) : null,
        porcionMinimaUnidad: insumoData.porcionMinimaUnidad ? String(insumoData.porcionMinimaUnidad).trim() : null,
        imagen: insumoData.imagen || null,
        incluyeIva: insumoData.incluyeIva ? 1 : 0,
        porcentajeIva: insumoData.incluyeIva
          ? (insumoData.porcentajeIva !== undefined && insumoData.porcentajeIva !== null && insumoData.porcentajeIva !== ""
            ? parseFloat(insumoData.porcentajeIva)
            : 19.00)
          : 0.00,
        estado: normalizedEstado
      }, { transaction });

      if (fichaTecnica) {
        const FichaTecnicaService = require('./fichaTecnicaService');
        await FichaTecnicaService.saveForInsumo(insumo.idInsumo, fichaTecnica, {
          transaction,
          skipReload: true
        });
      }

      const TrazabilidadService = require('./trazabilidadService');
      await TrazabilidadService.create({
        tipo: 'Creado',
        entidadNombre: insumo.nombre,
        detalle: `Se creó un nuevo insumo en el inventario: ${insumo.nombre}`,
        idInsumo: insumo.idInsumo,
        tipoMovimiento: 'Entrada',
        cantidad: insumo.stock,
        motivo: 'Registro inicial de insumo',
        usuarioId: insumoData.usuarioId || null,
        skipStockUpdate: true
      }, { transaction });

      await transaction.commit();
      return this.getById(insumo.idInsumo);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async update(idInsumo, insumoData, options = {}) {
    await ensureInsumoPaqueteSchemaOnce();
    const transaction = await database.sequelize.transaction();
    try {
      const insumo = await Insumo.findByPk(idInsumo, { transaction });
      if (!insumo) {
        const error = new Error('Insumo no encontrado');
        error.statusCode = 404;
        throw error;
      }

      const estaEnPreparado = (await DetalleInsumoPreparadoInsumo.count({
        where: { idInsumo },
        include: [{
          model: InsumoPreparado,
          as: 'preparado',
          where: { eliminado: 0 }
        }],
        transaction
      }).catch(() => 0)) > 0;

      let {
        stockMinimo, stockMaximo, descripcion, estado, fichaTecnica,
        idCategoriaInsumo, unidadMedida, precioUnitario
      } = insumoData;

      // Categoría: editable mientras no esté asociado a un insumo preparado
      if (idCategoriaInsumo !== undefined && idCategoriaInsumo !== null && idCategoriaInsumo !== '') {
        const nuevaCat = parseInt(idCategoriaInsumo, 10);
        if (!isNaN(nuevaCat) && nuevaCat !== Number(insumo.idCategoriaInsumo)) {
          if (estaEnPreparado && !options.allowFullUpdate) {
            const error = new Error('No se puede cambiar la categoría porque este insumo está asociado a un insumo preparado.');
            error.statusCode = 400;
            throw error;
          }
          insumo.idCategoriaInsumo = nuevaCat;
        }
      }

      // Unidad de medida: editable mientras no esté asociado a un insumo preparado, convirtiendo stock
      if (unidadMedida !== undefined && String(unidadMedida).trim() !== '' && String(unidadMedida).trim() !== String(insumo.unidadMedida || '').trim()) {
        if (estaEnPreparado && !options.allowFullUpdate) {
          const error = new Error('No se puede cambiar la unidad de medida porque este insumo está asociado a un insumo preparado.');
          error.statusCode = 400;
          throw error;
        }
        const stockConvertido = convertStockUnits(insumo.stock, insumo.unidadMedida, unidadMedida);
        insumo.stock = stockConvertido;
        insumo.unidadMedida = String(unidadMedida).trim();
      }

      if (insumoData.tamanioPaquete !== undefined) {
        insumo.tamanioPaquete = insumoData.tamanioPaquete ? String(insumoData.tamanioPaquete).trim() : null;
      }

      // Precio de compra: siempre editable
      if (precioUnitario !== undefined && precioUnitario !== null && precioUnitario !== '') {
        const precioParsed = parseFloat(precioUnitario);
        if (isNaN(precioParsed) || precioParsed < 0) {
          const error = new Error('El precio de compra debe ser un número válido mayor o igual a 0.');
          error.statusCode = 400;
          throw error;
        }
        insumo.precioUnitario = precioParsed;
      }

      // ── Campos editables: Stock Mínimo, Stock Máximo, Descripción, Estado, IVA y Adición ──
      // Los datos maestros (nombre, categoría, unidad, precio/costo y stock) son inmutables
      const currentParsed = parseNoStockFlag(insumo.descripcion);
      const nextControlarStock = insumoData.controlarStock !== undefined
        ? !(insumoData.controlarStock === false || insumoData.controlarStock === 0 || insumoData.controlarStock === 'false')
        : currentParsed.controlarStock;

      if (!nextControlarStock) {
        insumo.stockMinimo = 0;
        insumo.stockMaximo = 0;
      } else if (stockMinimo !== undefined || stockMaximo !== undefined) {
        const effectiveMin = stockMinimo !== undefined
          ? parseFloat(stockMinimo)
          : parseFloat(insumo.stockMinimo || 0);
        const effectiveMax = stockMaximo !== undefined
          ? parseFloat(stockMaximo)
          : parseFloat(insumo.stockMaximo || 0);

        if (!Number.isFinite(effectiveMin) || effectiveMin < 0) {
          const error = new Error('El stock mínimo debe ser un número válido mayor o igual a 0.');
          error.statusCode = 400;
          throw error;
        }
        if (!Number.isFinite(effectiveMax) || effectiveMax <= 0) {
          const error = new Error('El stock máximo / capacidad debe ser mayor a 0.');
          error.statusCode = 400;
          throw error;
        }
        if (effectiveMax <= effectiveMin) {
          const error = new Error('El stock máximo debe ser estrictamente mayor al stock mínimo.');
          error.statusCode = 400;
          throw error;
        }

        if (stockMinimo !== undefined) insumo.stockMinimo = effectiveMin;
        if (stockMaximo !== undefined) insumo.stockMaximo = effectiveMax;
      }
      if (descripcion !== undefined || insumoData.controlarStock !== undefined) {
        const nextCleanDesc = descripcion !== undefined ? descripcion : currentParsed.cleanDescripcion;
        insumo.descripcion = encodeDescripcionWithStockFlag(nextCleanDesc, nextControlarStock);
      }
      if (estado !== undefined || insumoData.disponibilidad !== undefined) {
        const rawEst = estado !== undefined ? estado : insumoData.disponibilidad;
        insumo.estado = (rawEst === 'Activo' || rawEst === 'Disponible' || rawEst === 1 || rawEst === '1' || rawEst === true) ? 1 : 0;
      }
      if (insumoData.esAdicion !== undefined) {
        insumo.esAdicion = (insumoData.esAdicion === 1 || insumoData.esAdicion === true || insumoData.esAdicion === '1') ? 1 : 0;
      }
      if (insumoData.precioAdicion !== undefined && insumoData.precioAdicion !== null && insumoData.precioAdicion !== '') {
        insumo.precioAdicion = parseFloat(insumoData.precioAdicion || 0);
      }
      if (insumoData.porcionMinimaCantidad !== undefined) {
        insumo.porcionMinimaCantidad = insumoData.porcionMinimaCantidad !== null && insumoData.porcionMinimaCantidad !== ''
          ? parseFloat(insumoData.porcionMinimaCantidad)
          : null;
      }
      if (insumoData.porcionMinimaUnidad !== undefined) {
        insumo.porcionMinimaUnidad = insumoData.porcionMinimaUnidad ? String(insumoData.porcionMinimaUnidad).trim() : null;
      }
      if (insumoData.imagen !== undefined) {
        insumo.imagen = insumoData.imagen || null;
      }
      if (insumoData.incluyeIva !== undefined) {
        const llevaIva = (insumoData.incluyeIva === 1 || insumoData.incluyeIva === true || insumoData.incluyeIva === '1') ? 1 : 0;
        insumo.incluyeIva = llevaIva;
        insumo.porcentajeIva = llevaIva
          ? (insumoData.porcentajeIva !== undefined && insumoData.porcentajeIva !== null && insumoData.porcentajeIva !== ""
            ? parseFloat(insumoData.porcentajeIva)
            : 19.00)
          : 0.00;
      }

      // En caso de actualización completa administrativa interna (ej. migraciones o scripts autorizados)
      if (options.allowFullUpdate) {
        let {
          nombre, idCategoriaInsumo, stock, unidadMedida, precioUnitario,
          fechaExpedicion, fechaVencimiento, idProveedor
        } = insumoData;
        if (nombre !== undefined) insumo.nombre = nombre.trim();
        if (idCategoriaInsumo !== undefined) insumo.idCategoriaInsumo = idCategoriaInsumo ? parseInt(idCategoriaInsumo) : null;
        if (stock !== undefined) insumo.stock = parseFloat(stock);
        if (fechaExpedicion !== undefined) insumo.fechaExpedicion = (fechaExpedicion && String(fechaExpedicion).trim() !== '') ? fechaExpedicion : null;
        if (fechaVencimiento !== undefined) insumo.fechaVencimiento = (fechaVencimiento && String(fechaVencimiento).trim() !== '') ? fechaVencimiento : null;
        if (unidadMedida !== undefined) insumo.unidadMedida = unidadMedida;
        if (precioUnitario !== undefined) insumo.precioUnitario = parseFloat(precioUnitario);
        if (idProveedor !== undefined) insumo.idProveedor = idProveedor ? parseInt(idProveedor) : null;
        if (insumoData.esAdicion !== undefined) insumo.esAdicion = insumoData.esAdicion ? 1 : 0;
        if (insumoData.precioAdicion !== undefined) insumo.precioAdicion = parseFloat(insumoData.precioAdicion || 0);
        if (insumoData.imagen !== undefined) insumo.imagen = insumoData.imagen || null;
        if (insumoData.incluyeIva !== undefined) {
          const llevaIva = insumoData.incluyeIva ? 1 : 0;
          insumo.incluyeIva = llevaIva;
          insumo.porcentajeIva = llevaIva ? (parseFloat(insumoData.porcentajeIva) || 19.00) : 0.00;
        }
      }

      await insumo.save({ transaction });

      if (fichaTecnica) {
        const FichaTecnicaService = require('./fichaTecnicaService');
        await FichaTecnicaService.saveForInsumo(idInsumo, fichaTecnica, {
          transaction,
          skipReload: true
        });
      }

      const TrazabilidadService = require('./trazabilidadService');
      await TrazabilidadService.create({
        tipo: 'Editado',
        entidadNombre: insumo.nombre,
        detalle: `Se actualizaron los datos del insumo: ${insumo.nombre}`,
        idInsumo: insumo.idInsumo,
        motivo: 'Actualización de datos',
        usuarioId: insumoData.usuarioId || options?.usuarioId || null,
        skipStockUpdate: true
      }, { transaction });

      await transaction.commit();
      return this.getById(idInsumo);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async softDelete(idInsumo, options = {}) {
    const transaction = await database.sequelize.transaction();

    try {
      const insumo = await Insumo.findByPk(idInsumo, { transaction });
      if (!insumo) {
        const error = new Error('Insumo no encontrado');
        error.statusCode = 404;
        throw error;
      }

      // ── Validar stock activo: No se puede eliminar si tiene stock > 0 ──
      if (Number(insumo.stock || 0) > 0) {
        const error = new Error(`No se puede eliminar el insumo "${insumo.nombre}" porque cuenta con un stock activo de ${insumo.stock} ${insumo.unidadMedida || 'und'}. Para eliminarlo, su stock debe ser 0.`);
        error.statusCode = 400;
        throw error;
      }

      // ── Validar compras activas: Se puede eliminar si las compras fueron canceladas y stock es 0 ──
      const { Op } = require('sequelize');
      const { Compra } = require('../../persistence/models');
      const activeComprasCount = await DetalleCompraInsumo.count({
        where: { idInsumo },
        include: [{
          model: Compra,
          as: 'compra',
          where: {
            estado: { [Op.notIn]: ['CANCELADA', 'ANULADA'] }
          }
        }],
        transaction
      });
      if (activeComprasCount > 0) {
        const error = new Error(`No se puede eliminar el insumo "${insumo.nombre}" porque cuenta con ${activeComprasCount} compra(s) activa(s). Para eliminarlo, debes cancelar la compra del insumo primero.`);
        error.statusCode = 400;
        throw error;
      }

      // ── Validar si aún existen lotes con disponibilidad activa ──
      const activeLotesCount = await LoteInsumo.count({
        where: {
          idInsumo,
          cantidadDisponible: { [Op.gt]: 0 },
          estado: 'ACTIVO'
        },
        transaction
      });
      if (activeLotesCount > 0) {
        const error = new Error(`No se puede eliminar el insumo "${insumo.nombre}" porque cuenta con ${activeLotesCount} lote(s) con stock disponible.`);
        error.statusCode = 400;
        throw error;
      }

      insumo.eliminado = 1;
      await insumo.save({ transaction });

      const FichaTecnicaService = require('./fichaTecnicaService');
      await FichaTecnicaService.softDeleteByInsumoId(idInsumo, { transaction });

      const TrazabilidadService = require('./trazabilidadService');
      await TrazabilidadService.create({
        tipo: 'Eliminado',
        entidadNombre: insumo.nombre,
        detalle: `Se movió a la papelera el insumo: ${insumo.nombre}`,
        idInsumo: insumo.idInsumo,
        motivo: 'Envío a papelera',
        usuarioId: options.usuarioId || null,
        skipStockUpdate: true
      }, { transaction });

      await transaction.commit();
      return { message: 'Insumo y ficha técnica movidos a la papelera' };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async restore(idInsumo, options = {}) {
    const transaction = await database.sequelize.transaction();

    try {
      const insumo = await Insumo.findByPk(idInsumo, { transaction });
      if (!insumo) {
        const error = new Error('Insumo no encontrado');
        error.statusCode = 404;
        throw error;
      }

      insumo.eliminado = 0;
      await insumo.save({ transaction });

      const FichaTecnicaService = require('./fichaTecnicaService');
      await FichaTecnicaService.restoreByInsumoId(idInsumo, { transaction });

      const TrazabilidadService = require('./trazabilidadService');
      await TrazabilidadService.create({
        tipo: 'Restaurado',
        entidadNombre: insumo.nombre,
        detalle: `Se restauró el insumo en el inventario: ${insumo.nombre}`,
        idInsumo: insumo.idInsumo,
        motivo: 'Restauración desde papelera',
        usuarioId: options.usuarioId || null,
        skipStockUpdate: true
      }, { transaction });

      await transaction.commit();
      return this.getById(idInsumo);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  static async hardDelete(idInsumo) {
    const id = parseInt(idInsumo, 10);
    const insumo = await Insumo.findByPk(id);
    if (!insumo) {
      const error = new Error('Insumo no encontrado');
      error.statusCode = 404;
      throw error;
    }

    // ── Validar stock activo y compras ──
    if (Number(insumo.stock || 0) > 0) {
      const error = new Error(`No se puede eliminar definitivamente el insumo "${insumo.nombre}" porque cuenta con un stock activo de ${insumo.stock} ${insumo.unidadMedida || 'und'}.`);
      error.statusCode = 400;
      throw error;
    }

    const { Op } = require('sequelize');
    const { Compra } = require('../../persistence/models');
    const activeComprasCount = await DetalleCompraInsumo.count({
      where: { idInsumo: id },
      include: [{
        model: Compra,
        as: 'compra',
        where: {
          estado: { [Op.notIn]: ['CANCELADA', 'ANULADA'] }
        }
      }]
    });
    if (activeComprasCount > 0) {
      const error = new Error(`No se puede eliminar definitivamente el insumo "${insumo.nombre}" porque cuenta con ${activeComprasCount} compra(s) activa(s). Para eliminarlo, se debe cancelar la compra del insumo primero.`);
      error.statusCode = 400;
      throw error;
    }

    const nombreInsumo = insumo.nombre;

    const { resequenceTableIds } = require('../../infrastructure/utils/dbUtils');

    // Delete ALL associated fichas técnicas de este insumo (pueden haber múltiples)
    const fichas = await FichaTecnica.findAll({ where: { idInsumo: id } });
    if (fichas && fichas.length > 0) {
      for (const ficha of fichas) {
        await DetalleFichaInsumo.destroy({ where: { idFichaTecnica: ficha.idFichaTecnica } });
        await ficha.destroy();
      }
    }

    // Eliminar también cualquier referencia a este insumo como ingrediente en detalles de otras fichas
    await DetalleFichaInsumo.destroy({ where: { idInsumo: id } });

    // Eliminar referencias en detalle de insumos preparados si las hubiera
    if (DetalleInsumoPreparadoInsumo) {
      await DetalleInsumoPreparadoInsumo.destroy({ where: { idInsumo: id } }).catch(() => { });
    }

    // Eliminar registros de trazabilidad asociados a este insumo
    if (Trazabilidad) {
      await Trazabilidad.destroy({ where: { idInsumo: id } }).catch(() => { });
    }

    await insumo.destroy();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Eliminado permanente',
      entidadNombre: nombreInsumo,
      detalle: `Se eliminó permanentemente el insumo: ${nombreInsumo}`,
      motivo: 'Eliminación física definitiva'
    }).catch(() => { });

    const { resetAutoIncrement } = require('../../infrastructure/utils/dbUtils');
    await resetAutoIncrement('insumo', 'idInsumo');
    await resequenceTableIds('fichatecnica', 'idFichaTecnica', [
      { table: 'detallefichainsumo', column: 'idFichaTecnica' }
    ]);

    return { message: 'Insumo y su ficha técnica eliminados físicamente' };
  }

  /**
   * Elimina uno o todos los lotes vencidos de un insumo y resta su stock disponible.
   */
  static async _removeExpiredLotes(idInsumo, targetLoteId = null, options = {}) {
    const insumoId = parseInt(idInsumo, 10);
    if (!insumoId || isNaN(insumoId)) {
      const error = new Error('ID de insumo no válido');
      error.statusCode = 400;
      throw error;
    }

    const todayCol = getColombiaDateISO();
    const TrazabilidadService = require('./trazabilidadService');
    const sequelize = database.sequelize;

    const result = await sequelize.transaction(async (t) => {
      const insumo = await Insumo.findByPk(insumoId, { transaction: t, lock: t.LOCK.UPDATE });
      if (!insumo || Number(insumo.eliminado) === 1) {
        const error = new Error('Insumo no encontrado');
        error.statusCode = 404;
        throw error;
      }

      const lotesWhere = { idInsumo: insumoId };
      if (targetLoteId !== null && targetLoteId !== undefined) {
        const loteIdNum = parseInt(targetLoteId, 10);
        if (!loteIdNum || isNaN(loteIdNum)) {
          const error = new Error('ID de lote no válido');
          error.statusCode = 400;
          throw error;
        }
        lotesWhere.idLote = loteIdNum;
      }

      const candidatos = await LoteInsumo.findAll({
        where: lotesWhere,
        transaction: t,
        lock: t.LOCK.UPDATE
      });

      if (targetLoteId !== null && targetLoteId !== undefined) {
        if (!candidatos.length) {
          const error = new Error('Lote no encontrado para este insumo');
          error.statusCode = 404;
          throw error;
        }
        if (!isLoteExpiredByDateOrState(candidatos[0], todayCol)) {
          const error = new Error('Solo se pueden eliminar lotes que se encuentren vencidos.');
          error.statusCode = 400;
          throw error;
        }
      }

      const lotesAEliminar = candidatos.filter((l) => isLoteExpiredByDateOrState(l, todayCol));
      if (!lotesAEliminar.length) {
        const error = new Error('No se encontraron lotes vencidos para retirar en este insumo.');
        error.statusCode = 400;
        throw error;
      }

      const cantidadDescontada = Number(
        lotesAEliminar.reduce((acc, lote) => {
          const disp = lote.cantidadDisponible !== undefined && lote.cantidadDisponible !== null
            ? lote.cantidadDisponible
            : lote.cantidad;
          return acc + Math.max(0, Number(disp || 0));
        }, 0).toFixed(3)
      );

      const deletedLotes = lotesAEliminar.map((l) => ({
        idLote: l.idLote,
        numeroLote: l.numeroLote,
        cantidadDescontada: Math.max(0, Number(l.cantidadDisponible ?? l.cantidad ?? 0)),
        fechaVencimiento: l.fechaVencimiento
      }));

      await LoteInsumo.destroy({
        where: {
          idInsumo: insumoId,
          idLote: lotesAEliminar.map((l) => l.idLote)
        },
        transaction: t
      });

      const stockAnterior = Math.max(0, Number(insumo.stock || 0));
      const nuevoStock = Math.max(0, Number((stockAnterior - cantidadDescontada).toFixed(3)));

      const lotesRestantes = await LoteInsumo.findAll({
        where: { idInsumo: insumoId },
        order: [['fechaVencimiento', 'ASC']],
        transaction: t
      });

      const proximoActivo = lotesRestantes.find(
        (l) => !isLoteExpiredByDateOrState(l, todayCol) && Number(l.cantidadDisponible || 0) > 0 && l.fechaVencimiento
      );
      const cualquierRestante = lotesRestantes.find((l) => l.fechaVencimiento);
      const nuevaFechaVencimiento = proximoActivo
        ? proximoActivo.fechaVencimiento
        : (cualquierRestante ? cualquierRestante.fechaVencimiento : null);

      await insumo.update(
        {
          stock: nuevoStock,
          fechaVencimiento: nuevaFechaVencimiento
        },
        { transaction: t }
      );

      const codigosResumen = deletedLotes.map((d) => d.numeroLote || `#${d.idLote}`).join(', ');
      const unidad = insumo.unidadMedida || 'und';
      await TrazabilidadService.create(
        {
          tipo: 'Retiro Lote Vencido',
          entidadNombre: insumo.nombre,
          idInsumo: insumo.idInsumo,
          tipoMovimiento: 'Salida',
          cantidad: cantidadDescontada,
          motivo: `Retiro de lote(s) vencido(s): ${codigosResumen}`,
          detalle: `Se eliminó ${deletedLotes.length} lote(s) vencido(s) (${codigosResumen}) de "${insumo.nombre}", descontando ${cantidadDescontada} ${unidad} del stock (${stockAnterior} -> ${nuevoStock}).`,
          usuarioId: options.usuarioId || null,
          skipStockUpdate: true
        },
        { transaction: t }
      );

      return {
        deletedCount: deletedLotes.length,
        deletedLotes,
        cantidadDescontada,
        stockAnterior,
        nuevoStock
      };
    });

    const insumoActualizado = await this.getById(insumoId);
    return {
      message: result.deletedCount === 1
        ? `Lote vencido eliminado. Se descontaron ${result.cantidadDescontada} ${insumoActualizado.unidadMedida || 'und'} del stock.`
        : `${result.deletedCount} lotes vencidos eliminados. Se descontaron ${result.cantidadDescontada} ${insumoActualizado.unidadMedida || 'und'} del stock.`,
      ...result,
      insumo: insumoActualizado
    };
  }

  static async deleteExpiredLote(idInsumo, idLote, options = {}) {
    return this._removeExpiredLotes(idInsumo, idLote, options);
  }

  static async deleteExpiredLotesByInsumo(idInsumo, options = {}) {
    return this._removeExpiredLotes(idInsumo, null, options);
  }
}

InsumoService.getColombiaDateISO = getColombiaDateISO;
InsumoService.isLoteExpiredByDateOrState = isLoteExpiredByDateOrState;
InsumoService.NO_STOCK_TAG = NO_STOCK_TAG;
InsumoService.parseNoStockFlag = parseNoStockFlag;
InsumoService.encodeDescripcionWithStockFlag = encodeDescripcionWithStockFlag;

module.exports = InsumoService;
