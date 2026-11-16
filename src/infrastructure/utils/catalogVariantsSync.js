const { Op } = require('sequelize');
const {
  sequelize,
  Product,
  Variante,
  VarianteInsumo,
  FichaTecnica,
  DetalleFichaInsumo,
  Insumo,
  InsumoPreparado,
  DetalleInsumoPreparadoInsumo
} = require('../../persistence/models');

const NEW_BASE_INSUMOS = [
  {
    idInsumo: 49,
    idCategoriaInsumo: 1,
    nombre: 'Pan Integral Artesanal con Semillas',
    unidadMedida: 'und',
    stock: 90,
    stockMinimo: 15,
    stockMaximo: 120,
    precioUnitario: 2400,
    esAdicion: 0,
    precioAdicion: 0,
    descripcion: 'Pan artesanal elaborado con harina integral, avena y mezcla de semillas de ajonjolí y linaza'
  },
  {
    idInsumo: 50,
    idCategoriaInsumo: 1,
    nombre: 'Pan Perro Brioche Dorado',
    unidadMedida: 'und',
    stock: 90,
    stockMinimo: 15,
    stockMaximo: 120,
    precioUnitario: 1800,
    esAdicion: 0,
    precioAdicion: 0,
    descripcion: 'Pan estilo brioche alargado dorado con mantequilla para perros calientes gourmet'
  },
  {
    idInsumo: 51,
    idCategoriaInsumo: 3,
    nombre: 'Papas Criollas Doradas Seleccionadas',
    unidadMedida: 'kg',
    stock: 45,
    stockMinimo: 8,
    stockMaximo: 100,
    precioUnitario: 8800,
    esAdicion: 0,
    precioAdicion: 0,
    descripcion: 'Papa criolla amarilla seleccionada pre-cocida lista para fritura crocante'
  },
  {
    idInsumo: 52,
    idCategoriaInsumo: 8,
    nombre: 'Carne Angus Certified 100% Res',
    unidadMedida: 'kg',
    stock: 40,
    stockMinimo: 8,
    stockMaximo: 100,
    precioUnitario: 36000,
    esAdicion: 0,
    precioAdicion: 0,
    descripcion: 'Corte premium de carne de res Angus marmoleada para medallones de hamburguesa gourmet'
  },
  {
    idInsumo: 53,
    idCategoriaInsumo: 8,
    nombre: 'Chorizo Santarrosano Artesanal',
    unidadMedida: 'und',
    stock: 70,
    stockMinimo: 15,
    stockMaximo: 120,
    precioUnitario: 3200,
    esAdicion: 0,
    precioAdicion: 0,
    descripcion: 'Chorizo artesanal tipo santarrosano ligeramente ahumado y especiado'
  }
];

