const test = require('node:test');
const assert = require('node:assert/strict');

const models = require('../src/persistence/models');
const VentaService = require('../src/application/services/ventaService');
const AdicionService = require('../src/application/services/adicionService');
const ProveedorService = require('../src/application/services/proveedorService');
const empleadoController = require('../src/presentation/controllers/empleadoController');

test('isVentaEditablePreCocina permite pedidos PENDIENTE/EN_COLA y bloquea producción/cancelados/devoluciones', () => {
  assert.equal(
    VentaService.isVentaEditablePreCocina({ estadoEntrega: 'PENDIENTE' }, { estadoCocina: 'EN_COLA' }).editable,
    true
  );
  assert.equal(
    VentaService.isVentaEditablePreCocina({ estadoEntrega: 'PENDIENTE' }, {}).editable,
    true
  );

  for (const estado of ['PREPARANDO', 'LISTO', 'DESPACHADO', 'EN_CAMINO', 'ENTREGADO']) {
    const res = VentaService.isVentaEditablePreCocina({ estadoEntrega: estado }, {});
    assert.equal(res.editable, false, `Debe bloquear estadoEntrega=${estado}`);
    assert.equal(res.statusCode, 409);
  }

  const cocinaIniciada = VentaService.isVentaEditablePreCocina(
    { estadoEntrega: 'PENDIENTE' },
    { estadoCocina: 'PREPARANDO' }
  );
  assert.equal(cocinaIniciada.editable, false);
  assert.equal(cocinaIniciada.statusCode, 409);

  const cancelado = VentaService.isVentaEditablePreCocina({ estadoEntrega: 'CANCELADO' }, {});
  assert.equal(cancelado.editable, false);
  assert.equal(cancelado.statusCode, 400);

  const reposicion = VentaService.isVentaEditablePreCocina(
    { estadoEntrega: 'PENDIENTE' },
    { esDevolucion: true }
  );
  assert.equal(reposicion.editable, false);
  assert.equal(reposicion.statusCode, 400);
});

test('VentaService.agregarProductos rechaza con 409 si el pedido ya pasó a producción', async () => {
  const origFindByPk = models.Venta.findByPk;
  try {
    models.Venta.findByPk = async () => ({
      idVenta: 55,
      estadoEntrega: 'PREPARANDO',
      observaciones: JSON.stringify({ estadoCocina: 'PREPARANDO' })
    });

    await assert.rejects(
      () => VentaService.agregarProductos(55, { productos: [{ idProducto: 1, cantidad: 1 }] }),
      (err) => err.statusCode === 409 && /producci[oó]n/i.test(err.message)
    );
  } finally {
    models.Venta.findByPk = origFindByPk;
  }
});

test('VentaService.agregarProductos rechaza con 400 si no se envían productos', async () => {
  await assert.rejects(
    () => VentaService.agregarProductos(55, { productos: [] }),
    (err) => err.statusCode === 400
  );
});

