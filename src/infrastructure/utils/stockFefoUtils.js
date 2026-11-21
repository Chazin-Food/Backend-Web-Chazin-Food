const { getColombiaDateISO, extractDateOnlyISO } = require('./colombiaDateUtils');

const NO_STOCK_TAG = '[SIN_CONTROL_STOCK]';
const EPSILON = 1e-6;

function roundQty(val) {
  const num = Number(val || 0);
  if (!Number.isFinite(num)) return 0;
  return Number(num.toFixed(3));
}

function isInsumoNoStockControl(insumo) {
  return Boolean(insumo && String(insumo.descripcion || '').includes(NO_STOCK_TAG));
}

function isInsumoInactiveOrDeleted(insumo) {
  if (!insumo) return true;
  if (Number(insumo.eliminado) === 1 || insumo.eliminado === true) return true;
  const est = insumo.estado;
  if (est === 0 || est === '0' || est === false) return true;
  if (typeof est === 'string' && est.trim().toLowerCase() === 'inactivo') return true;
  return false;
}

function getLoteDisponible(lote) {
  if (!lote) return 0;
  const raw = lote.cantidadDisponible !== undefined && lote.cantidadDisponible !== null
    ? lote.cantidadDisponible
    : lote.cantidad;
  return Math.max(0, roundQty(raw));
}

/**
 * Determina si un lote se encuentra vencido por estado explícito o por fecha (< hoy Colombia).
 * Regla de negocio: si fechaVencimiento === hoy, el lote sigue vigente hasta las 11:59 PM.
 */
function isLoteExpired(lote, todayCol = getColombiaDateISO()) {
  if (!lote) return false;
  const est = String(lote.estado || '').toUpperCase().trim();
  if (est === 'VENCIDO') return true;
  if (est === 'AGOTADO') return false;
  const fechaStr = extractDateOnlyISO(lote.fechaVencimiento);
  return Boolean(fechaStr && fechaStr < todayCol);
}

/**
 * Ordena lotes en estricto orden FEFO (First Expired, First Out):
 * primero los que tienen fecha de vencimiento más próxima, luego sin fecha (NULL al final),
 * y desempate por idLote ascendente (FIFO).
 */
function sortLotesFefo(lotes = []) {
  return [...lotes].sort((a, b) => {
    const fa = extractDateOnlyISO(a?.fechaVencimiento) || '9999-12-31';
    const fb = extractDateOnlyISO(b?.fechaVencimiento) || '9999-12-31';
    if (fa !== fb) return fa < fb ? -1 : 1;
    return Number(a?.idLote || a?.id || 0) - Number(b?.idLote || b?.id || 0);
  });
}

function groupLotesByInsumo(lotes = []) {
  const map = new Map();
  for (const l of (lotes || [])) {
    const idIns = Number(l?.idInsumo);
    if (!idIns) continue;
    if (!map.has(idIns)) map.set(idIns, []);
    map.get(idIns).push(l);
  }
  return map;
}

/**
 * Calcula el desglose real de stock de un insumo separando stock vigente (utilizable)
 * de stock vencido (pendiente de retiro/merma) y respetando inactivación manual.
 *
 * Garantías:
 * 1. Si un lote se vence pero existe otro lote vigente, stockVigente refleja únicamente el lote sano.
 * 2. Si se vencen todos los lotes (aún sin retiro físico), stockVigente cae a 0 al instante.
 * 3. Soporta insumos heredados sin lotes (validando fechaVencimiento directa) e insumos mixtos
 *    (stock base sin lote + lotes de compras), nunca excediendo el stock físico total ni usando lotes vencidos.
 * 4. Si insumo.estado === 0 o eliminado === 1, isInactive = true y stockOperativo = 0.
 */
function computeInsumoStockBreakdown(insumo, lotes = [], todayCol = getColombiaDateISO()) {
  const controlarStock = !isInsumoNoStockControl(insumo);
  const isInactive = isInsumoInactiveOrDeleted(insumo);
  const stockTotal = Math.max(0, roundQty(insumo?.stock || 0));
  const rawLotes = Array.isArray(lotes) ? lotes : [];

  const lotesVigentes = [];
  const lotesVencidos = [];

  for (const lote of rawLotes) {
    if (!lote) continue;
    const est = String(lote.estado || '').toUpperCase().trim();
    const disp = getLoteDisponible(lote);
    if (est === 'AGOTADO' || disp <= EPSILON) continue;

    if (isLoteExpired(lote, todayCol)) {
      lotesVencidos.push(lote);
    } else {
      lotesVigentes.push(lote);
    }
  }

  const lotesVigentesFefo = sortLotesFefo(lotesVigentes);
  const sumValidLots = roundQty(lotesVigentesFefo.reduce((acc, l) => acc + getLoteDisponible(l), 0));
  const sumExpiredLots = roundQty(lotesVencidos.reduce((acc, l) => acc + getLoteDisponible(l), 0));
  const directDateISO = extractDateOnlyISO(insumo?.fechaVencimiento);
  const directDateExpired = Boolean(directDateISO && directDateISO < todayCol);

  const sumTracked = roundQty(sumValidLots + sumExpiredLots);
  const untrackedStock = Math.max(0, roundQty(stockTotal - sumTracked));
  const untrackedValid = directDateExpired ? 0 : untrackedStock;
  const maxAfterExpiredLots = Math.max(0, roundQty(stockTotal - sumExpiredLots));

  const stockVigente = Math.max(
    0,
    roundQty(Math.min(maxAfterExpiredLots, sumValidLots + untrackedValid))
  );
  const stockVencido = Math.max(0, roundQty(stockTotal - stockVigente));
  const stockOperativo = isInactive ? 0 : stockVigente;

  return {
    controlarStock,
    isInactive,
    stockTotal,
    stockVigente,
    stockVencido,
    stockOperativo,
    sumValidLots,
    sumExpiredLots,
    untrackedStock,
    lotesVigentes: lotesVigentesFefo,
    lotesVencidos,
    hasLotes: rawLotes.length > 0,
    hasExpiredLots: lotesVencidos.length > 0 || (directDateExpired && untrackedStock > EPSILON),
    directDateExpired
  };
}