const NEW_PREPARED_INSUMOS = [
  {
    id: 54,
    idCategoriaInsumo: 8,
    nombre: 'Filete de Pechuga Grillé a las Finas Hierbas',
    descripcion: 'Pechuga marinada con finas hierbas, sellada a la plancha para variante proteica ligera',
    unidadMedida: 'kg',
    stock: 30,
    stockMinimo: 6,
    stockMaximo: 80,
    precioUnitario: 22000,
    costoTotal: 17850,
    rendimiento: 1.00,
    unidadRendimiento: 'kg',
    componentes: [
      { idInsumo: 15, cantidad: 1.00, unidadMedida: 'kg', precioUnitario: 17500 },
      { idInsumo: 24, cantidad: 0.10, unidadMedida: 'kg', precioUnitario: 3500 }
    ],
    ficha: {
      tiempoPreparacion: 15,
      rendimiento: '1.00 kg (5 porciones de 180g aprox.)',
      procedimiento: '1. Limpiar y filetear la pechuga de pollo fresca en porciones uniformes de 180g.\n2. Marinar con cebolla finamente picada, ajo y finas hierbas durante al menos 30 minutos.\n3. Sellar en plancha precalentada a 190°C por 3-4 minutos por lado hasta alcanzar 74°C internos.',
      especificaciones: 'Cocción interna mínima de 74°C, sellado dorado uniforme sin resecar la fibra muscular.',
      caracteristicas: 'Filete tierno y jugoso con aroma herbal equilibrado y marcas suaves de plancha.',
      informacionNutricional: 'Por 100g: Calorías ~145 kcal | Proteína: 26g | Carbohidratos: 1.5g | Grasas: 3.5g.',
      condicionesAlmacenamiento: 'Conservar marinado y porcionado en refrigeración estricta entre 0°C y 4°C.',
      vidaUtil: '48 horas refrigerado después de marinado'
    }
  },
  {
    id: 55,
    idCategoriaInsumo: 4,
    nombre: 'Salsa Miel Mostaza Artesanal',
    descripcion: 'Salsa emulsión equilibrada de mostaza americana y mayonesa con toque dulce para variantes y glaseado',
    unidadMedida: 'kg',
    stock: 20,
    stockMinimo: 4,
    stockMaximo: 60,
    precioUnitario: 13500,
    costoTotal: 11800,
    rendimiento: 1.00,
    unidadRendimiento: 'kg',
    componentes: [
      { idInsumo: 27, cantidad: 0.55, unidadMedida: 'kg', precioUnitario: 10000 },
      { idInsumo: 28, cantidad: 0.45, unidadMedida: 'kg', precioUnitario: 14000 }
    ],
    ficha: {
      tiempoPreparacion: 10,
      rendimiento: '1.00 kg',
      procedimiento: '1. Incorporar la mostaza americana y la mayonesa real en bowl acero inoxidable frío.\n2. Batir suavemente de forma envolvente hasta lograr una emulsión sedosa homogénea.\n3. Envasar en biberones gastronómicos etiquetados y refrigerar.',
      especificaciones: 'Emulsión estable libre de grumos, acidez balanceada y viscosidad uniforme.',
      caracteristicas: 'Color amarillo dorado brillante, aroma intenso a mostaza suave y textura cremosa.',
      informacionNutricional: 'Por 30g: Calorías ~95 kcal | Proteína: 0.5g | Carbohidratos: 3g | Grasas: 9g.',
      condicionesAlmacenamiento: 'Mantener en refrigeración entre 2°C y 4°C en recipiente hermético.',
      vidaUtil: '7 días refrigerado'
    }
  },
  {
    id: 56,
    idCategoriaInsumo: 4,
    nombre: 'Salsa Buffalo Picante Artesanal',
    descripcion: 'Salsa picante estilo buffalo preparada con base de tomate, jalapeños triturados y notas BBQ ahumadas',
    unidadMedida: 'kg',
    stock: 20,
    stockMinimo: 4,
    stockMaximo: 60,
    precioUnitario: 14500,
    costoTotal: 12550,
    rendimiento: 1.00,
    unidadRendimiento: 'kg',
    componentes: [
      { idInsumo: 26, cantidad: 0.60, unidadMedida: 'kg', precioUnitario: 11500 },
      { idInsumo: 25, cantidad: 0.25, unidadMedida: 'kg', precioUnitario: 16000 },
      { idInsumo: 44, cantidad: 0.15, unidadMedida: 'kg', precioUnitario: 11000 }
    ],
    ficha: {
      tiempoPreparacion: 12,
      rendimiento: '1.00 kg',
      procedimiento: '1. Procesar los jalapeños encurtidos junto con la salsa de tomate Heinz hasta obtener textura fina.\n2. Incorporar la salsa BBQ ahumada y reducir a fuego bajo 5 minutos removiendo constantemente.\n3. Dejar enfriar a temperatura ambiente antes de refrigerar en dosificadores.',
      especificaciones: 'Salsa homogeneizada con picor medio-alto constante y densidad fluida para glasear.',
      caracteristicas: 'Color rojo cobrizo intenso, aroma ahumado picante y sabor vibrante.',
      informacionNutricional: 'Por 30g: Calorías ~35 kcal | Proteína: 0.5g | Carbohidratos: 7g | Grasas: 0.5g.',
      condicionesAlmacenamiento: 'Mantener refrigerado entre 2°C y 5°C bien tapado.',
      vidaUtil: '10 días refrigerado'
    }
  }
];

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
        categoriaVariante: 'tamano_porcion',
        precio: 23500,
        descripcion: 'Hamburguesa doble carne de res molida 80/20 (300g) en receta clásica original.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 14,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'En Pan Integral Artesanal con Semillas',
        categoriaVariante: 'base_proteina',
        precio: 19000,
        descripcion: 'Reemplaza el pan brioche tradicional por pan integral artesanal con semillas.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        replacements: { 49: 12 },
        detalles: [
          { idInsumo: 49, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Proteína Carne Angus Certified (180g)',
        categoriaVariante: 'base_proteina',
        precio: 22500,
        descripcion: 'Sustituye la carne estándar por corte premium de Carne Angus Certified 180g.',
        rendimiento: '1 porción (180g)',
        tiempoPreparacion: 12,
        replacements: { 52: 14 },
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 52, cantidad: 0.18, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
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
        nombre: 'Doble Filete Pollo Crispy (360g)',
        categoriaVariante: 'tamano_porcion',
        precio: 27000,
        descripcion: 'Porción doble con 360g de pechuga crispy crujiente manteniendo la receta original.',
        rendimiento: '1 porción (360g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 15, cantidad: 0.36, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Proteína Pechuga Grillé a las Finas Hierbas',
        categoriaVariante: 'base_proteina',
        precio: 21500,
        descripcion: 'Cambia el filete crispy por filete de pechuga grillé a las finas hierbas a la plancha.',
        rendimiento: '1 porción',
        tiempoPreparacion: 11,
        replacements: { 54: 15 },
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 54, cantidad: 0.18, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 23, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Bañada en Salsa Miel Mostaza Artesanal',
        categoriaVariante: 'sabor_salsa',
        precio: 22000,
        descripcion: 'Hamburguesa Pollo Crispy glaseada con salsa miel mostaza artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 11,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 15, cantidad: 0.18, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 55, cantidad: 0.03, unidadMedida: 'kg' },
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
        nombre: 'Doble Carne BBQ Bacon 300g',
        categoriaVariante: 'tamano_porcion',
        precio: 27500,
        descripcion: 'Doble carne de res 300g a la parrilla glaseada con abundante salsa BBQ ahumada.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 24, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.05, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'En Pan de Papa Gourmet',
        categoriaVariante: 'base_proteina',
        precio: 22800,
        descripcion: 'Reemplaza el pan brioche por pan de papa gourmet extra suave y esponjoso.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        replacements: { 8: 12 },
        detalles: [
          { idInsumo: 8, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 19, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 24, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 44, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 28,
    variants: [
      {
        nombre: 'Doble Carne Mexicana (300g)',
        categoriaVariante: 'tamano_porcion',
        precio: 29000,
        descripcion: 'Doble carne de res 300g manteniendo guacamole fresco, jalapeños y mozzarella.',
        rendimiento: '1 porción (300g)',
        tiempoPreparacion: 15,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.30, unidadMedida: 'kg' },
          { idInsumo: 40, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'En Pan Integral Artesanal con Semillas',
        categoriaVariante: 'base_proteina',
        precio: 24500,
        descripcion: 'Versión en pan integral artesanal con semillas en lugar de pan brioche.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        replacements: { 49: 12 },
        detalles: [
          { idInsumo: 49, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 40, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Sabor Salsa Buffalo Picante Artesanal',
        categoriaVariante: 'sabor_salsa',
        precio: 24500,
        descripcion: 'Perfil de sabor picante intenso bañado con salsa buffalo picante artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 11,
        detalles: [
          { idInsumo: 12, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 14, cantidad: 0.15, unidadMedida: 'kg' },
          { idInsumo: 40, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 56, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 22, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 4,
    variants: [
      {
        nombre: 'Doble Salchicha Americana (Jumbo)',
        categoriaVariante: 'tamano_porcion',
        precio: 17500,
        descripcion: 'Doble salchicha americana premium manteniendo tocineta y queso mozzarella.',
        rendimiento: '1 porción Jumbo',
        tiempoPreparacion: 10,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'En Pan Perro Brioche Dorado',
        categoriaVariante: 'base_proteina',
        precio: 15200,
        descripcion: 'Reemplaza el pan de perro americano por pan perro brioche dorado en mantequilla.',
        rendimiento: '1 porción',
        tiempoPreparacion: 8,
        replacements: { 50: 13 },
        detalles: [
          { idInsumo: 50, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Sabor Salsa Miel Mostaza Artesanal',
        categoriaVariante: 'sabor_salsa',
        precio: 15000,
        descripcion: 'Perfil dulce-especiado bañado con salsa miel mostaza artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 8,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 55, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 5,
    variants: [
      {
        nombre: 'Doble Salchicha Suiza Jumbo',
        categoriaVariante: 'tamano_porcion',
        precio: 22000,
        descripcion: 'Edición jumbo con doble salchicha suiza artesanal ahumada.',
        rendimiento: '1 porción Jumbo',
        tiempoPreparacion: 12,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'En Pan Perro Brioche Dorado',
        categoriaVariante: 'base_proteina',
        precio: 18200,
        descripcion: 'Reemplaza el pan estándar por pan perro brioche dorado en mantequilla.',
        rendimiento: '1 porción',
        tiempoPreparacion: 9,
        replacements: { 50: 13 },
        detalles: [
          { idInsumo: 50, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 24, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 30,
    variants: [
      {
        nombre: 'Doble Salchicha Mexicana (Jumbo)',
        categoriaVariante: 'tamano_porcion',
        precio: 19500,
        descripcion: 'Doble salchicha americana premium con guacamole, cheddar, tocineta y jalapeño.',
        rendimiento: '1 porción Jumbo',
        tiempoPreparacion: 11,
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 40, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Proteína Chorizo Santarrosano Artesanal',
        categoriaVariante: 'base_proteina',
        precio: 18000,
        descripcion: 'Cambia la salchicha americana por chorizo santarrosano artesanal ahumado.',
        rendimiento: '1 porción',
        tiempoPreparacion: 10,
        replacements: { 53: 16 },
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 53, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 40, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Sabor Salsa Buffalo Picante Artesanal',
        categoriaVariante: 'sabor_salsa',
        precio: 17000,
        descripcion: 'Sustituye la salsa cheddar por salsa buffalo picante artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 9,
        replacements: { 56: 43 },
        detalles: [
          { idInsumo: 13, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 40, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 56, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 18, cantidad: 0.02, unidadMedida: 'kg' },
          { idInsumo: 25, cantidad: 0.02, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 6,
    variants: [
      {
        nombre: 'Familiar Salvaje (2 a 3 Personas)',
        categoriaVariante: 'tamano_porcion',
        precio: 38000,
        descripcion: 'Porción familiar generosa con doble cantidad en todos los insumos base.',
        rendimiento: '2 a 3 porciones',
        tiempoPreparacion: 16,
        detalles: [
          { idInsumo: 21, cantidad: 0.50, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.08, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.12, unidadMedida: 'kg' }
        ]
      },
      {
        nombre: 'Base en Papas Criollas Doradas',
        categoriaVariante: 'base_proteina',
        precio: 24500,
        descripcion: 'Reemplaza las papas a la francesa por papas criollas doradas seleccionadas.',
        rendimiento: '1 porción',
        tiempoPreparacion: 13,
        replacements: { 51: 21 },
        detalles: [
          { idInsumo: 51, cantidad: 0.25, unidadMedida: 'kg' },
          { idInsumo: 16, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 17, cantidad: 1, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.06, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 32,
    variants: [
      {
        nombre: 'Familiar para Compartir (2 Personas)',
        categoriaVariante: 'tamano_porcion',
        precio: 34000,
        descripcion: 'Versión familiar para 2 personas con doble porción de todos los insumos base.',
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
      },
      {
        nombre: 'Proteína Chorizo Santarrosano Artesanal',
        categoriaVariante: 'base_proteina',
        precio: 24500,
        descripcion: 'Reemplaza la salchicha americana por 2 unidades de chorizo santarrosano artesanal.',
        rendimiento: '1 porción',
        tiempoPreparacion: 13,
        replacements: { 53: 16 },
        detalles: [
          { idInsumo: 21, cantidad: 0.25, unidadMedida: 'kg' },
          { idInsumo: 53, cantidad: 2, unidadMedida: 'und' },
          { idInsumo: 18, cantidad: 0.04, unidadMedida: 'kg' },
          { idInsumo: 20, cantidad: 0.05, unidadMedida: 'kg' },
          { idInsumo: 41, cantidad: 0.03, unidadMedida: 'kg' },
          { idInsumo: 43, cantidad: 0.03, unidadMedida: 'kg' }
        ]
      }
    ]
  },
  {
    idProducto: 33,
    variants: [
      {
        nombre: 'Costeña con Papas en Casco Rústicas',
        categoriaVariante: 'base_proteina',
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
        categoriaVariante: 'tamano_porcion',
        precio: 36000,
        descripcion: 'Presentación familiar costeña para 2 personas con doble porción de todos los insumos base.',
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

async function ensureNewCatalogInsumosAndPreparados(transaction) {
  let changed = false;
  const resolvedInsumoIdMap = new Map();

  const [varZero, allExistingInsumos, allExistingPreps] = await Promise.all([
    Variante.findByPk(0, { attributes: ['idVariante'], transaction }),
    Insumo.findAll({ transaction }),
    InsumoPreparado.findAll({ transaction })
  ]);

  const insumoById = new Map(allExistingInsumos.map((i) => [Number(i.idInsumo), i]));
  const insumoByName = new Map(
    allExistingInsumos.map((i) => [String(i.nombre || '').trim().toLowerCase(), i])
  );
  const prepById = new Map(allExistingPreps.map((p) => [Number(p.id), p]));
  const prepByName = new Map(
    allExistingPreps.map((p) => [String(p.nombre || '').trim().toLowerCase(), p])
  );

  // 1. Insumos base / materia prima (#49-#53)
  for (const spec of NEW_BASE_INSUMOS) {
    const key = spec.nombre.trim().toLowerCase();
    const byId = insumoById.get(spec.idInsumo);
    let row = insumoByName.get(key) || (byId && String(byId.nombre || '').trim().toLowerCase() === key ? byId : null);

    if (!row) {
      const payload = {
        ...(byId ? {} : { idInsumo: spec.idInsumo }),
        idCategoriaInsumo: spec.idCategoriaInsumo,
        nombre: spec.nombre,
        unidadMedida: spec.unidadMedida,
        stock: spec.stock,
        stockMinimo: spec.stockMinimo,
        stockMaximo: spec.stockMaximo,
        estado: 1,
        esAdicion: spec.esAdicion || 0,
        precioAdicion: spec.precioAdicion || 0,
        porcionMinimaCantidad: 1,
        porcionMinimaUnidad: spec.unidadMedida,
        eliminado: 0,
        precioUnitario: spec.precioUnitario,
        costoPreparacion: 0,
        idProveedor: 1,
        descripcion: spec.descripcion
      };
      row = await Insumo.create(payload, { transaction });
      insumoById.set(Number(row.idInsumo), row);
      insumoByName.set(key, row);
      changed = true;
    } else {
      const updates = {};
      if (Number(row.eliminado || 0) !== 0) updates.eliminado = 0;
      if (Number(row.estado ?? 1) !== 1) updates.estado = 1;
      if (Number(row.stock || 0) <= 0) updates.stock = spec.stock;
      if (Math.abs(Number(row.precioUnitario || 0) - spec.precioUnitario) > 0.01) updates.precioUnitario = spec.precioUnitario;
      if (!row.idCategoriaInsumo) updates.idCategoriaInsumo = spec.idCategoriaInsumo;
      if (Object.keys(updates).length > 0) {
        await row.update(updates, { transaction });
        changed = true;
      }
    }
    resolvedInsumoIdMap.set(spec.idInsumo, Number(row.idInsumo));
  }

  // 2. Insumos preparados (#54-#56): insumo espejo + insumopreparado + componentes + fichatecnica
  const idVarianteForInsumo = varZero ? 0 : null;
  for (const spec of NEW_PREPARED_INSUMOS) {
    const key = spec.nombre.trim().toLowerCase();
    const byId = insumoById.get(spec.id);
    let insRow = insumoByName.get(key) || (byId && String(byId.nombre || '').trim().toLowerCase() === key ? byId : null);

    if (!insRow) {
      const slotTaken = Boolean(byId || prepById.get(spec.id));
      insRow = await Insumo.create(
        {
          ...(slotTaken ? {} : { idInsumo: spec.id }),
          idCategoriaInsumo: spec.idCategoriaInsumo,
          nombre: spec.nombre,
          unidadMedida: spec.unidadMedida,
          stock: spec.stock,
          stockMinimo: spec.stockMinimo,
          stockMaximo: spec.stockMaximo,
          estado: 1,
          esAdicion: 0,
          precioAdicion: 0,
          porcionMinimaCantidad: 1,
          porcionMinimaUnidad: spec.unidadMedida,
          eliminado: 0,
          precioUnitario: spec.precioUnitario,
          costoPreparacion: spec.costoTotal,
          idProveedor: null,
          descripcion: spec.descripcion
        },
        { transaction }
      );
      insumoById.set(Number(insRow.idInsumo), insRow);
      insumoByName.set(key, insRow);
      changed = true;
    } else {
      const updates = {};
      if (Number(insRow.eliminado || 0) !== 0) updates.eliminado = 0;
      if (Number(insRow.estado ?? 1) !== 1) updates.estado = 1;
      if (Number(insRow.stock || 0) <= 0) updates.stock = spec.stock;
      if (Math.abs(Number(insRow.precioUnitario || 0) - spec.precioUnitario) > 0.01) updates.precioUnitario = spec.precioUnitario;
      if (Math.abs(Number(insRow.costoPreparacion || 0) - spec.costoTotal) > 0.01) updates.costoPreparacion = spec.costoTotal;
      if (!insRow.idCategoriaInsumo) updates.idCategoriaInsumo = spec.idCategoriaInsumo;
      if (Object.keys(updates).length > 0) {
        await insRow.update(updates, { transaction });
        changed = true;
      }
    }

    const prepId = Number(insRow.idInsumo);
    resolvedInsumoIdMap.set(spec.id, prepId);

    const existingPrepById = prepById.get(prepId);
    let prepRow = prepByName.get(key) || (existingPrepById && String(existingPrepById.nombre || '').trim().toLowerCase() === key ? existingPrepById : null);

    if (!prepRow) {
      prepRow = await InsumoPreparado.create(
        {
          ...(existingPrepById ? {} : { id: prepId }),
          nombre: spec.nombre,
          descripcion: spec.descripcion,
          precioVenta: 0,
          porcionMinimaCantidad: 1,
          porcionMinimaUnidad: spec.unidadMedida,
          porcionMinimaPrecio: 0,
          unidadMedida: spec.unidadMedida,
          fechaCreacion: new Date(),
          estado: 1,
          eliminado: 0,
          rendimiento: spec.rendimiento,
          unidadRendimiento: spec.unidadRendimiento,
          costoTotal: spec.costoTotal
        },
        { transaction }
      );
      prepById.set(Number(prepRow.id), prepRow);
      prepByName.set(key, prepRow);
      changed = true;
    } else {
      const pUpdates = {};
      if (Number(prepRow.eliminado || 0) !== 0) pUpdates.eliminado = 0;
      if (Number(prepRow.estado ?? 1) !== 1) pUpdates.estado = 1;
      if (Math.abs(Number(prepRow.costoTotal || 0) - spec.costoTotal) > 0.01) pUpdates.costoTotal = spec.costoTotal;
      if (Object.keys(pUpdates).length > 0) {
        await prepRow.update(pUpdates, { transaction });
        changed = true;
      }
    }

    const mappedComps = spec.componentes.map((c) => ({
      idInsumo: resolvedInsumoIdMap.get(Number(c.idInsumo)) || Number(c.idInsumo),
      cantidad: Number(c.cantidad),
      unidadMedida: c.unidadMedida || 'kg',
      precioUnitario: Number(c.precioUnitario || 0)
    }));

    const existingComps = await DetalleInsumoPreparadoInsumo.findAll({
      where: { idPreparado: prepRow.id },
      transaction
    });
    const compSig = (arr) =>
      arr
        .map((x) => `${Number(x.idInsumo)}:${Number(x.cantidad || 0).toFixed(2)}:${String(x.unidadMedida || '').toLowerCase()}`)
        .sort()
        .join('|');
    if (compSig(existingComps) !== compSig(mappedComps)) {
      await DetalleInsumoPreparadoInsumo.destroy({ where: { idPreparado: prepRow.id }, transaction });
      await DetalleInsumoPreparadoInsumo.bulkCreate(
        mappedComps.map((c) => ({
          idPreparado: prepRow.id,
          idInsumo: c.idInsumo,
          cantidad: c.cantidad,
          unidadMedida: c.unidadMedida,
          precioUnitario: c.precioUnitario
        })),
        { transaction }
      );
      changed = true;
    }

    let prepFicha = await FichaTecnica.findOne({
      where: { idInsumo: prepRow.id, tipo: 'INSUMO_PREPARADO' },
      transaction
    });
    if (!prepFicha) {
      prepFicha = await FichaTecnica.create(
        {
          idVariante: idVarianteForInsumo,
          descripcion: spec.descripcion,
          fechaCreacion: new Date(),
          idProducto: null,
          idInsumo: insRow.idInsumo,
          tipo: 'INSUMO_PREPARADO',
          procedimiento: spec.ficha.procedimiento,
          tiempoPreparacion: spec.ficha.tiempoPreparacion,
          rendimiento: spec.ficha.rendimiento,
          especificaciones: spec.ficha.especificaciones,
          caracteristicas: spec.ficha.caracteristicas,
          informacionNutricional: spec.ficha.informacionNutricional,
          condicionesAlmacenamiento: spec.ficha.condicionesAlmacenamiento,
          vidaUtil: spec.ficha.vidaUtil,
          observaciones: '',
          versionActual: 1,
          estado: 1
        },
        { transaction }
      );
      changed = true;
    } else {
      const fUpdates = {};
      if (Number(prepFicha.estado ?? 1) !== 1) fUpdates.estado = 1;
      if (!String(prepFicha.especificaciones || '').trim()) fUpdates.especificaciones = spec.ficha.especificaciones;
      if (!String(prepFicha.caracteristicas || '').trim()) fUpdates.caracteristicas = spec.ficha.caracteristicas;
      if (!String(prepFicha.informacionNutricional || '').trim()) fUpdates.informacionNutricional = spec.ficha.informacionNutricional;
      if (!String(prepFicha.condicionesAlmacenamiento || '').trim()) fUpdates.condicionesAlmacenamiento = spec.ficha.condicionesAlmacenamiento;
      if (!String(prepFicha.vidaUtil || '').trim()) fUpdates.vidaUtil = spec.ficha.vidaUtil;
      if (Object.keys(fUpdates).length > 0) {
        await prepFicha.update(fUpdates, { transaction });
        changed = true;
      }
    }

    const existingFichaComps = await DetalleFichaInsumo.findAll({
      where: { idFichaTecnica: prepFicha.idFichaTecnica },
      transaction
    });
    if (compSig(existingFichaComps) !== compSig(mappedComps)) {
      await DetalleFichaInsumo.destroy({ where: { idFichaTecnica: prepFicha.idFichaTecnica }, transaction });
      await DetalleFichaInsumo.bulkCreate(
        mappedComps.map((c) => ({
          idFichaTecnica: prepFicha.idFichaTecnica,
          idInsumo: c.idInsumo,
          cantidad: c.cantidad,
          unidadMedida: c.unidadMedida
        })),
        { transaction }
      );
      changed = true;
    }
  }

  return { changed, resolvedInsumoIdMap };
}

function normalizeDeltasSignature(list = []) {
  return (list || [])
    .map((d) =>
      `${Number(d.idInsumo)}:${String(d.tipoAccion || '')}:${d.idInsumoReemplazado ? Number(d.idInsumoReemplazado) : ''}:${Number(d.cantidad || 0).toFixed(3)}:${String(d.unidadMedida || 'und').toLowerCase()}`
    )
    .sort()
    .join('|');
}

function normalizeDetallesSignature(list = []) {
  return (list || [])
    .map((d) => `${Number(d.idInsumo)}:${Number(d.cantidad || 0).toFixed(2)}:${String(d.unidadMedida || 'und').toLowerCase()}`)
    .sort()
    .join('|');
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
  forceSyncRecipe = false,
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
  const resolvedCaract = defaultQuality.caracteristicas;
  const resolvedNutri = (baseFicha?.informacionNutricional || '').trim() || defaultQuality.informacionNutricional;
  const resolvedAlm = (baseFicha?.condicionesAlmacenamiento || '').trim() || defaultQuality.condicionesAlmacenamiento;
  const resolvedVida = (baseFicha?.vidaUtil || '').trim() || defaultQuality.vidaUtil;

  const existingDeltas = await VarianteInsumo.findAll({
    where: { idVariante: variant.idVariante },
    transaction
  });
  const shouldSyncDeltas =
    (existingDeltas.length === 0 && Array.isArray(deltas) && deltas.length > 0) ||
    (forceSyncRecipe && normalizeDeltasSignature(existingDeltas) !== normalizeDeltasSignature(deltas));

  if (shouldSyncDeltas) {
    if (existingDeltas.length > 0) {
      await VarianteInsumo.destroy({ where: { idVariante: variant.idVariante }, transaction });
    }
    if (Array.isArray(deltas) && deltas.length > 0) {
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
    }
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
    if (!String(varFicha.caracteristicas || '').trim() || /^Variante:\s*/i.test(String(varFicha.caracteristicas).trim()) || forceSyncRecipe) {
      if (varFicha.caracteristicas !== resolvedCaract) qualityUpdates.caracteristicas = resolvedCaract;
    }
    if (!String(varFicha.informacionNutricional || '').trim()) qualityUpdates.informacionNutricional = resolvedNutri;
    if (!String(varFicha.condicionesAlmacenamiento || '').trim()) qualityUpdates.condicionesAlmacenamiento = resolvedAlm;
    if (!String(varFicha.vidaUtil || '').trim()) qualityUpdates.vidaUtil = resolvedVida;
    if (forceSyncRecipe && descripcion && varFicha.descripcion !== descripcion) {
      qualityUpdates.descripcion = descripcion;
    }
    if (forceSyncRecipe && rendimiento && varFicha.rendimiento !== rendimiento) {
      qualityUpdates.rendimiento = rendimiento;
    }
    if (Object.keys(qualityUpdates).length > 0) {
      await varFicha.update(qualityUpdates, { transaction });
      mutated = true;
    }
  }

  const existingDetalles = Array.isArray(varFicha.detalles)
    ? varFicha.detalles
    : await DetalleFichaInsumo.findAll({ where: { idFichaTecnica: varFicha.idFichaTecnica }, transaction });

  const shouldSyncDetalles =
    (existingDetalles.length === 0 && Array.isArray(detalles) && detalles.length > 0) ||
    (forceSyncRecipe && normalizeDetallesSignature(existingDetalles) !== normalizeDetallesSignature(detalles));

  if (shouldSyncDetalles) {
    if (existingDetalles.length > 0) {
      await DetalleFichaInsumo.destroy({ where: { idFichaTecnica: varFicha.idFichaTecnica }, transaction });
    }
    if (Array.isArray(detalles) && detalles.length > 0) {
      await DetalleFichaInsumo.bulkCreate(
        detalles.map((d) => ({
          idFichaTecnica: varFicha.idFichaTecnica,
          idInsumo: Number(d.idInsumo),
          cantidad: Number(d.cantidad),
          unidadMedida: d.unidadMedida || 'und'
        })),
        { transaction }
      );
    }
    mutated = true;
  }

  return mutated;
}

let activeSyncPromise = null;

/**
 * Asegura de forma idempotente:
 * 1) Nuevos insumos base (#49-#53) e insumos preparados (#54-#56) con sub-receta y ficha técnica.
 * 2) Precios e insumos/fichas reales de todas las presentaciones y sabores de gaseosas/bebidas.
 * 3) Variantes gastronómicas diferenciadas por categoría (Tamaño/Porción, Base/Proteína, Sabor/Salsa).
 */
async function ensureCatalogVariantsAndDrinkFichas() {
  if (activeSyncPromise) return activeSyncPromise;

  activeSyncPromise = (async () => {
    const t = await sequelize.transaction();
    let changed = false;

    try {
      const { changed: insChanged, resolvedInsumoIdMap } = await ensureNewCatalogInsumosAndPreparados(t);
      if (insChanged) changed = true;

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

      const mapInsumoId = (id) => resolvedInsumoIdMap.get(Number(id)) || Number(id);

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
          const validDetalles = vSpec.detalles
            .map((d) => ({ ...d, idInsumo: mapInsumoId(d.idInsumo) }))
            .filter((d) => validInsumoIds.has(Number(d.idInsumo)));
          if (validDetalles.length === 0) continue;

          const mappedReplacements = {};
          for (const [k, v] of Object.entries(vSpec.replacements || {})) {
            mappedReplacements[mapInsumoId(k)] = mapInsumoId(v);
          }

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
            if (Math.abs(Number(varRow.precio || 0) - Number(vSpec.precio)) > 0.01) updates.precio = vSpec.precio;
            if (vSpec.descripcion && varRow.descripcion !== vSpec.descripcion) updates.descripcion = vSpec.descripcion;
            if (Number(varRow.estado ?? 1) !== 1) updates.estado = 1;
            if (Object.keys(updates).length > 0) {
              await varRow.update(updates, { transaction: t });
              changed = true;
            }
          }

          const deltas = computeDeltasFromBase(validDetalles, baseDetalles, mappedReplacements);
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
            forceSyncRecipe: true,
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
          'porcion personal grande',
          'bbq ahumada especial',
          'picante jalapeño & cheddar',
          'pollo crispy bacon & bbq',
          'doble pollo crispy (360g)',
          'bbq bacon cheddar & jalapeño',
          'extra picante con doble jalapeño',
          'doble salchicha & extra queso',
          'con chili & cheddar fundido',
          'bbq tocino & cebolla',
          'suizo gratinado con tártara & cheddar',
          'mexicano extra picante & doble salchicha',
          'salvaje con carne & cheddar (mediana)',
          'criolla especial con chili con carne'
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
        console.log('[CatalogVariantsSync] ✅ Insumos (#49-#56) y variantes por categoría sincronizadas correctamente.');
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
  NEW_BASE_INSUMOS,
  NEW_PREPARED_INSUMOS,
  DRINK_PRODUCT_VARIANTS,
  FOOD_PRODUCT_VARIANTS,
  computeDeltasFromBase,
  resolveDrinkInsumoFallback,
  ensureNewCatalogInsumosAndPreparados,
  ensureCatalogVariantsAndDrinkFichas
};
