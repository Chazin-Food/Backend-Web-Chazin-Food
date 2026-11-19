const { Op } = require('sequelize');
const { Product, CategoriaProducto, Evento, Variante, VarianteInsumo, ComboProducto, FichaTecnica, DetalleFichaInsumo, Insumo, DetalleVentaProducto, Resena } = require('../../persistence/models');
const FichaTecnicaService = require('./fichaTecnicaService');
const EventoService = require('./eventoService');
const { ensureVarianteEventoSchemaOnce } = require('../../infrastructure/utils/dbUtils');

const BROKEN_IMAGE_REPLACEMENTS = {
  'photo-1619740455993-9e612b1af08a': 'https://res.cloudinary.com/dckwtknmq/image/upload/v1788993441/c9pne5jrmjv5po93xhhl.jpg'
};

function sanitizeProductImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  for (const [brokenFragment, safeUrl] of Object.entries(BROKEN_IMAGE_REPLACEMENTS)) {
    if (url.includes(brokenFragment)) return safeUrl;
  }
  return url;
}

function resolveVarianteEstadoValue(v, fallback = 1) {
  if (!v || (v.estado === undefined && v.activo === undefined)) return fallback;
  if (v.activo === false) return 0;
  if (v.estado === 0 || v.estado === '0' || String(v.estado || '').toLowerCase() === 'inactivo' || v.estado === false) {
    return 0;
  }
  return 1;
}

/**
 * Normaliza unidades de medida entre receta e inventario para calcular porciones disponibles.
 */
function convertToInsumoUnit(recetaCantidad, recetaUnidad, insumoUnidad) {
  const rCant = Number(recetaCantidad) || 0;
  const rUni = String(recetaUnidad || '').toLowerCase().trim();
  const iUni = String(insumoUnidad || '').toLowerCase().trim();

  if (rUni === iUni || !rUni || !iUni) return rCant;

  // Masa: receta en gramos, insumo en kilogramos o libras
  if ((rUni === 'g' || rUni === 'gr' || rUni.includes('gram')) && (iUni === 'kg' || iUni.includes('kilo'))) {
    return rCant / 1000;
  }
  if ((rUni === 'kg' || rUni.includes('kilo')) && (iUni === 'g' || iUni === 'gr' || iUni.includes('gram'))) {
    return rCant * 1000;
  }
  if ((rUni === 'g' || rUni === 'gr') && (iUni === 'lb' || iUni.includes('libra'))) {
    return rCant / 500;
  }

  // Volumen: receta en mililitros, insumo en litros
  if ((rUni === 'ml' || rUni.includes('mili')) && (iUni === 'l' || iUni === 'lt' || iUni.includes('litro'))) {
    return rCant / 1000;
  }
  if ((rUni === 'l' || rUni === 'lt') && (iUni === 'ml' || iUni.includes('mili'))) {
    return rCant * 1000;
  }

  return rCant;
}

function isDummyOrBaseVariant(vName, pName) {
  if (!vName) return true;
  const vn = String(vName).trim().toLowerCase();
  const pn = String(pName || '').trim().toLowerCase();
  if (vn === pn) return true;
  if (vn === `${pn} - base` || vn === `${pn} - completo` || vn === `${pn} base` || vn === `${pn} completo`) return true;
  if (['base', 'estándar', 'estandar', 'completo', 'combo', 'única', 'unica'].includes(vn)) return true;
  if (vn.startsWith('porción individual') || vn.startsWith('porcion individual')) return true;
  if (vn === 'edición especial' || vn === 'edicion especial') return true;
  if (vn === 'edición especial burger fest' || vn === 'edicion especial burger fest') return true;
  if (vn === 'porción costeña grande' || vn === 'porcion costeña grande') return true;
  if (vn === 'salchipapa personal grande') return true;
  if (vn === 'porción personal grande' || vn === 'porcion personal grande') return true;
  if (['perro especial', 'perro suizo gourmet', 'perro mexicano clásico', 'perro mexicano clasico', 'perro criollo gourmet'].includes(vn)) return true;
  if (vn === 'clásica 150g' || vn === 'clasica 150g') return true;
  if ((vn === 'individual bbq bacon 150g' || vn === 'individual bbq bacon') && (!pn || pn.includes('bbq'))) return true;
  if ((vn === 'mexicana clásica' || vn === 'mexicana clasica') && (!pn || pn.includes('mexicana'))) return true;
  if (vn === 'doble carne 300g' && pn.includes('doble carne')) return true;
  if (vn === 'pollo crispy 180g' && pn.includes('pollo crispy')) return true;
  if (vn === 'individual campesina' && pn.includes('campesina')) return true;
  if (vn === 'botella 500ml' && pn.includes('cristal')) return true;
  return false;
}

function resolveDrinkInsumoId(variantName = '', prodName = '', prodId = 0) {
  const vn = String(variantName || '').toLowerCase();
  const pn = String(prodName || '').toLowerCase();
  const combined = `${vn} ${pn}`;
  const pid = Number(prodId || 0);

  if (vn.includes('coca') || pid === 8 || pid === 16 || pn.includes('coca')) {
    if (/con az[uú]car|\boriginal\b|\bcl[aá]sic/.test(vn)) return 29;
    if (/sin az[uú]car|\blight\b|\bzero\b/.test(vn)) return 32;
    if (pid === 16 || /sin az[uú]car|\blight\b|\bzero\b/.test(pn)) return 32;
    return 29;
  }

  if (vn.includes('pepsi') || pid === 11 || pn.includes('pepsi')) {
    if (/sin az[uú]car|\blight\b|\bzero\b|\bblack\b/.test(vn)) return 34;
    if (/regular|\boriginal\b/.test(vn)) return 33;
    return /sin az[uú]car|\blight\b|\bzero\b|\bblack\b/.test(pn) ? 34 : 33;
  }

  if (vn.includes('uva')) return 47;
  if (vn.includes('naranja')) return 48;
  if (vn.includes('manzana')) return 30;
  if (vn.includes('colombiana')) return 35;
  if (vn.includes('sprite')) return 36;
  if (vn.includes('quatro') || vn.includes('cuatro') || vn.includes('toronja')) return 37;
  if (vn.includes('agua')) return 31;

  if (pid === 38 || pn.includes('uva')) return 47;
  if (pid === 39 || pn.includes('naranja')) return 48;
  if (pid === 9 || pn.includes('manzana')) return 30;
  if (pid === 12 || pn.includes('colombiana')) return 35;
  if (pid === 13 || pn.includes('sprite')) return 36;
  if (pid === 14 || pn.includes('quatro') || pn.includes('cuatro') || pn.includes('toronja')) return 37;
  if (pid === 10 || pn.includes('agua') || combined.includes('cristal')) return 31;

  return null;
}

