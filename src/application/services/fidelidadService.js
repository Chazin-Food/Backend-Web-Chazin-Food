/**
 * Servicio Centralizado de Fidelización de Clientes (Loyalty & Streak Engine)
 * Reglas de negocio:
 * - Nuevo (0% desc): Requiere 3 compras para subir a Regular.
 * - Regular (5% desc): Dura 1 mes (30 días). Si expira sin compras, baja a Nuevo (sin días de gracia extra).
 * - Frecuente (10% desc): Requiere 3 compras en Regular. Dura 1 mes (30 días). Al expirar, tiene 10 días de gracia; si vence, baja a Regular.
 * - VIP (15% desc): Requiere 3 compras en Frecuente. Dura 1 mes (30 días). Al expirar, tiene 15 días de gracia; si vence, baja a Frecuente (con sus 10 días de gracia).
 * - Cada vez que se sube de nivel o se renueva con 3 compras, se restablece el mes (30 días completos).
 */

const { MS_PER_DAY } = require('../../infrastructure/utils/colombiaDateUtils');

const NIVELES_CONFIG = {
  Nuevo: {
    nombre: "Nuevo",
    descuento: 0,
    comprasParaSubir: 3,
    siguienteNivel: "Regular",
    diasVigencia: null,
    diasGracia: 0,
    nivelInferior: "Nuevo"
  },
  Regular: {
    nombre: "Regular",
    descuento: 5,
    comprasParaSubir: 3,
    siguienteNivel: "Frecuente",
    diasVigencia: 30,
    diasGracia: 0,
    nivelInferior: "Nuevo"
  },
  Frecuente: {
    nombre: "Frecuente",
    descuento: 10,
    comprasParaSubir: 3,
    siguienteNivel: "VIP",
    diasVigencia: 30,
    diasGracia: 10,
    nivelInferior: "Regular"
  },
  VIP: {
    nombre: "VIP",
    descuento: 15,
    comprasParaSubir: 3,
    siguienteNivel: "VIP", // Top tier
    diasVigencia: 30,
    diasGracia: 15,
    nivelInferior: "Frecuente"
  }
};

function normalizeTipoNivel(rawTipo) {
  const t = String(rawTipo || 'Nuevo').trim().toLowerCase();
  if (t === 'regular') return 'Regular';
  if (t === 'frecuente') return 'Frecuente';
  if (t === 'vip') return 'VIP';
  return 'Nuevo';
}

