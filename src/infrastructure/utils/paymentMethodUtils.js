/**
 * Utilidades para normalizar métodos de pago de Wompi y calcular hábitos/preferencias
 * de compra de clientes (combinando compras online por Wompi y presenciales en POS).
 */

const WOMPI_PAYMENT_METHOD_LABELS = {
  CARD: 'Tarjeta',
  NEQUI: 'Nequi',
  PSE: 'PSE',
  BANCOLOMBIA_TRANSFER: 'Botón Bancolombia',
  BANCOLOMBIA_COLLECT: 'Corresponsal Bancolombia',
  BANCOLOMBIA_QR: 'QR Bancolombia',
  BANCOLOMBIA_BNPL: 'BNPL',
  DAVIPLATA: 'DaviPlata',
  PCOL: 'Puntos Colombia',
  BNPL: 'BNPL',
  SU_PLUS: 'Crédito SU+Pay',
  SU_PAY: 'Crédito SU+Pay'
};

/**
 * Mapea el campo `payment_method_type` de Wompi (o variantes textuales) a un nombre legible.
 */
function mapWompiPaymentMethodType(rawType, paymentMethodObj = null) {
  const candidate = rawType || paymentMethodObj?.type || '';
  const trimmed = String(candidate || '').trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase().replace(/[\s-]+/g, '_');
  if (WOMPI_PAYMENT_METHOD_LABELS[upper]) {
    return WOMPI_PAYMENT_METHOD_LABELS[upper];
  }

  const lower = trimmed.toLowerCase();
  if (lower === 'wompi' || lower === 'wompi (pago en línea)' || lower === 'pago en línea') {
    return null;
  }
  if (lower.includes('bancolombia_transfer') || lower.includes('botón bancolombia') || lower.includes('boton bancolombia')) {
    return 'Botón Bancolombia';
  }
  if (lower.includes('bancolombia_collect') || lower.includes('corresponsal')) {
    return 'Corresponsal Bancolombia';
  }
  if (lower.includes('bancolombia_qr') || lower.includes('qr bancolombia') || lower.includes('qr interoperable')) {
    return 'QR Bancolombia';
  }
  if (lower.includes('nequi')) return 'Nequi';
  if (lower.includes('daviplata') || lower.includes('davi')) return 'DaviPlata';
  if (lower === 'pse' || /\bpse\b/.test(lower)) return 'PSE';
  if (lower.includes('pcol') || lower.includes('puntos colombia')) return 'Puntos Colombia';
  if (lower.includes('bnpl')) return 'BNPL';
  if (lower.includes('su_plus') || lower.includes('su+pay') || lower.includes('supay')) return 'Crédito SU+Pay';
  if (lower.includes('card') || lower.includes('tarjeta') || lower.includes('crédito') || lower.includes('credito') || lower.includes('débito') || lower.includes('debito')) {
    return 'Tarjeta';
  }
  if (lower.includes('efectivo') || lower.includes('cash')) return 'Efectivo';

  return trimmed;
}

/**
 * Mantiene el campo principal `metodoPago` limpio ("Wompi" o "Efectivo")
 * para no alterar ni sobrecargar los filtros de Ventas del Administrador.
 */
function normalizePrincipalPaymentMethod(rawMetodo, isOnline = false) {
  const text = String(rawMetodo || '').trim();
  const lower = text.toLowerCase();
  if (!text) return isOnline ? 'Wompi' : 'Efectivo';
  if (lower.startsWith('wompi') || lower.includes('wompi')) return 'Wompi';
  if (isOnline && lower === 'efectivo') return 'Wompi';
  if (lower === 'efectivo') return 'Efectivo';
  return text;
}

/**
 * Extrae el detalle legible del método de pago (`metodo_pago_detalle`) desde `observaciones`
 * y/o un valor legacy como "Wompi (CARD)" o "Wompi (NEQUI)".
 */
