'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { getColombiaDateISO } = require('../src/infrastructure/utils/colombiaDateUtils');

function shiftISO(isoDate, deltaDays) {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test('CompraService.create valida fechaFactura estrictamente igual a hoy (Colombia) y lotes vigentes', async (t) => {
  const models = require('../src/persistence/models');
  const CompraService = require('../src/application/services/compraService');
  const TrazabilidadService = require('../src/application/services/trazabilidadService');

  const origFindProv = models.Proveedor.findByPk;
  const origFindCompra = models.Compra.findOne;
  const origCreateCompra = models.Compra.create;
  const origFindInsumo = models.Insumo.findByPk;
  const origFindAllInsumo = models.Insumo.findAll;
  const origBulkDet = models.DetalleCompraInsumo.bulkCreate;
  const origBulkLote = models.LoteInsumo.bulkCreate;
  const origTraz = TrazabilidadService.create;

  const today = getColombiaDateISO();
  const yesterday = shiftISO(today, -1);
  const tomorrow = shiftISO(today, 1);

  models.Proveedor.findByPk = async () => ({ idProveedor: 1, estado: 1, nombre: 'Proveedor Test' });
  models.Compra.findOne = async () => null;
  let capturedCompraPayload = null;
  models.Compra.create = async (payload) => {
    capturedCompraPayload = payload;
    return { idCompra: 99, ...payload };
  };
  models.Insumo.findByPk = async () => null;
  models.Insumo.findAll = async () => [];
  models.DetalleCompraInsumo.bulkCreate = async (rows) => rows;
  models.LoteInsumo.bulkCreate = async (rows) => rows;
  TrazabilidadService.create = async () => ({});

  const origGetById = CompraService.getById;
  const origAjustarStock = CompraService._ajustarStockPorCompra;
  CompraService.getById = async (id) => ({ idCompra: id, ...capturedCompraPayload });
  CompraService._ajustarStockPorCompra = async () => {};

  t.after(() => {
    models.Proveedor.findByPk = origFindProv;
    models.Compra.findOne = origFindCompra;
    models.Compra.create = origCreateCompra;
    models.Insumo.findByPk = origFindInsumo;
    models.Insumo.findAll = origFindAllInsumo;
    models.DetalleCompraInsumo.bulkCreate = origBulkDet;
    models.LoteInsumo.bulkCreate = origBulkLote;
    TrazabilidadService.create = origTraz;
    CompraService.getById = origGetById;
    CompraService._ajustarStockPorCompra = origAjustarStock;
  });

  await assert.rejects(
    () =>
      CompraService.create({
        idProveedor: 1,
        numeroFactura: 'FAC-AYER-01',
        fechaFactura: yesterday,
        detalles: [{ idInsumo: 1, cantidad: 5, precioUnitario: 1000 }]
      }),
    (err) => err.statusCode === 400 && /anterior a hoy/i.test(err.message)
  );

  await assert.rejects(
    () =>
      CompraService.create({
        idProveedor: 1,
        numeroFactura: 'FAC-MANANA-01',
        fechaFactura: tomorrow,
        detalles: [{ idInsumo: 1, cantidad: 5, precioUnitario: 1000 }]
      }),
    (err) => err.statusCode === 400 && /posterior a hoy/i.test(err.message)
  );

  await assert.rejects(
    () =>
      CompraService.create({
        idProveedor: 1,
        numeroFactura: 'FAC-LOTE-VENCIDO',
        fechaFactura: today,
        detalles: [
          {
            idInsumo: 1,
            cantidad: 5,
            precioUnitario: 1000,
            lotes: [{ numeroLote: 'LOT-1', fechaVencimiento: yesterday, cantidad: 5 }]
          }
        ]
      }),
    (err) => err.statusCode === 400 && /vencimiento del lote/i.test(err.message)
  );

  const ok = await CompraService.create({
    idProveedor: 1,
    numeroFactura: 'FAC-HOY-01',
    fechaFactura: today,
    detalles: [
      {
        idInsumo: 1,
        cantidad: 5,
        precioUnitario: 1000,
        lotes: [{ numeroLote: 'LOT-OK', fechaVencimiento: tomorrow, cantidad: 5 }]
      }
    ]
  });
  assert.equal(ok.fechaFactura, today);
  assert.equal(ok.fechaCompra, today);
});

test('empleadoController aplica reglas de fechas para Término Indefinido y Término Fijo', async (t) => {
  const models = require('../src/persistence/models');
  const empleadoController = require('../src/presentation/controllers/empleadoController');

  const origFindOne = models.Empleado.findOne;
  const origCreate = models.Empleado.create;
  const origFindByPk = models.Empleado.findByPk;

  let lastCreated = null;
  models.Empleado.findOne = async () => null;
  models.Empleado.create = async (payload) => {
    lastCreated = payload;
    return { idEmpleado: 10, ...payload };
  };

  t.after(() => {
    models.Empleado.findOne = origFindOne;
    models.Empleado.create = origCreate;
    models.Empleado.findByPk = origFindByPk;
  });

  // 1. Término Indefinido siempre guarda fechaFin = null incluso si se envía una fechaFin
  {
    const res = createMockRes();
    await empleadoController.createEmpleado(
      {
        body: {
          nombre: 'Laura',
          apellidos: 'Gómez',
          numeroDocumento: '10203040',
          rol: 'Cocinero',
          tipoContrato: 'Término Indefinido',
          fechaInicio: '2026-05-01',
          fechaFin: '2026-12-31'
        }
      },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 201);
    assert.equal(lastCreated.fechaFin, null);
    assert.equal(lastCreated.tipoContrato, 'Término Indefinido');
  }

  // 2. Término Fijo exige fechaFin obligatoria
  {
    const res = createMockRes();
    await empleadoController.createEmpleado(
      {
        body: {
          nombre: 'Carlos',
          apellidos: 'Ruiz',
          numeroDocumento: '10203041',
          rol: 'Vendedor',
          tipoContrato: 'Término Fijo',
          fechaInicio: '2026-05-01',
          fechaFin: ''
        }
      },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /obligatoria para contratos a Término Fijo/i);
  }

  // 3. fechaFin igual o anterior a fechaInicio se rechaza
  {
    const res = createMockRes();
    await empleadoController.createEmpleado(
      {
        body: {
          nombre: 'Carlos',
          apellidos: 'Ruiz',
          numeroDocumento: '10203042',
          rol: 'Vendedor',
          tipoContrato: 'Término Fijo',
          fechaInicio: '2026-05-01',
          fechaFin: '2026-05-01'
        }
      },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 400);
    assert.match(res.body.message, /debe ser posterior a la fecha de inicio/i);
  }

  // 4. updateEmpleado al cambiar a Término Indefinido limpia fechaFin a null
  {
    let updatedPayload = null;
    models.Empleado.findByPk = async () => ({
      idEmpleado: 10,
      nombre: 'Laura',
      apellidos: 'Gómez',
      numeroDocumento: '10203040',
      cargo: 'Cocinero',
      tipoContrato: 'Término Fijo',
      fechaInicio: '2026-05-01',
      fechaContratacion: '2026-05-01',
      fechaFin: '2026-10-01',
      estado: 'Activo',
      async update(p) {
        updatedPayload = p;
        Object.assign(this, p);
        return this;
      }
    });

    const res = createMockRes();
    await empleadoController.updateEmpleado(
      {
        params: { id: '10' },
        body: { tipoContrato: 'Término Indefinido', fechaFin: '2026-10-01' }
      },
      res,
      (e) => { throw e; }
    );
    assert.equal(res.statusCode, 200);
    assert.equal(updatedPayload.fechaFin, null);
  }
});

test('InsumoService valida stockMinimo, stockMaximo y stock inicial en creación y edición', async (t) => {
  const database = require('../src/persistence/config/db');
  const models = require('../src/persistence/models');
  const InsumoService = require('../src/application/services/insumoService');
  const TrazabilidadService = require('../src/application/services/trazabilidadService');

  const origTx = database.sequelize.transaction;
  const origFindOne = models.Insumo.findOne;
  const origCreate = models.Insumo.create;
  const origFindByPk = models.Insumo.findByPk;
  const origCatFindByPk = models.CategoriaInsumo.findByPk;
  const origGetById = InsumoService.getById;
  const origTrazCreate = TrazabilidadService.create;

  database.sequelize.transaction = async () => ({
    commit: async () => {},
    rollback: async () => {}
  });
  models.Insumo.findOne = async () => null;
  models.CategoriaInsumo.findByPk = async () => ({ idCategoriaInsumo: 1, estado: 1, nombre: 'Base' });
  let createdInsumo = null;
  models.Insumo.create = async (p) => {
    createdInsumo = { idInsumo: 55, ...p };
    return createdInsumo;
  };
  TrazabilidadService.create = async () => ({});
  InsumoService.getById = async () => createdInsumo;

  t.after(() => {
    database.sequelize.transaction = origTx;
    models.Insumo.findOne = origFindOne;
    models.Insumo.create = origCreate;
    models.Insumo.findByPk = origFindByPk;
    models.CategoriaInsumo.findByPk = origCatFindByPk;
    InsumoService.getById = origGetById;
    TrazabilidadService.create = origTrazCreate;
  });

  // stockMaximo = 0 rechazado
  await assert.rejects(
    () =>
      InsumoService.create({
        nombre: 'Tomate',
        idCategoriaInsumo: 1,
        stock: 0,
        stockMinimo: 0,
        stockMaximo: 0
      }),
    (err) => err.statusCode === 400 && /mayor a 0/i.test(err.message)
  );

  // stockMaximo === stockMinimo rechazado
  await assert.rejects(
    () =>
      InsumoService.create({
        nombre: 'Cebolla',
        idCategoriaInsumo: 1,
        stock: 5,
        stockMinimo: 10,
        stockMaximo: 10
      }),
    (err) => err.statusCode === 400 && /estrictamente mayor al stock mínimo/i.test(err.message)
  );

  // stock inicial > stockMaximo rechazado
  await assert.rejects(
    () =>
      InsumoService.create({
        nombre: 'Pan Brioche',
        idCategoriaInsumo: 1,
        stock: 150,
        stockMinimo: 10,
        stockMaximo: 100
      }),
    (err) => err.statusCode === 400 && /no puede superar el stock máximo/i.test(err.message)
  );

  // Creación válida
  const valid = await InsumoService.create({
    nombre: 'Queso Cheddar',
    idCategoriaInsumo: 1,
    stock: 20,
    stockMinimo: 5,
    stockMaximo: 80
  });
  assert.equal(valid.stock, 20);
  assert.equal(valid.stockMinimo, 5);
  assert.equal(valid.stockMaximo, 80);

  // Edición: subir solo stockMinimo por encima/igual a stockMaximo existente debe rechazarse
  models.Insumo.findByPk = async () => ({
    idInsumo: 55,
    nombre: 'Queso Cheddar',
    stock: 20,
    stockMinimo: 5,
    stockMaximo: 80,
    descripcion: '',
    async save() { return this; }
  });

  await assert.rejects(
    () => InsumoService.update(55, { stockMinimo: 80 }),
    (err) => err.statusCode === 400 && /estrictamente mayor al stock mínimo/i.test(err.message)
  );

  // Edición: actualizar stockMaximo correctamente persiste el valor
  const mockEditable = {
    idInsumo: 55,
    nombre: 'Queso Cheddar',
    stock: 20,
    stockMinimo: 5,
    stockMaximo: 80,
    descripcion: '',
    async save() { return this; }
  };
  models.Insumo.findByPk = async () => mockEditable;
  InsumoService.getById = async () => mockEditable;

  const updated = await InsumoService.update(55, { stockMinimo: 10, stockMaximo: 120 });
  assert.equal(updated.stockMinimo, 10);
  assert.equal(updated.stockMaximo, 120);
});
