/**
 * Servicio Centralizado de Fidelización de Clientes (Chazin Food)
 * Progresión oficial estricta basada únicamente en compras reales pagadas y aprobadas:
 * - Nuevo:     0 a 2 compras aprobadas ->  0% OFF (3 compras para ascender a Regular 5%)
 * - Regular:   3 a 5 compras aprobadas ->  5% OFF (3 compras para ascender a Frecuente 10%)
 * - Frecuente: 6 a 8 compras aprobadas -> 10% OFF (3 compras para ascender a VIP 15%)
 * - VIP:       9+ compras aprobadas    -> 15% OFF (3 compras para renovar ciclo VIP)
 */

const COMPRAS_PARA_BENEFICIO = 3;

const TIER_RANK = {
  Nuevo: 0,
  Regular: 1,
  Frecuente: 2,
  VIP: 3
};

function normalizeTierLabel(tipo = 'Nuevo') {
  const t = String(tipo || 'Nuevo').toLowerCase().trim();
  if (t.includes('vip')) return 'VIP';
  if (t.includes('frecuente')) return 'Frecuente';
  if (t.includes('regular')) return 'Regular';
  return 'Nuevo';
}

function resolveTierLabel(comprasTotales = 0) {
  const n = Math.max(0, Number(comprasTotales || 0));
  if (n >= 9) return 'VIP';
  if (n >= 6) return 'Frecuente';
  if (n >= 3) return 'Regular';
  return 'Nuevo';
}

function resolveTierDiscount(tipo = 'Nuevo') {
  const t = normalizeTierLabel(tipo);
  if (t === 'VIP') return 15;
  if (t === 'Frecuente') return 10;
  if (t === 'Regular') return 5;
  return 0;
}

function resolveNextLevelLabel(tipo = 'Nuevo') {
  const t = normalizeTierLabel(tipo);
  if (t === 'VIP') return 'nivel VIP 15% OFF';
  if (t === 'Frecuente') return 'nivel VIP 15% OFF al completar 3 compras';
  if (t === 'Regular') return 'nivel Frecuente 10% OFF al completar 3 compras';
  return 'nivel Regular 5% OFF al completar 3 compras';
}

class FidelidadService {
  /**
   * Evalúa el estado actual de fidelidad de un cliente usando estrictamente
   * el total de compras reales aprobadas (nunca órdenes pendientes de pago o canceladas).
   */
  static evaluarEstadoFidelidad(fidelidadData = {}, totalVentasReales = undefined) {
    const rawCount =
      totalVentasReales !== undefined && totalVentasReales !== null && Number.isFinite(Number(totalVentasReales))
        ? Number(totalVentasReales)
        : Number(fidelidadData?.comprasTotales || 0);
    const comprasTotales = Math.max(0, Math.floor(Number.isFinite(rawCount) ? rawCount : 0));

    const tierByPurchases = resolveTierLabel(comprasTotales);

    // Respetar un nivel manual únicamente cuando fue asignado explícitamente por un administrador (manualTipo === true)
    let tipo = tierByPurchases;
    if (fidelidadData?.manualTipo === true && fidelidadData?.tipo) {
      const manualNormalized = normalizeTierLabel(fidelidadData.tipo);
      if ((TIER_RANK[manualNormalized] ?? 0) > (TIER_RANK[tierByPurchases] ?? 0)) {
        tipo = manualNormalized;
      }
    }

    const descuentoNivel = resolveTierDiscount(tipo);
    const descuentoPorcentaje = descuentoNivel;
    const descuentoDisponible = descuentoPorcentaje > 0;

    const comprasCiclo = comprasTotales % COMPRAS_PARA_BENEFICIO;
    const comprasFaltantes = COMPRAS_PARA_BENEFICIO - comprasCiclo;
    const progresoPorcentaje = Math.min(100, Math.round((comprasCiclo / COMPRAS_PARA_BENEFICIO) * 100));

    return {
      tipo,
      nivelHistorial: tierByPurchases,
      descuentoDisponible,
      descuentoPorcentaje,
      descuentoNivel,
      comprasCiclo,
      comprasTotales,
      comprasFaltantes,
      comprasMeta: COMPRAS_PARA_BENEFICIO,
      progresoPorcentaje,
      siguienteNivel: resolveNextLevelLabel(tipo),
      fechaInicioNivel: tipo !== 'Nuevo' ? (fidelidadData?.fechaInicioNivel || fidelidadData?.inicio || null) : null,
      fechaVencimientoNivel: tipo !== 'Nuevo' ? (fidelidadData?.fechaVencimientoNivel || fidelidadData?.vence || null) : null,
      diasRestantes: tipo !== 'Nuevo' ? 30 : null,
      enGracia: false,
      diasGraciaRestantes: 0,
      estadoCiclo: descuentoDisponible ? 'BENEFICIO_DISPONIBLE' : 'ACUMULANDO'
    };
  }

  /**
   * Registra una compra aprobada/completada y actualiza la progresión progresiva por niveles.
   */
  static registrarCompra(fidelidadActual = {}, totalVentasRealesOverride = undefined) {
    const prevCompras = Math.max(0, Math.floor(Number(fidelidadActual?.comprasTotales || 0)));
    const estadoPrevio = this.evaluarEstadoFidelidad(fidelidadActual, prevCompras);

    const comprasTotales =
      totalVentasRealesOverride !== undefined &&
      totalVentasRealesOverride !== null &&
      Number.isFinite(Number(totalVentasRealesOverride))
        ? Math.max(0, Math.floor(Number(totalVentasRealesOverride)))
        : prevCompras + 1;

    const nuevoEstado = this.evaluarEstadoFidelidad(fidelidadActual, comprasTotales);
    const ascendio = (TIER_RANK[nuevoEstado.tipo] ?? 0) > (TIER_RANK[estadoPrevio.tipo] ?? 0);
    const renovo = nuevoEstado.tipo === 'VIP' && comprasTotales > 9 && comprasTotales % COMPRAS_PARA_BENEFICIO === 0;

    return {
      ...nuevoEstado,
      ascendio,
      renovo
    };
  }

  /**
   * Catálogo informativo del programa oficial de fidelización (Ficha SENA 3209616).
   */
  static getCatalogoNiveles() {
    return [
      {
        nivel: 'Nuevo',
        descuento: 0,
        badge: '🌱',
        descripcion: 'Acumula 3 compras con tu cuenta registrada para ascender al nivel Regular (5% OFF).',
        requisito: '1 a 2 compras en el ciclo',
        duracion: 'Sin vencimiento de ciclo'
      },
      {
        nivel: 'Beneficio 15% (Cada 3 compras)',
        descuento: 15,
        badge: '🥇',
        descripcion: '15% de descuento automático en tu siguiente compra al completar cada 3 compras.',
        requisito: 'Cada 3 compras acumuladas (3ª, 6ª, 9ª, ...)',
        duracion: 'Aplicable en tu siguiente compra y renovable cada 3 compras'
      }
    ];
  }
}

module.exports = FidelidadService;