function resolveMetodoPagoDetalle(obsData = {}, rawMetodoPago = '') {
  const obs = obsData && typeof obsData === 'object' ? obsData : {};

  const explicitDetalle = obs.metodo_pago_detalle || obs.metodoPagoDetalle;
  if (explicitDetalle && String(explicitDetalle).trim()) {
    const mapped = mapWompiPaymentMethodType(explicitDetalle);
    if (mapped) return mapped;
  }

  const rawWompiType = obs.paymentMethodType || obs.payment_method_type || obs.wompiPaymentMethod?.type;
  if (rawWompiType) {
    const mapped = mapWompiPaymentMethodType(rawWompiType, obs.wompiPaymentMethod);
    if (mapped) return mapped;
  }

  const metodoStr = String(obs.metodoPago || rawMetodoPago || '').trim();
  const parenMatch = metodoStr.match(/\(([^)]+)\)/);
  if (parenMatch && parenMatch[1]) {
    const mapped = mapWompiPaymentMethodType(parenMatch[1]);
    if (mapped) return mapped;
  }

  return null;
}

function parseObservacionesSafe(observaciones) {
  if (!observaciones) return {};
  if (typeof observaciones === 'object') return observaciones;
  if (typeof observaciones === 'string' && observaciones.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(observaciones);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch (_) {
      return {};
    }
  }
  return {};
}

/**
 * Calcula las preferencias de compra del cliente a partir de TODAS sus ventas completadas/aprobadas
 * asociadas a su `idCliente` (tanto online por Wompi como presenciales en POS en Efectivo),
 * usando `metodo_pago_detalle || metodo_pago` para determinar el método favorito y su porcentaje real.
 */
function computeClientPurchasePreferences(ventasAprobadas = []) {
  const list = Array.isArray(ventasAprobadas) ? ventasAprobadas : [];
  if (list.length === 0) {
    return {
      tieneCompras: false,
      totalCompras: 0,
      metodoPagoFavorito: null,
      metodoPagoPorcentaje: 0,
      preferenciaEntrega: null,
      desglosePagos: []
    };
  }

  const counts = new Map();
  let domicilioCount = 0;
  let localCount = 0;

  for (const v of list) {
    const obs = parseObservacionesSafe(v.observaciones);
    const isOnline =
      String(v.origen || obs.origen || '').toUpperCase() === 'ONLINE' ||
      String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO' ||
      Boolean(obs.wompiReference || obs.wompiTransactionId);

    const principal = normalizePrincipalPaymentMethod(obs.metodoPago || v.metodoPago, isOnline);
    const detalle =
      v.metodo_pago_detalle ||
      v.metodoPagoDetalle ||
      resolveMetodoPagoDetalle(obs, obs.metodoPago || v.metodoPago);

    const effectiveMethod = (detalle && String(detalle).trim()) || principal || 'Efectivo';
    counts.set(effectiveMethod, (counts.get(effectiveMethod) || 0) + 1);

    const tipoEntregaRaw = String(
      obs.tipoEntrega ||
      v.tipoEntrega ||
      (String(v.tipoVenta || '').toUpperCase() === 'DOMICILIO' ? 'Domicilio' : 'En Mesa')
    ).toLowerCase();

    if (tipoEntregaRaw.includes('domicilio') || tipoEntregaRaw.includes('delivery')) {
      domicilioCount++;
    } else {
      localCount++;
    }
  }

  const totalCompras = list.length;
  const desglosePagos = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([metodo, cantidad]) => ({
      metodo,
      cantidad,
      porcentaje: Math.round((cantidad / totalCompras) * 100)
    }));

  const top = desglosePagos[0];
  const preferenciaEntrega = domicilioCount >= localCount ? 'A Domicilio' : 'En Mesa';

  return {
    tieneCompras: true,
    totalCompras,
    metodoPagoFavorito: top ? top.metodo : null,
    metodoPagoPorcentaje: top ? top.porcentaje : 0,
    preferenciaEntrega,
    desglosePagos
  };
}

module.exports = {
  WOMPI_PAYMENT_METHOD_LABELS,
  mapWompiPaymentMethodType,
  normalizePrincipalPaymentMethod,
  resolveMetodoPagoDetalle,
  computeClientPurchasePreferences
};
