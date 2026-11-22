/**
 * Servicio Centralizado de Fidelización de Clientes (Chazin Food)
 * Progresión oficial estricta basada únicamente en compras reales pagadas y aprobadas:
 * - Nuevo:     0 a 2 compras aprobadas ->  0% OFF (3 compras para ascender a Regular 5%)
 * - Regular:   3 a 5 compras aprobadas ->  5% OFF (3 compras para ascender a Frecuente 10%)
 * - Frecuente: 6 a 8 compras aprobadas -> 10% OFF (3 compras para ascender a VIP 15%)
 * - VIP:       9+ compras aprobadas    -> 15% OFF (3 compras para renovar ciclo VIP)
 */

const COMPRAS_PARA_BENEFICIO = 3;
const VIGENCIA_NIVEL_DIAS = 30;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const TIER_RANK = {
  Nuevo: 0,
  Regular: 1,
  Frecuente: 2,
  VIP: 3
};

function parseDateSafe(val) {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T23:59:59-05:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

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
   * el total de compras reales aprobadas (nunca órdenes pendientes de pago o canceladas)
   * y calcula dinámicamente los días reales restantes de vigencia (30d) y periodo de gracia.
   */
  static evaluarEstadoFidelidad(fidelidadData = {}, totalVentasReales = undefined, nowDate = new Date()) {
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

    // Cálculo dinámico real de vigencia (30 días desde última compra aprobada o fecha de inicio/vencimiento del nivel)
    let fechaInicioNivel = null;
    let fechaVencimientoNivel = null;
    let diasRestantes = null;
    let enGracia = false;
    let diasGraciaRestantes = 0;
    let expirado = false;

    if (tipo !== 'Nuevo') {
      const nowMs = (nowDate instanceof Date ? nowDate : new Date(nowDate || Date.now())).getTime();
      const explicitVence = parseDateSafe(fidelidadData?.fechaVencimientoNivel || fidelidadData?.vence);
      const explicitInicio = parseDateSafe(fidelidadData?.fechaInicioNivel || fidelidadData?.inicio);
      const ultimaCompra = parseDateSafe(fidelidadData?.ultimaCompraFecha);

      const candidateVences = [];
      if (explicitVence) candidateVences.push(explicitVence.getTime());
      if (explicitInicio) candidateVences.push(explicitInicio.getTime() + VIGENCIA_NIVEL_DIAS * MS_PER_DAY);
      if (ultimaCompra) candidateVences.push(ultimaCompra.getTime() + VIGENCIA_NIVEL_DIAS * MS_PER_DAY);

      if (candidateVences.length > 0) {
        const venceMs = Math.max(...candidateVences);
        const inicioMs = ultimaCompra
          ? Math.max(ultimaCompra.getTime(), explicitInicio ? explicitInicio.getTime() : 0)
          : (explicitInicio ? explicitInicio.getTime() : venceMs - VIGENCIA_NIVEL_DIAS * MS_PER_DAY);

        fechaInicioNivel = new Date(inicioMs).toISOString();
        fechaVencimientoNivel = new Date(venceMs).toISOString();

        const diffMs = venceMs - nowMs;
        if (diffMs > 0) {
          diasRestantes = Math.min(VIGENCIA_NIVEL_DIAS, Math.max(1, Math.ceil(diffMs / MS_PER_DAY)));
        } else {
          const limiteGraciaDias = tipo === 'VIP' ? 15 : (tipo === 'Frecuente' ? 10 : 0);
          const msExpirado = Math.abs(diffMs);
          const limiteGraciaMs = limiteGraciaDias * MS_PER_DAY;
          diasRestantes = 0;
          if (limiteGraciaDias > 0 && msExpirado < limiteGraciaMs) {
            enGracia = true;
            diasGraciaRestantes = Math.max(1, Math.ceil((limiteGraciaMs - msExpirado) / MS_PER_DAY));
          } else {
            expirado = true;
          }
        }
      } else {
        diasRestantes = VIGENCIA_NIVEL_DIAS;
      }
    }

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
      fechaInicioNivel,
      fechaVencimientoNivel,
      diasRestantes,
      enGracia,
      diasGraciaRestantes,
      expirado,
      estadoCiclo: expirado ? 'VENCIDO' : enGracia ? 'EN_GRACIA' : (descuentoDisponible ? 'BENEFICIO_DISPONIBLE' : 'ACUMULANDO')
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
