const { Venta, DetalleVentaProducto, Cliente, User, Role, Variante, Product } = require('../../persistence/models');
const {
  parsePaginationParams,
  buildPaginatedResponse,
  sanitizeShortName
} = require('../../infrastructure/utils/paginationUtils');
const {
  getColombiaDateISO,
  extractDateOnlyISO,
  getColombiaPeriodRange,
  diffCalendarDaysColombia,
  getDaysInMonth,
  shiftMonthYear,
  formatColombiaDateES,
  formatColombiaTime12,
  formatColombiaTimeWithSeconds12
} = require('../../infrastructure/utils/colombiaDateUtils');
const {
  NO_STOCK_TAG,
  EPSILON,
  roundQty,
  isInsumoNoStockControl,
  computeInsumoStockBreakdown,
  deductInsumoFefo,
  restoreInsumoFefo
} = require('../../infrastructure/utils/stockFefoUtils');
const { invalidateNamespaces } = require('../../infrastructure/utils/apiCache');

let lastWompiExpirationSweepMs = 0;
const WOMPI_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Identifica intenciones de pago Wompi abandonadas o aún no completadas en pasarela
 * (el cliente abrió el widget y lo cerró sin elegir medio de pago ni completar transacción).
 * Estas intenciones temporales NO son ventas reales y no deben aparecer en
 * Gestión de Ventas, Mis Pedidos, Dashboard ni estadísticas.
 */
function isUnpaidWompiIntention(v) {
  if (!v) return false;
  let obs = {};
  if (v.observaciones) {
    if (typeof v.observaciones === 'object') {
      obs = v.observaciones;
    } else if (typeof v.observaciones === 'string' && v.observaciones.trim().startsWith('{')) {
      try { obs = JSON.parse(v.observaciones); } catch (_) { obs = {}; }
    }
  }
  if (obs.wompiAbandonada === true) return true;
  if (obs.esDevolucion === true) return false;
  const aprob = String(v.estadoAprobacion || obs.estadoAprobacion || '').toUpperCase().trim();
  if (aprob === 'APROBADO') return false;
  const entrega = String(v.estadoEntrega || '').toUpperCase().trim();
  if (!aprob && ['PREPARANDO', 'LISTO', 'EN_CAMINO', 'ENTREGADO'].includes(entrega)) return false;
  if (obs.wompiTransactionId) return false;

  const isWompiOrOnline =
    Boolean(obs.wompiReference) ||
    Boolean(obs.esIntencionWompi) ||
    Boolean(obs.montoEnCentavos) ||
    String(obs.metodoPago || v.metodoPago || '').toLowerCase().includes('wompi') ||
    String(v.origen || obs.origen || '').toUpperCase() === 'ONLINE' ||
    String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO';

  return isWompiOrOnline;
}

