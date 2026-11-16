const { Op } = require('sequelize');
const {
  sequelize,
  Product,
  Variante,
  VarianteInsumo,
  FichaTecnica,
  DetalleFichaInsumo,
  Insumo
} = require('../../persistence/models');

const DRINK_PRODUCT_VARIANTS = [
  {
    idProducto: 8,
    variants: [
      { nombre: 'Sin Azúcar / Light 400ml', precio: 4500, idInsumo: 32 },
      { nombre: 'Botella 1.5 Litros', precio: 9500, idInsumo: 29 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 29 }
    ]
  },
  {
    idProducto: 16,
    variants: [
      { nombre: 'Con Azúcar 400ml', precio: 4500, idInsumo: 29 },
      { nombre: 'Botella 1.5 Litros', precio: 9500, idInsumo: 32 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 32 }
    ]
  },
  {
    idProducto: 10,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 5500, idInsumo: 31 }
    ]
  },
  {
    idProducto: 9,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 30 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 30 },
      { nombre: 'Sabor Uva 400ml', precio: 8500, idInsumo: 47 },
      { nombre: 'Sabor Naranja 400ml', precio: 8500, idInsumo: 48 },
      { nombre: 'Gaseosa Colombiana Postobón 400ml', precio: 8500, idInsumo: 35 }
    ]
  },
  {
    idProducto: 11,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 33 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 33 },
      { nombre: 'Sin Azúcar / Light 400ml', precio: 8500, idInsumo: 34 }
    ]
  },
  {
    idProducto: 12,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 35 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 35 },
      { nombre: 'Sabor Uva 400ml', precio: 8500, idInsumo: 47 },
      { nombre: 'Sabor Naranja 400ml', precio: 8500, idInsumo: 48 },
      { nombre: 'Sabor Manzana 400ml', precio: 8500, idInsumo: 30 }
    ]
  },
  {
    idProducto: 13,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 36 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 36 }
    ]
  },
  {
    idProducto: 14,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 37 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 37 }
    ]
  },
  {
    idProducto: 38,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 47 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 47 },
      { nombre: 'Sabor Naranja 400ml', precio: 8500, idInsumo: 48 },
      { nombre: 'Sabor Manzana 400ml', precio: 8500, idInsumo: 30 },
      { nombre: 'Sabor Colombiana 400ml', precio: 8500, idInsumo: 35 }
    ]
  },
  {
    idProducto: 39,
    variants: [
      { nombre: 'Botella 1.5 Litros', precio: 10500, idInsumo: 48 },
      { nombre: 'Mega Botella 2.5 Litros', precio: 13500, idInsumo: 48 },
      { nombre: 'Sabor Uva 400ml', precio: 8500, idInsumo: 47 },
      { nombre: 'Sabor Manzana 400ml', precio: 8500, idInsumo: 30 },
      { nombre: 'Sabor Colombiana 400ml', precio: 8500, idInsumo: 35 }
    ]
  }
];

