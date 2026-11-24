const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');

const models = require('../src/persistence/models');
const FichaTecnicaService = require('../src/application/services/fichaTecnicaService');
const InsumoPreparadoService = require('../src/application/services/insumoPreparadoService');
const TrazabilidadService = require('../src/application/services/trazabilidadService');
const { cacheResponse, cacheInvalidationMiddleware } = require('../src/infrastructure/utils/apiCache');

test('FichaTecnicaService.saveForInsumoPreparado actualiza ficha y sincroniza DetalleInsumoPreparadoInsumo y costoTotal', async () => {
  const {
    FichaTecnica,
    DetalleFichaInsumo,
    DetalleInsumoPreparadoInsumo,
    Insumo,
    InsumoPreparado
  } = models;

  const origFtFindOne = FichaTecnica.findOne;
  const origDfiDestroy = DetalleFichaInsumo.destroy;
  const origDfiBulkCreate = DetalleFichaInsumo.bulkCreate;
  const origDipiDestroy = DetalleInsumoPreparadoInsumo.destroy;
  const origDipiBulkCreate = DetalleInsumoPreparadoInsumo.bulkCreate;
  const origInsumoFindAll = Insumo.findAll;
  const origPrepFindByPk = InsumoPreparado.findByPk;
  const origGetById = FichaTecnicaService.getById;

  const updatedFtPayloads = [];
  const createdFichaDetalles = [];
  const createdPrepDetalles = [];
  const updatedPrepPayloads = [];

  try {
    const existingFicha = {
      idFichaTecnica: 42,
      idInsumo: 7,
      idVariante: 0,
      tipo: 'INSUMO_PREPARADO',
      procedimiento: '1. Mezclar ingredientes originales.',
      tiempoPreparacion: 10,
      rendimiento: '500 ml',
      especificaciones: 'Homogénea',
      caracteristicas: 'Color crema',
      informacionNutricional: '80 kcal / 30g',
      condicionesAlmacenamiento: 'Refrigerar 2-4°C',
      vidaUtil: '72 horas',
      observaciones: '',
      versionActual: 1,
      fechaInicioVigencia: '2026-10-01T10:00:00.000Z',
      versionesAnteriores: '[]',
      estado: 1,
      detalles: [
        { idInsumo: 10, cantidad: 2, unidadMedida: 'und', insumo: { nombre: 'Ajo', unidadMedida: 'und', precioUnitario: 500 } }
      ],
      async update(payload) {
        updatedFtPayloads.push(payload);
        Object.assign(this, payload);
        return this;
      }
    };

    const mockPrep = {
      id: 7,
      nombre: 'Salsa Chazin Especial',
      descripcion: 'Salsa de la casa',
      rendimiento: 1,
      costoTotal: 1000,
      async update(payload) {
        updatedPrepPayloads.push(payload);
        Object.assign(this, payload);
        return this;
      }
    };

    FichaTecnica.findOne = async () => existingFicha;
    DetalleFichaInsumo.destroy = async () => 1;
    DetalleFichaInsumo.bulkCreate = async (rows) => {
      createdFichaDetalles.push(...rows);
      return rows;
    };
    InsumoPreparado.findByPk = async (id) => (Number(id) === 7 ? mockPrep : null);
    Insumo.findAll = async () => [
      { idInsumo: 10, precioUnitario: 500 },
      { idInsumo: 11, precioUnitario: 2000 }
    ];
    DetalleInsumoPreparadoInsumo.destroy = async () => 1;
    DetalleInsumoPreparadoInsumo.bulkCreate = async (rows) => {
      createdPrepDetalles.push(...rows);
      return rows;
    };
    FichaTecnicaService.getById = async () => ({
      idFichaTecnica: existingFicha.idFichaTecnica,
      procedimiento: existingFicha.procedimiento,
      versionActual: existingFicha.versionActual,
      detalles: createdFichaDetalles
    });

    const result = await FichaTecnicaService.saveForInsumoPreparado(7, {
      procedimiento: '1. Licuar ajo y crema.\n2. Refrigerar 30 min.',
      tiempoPreparacion: 20,
      rendimiento: '1000 ml',
      especificaciones: 'Viscosidad media',
      caracteristicas: 'Sabor intenso',
      informacionNutricional: '95 kcal / 30g',
      condicionesAlmacenamiento: 'Refrigerar 2-4°C hermético',
      vidaUtil: '5 días',
      versionActual: 2,
      versionesAnteriores: [{ version: 1, procedimiento: '1. Mezclar ingredientes originales.' }],
      detalles: [
        { idInsumo: 10, cantidad: 3, unidadMedida: 'und' },
        { idInsumo: 11, cantidad: 2, unidadMedida: 'lt' }
      ]
    });

    assert.equal(updatedFtPayloads.length, 1);
    assert.equal(updatedFtPayloads[0].tiempoPreparacion, 20);
    assert.equal(updatedFtPayloads[0].versionActual, 2);
    assert.equal(createdFichaDetalles.length, 2);
    assert.equal(createdPrepDetalles.length, 2);
    assert.equal(createdPrepDetalles[0].precioUnitario, 500);
    assert.equal(createdPrepDetalles[1].precioUnitario, 2000);
    assert.equal(updatedPrepPayloads.length, 1);
    assert.equal(updatedPrepPayloads[0].costoTotal, 3 * 500 + 2 * 2000);
    assert.equal(updatedPrepPayloads[0].rendimiento, 1000);
    assert.equal(result.versionActual, 2);
  } finally {
    FichaTecnica.findOne = origFtFindOne;
    DetalleFichaInsumo.destroy = origDfiDestroy;
    DetalleFichaInsumo.bulkCreate = origDfiBulkCreate;
    DetalleInsumoPreparadoInsumo.destroy = origDipiDestroy;
    DetalleInsumoPreparadoInsumo.bulkCreate = origDipiBulkCreate;
    Insumo.findAll = origInsumoFindAll;
    InsumoPreparado.findByPk = origPrepFindByPk;
    FichaTecnicaService.getById = origGetById;
  }
});

