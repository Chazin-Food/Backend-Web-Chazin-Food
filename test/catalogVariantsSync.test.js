const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DRINK_PRODUCT_VARIANTS,
  FOOD_PRODUCT_VARIANTS,
  computeDeltasFromBase,
  resolveDrinkInsumoFallback
} = require('../src/infrastructure/utils/catalogVariantsSync');

test('DRINK_PRODUCT_VARIANTS cubre todas las bebidas y precios superiores para tamaños 1.5L y 2.5L', () => {
  const drinkIds = DRINK_PRODUCT_VARIANTS.map((d) => d.idProducto).sort((a, b) => a - b);
  assert.deepEqual(drinkIds, [8, 9, 10, 11, 12, 13, 14, 16, 38, 39]);

  for (const spec of DRINK_PRODUCT_VARIANTS) {
    assert.ok(spec.variants.length >= 1);
    for (const v of spec.variants) {
      assert.ok(v.precio > 0);
      assert.ok(Number.isInteger(v.idInsumo));
      if (v.nombre.includes('1.5')) {
        assert.ok(v.precio > 4500);
      }
      if (v.nombre.includes('2.5')) {
        assert.ok(v.precio >= 13500);
      }
    }
  }
});

test('FOOD_PRODUCT_VARIANTS define variantes coherentes con recetas válidas para hamburguesas, perros y salchipapas', () => {
  const foodIds = FOOD_PRODUCT_VARIANTS.map((f) => f.idProducto).sort((a, b) => a - b);
  assert.deepEqual(foodIds, [1, 3, 4, 5, 6, 27, 28, 30, 32, 33]);

  const redundantBaseNames = new Set([
    'individual bbq bacon 150g',
    'mexicana clásica',
    'porción personal grande'
  ]);

  for (const spec of FOOD_PRODUCT_VARIANTS) {
    assert.ok(spec.variants.length >= 1);
    for (const v of spec.variants) {
      assert.equal(redundantBaseNames.has(v.nombre.toLowerCase()), false);
      assert.ok(v.precio >= 14000);
      assert.ok(Array.isArray(v.detalles) && v.detalles.length >= 4);
      for (const det of v.detalles) {
        assert.ok(det.idInsumo > 0);
        assert.ok(det.cantidad > 0);
        assert.ok(['und', 'kg', 'gr', 'ml', 'lt'].includes(det.unidadMedida));
      }
    }
  }
});

test('computeDeltasFromBase genera REEMPLAZAR, MODIFICAR_CANTIDAD y AGREGAR sin duplicados', () => {
  const base = [
    { idInsumo: 21, cantidad: 0.25, unidadMedida: 'kg' },
    { idInsumo: 17, cantidad: 1.5, unidadMedida: 'und' },
    { idInsumo: 41, cantidad: 0.04, unidadMedida: 'kg' }
  ];
  const target = [
    { idInsumo: 38, cantidad: 0.25, unidadMedida: 'kg' },
    { idInsumo: 17, cantidad: 2, unidadMedida: 'und' },
    { idInsumo: 41, cantidad: 0.04, unidadMedida: 'kg' },
    { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' }
  ];
  const deltas = computeDeltasFromBase(target, base, { 38: 21 });
  assert.deepEqual(deltas.find((d) => d.idInsumo === 38), {
    tipoAccion: 'REEMPLAZAR',
    idInsumo: 38,
    idInsumoReemplazado: 21,
    cantidad: 0.25,
    unidadMedida: 'kg'
  });
  assert.equal(deltas.find((d) => d.idInsumo === 21), undefined);
  assert.equal(deltas.find((d) => d.idInsumo === 17).tipoAccion, 'MODIFICAR_CANTIDAD');
  assert.equal(deltas.find((d) => d.idInsumo === 43).tipoAccion, 'AGREGAR');
});

test('resolveDrinkInsumoFallback distingue Coca-Cola Light, Pepsi Light y sabores Postobón', () => {
  assert.equal(resolveDrinkInsumoFallback('Sin Azúcar / Light 400ml', 'Gaseosa Coca-Cola 400ml', 8), 32);
  assert.equal(resolveDrinkInsumoFallback('Con Azúcar 400ml', 'Gaseosa Coca-Cola Sin Azúcar / Light 400ml', 16), 29);
  assert.equal(resolveDrinkInsumoFallback('Sin Azúcar / Light 400ml', 'Gaseosa Pepsi 400ml', 11), 34);
  assert.equal(resolveDrinkInsumoFallback('Sabor Uva 400ml', 'Gaseosa Manzana Postobón 400ml', 9), 47);
});