const FOOD_PRODUCT_VARIANTS = [
  {
    idProducto: 1,
    variants: [
      {
        nombre: 'Doble Carne Clásica (300g)',
        precio: 24000,
        descripcion: 'Hamburguesa doble carne de res molida 80/20 (300g), doble queso cheddar y tocineta ahumada.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 14,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'BBQ Ahumada Especial',
        precio: 20500,
        descripcion: 'Hamburguesa clásica bañada en salsa BBQ ahumada artesanal, cebolla cabezona y doble cheddar.',
        rendimiento: '1 porción',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Picante Jalapeño & Cheddar',
        precio: 21000,
        descripcion: 'Hamburguesa con rodajas de jalapeño encurtido y salsa cremosa de queso cheddar fundido.',
        rendimiento: '1 porción',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 3,
    variants: [
      {
        nombre: 'Pollo Crispy Bacon & BBQ',
        precio: 24500,
        descripcion: 'Pechuga crispy crujiente con tocineta ahumada, queso cheddar y salsa BBQ artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 13,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 15, cantidad: 0.18, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 44, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Doble Pollo Crispy (360g)',
        precio: 27500,
        descripcion: 'Doble filete de pechuga crispy (360g) con doble mozzarella gratinado y salsa tártara especial.',
        rendimiento: '1 porción (360g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 15, cantidad: 0.36, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 45, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 27,
    variants: [
      {
        nombre: 'BBQ Bacon Cheddar & Jalapeño',
        precio: 25000,
        descripcion: 'BBQ Bacon 150g enriquecida con cremosa salsa de queso cheddar fundido y rodajas de jalapeños picantes.',
        rendimiento: '1 porción (150g)',
        tiempoPreparacion: 13,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 24, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Doble Carne BBQ Bacon 300g',
        precio: 28000,
        descripcion: 'Doble carne de res 300g con tocineta extra, triple cheddar y abundante salsa BBQ ahumada.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 3, unidadMedida: 'und' },
          { idInsumo: 24, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.04, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 28,
    variants: [
      {
        nombre: 'Extra Picante con Doble Jalapeño',
        precio: 25000,
        descripcion: 'Versión intensa con doble porción de jalapeños, guacamole extra y salsa de cheddar fundido.',
        rendimiento: '1 porción',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 40, cantidad: 0.07, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Doble Carne Mexicana (300g)',
        precio: 29500,
        descripcion: 'Doble carne de res 300g con doble mozzarella gratinado, extra guacamole artesanal y jalapeños.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 40, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 4,
    variants: [
      {
        nombre: 'Doble Salchicha & Extra Queso',
        precio: 18000,
        descripcion: 'Perro americano con doble salchicha premium, tocineta ahumada y extra mozzarella gratinado.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.07, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Con Chili & Cheddar Fundido',
        precio: 18500,
        descripcion: 'Perro americano cubierto con chili con carne artesanal y salsa de queso cheddar fundido.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 39, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'BBQ Tocino & Cebolla',
        precio: 16500,
        descripcion: 'Perro caliente americano con extra tocineta, cebolla caramelizada y salsa BBQ ahumada.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 5,
    variants: [
      {
        nombre: 'Suizo Gratinado con Tártara & Cheddar',
        precio: 19500,
        descripcion: 'Salchicha suiza ahumada con gratinado extra de mozzarella, salsa cheddar y tártara de la casa.',
        rendimiento: '1 porción',
        tiempoPreparacion: 11,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 45, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Doble Salchicha Suiza Jumbo',
        precio: 22500,
        descripcion: 'Edición jumbo con doble salchicha suiza artesanal ahumada, tocineta y queso mozzarella.',
        rendimiento: '1 porción Jumbo',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.07, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 30,
    variants: [
      {
        nombre: 'Mexicano Extra Picante & Doble Salchicha',
        precio: 20500,
        descripcion: 'Doble salchicha americana con extra guacamole, doble jalapeño picante, cheddar y tocineta.',
        rendimiento: '1 porción',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 40, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.04, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 6,
    variants: [
      {
        nombre: 'Salvaje con Carne & Cheddar (Mediana)',
        precio: 27500,
        descripcion: 'Salchipapa salvaje enriquecida con chili con carne de res artesanal y salsa cheddar fundido.',
        rendimiento: '1 porción abundante',
        tiempoPreparacion: 14,
        detalles: [
          { idInsumo: 21, cantidad: 0.25, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 39, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.04, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Familiar Salvaje (2 a 3 Personas)',
        precio: 38000,
        descripcion: 'Porción familiar generosa (500g de papas, doble salchicha americana y suiza, tocineta y mozzarella).',
        rendimiento: '2 a 3 porciones',
        tiempoPreparacion: 16,
        detalles: [
          { idInsumo: 21, cantidad: 0.50, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.12, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 32,
    variants: [
      {
        nombre: 'Criolla Especial con Chili con Carne',
        precio: 25500,
        descripcion: 'Salchipapa criolla tradicional enriquecida con chili con carne artesanal y extra salsa cheddar fundido.',
        rendimiento: '1 porción abundante',
        tiempoPreparacion: 14,
        detalles: [
          { idInsumo: 21, cantidad: 0.25, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 1.5, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 41, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 39, cantidad: 0.08, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Familiar para Compartir (2 Personas)',
        precio: 34000,
        descripcion: 'Versión familiar para 2 personas con doble porción de papa, 3 salchichas americanas, tocineta y salsas.',
        rendimiento: '2 porciones',
        tiempoPreparacion: 16,
        detalles: [
          { idInsumo: 21, cantidad: 0.50, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 3, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.10, unidadMedida: 'kg' },
          { idInsumo: 41, cantidad: 0.06, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.06, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 33,
    variants: [
      {
        nombre: 'Costeña con Papas en Casco Rústicas',
        precio: 24000,
        descripcion: 'Salchipapa costeña preparada con papas rústicas en casco con piel en reemplazo de papa delgada.',
        rendimiento: '1 porción',
        tiempoPreparacion: 14,
        replacements: { 38: 21 },
        detalles: [
          { idInsumo: 38, cantidad: 0.25, unidadMedida: 'kg' },
          { idInsumo: 17, cantidad: 1.5, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 41, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 45, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Familiar Costeña (2 Personas)',
        precio: 36000,
        descripcion: 'Presentación familiar costeña para 2 personas con 3 salchichas suizas, suero costeño y salsa tártara.',
        rendimiento: '2 porciones',
        tiempoPreparacion: 16,
        detalles: [
          { idInsumo: 21, cantidad: 0.50, unidadMedida: 'kg' },
          { idInsumo: 17, cantidad: 3, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.10, unidadMedida: 'kg' },
          { idInsumo: 41, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 45, cantidad: 0.06, unidadMedida: 'kg' }
        ]
      }
    ]
  }
];

function computeDeltasFromBase(targetDetalles = [], baseDetalles = [], replacementsMap = {}) {
  const baseMap = new Map((baseDetalles || []).map((b) => [Number(b.idInsumo), b]));
  const targetMap = new Map((targetDetalles || []).map((t) => [Number(t.idInsumo), t]));
  const handledTargetIds = new Set();
  const replacedBaseIds = new Set();
  const deltas = [];

  for (const [newIdStr, oldId] of Object.entries(replacementsMap || {})) {
    const newId = Number(newIdStr);
    const repId = Number(oldId);
    const tItem = targetMap.get(newId);
    if (tItem && baseMap.has(repId) && !targetMap.has(repId)) {
      replacedBaseIds.add(repId);
      handledTargetIds.add(newId);
      deltas.push({
        tipoAccion: 'REEMPLAZAR',
        idInsumo: newId,
        idInsumoReemplazado: repId,
        cantidad: Number(tItem.cantidad || 0),
        unidadMedida: tItem.unidadMedida || 'und'
      });
    }
  }

  for (const [baseId, baseItem] of baseMap.entries()) {
    if (replacedBaseIds.has(baseId)) continue;
    const tItem = targetMap.get(baseId);
    if (!tItem) {
      deltas.push({
        tipoAccion: 'QUITAR',
        idInsumo: baseId,
        idInsumoReemplazado: null,
        cantidad: 0,
        unidadMedida: baseItem.unidadMedida || 'und'
      });
    } else if (
      Math.abs(Number(baseItem.cantidad || 0) - Number(tItem.cantidad || 0)) > 0.001 ||
      String(baseItem.unidadMedida || 'und').toLowerCase() !== String(tItem.unidadMedida || 'und').toLowerCase()
    ) {
      deltas.push({
        tipoAccion: 'MODIFICAR_CANTIDAD',
        idInsumo: baseId,
        idInsumoReemplazado: null,
        cantidad: Number(tItem.cantidad || 0),
        unidadMedida: tItem.unidadMedida || 'und'
      });
    }
  }

  for (const [targetId, tItem] of targetMap.entries()) {
    if (!baseMap.has(targetId) && !handledTargetIds.has(targetId)) {
      deltas.push({
        tipoAccion: 'AGREGAR',
        idInsumo: targetId,
        idInsumoReemplazado: null,
        cantidad: Number(tItem.cantidad || 0),
        unidadMedida: tItem.unidadMedida || 'und'
      });
    }
  }

  return deltas;
}

function resolveDrinkInsumoFallback(variantName = '', prodName = '', prodId = 0) {
  const vn = String(variantName || '').toLowerCase();
  const pn = String(prodName || '').toLowerCase();
  const pid = Number(prodId || 0);

  if (vn.includes('coca') || pid === 8 || pid === 16 || pn.includes('coca')) {
    if (/con az[uú]car|\boriginal\b|\bcl[aá]sic/.test(vn)) return 29;
    if (/sin az[uú]car|\blight\b|\bzero\b/.test(vn)) return 32;
    return (pid === 16 || /sin az[uú]car|\blight\b|\bzero\b/.test(pn)) ? 32 : 29;
  }
  if (vn.includes('pepsi') || pid === 11 || pn.includes('pepsi')) {
    return /sin az[uú]car|\blight\b|\bzero\b|\bblack\b/.test(vn) ? 34 : 33;
  }
  if (vn.includes('uva')) return 47;
  if (vn.includes('naranja')) return 48;
  if (vn.includes('manzana')) return 30;
  if (vn.includes('colombiana')) return 35;
  if (vn.includes('sprite')) return 36;
  if (vn.includes('quatro') || vn.includes('cuatro') || vn.includes('toronja')) return 37;
  if (vn.includes('agua')) return 31;

  if (pid === 38) return 47;
  if (pid === 39) return 48;
  if (pid === 9) return 30;
  if (pid === 12) return 35;
  if (pid === 13) return 36;
  if (pid === 14) return 37;
  if (pid === 10) return 31;
  return null;
}

async function ensureVariantFichaAndDeltas({
  product,
  variant,
  detalles,
  deltas,
  descripcion,
  rendimiento = '1 porción',
  tiempoPreparacion = 0,
  procedimiento = '',
  baseFicha = null,
  isDrink = false,
  transaction
}) {
  let mutated = false;

  const defaultQuality = isDrink
    ? {
        especificaciones: 'Bebida servida entre 2°C y 4°C, envase sellado y fecha vigente.',
        caracteristicas: `Presentación ${variant.nombre}, sabor refrescante y gasificación óptima.`,
        informacionNutricional: /sin az|light|zero|agua/i.test(`${product.nombre} ${variant.nombre}`)
          ? 'Porción: 0 kcal | 0g carbohidratos | 0g grasas | 10 mg sodio.'
          : 'Porción 400ml: ~165 kcal | 40g carbohidratos (azúcares) | 0g grasa | 35 mg sodio.',
        condicionesAlmacenamiento: 'Mantener en vitrina refrigerada entre 2°C y 6°C.',
        vidaUtil: 'Según fecha impresa en envase; consumo inmediato al abrir.'
      }
    : {
        especificaciones: 'Cocción completa (>70°C en el centro), empaque térmico y control de gramaje estándar.',
        caracteristicas: `Presentación ${variant.nombre}, aroma fresco, color dorado uniforme y textura equilibrada.`,
        informacionNutricional: 'Porción estándar: ~680 kcal | Proteínas: 34g | Carbohidratos: 48g | Grasas: 35g.',
        condicionesAlmacenamiento: 'Consumo inmediato en mesa o en empaque térmico antigrasa antes de 25 minutos.',
        vidaUtil: 'Consumo inmediato'
      };

  const resolvedEspec = (baseFicha?.especificaciones || '').trim() || defaultQuality.especificaciones;
  const resolvedCaract = (baseFicha?.caracteristicas || '').trim() || defaultQuality.caracteristicas;
  const resolvedNutri = (baseFicha?.informacionNutricional || '').trim() || defaultQuality.informacionNutricional;
  const resolvedAlm = (baseFicha?.condicionesAlmacenamiento || '').trim() || defaultQuality.condicionesAlmacenamiento;
  const resolvedVida = (baseFicha?.vidaUtil || '').trim() || defaultQuality.vidaUtil;

  const existingDeltasCount = await VarianteInsumo.count({
    where: { idVariante: variant.idVariante },
    transaction
  });
  if (existingDeltasCount === 0 && Array.isArray(deltas) && deltas.length > 0) {
    await VarianteInsumo.bulkCreate(
      deltas.map((dl) => ({
        idVariante: variant.idVariante,
        tipoAccion: dl.tipoAccion,
        idInsumo: Number(dl.idInsumo),
        idInsumoReemplazado: dl.idInsumoReemplazado ? Number(dl.idInsumoReemplazado) : null,
        cantidad: Number(dl.cantidad || 0),
        unidadMedida: dl.unidadMedida || 'und',
        observaciones: null
      })),
      { transaction }
    );
    mutated = true;
  }

  let varFicha = await FichaTecnica.findOne({
    where: { idVariante: variant.idVariante, tipo: 'VARIANTE', estado: 1 },
    include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
    transaction
  });

  if (!varFicha) {
    varFicha = await FichaTecnica.create(
      {
        idProducto: product.idProducto,
        idInsumo: null,
        idVariante: variant.idVariante,
        tipo: 'VARIANTE',
        descripcion: descripcion || `${product.nombre} — ${variant.nombre}`,
        procedimiento: procedimiento || '',
        tiempoPreparacion: Number(tiempoPreparacion) || 0,
        rendimiento,
        especificaciones: resolvedEspec,
        caracteristicas: resolvedCaract,
        informacionNutricional: resolvedNutri,
        condicionesAlmacenamiento: resolvedAlm,
        vidaUtil: resolvedVida,
        observaciones: '',
        versionActual: 1,
        estado: 1
      },
      { transaction }
    );
    mutated = true;
  } else {
    const qualityUpdates = {};
    if (!String(varFicha.especificaciones || '').trim()) qualityUpdates.especificaciones = resolvedEspec;
    if (!String(varFicha.caracteristicas || '').trim() || /^Variante:\s*/i.test(String(varFicha.caracteristicas).trim())) {
      qualityUpdates.caracteristicas = resolvedCaract;
    }
    if (!String(varFicha.informacionNutricional || '').trim()) qualityUpdates.informacionNutricional = resolvedNutri;
    if (!String(varFicha.condicionesAlmacenamiento || '').trim()) qualityUpdates.condicionesAlmacenamiento = resolvedAlm;
    if (!String(varFicha.vidaUtil || '').trim()) qualityUpdates.vidaUtil = resolvedVida;
    if (Object.keys(qualityUpdates).length > 0) {
      await varFicha.update(qualityUpdates, { transaction });
      mutated = true;
    }
  }

  const currentDetallesCount = Array.isArray(varFicha.detalles)
    ? varFicha.detalles.length
    : await DetalleFichaInsumo.count({ where: { idFichaTecnica: varFicha.idFichaTecnica }, transaction });

  if (currentDetallesCount === 0 && Array.isArray(detalles) && detalles.length > 0) {
    await DetalleFichaInsumo.bulkCreate(
      detalles.map((d) => ({
        idFichaTecnica: varFicha.idFichaTecnica,
        idInsumo: Number(d.idInsumo),
        cantidad: Number(d.cantidad),
        unidadMedida: d.unidadMedida || 'und'
      })),
      { transaction }
    );
    mutated = true;
  }

  return mutated;
}

let activeSyncPromise = null;

/**
 * Asegura de forma idempotente:
 * 1) Precios e insumos/fichas reales de todas las presentaciones y sabores de gaseosas/bebidas.
 * 2) Variantes gastronómicas coherentes con fichas y deltas para hamburguesas, perros calientes y salchipapas.
 */
async function ensureCatalogVariantsAndDrinkFichas() {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    const t = await sequelize.transaction();
    let changed = false;

    try {
      const [allProducts, allInsumos] = await Promise.all([
        Product.findAll({ where: { idProducto: { [Op.ne]: 0 } }, transaction: t }),
        Insumo.findAll({ attributes: ['idInsumo', 'nombre', 'unidadMedida', 'estado'], transaction: t })
      ]);

      const productById = new Map(allProducts.map((p) => [Number(p.idProducto), p]));
      const validInsumoIds = new Set(allInsumos.map((i) => Number(i.idInsumo)));

      // 1. Gaseosas y bebidas: precios consistentes + insumo/ficha en todas las variantes reales
      for (const spec of DRINK_PRODUCT_VARIANTS) {
        const prod = productById.get(spec.idProducto);
        if (!prod || Number(prod.eliminado || 0) === 1) continue;

        const existingVars = await Variante.findAll({ where: { idProducto: prod.idProducto }, transaction: t });
        const byLowerName = new Map(
          existingVars.map((v) => [String(v.nombre || '').trim().toLowerCase(), v])
        );

        for (const vSpec of spec.variants) {
          if (!validInsumoIds.has(vSpec.idInsumo)) continue;
          const key = vSpec.nombre.trim().toLowerCase();
          let varRow = byLowerName.get(key);

          if (!varRow) {
            varRow = await Variante.create(
              {
                idProducto: prod.idProducto,
                nombre: vSpec.nombre,
                descripcion: `${prod.nombre} (${vSpec.nombre})`,
                precio: vSpec.precio,
                estado: prod.estado !== undefined ? prod.estado : 1
              },
              { transaction: t }
            );
            byLowerName.set(key, varRow);
            changed = true;
          } else if (Math.abs(Number(varRow.precio || 0) - Number(vSpec.precio)) > 0.01) {
            await varRow.update({ precio: vSpec.precio }, { transaction: t });
            changed = true;
          }

          const varChanged = await ensureVariantFichaAndDeltas({
            product: prod,
            variant: varRow,
            detalles: [{ idInsumo: vSpec.idInsumo, cantidad: 1, unidadMedida: 'und' }],
            deltas: [{ tipoAccion: 'AGREGAR', idInsumo: vSpec.idInsumo, idInsumoReemplazado: null, cantidad: 1, unidadMedida: 'und' }],
            descripcion: `${prod.nombre} — ${varRow.nombre}`,
            rendimiento: '1 porción',
            tiempoPreparacion: 1,
            procedimiento: 'Servir bebida refrigerada entre 2°C y 4°C según presentación.',
            isDrink: true,
            transaction: t
          });
          if (varChanged) changed = true;
        }

        // Asegurar variantes restantes no contempladas explícitamente en DRINK_PRODUCT_VARIANTS
        const allDrinkVars = await Variante.findAll({ where: { idProducto: prod.idProducto }, transaction: t });
        for (const dv of allDrinkVars) {
          const vn = String(dv.nombre || '').trim().toLowerCase();
          const pn = String(prod.nombre || '').trim().toLowerCase();
          if (!vn || vn === pn || vn.endsWith(' - base') || vn === 'botella 500ml') continue;
          const insId = resolveDrinkInsumoFallback(dv.nombre, prod.nombre, prod.idProducto);
          if (!insId || !validInsumoIds.has(insId)) continue;
          const extraChanged = await ensureVariantFichaAndDeltas({
            product: prod,
            variant: dv,
            detalles: [{ idInsumo: insId, cantidad: 1, unidadMedida: 'und' }],
            deltas: [{ tipoAccion: 'AGREGAR', idInsumo: insId, idInsumoReemplazado: null, cantidad: 1, unidadMedida: 'und' }],
            descripcion: `${prod.nombre} — ${dv.nombre}`,
            rendimiento: '1 porción',
            tiempoPreparacion: 1,
            procedimiento: 'Servir bebida refrigerada entre 2°C y 4°C según presentación.',
            isDrink: true,
            transaction: t
          });
          if (extraChanged) changed = true;
        }
      }

      // 2. Hamburguesas, perros calientes y salchipapas gourmet
      for (const foodSpec of FOOD_PRODUCT_VARIANTS) {
        const prod = productById.get(foodSpec.idProducto);
        if (!prod || Number(prod.eliminado || 0) === 1) continue;

        const baseFicha = await FichaTecnica.findOne({
          where: {
            idProducto: prod.idProducto,
            estado: 1,
            [Op.or]: [{ tipo: 'PRODUCTO' }, { tipo: null }]
          },
          include: [{ model: DetalleFichaInsumo, as: 'detalles' }],
          order: [['idFichaTecnica', 'ASC']],
          transaction: t
        });
        const baseDetalles = (baseFicha?.detalles || []).map((d) => ({
          idInsumo: Number(d.idInsumo),
          cantidad: Number(d.cantidad || 0),
          unidadMedida: d.unidadMedida || 'und'
        }));

        const existingVars = await Variante.findAll({ where: { idProducto: prod.idProducto }, transaction: t });
        const byLowerName = new Map(
          existingVars.map((v) => [String(v.nombre || '').trim().toLowerCase(), v])
        );

        for (const vSpec of foodSpec.variants) {
          const validDetalles = vSpec.detalles.filter((d) => validInsumoIds.has(Number(d.idInsumo)));
          if (validDetalles.length === 0) continue;

          const key = vSpec.nombre.trim().toLowerCase();
          let varRow = byLowerName.get(key);

          if (!varRow) {
            varRow = await Variante.create(
              {
                idProducto: prod.idProducto,
                nombre: vSpec.nombre,
                descripcion: vSpec.descripcion || null,
                precio: vSpec.precio,
                estado: prod.estado !== undefined ? prod.estado : 1
              },
              { transaction: t }
            );
            byLowerName.set(key, varRow);
            changed = true;
          } else {
            const updates = {};
            if (Number(varRow.precio || 0) <= 0) updates.precio = vSpec.precio;
            if (!varRow.descripcion && vSpec.descripcion) updates.descripcion = vSpec.descripcion;
            if (Object.keys(updates).length > 0) {
              await varRow.update(updates, { transaction: t });
              changed = true;
            }
          }

          const deltas = computeDeltasFromBase(validDetalles, baseDetalles, vSpec.replacements || {});
          const foodChanged = await ensureVariantFichaAndDeltas({
            product: prod,
            variant: varRow,
            detalles: validDetalles,
            deltas,
            descripcion: vSpec.descripcion || `${prod.nombre} — ${varRow.nombre}`,
            rendimiento: vSpec.rendimiento || '1 porción',
            tiempoPreparacion: vSpec.tiempoPreparacion || baseFicha?.tiempoPreparacion || 12,
            procedimiento: baseFicha?.procedimiento || `Preparación estándar Chazin Food para ${varRow.nombre}.`,
            baseFicha,
            isDrink: false,
            transaction: t
          });
          if (foodChanged) changed = true;
        }

        const REDUNDANT_FOOD_BASE_NAMES = new Set([
          'individual bbq bacon 150g',
          'individual bbq bacon',
          'mexicana clásica',
          'mexicana clasica',
          'porción personal grande',
          'porcion personal grande'
        ]);
        const hasRealFoodVariant = foodSpec.variants.some((vs) =>
          byLowerName.has(vs.nombre.trim().toLowerCase())
        );
        if (hasRealFoodVariant) {
          for (const ev of existingVars) {
            const evName = String(ev.nombre || '').trim().toLowerCase();
            if (REDUNDANT_FOOD_BASE_NAMES.has(evName) && Number(ev.estado ?? 1) !== 0) {
              await ev.update({ estado: 0 }, { transaction: t });
              changed = true;
            }
          }
        }
      }

      await t.commit();
      if (changed) {
        console.log('[CatalogVariantsSync] ✅ Variantes de gaseosas y comidas sincronizadas correctamente.');
      }
      return changed;
    } catch (err) {
      await t.rollback().catch(() => {});
      console.warn('[CatalogVariantsSync] ⚠️ Error sincronizando variantes del catálogo:', err.message);
      return false;
    } finally {
      activeSyncPromise = null;
    }
  })();

  return activeSyncPromise;
}

module.exports = {
  DRINK_PRODUCT_VARIANTS,
  FOOD_PRODUCT_VARIANTS,
  computeDeltasFromBase,
  resolveDrinkInsumoFallback,
  ensureCatalogVariantsAndDrinkFichas
};
