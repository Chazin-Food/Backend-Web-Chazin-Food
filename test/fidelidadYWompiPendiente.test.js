const test = require('node:test');
const assert = require('node:assert/strict');

const FidelidadService = require('../src/application/services/fidelidadService');
const ClienteService = require('../src/application/services/clienteService');
const VentaService = require('../src/application/services/ventaService');
const models = require('../src/persistence/models');

test('FidelidadService: progresión estricta paso a paso (Nuevo 0% -> Regular 5% -> Frecuente 10% -> VIP 15%)', () => {
  const cases = [
    { compras: 0, tipo: 'Nuevo', desc: 0, ciclo: 0, faltan: 3 },
    { compras: 1, tipo: 'Nuevo', desc: 0, ciclo: 1, faltan: 2 },
    { compras: 2, tipo: 'Nuevo', desc: 0, ciclo: 2, faltan: 1 },
    { compras: 3, tipo: 'Regular', desc: 5, ciclo: 0, faltan: 3 },
    { compras: 4, tipo: 'Regular', desc: 5, ciclo: 1, faltan: 2 },
    { compras: 5, tipo: 'Regular', desc: 5, ciclo: 2, faltan: 1 },
    { compras: 6, tipo: 'Frecuente', desc: 10, ciclo: 0, faltan: 3 },
    { compras: 7, tipo: 'Frecuente', desc: 10, ciclo: 1, faltan: 2 },
    { compras: 8, tipo: 'Frecuente', desc: 10, ciclo: 2, faltan: 1 },
    { compras: 9, tipo: 'VIP', desc: 15, ciclo: 0, faltan: 3 },
    { compras: 13, tipo: 'VIP', desc: 15, ciclo: 1, faltan: 2 }
  ];

  for (const tc of cases) {
    const res = FidelidadService.evaluarEstadoFidelidad({}, tc.compras);
    assert.equal(res.tipo, tc.tipo, `Con ${tc.compras} compras debe ser ${tc.tipo}`);
    assert.equal(res.descuentoPorcentaje, tc.desc, `Con ${tc.compras} compras debe tener ${tc.desc}%`);
    assert.equal(res.comprasCiclo, tc.ciclo, `Ciclo incorrecto con ${tc.compras} compras`);
    assert.equal(res.comprasFaltantes, tc.faltan, `Faltantes incorrectas con ${tc.compras} compras`);
  }
});

test('FidelidadService: cuenta existente contaminada con d15=true/tipo=VIP pero 0 compras reales vuelve a Nuevo', () => {
  const res = FidelidadService.evaluarEstadoFidelidad(
    { tipo: 'VIP', d15: true, descuentoDisponible: true, ciclo: 0, comprasTotales: 0 },
    0
  );
  assert.equal(res.tipo, 'Nuevo');
  assert.equal(res.descuentoPorcentaje, 0);
  assert.equal(res.descuentoDisponible, false);
  assert.equal(res.comprasCiclo, 0);
  assert.equal(res.comprasFaltantes, 3);
  assert.equal(res.siguienteNivel, 'nivel Regular 5% OFF al completar 3 compras');
});