test('VentaService.agregarProductos calcula totales desde BD, preserva descuento y acumula saldo adicional', async () => {
  const origVentaFindByPk = models.Venta.findByPk;
  const origEventoFindAll = models.Evento.findAll;
  const origProductFindByPk = models.Product.findByPk;
  const origInsumoFindByPk = models.Insumo.findByPk;
  const origInsumoFindAll = models.Insumo.findAll;
  const origLoteFindAll = models.LoteInsumo.findAll;
  const origDetalleCreate = models.DetalleVentaProducto.create;
  const origDetalleAdicCreate = models.DetalleVentaAdicion.create;
  const origTrazCreate = models.Trazabilidad.create;
  const origTx = models.sequelize.transaction;
  const origQuery = models.sequelize.query;
  const origResolveRecipe = VentaService.resolveRecipeOrInsumoForDetail;
  const origGetById = VentaService.getById;

  const createdDetalles = [];
  const createdAdics = [];
  let savedVentaState = null;

  try {
    const fakeVenta = {
      idVenta: 88,
      idUsuario: 2,
      tipoVenta: 'DOMICILIO',
      estadoEntrega: 'PENDIENTE',
      subtotal: 20000,
      descuentoAplicado: 2000, // 10%
      total: 18000,
      observaciones: JSON.stringify({
        estadoPago: 'Pagado',
        estadoCocina: 'EN_COLA',
        tipoEntrega: 'Domicilio',
        productos: [{ idProducto: 1, nombre: 'Hamburguesa Base', cantidad: 1, precioUnitario: 20000, total: 20000 }]
      }),
      save: async function () {
        savedVentaState = {
          subtotal: this.subtotal,
          descuentoAplicado: this.descuentoAplicado,
          total: this.total,
          obs: JSON.parse(this.observaciones)
        };
      }
    };

    models.Venta.findByPk = async () => fakeVenta;
    models.Evento.findAll = async () => [];
    models.Product.findByPk = async (id) => ({
      idProducto: Number(id),
      nombre: 'Papas Especiales',
      precio: 10000,
      estado: 1,
      eliminado: 0
    });
    const insumoCarne = {
      idInsumo: 7,
      nombre: 'Papa',
      unidadMedida: 'und',
      stock: 50,
      estado: 1,
      eliminado: 0,
      descripcion: '',
      save: async () => {}
    };
    const insumoQueso = {
      idInsumo: 9,
      nombre: 'Queso Cheddar',
      unidadMedida: 'und',
      precioAdicion: 3000,
      stock: 30,
      estado: 1,
      eliminado: 0,
      descripcion: '',
      save: async () => {}
    };
    models.Insumo.findByPk = async (id) => (Number(id) === 9 ? insumoQueso : insumoCarne);
    models.Insumo.findAll = async () => [insumoCarne, insumoQueso];
    models.LoteInsumo.findAll = async () => [];
    models.sequelize.transaction = async (cb) => cb({ LOCK: { UPDATE: 'UPDATE' } });
    models.sequelize.query = async () => [[{ idVariante: 101, idProducto: 2 }]];
    VentaService.resolveRecipeOrInsumoForDetail = async () => ({ directInsumoId: 7 });
    models.DetalleVentaProducto.create = async (row) => {
      createdDetalles.push(row);
      return { idDetalleVenta: 501, ...row };
    };
    models.DetalleVentaAdicion.create = async (row) => {
      createdAdics.push(row);
      return row;
    };
    models.Trazabilidad.create = async () => ({});
    VentaService.getById = async () => savedVentaState;

    const result = await VentaService.agregarProductos(
      88,
      {
        productos: [
          {
            idProducto: 2,
            esVarianteBase: true,
            cantidad: 1,
            precioUnitario: 1, // precio manipulado que DEBE ignorarse
            adiciones: [{ idAdicion: 9, cantidad: 1, precio: 0 }]
          }
        ]
      },
      { idUsuario: 2, nombre: 'Carlos', apellidos: 'Vendedor' }
    );

    // Precio oficial = 10000 + 3000 (adición) = 13000; 10% dto = 1300 => +11700 neto
    assert.equal(result.subtotal, 33000);
    assert.equal(result.descuentoAplicado, 3300);
    assert.equal(result.total, 29700);
    assert.equal(result.obs.saldoPendienteAdicional, 11700);
    assert.equal(result.obs.productos.length, 2);
    assert.equal(result.obs.historialEdiciones.length, 1);
    assert.equal(createdDetalles.length, 1);
    assert.equal(createdDetalles[0].precioUnitario, 10000);
    assert.equal(createdAdics.length, 1);
    assert.equal(createdAdics[0].precio, 3000);
  } finally {
    models.Venta.findByPk = origVentaFindByPk;
    models.Evento.findAll = origEventoFindAll;
    models.Product.findByPk = origProductFindByPk;
    models.Insumo.findByPk = origInsumoFindByPk;
    models.Insumo.findAll = origInsumoFindAll;
    models.LoteInsumo.findAll = origLoteFindAll;
    models.DetalleVentaProducto.create = origDetalleCreate;
    models.DetalleVentaAdicion.create = origDetalleAdicCreate;
    models.Trazabilidad.create = origTrazCreate;
    models.sequelize.transaction = origTx;
    models.sequelize.query = origQuery;
    VentaService.resolveRecipeOrInsumoForDetail = origResolveRecipe;
    VentaService.getById = origGetById;
  }
});

