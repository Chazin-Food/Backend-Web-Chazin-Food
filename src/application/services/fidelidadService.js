/**
 * Servicio Centralizado de Fidelización de Clientes (Ficha de Proyecto Chazin Food — SENA 3209616)
 * Regla oficial aprobada:
 * - Por cada 3 compras acumuladas (3ª, 6ª, 9ª, ...), el cliente desbloquea un descuento del 15%
 *   aplicable automáticamente en su siguiente compra (4ª, 7ª, 10ª, ...).
 * - Al utilizar el 15% en esa siguiente compra, el beneficio se consume y comienza un nuevo ciclo de 3 compras.
 * - Conserva etiquetas de nivel (Nuevo / Regular / Frecuente / VIP) por historial acumulado para la UI.
 */

const COMPRAS_PARA_BENEFICIO = 3;
const DESCUENTO_OFICIAL_PCT = 15;

function resolveTierLabel(comprasTotales = 0) {
  const n = Math.max(0, Number(comprasTotales || 0));
  if (n >= 9) return 'VIP';
  if (n >= 6) return 'Frecuente';
  if (n >= 3) return 'Regular';
  return 'Nuevo';
}

function resolveTierDiscount(tipo = 'Nuevo') {
  const t = String(tipo || 'Nuevo').toLowerCase();
  if (t.includes('vip')) return 15;
  if (t.includes('frecuente')) return 10;
  if (t.includes('regular')) return 5;
  return 0;
}

function resolveNextLevelLabel(tipo = 'Nuevo') {
  const t = String(tipo || 'Nuevo').toLowerCase();
  if (t.includes('vip')) return 'nivel VIP 15% OFF';
  if (t.includes('frecuente')) return 'nivel VIP 15% OFF al completar 3 compras';
  if (t.includes('regular')) return 'nivel Frecuente 10% OFF al completar 3 compras';
  return 'nivel Regular 5% OFF al completar 3 compras';
}

class FidelidadService {
  /**
   * Evalúa el estado actual de fidelidad de un cliente según la regla oficial (15% tras cada 3 compras).
   */
  static evaluarEstadoFidelidad(fidelidadData = {}, totalVentasReales = 0) {
    const comprasTotales = Math.max(
      0,
      Number(
        fidelidadData?.comprasTotales !== undefined
          ? fidelidadData.comprasTotales
          : totalVentasReales || 0
      )
    );

    const hasExplicitD15 =
      fidelidadData?.descuentoDisponible !== undefined ||
      fidelidadData?.d15 !== undefined;

    let descuentoDisponible = hasExplicitD15
      ? Boolean(
          fidelidadData.descuentoDisponible !== undefined
            ? fidelidadData.descuentoDisponible
            : fidelidadData.d15
        )
      : comprasTotales > 0 && comprasTotales % COMPRAS_PARA_BENEFICIO === 0;

    let comprasCiclo =
      fidelidadData?.comprasCiclo !== undefined
        ? Number(fidelidadData.comprasCiclo)
        : fidelidadData?.ciclo !== undefined
        ? Number(fidelidadData.ciclo)
        : comprasTotales % COMPRAS_PARA_BENEFICIO;

    if (!Number.isFinite(comprasCiclo) || comprasCiclo < 0) comprasCiclo = 0;
    comprasCiclo = comprasCiclo % COMPRAS_PARA_BENEFICIO;

    const descuentoPorcentaje = descuentoDisponible ? DESCUENTO_OFICIAL_PCT : 0;
    const comprasFaltantes = descuentoDisponible
      ? 0
      : COMPRAS_PARA_BENEFICIO - comprasCiclo;
    const progresoPorcentaje = descuentoDisponible
      ? 100
      : Math.min(100, Math.round((comprasCiclo / COMPRAS_PARA_BENEFICIO) * 100));

    const tipo = descuentoDisponible ? 'VIP' : resolveTierLabel(comprasTotales);
    const descuentoNivel = resolveTierDiscount(tipo);

    return {
      tipo,
      nivelHistorial: resolveTierLabel(comprasTotales),
      descuentoDisponible,
      descuentoPorcentaje,
      descuentoNivel,
      comprasCiclo,
      comprasTotales,
      comprasFaltantes,
      comprasMeta: COMPRAS_PARA_BENEFICIO,
      progresoPorcentaje,
      siguienteNivel: descuentoDisponible ? '15% OFF disponible en tu próxima compra' : resolveNextLevelLabel(tipo),
      fechaInicioNivel: null,
      fechaVencimientoNivel: null,
      diasRestantes: null,
      enGracia: false,
      diasGraciaRestantes: 0,
      estadoCiclo: descuentoDisponible ? 'BENEFICIO_DISPONIBLE' : 'ACUMULANDO'
    };
  }

  /**
   * Registra una compra aprobada/completada y actualiza el contador de ciclo (3 compras → 15% siguiente compra).
   */
  static registrarCompra(fidelidadActual = {}, nowOrOptions = new Date()) {
    const estado = this.evaluarEstadoFidelidad(fidelidadActual, fidelidadActual?.comprasTotales || 0);
    const comprasTotales = estado.comprasTotales + 1;

    let descuentoDisponible = estado.descuentoDisponible;
    let comprasCiclo = estado.comprasCiclo;
    let desbloqueoBeneficio = false;
    let consumioBeneficio = false;

    if (descuentoDisponible) {
      // Esta compra utilizó el 15% desbloqueado tras las 3 compras anteriores;
      // cuenta como compra 1 de 3 del nuevo ciclo.
      consumioBeneficio = true;
      descuentoDisponible = false;
      comprasCiclo = 1;
    } else {
      comprasCiclo += 1;
      if (comprasCiclo >= COMPRAS_PARA_BENEFICIO) {
        // Completó 3 compras → desbloquea 15% para la siguiente compra
        descuentoDisponible = true;
        desbloqueoBeneficio = true;
        comprasCiclo = 0;
      }
    }

    const descuentoPorcentaje = descuentoDisponible ? DESCUENTO_OFICIAL_PCT : 0;
    const comprasFaltantes = descuentoDisponible ? 0 : COMPRAS_PARA_BENEFICIO - comprasCiclo;
    const progresoPorcentaje = descuentoDisponible
      ? 100
      : Math.round((comprasCiclo / COMPRAS_PARA_BENEFICIO) * 100);

    const tipoNuevo = descuentoDisponible ? 'VIP' : resolveTierLabel(comprasTotales);
    const descuentoNivel = resolveTierDiscount(tipoNuevo);

    return {
      tipo: tipoNuevo,
      nivelHistorial: resolveTierLabel(comprasTotales),
      descuentoDisponible,
      descuentoPorcentaje,
      descuentoNivel,
      comprasCiclo,
      comprasTotales,
      comprasFaltantes,
      comprasMeta: COMPRAS_PARA_BENEFICIO,
      progresoPorcentaje,
      siguienteNivel: descuentoDisponible ? '15% OFF disponible en tu próxima compra' : resolveNextLevelLabel(tipoNuevo),
      fechaInicioNivel: null,
      fechaVencimientoNivel: null,
      diasRestantes: null,
      enGracia: false,
      diasGraciaRestantes: 0,
      estadoCiclo: descuentoDisponible ? 'BENEFICIO_DISPONIBLE' : 'ACUMULANDO',
      ascendio: desbloqueoBeneficio,
      renovo: consumioBeneficio
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