class FidelidadService {
  /**
   * Normaliza y evalúa el estado de fidelidad del cliente según fechas actuales
   */
  static evaluarEstadoFidelidad(fidelidadData = {}, totalVentasReales = 0, now = new Date()) {
    const evalNow = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    let tipo = normalizeTipoNivel(fidelidadData.tipo);

    let comprasCiclo = Number(fidelidadData.comprasCiclo !== undefined ? fidelidadData.comprasCiclo : (fidelidadData.ciclo || 0));
    let comprasTotales = Number(fidelidadData.comprasTotales || totalVentasReales || 0);

    const rawInicio = fidelidadData.fechaInicioNivel || fidelidadData.inicio;
    const rawVence = fidelidadData.fechaVencimientoNivel || fidelidadData.vence;

    const parsedInicio = rawInicio ? new Date(rawInicio) : null;
    let fechaInicio = parsedInicio && !isNaN(parsedInicio.getTime()) ? parsedInicio : (tipo === 'Nuevo' ? null : new Date(evalNow));

    const parsedVence = rawVence ? new Date(rawVence) : null;
    let fechaVencimiento = parsedVence && !isNaN(parsedVence.getTime()) ? parsedVence : null;

    // Si es un cliente antiguo sin fecha de vencimiento pero con nivel asignado
    if (!fechaVencimiento && tipo !== 'Nuevo') {
      fechaVencimiento = new Date(evalNow.getTime() + 30 * MS_PER_DAY);
    }

    let enGracia = false;
    let diasRestantes = null;
    let diasGraciaRestantes = 0;
    let estadoCiclo = 'ACTIVO'; // 'ACTIVO' | 'EN_GRACIA' | 'EXPIRADO'

    const degradarANuevo = () => {
      tipo = 'Nuevo';
      enGracia = false;
      diasGraciaRestantes = 0;
      diasRestantes = null;
      fechaInicio = null;
      fechaVencimiento = null;
      estadoCiclo = 'ACTIVO';
      comprasCiclo = 0;
    };

    const aplicarRegularDesde = (regStartMs, expMs) => {
      const regEndMs = regStartMs + 30 * MS_PER_DAY;
      const msRestantesReg = regEndMs - evalNow.getTime();
      if (msRestantesReg > 0) {
        tipo = 'Regular';
        enGracia = false;
        diasGraciaRestantes = 0;
        diasRestantes = Math.max(1, Math.ceil(msRestantesReg / MS_PER_DAY));
        fechaInicio = new Date(regStartMs);
        fechaVencimiento = new Date(regEndMs);
        estadoCiclo = 'ACTIVO';
        comprasCiclo = 0;
      } else {
        // Superó también los 30 días de vigencia en Regular
        degradarANuevo();
      }
      return expMs;
    };

    // Evaluación para clientes en niveles con vigencia (Regular, Frecuente, VIP)
    if (tipo !== 'Nuevo' && fechaVencimiento) {
      const msDiff = fechaVencimiento.getTime() - evalNow.getTime();

      if (msDiff > 0) {
        // Nivel activo dentro del mes
        diasRestantes = Math.max(1, Math.ceil(msDiff / MS_PER_DAY));
        enGracia = false;
        estadoCiclo = 'ACTIVO';
      } else {
        // El mes venció, evaluar periodos de gracia y cascada con fechas coherentes e idempotentes
        const msExpirado = Math.abs(msDiff);
        const diasExpirado = msExpirado / MS_PER_DAY;
        const vencimientoBaseMs = fechaVencimiento.getTime();

        if (tipo === 'VIP') {
          const limiteGraciaVIP = 15;
          if (diasExpirado <= limiteGraciaVIP) {
            enGracia = true;
            diasGraciaRestantes = Math.max(1, Math.ceil(limiteGraciaVIP - diasExpirado));
            diasRestantes = 0;
            estadoCiclo = 'EN_GRACIA';
          } else {
            // Pasaron los 15 días de gracia de VIP -> Baja a Frecuente (su ventana de gracia de 10d comienza en vencimientoBase + 15d)
            const diasExcedidosFrecuente = diasExpirado - limiteGraciaVIP;
            const limiteGraciaFrecuente = 10;

            if (diasExcedidosFrecuente <= limiteGraciaFrecuente) {
              tipo = 'Frecuente';
              enGracia = true;
              diasGraciaRestantes = Math.max(1, Math.ceil(limiteGraciaFrecuente - diasExcedidosFrecuente));
              diasRestantes = 0;
              // Ajustar vence para que persistir en BD conserve la ventana restante de Frecuente
              fechaVencimiento = new Date(vencimientoBaseMs + limiteGraciaVIP * MS_PER_DAY);
              estadoCiclo = 'EN_GRACIA';
              comprasCiclo = 0;
            } else {
              // Pasaron también los 10 días de gracia de Frecuente -> Baja a Regular (o Nuevo si pasaron 30d más)
              aplicarRegularDesde(vencimientoBaseMs + (limiteGraciaVIP + limiteGraciaFrecuente) * MS_PER_DAY, msExpirado);
            }
          }
        } else if (tipo === 'Frecuente') {
          const limiteGraciaFrecuente = 10;
          if (diasExpirado <= limiteGraciaFrecuente) {
            enGracia = true;
            diasGraciaRestantes = Math.max(1, Math.ceil(limiteGraciaFrecuente - diasExpirado));
            diasRestantes = 0;
            estadoCiclo = 'EN_GRACIA';
          } else {
            // Pasaron los 10 días -> Baja a Regular (o Nuevo si superó 30d en Regular)
            aplicarRegularDesde(vencimientoBaseMs + limiteGraciaFrecuente * MS_PER_DAY, msExpirado);
          }
        } else if (tipo === 'Regular') {
          // Regular no tiene días de gracia extra -> Baja directo a Nuevo
          degradarANuevo();
        }
      }
    } else if (tipo === 'Nuevo') {
      fechaInicio = null;
      fechaVencimiento = null;
      diasRestantes = null;
    }

    const config = NIVELES_CONFIG[tipo] || NIVELES_CONFIG.Nuevo;
    const comprasParaSiguiente = config.comprasParaSubir - (comprasCiclo % config.comprasParaSubir);
    const progresoPorcentaje = Math.min(100, Math.round(((comprasCiclo % config.comprasParaSubir) / config.comprasParaSubir) * 100));

    return {
      tipo,
      descuentoPorcentaje: config.descuento,
      comprasCiclo: comprasCiclo % config.comprasParaSubir,
      comprasTotales,
      comprasFaltantes: comprasParaSiguiente === 0 ? 3 : comprasParaSiguiente,
      comprasMeta: config.comprasParaSubir,
      progresoPorcentaje,
      siguienteNivel: config.siguienteNivel,
      fechaInicioNivel: fechaInicio ? fechaInicio.toISOString() : null,
      fechaVencimientoNivel: fechaVencimiento ? fechaVencimiento.toISOString() : null,
      diasRestantes,
      enGracia,
      diasGraciaRestantes,
      estadoCiclo
    };
  }