const buildDefaultFichaQualityFields = (prodName = '', isDrink = false) => {
  const lower = String(prodName || '').toLowerCase();
  if (isDrink || /gaseosa|coca|pepsi|sprite|quatro|cuatro|postob|agua\b|jugo|bebida/i.test(lower)) {
    return {
      especificaciones: 'Servir fría entre 2°C y 4°C, envase sellado y limpio, verificación de lote vigente.',
      caracteristicas: 'Sabor refrescante característico, gasificación óptima y temperatura fría al servicio.',
      informacionNutricional: /agua|sin az|light|zero/i.test(lower)
        ? 'Porción 400ml: 0 kcal | 0g carbohidratos | 0g grasas | 10 mg sodio.'
        : 'Porción 400ml: ~165 kcal | 40g carbohidratos (azúcares) | 0g grasa | 35 mg sodio.',
      condicionesAlmacenamiento: 'Mantener en vitrina refrigerada entre 2°C y 6°C, protegida de luz solar directa.',
      vidaUtil: 'Según fecha impresa en envase; consumo inmediato tras abrir.'
    };
  }
  return {
    especificaciones: 'Cocción completa (>70°C en el centro), armado limpio en empaque térmico y control de gramaje estándar.',
    caracteristicas: 'Aroma fresco recién preparado, color dorado uniforme, textura equilibrada y excelente presentación.',
    informacionNutricional: 'Porción estándar: ~650 kcal | Proteínas: 32g | Carbohidratos: 48g | Grasas: 34g.',
    condicionesAlmacenamiento: 'Consumo inmediato en mesa o despacho en empaque térmico antigrasa antes de 25 minutos.',
    vidaUtil: 'Consumo inmediato'
  };
};

const formatFichaForProductResponse = (rawFicha, prod, variant, mappedDetalles, fallbackBaseFicha = null, isDrink = false) => {
  const plainRaw = rawFicha ? (typeof rawFicha.get === 'function' ? rawFicha.get({ plain: true }) : rawFicha) : null;
  const formatted = plainRaw
    ? FichaTecnicaService.formatFicha({ ...plainRaw, producto: prod, variante: variant || null })
    : null;
  const defaults = buildDefaultFichaQualityFields(prod?.nombre, isDrink);
  const plainBase = fallbackBaseFicha
    ? (typeof fallbackBaseFicha.get === 'function' ? fallbackBaseFicha.get({ plain: true }) : fallbackBaseFicha)
    : null;
  const baseFmt = plainBase ? FichaTecnicaService.formatFicha({ ...plainBase, producto: prod }) : null;

  return {
    idFichaTecnica: formatted?.idFichaTecnica || null,
    idProducto: formatted?.idProducto || prod?.idProducto,
    idVariante: variant ? variant.idVariante : (formatted?.idVariante ?? 0),
    tipo: formatted?.tipo || (variant ? 'VARIANTE' : 'PRODUCTO'),
    descripcion: formatted?.descripcion || variant?.descripcion || (variant ? `${prod?.nombre} — ${variant.nombre}` : (prod?.descripcion || '')),
    procedimiento: formatted?.procedimiento || baseFmt?.procedimiento || '',
    tiempoPreparacion: formatted?.tiempoPreparacion ?? baseFmt?.tiempoPreparacion ?? 0,
    rendimiento: formatted?.rendimiento || baseFmt?.rendimiento || '1 porción',
    especificaciones: (formatted?.especificaciones || '').trim() || (baseFmt?.especificaciones || '').trim() || defaults.especificaciones,
    caracteristicas: (formatted?.caracteristicas || '').trim() || (baseFmt?.caracteristicas || '').trim() || defaults.caracteristicas,
    informacionNutricional: (formatted?.informacionNutricional || '').trim() || (baseFmt?.informacionNutricional || '').trim() || defaults.informacionNutricional,
    condicionesAlmacenamiento: (formatted?.condicionesAlmacenamiento || '').trim() || (baseFmt?.condicionesAlmacenamiento || '').trim() || defaults.condicionesAlmacenamiento,
    vidaUtil: (formatted?.vidaUtil || '').trim() || (baseFmt?.vidaUtil || '').trim() || defaults.vidaUtil,
    observaciones: formatted?.observaciones || '',
    versionActual: formatted?.versionActual || 1,
    fechaInicioVigencia: formatted?.fechaInicioVigencia || plainRaw?.fechaCreacion || null,
    versionesAnteriores: Array.isArray(formatted?.versionesAnteriores) ? formatted.versionesAnteriores : [],
    detalles: mappedDetalles
  };
};

function buildEffectiveDetallesFromDeltas(baseDetalles = [], deltas = [], insumoByIdMap = new Map()) {
  let effective = (baseDetalles || []).map(d => ({
    idDetalleFicha: d.idDetalleFicha || null,
    idInsumo: Number(d.idInsumo),
    cantidad: Number(d.cantidad || 0),
    unidadMedida: d.unidadMedida || d.insumo?.unidadMedida || 'und',
    precioUnitario: Number(d.insumo?.precioUnitario || insumoByIdMap.get(Number(d.idInsumo))?.precioUnitario || 0),
    insumo: d.insumo ? {
      idInsumo: d.insumo.idInsumo,
      nombre: d.insumo.nombre,
      unidadMedida: d.insumo.unidadMedida,
      stock: d.insumo.stock,
      precioUnitario: Number(d.insumo.precioUnitario || 0)
    } : null
  }));

  for (const im of (deltas || [])) {
    const accion = String(im.tipoAccion || 'AGREGAR').toUpperCase();
    const idIns = Number(im.idInsumo);
    const insCat = im.insumo || insumoByIdMap.get(idIns) || null;
    const precioUnit = Number(insCat?.precioUnitario || 0);
    const entryInsumo = insCat ? {
      idInsumo: insCat.idInsumo,
      nombre: insCat.nombre,
      unidadMedida: insCat.unidadMedida,
      stock: insCat.stock,
      precioUnitario: precioUnit
    } : null;

    if (accion === 'QUITAR') {
      effective = effective.filter(d => Number(d.idInsumo) !== idIns);
    } else if (accion === 'REEMPLAZAR') {
      if (im.idInsumoReemplazado) {
        effective = effective.filter(d => Number(d.idInsumo) !== Number(im.idInsumoReemplazado));
      }
      effective.push({
        idDetalleFicha: null,
        idInsumo: idIns,
        cantidad: Number(im.cantidad || 1),
        unidadMedida: im.unidadMedida || insCat?.unidadMedida || 'und',
        precioUnitario: precioUnit,
        insumo: entryInsumo
      });
    } else if (accion === 'MODIFICAR_CANTIDAD') {
      const idx = effective.findIndex(d => Number(d.idInsumo) === idIns);
      if (idx >= 0) {
        effective[idx].cantidad = Number(im.cantidad || 0);
        if (im.unidadMedida) effective[idx].unidadMedida = im.unidadMedida;
      } else {
        effective.push({
          idDetalleFicha: null,
          idInsumo: idIns,
          cantidad: Number(im.cantidad || 1),
          unidadMedida: im.unidadMedida || insCat?.unidadMedida || 'und',
          precioUnitario: precioUnit,
          insumo: entryInsumo
        });
      }
    } else if (accion === 'AGREGAR') {
      const idx = effective.findIndex(d => Number(d.idInsumo) === idIns);
      if (idx >= 0) {
        effective[idx].cantidad = Number(im.cantidad || effective[idx].cantidad);
      } else {
        effective.push({
          idDetalleFicha: null,
          idInsumo: idIns,
          cantidad: Number(im.cantidad || 1),
          unidadMedida: im.unidadMedida || insCat?.unidadMedida || 'und',
          precioUnitario: precioUnit,
          insumo: entryInsumo
        });
      }
    }
  }
  return effective;
}

