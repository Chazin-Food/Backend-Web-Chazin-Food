const {
  Venta,
  Cliente,
  User,
  DetalleVentaProducto,
  Variante,
  Product,
  Devolucion,
  sequelize
} = require('./src/persistence/models');
const DevolucionService = require('./src/application/services/devolucionService');
const VentaService = require('./src/application/services/ventaService');
const { Op } = require('sequelize');

async function testSuiteDevoluciones() {
  console.log('================================================================');
  console.log('   SUITE DE PRUEBAS INTEGRAL: FLUJO DE DEVOLUCIONES COMPLETO   ');
  console.log('   (Cliente, Administrador, Aprobación, Rechazo, Reemplazo)    ');
  console.log('================================================================\n');

  let testsPassed = 0;
  let testsTotal = 0;

  const assert = (condition, msg) => {
    testsTotal++;
    if (!condition) {
      console.error(`❌ FALLÓ TEST ${testsTotal}: ${msg}`);
      throw new Error(`Fallo en prueba: ${msg}`);
    }
    testsPassed++;
    console.log(`✅ [TEST ${testsTotal}] ${msg}`);
  };

  // 0. Preparar cliente y productos de prueba
  console.log('--- FASE 0: Inicialización y Datos de Prueba ---');
  let user = await User.findOne({ where: { email: 'cliente@test.com' } });
  if (!user) {
    user = await User.findOne();
  }
  let adminUser = await User.findOne({ where: { idRol: 1 } }) || user;

  let cliente = await Cliente.findOne({ where: { idUsuario: user.idUsuario } });
  if (!cliente) {
    cliente = await Cliente.findOne();
  }
  assert(cliente && user, 'Se dispone de un cliente y usuario de prueba');

  const variante = await Variante.findOne({
    where: {
      idVariante: { [Op.gt]: 0 },
      precio: { [Op.gt]: 0 }
    },
    include: [{ model: Product, as: 'producto' }]
  });
  assert(variante && variante.producto, `Variante real disponible: "${variante.producto?.nombre} - ${variante.nombre}" ($${variante.precio})`);

  // Helper para crear ventas entregadas
  async function crearVentaEntregada(diasAtras = 0) {
    const fecha = new Date(Date.now() - diasAtras * 24 * 60 * 60 * 1000);
    const v = await Venta.create({
      idUsuario: user.idUsuario,
      idCliente: cliente.idCliente,
      fechaVenta: fecha,
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      subtotal: Number(variante.precio || 15000),
      total: Number(variante.precio || 15000),
      metodoPago: 'Wompi',
      observaciones: JSON.stringify({
        tipoEntrega: 'Domicilio',
        direccion: 'Calle 10 # 45-20, Medellín',
        telefono: '3001234567',
        clienteNombre: `${user.nombre || 'Cliente'} ${user.apellidos || 'Test'}`
      })
    });

    await DetalleVentaProducto.create({
      idVenta: v.idVenta,
      idVariante: variante.idVariante,
      cantidad: 2,
      precioUnitario: Number(variante.precio || 15000),
      subtotal: Number(variante.precio || 15000) * 2
    });

    return await Venta.findByPk(v.idVenta, {
      include: [
        { model: Cliente, as: 'cliente', include: [{ model: User, as: 'usuario' }] },
        { model: DetalleVentaProducto, as: 'detalles', include: [{ model: Variante, as: 'variante', include: [{ model: Product, as: 'producto' }] }] }
      ]
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // ESCENARIO 1: POLÍTICAS Y REGLAS DE ELEGIBILIDAD
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n--- FASE 1: Políticas y Elegibilidad ---');
  const pol = DevolucionService.getPolicies();
  assert(pol.MAX_DIAS === 2 && pol.MAX_HORAS === 48, 'La política estipula exactamente 2 días (48 horas)');
  assert(pol.MOTIVOS.includes('Comida en mal estado') && pol.MOTIVOS.includes('Pedido incorrecto'), 'Motivos válidos incluyen Comida en mal estado y Pedido incorrecto');
  assert(pol.RESOLUCIONES.includes('Cambio de producto') && pol.RESOLUCIONES.includes('Devolución de dinero'), 'Resoluciones válidas contemplan Cambio y Devolución de dinero');

  const ventaReciente = await crearVentaEntregada(0);
  const elegReciente = await DevolucionService.checkVentaElegibilidad(ventaReciente.idVenta);
  assert(elegReciente.elegible === true, 'Venta reciente de hoy es elegible para devolución');

  const ventaVencida = await crearVentaEntregada(3); // 3 días atrás
  const elegVencida = await DevolucionService.checkVentaElegibilidad(ventaVencida.idVenta);
  assert(elegVencida.elegible === false, 'Venta de hace 3 días no es elegible por superar 48h');

  // Intentar crear solicitud de devolución sobre venta vencida debe fallar
  let errorVencida = false;
  try {
    await DevolucionService.create({
      idVenta: ventaVencida.idVenta,
      idCliente: cliente.idCliente,
      motivo: 'Comida en mal estado',
      tipoResolucion: 'Cambio de producto',
      productosDevueltos: [{ idVariante: variante.idVariante, cantidad: 1, precioUnitario: 1000 }]
    }, { idUsuario: user.idUsuario });
  } catch (err) {
    errorVencida = true;
  }
  assert(errorVencida, 'Bloqueo estricto al intentar registrar devolución sobre venta fuera de plazo (>48h)');

  // ══════════════════════════════════════════════════════════════════════════════
  // ESCENARIO 2: FLUJO CAMBIO DE PRODUCTO -> APROBACIÓN -> NUEVA ORDEN DE VENTA
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n--- FASE 2: Solicitud con CAMBIO DE PRODUCTO y Generación de Orden de Venta ---');
  const ventaCambio = await crearVentaEntregada(0);

  const prodDevCambio = [
    {
      idDetalleVenta: ventaCambio.detalles[0].idDetalleVenta,
      idVariante: variante.idVariante,
      nombre: variante.producto.nombre,
      cantidad: 1,
      precioUnitario: Number(variante.precio || 15000)
    }
  ];

  // 2.1 El Cliente crea la solicitud
  const devCambio = await DevolucionService.create({
    idVenta: ventaCambio.idVenta,
    idCliente: cliente.idCliente,
    motivo: 'Comida en mal estado',
    tipoResolucion: 'Cambio de producto',
    descripcion: 'El producto llegó con temperatura inadecuada.',
    productosDevueltos: prodDevCambio,
    valorDevuelto: 0
  }, { idUsuario: user.idUsuario });

  assert(devCambio.idDevolucion > 0, `Solicitud de devolución creada: ${devCambio.codigoDevolucion}`);
  assert(devCambio.estado === 'PENDIENTE', `Estado inicial es PENDIENTE (En revisión para el administrador)`);
  assert(devCambio.tipoResolucion === 'Cambio de producto', `Tipo de resolución registrada: Cambio de producto`);

  // 2.2 El cliente consulta sus devoluciones
  const misDevs = await DevolucionService.getByCliente(cliente.idCliente, user.idUsuario);
  const devEnCliente = misDevs.find(d => Number(d.idDevolucion) === Number(devCambio.idDevolucion));
  assert(!!devEnCliente, `El cliente visualiza la solicitud ${devCambio.codigoDevolucion} en "Mis Devoluciones"`);

  // 2.3 El Administrador APROBÓ la solicitud -> Debe generarse automáticamente la orden de reposición
  const devAprobada = await DevolucionService.updateEstado(devCambio.idDevolucion, {
    estado: 'APROBADA',
    tipoResolucion: 'Cambio de producto',
    accionRealizada: 'Aprobado cambio inmediato para despacho a domicilio.'
  }, { idUsuario: adminUser.idUsuario });

  assert(devAprobada.estado === 'APROBADA', `Devolución ${devAprobada.codigoDevolucion} actualizada a APROBADA por el administrador`);
  assert(devAprobada.idVentaReemplazo !== null, `Se generó automáticamente la orden de venta de reemplazo ID: #${devAprobada.idVentaReemplazo}`);
  assert(devAprobada.codigoVentaReemplazo !== null, `Código de orden de reemplazo generado: ${devAprobada.codigoVentaReemplazo}`);

  // Verificar integridad de la orden de reemplazo generada en Venta
  const ordenReemplazoMapped = await VentaService.getById(devAprobada.idVentaReemplazo);
  assert(ordenReemplazoMapped !== null, `La orden de venta de reemplazo existe en la base de datos`);
  assert(Number(ordenReemplazoMapped.total) === 0, `El total de la orden de reemplazo es $0 (reposición sin costo para el cliente)`);
  assert(ordenReemplazoMapped.metodoPago === 'Devolución / Reposición', `Método de pago de la reposición: "${ordenReemplazoMapped.metodoPago}"`);
  assert(ordenReemplazoMapped.esDevolucion === true, `La orden está debidamente marcada como esDevolucion = true`);
  assert(ordenReemplazoMapped.detalles.length >= 1, `La orden de reemplazo contiene los productos a reponer (${ordenReemplazoMapped.detalles.length} item)`);

  // Comprobar que la orden de reemplazo NO es elegible para una devolución en bucle
  const elegReemplazo = await DevolucionService.checkVentaElegibilidad(ordenReemplazoMapped.id || ordenReemplazoMapped.idVenta);
  assert(elegReemplazo.elegible === false, `La orden de reposición gratuita no permite una nueva devolución`);

  // ══════════════════════════════════════════════════════════════════════════════
  // ESCENARIO 3: FLUJO REEMBOLSO DE DINERO (Datos Bancarios / Nequi / Daviplata)
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n--- FASE 3: Solicitud con REEMBOLSO DE DINERO y Ejecución Bancaria ---');
  const ventaReembolso = await crearVentaEntregada(0);

  const datosBancariosValidos = {
    banco: 'Nequi',
    tipoCuenta: 'Billetera Digital / Celular',
    numeroCuenta: '3001234567',
    titularNombre: 'Carlos Alberto Pérez',
    titularTipoDocumento: 'CC',
    titularDocumento: '1020304050'
  };

  const devReembolso = await DevolucionService.create({
    idVenta: ventaReembolso.idVenta,
    idCliente: cliente.idCliente,
    motivo: 'Pedido incorrecto',
    tipoResolucion: 'Devolución de dinero',
    descripcion: 'Se solicitó hamburguesa sin cebolla y llegó con doble cebolla.',
    productosDevueltos: [
      {
        idDetalleVenta: ventaReembolso.detalles[0].idDetalleVenta,
        idVariante: variante.idVariante,
        nombre: variante.producto.nombre,
        cantidad: 1,
        precioUnitario: Number(variante.precio || 15000)
      }
    ],
    valorDevuelto: Number(variante.precio || 15000),
    datosReembolso: datosBancariosValidos
  }, { idUsuario: user.idUsuario });

  assert(devReembolso.idDevolucion > 0, `Solicitud de reembolso creada: ${devReembolso.codigoDevolucion}`);
  assert(devReembolso.estado === 'PENDIENTE', `Estado inicial del trámite: PENDIENTE`);
  assert(devReembolso.estadoReembolso === 'PENDIENTE', `Estado del reembolso bancario: PENDIENTE`);
  assert(devReembolso.datosReembolso?.banco === 'Nequi', `Entidad bancaria registrada correctamente: Nequi`);
  assert(Number(devReembolso.valorDevuelto) === Number(variante.precio || 15000), `Valor a reembolsar calculado: $${devReembolso.valorDevuelto}`);

  // Administrador revisa los datos bancarios y APROBÓ el reembolso confirmando la transferencia
  const devReembolsoEjecutado = await DevolucionService.updateEstado(devReembolso.idDevolucion, {
    estado: 'COMPLETADA',
    estadoReembolso: 'REALIZADO',
    referenciaReembolso: 'TRANSF-NEQUI-987654321',
    accionRealizada: 'Transferencia Nequi procesada y comprobante enviado al cliente.'
  }, { idUsuario: adminUser.idUsuario });

  assert(devReembolsoEjecutado.estado === 'COMPLETADA', `Devolución completada exitosamente`);
  assert(devReembolsoEjecutado.estadoReembolso === 'REALIZADO', `Estado de reembolso actualizado a REALIZADO`);
  assert(devReembolsoEjecutado.referenciaReembolso === 'TRANSF-NEQUI-987654321', `Referencia bancaria registrada: ${devReembolsoEjecutado.referenciaReembolso}`);

  // ══════════════════════════════════════════════════════════════════════════════
  // ESCENARIO 4: RECHAZO / CANCELACIÓN DE SOLICITUD POR EL ADMINISTRADOR
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n--- FASE 4: Rechazo / Cancelación de Devolución por Administrador ---');
  const ventaRechazar = await crearVentaEntregada(0);

  const devRechazar = await DevolucionService.create({
    idVenta: ventaRechazar.idVenta,
    idCliente: cliente.idCliente,
    motivo: 'Comida en mal estado',
    tipoResolucion: 'Cambio de producto',
    descripcion: 'Sabor no agradable.',
    productosDevueltos: [
      {
        idDetalleVenta: ventaRechazar.detalles[0].idDetalleVenta,
        idVariante: variante.idVariante,
        nombre: variante.producto.nombre,
        cantidad: 1,
        precioUnitario: Number(variante.precio || 15000)
      }
    ]
  }, { idUsuario: user.idUsuario });

  assert(devRechazar.estado === 'PENDIENTE', `Solicitud para rechazo creada: ${devRechazar.codigoDevolucion}`);

  // Intentar rechazar sin ingresar motivo debe fallar
  let errorSinMotivo = false;
  try {
    await DevolucionService.updateEstado(devRechazar.idDevolucion, {
      estado: 'RECHAZADA'
    }, { idUsuario: adminUser.idUsuario });
  } catch (err) {
    errorSinMotivo = true;
  }
  assert(errorSinMotivo, `Requerido obligatoriamente el motivo del rechazo al cancelar/rechazar`);

  // Rechazar con motivo válido
  const devRechazada = await DevolucionService.updateEstado(devRechazar.idDevolucion, {
    estado: 'RECHAZADA',
    motivoRechazo: 'El producto fue manipulado indebidamente por fuera del tiempo de conservación de alimentos.'
  }, { idUsuario: adminUser.idUsuario });

  assert(devRechazada.estado === 'RECHAZADA', `Estado actualizado a RECHAZADA`);
  assert(devRechazada.motivoRechazo.includes('manipulado indebidamente'), `Motivo de rechazo guardado correctamente`);
  assert(devRechazada.idVentaReemplazo === null, `No se generó orden de reemplazo para la solicitud rechazada`);

  // ══════════════════════════════════════════════════════════════════════════════
  // ESCENARIO 5: ESTADÍSTICAS Y KPIS GLOBALES PARA EL ADMINISTRADOR
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('\n--- FASE 5: Estadísticas y KPIs de Devoluciones (Admin) ---');
  const stats = await DevolucionService.getStats();
  console.log('KPIs Globales:', stats);
  assert(stats.total >= 3, `Total de devoluciones contabilizadas: ${stats.total}`);
  assert(stats.aprobadas >= 1, `KPI Aprobadas contabilizadas: ${stats.aprobadas}`);
  assert(stats.completadas >= 1, `KPI Completadas contabilizadas: ${stats.completadas}`);
  assert(stats.rechazadas >= 1, `KPI Rechazadas contabilizadas: ${stats.rechazadas}`);
  assert(stats.totalValorDevuelto > 0, `KPI Total Dinero Devuelto acumulado: $${stats.totalValorDevuelto}`);

  console.log('\n================================================================');
  console.log(`🎉 TODAS LAS ${testsPassed}/${testsTotal} PRUEBAS INTEGRALES PASARON SATISFACTORIAMENTE!`);
  console.log('================================================================\n');

  process.exit(0);
}

testSuiteDevoluciones().catch(err => {
  console.error('\n💥 ERROR CRÍTICO EN LA EJECUCIÓN DE PRUEBAS:');
  console.error(err);
  process.exit(1);
});