test('ClienteService.formatCliente: ignora intenciones Wompi PENDIENTE, canceladas y devoluciones (no sube a VIP)', async () => {
  const origFindAll = models.Venta.findAll;
  try {
    // Simular BD devolviendo ventas que incluyen Wompi PENDIENTE sin pagar, CANCELADO y esDevolucion
    const mixedVentas = [
      { idVenta: 101, idCliente: 50, estadoEntrega: 'PENDIENTE', estadoAprobacion: 'PENDIENTE', total: 25000, observaciones: JSON.stringify({ wompiReference: 'CHAZIN-1', estadoPago: 'Pendiente' }), detalles: [] },
      { idVenta: 102, idCliente: 50, estadoEntrega: 'PENDIENTE', estadoAprobacion: 'PENDIENTE', total: 25000, observaciones: JSON.stringify({ wompiReference: 'CHAZIN-2', estadoPago: 'Pendiente' }), detalles: [] },
      { idVenta: 103, idCliente: 50, estadoEntrega: 'PENDIENTE', estadoAprobacion: 'PENDIENTE', total: 25000, observaciones: JSON.stringify({ wompiReference: 'CHAZIN-3', estadoPago: 'Pendiente' }), detalles: [] },
      { idVenta: 104, idCliente: 50, estadoEntrega: 'CANCELADO', estadoAprobacion: 'RECHAZADO', total: 25000, observaciones: JSON.stringify({ wompiReference: 'CHAZIN-4', estadoPago: 'Cancelado' }), detalles: [] },
      { idVenta: 105, idCliente: 50, estadoEntrega: 'ENTREGADO', estadoAprobacion: 'APROBADO', total: 0, observaciones: JSON.stringify({ esDevolucion: true }), detalles: [] }
    ];

    // Verificar filtro cuando preloadedVentas trae órdenes sin pagar/canceladas
    const mockCliente = {
      idCliente: 50,
      idUsuario: 99,
      estado: 1,
      direccion: JSON.stringify({ direccion: 'CR 90B 76 C 06', tipo: 'VIP', d15: true, ciclo: 0 }),
      usuario: {
        idUsuario: 99,
        nombre: 'Samuel',
        apellidos: 'Gutiérrez Franco',
        email: 'samu36669@gmail.com',
        telefono: '3026998087',
        estado: 'ACTIVO',
        idRol: 4
      }
    };

    const formatted = await ClienteService.formatCliente(mockCliente, mixedVentas);
    assert.equal(formatted.compras, 0, 'Ninguna intención pendiente, cancelada o devolución debe contar como compra');
    assert.equal(formatted.tipo, 'Nuevo', 'Debe permanecer en Nuevo (jamás VIP)');
    assert.equal(formatted.descuentoPorcentaje, 0);
    assert.equal(formatted.fidelidad.comprasCiclo, 0);
    assert.equal(formatted.fidelidad.comprasFaltantes, 3);

    // También verificar que la consulta SQL directa de formatCliente exige estadoAprobacion: APROBADO
    let capturedWhere = null;
    models.Venta.findAll = async (opts) => {
      capturedWhere = opts.where;
      return [];
    };
    await ClienteService.formatCliente(mockCliente);
    assert.equal(capturedWhere.estadoAprobacion, 'APROBADO');
  } finally {
    models.Venta.findAll = origFindAll;
  }
});

test('VentaService.registrarFidelidadUnaVez: rechaza ventas PENDIENTE, CANCELADO o esDevolucion', async () => {
  const origTx = models.sequelize.transaction;
  const origFindByPk = models.Venta.findByPk;
  const origRegCli = ClienteService.registrarCompraFidelidad;
  let calledRegistrar = false;

  try {
    models.sequelize.transaction = async () => ({
      LOCK: { UPDATE: 'UPDATE' },
      commit: async () => {},
      rollback: async () => {}
    });
    ClienteService.registrarCompraFidelidad = async () => {
      calledRegistrar = true;
      return {};
    };

    for (const fakeVenta of [
      { idVenta: 1, idCliente: 50, estadoEntrega: 'PENDIENTE', estadoAprobacion: 'PENDIENTE', observaciones: '{}' },
      { idVenta: 2, idCliente: 50, estadoEntrega: 'CANCELADO', estadoAprobacion: 'RECHAZADO', observaciones: '{}' },
      { idVenta: 3, idCliente: 50, estadoEntrega: 'ENTREGADO', estadoAprobacion: 'APROBADO', observaciones: JSON.stringify({ esDevolucion: true }) }
    ]) {
      models.Venta.findByPk = async () => fakeVenta;
      const result = await VentaService.registrarFidelidadUnaVez(fakeVenta.idVenta);
      assert.equal(result, false);
    }
    assert.equal(calledRegistrar, false, 'Nunca debe llamar a registrarCompraFidelidad en ventas no aprobadas');
  } finally {
    models.sequelize.transaction = origTx;
    models.Venta.findByPk = origFindByPk;
    ClienteService.registrarCompraFidelidad = origRegCli;
  }
});