class ProductService {
  /**
   * Sincroniza la tabla relacional detallecombo a partir de itemsCombo
   */
  static async syncItemsCombo(idCombo, itemsCombo = []) {
    if (!idCombo) return;
    try {
      await ComboProducto.destroy({ where: { idCombo } });
      if (Array.isArray(itemsCombo) && itemsCombo.length > 0) {
        const rows = itemsCombo
          .filter(it => it && (it.idProducto || it.id))
          .map(it => ({
            idCombo,
            idProducto: Number(it.idProducto || it.id),
            cantidad: Math.max(1, Number(it.cantidad || 1)),
            esOpcional: it.esOpcional ? 1 : 0,
            grupoSeleccion: it.grupoSeleccion || null
          }));
        if (rows.length > 0) {
          await ComboProducto.bulkCreate(rows);
        }
      }
    } catch (err) {
      console.warn(`Error sincronizando itemsCombo para producto #${idCombo}:`, err.message);
    }
  }

  static async _queryFormattedProducts({ eliminado = 0, order = [['idProducto', 'ASC']], onlyActiveVariants = false } = {}) {
    await ensureVarianteEventoSchemaOnce();
    const [products, fichas, allInsumos, ventasPorVariante] = await Promise.all([
      Product.findAll({
        where: {
          eliminado,
          idProducto: { [Op.ne]: 0 }
        },
        order,
        attributes: [
          'idProducto',
          'idCategoriaProducto',
          'nombre',
          'descripcion',
          'imagen',
          'estado',
          'eliminado',
          'fechaEliminacion',
          'precio',
          'categoria',
          'adiciones',
          'configuracionCombo'
        ],
      include: [
        { model: CategoriaProducto, as: 'categoriaProducto', attributes: ['idCategoriaProducto', 'nombre'] },
        {
          model: Variante,
          as: 'variantes',
          separate: true,
          attributes: ['idVariante', 'idProducto', 'nombre', 'descripcion', 'precio', 'imagen', 'estado', 'idEvento', 'creadaPorEvento'],
          include: [
            {
              model: Evento,
              as: 'evento',
              attributes: ['idEvento', 'nombreEvento', 'tipoEvento', 'estado'],
              required: false
            },
            {
              model: VarianteInsumo,
              as: 'insumosModificados',
              separate: true,
              include: [
                { model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida', 'stock'] },
                { model: Insumo, as: 'insumoReemplazado', attributes: ['idInsumo', 'nombre', 'unidadMedida'] }
              ]
            }
          ]
        },
        { 
          model: Evento, 
          as: 'eventos', 
          separate: true,
          where: { 
            estado: 1,
            [Op.or]: [
              { fechaFin: null },
              { fechaFin: { [Op.gte]: new Date().toISOString().split('T')[0] } }
            ]
          } 
        },
        {
          model: ComboProducto,
          as: 'itemsCombo',
          separate: true,
          include: [
            {
              model: Product,
              as: 'productoComponente',
              attributes: ['idProducto', 'nombre', 'precio', 'imagen', 'estado', 'eliminado']
            }
          ]
        }
      ]
      }),

      // Cargar recetas para cálculo dinámico de stock (base por producto y fichas dedicadas por variante)
      FichaTecnica.findAll({
      where: { estado: 1 },
      include: [
        {
          model: DetalleFichaInsumo,
          as: 'detalles',
          include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'stock', 'unidadMedida', 'estado', 'precioUnitario'] }]
        }
      ],
      order: [['idFichaTecnica', 'ASC']]
      }).catch(() => []),

      // Cargar todos los insumos para bebidas o productos directos sin ficha técnica
      Insumo.findAll({
        attributes: ['idInsumo', 'nombre', 'stock', 'unidadMedida', 'precioUnitario', 'estado']
      }).catch(() => []),

      // Cargar historial de ventas por variante para contar ventas reales
      DetalleVentaProducto.findAll({
        attributes: ['idVariante', [DetalleVentaProducto.sequelize.fn('COUNT', DetalleVentaProducto.sequelize.col('idDetalleVenta')), 'totalVentas']],
        group: ['idVariante'],
        raw: true
      }).catch(() => [])
    ]);
    const fichaMap = new Map();
    const varFichaMap = new Map();
    fichas.forEach(f => {
      if (f.tipo === 'VARIANTE' && f.idVariante) {
        varFichaMap.set(Number(f.idVariante), f);
      } else if (f.idProducto && !fichaMap.has(f.idProducto)) {
        fichaMap.set(f.idProducto, f);
      }
    });
    const insumoByIdMap = new Map();
    allInsumos.forEach(ins => {
      insumoByIdMap.set(Number(ins.idInsumo), ins);
    });

    const resolveDirectInsumoStock = (prod) => {
      const rawName = String(prod?.nombre || '').toLowerCase();
      const pId = Number(prod?.idProducto || prod?.id || 0);
      let directInsumoId = null;
      if (rawName.includes('coca')) {
        directInsumoId = (rawName.includes('light') || rawName.includes('sin az') || rawName.includes('zero') || pId === 16) ? 32 : 29;
      } else if (rawName.includes('pepsi')) {
        directInsumoId = (rawName.includes('light') || rawName.includes('black') || rawName.includes('zero')) ? 34 : 33;
      } else if (((rawName.includes('postob') || rawName.includes('gaseosa')) && rawName.includes('uva')) || pId === 38) {
        directInsumoId = 47;
      } else if (((rawName.includes('postob') || rawName.includes('gaseosa')) && rawName.includes('naranja')) || pId === 39) {
        directInsumoId = 48;
      } else if (((rawName.includes('postob') || rawName.includes('gaseosa') || rawName.includes('kola')) && rawName.includes('colombiana')) || pId === 12) {
        directInsumoId = 35;
      } else if (((rawName.includes('postob') || rawName.includes('gaseosa')) && rawName.includes('manzana')) || pId === 9) {
        directInsumoId = 30;
      } else if (rawName.includes('sprite') || pId === 13) {
        directInsumoId = 36;
      } else if (((rawName.includes('cuatro') || rawName.includes('quatro')) && (rawName.includes('gaseosa') || rawName.includes('toronja'))) || pId === 14) {
        directInsumoId = 37;
      } else if ((rawName.includes('agua') && (rawName.includes('cristal') || rawName.includes('mineral') || rawName.includes('botella'))) || pId === 10) {
        directInsumoId = 31;
      }

      if (directInsumoId && insumoByIdMap.has(directInsumoId)) {
        const ins = insumoByIdMap.get(directInsumoId);
        const directStock = Math.max(0, Math.floor(Number(ins.stock || 0)));
        if (ins.estado === 0 && directStock <= 0) return 0;
        return directStock;
      }

      const matchedByName = allInsumos.find(ins => {
        const iName = String(ins.nombre || '').toLowerCase().trim();
        return iName && rawName && (iName === rawName || (rawName.startsWith(iName) && iName.length >= 6));
      });
      if (matchedByName) {
        const directStock = Math.max(0, Math.floor(Number(matchedByName.stock || 0)));
        if (matchedByName.estado === 0 && directStock <= 0) return 0;
        return directStock;
      }
      return null;
    };

    const computeSingleProductStock = (prod) => {
      if (!prod || prod.estado === 0) return 0;
      const ficha = fichaMap.get(prod.idProducto);
      if (ficha && Array.isArray(ficha.detalles) && ficha.detalles.length > 0) {
        let minPortions = Infinity;
        for (const det of ficha.detalles) {
          const insumo = det.insumo;
          const cantReq = Number(det.cantidad || 0);
          if (insumo && cantReq > 0) {
            const stockInsumo = Math.max(0, Number(insumo.stock || 0));
            if (stockInsumo <= 0) {
              minPortions = 0;
              break;
            }
            const cantConvertida = convertToInsumoUnit(cantReq, det.unidadMedida, insumo.unidadMedida);
            if (cantConvertida > 0) {
              const stockInsumo = Math.max(0, Number(insumo.stock || 0));
              const porciones = Math.floor(stockInsumo / cantConvertida);
              minPortions = Math.min(minPortions, porciones);
            }
          }
        }
        if (minPortions !== Infinity) return minPortions;
      }
      const directStock = resolveDirectInsumoStock(prod);
      if (directStock !== null) return directStock;
      return 0;
    };

    // Conteo de ventas por variante (ya precargado en paralelo)
    const ventasMap = new Map();
    ventasPorVariante.forEach(v => {
      ventasMap.set(Number(v.idVariante), Number(v.totalVentas || 0));
    });

    return products
      .filter(p => p.idProducto !== 0 && !p.nombre?.startsWith('__SISTEMA'))
      .map(p => {
        let adiciones = [];
        try {
          adiciones = typeof p.adiciones === 'string' ? JSON.parse(p.adiciones) : (p.adiciones || []);
        } catch (e) {
          adiciones = [];
        }

        let cfgCombo = null;
        try {
          cfgCombo = typeof p.configuracionCombo === 'string' ? JSON.parse(p.configuracionCombo) : (p.configuracionCombo || null);
        } catch (e) {
          cfgCombo = null;
        }

        const realPrecio = p.precio !== undefined && p.precio !== null && parseFloat(p.precio) > 0
          ? parseFloat(p.precio)
          : (p.variantes?.[0] ? parseFloat(p.variantes[0].precio || 0) : 0);

        const isCombo = Boolean(cfgCombo?.esCombo || (p.categoria && String(p.categoria).toLowerCase().includes('combo')));
        const catNombre = p.categoriaProducto ? p.categoriaProducto.nombre : (p.categoria || '');
        const isDrinkProd =
          Number(p.idCategoriaProducto) === 4 ||
          /bebida|gaseos|refresco/i.test(catNombre) ||
          /gaseosa|coca|pepsi|sprite|quatro|cuatro|postob[oó]n|agua\b/i.test(p.nombre || '');
        const rawVars = Array.isArray(p.variantes) ? p.variantes : [];
        const baseVarRow = rawVars.find(
          v => !(v?.creadaPorEvento || v?.idEvento) && isDummyOrBaseVariant(v?.nombre, p.nombre)
        ) || null;
        const realRawVars = rawVars.filter(v => {
          const isEvtVar = Boolean(v?.creadaPorEvento || v?.idEvento);
          const isDummy = !isEvtVar && isDummyOrBaseVariant(v?.nombre, p.nombre);
          if (isDummy) return false;
          if (onlyActiveVariants) {
            return v?.estado === undefined || v?.estado === null || Number(v.estado) !== 0;
          }
          return true;
        });
        const realActiveVars = realRawVars.filter(
          v => v?.estado === undefined || v?.estado === null || Number(v.estado) !== 0
        );
        const baseFichaProd = fichaMap.get(Number(p.idProducto)) || null;

        const variantes = (isCombo || realRawVars.length === 0)
          ? []
          : realRawVars.map(v => {
              const vf = varFichaMap.get(Number(v.idVariante));
              const hasRealVf = Boolean(vf && Array.isArray(vf.detalles) && vf.detalles.length > 0);
              const rawDeltas = Array.isArray(v.insumosModificados) ? v.insumosModificados : [];

              let mappedDetalles = [];
              if (hasRealVf) {
                mappedDetalles = vf.detalles.map(d => ({
                  idDetalleFicha: d.idDetalleFicha,
                  idInsumo: d.idInsumo,
                  cantidad: Number(d.cantidad || 0),
                  unidadMedida: d.unidadMedida || d.insumo?.unidadMedida || 'und',
                  precioUnitario: Number(d.insumo?.precioUnitario || insumoByIdMap.get(Number(d.idInsumo))?.precioUnitario || 0),
                  insumo: d.insumo ? {
                    idInsumo: d.insumo.idInsumo,
                    nombre: d.insumo.nombre,
                    unidadMedida: d.insumo.unidadMedida,
                    stock: d.insumo.stock,
                    precioUnitario: Number(d.insumo.precioUnitario || 0)
                  } : null
                }));
              } else if (baseFichaProd && Array.isArray(baseFichaProd.detalles) && baseFichaProd.detalles.length > 0 && rawDeltas.length > 0) {
                mappedDetalles = buildEffectiveDetallesFromDeltas(baseFichaProd.detalles, rawDeltas, insumoByIdMap);
              } else if (isDrinkProd) {
                const resolvedDrinkInsId = resolveDrinkInsumoId(v.nombre, p.nombre, p.idProducto);
                const drinkIns = resolvedDrinkInsId ? insumoByIdMap.get(Number(resolvedDrinkInsId)) : null;
                if (drinkIns) {
                  mappedDetalles = [{
                    idDetalleFicha: null,
                    idInsumo: drinkIns.idInsumo,
                    cantidad: 1,
                    unidadMedida: 'und',
                    precioUnitario: Number(drinkIns.precioUnitario || 0),
                    insumo: {
                      idInsumo: drinkIns.idInsumo,
                      nombre: drinkIns.nombre,
                      unidadMedida: drinkIns.unidadMedida || 'und',
                      stock: drinkIns.stock,
                      precioUnitario: Number(drinkIns.precioUnitario || 0)
                    }
                  }];
                }
              }

              const formattedVarFicha = (hasRealVf || mappedDetalles.length > 0)
                ? formatFichaForProductResponse(vf, p, v, mappedDetalles, baseFichaProd, isDrinkProd)
                : null;

              let mappedDeltas = rawDeltas.map(im => ({
                idVarianteInsumo: im.idVarianteInsumo,
                tipoAccion: im.tipoAccion,
                idInsumo: im.idInsumo,
                idInsumoReemplazado: im.idInsumoReemplazado,
                cantidad: Number(im.cantidad || 0),
                unidadMedida: im.unidadMedida,
                observaciones: im.observaciones,
                insumo: im.insumo ? { idInsumo: im.insumo.idInsumo, nombre: im.insumo.nombre, unidadMedida: im.insumo.unidadMedida, stock: im.insumo.stock } : null,
                insumoReemplazado: im.insumoReemplazado ? { idInsumo: im.insumoReemplazado.idInsumo, nombre: im.insumoReemplazado.nombre, unidadMedida: im.insumoReemplazado.unidadMedida } : null
              }));

              if (mappedDeltas.length === 0 && isDrinkProd && mappedDetalles.length > 0) {
                mappedDeltas = mappedDetalles.map(md => ({
                  idVarianteInsumo: null,
                  tipoAccion: 'AGREGAR',
                  idInsumo: md.idInsumo,
                  idInsumoReemplazado: null,
                  cantidad: 1,
                  unidadMedida: 'und',
                  observaciones: null,
                  insumo: md.insumo ? { idInsumo: md.insumo.idInsumo, nombre: md.insumo.nombre, unidadMedida: md.insumo.unidadMedida, stock: md.insumo.stock } : null,
                  insumoReemplazado: null
                }));
              }

              const varEstado = v.estado !== undefined && v.estado !== null ? Number(v.estado) : 1;
              return {
                id: v.idVariante,
                idVariante: v.idVariante,
                nombre: v.nombre,
                descripcion: v.descripcion || '',
                precio: ProductService.resolveVariantPrice(v.precio, realPrecio),
                imagen: v.imagen || '',
                estado: varEstado,
                activo: varEstado !== 0,
                idEvento: v.idEvento ? Number(v.idEvento) : null,
                creadaPorEvento: Boolean(v.creadaPorEvento || v.idEvento),
                eventoOrigen: v.evento ? {
                  idEvento: v.evento.idEvento,
                  nombreEvento: v.evento.nombreEvento,
                  tipoEvento: v.evento.tipoEvento,
                  estado: v.evento.estado === 1 ? 'Activo' : 'Inactivo'
                } : null,
                fichaTecnica: formattedVarFicha,
                insumosModificados: mappedDeltas
              };
            });

        const baseMappedDetalles = Array.isArray(baseFichaProd?.detalles) ? baseFichaProd.detalles.map(d => ({
          idDetalleFicha: d.idDetalleFicha,
          idInsumo: d.idInsumo,
          cantidad: Number(d.cantidad || 0),
          unidadMedida: d.unidadMedida || d.insumo?.unidadMedida || 'und',
          precioUnitario: Number(d.insumo?.precioUnitario || insumoByIdMap.get(Number(d.idInsumo))?.precioUnitario || 0),
          insumo: d.insumo ? {
            idInsumo: d.insumo.idInsumo,
            nombre: d.insumo.nombre,
            unidadMedida: d.insumo.unidadMedida,
            stock: d.insumo.stock,
            precioUnitario: Number(d.insumo.precioUnitario || 0)
          } : null
        })) : [];

        const formattedBaseFicha = baseFichaProd
          ? formatFichaForProductResponse(baseFichaProd, p, null, baseMappedDetalles, null, isDrinkProd)
          : null;

        const idVariantePrincipal = realActiveVars[0]?.idVariante || baseVarRow?.idVariante || rawVars[0]?.idVariante || p.idProducto;
        const idVarianteBase = baseVarRow?.idVariante || null;

        // Calcular número total de ventas históricas del producto (Ítem #104)
        let totalVentas = 0;
        if (rawVars.length > 0) {
          rawVars.forEach(v => {
            totalVentas += (ventasMap.get(Number(v.idVariante)) || 0);
          });
        } else {
          totalVentas = ventasMap.get(Number(p.idProducto)) || 0;
        }

        // Calcular stock real disponible según receta, insumo directo o productos del combo
        let stockDisponible = computeSingleProductStock(p);

        if (isCombo && Array.isArray(p.itemsCombo) && p.itemsCombo.length > 0) {
          let minCombo = stockDisponible;
          for (const it of p.itemsCombo) {
            const comp = it.productoComponente;
            const reqCompQty = Math.max(1, Number(it.cantidad || 1));
            if (comp) {
              if (comp.estado === 0 || Number(comp.eliminado) === 1) {
                minCombo = 0;
                break;
              }
              const compStock = computeSingleProductStock(comp);
              minCombo = Math.min(minCombo, Math.floor(compStock / reqCompQty));
            }
          }
          stockDisponible = minCombo;
        }

        if (p.estado === 0) stockDisponible = 0;

        const itemsComboFormatted = (p.itemsCombo || []).map(it => ({
          idDetalleCombo: it.idDetalleCombo,
          idCombo: it.idCombo,
          idProducto: it.idProducto,
          cantidad: it.cantidad,
          esOpcional: Boolean(it.esOpcional),
          grupoSeleccion: it.grupoSeleccion,
          producto: it.productoComponente ? {
            id: it.productoComponente.idProducto,
            idProducto: it.productoComponente.idProducto,
            nombre: it.productoComponente.nombre,
            precio: parseFloat(it.productoComponente.precio || 0),
            imagen: sanitizeProductImageUrl(it.productoComponente.imagen),
            estado: it.productoComponente.estado
          } : null
        }));

        return {
          _id: p.idProducto,
          id: p.idProducto,
          idProducto: p.idProducto,
          nombre: p.nombre,
          precio: realPrecio,
          descripcion: p.descripcion || '',
          imagen: sanitizeProductImageUrl(p.imagen),
          stock: stockDisponible,
          agotado: stockDisponible <= 0 || p.estado === 0,
          ventas: totalVentas,
          tieneVentas: totalVentas > 0,
          idCategoriaProducto: p.idCategoriaProducto,
          categoriaId: p.idCategoriaProducto,
          categoria: p.categoriaProducto ? p.categoriaProducto.nombre : (p.categoria || ''),
          estado: p.estado === 1 ? 'Activo' : 'Inactivo',
          eliminado: Number(p.eliminado || 0),
          fechaEliminacion: p.fechaEliminacion || null,
          esCombo: isCombo,
          configuracionCombo: cfgCombo,
          itemsCombo: itemsComboFormatted,
          variantes,
          idVariantePrincipal,
          idVarianteBase,
          tieneVariantes: variantes.length > 0,
          fichaTecnica: formattedBaseFicha,
          adiciones,
          eventos: Array.isArray(p.eventos) ? p.eventos.map(ev => EventoService.serializeEventoRelation(ev)) : []
        };
      });
  }

  static async getProducts({ onlyActiveVariants = false } = {}) {
    await ensureVarianteEventoSchemaOnce();
    if (!ProductService._catalogVariantsSyncTriggered) {
      ProductService._catalogVariantsSyncTriggered = true;
      const { ensureCatalogVariantsAndDrinkFichas } = require('../../infrastructure/utils/catalogVariantsSync');
      const { invalidateNamespaces } = require('../../infrastructure/utils/apiCache');
      const changed = await ensureCatalogVariantsAndDrinkFichas().catch(() => false);
      if (changed) {
        invalidateNamespaces(['productos', 'fichas']);
      }
    }
    return this._queryFormattedProducts({ eliminado: 0, order: [['idProducto', 'ASC']], onlyActiveVariants });
  }

  static async getProductsPapelera() {
    return this._queryFormattedProducts({
      eliminado: 1,
      order: [['fechaEliminacion', 'DESC'], ['idProducto', 'DESC']]
    });
  }

  /** Resolves an optional variant price, falling back to basePrice when unset or non-positive. */
  static resolveVariantPrice(rawPrecio, basePrice = 0) {
    const parsed = rawPrecio !== undefined && rawPrecio !== null && rawPrecio !== ''
      ? Number(rawPrecio)
      : NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : (Number(basePrice) || 0);
  }

  static async getProductById(id) {
    const all = await this.getProducts();
    const found = all.find(p => Number(p.idProducto || p.id) === Number(id));
    if (!found) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }
    return found;
  }

  static async createProduct(data) {
    await ensureVarianteEventoSchemaOnce();
    const { nombre, precio, descripcion, imagen, categoria, adiciones, idCategoriaProducto, estado, configuracionCombo, itemsCombo } = data;
    if (!nombre || !nombre.trim()) {
      const error = new Error('El nombre del producto es obligatorio');
      error.statusCode = 400;
      throw error;
    }

    const existing = await Product.findOne({ where: { nombre: nombre.trim(), eliminado: 0 } });
    if (existing) {
      const error = new Error('Ya existe un producto registrado con ese nombre');
      error.statusCode = 400;
      throw error;
    }

    const normalizedCategoria = typeof categoria === 'string' ? categoria.trim() : '';
    let resolvedCatId = idCategoriaProducto;
    let resolvedCatNombre = normalizedCategoria;

    if (!resolvedCatId && normalizedCategoria) {
      const catObj = await CategoriaProducto.findOne({ where: { nombre: normalizedCategoria } });
      if (catObj) {
        resolvedCatId = catObj.idCategoriaProducto;
        resolvedCatNombre = catObj.nombre;
      }
    } else if (resolvedCatId) {
      const catObj = await CategoriaProducto.findByPk(resolvedCatId);
      if (catObj) resolvedCatNombre = catObj.nombre;
    }

    if (!resolvedCatId) {
      const firstCat = await CategoriaProducto.findOne();
      resolvedCatId = firstCat ? firstCat.idCategoriaProducto : 1;
      resolvedCatNombre = firstCat ? firstCat.nombre : 'General';
    }

    const normalizedEstado = estado === 'Inactivo' || estado === 0 || estado === '0' ? 0 : 1;
    const finalPrecio = (precio !== undefined && precio !== null && precio !== '') ? Number(precio) : 0.00;

    let comboConfigStr = null;
    if (configuracionCombo) {
      comboConfigStr = typeof configuracionCombo === 'string' ? configuracionCombo : JSON.stringify(configuracionCombo);
    } else if (Array.isArray(itemsCombo) && itemsCombo.length > 0) {
      comboConfigStr = JSON.stringify({ esCombo: true, itemsCombo });
    }

    const product = await Product.create({
      idCategoriaProducto: resolvedCatId,
      nombre: nombre.trim(),
      descripcion: descripcion || '',
      imagen: imagen || '',
      categoria: resolvedCatNombre,
      precio: finalPrecio,
      estado: normalizedEstado,
      eliminado: 0,
      fechaEliminacion: null,
      adiciones: adiciones ? (typeof adiciones === 'string' ? adiciones : JSON.stringify(adiciones)) : '[]',
      configuracionCombo: comboConfigStr
    });

    // Crear variantes enviadas o variante base por defecto
    const validVariants = Array.isArray(data.variantes)
      ? data.variantes.filter(v => v && v.nombre && v.nombre.trim() && (v.creadaPorEvento || v.idEvento || v.nombre.trim().toLowerCase() !== nombre.trim().toLowerCase()))
      : [];

    if (validVariants.length > 0) {
      for (const v of validVariants) {
        const newVar = await Variante.create({
          idProducto: product.idProducto,
          nombre: v.nombre.trim(),
          descripcion: v.descripcion || null,
          precio: ProductService.resolveVariantPrice(v.precio, finalPrecio),
          imagen: v.imagen || null,
          estado: resolveVarianteEstadoValue(v, normalizedEstado),
          idEvento: v.idEvento ? Number(v.idEvento) : null,
          creadaPorEvento: v.creadaPorEvento || v.idEvento ? 1 : 0
        });

        if (Array.isArray(v.insumosModificados) && v.insumosModificados.length > 0) {
          for (const im of v.insumosModificados) {
            const accion = String(im.tipoAccion || 'AGREGAR').toUpperCase();
            if (im.idInsumo && (accion === 'QUITAR' || Number(im.cantidad) > 0)) {
              await VarianteInsumo.create({
                idVariante: newVar.idVariante,
                tipoAccion: accion,
                idInsumo: Number(im.idInsumo),
                idInsumoReemplazado: im.idInsumoReemplazado ? Number(im.idInsumoReemplazado) : null,
                cantidad: accion === 'QUITAR' ? 0 : Number(im.cantidad),
                unidadMedida: im.unidadMedida || 'und',
                observaciones: im.observaciones || null
              });
            }
          }
        }

        if (v.fichaTecnica && Array.isArray(v.fichaTecnica.detalles || v.fichaTecnica.insumos)) {
          await FichaTecnicaService.saveForVariante(product.idProducto, newVar.idVariante, {
            ...v.fichaTecnica,
            varianteNombre: v.nombre.trim(),
            descripcion: v.fichaTecnica.descripcion || v.descripcion || null
          });
        }
      }
    } else {
      await Variante.create({
        idProducto: product.idProducto,
        nombre: `${nombre.trim()} - base`,
        precio: finalPrecio,
        estado: normalizedEstado
      });
    }

    // Sincronizar items del combo si aplica (Ítems #97, #106)
    const comboItemsToSave = itemsCombo || (configuracionCombo?.itemsCombo) || (configuracionCombo?.productosAsociados);
    if (Array.isArray(comboItemsToSave) && comboItemsToSave.length > 0) {
      await this.syncItemsCombo(product.idProducto, comboItemsToSave);
    }

    return this.getProductById(product.idProducto);
  }

  static async updateProduct(id, data) {
    await ensureVarianteEventoSchemaOnce();
    const p = await Product.findByPk(id);
    if (!p) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const { nombre, precio, descripcion, imagen, categoria, adiciones, estado, idCategoriaProducto, configuracionCombo, itemsCombo, variantes } = data;

    // Requisito 105: Coherencia de Categoría (impedir pasar comida a bebidas o viceversa)
    if (idCategoriaProducto || categoria) {
      const currentCat = await CategoriaProducto.findByPk(p.idCategoriaProducto);
      let targetCat = null;
      if (idCategoriaProducto) {
        targetCat = await CategoriaProducto.findByPk(idCategoriaProducto);
      } else if (categoria) {
        targetCat = await CategoriaProducto.findOne({ where: { nombre: categoria } });
      }

      if (currentCat && targetCat && currentCat.idCategoriaProducto !== targetCat.idCategoriaProducto) {
        const isCurrentDrink = /bebida|refresco|gaseosa|jugo/i.test(currentCat.nombre || '');
        const isTargetDrink = /bebida|refresco|gaseosa|jugo/i.test(targetCat.nombre || '');
        if (isCurrentDrink !== isTargetDrink) {
          const error = new Error(`Cambio de categoría incoherente: no se permite cambiar un producto de tipo "${isCurrentDrink ? 'Bebida' : 'Comida'}" a "${isTargetDrink ? 'Bebida' : 'Comida'}".`);
          error.statusCode = 400;
          throw error;
        }
        p.idCategoriaProducto = targetCat.idCategoriaProducto;
        p.categoria = targetCat.nombre;
      }
    }

    const prevBasePrecio = Number(p.precio) || 0;
    if (nombre !== undefined) p.nombre = nombre.trim();
    if (descripcion !== undefined) p.descripcion = descripcion;
    if (imagen !== undefined) p.imagen = imagen;
    if (precio !== undefined && precio !== null && precio !== '') {
      p.precio = Number(precio) || 0;
    }
    if (estado !== undefined) {
      p.estado = estado === 'Activo' || estado === 1 || estado === '1' ? 1 : 0;
    }
    if (adiciones !== undefined) {
      p.adiciones = typeof adiciones === 'string' ? adiciones : JSON.stringify(adiciones);
    }
    if (configuracionCombo !== undefined) {
      p.configuracionCombo = typeof configuracionCombo === 'string' ? configuracionCombo : JSON.stringify(configuracionCombo);
    }

    await p.save();

    // Sincronizar variantes (nombre, precio, imagen, creación y actualización)
    if (Array.isArray(variantes)) {
      const basePrice = Number(p.precio) || 0;
      const existingVariantes = await Variante.findAll({ where: { idProducto: id } });
      const existingIds = existingVariantes.map(v => Number(v.idVariante));
      const existingByIdMap = new Map(existingVariantes.map(ev => [Number(ev.idVariante), ev]));

      const filteredIncoming = variantes.filter(v => v && v.nombre && v.nombre.trim() && (v.creadaPorEvento || v.idEvento || v.nombre.trim().toLowerCase() !== p.nombre.toLowerCase()));

      if (filteredIncoming.length > 0) {
        const matchedExistingIds = new Set(
          filteredIncoming
            .map(v => Number(v.idVariante))
            .filter(vId => vId && existingIds.includes(vId))
        );
        const usedExistingIds = new Set(matchedExistingIds);
        const incomingIds = [];

        for (let i = 0; i < filteredIncoming.length; i++) {
          const v = filteredIncoming[i];
          const vNombre = v.nombre.trim();
          const vDesc = v.descripcion || null;
          const vPrecio = ProductService.resolveVariantPrice(v.precio, basePrice);
          const vImagen = v.imagen || null;
          let currentVarId = null;

          if (v.idVariante && existingIds.includes(Number(v.idVariante))) {
            currentVarId = Number(v.idVariante);
            const prevRow = existingByIdMap.get(currentVarId);
            const nextEstado = resolveVarianteEstadoValue(v, prevRow?.estado !== undefined ? Number(prevRow.estado) : p.estado);
            const updatePayload = { nombre: vNombre, descripcion: vDesc, precio: vPrecio, imagen: vImagen, estado: nextEstado };
            if (v.idEvento !== undefined) updatePayload.idEvento = v.idEvento ? Number(v.idEvento) : null;
            if (v.creadaPorEvento !== undefined) updatePayload.creadaPorEvento = v.creadaPorEvento || v.idEvento ? 1 : 0;
            await Variante.update(updatePayload, { where: { idVariante: currentVarId } });
          } else {
            const reusableDummy = existingVariantes.find(
              ev => !usedExistingIds.has(Number(ev.idVariante)) && isDummyOrBaseVariant(ev.nombre, p.nombre)
            );
            const nextEstado = resolveVarianteEstadoValue(v, p.estado);
            if (reusableDummy) {
              currentVarId = Number(reusableDummy.idVariante);
              usedExistingIds.add(currentVarId);
              await Variante.update(
                {
                  nombre: vNombre,
                  descripcion: vDesc,
                  precio: vPrecio,
                  imagen: vImagen,
                  estado: nextEstado,
                  idEvento: v.idEvento ? Number(v.idEvento) : null,
                  creadaPorEvento: v.creadaPorEvento || v.idEvento ? 1 : 0
                },
                { where: { idVariante: currentVarId } }
              );
            } else {
              const newVar = await Variante.create({
                idProducto: id,
                nombre: vNombre,
                descripcion: vDesc,
                precio: vPrecio,
                imagen: vImagen,
                estado: nextEstado,
                idEvento: v.idEvento ? Number(v.idEvento) : null,
                creadaPorEvento: v.creadaPorEvento || v.idEvento ? 1 : 0
              });
              currentVarId = Number(newVar.idVariante);
            }
          }
          incomingIds.push(currentVarId);

          // Sincronizar insumosModificados para esta variante
          await VarianteInsumo.destroy({ where: { idVariante: currentVarId } });
          if (Array.isArray(v.insumosModificados) && v.insumosModificados.length > 0) {
            for (const im of v.insumosModificados) {
              const accion = String(im.tipoAccion || 'AGREGAR').toUpperCase();
              if (im.idInsumo && (accion === 'QUITAR' || Number(im.cantidad) > 0)) {
                await VarianteInsumo.create({
                  idVariante: currentVarId,
                  tipoAccion: accion,
                  idInsumo: Number(im.idInsumo),
                  idInsumoReemplazado: im.idInsumoReemplazado ? Number(im.idInsumoReemplazado) : null,
                  cantidad: accion === 'QUITAR' ? 0 : Number(im.cantidad),
                  unidadMedida: im.unidadMedida || 'und',
                  observaciones: im.observaciones || null
                });
              }
            }
          }

          // Sincronizar ficha técnica dedicada para esta variante
          if (v.fichaTecnica && Array.isArray(v.fichaTecnica.detalles || v.fichaTecnica.insumos)) {
            await FichaTecnicaService.saveForVariante(id, currentVarId, {
              ...v.fichaTecnica,
              varianteNombre: vNombre,
              descripcion: v.fichaTecnica.descripcion || vDesc || null
            });
          } else if (v.fichaTecnica === null) {
            await FichaTecnicaService.deleteByVarianteId(currentVarId).catch(() => null);
          }
        }

        const toRemove = existingIds.filter(vId => !incomingIds.includes(vId));
        for (const removeId of toRemove) {
          await FichaTecnicaService.deleteByVarianteId(removeId).catch(() => null);
          const hasSales = await DetalleVentaProducto.findOne({ where: { idVariante: removeId } }).catch(() => null);
          if (!hasSales) {
            await VarianteInsumo.destroy({ where: { idVariante: removeId } }).catch(() => null);
            await Variante.destroy({ where: { idVariante: removeId } }).catch(() => null);
          }
        }
      } else {
        // El producto se guardó sin variantes adicionales (producto simple)
        if (existingVariantes.length > 0) {
          await FichaTecnicaService.deleteByVarianteId(existingVariantes[0].idVariante).catch(() => null);
          await Variante.update(
            { nombre: `${p.nombre.trim()} - base`, precio: basePrice },
            { where: { idVariante: existingVariantes[0].idVariante } }
          );
          await VarianteInsumo.destroy({ where: { idVariante: existingVariantes[0].idVariante } });
          for (let i = 1; i < existingVariantes.length; i++) {
            const remVar = existingVariantes[i];
            await FichaTecnicaService.deleteByVarianteId(remVar.idVariante).catch(() => null);
            const hasSales = await DetalleVentaProducto.findOne({ where: { idVariante: remVar.idVariante } }).catch(() => null);
            if (!hasSales) {
              await VarianteInsumo.destroy({ where: { idVariante: remVar.idVariante } }).catch(() => null);
              await Variante.destroy({ where: { idVariante: remVar.idVariante } }).catch(() => null);
            }
          }
        }
      }
    } else if (precio !== undefined && precio !== null && precio !== '') {
      const nuevoPrecio = Number(precio) || 0;
      const existingVars = await Variante.findAll({ where: { idProducto: id } });
      for (const ev of existingVars) {
        const curPrecio = Number(ev.precio || 0);
        if (curPrecio <= 0 || curPrecio === prevBasePrecio || isDummyOrBaseVariant(ev.nombre, p.nombre)) {
          await Variante.update({ precio: nuevoPrecio }, { where: { idVariante: ev.idVariante } });
        }
      }
    }

    // Sincronizar items de combo si se enviaron (Ítems #97, #106)
    const comboItemsToSave = itemsCombo || (configuracionCombo && typeof configuracionCombo === 'object' ? (configuracionCombo.itemsCombo || configuracionCombo.productosAsociados) : null);
    if (comboItemsToSave !== undefined) {
      await this.syncItemsCombo(id, comboItemsToSave || []);
    }

    return this.getProductById(id);
  }

  static async toggleVarianteEstado(idProducto, idVariante, rawEstado) {
    await ensureVarianteEventoSchemaOnce();
    const varId = Number(idVariante);
    const prodId = idProducto ? Number(idProducto) : null;
    if (!Number.isFinite(varId) || varId <= 0) {
      const error = new Error('Variante inválida');
      error.statusCode = 400;
      throw error;
    }

    const v = await Variante.findByPk(varId);
    if (!v || (prodId && Number(v.idProducto) !== prodId)) {
      const error = new Error('Variante no encontrada para este producto');
      error.statusCode = 404;
      throw error;
    }

    let nextEstado;
    if (rawEstado !== undefined && rawEstado !== null) {
      nextEstado = (rawEstado === 0 || rawEstado === '0' || String(rawEstado).toLowerCase() === 'inactivo' || rawEstado === false) ? 0 : 1;
    } else {
      nextEstado = Number(v.estado ?? 1) === 1 ? 0 : 1;
    }

    v.estado = nextEstado;
    await v.save();

    return {
      idProducto: Number(v.idProducto),
      idVariante: Number(v.idVariante),
      nombre: v.nombre,
      estado: nextEstado,
      activo: nextEstado === 1,
      message: nextEstado === 1
        ? `La variante "${v.nombre}" está activa y visible en el módulo de clientes`
        : `La variante "${v.nombre}" fue inactivada y ocultada en el módulo de clientes`
    };
  }

  static async deleteProduct(id) {
    const prodId = Number(id);
    if (!Number.isFinite(prodId) || prodId <= 0) {
      const error = new Error('No se puede eliminar un registro reservado del sistema');
      error.statusCode = 400;
      throw error;
    }

    const p = await Product.findByPk(prodId);
    if (!p) {
      const error = new Error('Producto no encontrado');
      error.statusCode = 404;
      throw error;
    }

    p.eliminado = 1;
    p.fechaEliminacion = new Date();
    await p.save();

    return {
      deleted: true,
      softDeleted: true,
      id: prodId,
      nombre: p.nombre,
      message: `"${p.nombre}" se movió a la papelera de reciclaje`
    };
  }

  static async restoreProduct(id) {
    const prodId = Number(id);
    if (!Number.isFinite(prodId) || prodId <= 0) {
      const error = new Error('Registro del sistema inválido');
      error.statusCode = 400;
      throw error;
    }

    const p = await Product.findByPk(prodId);
    if (!p) {
      const error = new Error('Producto no encontrado en la papelera');
      error.statusCode = 404;
      throw error;
    }

    const duplicateActive = await Product.findOne({
      where: {
        nombre: p.nombre,
        eliminado: 0,
        idProducto: { [Op.ne]: prodId }
      }
    });
    if (duplicateActive) {
      const error = new Error(`Ya existe otro producto activo llamado "${p.nombre}". Renómbralo antes de restaurar este registro.`);
      error.statusCode = 400;
      throw error;
    }

    p.eliminado = 0;
    p.fechaEliminacion = null;
    await p.save();

    return this.getProductById(prodId);
  }

  static async hardDeleteProduct(id) {
    const prodId = Number(id);
    if (!Number.isFinite(prodId) || prodId <= 0) {
      const error = new Error('No se puede eliminar un registro reservado del sistema');
      error.statusCode = 400;
      throw error;
    }

    const t = await Product.sequelize.transaction();
    try {
      const p = await Product.findByPk(prodId, { transaction: t });
      if (!p) {
        await t.rollback();
        const error = new Error('Producto no encontrado');
        error.statusCode = 404;
        throw error;
      }

      const variantes = await Variante.findAll({ where: { idProducto: prodId }, transaction: t });
      const varianteIds = variantes.map(v => Number(v.idVariante));
      const varianteMap = new Map(variantes.map(v => [Number(v.idVariante), v.nombre]));

      // Preservar el historial de ventas reasignando detalles al placeholder técnico (idVariante=0)
      // con el nombre del producto/variante congelado en observaciones.
      if (varianteIds.length > 0) {
        const ventasRelacionadas = await DetalleVentaProducto.findAll({
          where: { idVariante: varianteIds },
          transaction: t
        });

        if (ventasRelacionadas.length > 0) {
          let zeroVariant = await Variante.findByPk(0, { transaction: t });
          if (!zeroVariant) {
            await Product.sequelize.query(
              "SET SESSION sql_mode = CONCAT(@@SESSION.sql_mode, ',NO_AUTO_VALUE_ON_ZERO')",
              { transaction: t }
            );
            await Product.sequelize.query(
              "INSERT IGNORE INTO `producto` (`idProducto`, `idCategoriaProducto`, `nombre`, `estado`, `precio`, `categoria`) VALUES (0, 0, '__SISTEMA_VARIANTE_CERO__', 0, 0, '__SISTEMA_VARIANTE_CERO__')",
              { transaction: t }
            );
            await Product.sequelize.query(
              "INSERT IGNORE INTO `variante` (`idVariante`, `idProducto`, `nombre`, `precio`, `estado`) VALUES (0, 0, '__SISTEMA_VARIANTE_CERO__', 0, 0)",
              { transaction: t }
            );
          }

          for (const det of ventasRelacionadas) {
            const vName = varianteMap.get(Number(det.idVariante)) || '';
            const snapshotLabel =
              vName && !isDummyOrBaseVariant(vName, p.nombre)
                ? `${p.nombre} (${vName})`
                : p.nombre;

            let updatedObs = det.observaciones;
            if (!updatedObs || !String(updatedObs).trim()) {
              updatedObs = snapshotLabel;
            } else if (String(updatedObs).trim().startsWith('{')) {
              try {
                const parsed = JSON.parse(updatedObs);
                if (!parsed.nombreProducto && !parsed.nombre) {
                  parsed.nombre = snapshotLabel;
                  parsed.nombreProducto = p.nombre;
                  if (vName && !isDummyOrBaseVariant(vName, p.nombre)) parsed.nombreVariante = vName;
                  updatedObs = JSON.stringify(parsed);
                }
              } catch (_) {
                // Conservar observación existente si el JSON no se pudo parsear
              }
            } else if (!String(updatedObs).toLowerCase().includes(p.nombre.toLowerCase())) {
              updatedObs = `${snapshotLabel} — ${String(updatedObs).trim()}`;
            }

            await det.update(
              { idVariante: 0, observaciones: String(updatedObs).slice(0, 255) },
              { transaction: t }
            );
          }
        }

        await VarianteInsumo.destroy({ where: { idVariante: varianteIds }, transaction: t });
      }

      // Eliminar fichas técnicas asociadas al producto o sus variantes
      const fichaWhere = varianteIds.length > 0
        ? { [Op.or]: [{ idProducto: prodId }, { idVariante: varianteIds }] }
        : { idProducto: prodId };
      const fichasProd = await FichaTecnica.findAll({ where: fichaWhere, transaction: t });
      const fichaIds = fichasProd.map(ft => ft.idFichaTecnica);
      if (fichaIds.length > 0) {
        await DetalleFichaInsumo.destroy({ where: { idFichaTecnica: fichaIds }, transaction: t });
        await FichaTecnica.destroy({ where: { idFichaTecnica: fichaIds }, transaction: t });
      }

      // Eliminar dependencias restantes del producto
      await Evento.destroy({ where: { idProducto: prodId }, transaction: t });
      await ComboProducto.destroy({
        where: { [Op.or]: [{ idCombo: prodId }, { idProducto: prodId }] },
        transaction: t
      });
      await Resena.destroy({ where: { idProducto: prodId }, transaction: t });

      if (varianteIds.length > 0) {
        await Variante.destroy({ where: { idProducto: prodId }, transaction: t });
      }

      await p.destroy({ transaction: t });
      await t.commit();
    } catch (err) {
      await t.rollback().catch(() => {});
      throw err;
    }

    const { resetAutoIncrement } = require('../../infrastructure/utils/dbUtils');
    await resetAutoIncrement('producto', 'idProducto');
    return { deleted: true, id: prodId, message: 'Producto eliminado correctamente' };
  }
}

module.exports = ProductService;