/**
 * Descuenta cantidadADescontar de un insumo aplicando estricto FEFO sobre sus lotes vigentes
 * (sin tocar nunca lotes vencidos) y actualizando insumo.stock dentro de la transacción.
 */
async function deductInsumoFefo(
  insumo,
  cantidadADescontar,
  { lotes = [], todayCol = getColombiaDateISO(), transaction = null } = {}
) {
  const qty = Math.max(0, roundQty(cantidadADescontar));
  if (!insumo || qty <= EPSILON) {
    return {
      cantidadDescontada: 0,
      nuevoStock: Math.max(0, roundQty(insumo?.stock || 0)),
      lotesConsumidos: []
    };
  }

  const breakdown = computeInsumoStockBreakdown(insumo, lotes, todayCol);
  let restante = qty;
  const lotesConsumidos = [];

  // Descontar en estricto orden FEFO únicamente de lotes vigentes
  for (const lote of breakdown.lotesVigentes) {
    if (restante <= EPSILON) break;
    const disp = getLoteDisponible(lote);
    if (disp <= EPSILON) continue;

    const take = roundQty(Math.min(disp, restante));
    if (take <= EPSILON) continue;

    const nuevoDispRaw = roundQty(Math.max(0, disp - take));
    const agotado = nuevoDispRaw <= 0.0005;
    const nuevoDisp = agotado ? 0 : nuevoDispRaw;
    const nuevoEstado = agotado ? 'AGOTADO' : 'ACTIVO';

    lote.cantidadDisponible = nuevoDisp;
    lote.estado = nuevoEstado;
    if (typeof lote.save === 'function') {
      await lote.save(transaction ? { transaction } : undefined);
    }

    lotesConsumidos.push({
      idLote: Number(lote.idLote || lote.id),
      idInsumo: Number(insumo.idInsumo || insumo.id),
      numeroLote: lote.numeroLote || null,
      cantidad: take
    });

    restante = roundQty(Math.max(0, restante - take));
  }

  const stockActual = Math.max(0, roundQty(insumo.stock || 0));
  const nuevoStock = Math.max(0, roundQty(stockActual - qty));
  insumo.stock = nuevoStock;
  if (typeof insumo.save === 'function') {
    await insumo.save(transaction ? { transaction } : undefined);
  }

  return {
    cantidadDescontada: qty,
    nuevoStock,
    lotesConsumidos
  };
}

/**
 * Restaura stock y lotes previamente consumidos por una venta al cancelarla/anularla.
 */
async function restoreInsumoFefo(
  insumo,
  cantidadARestaurar,
  { lotesConsumidos = [], LoteInsumoModel = null, todayCol = getColombiaDateISO(), transaction = null } = {}
) {
  const qty = Math.max(0, roundQty(cantidadARestaurar));
  if (!insumo || qty <= EPSILON) return { cantidadRestaurada: 0 };

  const stockActual = Math.max(0, roundQty(insumo.stock || 0));
  insumo.stock = roundQty(stockActual + qty);
  if (typeof insumo.save === 'function') {
    await insumo.save(transaction ? { transaction } : undefined);
  }

  const idIns = Number(insumo.idInsumo || insumo.id);
  const matchingLotes = Array.isArray(lotesConsumidos)
    ? lotesConsumidos.filter(lc => Number(lc.idInsumo) === idIns && Number(lc.idLote) > 0 && Number(lc.cantidad) > 0)
    : [];

  if (LoteInsumoModel && matchingLotes.length > 0) {
    let restanteLote = qty;
    for (const entry of matchingLotes) {
      if (restanteLote <= EPSILON) break;
      const loteRow = await LoteInsumoModel.findByPk(
        entry.idLote,
        transaction ? { transaction, lock: transaction.LOCK.UPDATE } : undefined
      ).catch(() => null);
      if (!loteRow) continue;

      const devolver = roundQty(Math.min(Number(entry.cantidad || 0), restanteLote));
      if (devolver <= EPSILON) continue;

      const dispActual = getLoteDisponible(loteRow);
      const maxCap = Math.max(dispActual + devolver, Number(loteRow.cantidad || 0));
      const nuevoDisp = roundQty(Math.min(maxCap, dispActual + devolver));
      const fechaStr = extractDateOnlyISO(loteRow.fechaVencimiento);
      const vencidoPorFecha = Boolean(fechaStr && fechaStr < todayCol);

      loteRow.cantidadDisponible = nuevoDisp;
      if (String(loteRow.estado || '').toUpperCase() === 'AGOTADO' && nuevoDisp > EPSILON) {
        loteRow.estado = vencidoPorFecha ? 'VENCIDO' : 'ACTIVO';
      }
      await loteRow.save(transaction ? { transaction } : undefined);
      restanteLote = roundQty(Math.max(0, restanteLote - devolver));
    }
  }

  return { cantidadRestaurada: qty, nuevoStock: insumo.stock };
}

module.exports = {
  NO_STOCK_TAG,
  EPSILON,
  roundQty,
  isInsumoNoStockControl,
  isInsumoInactiveOrDeleted,
  getLoteDisponible,
  isLoteExpired,
  sortLotesFefo,
  groupLotesByInsumo,
  computeInsumoStockBreakdown,
  deductInsumoFefo,
  restoreInsumoFefo
};