test('FidelidadService: calcula dinámicamente los días reales restantes de vigencia, gracia y vencimiento', () => {
  const now = new Date('2026-11-22T15:00:00.000Z');
  const daysAgo = (d) => new Date(now.getTime() - d * 86400000).toISOString();

  // Frecuente con última compra hace 12 días -> 18 días restantes (no fijo en 30)
  const frecActivo = FidelidadService.evaluarEstadoFidelidad({ ultimaCompraFecha: daysAgo(12) }, 6, now);
  assert.equal(frecActivo.tipo, 'Frecuente');
  assert.equal(frecActivo.diasRestantes, 18);
  assert.equal(frecActivo.enGracia, false);
  assert.equal(frecActivo.expirado, false);
  assert.ok(frecActivo.fechaVencimientoNivel);

  // VIP con última compra hace 35 días -> 5 días vencido dentro de 15d de gracia -> Gracia: 10d
  const vipGracia = FidelidadService.evaluarEstadoFidelidad({ ultimaCompraFecha: daysAgo(35) }, 10, now);
  assert.equal(vipGracia.tipo, 'VIP');
  assert.equal(vipGracia.diasRestantes, 0);
  assert.equal(vipGracia.enGracia, true);
  assert.equal(vipGracia.diasGraciaRestantes, 10);
  assert.equal(vipGracia.expirado, false);

  // Frecuente con última compra hace 45 días -> superó 30d + 10d de gracia -> expirado
  const frecExp = FidelidadService.evaluarEstadoFidelidad({ ultimaCompraFecha: daysAgo(45) }, 6, now);
  assert.equal(frecExp.diasRestantes, 0);
  assert.equal(frecExp.enGracia, false);
  assert.equal(frecExp.expirado, true);

  // Nuevo -> sin vencimiento (null)
  const nuevo = FidelidadService.evaluarEstadoFidelidad({ ultimaCompraFecha: daysAgo(5) }, 1, now);
  assert.equal(nuevo.tipo, 'Nuevo');
  assert.equal(nuevo.diasRestantes, null);
  assert.equal(nuevo.fechaVencimientoNivel, null);
});

test('VentaService.isUnpaidWompiIntention y _applyFilters excluyen intenciones Wompi no pagadas/abandonadas', () => {
  const { Op } = require('sequelize');

  // 1. Intención Wompi recién abierta sin elegir método de pago (PENDIENTE, sin wompiTransactionId)
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      estadoEntrega: 'PENDIENTE',
      estadoAprobacion: 'PENDIENTE',
      observaciones: JSON.stringify({ wompiReference: 'CHAZIN-1234', estadoPago: 'Pendiente' })
    }),
    true
  );

  // 2. Intención Wompi cerrada por el usuario (cancelada y marcada wompiAbandonada: true)
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      estadoEntrega: 'CANCELADO',
      estadoAprobacion: 'RECHAZADO',
      observaciones: JSON.stringify({ wompiReference: 'CHAZIN-1235', wompiAbandonada: true, estadoPago: 'Cancelado' })
    }),
    true
  );

  // 2b. Intención Wompi legacy (sin wompiReference porque create la omitía, solo montoEnCentavos/Wompi/ONLINE)
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      tipoVenta: 'DOMICILIO',
      origen: 'ONLINE',
      estadoEntrega: 'CANCELADO',
      estadoAprobacion: 'RECHAZADO',
      observaciones: JSON.stringify({ origen: 'ONLINE', metodoPago: 'Wompi', montoEnCentavos: 1955000, estadoPago: 'Pendiente' })
    }),
    true
  );

  // 3. Pago Wompi real aprobado -> NO se excluye
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      estadoEntrega: 'PENDIENTE',
      estadoAprobacion: 'APROBADO',
      observaciones: JSON.stringify({ wompiReference: 'CHAZIN-1236', wompiTransactionId: '112233-tx', estadoPago: 'Pagado' })
    }),
    false
  );

  // 4. Pago Wompi real en verificación bancaria (tiene wompiTransactionId) -> NO se excluye
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      estadoEntrega: 'PENDIENTE',
      estadoAprobacion: 'PENDIENTE',
      observaciones: JSON.stringify({ wompiReference: 'CHAZIN-1237', wompiTransactionId: '445566-tx', wompiStatus: 'PENDING' })
    }),
    false
  );

  // 5. Venta presencial POS en Efectivo -> NO se excluye
  assert.equal(
    VentaService.isUnpaidWompiIntention({
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      observaciones: JSON.stringify({ origen: 'PUNTO_FISICO', metodoPago: 'Efectivo', estadoPago: 'Pagado' })
    }),
    false
  );

  // 6. _applyFilters inyecta las cláusulas SQL de exclusión por defecto
  const where = {};
  VentaService._applyFilters(where, {}, Op);
  assert.ok(Array.isArray(where[Op.and]) && where[Op.and].length >= 2);
});