test('AdicionService.update permite editar toppings y rechaza precio <= 0', async () => {
  const origFindByPk = models.Insumo.findByPk;
  const TrazabilidadService = require('../src/application/services/trazabilidadService');
  const origTrazCreate = TrazabilidadService.create;

  try {
    const fakeInsumo = {
      idInsumo: 12,
      nombre: 'Tocineta',
      descripcion: 'Croquetas',
      imagen: 'bacon',
      precioAdicion: 2500,
      stock: 15,
      unidadMedida: 'und',
      estado: 1,
      esAdicion: 1,
      save: async () => {}
    };
    models.Insumo.findByPk = async () => fakeInsumo;
    TrazabilidadService.create = async () => ({});

    await assert.rejects(
      () => AdicionService.update(12, { nombre: 'Tocineta Ahumada', precio: 0 }),
      (err) => err.statusCode === 400
    );

    const updated = await AdicionService.update(12, {
      nombre: 'Tocineta Ahumada',
      precio: 3800,
      descripcion: 'Extra crocante'
    });
    assert.equal(updated.nombre, 'Tocineta Ahumada');
    assert.equal(updated.precio, 3800);
    assert.equal(fakeInsumo.precioAdicion, 3800);
    assert.equal(fakeInsumo.esAdicion, 1);
  } finally {
    models.Insumo.findByPk = origFindByPk;
    TrazabilidadService.create = origTrazCreate;
  }
});

test('ProveedorService.create permite nombres homónimos con NIT/documento distinto y bloquea documento repetido', async () => {
  const origFindOne = models.Proveedor.findOne;
  const origCreate = models.Proveedor.create;
  const origGetById = ProveedorService.getById;
  const TrazabilidadService = require('../src/application/services/trazabilidadService');
  const origTrazCreate = TrazabilidadService.create;

  try {
    TrazabilidadService.create = async () => ({});
    // Primer caso: documento distinto (no existe en BD) -> debe crear aunque el nombre ya exista
    models.Proveedor.findOne = async ({ where }) => {
      if (where && where.numeroDocumento === '900111222') return { idProveedor: 1 };
      return null;
    };
    models.Proveedor.create = async (row) => ({ idProveedor: 2, ...row });
    ProveedorService.getById = async (id) => ({ idProveedor: id, ok: true });

    const created = await ProveedorService.create({
      nombre: 'Carlos Pérez',
      numeroDocumento: '900333444',
      telefono: '3001234567',
      nombreContacto: 'Carlos Pérez'
    });
    assert.equal(created.ok, true);

    // Segundo caso: documento repetido -> debe rechazar con 400
    await assert.rejects(
      () => ProveedorService.create({
        nombre: 'Carlos Pérez',
        numeroDocumento: '900111222',
        telefono: '3001234567',
        nombreContacto: 'Carlos Pérez'
      }),
      (err) => err.statusCode === 400 && /documento|NIT/i.test(err.message)
    );
  } finally {
    models.Proveedor.findOne = origFindOne;
    models.Proveedor.create = origCreate;
    ProveedorService.getById = origGetById;
    TrazabilidadService.create = origTrazCreate;
  }
});

test('empleadoController valida formato estricto de correo en creación y permite homónimos con cédula distinta', async () => {
  const origFindOne = models.Empleado.findOne;
  const origCreate = models.Empleado.create;

  const mockRes = () => {
    const out = { statusCode: 200, body: null };
    out.status = (code) => {
      out.statusCode = code;
      return out;
    };
    out.json = (payload) => {
      out.body = payload;
      return out;
    };
    return out;
  };

  try {
    // Correo inválido -> 400
    const resBadEmail = mockRes();
    await empleadoController.createEmpleado(
      {
        body: {
          nombre: 'Juan',
          apellidos: 'Gómez',
          numeroDocumento: '1020304050',
          rol: 'Cocinero',
          tipoContrato: 'Término Indefinido',
          correo: 'correo-invalido-sin-arroba'
        }
      },
      resBadEmail,
      (err) => { throw err; }
    );
    assert.equal(resBadEmail.statusCode, 400);
    assert.match(resBadEmail.body.message, /correo/i);

    // Nombre homónimo + correo válido + documento nuevo -> 201
    models.Empleado.findOne = async () => null;
    models.Empleado.create = async (row) => ({ idEmpleado: 77, ...row });
    const resOk = mockRes();
    await empleadoController.createEmpleado(
      {
        body: {
          nombre: 'Juan',
          apellidos: 'Gómez',
          numeroDocumento: '1020304099',
          rol: 'Cocinero',
          tipoContrato: 'Término Indefinido',
          correo: 'juan.gomez@chazinfood.co'
        }
      },
      resOk,
      (err) => { throw err; }
    );
    assert.equal(resOk.statusCode, 201);
    assert.equal(resOk.body.correo, 'juan.gomez@chazinfood.co');
  } finally {
    models.Empleado.findOne = origFindOne;
    models.Empleado.create = origCreate;
  }
});
