'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

test('VentaService.getStats cruza devoluciones aprobadas/completadas y cuadra bruto - reembolsos = neto', async (t) => {
  const models = require('../src/persistence/models');
  const VentaService = require('../src/application/services/ventaService');

  const origVentaFindAll = models.Venta.findAll;
  const origDevFindAll = models.Devolucion.findAll;

  models.Venta.findAll = async () => [
    {
      idVenta: 101,
      idCliente: 10,
      fechaVenta: '2026-05-10T18:00:00.000Z',
      tipoVenta: 'DOMICILIO',
      origen: 'ONLINE',
      subtotal: 1800000,
      total: 1800000,
      descuentoAplicado: 0,
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      observaciones: JSON.stringify({ clienteNombre: 'Ana Pérez' })
    },
    {
      idVenta: 102,
      idCliente: 11,
      fechaVenta: '2026-05-11T19:00:00.000Z',
      tipoVenta: 'PUNTO_DE_VENTA',
      origen: 'PUNTO_FISICO',
      subtotal: 200000,
      total: 200000,
      descuentoAplicado: 0,
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      observaciones: JSON.stringify({ clienteNombre: 'Luis Gómez' })
    }
  ];

  // Solo las devoluciones APROBADA/COMPLETADA retornadas por la consulta
  models.Devolucion.findAll = async () => [
    {
      idDevolucion: 1,
      idVenta: 101,
      tipoResolucion: 'Devolución de dinero',
      valorDevuelto: 72000,
      productosDevueltos: JSON.stringify([{ nombre: 'Hamburguesa Clásica Chazin', cantidad: 4, precioUnitario: 18000 }])
    },
    {
      idDevolucion: 2,
      idVenta: 102,
      tipoResolucion: 'Cambio de producto',
      valorDevuelto: 0,
      productosDevueltos: JSON.stringify([{ nombre: 'Perro Especial', cantidad: 2, precioUnitario: 14000 }])
    }
  ];

  t.after(() => {
    models.Venta.findAll = origVentaFindAll;
    models.Devolucion.findAll = origDevFindAll;
  });

  const stats = await VentaService.getStats({ periodo: 'personalizado' });
  assert.equal(stats.totalVentasBrutas, 2000000);
  assert.equal(stats.totalReembolsos, 72000);
  assert.equal(stats.totalVentasNetas, 1928000);
  assert.equal(stats.totalVentas, 1928000);
  assert.equal(stats.devolucionesCount, 2);
  assert.equal(stats.unidadesDevueltas, 6);
  assert.equal(stats.ticketPromedio, 964000);
});