  /**
   * Registra una compra aprobada/completada y actualiza el nivel de fidelidad
   */
  static registrarCompra(fidelidadActual = {}, now = new Date()) {
    const evalNow = now instanceof Date && !isNaN(now.getTime()) ? now : new Date();
    const tipoOriginal = normalizeTipoNivel(fidelidadActual?.tipo);
    const estado = this.evaluarEstadoFidelidad(fidelidadActual, 0, evalNow);
    const degrado = estado.tipo !== tipoOriginal;

    let nuevoTipo = estado.tipo;
    let nuevoComprasCiclo = (estado.comprasCiclo || 0) + 1;
    const comprasTotales = (estado.comprasTotales || 0) + 1;
    let ascendio = false;
    let renovo = false;

    // Si compra durante el periodo de gracia, reactiva su nivel con 1 mes limpio
    if (estado.enGracia) {
      renovo = true;
      nuevoComprasCiclo = 1; // 1ra compra de su nuevo ciclo reactivado
    } else if (nuevoComprasCiclo >= 3) {
      if (nuevoTipo === 'Nuevo') {
        nuevoTipo = 'Regular';
        ascendio = true;
      } else if (nuevoTipo === 'Regular') {
        nuevoTipo = 'Frecuente';
        ascendio = true;
      } else if (nuevoTipo === 'Frecuente') {
        nuevoTipo = 'VIP';
        ascendio = true;
      } else if (nuevoTipo === 'VIP') {
        // En VIP se renueva la membresía mensual (no acumula tiempo extra, inicia 30 días limpios)
        nuevoTipo = 'VIP';
        renovo = true;
      }
      nuevoComprasCiclo = 0;
    }

    // Regla de NO SUMAR TIEMPO ACUMULADO:
    // Usar el estado ya evaluado/normalizado para no arrastrar fechas expiradas ni degradadas viejas.
    let nuevaFechaInicio = null;
    let nuevaFechaVencimiento = null;

    if (nuevoTipo !== 'Nuevo') {
      const estadoVence = estado.fechaVencimientoNivel ? new Date(estado.fechaVencimientoNivel) : null;
      const estadoInicio = estado.fechaInicioNivel ? new Date(estado.fechaInicioNivel) : null;
      const venceValido = estadoVence && !isNaN(estadoVence.getTime()) && estadoVence.getTime() > evalNow.getTime();

      if (ascendio || renovo || estado.enGracia || nuevoTipo !== estado.tipo || !venceValido) {
        nuevaFechaInicio = evalNow;
        nuevaFechaVencimiento = new Date(evalNow.getTime() + 30 * MS_PER_DAY);
      } else {
        nuevaFechaInicio = degrado
          ? (estadoInicio || evalNow)
          : (estadoInicio && !isNaN(estadoInicio.getTime()) ? estadoInicio : evalNow);
        nuevaFechaVencimiento = estadoVence;
      }
    }

    const config = NIVELES_CONFIG[nuevoTipo] || NIVELES_CONFIG.Nuevo;
    const diasRestantes = nuevoTipo === 'Nuevo' || !nuevaFechaVencimiento
      ? null
      : Math.max(1, Math.ceil((nuevaFechaVencimiento.getTime() - evalNow.getTime()) / MS_PER_DAY));

    return {
      tipo: nuevoTipo,
      descuentoPorcentaje: config.descuento,
      comprasCiclo: nuevoComprasCiclo,
      comprasTotales,
      comprasFaltantes: 3 - nuevoComprasCiclo,
      comprasMeta: 3,
      progresoPorcentaje: Math.round((nuevoComprasCiclo / 3) * 100),
      siguienteNivel: config.siguienteNivel,
      fechaInicioNivel: nuevaFechaInicio ? nuevaFechaInicio.toISOString() : null,
      fechaVencimientoNivel: nuevaFechaVencimiento ? nuevaFechaVencimiento.toISOString() : null,
      diasRestantes,
      enGracia: false,
      diasGraciaRestantes: 0,
      estadoCiclo: 'ACTIVO',
      ascendio,
      renovo
    };
  }

  /**
   * Obtiene la configuración de todos los niveles para mostrar en la UI
   */
  static getCatalogoNiveles() {
    return [
      {
        nivel: "Nuevo",
        descuento: 0,
        badge: "🌱",
        descripcion: "Nivel inicial para clientes que comienzan su experiencia en Chazin Food.",
        requisito: "0 - 2 compras",
        duracion: "Permanente hasta alcanzar 3 compras"
      },
      {
        nivel: "Regular",
        descuento: 5,
        badge: "🥉",
        descripcion: "5% de descuento en todos tus pedidos.",
        requisito: "3 compras en nivel Nuevo",
        duracion: "1 mes (30 días). Si no compras en el mes, baja a Nuevo."
      },
      {
        nivel: "Frecuente",
        descuento: 10,
        badge: "🥈",
        descripcion: "10% de descuento en todos tus pedidos.",
        requisito: "3 compras en nivel Regular",
        duracion: "1 mes (30 días) + 10 días de gracia extra para mantener la racha."
      },
      {
        nivel: "VIP",
        descuento: 15,
        badge: "🥇",
        descripcion: "15% de descuento exclusivo en todos tus pedidos.",
        requisito: "3 compras en nivel Frecuente",
        duracion: "1 mes (30 días) + 15 días de gracia extra para mantener la racha."
      }
    ];
  }
}

module.exports = FidelidadService;