function buildExcludeUnpaidWompiClauses(Op) {
  return [
    {
      [Op.or]: [
        { observaciones: null },
        { observaciones: { [Op.notLike]: '%"wompiAbandonada":true%' } }
      ]
    },
    {
      [Op.or]: [
        { estadoAprobacion: 'APROBADO' },
        {
          [Op.and]: [
            { estadoAprobacion: null },
            { estadoEntrega: { [Op.in]: ['PREPARANDO', 'LISTO', 'EN_CAMINO', 'ENTREGADO'] } }
          ]
        },
        { observaciones: { [Op.like]: '%"wompiTransactionId"%' } },
        { observaciones: { [Op.like]: '%"esDevolucion":true%' } },
        {
          [Op.and]: [
            {
              [Op.or]: [
                { tipoVenta: null },
                { tipoVenta: { [Op.ne]: 'DOMICILIO' } }
              ]
            },
            {
              [Op.or]: [
                { origen: null },
                { origen: { [Op.ne]: 'ONLINE' } }
              ]
            },
            {
              [Op.or]: [
                { observaciones: null },
                {
                  [Op.and]: [
                    { observaciones: { [Op.notLike]: '%"wompiReference"%' } },
                    { observaciones: { [Op.notLike]: '%"montoEnCentavos"%' } },
                    { observaciones: { [Op.notLike]: '%"metodoPago":"Wompi%' } },
                    { observaciones: { [Op.notLike]: '%"origen":"ONLINE"%' } }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ];
}

function convertUnits(amount, fromUnit, toUnit) {
  if (!amount || isNaN(amount)) return 0;
  if (!fromUnit || !toUnit) return Number(amount);

  const from = String(fromUnit).toLowerCase().trim();
  const to = String(toUnit).toLowerCase().trim();

  if (from === to) return Number(amount);

  const isKg = (u) => u === 'kg' || u.includes('kg') || u.includes('kilo');
  const isGr = (u) => u === 'g' || u === 'gr' || u.includes('gr') || u.includes('gram');
  const isMg = (u) => u === 'mg' || u.includes('mg') || u.includes('miligram');
  const isLb = (u) => u === 'lb' || u.includes('libra');
  const isLt = (u) => u === 'l' || u === 'lt' || u.includes('lt') || u.includes('litro');
  const isMl = (u) => u === 'ml' || u.includes('ml') || u.includes('mililitro') || u.includes('cc');

  if (isKg(from) && isGr(to)) return Number(amount) * 1000;
  if (isGr(from) && isKg(to)) return Number(amount) / 1000;
  if (isGr(from) && isLb(to)) return Number(amount) / 500;
  if (isLb(from) && isGr(to)) return Number(amount) * 500;
  if (isKg(from) && isLb(to)) return Number(amount) * 2;
  if (isLb(from) && isKg(to)) return Number(amount) / 2;
  if (isKg(from) && isMg(to)) return Number(amount) * 1000000;
  if (isMg(from) && isKg(to)) return Number(amount) / 1000000;
  if (isGr(from) && isMg(to)) return Number(amount) * 1000;
  if (isMg(from) && isGr(to)) return Number(amount) / 1000;

  if (isLt(from) && isMl(to)) return Number(amount) * 1000;
  if (isMl(from) && isLt(to)) return Number(amount) / 1000;

  return Number(amount);
}

function normalizeTextForMatch(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRemovedIngredients(detailItem, obsProdItem) {
  const removedNames = new Set();
  const removedIds = new Set();

  const collectFromList = (list) => {
    if (!Array.isArray(list)) return;
    for (const entry of list) {
      if (entry === null || entry === undefined) continue;
      if (typeof entry === 'number' || (typeof entry === 'string' && /^\d+$/.test(entry.trim()))) {
        removedIds.add(Number(entry));
      } else if (typeof entry === 'string') {
        const cleaned = normalizeTextForMatch(entry.replace(/^sin\s+/i, ''));
        if (cleaned) removedNames.add(cleaned);
      } else if (typeof entry === 'object') {
        const idCandidate = entry.idInsumo ?? entry.insumoId ?? entry.id;
        if (idCandidate !== undefined && idCandidate !== null && /^\d+$/.test(String(idCandidate))) {
          removedIds.add(Number(idCandidate));
        }
        const nameCandidate = entry.nombre || entry.name || entry.insumoNombre;
        if (nameCandidate) {
          const cleaned = normalizeTextForMatch(String(nameCandidate).replace(/^sin\s+/i, ''));
          if (cleaned) removedNames.add(cleaned);
        }
      }
    }
  };

  const collectFromPersonalizaciones = (persObj) => {
    if (!persObj || typeof persObj !== 'object' || Array.isArray(persObj)) return;
    for (const [k, val] of Object.entries(persObj)) {
      if (val === false || val === 0 || val === 'false') {
        if (/^\d+$/.test(String(k).trim())) {
          removedIds.add(Number(k));
        } else {
          const cleaned = normalizeTextForMatch(String(k).replace(/^sin\s+/i, ''));
          if (cleaned) removedNames.add(cleaned);
        }
      }
    }
  };

  const parseSinTokensFromText = (rawText) => {
    if (!rawText || typeof rawText !== 'string') return;
    let textToParse = rawText;
    if (rawText.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(rawText);
        collectFromList(parsed.ingredientesRemovidos || parsed.removedIngredients || parsed.sinIngredientes);
        collectFromPersonalizaciones(parsed.personalizaciones);
        textToParse = [parsed.observaciones, parsed.observacion, parsed.nota, parsed.especificaciones]
          .filter(Boolean)
          .join(' | ');
      } catch (e) {
        // continuar con texto plano
      }
    }

    const segments = textToParse.split(/[,•|;\n]+/);
    for (const seg of segments) {
      const matches = seg.matchAll(/\bsin\s+([^,•|;\n()]+)/gi);
      for (const m of matches) {
        const candidate = normalizeTextForMatch(m[1]);
        if (!candidate || candidate === 'azucar' || candidate.startsWith('azucar ')) continue;
        removedNames.add(candidate);
      }
    }
  };

  for (const src of [detailItem, obsProdItem]) {
    if (!src || typeof src !== 'object') continue;
    collectFromList(src.ingredientesRemovidos || src.removedIngredients || src.sinIngredientes);
    collectFromPersonalizaciones(src.personalizaciones);
    parseSinTokensFromText(src.observaciones);
    parseSinTokensFromText(src.observacion);
    parseSinTokensFromText(src.nota);
    parseSinTokensFromText(src.especificaciones);
  }

  return { removedNames: Array.from(removedNames), removedIds };
}

function isInsumoRemovedByMiseEnPlace(insumo, detailItem, obsProdItem) {
  if (!insumo) return false;
  const { removedNames, removedIds } = extractRemovedIngredients(detailItem, obsProdItem);

  const insumoId = Number(insumo.idInsumo || insumo.id);
  if (insumoId && removedIds.has(insumoId)) {
    return true;
  }

  const normInsumoName = normalizeTextForMatch(insumo.nombre);
  if (!normInsumoName || removedNames.length === 0) return false;

  for (const rem of removedNames) {
    if (!rem) continue;
    if (normInsumoName === rem) return true;
    if (rem.length >= 3 && (normInsumoName.includes(rem) || rem.includes(normInsumoName))) {
      return true;
    }
  }

  return false;
}

function extractCleanSpecifications(raw) {
  if (!raw) return '';
  if (typeof raw === 'object') {
    if (raw.especificaciones !== undefined && raw.especificaciones !== raw) {
      const res = extractCleanSpecifications(raw.especificaciones);
      if (res) return res;
    }
    if (raw.nota !== undefined && raw.nota !== raw) {
      const res = extractCleanSpecifications(raw.nota);
      if (res) return res;
    }
    if (raw.observacion !== undefined && raw.observacion !== raw) {
      const res = extractCleanSpecifications(raw.observacion);
      if (res) return res;
    }
    if (raw.instrucciones !== undefined && raw.instrucciones !== raw) {
      const res = extractCleanSpecifications(raw.instrucciones);
      if (res) return res;
    }
    return '';
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return '';
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']')) ||
      trimmed.includes('"tipoEntrega"') ||
      trimmed.includes('"especificaciones"') ||
      trimmed.includes('"codigoPedido"')
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        return extractCleanSpecifications(parsed);
      } catch (e) {
        return '';
      }
    }
    const lower = trimmed.toLowerCase();
    if (['sin observaciones', 'ninguna', 'ninguno', 'n/a', 'null', 'undefined', ''].includes(lower)) {
      return '';
    }
    return trimmed;
  }
  return '';
}

const formatColombiaTime = formatColombiaTime12;
const formatColombiaTimeWithSeconds = formatColombiaTimeWithSeconds12;

function inferProductPrepMinutes(nombreProducto = '', ftTiempo = null) {
  const n = String(nombreProducto || '').toLowerCase();
  const hasFoodKeyword =
    n.includes('hamburguesa') ||
    n.includes('burger') ||
    n.includes('perro') ||
    n.includes('salchipapa') ||
    n.includes('combo') ||
    n.includes('papa') ||
    n.includes('casco') ||
    n.includes('corral') ||
    n.includes('espiral') ||
    n.includes('chili') ||
    n.includes('tocineta');

  const isSimpleDrink =
    !hasFoodKeyword &&
    (n.includes('gaseosa') ||
      n.includes('coca-cola') ||
      n.includes('coca cola') ||
      n.includes('postobón') ||
      n.includes('postobon') ||
      n.includes('pepsi') ||
      n.includes('colombiana') ||
      n.includes('sprite') ||
      n.includes('quatro') ||
      n.includes('cuatro') ||
      n.includes('agua') ||
      n.includes('cristal') ||
      n.includes('jugo') ||
      n.includes('hit') ||
      n.includes('bebida'));

  const parsedFt = Number(ftTiempo);
  if (!isNaN(parsedFt) && parsedFt > 0) {
    if (!isSimpleDrink && parsedFt <= 2) {
      // Si es plato cocinado pero tenía 1 min, inferir cocción real
    } else {
      return parsedFt;
    }
  }

  if (isSimpleDrink) return 1;
  if (n.includes('combo') || n.includes('familiar') || n.includes('pareja')) return 14;
  if (n.includes('doble') || n.includes('salvaje') || n.includes('trufada') || n.includes('fest')) return 12;
  if (n.includes('hamburguesa') || n.includes('burger') || n.includes('salchipapa')) return 10;
  if (n.includes('perro')) return 8;
  if (n.includes('papa') || n.includes('casco') || n.includes('corral') || n.includes('espiral')) return 7;
  return 10;
}

function calculateOrderPrepTime(productosList = []) {
  if (!Array.isArray(productosList) || productosList.length === 0) {
    return { totalMin: 12, formatted: '12 min' };
  }
  const withMinutes = productosList.map((p) => {
    const rawRecetaMin = p.receta?.tiempoPreparacionMin || parseInt(String(p.receta?.tiempoPreparacion || p.tiempoPreparacion || ''), 10);
    const min = inferProductPrepMinutes(p.nombre || p.nombreProducto || p.observaciones, rawRecetaMin);
    return {
      ...p,
      tiempoPreparacionMin: min,
      qty: Math.max(1, Number(p.cantidad) || 1)
    };
  });
  const cookedDishes = withMinutes.filter((p) => p.tiempoPreparacionMin > 2);
  if (cookedDishes.length > 0) {
    const maxCookedMin = Math.max(...cookedDishes.map((p) => p.tiempoPreparacionMin));
    const totalCookedUnits = cookedDishes.reduce((sum, p) => sum + p.qty, 0);
    const extraBatchMin = Math.min(10, Math.max(0, totalCookedUnits - 1) * 2);
    const totalMin = maxCookedMin + extraBatchMin;
    return { totalMin, formatted: `${totalMin} min` };
  }
  const maxDrinkMin = Math.max(1, ...withMinutes.map((p) => p.tiempoPreparacionMin || 1));
  return { totalMin: maxDrinkMin, formatted: `${maxDrinkMin} min` };
}

function computeHybridDeliveryEstimate({ productos = [], tipoEntrega = '', estadoEntrega = 'PENDIENTE', estadoCocina = '', savedTiempo = '', savedModo = '' }) {
  const prep = calculateOrderPrepTime(productos);
  const esDomicilio = String(tipoEntrega || '').toLowerCase().includes('domicilio');
  const est = String(estadoEntrega || 'PENDIENTE').toUpperCase();
  const cocinaEst = String(estadoCocina || '').toUpperCase();

  let autoEstimate;
  if (est === 'ENTREGADO' || est === 'COMPLETADA' || cocinaEst === 'ENTREGADO') {
    autoEstimate = 'Entregado';
  } else if (est === 'DESPACHADO' || est === 'EN_CAMINO' || cocinaEst === 'DESPACHADO' || cocinaEst === 'EN_CAMINO') {
    autoEstimate = esDomicilio ? 'En camino' : 'Listo para entrega';
  } else if (est === 'LISTO' || cocinaEst === 'LISTO') {
    autoEstimate = esDomicilio ? '15-20 min' : 'Listo para entrega';
  } else if (esDomicilio) {
    autoEstimate = `${prep.totalMin + 15}-${prep.totalMin + 25} min`;
  } else if (prep.totalMin <= 2) {
    autoEstimate = '2-5 min';
  } else {
    autoEstimate = `${prep.totalMin + 3}-${prep.totalMin + 8} min`;
  }

  if (est === 'ENTREGADO' || est === 'COMPLETADA' || cocinaEst === 'ENTREGADO') {
    return { effectiveEstimate: 'Entregado', autoEstimate, modo: 'AUTO' };
  }

  const cleanSaved = String(savedTiempo || '').trim();
  const normSaved = cleanSaved.toLowerCase().replace(/\s+/g, '');
  const isAutoLiteral =
    normSaved === 'auto' ||
    normSaved === 'automatico' ||
    normSaved === 'automático';
  const isGenericDefault =
    !cleanSaved ||
    isAutoLiteral ||
    normSaved === '15-20min' ||
    normSaved === '30-45min' ||
    normSaved === '35-45min';

  const modoUpper = isAutoLiteral ? 'AUTO' : String(savedModo || '').toUpperCase();
  const isManual = modoUpper === 'MANUAL' || (!modoUpper && !isGenericDefault);

  if (isManual && cleanSaved && !isAutoLiteral) {
    return { effectiveEstimate: cleanSaved, autoEstimate, modo: 'MANUAL' };
  }

  return { effectiveEstimate: autoEstimate, autoEstimate, modo: 'AUTO' };
}

class VentaService {
  static formatVenta(v) {
    let obsData = {};
    if (v.observaciones) {
      try {
        obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
          ? JSON.parse(v.observaciones)
          : { nota: v.observaciones };
      } catch (e) {
        obsData = { nota: v.observaciones };
      }
    }

    const clienteObj = v.cliente || {};
    const clienteUser = clienteObj.usuario || clienteObj.clienteInfo || v.usuario || {};
    
    // Dynamically derive client name from DB relationships without hardcoded strings
    const clienteNombre = obsData.clienteNombre || 
      (clienteUser.nombre ? `${clienteUser.nombre} ${clienteUser.apellidos || ''}`.trim() : null) ||
      (v.idCliente ? `Cliente #${v.idCliente}` : "Cliente General");

    const numeroVenta = obsData.codigoPedido || obsData.numeroVenta || `VEN-${String(v.idVenta).padStart(4, '0')}`;
    
    // Dynamic format of date/time in local Colombia timezone (Formato 12 horas con AM/PM)
    let horario = null;
    let fechaFormatted = null;
    if (v.fechaVenta) {
      const d = new Date(v.fechaVenta);
      if (!isNaN(d.getTime())) {
        horario = formatColombiaTime(d);
        fechaFormatted = formatColombiaDateES(d);
      }
    }
    if (!horario && obsData.horario) {
      horario = obsData.horario;
    }
    horario = horario || '12:00 PM';

    // Ítem #11: "Empaque para llevar" es una opción de empaque, NO un tipo de entrega.
    // Solo se clasifica como "Recoger" si el tipo de entrega explícito lo indica.
    const rawObsLower = (v.observaciones || "").toLowerCase();
    const tipoEntrega = obsData.tipoEntrega || (
      String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO'
        ? "Domicilio"
        : (rawObsLower.includes("recoger") ? "Recoger" : (String(v.tipoVenta || '').toUpperCase() === 'PUNTO_DE_VENTA' ? "Recoger" : "Domicilio"))
    );
    const rawEspecText = typeof obsData.especificaciones === 'string'
      ? obsData.especificaciones
      : JSON.stringify(obsData.especificaciones || '');
    const empaqueParaLlevar = Boolean(
      obsData.empaqueParaLlevar ||
      (obsData.especificaciones && typeof obsData.especificaciones === 'object' && obsData.especificaciones.empaqueParaLlevar) ||
      /empaque para llevar/i.test(rawEspecText || '')
    );
    const metodoPago = obsData.metodoPago || (
      (v.observaciones || "").toLowerCase().includes("tarjeta")
        ? "Tarjeta"
        : (v.observaciones || "").toLowerCase().includes("transfer") || (v.observaciones || "").toLowerCase().includes("nequi") || (v.observaciones || "").toLowerCase().includes("davi")
          ? "Transferencia"
          : "Efectivo"
    );
    const estadoPago = obsData.estadoPago || "Pagado";

    // Dynamic products from db details or order metadata
    let productos = [];
    if (Array.isArray(obsData.productos) && obsData.productos.length > 0) {
      productos = obsData.productos.map((p, pIdx) => {
        const itemAdds = (p.adiciones || []).map(a => {
          if (typeof a === 'object' && a !== null) {
            return {
              idAdicion: a.idAdicion || a.id,
              nombre: a.nombre,
              precio: Number(a.precio || 0),
              cantidad: Number(a.cantidad || 1)
            };
          }
          return {
            nombre: String(a),
            precio: 0,
            cantidad: 1
          };
        });

        const addsSum = itemAdds.reduce((s, a) => s + (Number(a.precio || 0) * Number(a.cantidad || 1)), 0);
        const pQty = Number(p.cantidad || 1);
        const pUnit = Number(p.precioUnitario || p.precio || 0);
        const pTot = Number(p.total || 0) > 0 ? Number(p.total) : (pUnit + addsSum) * pQty;

        // Buscar detalle relacional en BD para resolver el nombre real del producto del catálogo
        const matchingDetail = (v.detalles || []).find(d =>
          !p.esVarianteBase && Number(d.idVariante) === Number(p.idVariante || p.id)
        ) || (v.detalles || []).find(d =>
          Number(d.idVariante) === Number(p.idVariante || p.id)
        ) || (v.detalles || [])[pIdx];

        const rawMatchingProd = matchingDetail?.variante?.producto?.nombre || null;
        const rawMatchingVar = matchingDetail?.variante?.nombre || null;
        const realProductoNombre =
          rawMatchingProd && !rawMatchingProd.startsWith('__SISTEMA') ? rawMatchingProd : null;
        const realVarianteNombre =
          rawMatchingVar && !rawMatchingVar.startsWith('__SISTEMA') && !rawMatchingVar.toLowerCase().includes('- base')
            ? rawMatchingVar
            : null;

        const finalNombre = realProductoNombre || p.nombreProducto || p.nombre || "Producto";
        const resolvedVarNombre = p.esVarianteBase ? null : (realVarianteNombre || p.varianteNombre || (p.nombre !== finalNombre ? p.nombre : null));

        return {
          id: p.id || p.idVariante || p.idDetalleVenta,
          idProducto: p.idProducto || matchingDetail?.variante?.idProducto || null,
          idVariante: p.idVariante || p.id,
          esVarianteBase: Boolean(p.esVarianteBase),
          nombre: finalNombre,
          nombreProducto: realProductoNombre || p.nombreProducto || finalNombre,
          nombreVariante: resolvedVarNombre,
          varianteNombre: resolvedVarNombre,
          varianteDescripcion: p.varianteDescripcion || matchingDetail?.variante?.descripcion || null,
          varianteEspecificaciones: p.varianteEspecificaciones || null,
          varianteCambios: Array.isArray(p.varianteCambios) ? p.varianteCambios : [],
          esVarianteDeEvento: Boolean(p.esVarianteDeEvento || matchingDetail?.variante?.creadaPorEvento || matchingDetail?.variante?.idEvento),
          cantidad: pQty,
          precioUnitario: pUnit,
          total: pTot,
          observaciones: p.observaciones || p.observacion || p.especificaciones || p.nota || "",
          ingredientesRemovidos: Array.isArray(p.ingredientesRemovidos) ? p.ingredientesRemovidos : [],
          personalizaciones: (p.personalizaciones && typeof p.personalizaciones === 'object') ? p.personalizaciones : undefined,
          adiciones: itemAdds
        };
      });
    } else if (v.detalles && v.detalles.length > 0) {
      productos = v.detalles.map(d => {
        const rawJoinedProd = d.variante?.producto?.nombre;
        const rawJoinedVar = d.variante?.nombre;
        const cleanJoinedProd = rawJoinedProd && !rawJoinedProd.startsWith('__SISTEMA') ? rawJoinedProd : null;
        const cleanJoinedVar =
          rawJoinedVar && !rawJoinedVar.startsWith('__SISTEMA') && !rawJoinedVar.toLowerCase().includes('- base')
            ? rawJoinedVar
            : null;
        let pName = cleanJoinedProd || cleanJoinedVar || null;
        let pAdiciones = [];
        let pObs = "";

        if (d.adiciones && d.adiciones.length > 0) {
          pAdiciones = d.adiciones.map(da => ({
            idAdicion: da.idAdicion,
            nombre: da.adicion?.nombre || `Adición #${da.idAdicion}`,
            precio: parseFloat(da.precio !== undefined && da.precio !== null ? da.precio : (da.precioUnitario || da.adicion?.precioAdicion || da.adicion?.precio || 0)),
            cantidad: Number(da.cantidad || 1)
          }));
        }

        if (d.observaciones) {
          try {
            if (typeof d.observaciones === 'string' && d.observaciones.startsWith('{')) {
              const parsedObs = JSON.parse(d.observaciones);
              pName = pName || parsedObs.nombre || parsedObs.nombreProducto;
              pObs = parsedObs.observaciones || parsedObs.observacion || parsedObs.nota || "";
              if (pAdiciones.length === 0 && Array.isArray(parsedObs.adiciones)) {
                pAdiciones = parsedObs.adiciones.map(a => typeof a === 'object' ? a : { nombre: String(a), precio: 0, cantidad: 1 });
              }
            } else {
              pName = pName || d.observaciones;
              pObs = d.observaciones;
            }
          } catch (e) {
            pName = pName || d.observaciones;
            pObs = d.observaciones;
          }
        }

        const addsSum = pAdiciones.reduce((s, a) => s + (Number(a.precio || 0) * Number(a.cantidad || 1)), 0);
        const pQty = Number(d.cantidad || 1);
        const pUnit = parseFloat(d.precioUnitario || 0);
        const pTot = parseFloat(d.subtotal || 0) > 0 ? parseFloat(d.subtotal) : (pUnit + addsSum) * pQty;

        const realProdName = cleanJoinedProd || pName || `Producto #${d.idVariante}`;
        const realVarName = cleanJoinedVar || null;

        return {
          id: d.idDetalleVenta || d.idVariante,
          idProducto: d.variante?.idProducto || null,
          idVariante: d.idVariante,
          esVarianteBase: Boolean(rawJoinedVar && String(rawJoinedVar).toLowerCase().includes('- base')),
          nombre: realProdName,
          nombreProducto: realProdName,
          nombreVariante: realVarName,
          varianteNombre: realVarName,
          varianteDescripcion: d.variante?.descripcion || null,
          esVarianteDeEvento: Boolean(d.variante?.creadaPorEvento || d.variante?.idEvento),
          cantidad: pQty,
          precioUnitario: pUnit,
          total: pTot,
          observaciones: pObs,
          adiciones: pAdiciones
        };
      });
    } else {
      // Sin detalles reales en BD: devolver array vacío (no inventar productos ficticios)
      productos = [];
    }

    let subtotal = parseFloat(v.subtotal) || 0;
    let total = parseFloat(v.total) || 0;
    let descuentoAplicado = parseFloat(v.descuentoAplicado || 0);

    // Si total o subtotal está en 0 en base de datos, calcular de productos o detalles
    const esDevolucion = Boolean(obsData.esDevolucion);
    if (!esDevolucion && (total === 0 || subtotal === 0) && Array.isArray(productos) && productos.length > 0) {
      subtotal = productos.reduce((acc, p) => acc + Number(p.total || 0), 0);
      descuentoAplicado = descuentoAplicado || (subtotal * (Number(obsData.descuentoPorcentaje || 0) / 100));
      total = Math.max(0, subtotal - descuentoAplicado);
    }

    const isMostradorSale = (!clienteObj.idUsuario && !clienteObj.usuario) ||
      (clienteNombre && String(clienteNombre).toLowerCase().includes('mostrador')) ||
      (clienteObj && clienteObj.direccion && String(clienteObj.direccion).toLowerCase().includes('mostrador')) ||
      (!clienteObj.idUsuario);

    // Dynamic extraction of client fidelity
    let clientMeta = {};
    if (clienteObj && clienteObj.direccion) {
      try {
        if (clienteObj.direccion.trim().startsWith('{')) {
          clientMeta = JSON.parse(clienteObj.direccion);
        }
      } catch (e) {
        clientMeta = {};
      }
    }
    const FidelidadService = require('./fidelidadService');
    const fidelidadInfo = isMostradorSale ? {
      tipo: null,
      descuentoPorcentaje: 0,
      comprasCiclo: 0,
      enGracia: false,
      tieneCuenta: false
    } : FidelidadService.evaluarEstadoFidelidad(clientMeta.fidelidad || {
      tipo: clientMeta.tipo || (clienteObj.idUsuario ? 'Nuevo' : 'Mostrador'),
      comprasCiclo: clientMeta.ciclo !== undefined ? Number(clientMeta.ciclo) : (clientMeta.comprasCiclo || 0),
      comprasTotales: clientMeta.comprasTotales || 0,
      fechaInicioNivel: clientMeta.inicio || clientMeta.fechaInicioNivel || null,
      fechaVencimientoNivel: clientMeta.vence || clientMeta.fechaVencimientoNivel || null
    });

    // Calculate clear discount percentage
    let descuentoPorcentaje = obsData.descuentoPorcentaje || (isMostradorSale ? 0 : fidelidadInfo.descuentoPorcentaje) || 0;
    if (descuentoAplicado > 0 && subtotal > 0) {
      descuentoPorcentaje = Math.round((descuentoAplicado / subtotal) * 100);
    } else if (subtotal > total && subtotal > 0) {
      descuentoAplicado = subtotal - total;
      descuentoPorcentaje = Math.round((descuentoAplicado / subtotal) * 100);
    }

    const iva = Math.round(subtotal * 0.19);
    const precioOriginal = esDevolucion ? 0 : (subtotal > total ? subtotal : (total + descuentoAplicado));
    const montoDescuento = descuentoAplicado;

    let estadoStr = 'Pendiente';
    if (v.estadoEntrega === 'PREPARANDO') estadoStr = 'En Preparación';
    else if (v.estadoEntrega === 'LISTO') estadoStr = 'Listo';
    else if (v.estadoEntrega === 'ENTREGADO') estadoStr = 'Completada';
    else if (v.estadoEntrega === 'CANCELADO') estadoStr = 'Anulada';
    else if (v.estadoEntrega) estadoStr = v.estadoEntrega;

    const responsable = v.usuario ? {
      idUsuario: v.usuario.idUsuario,
      nombre: `${v.usuario.nombre} ${v.usuario.apellidos || ''}`.trim(),
      email: v.usuario.email,
      rol: v.usuario.rolInfo?.nombre || (v.usuario.idRol === 1 ? 'Administrador' : v.usuario.idRol === 2 ? 'Cocinero' : v.usuario.idRol === 3 ? 'Vendedor' : 'Empleado'),
      tieneCuenta: true,
      estado: v.usuario.estado || 'Activo'
    } : {
      idUsuario: null,
      nombre: 'Sistema / Online',
      rol: 'Online',
      tieneCuenta: false,
      estado: 'Activo'
    };

    const ultimoCambio = Array.isArray(obsData.historialEstados) && obsData.historialEstados.length > 0
      ? obsData.historialEstados[obsData.historialEstados.length - 1]
      : null;

    const fechaCambioEstado = obsData.fechaCambioEstado || ultimoCambio?.fecha || v.fechaVenta || null;
    const horaEstado = formatColombiaTime(obsData.fechaCambioEstado || ultimoCambio?.fecha) || obsData.horaEstado || ultimoCambio?.hora || horario || '12:00 PM';
    const fechaEntrega = obsData.fechaEntrega
      || obsData.tiemposEstados?.entregado?.fecha
      || (String(v.estadoEntrega || '').toUpperCase() === 'ENTREGADO' ? (obsData.fechaCambioEstado || v.fechaVenta || null) : null);

    const origenColumna = String(v.origen || '').toUpperCase();
    const isOnline = origenColumna ? origenColumna === 'ONLINE' : (
      String(v.tipoVenta || '').toUpperCase() === 'ONLINE' ||
      String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO' ||
      String(obsData.origen || '').toUpperCase() === 'ONLINE' ||
      String(obsData.tipoVenta || '').toUpperCase() === 'ONLINE' ||
      (responsable && responsable.rol === 'Online') ||
      (!v.idUsuario && v.idCliente) ||
      (tipoEntrega === 'Domicilio' && (!v.usuario || v.usuario.idRol === 4))
    );

    const {
      normalizePrincipalPaymentMethod,
      resolveMetodoPagoDetalle
    } = require('../../infrastructure/utils/paymentMethodUtils');
    const origen = isOnline ? 'ONLINE' : 'PUNTO_FISICO';
    const origenNombre = isOnline ? 'Venta Online' : 'Punto Físico';
    const metodoPagoDetalle = resolveMetodoPagoDetalle(obsData, metodoPago);
    const metodoPagoFinal = esDevolucion
      ? metodoPago
      : normalizePrincipalPaymentMethod(metodoPago, isOnline);

    const hybridEst = computeHybridDeliveryEstimate({
      productos,
      tipoEntrega,
      estadoEntrega: v.estadoEntrega,
      estadoCocina: obsData.estadoCocina,
      savedTiempo: v.tiempoEstimadoEntrega || obsData.tiempoEstimadoEntrega || obsData.tiempoEstimado,
      savedModo: obsData.modoTiempoEntrega
    });
    const tiempoEstimadoEntrega = hybridEst.effectiveEstimate;

    return {
      id: v.idVenta,
      idVenta: v.idVenta,
      idDescuento: v.idDescuento || null,
      tipoVenta: v.tipoVenta || (tipoEntrega === 'Domicilio' ? 'DOMICILIO' : 'PUNTO_DE_VENTA'),
      numeroVenta,
      codigoPedido: numeroVenta,
      codigo: numeroVenta,
      numeroOrden: numeroVenta,
      clienteNombre,
      cliente: clienteNombre,
      idCliente: v.idCliente,
      idUsuario: v.idUsuario,
      responsable,
      clienteFidelidad: {
        tipo: isMostradorSale ? null : fidelidadInfo.tipo,
        descuentoPorcentaje: isMostradorSale
          ? 0
          : Math.max(Number(fidelidadInfo.descuentoPorcentaje || 0), Number(fidelidadInfo.descuentoNivel || 0)),
        comprasCiclo: isMostradorSale ? 0 : (fidelidadInfo.comprasCiclo || 0),
        enGracia: isMostradorSale ? false : !!fidelidadInfo.enGracia,
        tieneCuenta: !isMostradorSale && !!clienteObj.idUsuario
      },
      fecha: v.fechaVenta,
      fechaVenta: v.fechaVenta,
      fechaFormatted,
      horario,
      horaEstado,
      horaCambioEstado: horaEstado,
      fechaCambioEstado,
      fechaEntrega,
      tiemposEstados: obsData.tiemposEstados || null,
      historialEstados: obsData.historialEstados || [],
      origen,
      origenNombre,
      tiempoEstimadoEntrega,
      modoTiempoEntrega: hybridEst.modo,
      tiempoAutomaticoSugerido: hybridEst.autoEstimate,
      empaqueParaLlevar,
      tipoEntrega,
      metodoPago: metodoPagoFinal,
      metodo_pago: metodoPagoFinal,
      metodoPagoDetalle: metodoPagoDetalle || null,
      metodo_pago_detalle: metodoPagoDetalle || null,
      metodoPagoNombre: String(metodoPagoFinal || '').toLowerCase().includes('wompi') ? 'Wompi (Pago en Línea)' : metodoPagoFinal,
      estadoPago,
      estadoAprobacion: v.estadoAprobacion || obsData.estadoAprobacion || 'PENDIENTE',
      estadoEntrega: v.estadoEntrega,
      estado: estadoStr,
      subtotal,
      iva,
      precioOriginal,
      descuentoPorcentaje,
      montoDescuento,
      descuentoAplicado,
      total,
      direccion: obsData.direccion || null,
      especificaciones: extractCleanSpecifications(obsData.especificaciones || obsData.nota || ""),
      observaciones: v.observaciones,
      checklistPreparacion: Array.isArray(obsData.checklistPreparacion) ? obsData.checklistPreparacion : null,
      pedidoCompleto: obsData.pedidoCompleto !== undefined ? Boolean(obsData.pedidoCompleto) : null,
      observacionCocina: obsData.observacionCocina || "",
      horaVerificacionCocina: obsData.horaVerificacionCocina || null,
      esDevolucion,
      idDevolucionAsociada: obsData.idDevolucionAsociada || null,
      codigoDevolucionAsociada: obsData.codigoDevolucionAsociada || null,
      idVentaOriginal: obsData.idVentaOriginal || null,
      codigoVentaOriginal: obsData.codigoVentaOriginal || null,
      telefono: obsData.telefono || obsData.celular || clienteUser?.telefono || null,
      productos,
      detalles: (v.detalles || []).map(d => {
        const plain = typeof d?.toJSON === 'function' ? d.toJSON() : { ...d };
        const varName = String(plain?.variante?.nombre || '');
        const prodName = String(plain?.variante?.producto?.nombre || '');
        if (Number(plain?.idVariante) === 0 || varName.startsWith('__SISTEMA') || prodName.startsWith('__SISTEMA')) {
          plain.variante = null;
        }
        return plain;
      })
    };
  }

  static _applyFilters(where, filterObj = {}, Op) {
    const { periodo, estado } = filterObj;
    const range = getColombiaPeriodRange(periodo, {
      year: filterObj.year,
      startDate: filterObj.fechaInicio || filterObj.startDate || filterObj.desde,
      endDate: filterObj.fechaFin || filterObj.endDate || filterObj.hasta
    });

    if (range.start || range.end) {
      const fechaFilter = {};
      if (range.start) fechaFilter[Op.gte] = range.start;
      if (range.end) fechaFilter[Op.lte] = range.end;
      where.fechaVenta = fechaFilter;
    }

    if (estado && estado !== 'Todos') {
      const eNorm = String(estado).toLowerCase().trim();
      if (eNorm === 'pendiente' || eNorm === 'pendientes') {
        where.estadoEntrega = { [Op.in]: ['PENDIENTE', 'Pendiente'] };
      } else if (eNorm === 'en preparación' || eNorm === 'en preparacion' || eNorm === 'en cocina' || eNorm === 'preparando') {
        where.estadoEntrega = { [Op.in]: ['PREPARANDO', 'En Preparación'] };
      } else if (eNorm === 'listo' || eNorm === 'listos') {
        where.estadoEntrega = { [Op.in]: ['LISTO', 'Listo', 'Listos'] };
      } else if (eNorm === 'completada' || eNorm === 'completadas' || eNorm === 'entregado') {
        where.estadoEntrega = { [Op.in]: ['ENTREGADO', 'LISTO', 'Completada'] };
      } else if (eNorm === 'anulada' || eNorm === 'cancelada') {
        where.estadoEntrega = { [Op.in]: ['CANCELADO', 'Anulada'] };
      }
    }

    const andClauses = [];
    if (!filterObj.includeAbandonedWompi) {
      andClauses.push(...buildExcludeUnpaidWompiClauses(Op));
    }
    if (filterObj.scopeClienteId) {
      andClauses.push({ idCliente: Number(filterObj.scopeClienteId) });
    } else if (filterObj.scopeUsuarioId) {
      andClauses.push({ idUsuario: Number(filterObj.scopeUsuarioId) });
    }

    if (filterObj.origen && filterObj.origen !== 'Todos') {
      const oNorm = String(filterObj.origen).toUpperCase().trim();
      if (oNorm === 'ONLINE' || oNorm.includes('ONLINE')) {
        andClauses.push({
          [Op.or]: [
            { tipoVenta: 'DOMICILIO' },
            { observaciones: { [Op.like]: '%"origen":"ONLINE"%' } }
          ]
        });
      } else if (oNorm === 'POS' || oNorm.includes('FISIC') || oNorm.includes('FÍSIC')) {
        andClauses.push({
          tipoVenta: { [Op.ne]: 'DOMICILIO' },
          [Op.or]: [
            { observaciones: null },
            { observaciones: { [Op.notLike]: '%"origen":"ONLINE"%' } }
          ]
        });
      }
    }

    if (filterObj.tipoEntrega && filterObj.tipoEntrega !== 'Todos') {
      const teNorm = String(filterObj.tipoEntrega).toLowerCase().trim();
      if (teNorm.includes('domicilio')) {
        andClauses.push({
          [Op.or]: [
            { tipoVenta: 'DOMICILIO' },
            { observaciones: { [Op.like]: '%Domicilio%' } }
          ]
        });
      } else if (teNorm.includes('mesa') || teNorm.includes('local') || teNorm.includes('recoger')) {
        andClauses.push({
          tipoVenta: { [Op.ne]: 'DOMICILIO' }
        });
      }
    }

    if (filterObj.metodoPago && filterObj.metodoPago !== 'Todos') {
      const mpNorm = String(filterObj.metodoPago).trim();
      andClauses.push({ observaciones: { [Op.like]: `%${mpNorm}%` } });
    }

    if (filterObj.search && String(filterObj.search).trim()) {
      const q = String(filterObj.search).trim();
      const digitsOnly = q.replace(/\D/g, '');
      const searchOr = [
        { observaciones: { [Op.like]: `%${q}%` } },
        { '$cliente.usuario.nombre$': { [Op.like]: `%${q}%` } },
        { '$cliente.usuario.apellidos$': { [Op.like]: `%${q}%` } },
        { '$cliente.usuario.numeroDocumento$': { [Op.like]: `%${q}%` } },
        { '$usuario.nombre$': { [Op.like]: `%${q}%` } }
      ];
      if (digitsOnly && /^\d+$/.test(digitsOnly)) {
        searchOr.push({ idVenta: Number(digitsOnly) });
      }
      andClauses.push({ [Op.or]: searchOr });
    }

    if (andClauses.length > 0) {
      where[Op.and] = [...(where[Op.and] || []), ...andClauses];
    }
  }

  static async getAll(filter = {}) {
    // Liberar inventario de órdenes Wompi abandonadas (>30 min) en segundo plano (máx. 1 vez cada 5 min)
    this.expirarVentasWompiAbandonadas().catch(() => {});

    const filterObj = typeof filter === 'string' ? { periodo: filter } : (filter || {});
    const { isPaginated, page, limit, offset } = parsePaginationParams(filterObj, { defaultLimit: 5, maxLimit: 100 });
    const { Op } = require('sequelize');
    const where = {};
    this._applyFilters(where, filterObj, Op);

    const { Variante, Product, DetalleVentaAdicion, Adicion } = require('../../persistence/models');
    const include = [
      { 
        model: Cliente, 
        as: 'cliente',
        include: [{ model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos', 'numeroDocumento'] }]
      },
      { 
        model: User, 
        as: 'usuario', 
        attributes: ['idUsuario', 'nombre', 'apellidos', 'email', 'estado', 'idRol'],
        include: [{ model: Role, as: 'rolInfo', attributes: ['idRol', 'nombre'] }]
      },
      { 
        model: DetalleVentaProducto, 
        as: 'detalles',
        separate: true,
        include: [
          {
            model: Variante,
            as: 'variante',
            attributes: ['idVariante', 'idProducto', 'nombre', 'descripcion', 'creadaPorEvento', 'idEvento'],
            include: [
              {
                model: Product,
                as: 'producto',
                attributes: ['idProducto', 'nombre', 'precio', 'categoria']
              }
            ]
          },
          {
            model: DetalleVentaAdicion,
            as: 'adiciones',
            separate: true,
            include: [{ model: Adicion, as: 'adicion', attributes: ['idInsumo', 'nombre', 'precioAdicion'] }]
          }
        ]
      }
    ];

    if (isPaginated) {
      const { count, rows } = await Venta.findAndCountAll({
        where,
        include,
        order: [['idVenta', 'DESC']],
        limit,
        offset,
        distinct: true,
        subQuery: false
      });
      const formatted = rows.map(v => this.formatVenta(v));
      return buildPaginatedResponse(formatted, count, page, limit);
    }

    const ventas = await Venta.findAll({
      where,
      include,
      order: [['idVenta', 'DESC']],
      subQuery: false
    });

    return ventas.map(v => this.formatVenta(v));
  }

  static async getStats(filter = {}) {
    const filterObj = typeof filter === 'string' ? { periodo: filter } : (filter || {});
    const { Op } = require('sequelize');
    const where = {};
    this._applyFilters(where, filterObj, Op);

    const range = getColombiaPeriodRange(filterObj.periodo, {
      year: filterObj.year,
      startDate: filterObj.fechaInicio || filterObj.startDate || filterObj.desde,
      endDate: filterObj.fechaFin || filterObj.endDate || filterObj.hasta
    });

    // Consulta ligera sin JOINs para estadísticas (evita consumo innecesario de RAM en Render)
    const rows = await Venta.findAll({
      where,
      attributes: [
        'idVenta',
        'idCliente',
        'fechaVenta',
        'tipoVenta',
        'origen',
        'subtotal',
        'total',
        'descuentoAplicado',
        'estadoEntrega',
        'estadoAprobacion',
        'observaciones'
      ],
      raw: true
    });

    const estadoFiltroNorm = String(filterObj.estado || '').toLowerCase().trim();
    const includeNonApprovedByExplicitFilter =
      estadoFiltroNorm === 'anulada' ||
      estadoFiltroNorm === 'cancelada' ||
      estadoFiltroNorm === 'pendiente' ||
      estadoFiltroNorm === 'pendientes';

    let totalVentasSum = 0;
    let descOtorgadosSum = 0;
    let pedidosCount = 0;
    const uniqueClients = new Set();
    const uniqueDaysSet = new Set();
    let earliestMs = Infinity;

    for (const v of rows) {
      if (isUnpaidWompiIntention(v)) continue;
      let obsData = {};
      if (v.observaciones && typeof v.observaciones === 'string' && v.observaciones.trim().startsWith('{')) {
        try {
          obsData = JSON.parse(v.observaciones);
        } catch {
          obsData = {};
        }
      }
      if (obsData.esDevolucion || obsData.wompiAbandonada === true) continue;

      // Alinear contablemente con DashboardService.isValidCompletedOrApprovedSale:
      // excluir ventas anuladas/canceladas y ventas con pago pendiente o rechazado
      if (!includeNonApprovedByExplicitFilter) {
        const entrega = String(v.estadoEntrega || '').toUpperCase().trim();
        if (entrega === 'CANCELADO' || entrega === 'RECHAZADO') continue;
        const aprob = String(v.estadoAprobacion || '').toUpperCase().trim();
        if (aprob === 'PENDIENTE' || aprob === 'RECHAZADO') continue;
      }

      pedidosCount++;
      const subtotal = parseFloat(v.subtotal || 0);
      const total = parseFloat(v.total || 0);
      let desc = parseFloat(v.descuentoAplicado || 0);
      if (desc <= 0 && subtotal > total) desc = subtotal - total;
      const descEvento = Math.max(0, Number(obsData.descuentoEvento || 0));

      totalVentasSum += total;
      descOtorgadosSum += Math.max(0, desc) + descEvento;

      const rawCliName = String(obsData.clienteNombre || '').toLowerCase().trim();
      const isAnonymousWalkIn =
        !v.idCliente ||
        rawCliName === 'cliente mostrador' ||
        rawCliName === 'cliente general' ||
        rawCliName === 'mostrador';
      const clientKey = isAnonymousWalkIn
        ? `mostrador:${v.idVenta}`
        : `cli:${v.idCliente}`;
      uniqueClients.add(clientKey);

      if (v.fechaVenta) {
        const dayIso = getColombiaDateISO(v.fechaVenta);
        if (dayIso) uniqueDaysSet.add(dayIso);
        const t = new Date(v.fechaVenta).getTime();
        if (!Number.isNaN(t) && t < earliestMs) earliestMs = t;
      }
    }

    const totalVentasRounded = Math.round(totalVentasSum);
    const descOtorgadosRounded = Math.round(descOtorgadosSum);
    const ticketPromedioVal = pedidosCount > 0 ? Math.round(totalVentasSum / pedidosCount) : 0;
    const uniqueClientsCount = uniqueClients.size;
    const uniqueDays = uniqueDaysSet.size || 1;
    const frecuenciaVal = pedidosCount > 0 ? parseFloat((pedidosCount / Math.max(1, uniqueClientsCount)).toFixed(1)) : 0.0;
    const tasaDescuentoVal = (totalVentasSum + descOtorgadosSum) > 0
      ? parseFloat(((descOtorgadosSum / (totalVentasSum + descOtorgadosSum)) * 100).toFixed(1))
      : 0.0;

    // Frecuencia diaria alineada con DashboardService (horario Colombia)
    const pNorm = String(range.periodo || filterObj.periodo || '').toLowerCase().trim();
    let frecuenciaDiariaNum = 0;
    if (pedidosCount > 0) {
      if (pNorm === 'hoy') {
        frecuenciaDiariaNum = pedidosCount;
      } else if (pNorm === '7_dias' || pNorm === '7dias' || pNorm === 'ultima_semana' || pNorm === 'semana') {
        frecuenciaDiariaNum = parseFloat((pedidosCount / 7).toFixed(1));
      } else if (pNorm === 'este_mes' || pNorm === 'mes' || pNorm === 'mes_actual' || pNorm === 'mes actual') {
        frecuenciaDiariaNum = parseFloat((pedidosCount / Math.max(1, range.day)).toFixed(1));
      } else if (pNorm === 'mes_anterior' || pNorm === 'mes anterior') {
        const prevMY = shiftMonthYear(range.currentYear, range.month, -1);
        const daysPrevMonth = getDaysInMonth(prevMY.year, prevMY.month);
        frecuenciaDiariaNum = parseFloat((pedidosCount / Math.max(1, daysPrevMonth)).toFixed(1));
      } else if (range.start && range.end) {
        const endIso = getColombiaDateISO(range.end);
        const effectiveEndISO = endIso > range.todayISO ? range.todayISO : endIso;
        const startIso = getColombiaDateISO(range.start);
        const spanDays = Math.max(1, (diffCalendarDaysColombia(effectiveEndISO, startIso) ?? 0) + 1);
        frecuenciaDiariaNum = parseFloat((pedidosCount / spanDays).toFixed(1));
      } else if (Number.isFinite(earliestMs)) {
        const spanAll = Math.max(1, (diffCalendarDaysColombia(range.todayISO, getColombiaDateISO(earliestMs)) ?? 0) + 1);
        frecuenciaDiariaNum = parseFloat((pedidosCount / spanAll).toFixed(1));
      } else {
        frecuenciaDiariaNum = parseFloat((pedidosCount / uniqueDays).toFixed(1));
      }
    }

    return {
      totalVentas: totalVentasRounded,
      totalVentasFormatted: `$${totalVentasRounded.toLocaleString('es-CO')}`,
      pedidosCount,
      ticketPromedio: ticketPromedioVal,
      ticketPromedioFormatted: `$${ticketPromedioVal.toLocaleString('es-CO')}`,
      totalDescuentos: descOtorgadosRounded,
      totalDescuentosFormatted: `$${descOtorgadosRounded.toLocaleString('es-CO')}`,
      frecuenciaCompra: frecuenciaVal,
      frecuenciaDiaria: frecuenciaDiariaNum.toFixed(1),
      uniqueDays,
      tasaDescuento: tasaDescuentoVal,
      uniqueClientsCount
    };
  }

  static async getById(id) {
    const { Variante, Product, FichaTecnica, DetalleFichaInsumo, Insumo, DetalleVentaAdicion, Adicion } = require('../../persistence/models');
    const v = await Venta.findByPk(id, {
      include: [
        { 
          model: Cliente, 
          as: 'cliente',
          include: [{ model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] }]
        },
        { model: User, as: 'usuario', attributes: ['idUsuario', 'nombre', 'apellidos'] },
        { 
          model: DetalleVentaProducto, 
          as: 'detalles',
          include: [
            {
              model: Variante,
              as: 'variante',
              include: [
                {
                  model: Product,
                  as: 'producto',
                  include: [
                    {
                      model: FichaTecnica,
                      as: 'fichaTecnica',
                      include: [
                        {
                          model: DetalleFichaInsumo,
                          as: 'detalles',
                          include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida'] }]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              model: DetalleVentaAdicion,
              as: 'adiciones',
              include: [{ model: Adicion, as: 'adicion' }]
            }
          ]
        }
      ]
    });
    if (!v) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
      throw error;
    }
    return this.formatVenta(v);
  }

  static async getOrCreateClienteMostrador() {
    const { Op } = require('sequelize');
    let mostrador = await Cliente.findOne({
      where: {
        idUsuario: null,
        estado: 1,
        [Op.or]: [
          { direccion: { [Op.like]: '%"esMostrador":true%' } },
          { direccion: { [Op.like]: '%"apellidos":"Mostrador"%' } },
          { direccion: { [Op.like]: '%Cliente Mostrador%' } }
        ]
      }
    });

    if (!mostrador) {
      const metaStr = JSON.stringify({
        nombre: 'Cliente',
        apellidos: 'Mostrador',
        esMostrador: true,
        tipo: 'Nuevo',
        descuentoPorcentaje: 0,
        estado: 'Activo'
      });
      mostrador = await Cliente.create({
        idUsuario: null,
        direccion: metaStr,
        estado: 1
      });
    }
    return mostrador;
  }

  static async create(data) {
    let targetUserId = data.idUsuario || data.userId;
    let earlyObs = {};
    if (typeof data.observaciones === 'string' && data.observaciones.startsWith('{')) {
      try { earlyObs = JSON.parse(data.observaciones); } catch (e) {}
    } else if (typeof data.observaciones === 'object' && data.observaciones !== null) {
      earlyObs = data.observaciones;
    }
    // Seguridad (AUD-005): esDevolucion solo se admite mediante bandera interna confiable desde DevolucionService
    const esDevolucion = Boolean(data._trustedDevolucion === true);

    // Strict Validation 1: Check user provided
    if (!targetUserId) {
      const error = new Error('No se especificó un usuario para realizar el pedido.');
      error.statusCode = 400;
      throw error;
    }

    // Strict Validation 2: Check user exists in DB
    const userObj = await User.findByPk(targetUserId, {
      include: [{ model: Role, as: 'rolInfo' }]
    });
    if (!userObj) {
      const error = new Error('El usuario especificado no existe en el sistema.');
      error.statusCode = 404;
      throw error;
    }

    // Strict Validation 3: Check user is ACTIVE
    if (!esDevolucion && (userObj.estado === 'INACTIVO' || userObj.estado === '0' || userObj.estado === 0)) {
      const error = new Error('Tu usuario está inactivo y no puedes realizar pedidos. Comunícate con el administrador para activar tu cuenta.');
      error.statusCode = 403;
      throw error;
    }

    // Determine if the operating user is sales staff (Administrador idRol=1 o Vendedor idRol=3, nunca Cocinero idRol=2 ni Cliente idRol=4)
    const userRoleName = String(userObj.rolInfo ? userObj.rolInfo.nombre : '').toLowerCase().trim();
    const isStaff = (
      Number(userObj.idRol) === 1 ||
      Number(userObj.idRol) === 3 ||
      userRoleName.includes('admin') ||
      userRoleName.includes('vendedor') ||
      userRoleName.includes('cajero')
    );

    let finalClienteId = null;

    if (esDevolucion && data.idCliente) {
      const targetClienteDev = await Cliente.findByPk(data.idCliente);
      if (!targetClienteDev) {
        const error = new Error('El cliente asociado a la devolución no existe.');
        error.statusCode = 404;
        throw error;
      }
      finalClienteId = targetClienteDev.idCliente;
    } else if (isStaff) {
      // Staff (Vendedor/Admin) creating POS sale -> seller is employee, NOT customer
      if (data.idCliente) {
        const targetCliente = await Cliente.findByPk(data.idCliente, {
          include: [{ model: User, as: 'usuario' }]
        });
        if (!targetCliente) {
          const error = new Error('El cliente seleccionado no existe en el sistema.');
          error.statusCode = 404;
          throw error;
        }

        let metaCli = {};
        if (targetCliente.direccion && targetCliente.direccion.trim().startsWith('{')) {
          try { metaCli = JSON.parse(targetCliente.direccion); } catch (e) { metaCli = {}; }
        }

        const isCliInactive = 
          targetCliente.estado === 0 || 
          targetCliente.estado === false || 
          metaCli.estado === 'Inactivo' || 
          metaCli.estado === 0 ||
          (targetCliente.usuario && (
            String(targetCliente.usuario.estado).toUpperCase() === 'INACTIVO' ||
            targetCliente.usuario.estado === 0 ||
            targetCliente.usuario.estado === false
          ));

        if (isCliInactive) {
          const clientDisplay = targetCliente.usuario
            ? `${targetCliente.usuario.nombre} ${targetCliente.usuario.apellidos || ''}`.trim()
            : (metaCli.nombre ? `${metaCli.nombre} ${metaCli.apellidos || ''}`.trim() : 'seleccionado');
          const error = new Error(`El cliente "${clientDisplay}" se encuentra inactivo y no tiene permitido realizar compras.`);
          error.statusCode = 400;
          throw error;
        }

        const isCliPending = targetCliente.usuario && String(targetCliente.usuario.estado).toUpperCase() === 'PENDIENTE';
        if (isCliPending) {
          const clientDisplay = `${targetCliente.usuario.nombre} ${targetCliente.usuario.apellidos || ''}`.trim();
          const error = new Error(`El cliente "${clientDisplay}" tiene su cuenta pendiente de activación y no puede realizar compras hasta activar su acceso.`);
          error.statusCode = 400;
          throw error;
        }

        finalClienteId = targetCliente.idCliente;
      } else {
        const mostrador = await this.getOrCreateClienteMostrador();
        finalClienteId = mostrador.idCliente;
      }
    } else {
      // Regular customer placing an order online
      let clienteObj = await Cliente.findOne({ 
        where: { idUsuario: targetUserId },
        include: [{ model: User, as: 'usuario' }]
      });
      if (!clienteObj) {
        clienteObj = await Cliente.create({
          idUsuario: targetUserId,
          direccion: data.direccion || '',
          estado: 1
        });
      }

      let clientMeta = {};
      if (clienteObj.direccion && clienteObj.direccion.trim().startsWith('{')) {
        try { clientMeta = JSON.parse(clienteObj.direccion); } catch (e) { clientMeta = {}; }
      }

      const isOnlineInactive = 
        clienteObj.estado === 0 || 
        clienteObj.estado === false || 
        clientMeta.estado === 'Inactivo' || 
        clientMeta.estado === 0 ||
        userObj.estado === 'INACTIVO' ||
        userObj.estado === 0 ||
        userObj.estado === '0';

      if (isOnlineInactive) {
        const error = new Error('No puedes realizar el pedido porque tu cuenta de cliente se encuentra inactiva. Comunícate con la administración para reactivar tu cuenta.');
        error.statusCode = 403;
        throw error;
      }

      finalClienteId = clienteObj.idCliente;
    }

    // Determinar y normalizar tipoVenta (PUNTO_DE_VENTA vs DOMICILIO)
    const rawTipoVenta = String(data.tipoVenta || "").toUpperCase();
    const rawEntrega = String(data.tipoEntrega || (data.mesa ? "En Mesa" : "")).toLowerCase();
    let resolvedTipoVenta = "PUNTO_DE_VENTA";

    if (rawTipoVenta.includes("DOMICILIO") || rawTipoVenta.includes("LINEA") || rawEntrega.includes("domicilio")) {
      resolvedTipoVenta = "DOMICILIO";
    } else {
      resolvedTipoVenta = "PUNTO_DE_VENTA";
    }

    // Si es venta rápida (PUNTO_DE_VENTA), asegurar que se asocie al responsable con rol Vendedor o Administrador
    let responsibleUserId = targetUserId;
    if (resolvedTipoVenta === "PUNTO_DE_VENTA") {
      if (!isStaff && !esDevolucion) {
        const { Op } = require('sequelize');
        const sellerUser = await User.findOne({
          include: [{ model: Role, as: 'rolInfo', where: { nombre: { [Op.like]: '%Vendedor%' } } }],
          where: { estado: { [Op.in]: [1, 'ACTIVO', '1'] } }
        }).catch(() => null);

        if (sellerUser) {
          responsibleUserId = sellerUser.idUsuario;
        }
      }
    }

    let parsedObs = {};
    if (typeof data.observaciones === 'string' && data.observaciones.startsWith('{')) {
      try { parsedObs = JSON.parse(data.observaciones); } catch (e) {}
    } else if (typeof data.observaciones === 'object' && data.observaciones !== null) {
      parsedObs = data.observaciones;
    }

    const rawDetails = data.detalles || data.items || [];

    // Seguridad (AUD-004): resolver SIEMPRE precios unitarios, promociones vigentes y adiciones desde la BD (no confiar en montos del cliente)
    const { Insumo, Evento } = require('../../persistence/models');
    const hoyColombia = getColombiaDateISO();
    const eventosVigentesVenta = !esDevolucion
      ? (await Evento.findAll({ where: { estado: 1 } }).catch(() => [])).filter((e) => {
          const ini = extractDateOnlyISO(e.fechaInicio);
          const fin = extractDateOnlyISO(e.fechaFin);
          return (!ini || ini <= hoyColombia) && (!fin || fin >= hoyColombia);
        })
      : [];

    const serverPricedMap = new WeakMap();
    let calculatedSubtotal = 0;
    let totalEventSavings = 0;

    for (const it of rawDetails) {
      const itQty = Math.floor(Number(it.cantidad !== undefined ? it.cantidad : 1));
      if (!Number.isFinite(itQty) || itQty < 1 || itQty > 100) {
        const error = new Error('La cantidad de cada producto debe ser un entero entre 1 y 100.');
        error.statusCode = 400;
        throw error;
      }

      let serverUnitPrice = 0;
      let serverAddsUnitTotal = 0;
      const resolvedAdiciones = [];

      if (!esDevolucion) {
        let idProd = it.idProducto || it.productoId || null;
        let precioVar = null;
        const reqVarId = !it.esVarianteBase ? (it.idVariante || it.varianteId) : null;
        if (reqVarId) {
          const varRow = await Variante.findByPk(reqVarId).catch(() => null);
          if (varRow) {
            idProd = idProd || varRow.idProducto;
            const isDummyBase = String(varRow.nombre || '').toLowerCase().includes('- base');
            if (!isDummyBase && Number(varRow.precio) > 0) {
              precioVar = Number(varRow.precio);
            }
          }
        }
        let precioBase = null;
        let prodBasePrice = null;
        if (idProd) {
          const prodRow = await Product.findByPk(idProd).catch(() => null);
          if (prodRow) {
            prodBasePrice = Number(prodRow.precio || 0);
            precioBase = precioVar !== null ? precioVar : prodBasePrice;
          }
        } else if (precioVar !== null) {
          precioBase = precioVar;
        }

        if (precioBase === null || !(precioBase > 0)) {
          const error = new Error(`No se pudo verificar el precio oficial del producto "${it.nombre || idProd || ''}".`);
          error.statusCode = 400;
          throw error;
        }

        const { resolveBestEventUnitPrice } = require('../../infrastructure/utils/eventPricingUtils');
        serverUnitPrice = resolveBestEventUnitPrice({
          eventosVigentes: eventosVigentesVenta,
          idProducto: idProd,
          precioBase,
          prodBasePrice
        });
        if (precioBase > serverUnitPrice) {
          totalEventSavings += Math.round((precioBase - serverUnitPrice) * itQty);
        }

        const rawAdics = Array.isArray(it.adiciones) ? it.adiciones : (Array.isArray(it.idAdiciones) ? it.idAdiciones : []);
        for (const a of rawAdics) {
          const adId = typeof a === 'object' ? (a.idAdicion || a.idInsumo || a.id) : a;
          const adCant = typeof a === 'object' ? Math.max(1, Math.floor(Number(a.cantidad || 1))) : 1;
          if (!adId) continue;
          const insAd = await Insumo.findByPk(adId).catch(() => null);
          const adPrice = insAd ? Math.max(0, Number(insAd.precioAdicion || 0)) : 0;
          serverAddsUnitTotal += adPrice * adCant;
          resolvedAdiciones.push({
            ...(typeof a === 'object' ? a : { idAdicion: adId }),
            idAdicion: adId,
            cantidad: adCant,
            precio: adPrice
          });
        }
      }

      const itemLineSubtotal = esDevolucion ? 0 : Math.round((serverUnitPrice + serverAddsUnitTotal) * itQty);
      serverPricedMap.set(it, {
        cantidad: itQty,
        precioUnitario: serverUnitPrice,
        addsUnitTotal: serverAddsUnitTotal,
        subtotal: itemLineSubtotal,
        adiciones: resolvedAdiciones
      });
      calculatedSubtotal += itemLineSubtotal;
    }

    const finalSubtotal = esDevolucion ? 0 : Math.round(calculatedSubtotal);
    // Seguridad (AUD-004): nunca confiar en descuento enviado por el cliente; calcular fidelidad estrictamente desde BD
    let finalDescuento = 0;

    const ClienteService = require('./clienteService');
    const isMostradorSale = (!data.idCliente && isStaff) ||
      (data.clienteNombre && String(data.clienteNombre).toLowerCase().includes('mostrador')) ||
      (parsedObs.clienteNombre && String(parsedObs.clienteNombre).toLowerCase().includes('mostrador')) ||
      (!data.idCliente && isStaff);

    if (!esDevolucion && finalClienteId && !isMostradorSale) {
      try {
        const clienteInfo = await ClienteService.getById(finalClienteId);
        if (clienteInfo && clienteInfo.tieneCuenta) {
          // Regla oficial Ficha SENA 3209616: 15% de descuento en la compra siguiente tras cada 3 compras
          const beneficioActivo = Boolean(
            clienteInfo.fidelidad?.descuentoDisponible ?? clienteInfo.descuentoDisponible
          );
          const pct = beneficioActivo
            ? Math.min(15, Math.max(0, Number(clienteInfo.fidelidad?.descuentoPorcentaje ?? clienteInfo.descuentoPorcentaje ?? 15)))
            : 0;

          if (pct > 0) {
            finalDescuento = Math.round(finalSubtotal * (pct / 100));
          }
        }
      } catch (e) {
        // Continue without blocking
      }
    }

    const finalTotal = esDevolucion ? 0 : Math.max(0, finalSubtotal - finalDescuento);

    // Ítem #123: origen de la venta (ONLINE = tienda web, PUNTO_FISICO = POS / mostrador)
    const rawOrigen = String(data.origen || parsedObs.origen || '').toUpperCase().replace(/\s+/g, '_');
    let origenVenta;
    if (rawOrigen === 'ONLINE' || rawOrigen === 'WEB') {
      origenVenta = 'ONLINE';
    } else if (rawOrigen.includes('PUNTO') || rawOrigen.includes('FISICO') || rawOrigen === 'POS') {
      origenVenta = 'PUNTO_FISICO';
    } else {
      origenVenta = isStaff ? 'PUNTO_FISICO' : 'ONLINE';
    }
    // Un cliente autenticado (no staff) nunca puede registrar ventas como punto físico
    if (!isStaff && !esDevolucion) origenVenta = 'ONLINE';

    // Ítem #122: las ventas online solo admiten pago electrónico con Wompi
    const metodoPagoSolicitado = String(data.metodoPago || parsedObs.metodoPago || '').trim();
    if (!esDevolucion && origenVenta === 'ONLINE' && (!metodoPagoSolicitado || metodoPagoSolicitado.toLowerCase() === 'efectivo')) {
      const error = new Error('Las ventas online únicamente admiten pago electrónico a través de Wompi.');
      error.statusCode = 400;
      throw error;
    }

    // Validar que ninguna variante seleccionada en pedidos online esté inactiva
    if (!esDevolucion && origenVenta === 'ONLINE' && Array.isArray(rawDetails) && rawDetails.length > 0) {
      for (const itemCheck of rawDetails) {
        if (itemCheck.esVarianteBase) continue;
        const reqVarId = itemCheck.idVariante || itemCheck.varianteId;
        if (!reqVarId) continue;
        const varRow = await Variante.findByPk(reqVarId).catch(() => null);
        if (
          varRow &&
          !String(varRow.nombre || '').toLowerCase().includes('- base') &&
          Number(varRow.estado) === 0
        ) {
          const error = new Error(`La variante "${varRow.nombre}" está inactiva y no se puede ordenar en este momento.`);
          error.statusCode = 400;
          throw error;
        }
      }
    }

    // Ítem #124: tiempo estimado de entrega híbrido (Automático según fichas técnicas + modalidad o Manual si se especifica)
    const initialItemsForPrep = (Array.isArray(data.productos) && data.productos.length > 0)
      ? data.productos
      : (Array.isArray(parsedObs.productos) && parsedObs.productos.length > 0)
        ? parsedObs.productos
        : rawDetails;
    const initialTipoEntrega = data.tipoEntrega || parsedObs.tipoEntrega || (origenVenta === 'ONLINE' ? 'Domicilio' : (data.mesa ? 'En Mesa' : 'Recoger'));
    const initialHybridEst = computeHybridDeliveryEstimate({
      productos: initialItemsForPrep,
      tipoEntrega: initialTipoEntrega,
      estadoEntrega: 'PENDIENTE',
      savedTiempo: data.tiempoEstimadoEntrega || parsedObs.tiempoEstimadoEntrega || '',
      savedModo: data.modoTiempoEntrega || parsedObs.modoTiempoEntrega || ''
    });
    const tiempoEstimadoEntregaVenta = String(initialHybridEst.effectiveEstimate).trim().slice(0, 60);

    // Ítem #11: el empaque para llevar es independiente del tipo de entrega
    const empaqueParaLlevar = Boolean(
      data.empaqueParaLlevar || parsedObs.empaqueParaLlevar ||
      (data.especificaciones && typeof data.especificaciones === 'object' && data.especificaciones.empaqueParaLlevar)
    );

    const now = new Date();
    const formattedHorario = formatColombiaTime(now);
    const formattedHorarioExacto = formatColombiaTimeWithSeconds(now);

    const obsObj = {
      horario: data.horario || parsedObs.horario || formattedHorario,
      tipoEntrega: data.tipoEntrega || parsedObs.tipoEntrega || (data.mesa ? "En Mesa" : "Recoger"),
      metodoPago: data.metodoPago || parsedObs.metodoPago || "Efectivo",
      direccion: data.direccion || parsedObs.direccion || "Recoger en Local",
      estadoPago: data.estadoPago || parsedObs.estadoPago || "Pagado",
      codigoPedido: data.codigoPedido || parsedObs.codigoPedido || (esDevolucion ? undefined : `VEN-${String(Date.now()).slice(-4)}`),
      clienteNombre: sanitizeShortName(data.clienteNombre || parsedObs.clienteNombre || `${userObj.nombre} ${userObj.apellidos || ''}`.trim(), 80),
      productos: (Array.isArray(data.productos) && data.productos.length > 0)
        ? data.productos
        : (Array.isArray(parsedObs.productos) && parsedObs.productos.length > 0)
          ? parsedObs.productos
          : rawDetails.map(it => {
              const itPrice = Number(it.precioUnitario || it.precio || 0);
              const itQty = Number(it.cantidad || 1);
              const itAdds = Array.isArray(it.adiciones)
                ? it.adiciones.reduce((s, a) => s + (Number(a.precio || a.precioUnitario || 0)), 0)
                : 0;
              return {
                idProducto: it.idProducto || it.productoId || null,
                idVariante: it.idVariante || it.varianteId || null,
                esVarianteBase: Boolean(it.esVarianteBase),
                nombre: it.nombre || it.observaciones || it.observacion || "Producto",
                varianteNombre: it.varianteNombre || null,
                varianteDescripcion: it.varianteDescripcion || null,
                varianteEspecificaciones: it.varianteEspecificaciones || null,
                varianteCambios: Array.isArray(it.varianteCambios) ? it.varianteCambios : [],
                esVarianteDeEvento: Boolean(it.esVarianteDeEvento),
                cantidad: itQty,
                precioUnitario: itPrice,
                total: esDevolucion ? 0 : (Number(it.subtotal || it.total) > 0 ? Number(it.subtotal || it.total) : (itPrice + itAdds) * itQty),
                observaciones: it.observacion || it.observaciones || "",
                ingredientesRemovidos: Array.isArray(it.ingredientesRemovidos) ? it.ingredientesRemovidos : [],
                personalizaciones: (it.personalizaciones && typeof it.personalizaciones === 'object') ? it.personalizaciones : undefined,
                adiciones: it.adiciones || it.idAdiciones || []
              };
            }),
      especificaciones: extractCleanSpecifications(
        data.especificaciones !== undefined
          ? data.especificaciones
          : (data.observacion !== undefined
            ? data.observacion
            : (parsedObs.especificaciones !== undefined
              ? parsedObs.especificaciones
              : (parsedObs.nota !== undefined
                ? parsedObs.nota
                : "")))
      ).replace(/\b(?:\d[ -]*?){13,19}\b/g, (match) => {
        const digits = match.replace(/\D/g, '');
        return digits.length >= 13 && digits.length <= 19 ? `**** **** **** ${digits.slice(-4)}` : match;
      }),
      efectivoConCuanto: parsedObs.efectivoConCuanto || (data.datosPago ? data.datosPago.efectivoConCuanto : null) || "",
      vueltoEfectivo: parsedObs.vueltoEfectivo || (data.datosPago ? data.datosPago.vueltoEfectivo : null) || 0,
      transferenciaReferencia: parsedObs.transferenciaReferencia || (data.datosPago ? data.datosPago.transferReferencia : null) || "",
      transferBanco: parsedObs.transferBanco || (data.datosPago ? data.datosPago.transferBanco : null) || "",
      tarjetaNumero: (() => {
        // Seguridad PCI-DSS (AUD-008): nunca almacenar PAN completo de 13-19 dígitos; conservar únicamente últimos 4 dígitos
        const rawCard = String(
          parsedObs.tarjetaNumero ||
          parsedObs.tarjetaUltimos4 ||
          (data.datosPago ? (data.datosPago.tarjetaUltimos4 || data.datosPago.tarjetaNumero) : '') ||
          ''
        ).trim();
        if (!rawCard) return '';
        const digits = rawCard.replace(/\D/g, '');
        if (digits.length >= 12) return `**** **** **** ${digits.slice(-4)}`;
        if (digits.length >= 4) return `**** ${digits.slice(-4)}`;
        return rawCard.slice(0, 20);
      })(),
      tarjetaVoucher: String(
        parsedObs.tarjetaVoucher ||
        (data.datosPago ? data.datosPago.tarjetaVoucher : '') ||
        ''
      ).replace(/\b(?:\d[ -]*?){13,19}\b/g, '').trim().slice(0, 40),
      telefono: data.telefono || parsedObs.telefono || "",
      mesa: data.mesa || parsedObs.mesa || null,
      esDevolucion,
      idDevolucionAsociada: data.idDevolucionAsociada || parsedObs.idDevolucionAsociada || null,
      codigoDevolucionAsociada: data.codigoDevolucionAsociada || parsedObs.codigoDevolucionAsociada || null,
      idVentaOriginal: data.idVentaOriginal || parsedObs.idVentaOriginal || null,
      codigoVentaOriginal: data.codigoVentaOriginal || parsedObs.codigoVentaOriginal || null,
      aprobadoPorUsuarioId: data.aprobadoPorUsuarioId || parsedObs.aprobadoPorUsuarioId || null,
      ...(parsedObs.wompiReference ? { wompiReference: parsedObs.wompiReference, esIntencionWompi: true } : {}),
      ...(parsedObs.moneda ? { moneda: parsedObs.moneda } : {}),
      ...(parsedObs.fechaIntencion ? { fechaIntencion: parsedObs.fechaIntencion } : {}),
      ...(totalEventSavings > 0 ? { descuentoEvento: Math.round(totalEventSavings) } : {}),
      origen: origenVenta,
      tiempoEstimadoEntrega: tiempoEstimadoEntregaVenta,
      empaqueParaLlevar,
      estadoCocina: 'EN_COLA',
      horaEstado: formattedHorario,
      horaExactaEstado: formattedHorarioExacto,
      fechaCambioEstado: now.toISOString(),
      tiemposEstados: {
        enCola: {
          estado: 'En Cola',
          hora: formattedHorario,
          horaExacta: formattedHorarioExacto,
          fecha: now.toISOString()
        }
      },
      historialEstados: [
        {
          estado: 'PENDIENTE',
          etiqueta: 'En Cola',
          hora: formattedHorario,
          horaExacta: formattedHorarioExacto,
          fecha: now.toISOString()
        }
      ]
    };

    // Las ventas online no pueden autodeclararse pagadas ni aprobadas (AUD-005): quedan PENDIENTE hasta Wompi o aprobación staff
    if (!isStaff && !esDevolucion) {
      obsObj.estadoPago = 'Pendiente';
    }

    const esPOS = isStaff && resolvedTipoVenta === 'PUNTO_DE_VENTA' && origenVenta === 'PUNTO_FISICO';
    const esPagado = isStaff && String(obsObj.estadoPago || data.estadoPago || '').toLowerCase() === 'pagado';
    const esAprobadoExplicito = esDevolucion || (isStaff && (data.estadoAprobacion === 'APROBADO' || parsedObs.estadoAprobacion === 'APROBADO'));

    const finalEstadoAprobacion = (esPOS || esPagado || esAprobadoExplicito)
      ? 'APROBADO'
      : 'PENDIENTE';

    obsObj.estadoAprobacion = finalEstadoAprobacion;

    const finalEstadoEntrega = (!isStaff && !esDevolucion)
      ? 'PENDIENTE'
      : (data.estadoEntrega || data.estado || 'ENTREGADO');
    const upperEstadoEntrega = String(finalEstadoEntrega).toUpperCase();
    if (upperEstadoEntrega === 'ENTREGADO' || upperEstadoEntrega === 'COMPLETADA') {
      obsObj.estadoCocina = 'ENTREGADO';
      obsObj.fechaEntrega = obsObj.fechaEntrega || now.toISOString();
      obsObj.horaEntrega = obsObj.horaEntrega || formattedHorario;
      obsObj.tiemposEstados.entregado = {
        estado: 'Entregado',
        hora: formattedHorario,
        horaExacta: formattedHorarioExacto,
        fecha: obsObj.fechaEntrega
      };
      obsObj.tiempoEstimadoEntrega = 'Entregado';
    }

    const obsStr = JSON.stringify(obsObj);

    const {
      sequelize,
      DetalleVentaAdicion,
      LoteInsumo,
      Trazabilidad,
      ComboProducto: CPModel
    } = require('../../persistence/models');
    const { Op } = require('sequelize');

    // Transacción atómica: valida disponibilidad con stock vigente (FEFO) bajo bloqueo de filas,
    // rechaza con 409 Conflict si falta stock o algún insumo está inactivo/vencido, y descuenta FEFO en la misma transacción.
    const venta = await sequelize.transaction(async (t) => {
      const preparedDetails = [];
      const allDemands = [];

      for (let detailIdx = 0; detailIdx < rawDetails.length; detailIdx++) {
        const d = rawDetails[detailIdx];
        const obsProdItem = Array.isArray(obsObj.productos) ? obsObj.productos[detailIdx] : null;
        let chosenVarianteId = null;

        const prodId = d.idProducto || obsProdItem?.idProducto || (!d.esVarianteBase ? null : d.idVariante);
        const isBaseSelection = Boolean(d.esVarianteBase || obsProdItem?.esVarianteBase);

        // 1. Verificar si d.idVariante existe directamente en la tabla `variante` (cuando NO es selección explícita de producto base)
        if (!isBaseSelection && d.idVariante) {
          try {
            const [matchById] = await sequelize.query(
              'SELECT idVariante, idProducto FROM variante WHERE idVariante = :id LIMIT 1',
              { replacements: { id: d.idVariante }, transaction: t }
            );
            if (matchById && matchById.length > 0) {
              const rowProdId = Number(matchById[0].idProducto);
              if (!prodId || Number(prodId) === rowProdId) {
                chosenVarianteId = matchById[0].idVariante;
              }
            }
          } catch (e) {
            console.warn('Error al consultar idVariante:', e.message);
          }
        }

        // 2. Para selección base o si no coincide idVariante, preferir/crear la variante oculta `- base` del producto
        if (!chosenVarianteId) {
          const lookupProdId = prodId || d.idVariante;
          if (lookupProdId) {
            try {
              const [baseDummy] = await sequelize.query(
                "SELECT idVariante FROM variante WHERE idProducto = :id AND LOWER(nombre) LIKE '%- base%' ORDER BY idVariante ASC LIMIT 1",
                { replacements: { id: lookupProdId }, transaction: t }
              );
              if (baseDummy && baseDummy.length > 0) {
                chosenVarianteId = baseDummy[0].idVariante;
              } else if (isBaseSelection) {
                const [prodInfo] = await sequelize.query(
                  'SELECT idProducto, nombre, precio FROM producto WHERE idProducto = :id LIMIT 1',
                  { replacements: { id: lookupProdId }, transaction: t }
                );
                if (prodInfo && prodInfo.length > 0) {
                  const dummyName = `${String(prodInfo[0].nombre || 'Producto').slice(0, 68)} - base`;
                  await sequelize.query(
                    'INSERT INTO variante (idProducto, nombre, precio, estado) VALUES (:idProducto, :nombre, :precio, 1)',
                    {
                      replacements: { idProducto: prodInfo[0].idProducto, nombre: dummyName, precio: Number(prodInfo[0].precio || 0) },
                      transaction: t
                    }
                  );
                  const [insertedDummy] = await sequelize.query(
                    'SELECT idVariante FROM variante WHERE idProducto = :id ORDER BY idVariante DESC LIMIT 1',
                    { replacements: { id: prodInfo[0].idProducto }, transaction: t }
                  );
                  if (insertedDummy && insertedDummy.length > 0) {
                    chosenVarianteId = insertedDummy[0].idVariante;
                  }
                }
              }

              if (!chosenVarianteId) {
                const [matchByProd] = await sequelize.query(
                  "SELECT idVariante FROM variante WHERE idProducto = :id ORDER BY CASE WHEN LOWER(nombre) LIKE '%- base%' THEN 0 ELSE 1 END, estado DESC, idVariante ASC LIMIT 1",
                  { replacements: { id: lookupProdId }, transaction: t }
                );
                if (matchByProd && matchByProd.length > 0) {
                  chosenVarianteId = matchByProd[0].idVariante;
                }
              }
            } catch (e) {
              console.warn('Error al consultar idProducto en variante:', e.message);
            }
          }
        }

        // 3. Si no hay coincidencia, tomar cualquier variante existente en la base de datos
        if (!chosenVarianteId) {
          try {
            const [anyVar] = await sequelize.query('SELECT idVariante FROM variante LIMIT 1', { transaction: t });
            if (anyVar && anyVar.length > 0) {
              chosenVarianteId = anyVar[0].idVariante;
            }
          } catch (e) {
            console.warn('Error al buscar variante por defecto:', e.message);
          }
        }

        // 4. Si la tabla `variante` está completamente vacía, crear dinámicamente una variante estándar
        if (!chosenVarianteId) {
          try {
            const targetProdId = d.idProducto || d.idVariante || 1;
            const [prodCheck] = await sequelize.query(
              'SELECT idProducto, nombre, precio FROM producto WHERE idProducto = :id LIMIT 1',
              { replacements: { id: targetProdId }, transaction: t }
            );

            let finalProdId = targetProdId;
            let varNombre = d.observaciones || d.observacion || d.nombre || 'Estándar';
            let varPrecio = d.precioUnitario || d.precio || 0;

            if (!prodCheck || prodCheck.length === 0) {
              const [firstProd] = await sequelize.query('SELECT idProducto, nombre, precio FROM producto LIMIT 1', { transaction: t });
              if (firstProd && firstProd.length > 0) {
                finalProdId = firstProd[0].idProducto;
                varNombre = firstProd[0].nombre;
                varPrecio = firstProd[0].precio;
              }
            } else {
              varNombre = prodCheck[0].nombre;
              varPrecio = prodCheck[0].precio;
            }

            await sequelize.query(
              'INSERT INTO variante (idProducto, nombre, precio, estado) VALUES (:idProducto, :nombre, :precio, 1)',
              { replacements: { idProducto: finalProdId, nombre: String(varNombre).slice(0, 80), precio: varPrecio }, transaction: t }
            );

            const [newVarRow] = await sequelize.query(
              'SELECT idVariante FROM variante WHERE idProducto = :idProducto ORDER BY idVariante DESC LIMIT 1',
              { replacements: { idProducto: finalProdId }, transaction: t }
            );
            if (newVarRow && newVarRow.length > 0) {
              chosenVarianteId = newVarRow[0].idVariante;
            }
          } catch (e) {
            console.error('Error creando variante dinámica:', e.message);
          }
        }

        let targetProductId = d.idProducto || obsProdItem?.idProducto || null;
        let selectedVarRow = null;
        if (chosenVarianteId) {
          selectedVarRow = await Variante.findByPk(chosenVarianteId, { transaction: t }).catch(() => null);
          if (!targetProductId && selectedVarRow?.idProducto) targetProductId = selectedVarRow.idProducto;
        }
        if (!targetProductId && d.idVariante) {
          const fallbackVar = await Variante.findByPk(d.idVariante, { transaction: t }).catch(() => null);
          if (fallbackVar?.idProducto) targetProductId = fallbackVar.idProducto;
        }

        const prodRow = targetProductId
          ? await Product.findByPk(targetProductId, { transaction: t }).catch(() => null)
          : null;
        const prodDisplayName = String(prodRow?.nombre || d.nombre || obsProdItem?.nombre || 'Producto').trim();
        const pricedDetail = serverPricedMap.get(d);
        const safeDetalleQty = pricedDetail ? pricedDetail.cantidad : Math.max(1, Math.floor(Number(d.cantidad || 1)));

        if (!esDevolucion) {
          if (prodRow && (Number(prodRow.eliminado) === 1 || Number(prodRow.estado) === 0)) {
            const err = new Error(`No se puede completar la venta: el producto "${prodDisplayName}" no está disponible en este momento.`);
            err.statusCode = 409;
            err.code = 'PRODUCT_UNAVAILABLE';
            err.productosAgotados = [{ idProducto: prodRow.idProducto, nombre: prodDisplayName, motivo: 'PRODUCTO_INACTIVO' }];
            throw err;
          }
          if (
            !isBaseSelection &&
            selectedVarRow &&
            !String(selectedVarRow.nombre || '').toLowerCase().includes('- base') &&
            Number(selectedVarRow.estado) === 0
          ) {
            const err = new Error(`La variante "${selectedVarRow.nombre}" del producto "${prodDisplayName}" está inactiva y no se puede vender en este momento.`);
            err.statusCode = 409;
            err.code = 'VARIANT_UNAVAILABLE';
            err.productosAgotados = [{ idProducto: targetProductId, idVariante: selectedVarRow.idVariante, nombre: `${prodDisplayName} (${selectedVarRow.nombre})`, motivo: 'VARIANTE_INACTIVA' }];
            throw err;
          }
        }

        // Detectar componentes de combo si existen
        let comboItems = [];
        if (prodRow) {
          let cfg = prodRow.configuracionCombo;
          if (typeof cfg === 'string') {
            try { cfg = JSON.parse(cfg); } catch (_) { cfg = null; }
          }
          if (cfg && cfg.esCombo) {
            if (Array.isArray(cfg.productosAsociados) && cfg.productosAsociados.length > 0) {
              comboItems = cfg.productosAsociados;
            } else if (Array.isArray(cfg.itemsCombo) && cfg.itemsCombo.length > 0) {
              comboItems = cfg.itemsCombo;
            }
          }
          if (comboItems.length === 0 && targetProductId) {
            const dbComboItems = await CPModel.findAll({ where: { idCombo: targetProductId }, transaction: t }).catch(() => []);
            if (dbComboItems && dbComboItems.length > 0) {
              comboItems = dbComboItems.map(ci => ({ idProducto: ci.idProducto, cantidad: ci.cantidad }));
            }
          }
        }

        const recipeResult = await VentaService.resolveRecipeOrInsumoForDetail(
          d,
          chosenVarianteId,
          targetProductId,
          { transaction: t, skipNameFallback: comboItems.length > 0 }
        );

        let itemHasInventorySource = false;

        if (recipeResult.directInsumoId) {
          itemHasInventorySource = true;
          allDemands.push({
            idInsumo: Number(recipeResult.directInsumoId),
            rawCantidad: 1,
            recipeUnit: 'und',
            multiplierQty: safeDetalleQty,
            sourceType: 'PRODUCTO_DIRECTO',
            productName: prodDisplayName,
            productId: targetProductId,
            detailItem: d,
            obsProdItem,
            checkMiseEnPlace: true,
            trazabilidadTipo: 'CONSUMO_VENTA',
            trazabilidadDetalleFn: (qtyDesc, unit, insName, ventaId) =>
              `Consumo de ${qtyDesc.toFixed(2)} ${unit} por Venta #${ventaId} (${safeDetalleQty}x ${insName})`
          });
        } else if (comboItems.length > 0) {
          itemHasInventorySource = true;
          for (const ci of comboItems) {
            const childProdId = Number(ci.idProducto || ci.id);
            const childQty = Math.max(1, Number(ci.cantidad || 1)) * safeDetalleQty;
            if (!childProdId || !(childQty > 0)) continue;

            const childProd = await Product.findByPk(childProdId, { transaction: t }).catch(() => null);
            if (!esDevolucion && childProd && (Number(childProd.eliminado) === 1 || Number(childProd.estado) === 0)) {
              const err = new Error(`No se puede completar la venta: el combo "${prodDisplayName}" incluye "${childProd.nombre}", que no está disponible.`);
              err.statusCode = 409;
              err.code = 'PRODUCT_UNAVAILABLE';
              err.productosAgotados = [{ idProducto: targetProductId, nombre: prodDisplayName, motivo: 'COMPONENTE_COMBO_INACTIVO' }];
              throw err;
            }

            const childRecipe = await VentaService.resolveRecipeOrInsumoForDetail(
              { idProducto: childProdId, cantidad: childQty, nombre: childProd?.nombre },
              null,
              childProdId,
              { transaction: t }
            );

            if (childRecipe.directInsumoId) {
              allDemands.push({
                idInsumo: Number(childRecipe.directInsumoId),
                rawCantidad: 1,
                recipeUnit: 'und',
                multiplierQty: childQty,
                sourceType: 'COMBO_DIRECTO',
                productName: prodDisplayName,
                productId: targetProductId,
                detailItem: d,
                obsProdItem,
                checkMiseEnPlace: false,
                trazabilidadTipo: 'CONSUMO_VENTA',
                trazabilidadDetalleFn: (qtyDesc, unit, insName, ventaId) =>
                  `Consumo de ${qtyDesc.toFixed(2)} ${unit} por Venta #${ventaId} (Combo: ${prodDisplayName} -> ${insName})`
              });
            } else if (childRecipe.ficha && Array.isArray(childRecipe.ficha.detalles)) {
              for (const det of childRecipe.ficha.detalles) {
                const cantPorPlato = Number(det.cantidad || 0);
                if (cantPorPlato > 0 && det.idInsumo) {
                  allDemands.push({
                    idInsumo: Number(det.idInsumo),
                    rawCantidad: cantPorPlato,
                    recipeUnit: det.unidadMedida || 'und',
                    multiplierQty: childQty,
                    sourceType: 'COMBO_RECETA',
                    productName: prodDisplayName,
                    productId: targetProductId,
                    detailItem: d,
                    obsProdItem,
                    checkMiseEnPlace: false,
                    trazabilidadTipo: 'CONSUMO_VENTA',
                    trazabilidadDetalleFn: (qtyDesc, unit, _insName, ventaId) =>
                      `Consumo de ${qtyDesc.toFixed(2)} ${unit} por Venta #${ventaId} (Combo: ${prodDisplayName} -> Prod #${childProdId})`
                  });
                }
              }
            }
          }
        } else if (recipeResult.ficha && Array.isArray(recipeResult.ficha.detalles) && recipeResult.ficha.detalles.length > 0) {
          itemHasInventorySource = true;
          for (const det of recipeResult.ficha.detalles) {
            const cantPorPlato = Number(det.cantidad || 0);
            if (cantPorPlato > 0 && det.idInsumo) {
              allDemands.push({
                idInsumo: Number(det.idInsumo),
                rawCantidad: cantPorPlato,
                recipeUnit: det.unidadMedida || 'und',
                multiplierQty: safeDetalleQty,
                sourceType: 'RECETA',
                productName: prodDisplayName,
                productId: recipeResult.targetProductId || targetProductId,
                detailItem: d,
                obsProdItem,
                checkMiseEnPlace: true,
                trazabilidadTipo: 'CONSUMO_VENTA',
                trazabilidadDetalleFn: (qtyDesc, unit, _insName, ventaId) =>
                  `Consumo de ${qtyDesc.toFixed(2)} ${unit} por Venta #${ventaId} (${safeDetalleQty}x Prod #${recipeResult.targetProductId || targetProductId})`
              });
            }
          }
        }

        if (!esDevolucion && !itemHasInventorySource) {
          const err = new Error(`No se puede completar la venta: el producto "${prodDisplayName}" está agotado (sin stock disponible).`);
          err.statusCode = 409;
          err.code = 'INSUFFICIENT_STOCK';
          err.productosAgotados = [{ idProducto: targetProductId, nombre: prodDisplayName, motivo: 'SIN_RECETA_O_STOCK' }];
          throw err;
        }

        // Recolectar adiciones solicitadas para este detalle
        const adicList = d.idAdiciones || d.adiciones || [];
        const normalizedAdiciones = [];
        if (Array.isArray(adicList) && adicList.length > 0) {
          for (const adItem of adicList) {
            const adId = Number(typeof adItem === 'object' ? (adItem.id || adItem.idAdicion || adItem.idInsumo) : adItem);
            const adCantidad = typeof adItem === 'object' ? Math.max(1, Math.floor(Number(adItem.cantidad) || 1)) : 1;
            if (!adId) continue;
            normalizedAdiciones.push({ adId, adCantidad });
            allDemands.push({
              idInsumo: adId,
              rawCantidad: 1,
              recipeUnit: null,
              multiplierQty: adCantidad * safeDetalleQty,
              sourceType: 'ADICION',
              productName: typeof adItem === 'object' && adItem.nombre ? adItem.nombre : `Adición #${adId}`,
              parentProductName: prodDisplayName,
              productId: targetProductId,
              detailItem: d,
              obsProdItem,
              checkMiseEnPlace: false,
              trazabilidadTipo: 'CONSUMO_ADICION',
              trazabilidadMotivoFn: (ventaId) => `Venta #${ventaId} (Adición)`,
              trazabilidadDetalleFn: (qtyDesc, unit, insName, ventaId) =>
                `Adición ${insName} (${qtyDesc} ${unit}) en Venta #${ventaId}`
            });
          }
        }

        preparedDetails.push({
          d,
          obsProdItem,
          chosenVarianteId,
          prodDisplayName,
          pricedDetail,
          safeDetalleQty,
          normalizedAdiciones
        });
      }

      // Bloquear en orden determinístico (idInsumo ASC) todos los insumos y lotes involucrados para evitar condiciones de carrera y deadlocks
      const uniqueInsumoIds = Array.from(new Set(allDemands.map(dm => Number(dm.idInsumo)).filter(Boolean))).sort((a, b) => a - b);
      const lockedInsumosMap = new Map();
      const lockedLotesByInsumo = new Map();

      if (uniqueInsumoIds.length > 0) {
        const lockedInsumos = await Insumo.findAll({
          where: { idInsumo: uniqueInsumoIds },
          order: [['idInsumo', 'ASC']],
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        for (const ins of lockedInsumos) {
          lockedInsumosMap.set(Number(ins.idInsumo), ins);
        }

        const lockedLotes = await LoteInsumo.findAll({
          where: {
            idInsumo: uniqueInsumoIds,
            estado: { [Op.ne]: 'AGOTADO' }
          },
          order: [['idInsumo', 'ASC'], ['idLote', 'ASC']],
          transaction: t,
          lock: t.LOCK.UPDATE
        });
        for (const l of lockedLotes) {
          const idIns = Number(l.idInsumo);
          if (!lockedLotesByInsumo.has(idIns)) lockedLotesByInsumo.set(idIns, []);
          lockedLotesByInsumo.get(idIns).push(l);
        }
      }

      // Filtrar Mise & Place ("Sin ...") y agregar la demanda total por insumo de todo el pedido
      const activeDemands = [];
      const aggregatedByInsumo = new Map();

      for (const dm of allDemands) {
        const insumo = lockedInsumosMap.get(dm.idInsumo) || null;
        if (!insumo) {
          if (!esDevolucion) {
            if (!aggregatedByInsumo.has(dm.idInsumo)) {
              aggregatedByInsumo.set(dm.idInsumo, {
                insumo: null,
                totalRequired: 0,
                unit: dm.recipeUnit || 'und',
                affectedProducts: new Set(),
                missingInsumo: true
              });
            }
            aggregatedByInsumo.get(dm.idInsumo).affectedProducts.add(dm.productName);
          }
          continue;
        }

        // Respetar Mise & Place: si el cliente quitó este ingrediente ("Sin ..."), no bloquea la venta ni se descuenta de inventario
        if (dm.checkMiseEnPlace && isInsumoRemovedByMiseEnPlace(insumo, dm.detailItem, dm.obsProdItem)) {
          continue;
        }

        const insumoUnit = insumo.unidadMedida || dm.recipeUnit || 'und';
        const cantPorUnidad = dm.recipeUnit
          ? convertUnits(dm.rawCantidad, dm.recipeUnit, insumoUnit)
          : Number(dm.rawCantidad || 0);
        const totalADescontar = roundQty(cantPorUnidad * dm.multiplierQty);
        if (!(totalADescontar > EPSILON)) continue;

        activeDemands.push({ ...dm, insumo, insumoUnit, totalADescontar });

        if (!aggregatedByInsumo.has(dm.idInsumo)) {
          aggregatedByInsumo.set(dm.idInsumo, {
            insumo,
            totalRequired: 0,
            unit: insumoUnit,
            affectedProducts: new Set(),
            missingInsumo: false
          });
        }
        const agg = aggregatedByInsumo.get(dm.idInsumo);
        agg.totalRequired = roundQty(agg.totalRequired + totalADescontar);
        agg.affectedProducts.add(dm.sourceType === 'ADICION' ? `Adición "${insumo.nombre}"` : dm.productName);
      }

      // Validación estricta de stock vigente e insumos activos ANTES de confirmar la venta (409 Conflict)
      if (!esDevolucion) {
        const stockConflicts = [];

        for (const [idIns, agg] of aggregatedByInsumo.entries()) {
          const productos = Array.from(agg.affectedProducts);
          if (agg.missingInsumo || !agg.insumo) {
            stockConflicts.push({
              idInsumo: idIns,
              insumoNombre: `Insumo #${idIns}`,
              productos,
              motivo: 'INSUMO_NO_ENCONTRADO'
            });
            continue;
          }

          const lotesIns = lockedLotesByInsumo.get(idIns) || [];
          const breakdown = computeInsumoStockBreakdown(agg.insumo, lotesIns, hoyColombia);

          // Respetar insumo.estado === 0 (o eliminado === 1) para TODOS los insumos (con o sin control de stock)
          if (breakdown.isInactive) {
            stockConflicts.push({
              idInsumo: idIns,
              insumoNombre: agg.insumo.nombre,
              productos,
              motivo: 'INSUMO_INACTIVO',
              stockVigente: 0,
              requerido: agg.totalRequired,
              unidad: agg.unit
            });
            continue;
          }

          // Verificar stock vigente suficiente (excluyendo lotes vencidos aunque no se hayan retirado manualmente)
          if (breakdown.controlarStock && breakdown.stockVigente + EPSILON < agg.totalRequired) {
            stockConflicts.push({
              idInsumo: idIns,
              insumoNombre: agg.insumo.nombre,
              productos,
              motivo: breakdown.stockVencido > EPSILON && breakdown.stockVigente <= EPSILON
                ? 'LOTES_VENCIDOS'
                : 'STOCK_INSUFICIENTE',
              stockVigente: breakdown.stockVigente,
              stockVencido: breakdown.stockVencido,
              requerido: agg.totalRequired,
              unidad: agg.unit
            });
          }
        }

        if (stockConflicts.length > 0) {
          const uniqueAffectedNames = Array.from(new Set(stockConflicts.flatMap(c => c.productos)));
          const hasOnlyInactive = stockConflicts.every(c => c.motivo === 'INSUMO_INACTIVO');
          const hasExpired = stockConflicts.some(c => c.motivo === 'LOTES_VENCIDOS');

          let message;
          if (uniqueAffectedNames.length === 1) {
            const targetName = uniqueAffectedNames[0];
            if (hasOnlyInactive) {
              message = `No se puede completar la venta: "${targetName}" no está disponible porque uno de sus insumos se encuentra inactivo.`;
            } else if (hasExpired) {
              message = `No se puede completar la venta: "${targetName}" está agotado (sin stock vigente disponible).`;
            } else {
              message = `No se puede completar la venta: "${targetName}" está agotado o no tiene stock vigente suficiente para la cantidad solicitada.`;
            }
          } else {
            const listStr = uniqueAffectedNames.map(n => `"${n}"`).join(', ');
            message = `No se puede completar la venta: los siguientes productos están agotados o no tienen stock vigente suficiente: ${listStr}.`;
          }

          const err = new Error(message);
          err.statusCode = 409;
          err.code = 'INSUFFICIENT_STOCK';
          err.productosAgotados = stockConflicts;
          throw err;
        }
      }

      // Crear la venta y sus detalles dentro de la transacción ya validada
      const createdVenta = await Venta.create({
        idCliente: finalClienteId,
        idUsuario: responsibleUserId,
        idDescuento: data.idDescuento || null,
        tipoVenta: resolvedTipoVenta,
        subtotal: finalSubtotal,
        descuentoAplicado: finalDescuento,
        total: finalTotal,
        estadoEntrega: finalEstadoEntrega,
        observaciones: obsStr,
        estadoAprobacion: finalEstadoAprobacion,
        origen: origenVenta,
        tiempoEstimadoEntrega: upperEstadoEntrega === 'ENTREGADO' ? 'Entregado' : tiempoEstimadoEntregaVenta
      }, { transaction: t });

      for (const item of preparedDetails) {
        const { d, obsProdItem, chosenVarianteId, prodDisplayName, pricedDetail, safeDetalleQty, normalizedAdiciones } = item;
        if (!chosenVarianteId) continue;

        const obsCandidates = [
          d.observacion,
          obsProdItem?.observacion,
          obsProdItem?.observaciones,
          d.observaciones
        ]
          .map(v => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean);
        const customNote = obsCandidates.find(
          c => c.toLowerCase() !== prodDisplayName.toLowerCase()
        ) || obsCandidates[0] || prodDisplayName || null;

        const safeDetalleUnit = esDevolucion ? 0 : (pricedDetail ? pricedDetail.precioUnitario : 0);
        const safeDetalleSub = esDevolucion ? 0 : Math.round(safeDetalleUnit * safeDetalleQty);

        const createdDetalle = await DetalleVentaProducto.create({
          idVenta: createdVenta.idVenta,
          idVariante: chosenVarianteId,
          cantidad: safeDetalleQty,
          precioUnitario: safeDetalleUnit,
          subtotal: safeDetalleSub,
          observaciones: customNote
        }, { transaction: t });

        for (const { adId, adCantidad } of normalizedAdiciones) {
          const insumoAd = lockedInsumosMap.get(adId) || await Insumo.findByPk(adId, { transaction: t }).catch(() => null);
          // Seguridad (AUD-004): usar SIEMPRE el precio oficial de la adición en BD (nunca el enviado por el cliente)
          const adPrecio = esDevolucion ? 0 : Math.max(0, Number(insumoAd?.precioAdicion || 0));

          await DetalleVentaAdicion.create({
            idDetalleVenta: createdDetalle.idDetalleVenta,
            idAdicion: adId,
            cantidad: adCantidad,
            precio: adPrecio,
            subtotal: adPrecio * adCantidad
          }, { transaction: t });
        }
      }

      // Descontar inventario en estricto orden FEFO (únicamente lotes vigentes + insumo.stock)
      const allLotesConsumidos = [];
      for (const dm of activeDemands) {
        const insumo = dm.insumo;
        if (!insumo || isInsumoNoStockControl(insumo)) continue;

        const lotesIns = lockedLotesByInsumo.get(dm.idInsumo) || [];
        const fefoRes = await deductInsumoFefo(insumo, dm.totalADescontar, {
          lotes: lotesIns,
          todayCol: hoyColombia,
          transaction: t
        });

        if (Array.isArray(fefoRes.lotesConsumidos) && fefoRes.lotesConsumidos.length > 0) {
          allLotesConsumidos.push(...fefoRes.lotesConsumidos);
        }

        try {
          await Trazabilidad.create({
            tipo: dm.trazabilidadTipo || 'CONSUMO_VENTA',
            entidadNombre: insumo.nombre,
            detalle: dm.trazabilidadDetalleFn(dm.totalADescontar, dm.insumoUnit, insumo.nombre, createdVenta.idVenta),
            idInsumo: insumo.idInsumo,
            tipoMovimiento: 'SALIDA',
            cantidad: dm.totalADescontar,
            motivo: dm.trazabilidadMotivoFn ? dm.trazabilidadMotivoFn(createdVenta.idVenta) : `Venta #${createdVenta.idVenta}`,
            usuarioId: responsibleUserId || targetUserId || null
          }, { transaction: t });
        } catch (tzErr) {
          console.warn('Error registrando trazabilidad de insumo:', tzErr.message);
        }
      }

      // Persistir trazabilidad de lotes consumidos para permitir reintegro FEFO exacto en cancelaciones
      if (allLotesConsumidos.length > 0) {
        obsObj.lotesConsumidos = allLotesConsumidos;
        createdVenta.observaciones = JSON.stringify(obsObj);
        await createdVenta.save({ transaction: t });
      }

      return createdVenta;
    });

    // Invalidar cachés de catálogo e inventario inmediatamente tras el commit
    invalidateNamespaces(['ventas', 'productos', 'insumos', 'insumos-preparados', 'adiciones', 'dashboard', 'produccion']);

    // Trigger client loyalty progression (strictly only for registered customer accounts and when sale is approved)
    if (!esDevolucion && finalClienteId && !isMostradorSale && finalEstadoAprobacion === 'APROBADO') {
      await this.registrarFidelidadUnaVez(venta.idVenta);
    }

    return this.getById(venta.idVenta);
  }

  static async updateEstado(id, estado) {
    const v = await Venta.findByPk(id);
    if (!v) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
      throw error;
    }

    let estadoEnum = estado;
    if (estado === 'Pendiente') estadoEnum = 'PENDIENTE';
    else if (estado === 'En Preparación') estadoEnum = 'PREPARANDO';
    else if (estado === 'Listo') estadoEnum = 'LISTO';
    else if (estado === 'Completada' || estado === 'Entregado') estadoEnum = 'ENTREGADO';
    else if (estado === 'Anulada' || estado === 'CANCELADO') estadoEnum = 'CANCELADO';

    const estadoAnterior = v.estadoEntrega;
    const aprobacionAnterior = v.estadoAprobacion;
    v.estadoEntrega = estadoEnum;
    if (estadoEnum === 'CANCELADO') {
      v.estadoAprobacion = 'RECHAZADO';
    } else if (estadoEnum === 'PREPARANDO' || estadoEnum === 'LISTO' || estadoEnum === 'ENTREGADO') {
      v.estadoAprobacion = 'APROBADO';
    }

    // Actualizar hora del estado dinámicamente en observaciones
    let obsData = {};
    try {
      obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
        ? JSON.parse(v.observaciones)
        : { nota: v.observaciones || '' };
    } catch (e) {
      obsData = { nota: v.observaciones || '' };
    }

    if (estadoEnum === 'CANCELADO') {
      obsData.estadoAprobacion = 'RECHAZADO';
      const isOnlineOrWompi =
        Boolean(obsData.wompiReference) ||
        Boolean(obsData.esIntencionWompi) ||
        Boolean(obsData.montoEnCentavos) ||
        String(obsData.metodoPago || '').toLowerCase().includes('wompi') ||
        String(v.origen || obsData.origen || '').toUpperCase() === 'ONLINE' ||
        String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO';
      if (isOnlineOrWompi && !obsData.wompiTransactionId && String(aprobacionAnterior || '').toUpperCase() === 'PENDIENTE') {
        obsData.estadoPago = 'Cancelado';
        obsData.wompiAbandonada = true;
      }
    }

    const ahoraEstado = new Date();
    const horaActual = formatColombiaTime(ahoraEstado);
    const horaActualConSegundos = formatColombiaTimeWithSeconds(ahoraEstado);
    obsData.horaEstado = horaActual;
    obsData.horaExactaEstado = horaActualConSegundos;
    obsData.fechaCambioEstado = ahoraEstado.toISOString();

    if (!obsData.tiemposEstados || typeof obsData.tiemposEstados !== 'object') {
      const baseHora = formatColombiaTime(v.fechaVenta) || obsData.horario || horaActual;
      obsData.tiemposEstados = {
        enCola: {
          estado: 'En Cola',
          hora: baseHora,
          horaExacta: formatColombiaTimeWithSeconds(v.fechaVenta) || baseHora,
          fecha: v.fechaVenta ? new Date(v.fechaVenta).toISOString() : ahoraEstado.toISOString()
        }
      };
    }

    if (estadoEnum === 'PREPARANDO') {
      obsData.estadoCocina = 'EN_PREPARACION';
      obsData.fechaInicioPreparacion = ahoraEstado.toISOString();
      obsData.horaInicioPreparacion = horaActual;
      obsData.tiemposEstados.enPreparacion = {
        estado: 'En Preparación',
        hora: horaActual,
        horaExacta: horaActualConSegundos,
        fecha: ahoraEstado.toISOString()
      };
    } else if (estadoEnum === 'LISTO') {
      obsData.estadoCocina = 'LISTO';
      obsData.fechaListo = ahoraEstado.toISOString();
      obsData.horaListo = horaActual;
      obsData.tiemposEstados.listo = {
        estado: 'Listo',
        hora: horaActual,
        horaExacta: horaActualConSegundos,
        fecha: ahoraEstado.toISOString()
      };
      if (obsData.modoTiempoEntrega !== 'MANUAL') {
        const esDom = String(obsData.tipoEntrega || v.tipoVenta || '').toLowerCase().includes('domicilio');
        const autoListo = esDom ? '15-20 min' : 'Listo para entrega';
        obsData.tiempoEstimadoEntrega = autoListo;
        v.tiempoEstimadoEntrega = autoListo;
      }
    } else if (estadoEnum === 'ENTREGADO') {
      obsData.estadoCocina = 'ENTREGADO';
      obsData.fechaEntrega = ahoraEstado.toISOString();
      obsData.horaEntrega = horaActual;
      obsData.tiemposEstados.entregado = {
        estado: 'Entregado',
        hora: horaActual,
        horaExacta: horaActualConSegundos,
        fecha: ahoraEstado.toISOString()
      };
      obsData.tiempoEstimadoEntrega = 'Entregado';
      obsData.modoTiempoEntrega = 'AUTO';
      v.tiempoEstimadoEntrega = 'Entregado';
    }
    if (!Array.isArray(obsData.historialEstados)) obsData.historialEstados = [];
    obsData.historialEstados.push({
      estado: estadoEnum,
      etiqueta: estado,
      hora: horaActual,
      horaExacta: horaActualConSegundos,
      fecha: ahoraEstado.toISOString()
    });
    v.observaciones = JSON.stringify(obsData);

    await v.save();

    // Reintegrar insumos (receta base, combos, adiciones y lotes FEFO consumidos) si la venta fue anulada/cancelada de forma idempotente
    if (estadoEnum === 'CANCELADO' && estadoAnterior !== 'CANCELADO' && !obsData.inventarioReintegrado) {
      try {
        const saleData = await this.getById(id);
        const hoyColombiaCancel = getColombiaDateISO();
        const lotesConsumidosPool = Array.isArray(obsData.lotesConsumidos)
          ? obsData.lotesConsumidos.map(lc => ({ ...lc, cantidad: Number(lc.cantidad || 0) }))
          : [];
        if (saleData && Array.isArray(saleData.detalles)) {
          const { Insumo, LoteInsumo, Variante, Product: ProdModel, ComboProducto: CPModel, DetalleVentaAdicion, Trazabilidad } = require('../../persistence/models');
          const consumePoolForRestore = (idInsumo, qty) => {
            const matches = [];
            let rem = qty;
            for (const entry of lotesConsumidosPool) {
              if (rem <= EPSILON) break;
              if (Number(entry.idInsumo) !== Number(idInsumo) || !(entry.cantidad > EPSILON)) continue;
              const take = roundQty(Math.min(entry.cantidad, rem));
              if (take > EPSILON) {
                matches.push({ idInsumo: entry.idInsumo, idLote: entry.idLote, cantidad: take });
                entry.cantidad = roundQty(Math.max(0, entry.cantidad - take));
                rem = roundQty(Math.max(0, rem - take));
              }
            }
            return matches;
          };

          for (let idx = 0; idx < saleData.detalles.length; idx++) {
            const d = saleData.detalles[idx];
            const obsProdItem = Array.isArray(saleData.productos) ? saleData.productos[idx] : null;
            let prodId = d.idProducto;
            if (!prodId && d.idVariante) {
              const varRow = await Variante.findByPk(d.idVariante);
              if (varRow) prodId = varRow.idProducto;
            }

            const recipeResult = await VentaService.resolveRecipeOrInsumoForDetail(d, d.idVariante, prodId);
            const itemQty = Number(d.cantidad || 1);

            // Detectar si el producto corresponde a un Combo (igual que al descontar en create)
            let comboItems = [];
            if (!recipeResult.directInsumoId && (!recipeResult.ficha || !Array.isArray(recipeResult.ficha.detalles) || recipeResult.ficha.detalles.length === 0) && prodId) {
              try {
                const prodRow = await ProdModel.findByPk(prodId);
                if (prodRow) {
                  let cfg = prodRow.configuracionCombo;
                  if (typeof cfg === 'string') {
                    try { cfg = JSON.parse(cfg); } catch (e) { cfg = null; }
                  }
                  if (cfg && cfg.esCombo) {
                    if (Array.isArray(cfg.productosAsociados) && cfg.productosAsociados.length > 0) {
                      comboItems = cfg.productosAsociados;
                    } else if (Array.isArray(cfg.itemsCombo) && cfg.itemsCombo.length > 0) {
                      comboItems = cfg.itemsCombo;
                    }
                  }
                  if (comboItems.length === 0) {
                    const dbComboItems = await CPModel.findAll({ where: { idCombo: prodId } });
                    if (dbComboItems && dbComboItems.length > 0) {
                      comboItems = dbComboItems.map(ci => ({ idProducto: ci.idProducto, cantidad: ci.cantidad }));
                    }
                  }
                }
              } catch (comboErr) {
                console.warn('Error identificando productos de combo para reintegro:', comboErr.message);
              }
            }

            if (recipeResult.directInsumoId) {
              const insumo = await Insumo.findByPk(recipeResult.directInsumoId);
              if (insumo && !isInsumoNoStockControl(insumo) && !isInsumoRemovedByMiseEnPlace(insumo, d, obsProdItem)) {
                await restoreInsumoFefo(insumo, itemQty, {
                  lotesConsumidos: consumePoolForRestore(insumo.idInsumo, itemQty),
                  LoteInsumoModel: LoteInsumo,
                  todayCol: hoyColombiaCancel
                });
                await Trazabilidad.create({
                  tipo: 'REINTEGRO_CANCELACION',
                  entidadNombre: insumo.nombre,
                  detalle: `Reintegro de ${itemQty} und por cancelación de Venta #${v.idVenta}`,
                  idInsumo: insumo.idInsumo,
                  tipoMovimiento: 'ENTRADA',
                  cantidad: itemQty,
                  motivo: `Cancelación Venta #${v.idVenta}`
                }).catch(() => {});
              }
            } else if (comboItems.length > 0) {
              for (const ci of comboItems) {
                const childProdId = ci.idProducto || ci.id;
                const childQty = Number(ci.cantidad || 1) * itemQty;
                if (!childProdId || !(childQty > 0)) continue;
                try {
                  const childRecipe = await VentaService.resolveRecipeOrInsumoForDetail({ idProducto: childProdId, cantidad: childQty }, null, childProdId);
                  if (childRecipe.directInsumoId) {
                    const insumoChild = await Insumo.findByPk(childRecipe.directInsumoId);
                    if (insumoChild && !isInsumoNoStockControl(insumoChild)) {
                      await restoreInsumoFefo(insumoChild, childQty, {
                        lotesConsumidos: consumePoolForRestore(insumoChild.idInsumo, childQty),
                        LoteInsumoModel: LoteInsumo,
                        todayCol: hoyColombiaCancel
                      });
                    }
                  } else if (childRecipe.ficha && Array.isArray(childRecipe.ficha.detalles)) {
                    for (const det of childRecipe.ficha.detalles) {
                      const cantPorPlato = Number(det.cantidad || 0);
                      const recipeUnit = det.unidadMedida || 'und';
                      if (cantPorPlato > 0 && det.idInsumo) {
                        const insumo = await Insumo.findByPk(det.idInsumo);
                        if (insumo && !isInsumoNoStockControl(insumo)) {
                          const insumoUnit = insumo.unidadMedida || recipeUnit;
                          const cantConvertida = convertUnits(cantPorPlato, recipeUnit, insumoUnit);
                          const qtyRest = cantConvertida * childQty;
                          await restoreInsumoFefo(insumo, qtyRest, {
                            lotesConsumidos: consumePoolForRestore(insumo.idInsumo, qtyRest),
                            LoteInsumoModel: LoteInsumo,
                            todayCol: hoyColombiaCancel
                          });
                        }
                      }
                    }
                  }
                } catch (childErr) {
                  console.warn(`Error reintegrando componente #${childProdId} de combo:`, childErr.message);
                }
              }
            } else if (recipeResult.ficha && Array.isArray(recipeResult.ficha.detalles)) {
              for (const det of recipeResult.ficha.detalles) {
                const cantPorPlato = Number(det.cantidad || 0);
                const recipeUnit = det.unidadMedida || 'und';
                if (cantPorPlato > 0 && det.idInsumo) {
                  const insumo = await Insumo.findByPk(det.idInsumo);
                  if (insumo && !isInsumoNoStockControl(insumo)) {
                    if (isInsumoRemovedByMiseEnPlace(insumo, d, obsProdItem)) {
                      continue;
                    }
                    const insumoUnit = insumo.unidadMedida || recipeUnit;
                    const cantConvertida = convertUnits(cantPorPlato, recipeUnit, insumoUnit);
                    const totalARestaurar = cantConvertida * itemQty;
                    await restoreInsumoFefo(insumo, totalARestaurar, {
                      lotesConsumidos: consumePoolForRestore(insumo.idInsumo, totalARestaurar),
                      LoteInsumoModel: LoteInsumo,
                      todayCol: hoyColombiaCancel
                    });
                  }
                }
              }
            }

            // Reintegrar también los insumos de adiciones vinculadas al detalle
            if (d.idDetalleVenta) {
              try {
                const adicionesRows = await DetalleVentaAdicion.findAll({
                  where: { idDetalleVenta: d.idDetalleVenta }
                });
                for (const adRow of adicionesRows) {
                  const adId = adRow.idAdicion;
                  const adCant = Number(adRow.cantidad || 1);
                  if (!adId || !(adCant > 0)) continue;
                  const insumoAd = await Insumo.findByPk(adId);
                  if (insumoAd && !isInsumoNoStockControl(insumoAd)) {
                    const totalAdRestaurar = adCant * itemQty;
                    await restoreInsumoFefo(insumoAd, totalAdRestaurar, {
                      lotesConsumidos: consumePoolForRestore(insumoAd.idInsumo, totalAdRestaurar),
                      LoteInsumoModel: LoteInsumo,
                      todayCol: hoyColombiaCancel
                    });
                  }
                }
              } catch (adRestockErr) {
                console.warn('Error reintegrando adiciones por cancelación:', adRestockErr.message);
              }
            }
          }
        }

        // Marcar idempotencia del reintegro para evitar doble restitución
        obsData.inventarioReintegrado = true;
        obsData.fechaReintegroInventario = new Date().toISOString();
        v.observaciones = JSON.stringify(obsData);
        await v.save();
        invalidateNamespaces(['ventas', 'productos', 'insumos', 'insumos-preparados', 'adiciones', 'dashboard', 'produccion']);
      } catch (restockErr) {
        console.warn('Error reintegrando insumos por cancelación:', restockErr.message);
      }
    }

    // Si la venta estaba PENDIENTE y ahora fue aprobada/procesada, registrar fidelidad del cliente (una sola vez)
    if (estadoAnterior === 'PENDIENTE' && (estadoEnum === 'PREPARANDO' || estadoEnum === 'LISTO' || estadoEnum === 'ENTREGADO')) {
      if (v.idCliente) {
        await VentaService.registrarFidelidadUnaVez(v.idVenta);
      }
    }

    invalidateNamespaces(['ventas', 'productos', 'insumos', 'insumos-preparados', 'adiciones', 'dashboard', 'produccion']);
    return this.getById(id);
  }

  static async resolveRecipeOrInsumoForDetail(d, chosenVarianteId, targetProductId, options = {}) {
    const { FichaTecnica, DetalleFichaInsumo, Variante, VarianteInsumo, Insumo, Product } = require('../../persistence/models');
    const { Op } = require('sequelize');
    const txOpt = options?.transaction ? { transaction: options.transaction } : {};

    // Revisar primero si la variante explícita tiene ficha dedicada o reglas VarianteInsumo
    const explicitVarId = chosenVarianteId || d.idVariante;
    if (explicitVarId) {
      try {
        const varRow = await Variante.findByPk(explicitVarId, txOpt);
        const fichaVar = await FichaTecnica.findOne({
          where: { idVariante: explicitVarId, tipo: 'VARIANTE', estado: 1 },
          include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
          ...txOpt
        });
        if (fichaVar && Array.isArray(fichaVar.detalles) && fichaVar.detalles.length > 0) {
          return {
            ficha: fichaVar,
            targetProductId: fichaVar.idProducto || targetProductId || varRow?.idProducto,
            resolvedName: varRow?.nombre
          };
        }

        const varDeltasPre = await VarianteInsumo.findAll({
          where: { idVariante: explicitVarId },
          include: [
            { model: Insumo, as: 'insumo' },
            { model: Insumo, as: 'insumoReemplazado' }
          ],
          ...txOpt
        });
        if (varDeltasPre && varDeltasPre.length > 0) {
          const prodIdLookup = d.idProducto || targetProductId || varRow?.idProducto;
          const fichaBasePre = prodIdLookup
            ? await FichaTecnica.findOne({
                where: {
                  idProducto: prodIdLookup,
                  estado: 1,
                  [Op.or]: [{ tipo: 'PRODUCTO' }, { tipo: null }]
                },
                include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
                order: [['idFichaTecnica', 'ASC']],
                ...txOpt
              })
            : null;
          if (!fichaBasePre || !Array.isArray(fichaBasePre.detalles) || fichaBasePre.detalles.length === 0) {
            const directDeltas = varDeltasPre
              .filter(dl => String(dl.tipoAccion || 'AGREGAR').toUpperCase() !== 'QUITAR' && Number(dl.cantidad) > 0 && dl.idInsumo)
              .map(dl => ({
                idInsumo: dl.idInsumo,
                cantidad: Number(dl.cantidad || 1),
                unidadMedida: dl.unidadMedida || dl.insumo?.unidadMedida || 'und',
                insumo: dl.insumo
              }));
            if (directDeltas.length > 0) {
              return {
                ficha: { idProducto: prodIdLookup, idVariante: explicitVarId, tipo: 'VARIANTE', detalles: directDeltas },
                targetProductId: prodIdLookup,
                resolvedName: varRow?.nombre
              };
            }
          }
        }
      } catch (e) {}
    }

    // Revisar todo el texto descriptivo del ítem
    const rawText = [
      d.observaciones,
      d.observacion,
      d.nombre,
      d.sabor,
      d.saborSeleccionado
    ].filter(Boolean).join(' ').toLowerCase();

    const isExplicitOriginal = rawText.includes('original') || rawText.includes('clásica') || rawText.includes('clasica') || rawText.includes('regular');
    const hasDietKeyword = rawText.includes('sin azúcar') || rawText.includes('sin azucar') || rawText.includes('light') || rawText.includes('zero') || rawText.includes('black');

    const isCoca = (targetProductId === 8) || (d.idProducto === 8) || (d.idProducto === 16) || rawText.includes('coca');
    const isPepsi = (targetProductId === 11) || (d.idProducto === 11) || rawText.includes('pepsi');

    // 1. Caso Coca-Cola: Distinguir con total precisión entre Original y Sin Azúcar / Light
    if (isCoca) {
      const isLightSale = !isExplicitOriginal && (
        (d.idProducto === 16) ||
        (d.idVariante === 20 && !rawText.includes('original')) ||
        (d.idVariante === 76 && !rawText.includes('original')) ||
        (d.idVariante === 77 && !rawText.includes('original')) ||
        hasDietKeyword
      );

      if (isLightSale) {
        // Descontar Coca-Cola Sin Azúcar / Light (Insumo 32)
        try {
          const fichaLight = await FichaTecnica.findOne({
            where: { [Op.or]: [{ idProducto: 16 }, { idVariante: 20 }], estado: 1 },
            include: [{ model: DetalleFichaInsumo, as: 'detalles' }]
          });
          if (fichaLight && Array.isArray(fichaLight.detalles) && fichaLight.detalles.length > 0) {
            return { ficha: fichaLight, targetProductId: 16, resolvedName: 'Coca-Cola Sin Azúcar / Light 400ml' };
          }
        } catch (e) {}
        return { directInsumoId: 32, targetProductId: 16, resolvedName: 'Coca-Cola Sin Azúcar / Light 400ml' };
      } else {
        // Descontar Coca-Cola Original (Insumo 29)
        try {
          const fichaOrig = await FichaTecnica.findOne({
            where: { idProducto: 8, idVariante: null, estado: 1 },
            include: [{ model: DetalleFichaInsumo, as: 'detalles' }]
          });
          if (fichaOrig && Array.isArray(fichaOrig.detalles) && fichaOrig.detalles.length > 0) {
            return { ficha: fichaOrig, targetProductId: 8, resolvedName: 'Coca-Cola Original 400ml' };
          }
        } catch (e) {}
        return { directInsumoId: 29, targetProductId: 8, resolvedName: 'Coca-Cola Original 400ml' };
      }
    }

    // 2. Caso Pepsi: Distinguir entre Regular y Light / Black
    if (isPepsi) {
      const isPepsiLight = !isExplicitOriginal && (
        (d.idVariante === 22 && !rawText.includes('regular') && !rawText.includes('original')) ||
        hasDietKeyword
      );
      if (isPepsiLight) {
        try {
          const fichaPepsiLight = await FichaTecnica.findOne({
            where: { idVariante: 22, estado: 1 },
            include: [{ model: DetalleFichaInsumo, as: 'detalles' }]
          });
          if (fichaPepsiLight && Array.isArray(fichaPepsiLight.detalles) && fichaPepsiLight.detalles.length > 0) {
            return { ficha: fichaPepsiLight, targetProductId: 11, resolvedName: 'Pepsi Light / Black 400ml' };
          }
        } catch (e) {}
        return { directInsumoId: 34, targetProductId: 11, resolvedName: 'Pepsi Light / Black 400ml' };
      } else {
        return { directInsumoId: 33, targetProductId: 11, resolvedName: 'Pepsi Regular 400ml' };
      }
    }

    // 3. Caso Postobón y Bebidas Específicas por Sabor (reconocimiento estricto)
    const isUva = (((rawText.includes('postob') || rawText.includes('gaseosa')) && rawText.includes('uva')) || (targetProductId === 38) || (d.idProducto === 38));
    const isNaranja = (((rawText.includes('postob') || rawText.includes('gaseosa')) && rawText.includes('naranja')) || (targetProductId === 39) || (d.idProducto === 39));
    const isColombiana = (((rawText.includes('postob') || rawText.includes('gaseosa') || rawText.includes('kola')) && rawText.includes('colombiana')) || (targetProductId === 12) || (d.idProducto === 12)) && !isUva && !isNaranja && !rawText.includes('manzana');
    const isManzana = (((rawText.includes('postob') || rawText.includes('gaseosa')) && rawText.includes('manzana')) || (targetProductId === 9) || (d.idProducto === 9)) && !isUva && !isNaranja && !isColombiana;
    const isSprite = rawText.includes('sprite') || (targetProductId === 13) || (d.idProducto === 13);
    const isQuatro = (((rawText.includes('cuatro') || rawText.includes('quatro')) && (rawText.includes('gaseosa') || rawText.includes('toronja'))) || (targetProductId === 14) || (d.idProducto === 14));
    const isAgua = ((rawText.includes('agua') && (rawText.includes('cristal') || rawText.includes('mineral') || rawText.includes('botella'))) || (targetProductId === 10) || (d.idProducto === 10));

    if (isUva) {
      return { directInsumoId: 47, targetProductId: 38, resolvedName: 'Gaseosa Uva Postobón 400ml' };
    }
    if (isNaranja) {
      return { directInsumoId: 48, targetProductId: 39, resolvedName: 'Gaseosa Naranja Postobón 400ml' };
    }
    if (isColombiana) {
      return { directInsumoId: 35, targetProductId: 12, resolvedName: 'Gaseosa Colombiana Postobón 400ml' };
    }
    if (isManzana) {
      return { directInsumoId: 30, targetProductId: 9, resolvedName: 'Manzana Postobón 400ml' };
    }
    if (isSprite) {
      return { directInsumoId: 36, targetProductId: 13, resolvedName: 'Gaseosa Sprite 400ml' };
    }
    if (isQuatro) {
      return { directInsumoId: 37, targetProductId: 14, resolvedName: 'Gaseosa Cuatro Toronja 400ml' };
    }
    if (isAgua) {
      return { directInsumoId: 31, targetProductId: 10, resolvedName: 'Agua Cristal sin Gas 500ml' };
    }

    // 4. Demás casos generales (Platos, combos, etc.)
    const varId = chosenVarianteId || d.idVariante;
    let varRow = null;
    let varDeltas = [];
    if (varId) {
      try {
        varRow = await Variante.findByPk(varId, txOpt);
        const isBaseDummyRow = Boolean(d.esVarianteBase || (varRow && String(varRow.nombre || '').toLowerCase().includes('- base')));
        if (!isBaseDummyRow) {
          varDeltas = await VarianteInsumo.findAll({
            where: { idVariante: varId },
            include: [
              { model: Insumo, as: 'insumo' },
              { model: Insumo, as: 'insumoReemplazado' }
            ],
            ...txOpt
          });
        }
      } catch (e) {}
    }

    const isBaseDummySelection = Boolean(d.esVarianteBase || (varRow && String(varRow.nombre || '').toLowerCase().includes('- base')));
    if (varId && !isBaseDummySelection) {
      try {
        const fichaVar = await FichaTecnica.findOne({
          where: { idVariante: varId, tipo: 'VARIANTE', estado: 1 },
          include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
          ...txOpt
        });
        if (fichaVar && Array.isArray(fichaVar.detalles) && fichaVar.detalles.length > 0) {
          return { ficha: fichaVar, targetProductId: fichaVar.idProducto || targetProductId, resolvedName: varRow?.nombre };
        }
        // Compatibilidad con fichas especiales por variante (ej. Coca-Cola Light / Pepsi Light sin varDeltas)
        if (!varDeltas || varDeltas.length === 0) {
          const legacyFichaVar = await FichaTecnica.findOne({
            where: { idVariante: varId, estado: 1 },
            include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
            ...txOpt
          });
          if (legacyFichaVar && Array.isArray(legacyFichaVar.detalles) && legacyFichaVar.detalles.length > 0) {
            return { ficha: legacyFichaVar, targetProductId: legacyFichaVar.idProducto || targetProductId, resolvedName: varRow?.nombre };
          }
        }
      } catch (e) {}
    }

    const finalProdId = d.idProducto || targetProductId || varRow?.idProducto;
    if (finalProdId) {
      try {
        const { Op } = require('sequelize');
        const fichaBase = await FichaTecnica.findOne({
          where: {
            idProducto: finalProdId,
            estado: 1,
            [Op.or]: [{ tipo: 'PRODUCTO' }, { tipo: null }]
          },
          include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
          order: [['idFichaTecnica', 'ASC']],
          ...txOpt
        });
        if (fichaBase) {
          if (varDeltas && varDeltas.length > 0) {
            // Aplicar modificaciones delta de la variante a la receta base
            let effectiveDetalles = (fichaBase.detalles || []).map(det => ({
              idDetalleFicha: det.idDetalleFicha,
              idFichaTecnica: det.idFichaTecnica,
              idInsumo: det.idInsumo,
              cantidad: Number(det.cantidad || 0),
              unidadMedida: det.unidadMedida,
              insumo: det.insumo
            }));

            for (const delta of varDeltas) {
              const deltaAccion = String(delta.tipoAccion || 'AGREGAR').toUpperCase();
              const deltaQty = Number(delta.cantidad || 0);

              if (deltaAccion === 'AGREGAR') {
                effectiveDetalles.push({
                  idInsumo: delta.idInsumo,
                  cantidad: deltaQty,
                  unidadMedida: delta.unidadMedida || delta.insumo?.unidadMedida || 'und',
                  insumo: delta.insumo
                });
              } else if (deltaAccion === 'REEMPLAZAR') {
                if (delta.idInsumoReemplazado) {
                  effectiveDetalles = effectiveDetalles.filter(det => Number(det.idInsumo) !== Number(delta.idInsumoReemplazado));
                }
                effectiveDetalles.push({
                  idInsumo: delta.idInsumo,
                  cantidad: deltaQty,
                  unidadMedida: delta.unidadMedida || delta.insumo?.unidadMedida || 'und',
                  insumo: delta.insumo
                });
              } else if (deltaAccion === 'MODIFICAR_CANTIDAD') {
                const existingIdx = effectiveDetalles.findIndex(det => Number(det.idInsumo) === Number(delta.idInsumo));
                if (existingIdx >= 0) {
                  effectiveDetalles[existingIdx].cantidad = deltaQty;
                  if (delta.unidadMedida) effectiveDetalles[existingIdx].unidadMedida = delta.unidadMedida;
                } else {
                  effectiveDetalles.push({
                    idInsumo: delta.idInsumo,
                    cantidad: deltaQty,
                    unidadMedida: delta.unidadMedida || delta.insumo?.unidadMedida || 'und',
                    insumo: delta.insumo
                  });
                }
              } else if (deltaAccion === 'QUITAR') {
                effectiveDetalles = effectiveDetalles.filter(det => Number(det.idInsumo) !== Number(delta.idInsumo));
              }
            }

            const customFicha = {
              ...(fichaBase.toJSON ? fichaBase.toJSON() : fichaBase),
              detalles: effectiveDetalles
            };
            return {
              ficha: customFicha,
              targetProductId: finalProdId,
              resolvedName: varRow?.nombre ? `${varRow.nombre}` : null
            };
          }

          return { ficha: fichaBase, targetProductId: finalProdId, resolvedName: varRow?.nombre };
        }
      } catch (e) {}
    }

    // Fallback por nombre exacto/prefijo para productos directos sin ficha técnica (paridad con productService.resolveDirectInsumoStock)
    if (!options?.skipNameFallback) {
      try {
        let lookupName = String(d.nombre || '').toLowerCase().trim();
        if (!lookupName && finalProdId) {
          const prodObj = await Product.findByPk(finalProdId, { attributes: ['nombre'], ...txOpt }).catch(() => null);
          if (prodObj?.nombre) lookupName = String(prodObj.nombre).toLowerCase().trim();
        }
        if (lookupName) {
          const allInsumosFallback = await Insumo.findAll({
            attributes: ['idInsumo', 'nombre'],
            ...txOpt
          }).catch(() => []);
          const matchedByName = allInsumosFallback.find(ins => {
            const iName = String(ins.nombre || '').toLowerCase().trim();
            return iName && (iName === lookupName || (lookupName.startsWith(iName) && iName.length >= 6));
          });
          if (matchedByName) {
            return {
              directInsumoId: Number(matchedByName.idInsumo),
              targetProductId: finalProdId,
              resolvedName: matchedByName.nombre
            };
          }
        }
      } catch (e) {}
    }

    return { ficha: null, targetProductId: finalProdId };
  }

  static async updateTiempoEntrega(id, tiempoEstimadoEntrega, modoTiempoEntrega = null) {
    const v = await Venta.findByPk(id);
    if (!v) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
      throw error;
    }
    const raw = String(tiempoEstimadoEntrega || '').trim();
    const rawModo = String(modoTiempoEntrega || '').trim().toUpperCase();
    const isAutoLiteral =
      raw.toUpperCase() === 'AUTO' ||
      raw.toUpperCase() === 'AUTOMATICO' ||
      raw.toUpperCase() === 'AUTOMÁTICO';
    const isAutoSwitch = rawModo === 'AUTO' || isAutoLiteral;

    if (!isAutoSwitch && (!raw || raw.length > 50 || /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(raw) || /[^a-zA-Z0-9\s.,\-áéíóúñÁÉÍÓÚÑ]/i.test(raw) || /\.{2,}|-{2,}/.test(raw))) {
      const error = new Error('Formato de tiempo de entrega no válido.');
      error.statusCode = 400;
      throw error;
    }
    let obsData = {};
    try {
      obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
        ? JSON.parse(v.observaciones)
        : { nota: v.observaciones || '' };
    } catch (e) {
      obsData = { nota: v.observaciones || '' };
    }

    if (isAutoSwitch) {
      const hybridEst = computeHybridDeliveryEstimate({
        productos: Array.isArray(obsData.productos) ? obsData.productos : [],
        tipoEntrega: obsData.tipoEntrega || (v.tipoVenta === 'DOMICILIO' ? 'Domicilio' : 'En Mesa'),
        estadoEntrega: v.estadoEntrega || 'PENDIENTE',
        savedTiempo: '',
        savedModo: 'AUTO'
      });
      const finalAutoTime = (!isAutoLiteral && raw) ? raw : hybridEst.autoEstimate;
      obsData.modoTiempoEntrega = 'AUTO';
      obsData.tiempoEstimadoEntrega = finalAutoTime;
      v.tiempoEstimadoEntrega = finalAutoTime;
    } else {
      obsData.modoTiempoEntrega = 'MANUAL';
      obsData.tiempoEstimadoEntrega = raw;
      v.tiempoEstimadoEntrega = raw;
    }

    v.observaciones = JSON.stringify(obsData);
    await v.save();
    return this.getById(id);
  }

  static async cancelar(id) {
    return this.updateEstado(id, 'CANCELADO');
  }

  /**
   * Registra la compra en el programa de fidelidad una única vez por venta (idempotente).
   * Evita el doble conteo cuando el webhook de Wompi, la verificación manual y la aprobación
   * del administrador se ejecutan sobre la misma venta (Ítem #119).
   */
  static async registrarFidelidadUnaVez(idVenta) {
    const { sequelize } = require('../../persistence/models');
    const transaction = await sequelize.transaction();
    let idClienteARegistrar = null;
    try {
      const v = await Venta.findByPk(idVenta, { transaction, lock: transaction.LOCK.UPDATE });
      if (!v || !v.idCliente) {
        await transaction.commit();
        return false;
      }
      let obsData = {};
      try {
        obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
          ? JSON.parse(v.observaciones)
          : { nota: v.observaciones || '' };
      } catch (e) {
        obsData = { nota: v.observaciones || '' };
      }
      const clienteNombre = String(obsData.clienteNombre || '').toLowerCase();
      const entregaUpper = String(v.estadoEntrega || '').toUpperCase();
      const aprobacionUpper = String(v.estadoAprobacion || '').toUpperCase();
      if (
        obsData.fidelidadContabilizada ||
        obsData.esDevolucion === true ||
        clienteNombre.includes('mostrador') ||
        entregaUpper === 'CANCELADO' ||
        aprobacionUpper !== 'APROBADO'
      ) {
        await transaction.commit();
        return false;
      }
      const clienteRow = await Cliente.findByPk(v.idCliente, { transaction });
      if (!clienteRow || !clienteRow.idUsuario) {
        await transaction.commit();
        return false;
      }
      obsData.fidelidadContabilizada = true;
      obsData.fechaFidelidadContabilizada = new Date().toISOString();
      v.observaciones = JSON.stringify(obsData);
      await v.save({ transaction });
      await transaction.commit();
      idClienteARegistrar = v.idCliente;
    } catch (err) {
      await transaction.rollback().catch(() => {});
      console.warn('Error marcando fidelidad de la venta:', err.message);
      return false;
    }

    if (idClienteARegistrar) {
      const ClienteService = require('./clienteService');
      await ClienteService.registrarCompraFidelidad(idClienteARegistrar).catch(err =>
        console.warn('Error registrando fidelidad:', err.message)
      );
      return true;
    }
    return false;
  }

  /**
   * Aprueba manualmente el pago de una venta pendiente (ej. transferencias o pagos verificados),
   * pasándola a Producción (Ítem #116).
   */
  static async aprobarPago(id, usuarioAprobador = null) {
    const { Pago } = require('../../persistence/models');
    const v = await Venta.findByPk(id);
    if (!v) {
      const error = new Error('Venta no encontrada');
      error.statusCode = 404;
      throw error;
    }
    if (v.estadoEntrega === 'CANCELADO' || v.estadoAprobacion === 'RECHAZADO') {
      const error = new Error('No se puede aprobar el pago de una venta anulada o rechazada.');
      error.statusCode = 400;
      throw error;
    }
    if (v.estadoAprobacion === 'APROBADO') {
      const error = new Error('El pago de esta venta ya fue aprobado.');
      error.statusCode = 400;
      throw error;
    }

    let obsData = {};
    try {
      obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
        ? JSON.parse(v.observaciones)
        : { nota: v.observaciones || '' };
    } catch (e) {
      obsData = { nota: v.observaciones || '' };
    }

    const ahora = new Date();
    const horaActual = formatColombiaTime(ahora);
    obsData.estadoPago = 'Pagado';
    obsData.estadoAprobacion = 'APROBADO';
    obsData.horaEstado = horaActual;
    obsData.fechaCambioEstado = ahora.toISOString();
    obsData.fechaAprobacionPago = ahora.toISOString();
    obsData.aprobadoPor = usuarioAprobador
      ? `${usuarioAprobador.nombre || ''} ${usuarioAprobador.apellidos || ''}`.trim() || 'Administrador'
      : 'Administrador';
    if (!Array.isArray(obsData.historialEstados)) obsData.historialEstados = [];
    obsData.historialEstados.push({ estado: 'PAGO_APROBADO', hora: horaActual, fecha: ahora.toISOString() });

    v.estadoAprobacion = 'APROBADO';
    if (!v.estadoEntrega || v.estadoEntrega === 'PENDIENTE') {
      v.estadoEntrega = 'PENDIENTE';
    }
    v.observaciones = JSON.stringify(obsData);
    await v.save();

    try {
      await Pago.update({ estado: 'APROBADO' }, { where: { idVenta: v.idVenta } });
    } catch (pagoErr) {
      console.warn('Error actualizando pagos asociados:', pagoErr.message);
    }

    await this.registrarFidelidadUnaVez(v.idVenta);

    return this.getById(v.idVenta);
  }

  /**
   * Cancela automáticamente intenciones de pago Wompi abandonadas (> maxAgeMinutes)
   * que permanecieron en estado PENDIENTE, liberando el inventario reservado (AUD-020).
   */
  static async expirarVentasWompiAbandonadas(maxAgeMinutes = 30, force = false) {
    const nowMs = Date.now();
    if (!force && nowMs - lastWompiExpirationSweepMs < WOMPI_SWEEP_INTERVAL_MS) {
      return 0;
    }
    lastWompiExpirationSweepMs = nowMs;

    try {
      const { Op } = require('sequelize');
      const cutoff = new Date(nowMs - Math.max(5, Number(maxAgeMinutes) || 30) * 60 * 1000);
      const abandonadas = await Venta.findAll({
        where: {
          estadoEntrega: 'PENDIENTE',
          estadoAprobacion: 'PENDIENTE',
          fechaVenta: { [Op.lt]: cutoff },
          [Op.and]: [
            {
              [Op.or]: [
                { origen: 'ONLINE' },
                { tipoVenta: 'DOMICILIO' },
                { observaciones: { [Op.like]: '%"wompiReference"%' } },
                { observaciones: { [Op.like]: '%"montoEnCentavos"%' } },
                { observaciones: { [Op.like]: '%"metodoPago":"Wompi%' } }
              ]
            },
            {
              [Op.or]: [
                { observaciones: null },
                { observaciones: { [Op.notLike]: '%"wompiTransactionId"%' } }
              ]
            }
          ]
        },
        attributes: ['idVenta'],
        limit: 25
      });

      let expiredCount = 0;
      for (const row of abandonadas) {
        try {
          await this.updateEstado(row.idVenta, 'CANCELADO');
          expiredCount += 1;
        } catch (err) {
          console.warn(`Error expirando orden Wompi #${row.idVenta}:`, err.message);
        }
      }
      return expiredCount;
    } catch (err) {
      console.warn('Error en barrido de órdenes Wompi abandonadas:', err.message);
      return 0;
    }
  }

  /**
   * Permite al cliente autenticado confirmar la recepción de su pedido a domicilio
   * una vez ha sido preparado/despachado (Ficha SENA 3209616).
   */
  static async confirmarEntregaCliente(id, user) {
    const idUsuario = user?.idUsuario || user?.id;
    if (!idUsuario) {
      const err = new Error('Usuario no autenticado.');
      err.statusCode = 401;
      throw err;
    }

    const v = await Venta.findByPk(id);
    if (!v) {
      const err = new Error('Pedido no encontrado.');
      err.statusCode = 404;
      throw err;
    }

    const clienteRow = await Cliente.findOne({ where: { idUsuario }, attributes: ['idCliente'] });
    const idCliente = clienteRow ? clienteRow.idCliente : null;
    const isOwner =
      (idCliente && Number(v.idCliente) === Number(idCliente)) ||
      (Number(v.idUsuario) === Number(idUsuario));

    if (!isOwner) {
      const err = new Error('No tienes permiso para confirmar la entrega de este pedido.');
      err.statusCode = 403;
      throw err;
    }

    if (String(v.estadoEntrega || '').toUpperCase() === 'CANCELADO') {
      const err = new Error('No se puede confirmar un pedido cancelado.');
      err.statusCode = 400;
      throw err;
    }

    if (String(v.estadoAprobacion || '').toUpperCase() !== 'APROBADO') {
      const err = new Error('El pedido aún no tiene el pago aprobado.');
      err.statusCode = 400;
      throw err;
    }

    if (String(v.estadoEntrega || '').toUpperCase() === 'ENTREGADO') {
      return this.getById(v.idVenta);
    }

    let obsData = {};
    try {
      obsData = typeof v.observaciones === 'string' && v.observaciones.startsWith('{')
        ? JSON.parse(v.observaciones)
        : { nota: v.observaciones || '' };
    } catch (e) {
      obsData = { nota: v.observaciones || '' };
    }

    const estadoEntregaUpper = String(v.estadoEntrega || '').toUpperCase();
    const estadoCocinaUpper = String(obsData.estadoCocina || '').toUpperCase();
    const listoParaConfirmar =
      ['LISTO', 'DESPACHADO', 'EN_CAMINO'].includes(estadoEntregaUpper) ||
      ['LISTO', 'DESPACHADO', 'EN_CAMINO'].includes(estadoCocinaUpper);

    if (!listoParaConfirmar) {
      const err = new Error('Solo puedes confirmar la entrega cuando el pedido ya está listo o en camino.');
      err.statusCode = 400;
      throw err;
    }

    const ahora = new Date();
    const horaActual = formatColombiaTime12(ahora);
    const horaActualConSegundos = formatColombiaTimeWithSeconds12(ahora);

    v.estadoEntrega = 'ENTREGADO';
    v.tiempoEstimadoEntrega = 'Entregado';

    obsData.estadoCocina = 'ENTREGADO';
    obsData.confirmadoPorCliente = true;
    obsData.fechaConfirmacionCliente = ahora.toISOString();
    obsData.fechaEntrega = ahora.toISOString();
    obsData.horaEntrega = horaActual;
    obsData.horaEstado = horaActual;
    obsData.horaExactaEstado = horaActualConSegundos;
    obsData.fechaCambioEstado = ahora.toISOString();
    obsData.tiempoEstimadoEntrega = 'Entregado';
    obsData.modoTiempoEntrega = 'AUTO';

    if (!obsData.tiemposEstados || typeof obsData.tiemposEstados !== 'object') {
      obsData.tiemposEstados = {};
    }
    obsData.tiemposEstados.entregado = {
      estado: 'Entregado',
      hora: horaActual,
      horaExacta: horaActualConSegundos,
      fecha: ahora.toISOString(),
      confirmadoPorCliente: true
    };
    if (!Array.isArray(obsData.historialEstados)) obsData.historialEstados = [];
    obsData.historialEstados.push({
      estado: 'ENTREGADO',
      etiqueta: 'Confirmado por Cliente',
      hora: horaActual,
      horaExacta: horaActualConSegundos,
      fecha: ahora.toISOString()
    });

    v.observaciones = JSON.stringify(obsData);
    await v.save();

    return this.getById(v.idVenta);
  }
}

VentaService.isUnpaidWompiIntention = isUnpaidWompiIntention;
VentaService.buildExcludeUnpaidWompiClauses = buildExcludeUnpaidWompiClauses;

module.exports = VentaService;
