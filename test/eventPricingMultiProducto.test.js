const assert = require('assert');
const {
  resolveEventUnitPriceForProduct,
  resolveBestEventUnitPrice
} = require('../src/infrastructure/utils/eventPricingUtils');

const superFinDeSemana = {
  idEvento: 3,
  nombreEvento: 'Super Fin de Semana Chazin (15% OFF)',
  tipoEvento: 'Descuento',
  idProducto: 4,
  descuento: '15.00',
  nuevoPrecio: '11900.00',
  productosAsociados: JSON.stringify([
    { idProducto: 1, nombre: 'Hamburguesa Clásica Chazin', precioBase: 18000, nuevoPrecio: 15300, descuento: 15 },
    { idProducto: 4, nombre: 'Perro Caliente Especial Americano', precioBase: 14000, nuevoPrecio: 11900, descuento: 15 },
    { idProducto: 6, nombre: 'Salchipapa Salvaje Gourmet', precioBase: 23000, nuevoPrecio: 19550, descuento: 15 }
  ])
};

const jueves2x1 = {
  idEvento: 2,
  nombreEvento: 'Jueves 2x1 de Burger Artesanal',
  tipoEvento: '2x1 / Combo Especial',
  idProducto: 1,
  descuento: '50.00',
  nuevoPrecio: '18000.00',
  productosAsociados: JSON.stringify([
    { idProducto: 1, nombre: 'Hamburguesa Clásica Chazin', precioBase: 18000, nuevoPrecio: 18000, descuento: 50 }
  ])
};

let passed = 0;
function test(name, fn) {
  fn();
  passed++;
  console.log(`  PASS: ${name}`);
}

console.log('Ejecutando pruebas de precios de eventos multi-producto...');

test('Salchipapa Salvaje Gourmet ($23.000) recibe $19.550 y NO $11.900 del Perro Caliente', () => {
  const price = resolveBestEventUnitPrice({
    eventosVigentes: [jueves2x1, superFinDeSemana],
    idProducto: 6,
    precioBase: 23000,
    prodBasePrice: 23000
  });
  assert.strictEqual(price, 19550);
});

test('Hamburguesa Clásica Chazin ($18.000) recibe $15.300 y NO $11.900', () => {
  const price = resolveBestEventUnitPrice({
    eventosVigentes: [jueves2x1, superFinDeSemana],
    idProducto: 1,
    precioBase: 18000,
    prodBasePrice: 18000
  });
  assert.strictEqual(price, 15300);
});

test('Perro Caliente Especial Americano ($14.000, idProducto principal) recibe $11.900', () => {
  const price = resolveBestEventUnitPrice({
    eventosVigentes: [jueves2x1, superFinDeSemana],
    idProducto: 4,
    precioBase: 14000,
    prodBasePrice: 14000
  });
  assert.strictEqual(price, 11900);
});

test('Variante Familiar Salvaje ($38.000) recibe 15% OFF ($32.300) y no se aplasta a $19.550 ni $11.900', () => {
  const price = resolveBestEventUnitPrice({
    eventosVigentes: [jueves2x1, superFinDeSemana],
    idProducto: 6,
    precioBase: 38000,
    prodBasePrice: 23000
  });
  assert.strictEqual(price, 32300);
});

test('Producto sin evento conserva su precio base intacto', () => {
  const price = resolveBestEventUnitPrice({
    eventosVigentes: [jueves2x1, superFinDeSemana],
    idProducto: 99,
    precioBase: 22000,
    prodBasePrice: 22000
  });
  assert.strictEqual(price, 22000);
});

test('Evento de un solo producto sin productosAsociados aplica nuevoPrecio solo al idProducto dueño', () => {
  const singleEvt = {
    idEvento: 6,
    idProducto: 3,
    descuento: '17.00',
    nuevoPrecio: '17500.00',
    productosAsociados: null
  };
  assert.strictEqual(
    resolveEventUnitPriceForProduct({ evento: singleEvt, idProducto: 3, precioBase: 21000, prodBasePrice: 21000 }),
    17500
  );
  assert.strictEqual(
    resolveEventUnitPriceForProduct({ evento: singleEvt, idProducto: 6, precioBase: 23000, prodBasePrice: 23000 }),
    null
  );
});

console.log(`Todas las pruebas pasaron (${passed}/${passed}).`);
