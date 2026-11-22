const { Venta, Insumo, Cliente, User, Product, Compra, Resena, DetalleVentaProducto, Variante, Devolucion, sequelize } = require('../../persistence/models');
const { Op } = require('sequelize');
const {
  ensureDevolucionSchema,
  ensureZanahoriaInsumoRealOnce,
  ensureValidationPendingDevolucionOnce
} = require('../../infrastructure/utils/dbUtils');

let _devolucionSchemaReadyPromise = null;
function ensureDevolucionSchemaOnce() {
  if (!_devolucionSchemaReadyPromise) {
    _devolucionSchemaReadyPromise = ensureDevolucionSchema().catch((err) => {
      console.warn('[DashboardService] Advertencia verificando esquema devolucion:', err?.message);
      _devolucionSchemaReadyPromise = null;
    });
  }
  return _devolucionSchemaReadyPromise;
}
const {
  COLOMBIA_OFFSET,
  getColombiaDateISO,
  getColombiaYear,
  getColombiaParts,
  colombiaStartOfDay,
  colombiaEndOfDay,
  addDaysColombiaISO,
  diffCalendarDaysColombia,
  getColombiaPeriodRange,
  getDaysInMonth,
  shiftMonthYear,
  formatColombiaDateES
} = require('../../infrastructure/utils/colombiaDateUtils');

function parseDateRange(filtro = {}) {
  const startParam = filtro.startDate || filtro.desde || filtro.fechaInicio;
  const endParam = filtro.endDate || filtro.hasta || filtro.fechaFin;
  const range = getColombiaPeriodRange(filtro.periodo, {
    year: filtro.year,
    startDate: startParam,
    endDate: endParam
  });
  return {
    ...range,
    startDate: range.start,
    endDate: range.end
  };
}

function isValidCompletedOrApprovedSale(v) {
  if (!v) return false;
  const entrega = String(v.estadoEntrega || '').toUpperCase().trim();
  if (entrega === 'CANCELADO' || entrega === 'RECHAZADO') return false;
  const aprob = String(v.estadoAprobacion || '').toUpperCase().trim();
  if (aprob === 'PENDIENTE' || aprob === 'RECHAZADO') return false;
  if (v.observaciones) {
    const rawObs = typeof v.observaciones === 'string' ? v.observaciones : JSON.stringify(v.observaciones);
    if (rawObs.includes('"esDevolucion":true') || rawObs.includes('"wompiAbandonada":true')) return false;
  }
  return true;
}