test('ventasReportMetrics cuadra 100 hamburguesas vendidas menos 4 devueltas con reembolso y filtros específicos', async () => {
  const metricsPath = path.resolve(
    __dirname,
    '../../Frontend-Web-Chazin-Food/src/features/ventas/utils/ventasReportMetrics.js'
  );
  const { computeSalesReportMetrics } = await import(pathToFileURL(metricsPath).href);

  const ventas = [
    {
      idVenta: 1,
      numeroVenta: 'VEN-0001',
      fechaVenta: '2026-05-10T18:00:00.000Z',
      origen: 'ONLINE',
      tipoEntrega: 'Domicilio',
      metodoPago: 'Wompi',
      clienteNombre: 'Ana Pérez',
      total: 1800000,
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      detalles: [
        {
          idDetalleVenta: 10,
          idVariante: 5,
          cantidad: 100,
          precioUnitario: 18000,
          subtotal: 1800000,
          variante: { nombre: 'Clásica 150g', producto: { idProducto: 1, nombre: 'Hamburguesa Clásica Chazin' } }
        }
      ]
    },
    {
      idVenta: 2,
      numeroVenta: 'VEN-0002',
      fechaVenta: '2026-05-11T19:00:00.000Z',
      origen: 'PUNTO_FISICO',
      tipoEntrega: 'En Mesa',
      metodoPago: 'Efectivo',
      clienteNombre: 'Carlos Ruiz',
      total: 50000,
      estadoEntrega: 'ENTREGADO',
      estadoAprobacion: 'APROBADO',
      detalles: [
        {
          idDetalleVenta: 11,
          idVariante: 9,
          cantidad: 2,
          precioUnitario: 25000,
          subtotal: 50000,
          variante: { nombre: 'Personal', producto: { idProducto: 2, nombre: 'Salchipapa Salvaje Gourmet' } }
        }
      ]
    }
  ];

  const devoluciones = [
    {
      idDevolucion: 50,
      codigoDevolucion: 'DEV-0050',
      idVenta: 1,
      fecha: '2026-05-10T20:00:00.000Z',
      estado: 'COMPLETADA',
      tipoResolucion: 'Devolución de dinero',
      estadoReembolso: 'REALIZADO',
      valorDevuelto: 72000,
      productosDevueltos: [
        { idDetalleVenta: 10, idVariante: 5, nombre: 'Hamburguesa Clásica Chazin', cantidad: 4, precioUnitario: 18000, subtotal: 72000 }
      ]
    },
    // Pendiente no debe descontarse aún del neto confirmado
    {
      idDevolucion: 51,
      codigoDevolucion: 'DEV-0051',
      idVenta: 2,
      fecha: '2026-05-11T21:00:00.000Z',
      estado: 'PENDIENTE',
      tipoResolucion: 'Devolución de dinero',
      estadoReembolso: 'PENDIENTE',
      valorDevuelto: 25000,
      productosDevueltos: [
        { idDetalleVenta: 11, idVariante: 9, nombre: 'Salchipapa Salvaje Gourmet', cantidad: 1, precioUnitario: 25000, subtotal: 25000 }
      ]
    }
  ];

  // Reporte global sin filtros
  const full = computeSalesReportMetrics({ ventas, devoluciones });
  assert.equal(full.kpis.unidadesBrutas, 102);
  assert.equal(full.kpis.unidadesDevueltas, 4);
  assert.equal(full.kpis.unidadesNetas, 98);
  assert.equal(full.kpis.ingresosBrutos, 1850000);
  assert.equal(full.kpis.totalReembolsos, 72000);
  assert.equal(full.kpis.ingresosNetos, 1778000);
  assert.equal(full.kpis.reembolsosRealizados, 72000);
  assert.equal(full.kpis.devolucionesPendientesCount, 1);

  const burgerRow = full.productosDetalle.find((p) => p.nombreLimpio === 'Hamburguesa Clásica Chazin');
  assert.ok(burgerRow);
  assert.equal(burgerRow.cantidadBruta, 100);
  assert.equal(burgerRow.cantidadDevuelta, 4);
  assert.equal(burgerRow.cantidadNeta, 96);
  assert.equal(burgerRow.ingresosBrutos, 1800000);
  assert.equal(burgerRow.montoReembolsado, 72000);
  assert.equal(burgerRow.ingresosNetos, 1728000);

  // Filtro específico por producto ("Hamburguesa Clásica Chazin") + canal ONLINE
  const filteredBurger = computeSalesReportMetrics({
    ventas,
    devoluciones,
    filters: { producto: 'Hamburguesa Clásica Chazin', origen: 'ONLINE' }
  });
  assert.equal(filteredBurger.kpis.totalVentasCount, 1);
  assert.equal(filteredBurger.kpis.unidadesBrutas, 100);
  assert.equal(filteredBurger.kpis.unidadesDevueltas, 4);
  assert.equal(filteredBurger.kpis.unidadesNetas, 96);
  assert.equal(filteredBurger.kpis.ingresosBrutos, 1800000);
  assert.equal(filteredBurger.kpis.totalReembolsos, 72000);
  assert.equal(filteredBurger.kpis.ingresosNetos, 1728000);

  // Filtro "Solo ventas con devolución"
  const onlyReturned = computeSalesReportMetrics({
    ventas,
    devoluciones,
    filters: { estadoDevolucion: 'con_devolucion' }
  });
  assert.equal(onlyReturned.kpis.totalVentasCount, 1);
  assert.equal(onlyReturned.devolucionesAplicadas.length, 1);
});