test('InsumoPreparadoService.update conserva/calcula costoTotal con precios de Insumo y guarda fichaTecnica', async () => {
  const { InsumoPreparado, DetalleInsumoPreparadoInsumo, Insumo } = models;

  const origPrepFindByPk = InsumoPreparado.findByPk;
  const origDipiDestroy = DetalleInsumoPreparadoInsumo.destroy;
  const origDipiCreate = DetalleInsumoPreparadoInsumo.create;
  const origInsumoFindAll = Insumo.findAll;
  const origSaveForPrep = FichaTecnicaService.saveForInsumoPreparado;
  const origGetById = InsumoPreparadoService.getById;
  const origTrazCreate = TrazabilidadService.create;

  const createdDetalles = [];
  const fichaCalls = [];

  try {
    const mockPrep = {
      id: 9,
      nombre: 'Cebolla Caramelizada',
      descripcion: 'Original',
      unidadMedida: 'porción',
      estado: 1,
      costoTotal: 4500,
      async save() {
        return this;
      }
    };

    InsumoPreparado.findByPk = async () => mockPrep;
    Insumo.findAll = async () => [
      { idInsumo: 20, precioUnitario: 3200 },
      { idInsumo: 21, precioUnitario: 1500 }
    ];
    DetalleInsumoPreparadoInsumo.destroy = async () => 1;
    DetalleInsumoPreparadoInsumo.create = async (row) => {
      createdDetalles.push(row);
      return row;
    };
    FichaTecnicaService.saveForInsumoPreparado = async (id, ft, opts) => {
      fichaCalls.push({ id, ft, opts });
      return ft;
    };
    TrazabilidadService.create = async () => ({});
    InsumoPreparadoService.getById = async () => ({
      id: mockPrep.id,
      costoTotal: mockPrep.costoTotal,
      insumos: createdDetalles
    });

    const updated = await InsumoPreparadoService.update(9, {
      descripcion: 'Nueva descripción',
      insumos: [
        { idInsumo: 20, cantidad: 2, unidadMedida: 'kg' },
        { idInsumo: 21, cantidad: 1, unidadMedida: 'kg', precioUnitario: 0 }
      ],
      fichaTecnica: { procedimiento: '1. Sofreír cebolla lentamente.' }
    });

    assert.equal(createdDetalles.length, 2);
    assert.equal(createdDetalles[0].precioUnitario, 3200);
    assert.equal(createdDetalles[1].precioUnitario, 1500);
    assert.equal(updated.costoTotal, 2 * 3200 + 1 * 1500);
    assert.equal(fichaCalls.length, 1);
    assert.equal(fichaCalls[0].opts.skipSyncPreparadoDetalles, true);
  } finally {
    InsumoPreparado.findByPk = origPrepFindByPk;
    DetalleInsumoPreparadoInsumo.destroy = origDipiDestroy;
    DetalleInsumoPreparadoInsumo.create = origDipiCreate;
    Insumo.findAll = origInsumoFindAll;
    FichaTecnicaService.saveForInsumoPreparado = origSaveForPrep;
    InsumoPreparadoService.getById = origGetById;
    TrazabilidadService.create = origTrazCreate;
  }
});

test('apiCache invalida insumos-preparados cuando se actualiza una ficha técnica', () => {
  const middleware = cacheResponse('insumos-preparados', { ttlMs: 15000 });
  const headers = {};
  const makeRes = () => {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headersSent = false;
    res.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
    res.vary = () => {};
    res.status = (code) => { res.statusCode = code; return res; };
    res.send = (body) => { res.sentBody = body; return res; };
    res.json = (obj) => { res.sentJson = obj; return res; };
    return res;
  };

  // 1) Poblar caché de GET /api/insumos-preparados
  const req1 = { method: 'GET', originalUrl: '/api/insumos-preparados', query: {}, headers: {} };
  const res1 = makeRes();
  let nextCalled = 0;
  middleware(req1, res1, () => {
    nextCalled += 1;
    res1.json([{ id: 7, fichaTecnica: { versionActual: 1 } }]);
  });
  assert.equal(nextCalled, 1);
  assert.equal(headers['x-cache'], 'MISS');

  // 2) Confirmar HIT antes de mutar ficha técnica
  const res2 = makeRes();
  middleware(req1, res2, () => { nextCalled += 1; });
  assert.equal(nextCalled, 1);
  assert.equal(headers['x-cache'], 'HIT');

  // 3) Ejecutar invalidación por PUT /api/fichas-tecnicas/insumo-preparado/7
  const putReq = { method: 'PUT', originalUrl: '/api/fichas-tecnicas/insumo-preparado/7' };
  const putRes = makeRes();
  cacheInvalidationMiddleware(putReq, putRes, () => {});
  putRes.emit('finish');

  // 4) El siguiente GET debe ser MISS (caché invalidada)
  const res3 = makeRes();
  middleware(req1, res3, () => {
    nextCalled += 1;
    res3.json([{ id: 7, fichaTecnica: { versionActual: 2 } }]);
  });
  assert.equal(nextCalled, 2);
  assert.equal(headers['x-cache'], 'MISS');
});
