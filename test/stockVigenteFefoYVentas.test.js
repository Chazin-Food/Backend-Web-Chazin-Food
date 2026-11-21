const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isLoteExpired,
  computeInsumoStockBreakdown,
  deductInsumoFefo,
  restoreInsumoFefo
} = require('../src/infrastructure/utils/stockFefoUtils');

const models = require('../src/persistence/models');
const ProductService = require('../src/application/services/productService');
const VentaService = require('../src/application/services/ventaService');
const dbUtils = require('../src/infrastructure/utils/dbUtils');

const TODAY = '2026-11-21';

// Helper para crear instancias tipo Sequelize con .save() en memoria
function makeMockRow(data) {
  return {
    ...data,
    savedCalls: 0,
    async save() {
      this.savedCalls += 1;
      return this;
    },
    get({ plain } = {}) {
      return plain ? { ...this } : this;
    },
    toJSON() {
      return { ...this };
    }
  };
}

// ============================================================================
// 1. PRUEBAS UNITARIAS DE stockFefoUtils
// ============================================================================

test('computeInsumoStockBreakdown: separa stock vigente y vencido correctamente en todos los escenarios', () => {
  // 1) Insumo con stock en 0
  const bdZero = computeInsumoStockBreakdown({ idInsumo: 1, stock: 0, estado: 1, eliminado: 0 }, [], TODAY);
  assert.equal(bdZero.stockVigente, 0);
  assert.equal(bdZero.stockOperativo, 0);
  assert.equal(bdZero.isInactive, false);

  // 2) 1 lote vencido (10) + 1 lote vigente (15), stock físico = 25
  const bdMixed = computeInsumoStockBreakdown(
    { idInsumo: 2, stock: 25, estado: 1, eliminado: 0 },
    [
      { idLote: 1, idInsumo: 2, cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2026-11-20', estado: 'ACTIVO' },
      { idLote: 2, idInsumo: 2, cantidad: 15, cantidadDisponible: 15, fechaVencimiento: '2026-12-10', estado: 'ACTIVO' }
    ],
    TODAY
  );
  assert.equal(bdMixed.stockVigente, 15);
  assert.equal(bdMixed.stockVencido, 10);
  assert.equal(bdMixed.lotesVigentes.length, 1);
  assert.equal(bdMixed.lotesVigentes[0].idLote, 2);
  assert.equal(bdMixed.lotesVencidos.length, 1);

  // 3) Lote que vence HOY sigue utilizable hasta las 11:59 PM
  assert.equal(isLoteExpired({ estado: 'ACTIVO', fechaVencimiento: TODAY }, TODAY), false);
  const bdToday = computeInsumoStockBreakdown(
    { idInsumo: 3, stock: 8, estado: 1, eliminado: 0 },
    [{ idLote: 3, idInsumo: 3, cantidad: 8, cantidadDisponible: 8, fechaVencimiento: TODAY, estado: 'ACTIVO' }],
    TODAY
  );
  assert.equal(bdToday.stockVigente, 8);
  assert.equal(bdToday.stockVencido, 0);

  // 4) Todos los lotes vencidos (sin retirar aún, incluso si estado aún dice 'ACTIVO')
  const bdAllExpired = computeInsumoStockBreakdown(
    { idInsumo: 4, stock: 10, estado: 1, eliminado: 0 },
    [{ idLote: 4, idInsumo: 4, cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2026-11-15', estado: 'ACTIVO' }],
    TODAY
  );
  assert.equal(bdAllExpired.stockVigente, 0);
  assert.equal(bdAllExpired.stockVencido, 10);
  assert.equal(bdAllExpired.hasExpiredLots, true);

  // 5) Insumo inactivado manualmente (estado === 0) aunque tenga stock sano
  const bdInactive = computeInsumoStockBreakdown(
    { idInsumo: 5, stock: 50, estado: 0, eliminado: 0 },
    [{ idLote: 5, idInsumo: 5, cantidad: 50, cantidadDisponible: 50, fechaVencimiento: '2027-01-01', estado: 'ACTIVO' }],
    TODAY
  );
  assert.equal(bdInactive.isInactive, true);
  assert.equal(bdInactive.stockOperativo, 0);

  // 6) Insumo [SIN_CONTROL_STOCK] inactivo vs activo
  const bdNoCtrlActive = computeInsumoStockBreakdown(
    { idInsumo: 6, stock: 0, estado: 1, eliminado: 0, descripcion: '[SIN_CONTROL_STOCK] Salsa casa' },
    [],
    TODAY
  );
  assert.equal(bdNoCtrlActive.controlarStock, false);
  assert.equal(bdNoCtrlActive.isInactive, false);

  const bdNoCtrlInactive = computeInsumoStockBreakdown(
    { idInsumo: 7, stock: 0, estado: 0, eliminado: 0, descripcion: '[SIN_CONTROL_STOCK] Salsa casa' },
    [],
    TODAY
  );
  assert.equal(bdNoCtrlInactive.controlarStock, false);
  assert.equal(bdNoCtrlInactive.isInactive, true);

  // 7) Insumo heredado sin lotes con fechaVencimiento directa vencida
  const bdDirectExpired = computeInsumoStockBreakdown(
    { idInsumo: 8, stock: 12, estado: 1, eliminado: 0, fechaVencimiento: '2026-11-01' },
    [],
    TODAY
  );
  assert.equal(bdDirectExpired.stockVigente, 0);
  assert.equal(bdDirectExpired.stockVencido, 12);

  // 8) Insumo mixto (stock base sin lote + 1 lote vencido) descuenta el lote vencido sin dañar el stock base sano
  const bdHybrid = computeInsumoStockBreakdown(
    { idInsumo: 44, stock: 21.94, estado: 1, eliminado: 0, fechaVencimiento: null },
    [{ idLote: 2, idInsumo: 44, cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2026-10-23', estado: 'VENCIDO' }],
    TODAY
  );
  assert.equal(bdHybrid.stockVigente, 11.94);
  assert.equal(bdHybrid.stockVencido, 10);
});

test('deductInsumoFefo y restoreInsumoFefo respetan estricto orden FEFO sin tocar lotes vencidos', async () => {
  const insumo = makeMockRow({ idInsumo: 14, nombre: 'Carne de Res', stock: 25, estado: 1, eliminado: 0 });
  const loteVencido = makeMockRow({ idLote: 10, idInsumo: 14, numeroLote: 'L-OLD', cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2026-11-10', estado: 'VENCIDO' });
  const lotePronto = makeMockRow({ idLote: 11, idInsumo: 14, numeroLote: 'L-SOON', cantidad: 5, cantidadDisponible: 5, fechaVencimiento: '2026-11-25', estado: 'ACTIVO' });
  const loteLejano = makeMockRow({ idLote: 12, idInsumo: 14, numeroLote: 'L-FAR', cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2026-12-20', estado: 'ACTIVO' });

  // Descontar 7 kg: debe consumir 5 kg completos de L-SOON (agotándolo) + 2 kg de L-FAR, sin tocar L-OLD
  const res = await deductInsumoFefo(insumo, 7, {
    lotes: [loteLejano, loteVencido, lotePronto],
    todayCol: TODAY
  });

  assert.equal(res.cantidadDescontada, 7);
  assert.equal(insumo.stock, 18);
  assert.equal(loteVencido.cantidadDisponible, 10); // Intacto
  assert.equal(loteVencido.estado, 'VENCIDO');
  assert.equal(lotePronto.cantidadDisponible, 0);
  assert.equal(lotePronto.estado, 'AGOTADO');
  assert.equal(loteLejano.cantidadDisponible, 8);
  assert.equal(loteLejano.estado, 'ACTIVO');
  assert.equal(res.lotesConsumidos.length, 2);
  assert.deepEqual(res.lotesConsumidos.map(x => [x.idLote, x.cantidad]), [[11, 5], [12, 2]]);

  // Reintegro por cancelación debe restaurar exactamente L-SOON (reactivándolo a ACTIVO) y L-FAR
  const mockLoteModel = {
    async findByPk(id) {
      return [loteVencido, lotePronto, loteLejano].find(l => l.idLote === Number(id)) || null;
    }
  };
  await restoreInsumoFefo(insumo, 7, {
    lotesConsumidos: res.lotesConsumidos,
    LoteInsumoModel: mockLoteModel,
    todayCol: TODAY
  });

  assert.equal(insumo.stock, 25);
  assert.equal(lotePronto.cantidadDisponible, 5);
  assert.equal(lotePronto.estado, 'ACTIVO');
  assert.equal(loteLejano.cantidadDisponible, 10);
  assert.equal(loteVencido.cantidadDisponible, 10);
});

// ============================================================================
// 2. PRUEBAS DE INTEGRACIÓN EN ProductService._queryFormattedProducts (MATRIZ 4 ESCENARIOS)
// ============================================================================

test('ProductService._queryFormattedProducts cumple los 4 escenarios de disponibilidad sin cambiar producto.estado', async () => {
  const originals = {
    productFindAll: models.Product.findAll,
    fichaFindAll: models.FichaTecnica.findAll,
    insumoFindAll: models.Insumo.findAll,
    loteFindAll: models.LoteInsumo.findAll,
    detalleVentaFindAll: models.DetalleVentaProducto.findAll,
    seqQuery: models.sequelize.query
  };

  try {
    models.sequelize.query = async () => [[{ COLUMN_NAME: 'idEvento' }, { COLUMN_NAME: 'creadaPorEvento' }]];

    const mockProducts = [
      { idProducto: 1, nombre: 'Burger Stock Cero', precio: 18000, estado: 1, eliminado: 0, categoria: 'Hamburguesas', variantes: [], eventos: [], itemsCombo: [] },
      { idProducto: 2, nombre: 'Burger Mixto FEFO', precio: 20000, estado: 1, eliminado: 0, categoria: 'Hamburguesas', variantes: [], eventos: [], itemsCombo: [] },
      { idProducto: 3, nombre: 'Burger Todos Lotes Vencidos', precio: 21000, estado: 1, eliminado: 0, categoria: 'Hamburguesas', variantes: [], eventos: [], itemsCombo: [] },
      { idProducto: 4, nombre: 'Burger Insumo Inactivo', precio: 22000, estado: 1, eliminado: 0, categoria: 'Hamburguesas', variantes: [], eventos: [], itemsCombo: [] },
      { idProducto: 5, nombre: 'Burger Sin Control Inactivo', precio: 19000, estado: 1, eliminado: 0, categoria: 'Hamburguesas', variantes: [], eventos: [], itemsCombo: [] },
      { idProducto: 8, nombre: 'Gaseosa Coca-Cola 400ml', precio: 4500, estado: 1, eliminado: 0, categoria: 'Bebidas', variantes: [], eventos: [], itemsCombo: [] }
    ];

    const mockInsumos = [
      { idInsumo: 101, nombre: 'Carne Cero', stock: 0, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '', fechaVencimiento: null },
      { idInsumo: 102, nombre: 'Carne FEFO', stock: 10.60, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '', fechaVencimiento: null },
      { idInsumo: 103, nombre: 'Carne Vencida Total', stock: 10.00, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '', fechaVencimiento: null },
      { idInsumo: 104, nombre: 'Carne Contaminada Inactiva', stock: 50.00, unidadMedida: 'kg', estado: 0, eliminado: 0, descripcion: '', fechaVencimiento: null },
      { idInsumo: 105, nombre: 'Salsa Sin Control Inactiva', stock: 0, unidadMedida: 'kg', estado: 0, eliminado: 0, descripcion: '[SIN_CONTROL_STOCK] Salsa', fechaVencimiento: null },
      { idInsumo: 29, nombre: 'Coca-Cola Original 400ml', stock: 50, unidadMedida: 'und', estado: 0, eliminado: 0, descripcion: '', fechaVencimiento: null }
    ];

    const mockFichas = [
      { idFichaTecnica: 1, idProducto: 1, tipo: 'PRODUCTO', estado: 1, detalles: [{ idDetalleFicha: 1, idInsumo: 101, cantidad: 150, unidadMedida: 'g', insumo: mockInsumos[0] }] },
      { idFichaTecnica: 2, idProducto: 2, tipo: 'PRODUCTO', estado: 1, detalles: [{ idDetalleFicha: 2, idInsumo: 102, cantidad: 150, unidadMedida: 'g', insumo: mockInsumos[1] }] },
      { idFichaTecnica: 3, idProducto: 3, tipo: 'PRODUCTO', estado: 1, detalles: [{ idDetalleFicha: 3, idInsumo: 103, cantidad: 150, unidadMedida: 'g', insumo: mockInsumos[2] }] },
      { idFichaTecnica: 4, idProducto: 4, tipo: 'PRODUCTO', estado: 1, detalles: [{ idDetalleFicha: 4, idInsumo: 104, cantidad: 150, unidadMedida: 'g', insumo: mockInsumos[3] }] },
      { idFichaTecnica: 5, idProducto: 5, tipo: 'PRODUCTO', estado: 1, detalles: [{ idDetalleFicha: 5, idInsumo: 105, cantidad: 30, unidadMedida: 'g', insumo: mockInsumos[4] }] }
    ];

    const mockLotes = [
      // Insumo 102: 1 lote vencido de 10kg + 1 lote vigente de 0.60kg (= 4 porciones de 150g)
      { idLote: 1, idInsumo: 102, cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2020-01-01', estado: 'VENCIDO' },
      { idLote: 2, idInsumo: 102, cantidad: 0.60, cantidadDisponible: 0.60, fechaVencimiento: '2099-12-31', estado: 'ACTIVO' },
      // Insumo 103: único lote vencido por fecha (aún en estado 'ACTIVO' sin retirar físicamente)
      { idLote: 3, idInsumo: 103, cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2020-01-01', estado: 'ACTIVO' }
    ];

    models.Product.findAll = async () => mockProducts;
    models.FichaTecnica.findAll = async () => mockFichas;
    models.Insumo.findAll = async () => mockInsumos;
    models.LoteInsumo.findAll = async () => mockLotes;
    models.DetalleVentaProducto.findAll = async () => [];

    const formatted = await ProductService._queryFormattedProducts({ eliminado: 0 });
    const byId = new Map(formatted.map(p => [p.idProducto, p]));

    // Escenario 1: Insumo con stock 0 -> producto Activo, stock 0, agotado true
    assert.equal(byId.get(1).estado, 'Activo');
    assert.equal(byId.get(1).stock, 0);
    assert.equal(byId.get(1).agotado, true);

    // Escenario 2: 1 lote vencido + 1 lote vigente (0.60kg / 0.15kg = 4 porciones) -> Activo, stock 4, agotado false
    assert.equal(byId.get(2).estado, 'Activo');
    assert.equal(byId.get(2).stock, 4);
    assert.equal(byId.get(2).agotado, false);

    // Escenario 3: Todos los lotes vencidos (sin retirar aún) -> Activo, stock 0, agotado true al instante
    assert.equal(byId.get(3).estado, 'Activo');
    assert.equal(byId.get(3).stock, 0);
    assert.equal(byId.get(3).agotado, true);

    // Escenario 4: Insumo inactivado manualmente (estado === 0) aunque tenga 50 kg -> Activo, stock 0, agotado true
    assert.equal(byId.get(4).estado, 'Activo');
    assert.equal(byId.get(4).stock, 0);
    assert.equal(byId.get(4).agotado, true);

    // Escenario 5: [SIN_CONTROL_STOCK] inactivado manualmente -> Activo, stock 0, agotado true
    assert.equal(byId.get(5).estado, 'Activo');
    assert.equal(byId.get(5).stock, 0);
    assert.equal(byId.get(5).agotado, true);

    // Escenario 6: Bebida directa cuyo insumo está inactivado manualmente (estado === 0, stock 50) -> Activo, stock 0, agotado true
    assert.equal(byId.get(8).estado, 'Activo');
    assert.equal(byId.get(8).stock, 0);
    assert.equal(byId.get(8).agotado, true);
  } finally {
    models.Product.findAll = originals.productFindAll;
    models.FichaTecnica.findAll = originals.fichaFindAll;
    models.Insumo.findAll = originals.insumoFindAll;
    models.LoteInsumo.findAll = originals.loteFindAll;
    models.DetalleVentaProducto.findAll = originals.detalleVentaFindAll;
    models.sequelize.query = originals.seqQuery;
  }
});

// ============================================================================
// 3. PRUEBAS DE INTEGRACIÓN EN VentaService.create (BLOQUEO 409 + FEFO + MISE & PLACE)
// ============================================================================

test('VentaService.create bloquea con 409 Conflict ante falta de stock vigente/insumo inactivo y descuenta FEFO del lote sano', async () => {
  const originals = {
    userFindByPk: models.User.findByPk,
    clienteFindOne: models.Cliente.findOne,
    eventoFindAll: models.Evento.findAll,
    productFindByPk: models.Product.findByPk,
    varianteFindByPk: models.Variante.findByPk,
    varianteInsumoFindAll: models.VarianteInsumo.findAll,
    fichaFindOne: models.FichaTecnica.findOne,
    comboFindAll: models.ComboProducto.findAll,
    insumoFindAll: models.Insumo.findAll,
    insumoFindByPk: models.Insumo.findByPk,
    loteFindAll: models.LoteInsumo.findAll,
    loteFindByPk: models.LoteInsumo.findByPk,
    ventaCreate: models.Venta.create,
    ventaFindByPk: models.Venta.findByPk,
    detalleCreate: models.DetalleVentaProducto.create,
    detalleAdicCreate: models.DetalleVentaAdicion.create,
    detalleAdicFindAll: models.DetalleVentaAdicion.findAll,
    trazabilidadCreate: models.Trazabilidad.create,
    seqTransaction: models.sequelize.transaction,
    seqQuery: models.sequelize.query,
    getById: VentaService.getById,
    registrarFidelidad: VentaService.registrarFidelidadUnaVez
  };

  try {
    // Estado mutable en memoria simulando la BD
    const db = {
      nextVentaId: 500,
      ventas: new Map(),
      detalles: [],
      products: new Map([
        [1, makeMockRow({ idProducto: 1, nombre: 'Burger Stock Cero', precio: 18000, estado: 1, eliminado: 0 })],
        [2, makeMockRow({ idProducto: 2, nombre: 'Burger Mixto FEFO', precio: 20000, estado: 1, eliminado: 0 })],
        [3, makeMockRow({ idProducto: 3, nombre: 'Burger Lotes Vencidos', precio: 21000, estado: 1, eliminado: 0 })],
        [4, makeMockRow({ idProducto: 4, nombre: 'Burger Insumo Inactivo', precio: 22000, estado: 1, eliminado: 0 })],
        [5, makeMockRow({ idProducto: 5, nombre: 'Burger Pan Compartido A', precio: 19000, estado: 1, eliminado: 0 })],
        [6, makeMockRow({ idProducto: 6, nombre: 'Burger Pan Compartido B', precio: 19500, estado: 1, eliminado: 0 })],
        [7, makeMockRow({ idProducto: 7, nombre: 'Burger Con Cebolla', precio: 18500, estado: 1, eliminado: 0 })]
      ]),
      variantes: new Map([
        [11, makeMockRow({ idVariante: 11, idProducto: 1, nombre: 'Burger Stock Cero - base', precio: 18000, estado: 1 })],
        [12, makeMockRow({ idVariante: 12, idProducto: 2, nombre: 'Burger Mixto FEFO - base', precio: 20000, estado: 1 })],
        [13, makeMockRow({ idVariante: 13, idProducto: 3, nombre: 'Burger Lotes Vencidos - base', precio: 21000, estado: 1 })],
        [14, makeMockRow({ idVariante: 14, idProducto: 4, nombre: 'Burger Insumo Inactivo - base', precio: 22000, estado: 1 })],
        [15, makeMockRow({ idVariante: 15, idProducto: 5, nombre: 'Burger Pan Compartido A - base', precio: 19000, estado: 1 })],
        [16, makeMockRow({ idVariante: 16, idProducto: 6, nombre: 'Burger Pan Compartido B - base', precio: 19500, estado: 1 })],
        [17, makeMockRow({ idVariante: 17, idProducto: 7, nombre: 'Burger Con Cebolla - base', precio: 18500, estado: 1 })]
      ]),
      insumos: new Map([
        [101, makeMockRow({ idInsumo: 101, nombre: 'Carne Cero', stock: 0, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '' })],
        [102, makeMockRow({ idInsumo: 102, nombre: 'Carne FEFO', stock: 10.60, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '' })],
        [103, makeMockRow({ idInsumo: 103, nombre: 'Carne Vencida', stock: 10.00, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '' })],
        [104, makeMockRow({ idInsumo: 104, nombre: 'Carne Inactiva', stock: 50.00, unidadMedida: 'kg', estado: 0, eliminado: 0, descripcion: '' })],
        [105, makeMockRow({ idInsumo: 105, nombre: 'Pan Brioche', stock: 1, unidadMedida: 'und', estado: 1, eliminado: 0, descripcion: '' })],
        [106, makeMockRow({ idInsumo: 106, nombre: 'Carne Sana', stock: 10, unidadMedida: 'kg', estado: 1, eliminado: 0, descripcion: '' })],
        [107, makeMockRow({ idInsumo: 107, nombre: 'Cebolla Cabezona', stock: 0, unidadMedida: 'kg', estado: 0, eliminado: 0, descripcion: '' })]
      ]),
      lotes: [
        makeMockRow({ idLote: 1, idInsumo: 102, numeroLote: 'L-EXP', cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2020-01-01', estado: 'VENCIDO' }),
        makeMockRow({ idLote: 2, idInsumo: 102, numeroLote: 'L-OK', cantidad: 0.60, cantidadDisponible: 0.60, fechaVencimiento: '2099-12-31', estado: 'ACTIVO' }),
        makeMockRow({ idLote: 3, idInsumo: 103, numeroLote: 'L-EXP-ALL', cantidad: 10, cantidadDisponible: 10, fechaVencimiento: '2020-01-01', estado: 'ACTIVO' })
      ],
      fichasByProd: new Map([
        [1, { idFichaTecnica: 1, idProducto: 1, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 101, cantidad: 150, unidadMedida: 'g' }] }],
        [2, { idFichaTecnica: 2, idProducto: 2, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 102, cantidad: 150, unidadMedida: 'g' }] }],
        [3, { idFichaTecnica: 3, idProducto: 3, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 103, cantidad: 150, unidadMedida: 'g' }] }],
        [4, { idFichaTecnica: 4, idProducto: 4, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 104, cantidad: 150, unidadMedida: 'g' }] }],
        [5, { idFichaTecnica: 5, idProducto: 5, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 105, cantidad: 1, unidadMedida: 'und' }] }],
        [6, { idFichaTecnica: 6, idProducto: 6, tipo: 'PRODUCTO', estado: 1, detalles: [{ idInsumo: 105, cantidad: 1, unidadMedida: 'und' }] }],
        [7, { idFichaTecnica: 7, idProducto: 7, tipo: 'PRODUCTO', estado: 1, detalles: [
          { idInsumo: 106, cantidad: 150, unidadMedida: 'g' },
          { idInsumo: 107, cantidad: 40, unidadMedida: 'g' }
        ] }]
      ])
    };

    models.User.findByPk = async () => ({
      idUsuario: 1,
      idRol: 1,
      nombre: 'Admin',
      apellidos: 'Chazin',
      estado: 'ACTIVO',
      rolInfo: { nombre: 'Administrador' }
    });
    models.Cliente.findOne = async () => ({ idCliente: 1, direccion: '{"esMostrador":true}', estado: 1 });
    models.Evento.findAll = async () => [];
    models.Product.findByPk = async (id) => db.products.get(Number(id)) || null;
    models.Variante.findByPk = async (id) => db.variantes.get(Number(id)) || null;
    models.VarianteInsumo.findAll = async () => [];
    models.ComboProducto.findAll = async () => [];
    models.FichaTecnica.findOne = async ({ where }) => {
      if (where?.idProducto) return db.fichasByProd.get(Number(where.idProducto)) || null;
      return null;
    };
    models.Insumo.findAll = async ({ where } = {}) => {
      const ids = where?.idInsumo ? (Array.isArray(where.idInsumo) ? where.idInsumo : [where.idInsumo]) : null;
      const all = Array.from(db.insumos.values());
      return ids ? all.filter(i => ids.map(Number).includes(i.idInsumo)) : all;
    };
    models.Insumo.findByPk = async (id) => db.insumos.get(Number(id)) || null;
    models.LoteInsumo.findAll = async ({ where } = {}) => {
      const ids = where?.idInsumo ? (Array.isArray(where.idInsumo) ? where.idInsumo : [where.idInsumo]) : null;
      return db.lotes.filter(l => (!ids || ids.map(Number).includes(l.idInsumo)) && l.estado !== 'AGOTADO');
    };
    models.LoteInsumo.findByPk = async (id) => db.lotes.find(l => l.idLote === Number(id)) || null;
    models.sequelize.transaction = async (fn) => {
      const fakeT = { LOCK: { UPDATE: 'UPDATE' }, commit: async () => {}, rollback: async () => {} };
      return fn(fakeT);
    };
    models.sequelize.query = async (sql, { replacements } = {}) => {
      if (sql.includes('FROM variante WHERE idProducto')) {
        const v = Array.from(db.variantes.values()).find(row => row.idProducto === Number(replacements?.id));
        return [v ? [{ idVariante: v.idVariante, idProducto: v.idProducto }] : []];
      }
      if (sql.includes('FROM variante WHERE idVariante')) {
        const v = db.variantes.get(Number(replacements?.id));
        return [v ? [{ idVariante: v.idVariante, idProducto: v.idProducto }] : []];
      }
      return [[]];
    };
    models.Venta.create = async (payload) => {
      const row = makeMockRow({ idVenta: db.nextVentaId++, ...payload });
      db.ventas.set(row.idVenta, row);
      return row;
    };
    models.Venta.findByPk = async (id) => db.ventas.get(Number(id)) || null;
    models.DetalleVentaProducto.create = async (payload) => {
      const row = makeMockRow({ idDetalleVenta: db.detalles.length + 1, ...payload });
      db.detalles.push(row);
      return row;
    };
    models.DetalleVentaAdicion.create = async (payload) => makeMockRow(payload);
    models.DetalleVentaAdicion.findAll = async () => [];
    models.Trazabilidad.create = async () => ({});
    VentaService.registrarFidelidadUnaVez = async () => false;
    VentaService.getById = async (id) => {
      const v = db.ventas.get(Number(id));
      const obs = JSON.parse(v.observaciones);
      const dets = db.detalles.filter(d => d.idVenta === Number(id)).map(d => {
        const vr = db.variantes.get(Number(d.idVariante));
        return { ...d, idProducto: vr?.idProducto };
      });
      return { ...v, detalles: dets, productos: obs.productos || [] };
    };

    const basePayload = (detalles) => ({
      idUsuario: 1,
      tipoVenta: 'PUNTO_DE_VENTA',
      origen: 'PUNTO_FISICO',
      metodoPago: 'Efectivo',
      estadoPago: 'Pagado',
      detalles
    });

    // ESCENARIO 1: Insumo con stock en 0 -> RECHAZA 409 Conflict y NO crea venta
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 1, cantidad: 1, esVarianteBase: true }])),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.equal(err.code, 'INSUFFICIENT_STOCK');
        assert.match(err.message, /Burger Stock Cero/);
        return true;
      }
    );
    assert.equal(db.ventas.size, 0);

    // ESCENARIO 2a: 1 lote vencido (10kg) + 1 lote vigente (0.60kg = 4 porciones): pedir 5 debe RECHAZAR 409
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 2, cantidad: 5, esVarianteBase: true }])),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Burger Mixto FEFO/);
        return true;
      }
    );
    assert.equal(db.ventas.size, 0);

    // ESCENARIO 2b: pedir 3 (0.45kg <= 0.60kg vigente) DEBE PERMITIR y descontar SOLO del lote vigente (FEFO)
    const ventaOk = await VentaService.create(basePayload([{ idProducto: 2, cantidad: 3, esVarianteBase: true }]));
    assert.ok(ventaOk.idVenta);
    assert.equal(db.insumos.get(102).stock, 10.15); // 10.60 - 0.45
    assert.equal(db.lotes[0].cantidadDisponible, 10); // Lote vencido INTACTO
    assert.equal(db.lotes[1].cantidadDisponible, 0.15); // Lote vigente descontado 0.60 -> 0.15
    assert.equal(db.lotes[1].estado, 'ACTIVO');

    // ESCENARIO 2c: intentar vender 2 más (0.30kg > 0.15kg restante vigente) RECHAZA 409
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 2, cantidad: 2, esVarianteBase: true }])),
      (err) => err.statusCode === 409
    );

    // ESCENARIO 2d: Cancelar la venta restaura tanto insumo.stock como el lote FEFO
    await VentaService.updateEstado(ventaOk.idVenta, 'CANCELADO');
    assert.equal(db.insumos.get(102).stock, 10.60);
    assert.equal(db.lotes[1].cantidadDisponible, 0.60);
    assert.equal(db.lotes[0].cantidadDisponible, 10);

    // ESCENARIO 3: Todos los lotes vencidos (aún sin retirar) -> RECHAZA 409
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 3, cantidad: 1, esVarianteBase: true }])),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Burger Lotes Vencidos/);
        return true;
      }
    );

    // ESCENARIO 4: Insumo inactivado manualmente (estado === 0, stock 50kg) -> RECHAZA 409
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 4, cantidad: 1, esVarianteBase: true }])),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Burger Insumo Inactivo/);
        assert.match(err.message, /inactivo/i);
        return true;
      }
    );

    // ESCENARIO 5: Dos productos distintos en el mismo carrito compitiendo por el ÚLTIMO Pan Brioche (stock = 1) -> RECHAZA 409
    await assert.rejects(
      () => VentaService.create(basePayload([
        { idProducto: 5, cantidad: 1, esVarianteBase: true },
        { idProducto: 6, cantidad: 1, esVarianteBase: true }
      ])),
      (err) => {
        assert.equal(err.statusCode, 409);
        assert.match(err.message, /Burger Pan Compartido A/);
        assert.match(err.message, /Burger Pan Compartido B/);
        return true;
      }
    );

    // ESCENARIO 6: Mise & Place ("Sin cebolla") permite vender cuando Cebolla está agotada/inactiva
    await assert.rejects(
      () => VentaService.create(basePayload([{ idProducto: 7, cantidad: 1, esVarianteBase: true }])),
      (err) => err.statusCode === 409
    );
    const ventaSinCebolla = await VentaService.create(basePayload([
      { idProducto: 7, cantidad: 1, esVarianteBase: true, ingredientesRemovidos: ['Cebolla Cabezona'] }
    ]));
    assert.ok(ventaSinCebolla.idVenta);
    assert.equal(db.insumos.get(106).stock, 9.85); // Carne descontada
    assert.equal(db.insumos.get(107).stock, 0);    // Cebolla intacta
  } finally {
    models.User.findByPk = originals.userFindByPk;
    models.Cliente.findOne = originals.clienteFindOne;
    models.Evento.findAll = originals.eventoFindAll;
    models.Product.findByPk = originals.productFindByPk;
    models.Variante.findByPk = originals.varianteFindByPk;
    models.VarianteInsumo.findAll = originals.varianteInsumoFindAll;
    models.FichaTecnica.findOne = originals.fichaFindOne;
    models.ComboProducto.findAll = originals.comboFindAll;
    models.Insumo.findAll = originals.insumoFindAll;
    models.Insumo.findByPk = originals.insumoFindByPk;
    models.LoteInsumo.findAll = originals.loteFindAll;
    models.LoteInsumo.findByPk = originals.loteFindByPk;
    models.Venta.create = originals.ventaCreate;
    models.Venta.findByPk = originals.ventaFindByPk;
    models.DetalleVentaProducto.create = originals.detalleCreate;
    models.DetalleVentaAdicion.create = originals.detalleAdicCreate;
    models.DetalleVentaAdicion.findAll = originals.detalleAdicFindAll;
    models.Trazabilidad.create = originals.trazabilidadCreate;
    models.sequelize.transaction = originals.seqTransaction;
    models.sequelize.query = originals.seqQuery;
    VentaService.getById = originals.getById;
    VentaService.registrarFidelidadUnaVez = originals.registrarFidelidad;
  }
});