test('VentaService.getStats se alinea con Dashboard (excluye anuladas/pendientes/devoluciones) y devuelve frecuenciaDiaria', async () => {
  const { Venta } = require('../src/persistence/models');
  const origFindAll = Venta.findAll;
  const nowIso = new Date().toISOString();
  const sampleRows = [
    // Válida aprobada POS
    { idVenta: 1, idCliente: 10, fechaVenta: nowIso, tipoVenta: 'PUNTO_DE_VENTA', origen: 'PUNTO_FISICO', subtotal: 30000, total: 27000, descuentoAplicado: 3000, estadoEntrega: 'ENTREGADO', estadoAprobacion: 'APROBADO', observaciones: JSON.stringify({ metodoPago: 'Efectivo' }) },
    // Válida aprobada Wompi
    { idVenta: 2, idCliente: 10, fechaVenta: nowIso, tipoVenta: 'DOMICILIO', origen: 'ONLINE', subtotal: 20000, total: 20000, descuentoAplicado: 0, estadoEntrega: 'PREPARANDO', estadoAprobacion: 'APROBADO', observaciones: JSON.stringify({ metodoPago: 'Wompi', wompiTransactionId: 'tx-1' }) },
    // Anulada (NO debe sumar)
    { idVenta: 3, idCliente: 11, fechaVenta: nowIso, tipoVenta: 'PUNTO_DE_VENTA', origen: 'PUNTO_FISICO', subtotal: 50000, total: 50000, descuentoAplicado: 0, estadoEntrega: 'CANCELADO', estadoAprobacion: 'RECHAZADO', observaciones: JSON.stringify({ metodoPago: 'Efectivo' }) },
    // Pendiente de aprobación (NO debe sumar)
    { idVenta: 4, idCliente: 12, fechaVenta: nowIso, tipoVenta: 'DOMICILIO', origen: 'ONLINE', subtotal: 40000, total: 40000, descuentoAplicado: 0, estadoEntrega: 'PENDIENTE', estadoAprobacion: 'PENDIENTE', observaciones: JSON.stringify({ metodoPago: 'Wompi', wompiTransactionId: 'tx-pending' }) },
    // Devolución (NO debe sumar)
    { idVenta: 5, idCliente: 10, fechaVenta: nowIso, tipoVenta: 'PUNTO_DE_VENTA', origen: 'PUNTO_FISICO', subtotal: 15000, total: 15000, descuentoAplicado: 0, estadoEntrega: 'ENTREGADO', estadoAprobacion: 'APROBADO', observaciones: JSON.stringify({ esDevolucion: true }) }
  ];

  Venta.findAll = async () => sampleRows;
  try {
    const stats = await VentaService.getStats({ periodo: '7_dias' });
    assert.equal(stats.totalVentas, 47000);
    assert.equal(stats.pedidosCount, 2);
    assert.equal(stats.ticketPromedio, 23500);
    assert.equal(stats.totalDescuentos, 3000);
    assert.equal(stats.tasaDescuento, 6.0);
    assert.equal(stats.frecuenciaCompra, 2.0);
    assert.equal(stats.frecuenciaDiaria, '0.3');
    assert.equal(stats.uniqueDays, 1);
  } finally {
    Venta.findAll = origFindAll;
  }
});