class DashboardService {
  static async getStats(filtro = {}) {
    try {
      const range = parseDateRange(filtro);
      const {
        startDate,
        endDate,
        prevStart,
        prevEnd,
        currentCompareStart,
        currentCompareEnd,
        todayISO,
        currentYear,
        month,
        day,
        periodo
      } = range;

      const [todasVentas, clientesTotal, clientesActivos, usuariosTotal, usuariosActivos, insumosBajoStock, productosTotal] = await Promise.all([
        Venta.findAll({
          attributes: ['fechaVenta', 'total', 'estadoEntrega', 'estadoAprobacion', 'observaciones'],
          raw: true
        }).catch(() => []),
        Cliente.count().catch(() => 0),
        Cliente.count({ where: { estado: 1 } }).catch(() => null),
        User.count().catch(() => 0),
        User.count({ where: { estado: 'ACTIVO' } }).catch(() => 0),
        Insumo.count({
          where: {
            estado: 1,
            eliminado: 0,
            stock: { [Op.lte]: sequelize.col('stockMinimo') },
            [Op.or]: [
              { descripcion: null },
              { descripcion: { [Op.notLike]: '%[SIN_CONTROL_STOCK]%' } }
            ]
          }
        }).catch(() => 0),
        Product.count({ where: { estado: 1, eliminado: 0 } }).catch(() => 0)
      ]);

      const ventasValidas = todasVentas.filter(isValidCompletedOrApprovedSale);

      // Total Global acumulado de todas las ventas no anuladas de la empresa
      const totalVentasGlobal = ventasValidas.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);

      // Ventas filtradas estrictamente por el periodo seleccionado en Colombia
      let pedidosPeriodo = ventasValidas;
      if (startDate || endDate) {
        pedidosPeriodo = ventasValidas.filter(v => {
          if (!v.fechaVenta) return false;
          const d = new Date(v.fechaVenta);
          if (isNaN(d.getTime())) return false;
          return (!startDate || d >= startDate) && (!endDate || d <= endDate);
        });
      }

      const totalVentasPeriodo = pedidosPeriodo.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
      const pedidosTotal = pedidosPeriodo.length;

      // Cálculo de variación porcentual sin solapamiento contra el periodo equivalente anterior
      let ventasVariacion = 0;
      let pedidosVariacion = 0;
      const labelVariacion = range.labelVariacion || 'vs período anterior';

      if (prevStart && prevEnd) {
        const refCurrentList = (currentCompareStart && currentCompareEnd)
          ? ventasValidas.filter(v => {
              if (!v.fechaVenta) return false;
              const d = new Date(v.fechaVenta);
              return !isNaN(d.getTime()) && d >= currentCompareStart && d <= currentCompareEnd;
            })
          : pedidosPeriodo;

        const refPrevList = ventasValidas.filter(v => {
          if (!v.fechaVenta) return false;
          const d = new Date(v.fechaVenta);
          return !isNaN(d.getTime()) && d >= prevStart && d <= prevEnd;
        });

        const curTotal = refCurrentList.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
        const curCount = refCurrentList.length;
        const prevTotal = refPrevList.reduce((sum, v) => sum + parseFloat(v.total || 0), 0);
        const prevCount = refPrevList.length;

        if (prevTotal > 0) {
          ventasVariacion = parseFloat((((curTotal - prevTotal) / prevTotal) * 100).toFixed(1));
        } else if (curTotal > 0) {
          ventasVariacion = 100;
        }

        if (prevCount > 0) {
          pedidosVariacion = parseFloat((((curCount - prevCount) / prevCount) * 100).toFixed(1));
        } else if (curCount > 0) {
          pedidosVariacion = 100;
        }
      }

      // Frecuencia de ventas promedio diaria en horario Colombia
      let frecuenciaVentas = 0;
      if (periodo === 'hoy') {
        frecuenciaVentas = pedidosTotal;
      } else if (periodo === '7_dias' || periodo === '7dias' || periodo === 'ultima_semana' || periodo === 'semana') {
        frecuenciaVentas = parseFloat((pedidosTotal / 7).toFixed(1));
      } else if (periodo === 'este_mes' || periodo === 'mes' || periodo === 'mes_actual' || periodo === 'mes actual') {
        frecuenciaVentas = parseFloat((pedidosTotal / Math.max(1, day)).toFixed(1));
      } else if (periodo === 'mes_anterior' || periodo === 'mes anterior') {
        const prevMY = shiftMonthYear(currentYear, month, -1);
        const daysPrevMonth = getDaysInMonth(prevMY.year, prevMY.month);
        frecuenciaVentas = parseFloat((pedidosTotal / Math.max(1, daysPrevMonth)).toFixed(1));
      } else if (startDate && endDate) {
        const endIso = getColombiaDateISO(endDate);
        const effectiveEndISO = endIso > todayISO ? todayISO : endIso;
        const startIso = getColombiaDateISO(startDate);
        const spanDays = Math.max(1, (diffCalendarDaysColombia(effectiveEndISO, startIso) ?? 0) + 1);
        frecuenciaVentas = parseFloat((pedidosTotal / spanDays).toFixed(1));
      } else {
        // 'todos': días desde la primera venta registrada hasta hoy en Colombia
        let earliestMs = Infinity;
        for (const v of ventasValidas) {
          if (!v.fechaVenta) continue;
          const t = new Date(v.fechaVenta).getTime();
          if (!isNaN(t) && t < earliestMs) earliestMs = t;
        }
        const spanAll = isFinite(earliestMs)
          ? Math.max(1, (diffCalendarDaysColombia(todayISO, getColombiaDateISO(earliestMs)) ?? 0) + 1)
          : Math.max(1, (diffCalendarDaysColombia(todayISO, `${currentYear}-01-01`) ?? 0) + 1);
        frecuenciaVentas = parseFloat((pedidosTotal / spanAll).toFixed(1));
      }

      return {
        totalVentasGlobal: Math.round(totalVentasGlobal),
        ventasTotal: Math.round(totalVentasPeriodo),
        ventasMesActual: Math.round(totalVentasPeriodo),
        ventasVariacion,
        labelVariacion,
        pedidosTotal,
        pedidosVariacion,
        frecuenciaVentas,
        clientesTotal,
        clientesActivos: clientesActivos ?? clientesTotal,
        usuariosTotal,
        usuariosActivos,
        clientesVariacion: 0,
        productosTotal,
        insumosBajoStock,
        divisa: "COP"
      };
    } catch (error) {
      console.error('Error in DashboardService.getStats:', error);
      return {
        totalVentasGlobal: 0,
        ventasTotal: 0,
        ventasMesActual: 0,
        ventasVariacion: 0,
        labelVariacion: "vs período anterior",
        pedidosTotal: 0,
        pedidosVariacion: 0,
        frecuenciaVentas: 0,
        clientesTotal: 0,
        clientesActivos: 0,
        usuariosTotal: 0,
        usuariosActivos: 0,
        clientesVariacion: 0,
        productosTotal: 0,
        insumosBajoStock: 0,
        divisa: "COP"
      };
    }
  }

  static async getVentasChart(filtro = {}) {
    try {
      const mesesNombres = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const { year, currentYear, month, todayISO, periodo } = parseDateRange(filtro);
      const pad2 = (n) => String(n).padStart(2, '0');
      const monthRangeMs = (y, m1) => {
        const last = getDaysInMonth(y, m1);
        return {
          startMs: colombiaStartOfDay(`${y}-${pad2(m1)}-01`).getTime(),
          endMs: colombiaEndOfDay(`${y}-${pad2(m1)}-${pad2(last)}`).getTime()
        };
      };

      if (periodo === 'todos' || periodo === 'historico' || periodo === 'all') {
        const [ventasAllRaw, comprasAll] = await Promise.all([
          Venta.findAll({
            where: { estadoEntrega: { [Op.ne]: 'CANCELADO' } },
            attributes: ['fechaVenta', 'total', 'estadoEntrega', 'estadoAprobacion', 'observaciones'],
            raw: true
          }).catch(() => []),
          Compra.findAll({
            where: { estado: { [Op.ne]: 'CANCELADA' } },
            attributes: ['fechaCompra', 'total', 'subtotal'],
            raw: true
          }).catch(() => [])
        ]);
        const ventasAll = ventasAllRaw.filter(isValidCompletedOrApprovedSale);

        const yearMap = new Map();
        for (let y = currentYear - 2; y <= currentYear; y++) {
          yearMap.set(y, { mes: String(y), ventas: 0, compras: 0 });
        }

        ventasAll.forEach(v => {
          if (!v.fechaVenta) return;
          const y = getColombiaYear(v.fechaVenta);
          if (!yearMap.has(y)) yearMap.set(y, { mes: String(y), ventas: 0, compras: 0 });
          yearMap.get(y).ventas += Math.round(parseFloat(v.total || 0));
        });

        comprasAll.forEach(c => {
          if (!c.fechaCompra) return;
          const y = getColombiaYear(c.fechaCompra);
          if (!yearMap.has(y)) yearMap.set(y, { mes: String(y), ventas: 0, compras: 0 });
          yearMap.get(y).compras += Math.round(parseFloat(c.total || c.subtotal || 0));
        });

        return Array.from(yearMap.entries())
          .sort(([a], [b]) => a - b)
          .map(([_, val]) => val);
      }

      const buckets = [];
      let exclusiveUpperBounds = false;

      if (periodo === 'hoy') {
        exclusiveUpperBounds = true;
        const horas = [
          { label: "08:00", startHour: 0, endHour: 8 },
          { label: "12:00", startHour: 8, endHour: 12 },
          { label: "15:00", startHour: 12, endHour: 15 },
          { label: "18:00", startHour: 15, endHour: 18 },
          { label: "21:00", startHour: 18, endHour: 21 },
          { label: "23:59", startHour: 21, endHour: 24 }
        ];
        for (const h of horas) {
          const start = new Date(`${todayISO}T${pad2(h.startHour)}:00:00.000${COLOMBIA_OFFSET}`);
          const end = h.endHour === 24
            ? colombiaEndOfDay(todayISO)
            : new Date(`${todayISO}T${pad2(h.endHour)}:00:00.000${COLOMBIA_OFFSET}`);
          buckets.push({ mes: h.label, startMs: start.getTime(), endMs: end.getTime(), ventas: 0, compras: 0 });
        }
      } else if (periodo === '7_dias' || periodo === '7dias' || periodo === 'ultima_semana' || periodo === 'semana') {
        const diasNombres = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
        for (let i = 6; i >= 0; i--) {
          const dayISO = addDaysColombiaISO(todayISO, -i);
          const start = colombiaStartOfDay(dayISO);
          const end = colombiaEndOfDay(dayISO);
          const dParts = getColombiaParts(start);
          buckets.push({
            mes: `${diasNombres[dParts.dayOfWeek]} ${dParts.day}`,
            startMs: start.getTime(),
            endMs: end.getTime(),
            ventas: 0,
            compras: 0
          });
        }
      } else if (periodo === 'este_mes' || periodo === 'mes' || periodo === 'mes_actual' || periodo === 'mes actual') {
        const lastDay = getDaysInMonth(currentYear, month);
        const semanas = [
          { label: "1 - 7", startDay: 1, endDay: 7 },
          { label: "8 - 14", startDay: 8, endDay: 14 },
          { label: "15 - 21", startDay: 15, endDay: 21 },
          { label: `22 - ${lastDay}`, startDay: 22, endDay: lastDay }
        ];
        for (const s of semanas) {
          const start = colombiaStartOfDay(`${currentYear}-${pad2(month)}-${pad2(s.startDay)}`);
          const end = colombiaEndOfDay(`${currentYear}-${pad2(month)}-${pad2(s.endDay)}`);
          buckets.push({ mes: `Sem ${s.label}`, startMs: start.getTime(), endMs: end.getTime(), ventas: 0, compras: 0 });
        }
      } else if (periodo === 'mes_anterior' || periodo === 'mes anterior') {
        const prevMY = shiftMonthYear(currentYear, month, -1);
        const lastDay = getDaysInMonth(prevMY.year, prevMY.month);
        const semanas = [
          { label: "1 - 7", startDay: 1, endDay: 7 },
          { label: "8 - 14", startDay: 8, endDay: 14 },
          { label: "15 - 21", startDay: 15, endDay: 21 },
          { label: `22 - ${lastDay}`, startDay: 22, endDay: lastDay }
        ];
        for (const s of semanas) {
          const start = colombiaStartOfDay(`${prevMY.year}-${pad2(prevMY.month)}-${pad2(s.startDay)}`);
          const end = colombiaEndOfDay(`${prevMY.year}-${pad2(prevMY.month)}-${pad2(s.endDay)}`);
          buckets.push({ mes: `Sem ${s.label}`, startMs: start.getTime(), endMs: end.getTime(), ventas: 0, compras: 0 });
        }
      } else if (periodo === 'ultimos_3_meses' || periodo === 'últimos 3 meses' || periodo === 'ultimos 3 meses' || periodo === '3_meses' || periodo === '3meses') {
        for (let i = 2; i >= 0; i--) {
          const my = shiftMonthYear(currentYear, month, -i);
          const { startMs, endMs } = monthRangeMs(my.year, my.month);
          buckets.push({ mes: mesesNombres[my.month - 1], startMs, endMs, ventas: 0, compras: 0 });
        }
      } else if (periodo === 'ultimos_6_meses' || periodo === 'últimos 6 meses' || periodo === 'ultimos 6 meses' || periodo === '6_meses' || periodo === '6meses') {
        for (let i = 5; i >= 0; i--) {
          const my = shiftMonthYear(currentYear, month, -i);
          const { startMs, endMs } = monthRangeMs(my.year, my.month);
          buckets.push({ mes: mesesNombres[my.month - 1], startMs, endMs, ventas: 0, compras: 0 });
        }
      } else {
        const chartYear = (periodo === 'ano_anterior' || periodo === 'año anterior' || periodo === 'ano anterior')
          ? (year - 1)
          : year;
        for (let m = 1; m <= 12; m++) {
          const { startMs, endMs } = monthRangeMs(chartYear, m);
          buckets.push({ mes: mesesNombres[m - 1], startMs, endMs, ventas: 0, compras: 0 });
        }
      }

      if (buckets.length === 0) return [];

      const rangeStart = new Date(buckets[0].startMs);
      const rangeEnd = new Date(buckets[buckets.length - 1].endMs);

      const [ventasRangeRaw, comprasRange] = await Promise.all([
        Venta.findAll({
          where: {
            fechaVenta: { [Op.between]: [rangeStart, rangeEnd] },
            estadoEntrega: { [Op.ne]: 'CANCELADO' }
          },
          attributes: ['fechaVenta', 'total', 'estadoEntrega', 'estadoAprobacion', 'observaciones'],
          raw: true
        }).catch(() => []),
        Compra.findAll({
          where: {
            fechaCompra: { [Op.between]: [rangeStart, rangeEnd] },
            estado: { [Op.ne]: 'CANCELADA' }
          },
          attributes: ['fechaCompra', 'total', 'subtotal'],
          raw: true
        }).catch(() => [])
      ]);
      const ventasRange = ventasRangeRaw.filter(isValidCompletedOrApprovedSale);

      const lastIdx = buckets.length - 1;
      const matchesBucket = (ts, b, idx) => (
        exclusiveUpperBounds && idx < lastIdx
          ? (ts >= b.startMs && ts < b.endMs)
          : (ts >= b.startMs && ts <= b.endMs)
      );

      for (const v of ventasRange) {
        if (!v.fechaVenta) continue;
        const ts = new Date(v.fechaVenta).getTime();
        if (isNaN(ts)) continue;
        const monto = parseFloat(v.total || 0);
        for (let idx = 0; idx < buckets.length; idx++) {
          if (matchesBucket(ts, buckets[idx], idx)) {
            buckets[idx].ventas += monto;
            break;
          }
        }
      }

      for (const c of comprasRange) {
        if (!c.fechaCompra) continue;
        const ts = new Date(c.fechaCompra).getTime();
        if (isNaN(ts)) continue;
        const monto = parseFloat(c.total || c.subtotal || 0);
        for (let idx = 0; idx < buckets.length; idx++) {
          if (matchesBucket(ts, buckets[idx], idx)) {
            buckets[idx].compras += monto;
            break;
          }
        }
      }

      return buckets.map(b => ({
        mes: b.mes,
        ventas: Math.round(b.ventas),
        compras: Math.round(b.compras)
      }));
    } catch (error) {
      console.error('Error in getVentasChart:', error);
      return [];
    }
  }

  static async getProductosPopulares(filtro = {}) {
    try {
      const { startDate, endDate } = parseDateRange(filtro);

      let dateFilter = "";
      const replacements = {};
      if (startDate) {
        dateFilter = "AND v.fechaVenta >= :startDate AND v.fechaVenta <= :endDate";
        replacements.startDate = startDate;
        replacements.endDate = endDate || new Date();
      }

      // Consultar los detalles de venta reales uniendo con venta, producto y variante
      const [rows] = await sequelize.query(`
        SELECT dv.idVariante, dv.observaciones, dv.cantidad, dv.precioUnitario, dv.subtotal,
               p.nombre as productoNombre, p.precio as productoPrecio,
               var.nombre as varNombre, var.precio as varPrecio, v.fechaVenta
        FROM detalleventaproducto dv
        INNER JOIN venta v ON dv.idVenta = v.idVenta
        LEFT JOIN variante var ON dv.idVariante = var.idVariante
        LEFT JOIN producto p ON var.idProducto = p.idProducto
        WHERE v.estadoEntrega != 'CANCELADO'
          AND (v.estadoAprobacion IS NULL OR v.estadoAprobacion NOT IN ('PENDIENTE', 'RECHAZADO'))
          AND (v.observaciones IS NULL OR v.observaciones NOT LIKE '%"esDevolucion":true%')
        ${dateFilter}
      `, { replacements }).catch(() => [[]]);

      if (!rows || rows.length === 0) {
        return [];
      }

      const productCounts = {};
      rows.forEach(r => {
        // Ignorar referencias al marcador de sistema (variante/producto 0)
        const isSistema = Number(r.idVariante) === 0 ||
          String(r.productoNombre || '').startsWith('__SISTEMA') ||
          String(r.varNombre || '').startsWith('__SISTEMA');
        const realProdName = !isSistema && r.productoNombre && !String(r.productoNombre).startsWith('__SISTEMA') ? r.productoNombre : null;
        const realVarName = !isSistema && r.varNombre && !String(r.varNombre).startsWith('__SISTEMA') ? r.varNombre : null;

        // Priorizar el nombre real del producto en base de datos
        let pName = realProdName || realVarName || null;
        let unitPrice = parseFloat(r.precioUnitario) || (!isSistema ? (parseFloat(r.varPrecio) || parseFloat(r.productoPrecio)) : 0) || 0;

        // Si no tiene nombre por join (o producto fue eliminado), verificar observaciones JSON o texto
        if (r.observaciones) {
          try {
            if (typeof r.observaciones === 'string' && r.observaciones.startsWith('{')) {
              const parsed = JSON.parse(r.observaciones);
              pName = parsed.nombre || parsed.nombreProducto || pName;
              if (parsed.precio && !unitPrice) {
                unitPrice = parseFloat(parsed.precio) || 0;
              }
            } else if (!pName && typeof r.observaciones === 'string' && r.observaciones.trim()) {
              pName = r.observaciones.split('—')[0].trim();
            }
          } catch (e) {}
        }

        // Descartar si es un placeholder genérico o inválido
        if (
          !pName ||
          pName.startsWith("__SISTEMA") ||
          pName === "Producto" ||
          pName === "Pedido de Venta" ||
          pName === "Producto General" ||
          pName.startsWith("Producto #")
        ) return;

        // Limpiar adiciones entre paréntesis (ej: "Hamburguesa chazin monster - base" o "(+Salsa...)")
        let nombreLimpio = pName.replace(/\s*\(.*?\)/g, "").replace(/\s*-\s*base/i, "").trim();
        if (!nombreLimpio || nombreLimpio === "Producto" || nombreLimpio === "Pedido de Venta" || nombreLimpio === "Producto General") return;

        const qty = parseInt(r.cantidad) || 1;
        let subtotal = parseFloat(r.subtotal) || 0;
        if (subtotal <= 0 && unitPrice > 0) {
          subtotal = unitPrice * qty;
        } else if (subtotal > 0 && unitPrice <= 0) {
          unitPrice = Math.round(subtotal / qty);
        }

        const key = nombreLimpio.toLowerCase();
        if (!productCounts[key]) {
          productCounts[key] = { nombre: nombreLimpio, ventas: 0, ingresos: 0, unitPrice: unitPrice };
        }
        productCounts[key].ventas += qty;
        productCounts[key].ingresos += subtotal;
        if (!productCounts[key].unitPrice && unitPrice > 0) {
          productCounts[key].unitPrice = unitPrice;
        }
      });

      const totalGlobalIngresos = Object.values(productCounts).reduce((acc, p) => acc + (p.ingresos || 0), 0);
      const totalGlobalUnidades = Object.values(productCounts).reduce((acc, p) => acc + (p.ventas || 0), 0);

      const sorted = Object.values(productCounts)
        .sort((a, b) => b.ventas - a.ventas)
        .slice(0, 5);

      return sorted.map((p, i) => {
        const precioUnitario = p.ventas > 0 && p.ingresos > 0
          ? Math.round(p.ingresos / p.ventas)
          : (p.unitPrice || 0);
        const porcentaje = totalGlobalIngresos > 0
          ? Math.round((p.ingresos / totalGlobalIngresos) * 1000) / 10
          : (totalGlobalUnidades > 0 ? Math.round((p.ventas / totalGlobalUnidades) * 1000) / 10 : 0);

        return {
          id: i + 1,
          nombre: p.nombre,
          ventas: p.ventas,
          ingresos: Math.round(p.ingresos),
          precioUnitario,
          porcentaje
        };
      });
    } catch (error) {
      console.error('Error in getProductosPopulares:', error);
      return [];
    }
  }

  static async getProductosFavoritos(filtro = {}) {
    try {
      const { startDate, endDate } = parseDateRange(filtro);
      const whereVentas = {
        estadoEntrega: { [Op.ne]: 'CANCELADO' }
      };
      if (startDate) {
        whereVentas.fechaVenta = {
          [Op.between]: [startDate, endDate || new Date()]
        };
      }

      const [resenasRaw, ventasRaw, productosCatalogo] = await Promise.all([
        Resena.findAll({
          where: { estado: 1 },
          attributes: ['idProducto', 'puntuacion', 'idUsuario'],
          raw: true
        }).catch(() => []),
        Venta.findAll({
          where: whereVentas,
          attributes: ['idVenta', 'idCliente', 'estadoEntrega', 'estadoAprobacion', 'observaciones'],
          include: [
            {
              model: DetalleVentaProducto,
              as: 'detalles',
              separate: true,
              attributes: ['cantidad', 'idVariante'],
              include: [
                {
                  model: Variante,
                  as: 'variante',
                  attributes: ['idProducto']
                }
              ]
            }
          ]
        }).catch(() => []),
        Product.findAll({
          where: { eliminado: 0 },
          attributes: ['idProducto', 'nombre', 'precio', 'imagen', 'categoria'],
          raw: true
        }).catch(() => [])
      ]);

      const prodMap = new Map();
      for (const p of productosCatalogo) {
        prodMap.set(Number(p.idProducto), p);
      }

      const agg = new Map();
      const ensureEntry = (idProducto) => {
        const pid = Number(idProducto);
        if (!pid || !prodMap.has(pid)) return null;
        if (!agg.has(pid)) {
          const meta = prodMap.get(pid);
          agg.set(pid, {
            idProducto: pid,
            nombre: meta.nombre,
            categoria: meta.categoria || '',
            imagen: meta.imagen || null,
            precio: Number(meta.precio || 0),
            sumaRating: 0,
            totalResenas: 0,
            clientesSet: new Set(),
            pedidos: 0,
            unidades: 0
          });
        }
        return agg.get(pid);
      };

      for (const r of resenasRaw) {
        const entry = ensureEntry(r.idProducto);
        if (!entry) continue;
        const pts = Number(r.puntuacion || 0);
        if (pts > 0) {
          entry.sumaRating += pts;
          entry.totalResenas += 1;
        }
      }

      const ventasValidas = ventasRaw.filter(isValidCompletedOrApprovedSale);
      for (const v of ventasValidas) {
        const clientKey = v.idCliente ? `c:${v.idCliente}` : `v:${v.idVenta}`;
        const seenInOrder = new Set();
        for (const d of (v.detalles || [])) {
          const pid = Number(d.variante?.idProducto || 0);
          const entry = ensureEntry(pid);
          if (!entry) continue;
          entry.unidades += Number(d.cantidad || 1);
          entry.clientesSet.add(clientKey);
          if (!seenInOrder.has(pid)) {
            entry.pedidos += 1;
            seenInOrder.add(pid);
          }
        }
      }

      const ranked = Array.from(agg.values())
        .filter((e) => e.totalResenas > 0 || e.clientesSet.size > 0)
        .map((e) => {
          const promedioCalificacion = e.totalResenas > 0
            ? Math.round((e.sumaRating / e.totalResenas) * 10) / 10
            : 0;
          const clientesUnicos = e.clientesSet.size;
          const ratingScore = e.totalResenas > 0
            ? promedioCalificacion * (1 + Math.log10(1 + e.totalResenas)) * 12
            : 0;
          const preferenceScore = ratingScore + (clientesUnicos * 3) + (e.pedidos * 0.5);
          return {
            idProducto: e.idProducto,
            nombre: e.nombre,
            categoria: e.categoria,
            imagen: e.imagen,
            precio: e.precio,
            promedioCalificacion,
            totalResenas: e.totalResenas,
            clientesUnicos,
            pedidos: e.pedidos,
            unidades: e.unidades,
            score: preferenceScore
          };
        })
        .sort((a, b) => b.score - a.score || b.promedioCalificacion - a.promedioCalificacion || b.clientesUnicos - a.clientesUnicos)
        .slice(0, 5);

      const maxScore = ranked[0]?.score || 1;
      return ranked.map((item, idx) => ({
        id: idx + 1,
        idProducto: item.idProducto,
        nombre: item.nombre,
        categoria: item.categoria,
        imagen: item.imagen,
        precio: item.precio,
        promedioCalificacion: item.promedioCalificacion,
        totalResenas: item.totalResenas,
        clientesUnicos: item.clientesUnicos,
        pedidos: item.pedidos,
        unidades: item.unidades,
        porcentajeFavorito: Math.min(100, Math.round((item.score / maxScore) * 100))
      }));
    } catch (error) {
      console.error('Error in getProductosFavoritos:', error);
      return [];
    }
  }

  static async getAlertasStock() {
    try {
      await ensureZanahoriaInsumoRealOnce();
      const insumosBajoStock = await Insumo.findAll({
        where: {
          estado: 1,
          eliminado: 0,
          stock: { [Op.lte]: sequelize.col('stockMinimo') },
          [Op.or]: [
            { descripcion: null },
            { descripcion: { [Op.notLike]: '%[SIN_CONTROL_STOCK]%' } }
          ]
        },
        limit: 5,
        raw: true
      }).catch(() => []);

      return insumosBajoStock.map(i => ({
        id: i.idInsumo,
        idInsumo: i.idInsumo,
        nombre: i.nombre,
        stock: parseFloat(i.stock || 0),
        minimo: parseFloat(i.stockMinimo || 0),
        stockMinimo: parseFloat(i.stockMinimo || 0),
        unidadMedida: i.unidadMedida || 'unidades',
        precioUnitario: parseFloat(i.precioUnitario || 0),
        idProveedor: i.idProveedor || null
      }));
    } catch (error) {
      console.error('Error in getAlertasStock:', error);
      return [];
    }
  }

  static async getVentasRecientes(filtro = {}) {
    try {
      const VentaService = require('./ventaService');
      const { Venta, Cliente, User, DetalleVentaProducto } = require('../../persistence/models');
      const { startDate, endDate } = parseDateRange(filtro);
      const where = {
        estadoEntrega: {
          [Op.notIn]: ['LISTO', 'ENTREGADO', 'CANCELADO', 'EN_CAMINO']
        }
      };
      if (startDate) {
        where.fechaVenta = {
          [Op.between]: [startDate, endDate || new Date()]
        };
      }

      const ventas = await Venta.findAll({
        where,
        include: [
          {
            model: Cliente,
            as: 'cliente',
            include: [{ model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] }]
          },
          { model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] },
          { model: DetalleVentaProducto, as: 'detalles' }
        ],
        order: [['idVenta', 'DESC']],
        limit: 10
      });

      return ventas.map(v => VentaService.formatVenta(v));
    } catch (error) {
      console.error('Error in getVentasRecientes:', error);
      return [];
    }
  }

  static async getComentariosObservaciones(filtro = {}) {
    try {
      const ResenaService = require('./resenaService');
      const VentaService = require('./ventaService');
      const { Venta, Cliente, User, DetalleVentaProducto } = require('../../persistence/models');
      const { startDate, endDate } = parseDateRange(filtro);

      const whereVentas = {
        estadoEntrega: { [Op.ne]: 'CANCELADO' }
      };
      if (startDate) {
        whereVentas.fechaVenta = {
          [Op.between]: [startDate, endDate || new Date()]
        };
      }

      const [resenasData, ventas] = await Promise.all([
        ResenaService.getRecientes(20).catch(() => ({ promedioGlobal: 0, total: 0, resenas: [] })),
        Venta.findAll({
          where: whereVentas,
          include: [
            {
              model: Cliente,
              as: 'cliente',
              include: [{ model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] }]
            },
            { model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] },
            { model: DetalleVentaProducto, as: 'detalles' }
          ],
          order: [['idVenta', 'DESC']],
          limit: 80
        }).catch(() => [])
      ]);

      const isTrivialObservation = (raw) => {
        const clean = String(raw || '').trim();
        if (!clean || clean.length < 3) return true;
        if (clean.startsWith('{') || clean.startsWith('[')) return true;
        const lower = clean.toLowerCase();
        return (
          lower === 'n/a' ||
          lower === 'na' ||
          lower === 'ninguna' ||
          lower === 'ninguno' ||
          lower === 'sin observaciones' ||
          lower === 'sin notas' ||
          lower === 'ninguna observacion' ||
          lower === 'ninguna observación' ||
          lower === 'prueba' ||
          lower === 'test' ||
          lower.startsWith('qa_') ||
          lower.includes('prueba automatizada')
        );
      };

      const observaciones = [];
      for (const v of ventas) {
        const formatted = VentaService.formatVenta(v);
        const parts = [];
        const seen = new Set();

        const pushPart = (val) => {
          const clean = String(val || '').trim();
          if (isTrivialObservation(clean)) return;
          const key = clean.toLowerCase();
          if (seen.has(key)) return;
          seen.add(key);
          parts.push(clean);
        };

        pushPart(formatted.especificaciones);
        pushPart(formatted.observacionCocina);

        if (Array.isArray(formatted.productos)) {
          for (const item of formatted.productos) {
            const itemNote = String(item?.observaciones || item?.observacion || item?.nota || '').trim();
            const itemNameLower = String(item?.nombre || item?.nombreProducto || '').trim().toLowerCase();
            if (itemNote && itemNote.toLowerCase() !== itemNameLower) {
              pushPart(itemNote);
            }
          }
        }

        if (parts.length > 0) {
          observaciones.push({
            id: formatted.id || formatted.idVenta,
            codigo: formatted.codigoPedido || formatted.numeroVenta || `#${String(formatted.id || '').padStart(4, '0')}`,
            cliente: formatted.clienteNombre || formatted.cliente || 'Cliente General',
            origen: formatted.origenNombre || (formatted.tipoEntrega === 'Domicilio' ? 'Venta Online' : 'Punto Físico'),
            nota: parts.join(' · '),
            fecha: formatted.fechaFormatted || (formatted.fecha ? formatColombiaDateES(formatted.fecha) : ''),
            estado: formatted.estado || ''
          });
          if (observaciones.length >= 15) break;
        }
      }

      return {
        promedioGlobal: Number(resenasData?.promedioGlobal || 0),
        totalResenas: Number(resenasData?.total || 0),
        resenas: Array.isArray(resenasData?.resenas) ? resenasData.resenas : [],
        observaciones
      };
    } catch (error) {
      console.error('Error in getComentariosObservaciones:', error);
      return {
        promedioGlobal: 0,
        totalResenas: 0,
        resenas: [],
        observaciones: []
      };
    }
  }

  static async getDevolucionesPendientes() {
    try {
      await ensureDevolucionSchemaOnce();
      await ensureValidationPendingDevolucionOnce();
      const rows = await Devolucion.findAll({
        where: {
          estado: { [Op.like]: '%PENDIENTE%' }
        },
        attributes: [
          'idDevolucion',
          'idVenta',
          'idCliente',
          'motivo',
          'tipoResolucion',
          'productosDevueltos',
          'valorDevuelto',
          'descripcion',
          'fecha',
          'estado'
        ],
        include: [
          {
            model: Cliente,
            as: 'cliente',
            attributes: ['idCliente', 'idUsuario'],
            required: false,
            include: [
              {
                model: User,
                as: 'usuario',
                attributes: ['idUsuario', 'nombre', 'apellidos'],
                required: false
              }
            ]
          },
          {
            model: Venta,
            as: 'venta',
            attributes: ['idVenta', 'observaciones', 'tipoVenta', 'total'],
            required: false,
            include: [
              {
                model: Cliente,
                as: 'cliente',
                attributes: ['idCliente', 'idUsuario'],
                required: false,
                include: [
                  {
                    model: User,
                    as: 'usuario',
                    attributes: ['idUsuario', 'nombre', 'apellidos'],
                    required: false
                  }
                ]
              },
              {
                model: User,
                as: 'usuario',
                attributes: ['idUsuario', 'nombre', 'apellidos'],
                required: false
              }
            ]
          }
        ],
        order: [['fecha', 'DESC'], ['idDevolucion', 'DESC']],
        limit: 20
      });

      return (rows || []).map((row) => {
        const plain = typeof row.get === 'function' ? row.get({ plain: true }) : row;

        let obsClienteNombre = '';
        if (plain.venta?.observaciones) {
          try {
            const parsedObs = typeof plain.venta.observaciones === 'string'
              ? JSON.parse(plain.venta.observaciones)
              : plain.venta.observaciones;
            if (parsedObs && typeof parsedObs === 'object' && parsedObs.clienteNombre) {
              obsClienteNombre = String(parsedObs.clienteNombre).trim();
            }
          } catch (_) {
            // observaciones en texto plano
          }
        }

        const userObj =
          plain.cliente?.usuario ||
          plain.venta?.cliente?.usuario ||
          plain.venta?.usuario ||
          null;
        const nombreDesdeUsuario = userObj
          ? `${userObj.nombre || ''} ${userObj.apellidos || ''}`.trim()
          : '';
        const clienteNombre = obsClienteNombre || nombreDesdeUsuario || 'Cliente General';

        let productos = [];
        if (plain.productosDevueltos) {
          try {
            const parsed = typeof plain.productosDevueltos === 'string'
              ? JSON.parse(plain.productosDevueltos)
              : plain.productosDevueltos;
            if (Array.isArray(parsed)) productos = parsed;
          } catch (_) {
            productos = [];
          }
        }

        const cantidadProductos = productos.reduce((acc, p) => acc + Math.max(1, Number(p?.cantidad || 1)), 0);
        let productosResumen = '';
        if (productos.length > 0) {
          const first = productos[0];
          const firstName = String(first?.nombre || first?.nombreProducto || 'Producto').trim();
          const firstQty = Math.max(1, Number(first?.cantidad || 1));
          productosResumen = productos.length > 1
            ? `${firstName} (x${firstQty}) +${productos.length - 1} más`
            : `${firstName} (x${firstQty})`;
        }

        const idDev = plain.idDevolucion;
        const idVen = plain.idVenta;

        return {
          id: idDev,
          idDevolucion: idDev,
          codigoDevolucion: `DEV-${String(idDev || 0).padStart(4, '0')}`,
          idVenta: idVen,
          codigoVenta: idVen ? `VEN-${String(idVen).padStart(4, '0')}` : '',
          clienteNombre,
          motivo: plain.motivo || 'Sin motivo especificado',
          tipoResolucion: plain.tipoResolucion || 'Cambio de producto',
          valorDevuelto: Number(plain.valorDevuelto || 0),
          descripcion: plain.descripcion || '',
          fecha: plain.fecha,
          fechaFormatted: plain.fecha ? formatColombiaDateES(plain.fecha) : '',
          estado: 'PENDIENTE',
          cantidadProductos,
          productosResumen
        };
      });
    } catch (error) {
      console.error('Error in getDevolucionesPendientes:', error);
      return [];
    }
  }
}

module.exports = DashboardService;
