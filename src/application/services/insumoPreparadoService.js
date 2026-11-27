const { Op } = require('sequelize');
const { InsumoPreparado, DetalleInsumoPreparadoInsumo, Insumo, LoteInsumo, FichaTecnica, DetalleFichaInsumo } = require('../../persistence/models');
const { getColombiaDateISO } = require('../../infrastructure/utils/colombiaDateUtils');
const { computeInsumoStockBreakdown, groupLotesByInsumo } = require('../../infrastructure/utils/stockFefoUtils');
const { ensureInsumoPaqueteSchemaOnce } = require('../../infrastructure/utils/dbUtils');

function parsePaqueteSize(tamanioPaquete) {
  if (!tamanioPaquete) return 1;
  const str = String(tamanioPaquete).trim();
  const matchX = str.match(/^\d+\s*[xX×]\s*(\d+(?:[.,]\d+)?)$/);
  if (matchX) {
    const val = parseFloat(matchX[1].replace(',', '.'));
    return val > 0 ? val : 1;
  }
  const matchNum = str.match(/(\d+(?:[.,]\d+)?)/);
  if (matchNum) {
    const val = parseFloat(matchNum[1].replace(',', '.'));
    return val > 0 ? val : 1;
  }
  return 1;
}

function convertPrepUnits(amount, fromUnit, toUnit, insumoObj = null) {
  if (!amount || isNaN(amount)) return 0;
  if (!fromUnit || !toUnit) return Number(amount);
  const from = String(fromUnit).toLowerCase().trim();
  const to = String(toUnit).toLowerCase().trim();
  if (from === to) return Number(amount);

  const isKg = (u) => u.includes('kg') || u.includes('kilo');
  const isGr = (u) => u.includes('gr') || u.includes('gram');
  const isMg = (u) => u.includes('mg') || u.includes('miligram');
  const isLb = (u) => u === 'lb' || u.includes('libra') || u.includes('(lb)');
  const isLt = (u) => u.includes('lt') || u.includes('litro');
  const isMl = (u) => u.includes('ml') || u.includes('mililitro') || u.includes('cc');
  const isPaq = (u) => u.includes('paq');
  const isUnd = (u) => u.includes('und') || u === 'ud' || u.includes('unidad') || u.includes('porc');

  if (isPaq(to) && isUnd(from)) {
    return Number(amount) / parsePaqueteSize(insumoObj?.tamanioPaquete);
  }

  const weightToGr = (u) => {
    if (isKg(u)) return 1000;
    if (isGr(u)) return 1;
    if (isMg(u)) return 0.001;
    if (isLb(u)) return 453.592;
    return null;
  };
  const fromW = weightToGr(from);
  const toW = weightToGr(to);
  if (fromW && toW) return (Number(amount) * fromW) / toW;

  if (isLt(from) && isMl(to)) return Number(amount) * 1000;
  if (isMl(from) && isLt(to)) return Number(amount) / 1000;

  return Number(amount);
}

const ALLOWED_PREP_UNITS = new Set(['und', 'und — unidad', 'unidad', 'porción', 'porcion', 'ml', 'gr']);

function validatePrepUnit(unidadMedida) {
  if (!unidadMedida) return;
  const norm = String(unidadMedida).toLowerCase().trim();
  if (!ALLOWED_PREP_UNITS.has(norm) && !norm.startsWith('und') && !norm.startsWith('porc')) {
    const error = new Error('En insumo preparado solo se permiten las unidades: unidad, porción, ml o gr.');
    error.statusCode = 400;
    throw error;
  }
}

function validatePrepIngredients(itemsList) {
  if (!Array.isArray(itemsList)) return;
  for (const item of itemsList) {
    const u = String(item.unidadMedida || 'und').toLowerCase().trim();
    const cant = parseFloat(item.cantidad || 0);
    if (u.includes('paq')) {
      const error = new Error('No se permite la unidad "Paquete" en los ingredientes de un insumo preparado.');
      error.statusCode = 400;
      throw error;
    }
    if ((u === 'gr' || u.startsWith('gram')) && cant > 1000) {
      const error = new Error('La cantidad requerida de un ingrediente en gramos no puede superar los 1000 gr.');
      error.statusCode = 400;
      throw error;
    }
    if ((u === 'kg' || u.startsWith('kilo')) && cant > 2) {
      const error = new Error('La cantidad requerida de un ingrediente en kilogramos no puede superar los 2 kg.');
      error.statusCode = 400;
      throw error;
    }
    if ((u === 'ml' || u.startsWith('mililit') || u === 'cc') && cant > 1000) {
      const error = new Error('La cantidad requerida de un ingrediente en mililitros no puede superar los 1000 ml.');
      error.statusCode = 400;
      throw error;
    }
    if ((u === 'und' || u === 'ud' || u.startsWith('unidad')) && cant > 5) {
      const error = new Error('La cantidad requerida de un ingrediente en unidades no puede superar las 5 und.');
      error.statusCode = 400;
      throw error;
    }
    if ((u.startsWith('porc')) && cant > 5) {
      const error = new Error('La cantidad requerida de un ingrediente en porciones no puede superar las 5 porciones.');
      error.statusCode = 400;
      throw error;
    }
  }
}

class InsumoPreparadoService {
  static async getAll() {
    await ensureInsumoPaqueteSchemaOnce();
    const todayCol = getColombiaDateISO();
    const [preparados, allLotes] = await Promise.all([
      InsumoPreparado.findAll({
        where: { eliminado: 0 },
        include: [
          {
            model: DetalleInsumoPreparadoInsumo,
            as: 'detalles',
            include: [{ model: Insumo, as: 'insumo' }]
          },
          {
            model: FichaTecnica,
            as: 'fichaTecnica',
            required: false,
            where: { estado: 1 },
            include: [
              {
                model: DetalleFichaInsumo,
                as: 'detalles',
                include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida', 'precioUnitario'] }]
              }
            ]
          }
        ]
      }),
      LoteInsumo.findAll({
        attributes: ['idLote', 'idInsumo', 'cantidad', 'cantidadDisponible', 'fechaVencimiento', 'estado'],
        where: { estado: { [Op.ne]: 'AGOTADO' } },
        raw: true
      }).catch(() => [])
    ]);

    const lotesByInsumo = groupLotesByInsumo(allLotes);

    return preparados.map(p => {
      let calcCosto = 0;
      let minPorciones = Infinity;
      let hasUnlimitedOnly = false;

      const insumos = p.detalles ? p.detalles.map(d => {
        const cant = parseFloat(d.cantidad || 0);
        const pUnit = parseFloat(d.precioUnitario !== undefined && d.precioUnitario !== null && d.precioUnitario > 0
          ? d.precioUnitario
          : (d.insumo?.precioUnitario || 0));
        const sub = cant * pUnit;
        calcCosto += sub;

        if (d.insumo && cant > 0) {
          const breakdown = computeInsumoStockBreakdown(
            d.insumo,
            lotesByInsumo.get(Number(d.insumo.idInsumo)) || [],
            todayCol
          );
          if (breakdown.isInactive) {
            minPorciones = 0;
          } else if (!breakdown.controlarStock) {
            hasUnlimitedOnly = true;
          } else {
            const cantConvertida = convertPrepUnits(cant, d.unidadMedida || d.insumo.unidadMedida, d.insumo.unidadMedida, d.insumo);
            if (cantConvertida > 0) {
              minPorciones = Math.min(minPorciones, Math.floor(breakdown.stockVigente / cantConvertida));
            }
          }
        }

        return {
          idDetalle: d.idDetalle,
          idInsumo: d.idInsumo,
          insumoNombre: d.insumo ? d.insumo.nombre : '',
          cantidad: cant,
          unidadMedida: d.unidadMedida,
          precioUnitario: pUnit,
          subtotal: sub
        };
      }) : [];

      const finalCosto = parseFloat(p.costoTotal || 0) > 0 ? parseFloat(p.costoTotal) : calcCosto;
      const rend = parseFloat(p.rendimiento || 1);
      const stockDisponible = minPorciones !== Infinity
        ? (minPorciones * rend)
        : (hasUnlimitedOnly ? (99 * rend) : 0);

      return {
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        unidadMedida: p.unidadMedida || 'und',
        estado: p.estado,
        eliminado: p.eliminado || 0,
        rendimiento: rend,
        unidadRendimiento: p.unidadRendimiento || 'und',
        precioVenta: parseFloat(p.precioVenta || 0),
        costoTotal: finalCosto,
        esAdicion: p.esAdicion ? 1 : 0,
        precioAdicion: parseFloat(p.precioAdicion || 0),
        imagen: p.imagen || '',
        porcionMinimaCantidad: p.porcionMinimaCantidad !== null && p.porcionMinimaCantidad !== undefined ? parseFloat(p.porcionMinimaCantidad) : null,
        porcionMinimaUnidad: p.porcionMinimaUnidad || null,
        stock: p.estado === 0 ? 0 : stockDisponible,
        fechaCreacion: p.fechaCreacion,
        insumos,
        componentes: insumos,
        fichaTecnica: p.fichaTecnica || null
      };
    });
  }

  static async getDeleted() {
    const preparados = await InsumoPreparado.findAll({
      where: { eliminado: 1 },
      include: [
        {
          model: DetalleInsumoPreparadoInsumo,
          as: 'detalles',
          include: [{ model: Insumo, as: 'insumo' }]
        }
      ]
    });

    return preparados.map(p => {
      const insumos = p.detalles ? p.detalles.map(d => ({
        idDetalle: d.idDetalle,
        idInsumo: d.idInsumo,
        insumoNombre: d.insumo ? d.insumo.nombre : '',
        cantidad: parseFloat(d.cantidad || 0),
        unidadMedida: d.unidadMedida,
        precioUnitario: parseFloat(d.precioUnitario || 0),
        subtotal: parseFloat(d.cantidad || 0) * parseFloat(d.precioUnitario || 0)
      })) : [];

      return {
        id: p.id,
        nombre: p.nombre,
        descripcion: p.descripcion || '',
        unidadMedida: p.unidadMedida || 'und',
        estado: p.estado,
        rendimiento: parseFloat(p.rendimiento || 1),
        unidadRendimiento: p.unidadRendimiento || 'und',
        precioVenta: parseFloat(p.precioVenta || 0),
        costoTotal: parseFloat(p.costoTotal || 0),
        fechaCreacion: p.fechaCreacion,
        insumos,
        componentes: insumos
      };
    });
  }

  static async getById(id) {
    await ensureInsumoPaqueteSchemaOnce();
    const p = await InsumoPreparado.findByPk(id, {
      include: [
        {
          model: DetalleInsumoPreparadoInsumo,
          as: 'detalles',
          include: [{ model: Insumo, as: 'insumo' }]
        },
        {
          model: FichaTecnica,
          as: 'fichaTecnica',
          required: false,
          where: { estado: 1 },
          include: [
              {
                model: DetalleFichaInsumo,
                as: 'detalles',
                include: [{ model: Insumo, as: 'insumo', attributes: ['idInsumo', 'nombre', 'unidadMedida', 'precioUnitario'] }]
              }
          ]
        }
      ]
    });

    if (!p) {
      const error = new Error('Insumo preparado no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const todayCol = getColombiaDateISO();
    const insumoIds = (p.detalles || []).map(d => Number(d.idInsumo)).filter(Boolean);
    const lotesRows = insumoIds.length > 0
      ? await LoteInsumo.findAll({
          attributes: ['idLote', 'idInsumo', 'cantidad', 'cantidadDisponible', 'fechaVencimiento', 'estado'],
          where: { idInsumo: insumoIds, estado: { [Op.ne]: 'AGOTADO' } },
          raw: true
        }).catch(() => [])
      : [];
    const lotesByInsumo = groupLotesByInsumo(lotesRows);

    let calcCosto = 0;
    let minPorciones = Infinity;
    let hasUnlimitedOnly = false;

    const insumos = p.detalles ? p.detalles.map(d => {
      const cant = parseFloat(d.cantidad || 0);
      const pUnit = parseFloat(d.precioUnitario !== undefined && d.precioUnitario !== null && d.precioUnitario > 0
        ? d.precioUnitario
        : (d.insumo?.precioUnitario || 0));
      const sub = cant * pUnit;
      calcCosto += sub;

      if (d.insumo && cant > 0) {
        const breakdown = computeInsumoStockBreakdown(
          d.insumo,
          lotesByInsumo.get(Number(d.insumo.idInsumo)) || [],
          todayCol
        );
        if (breakdown.isInactive) {
          minPorciones = 0;
        } else if (!breakdown.controlarStock) {
          hasUnlimitedOnly = true;
        } else {
          const cantConvertida = convertPrepUnits(cant, d.unidadMedida || d.insumo.unidadMedida, d.insumo.unidadMedida, d.insumo);
          if (cantConvertida > 0) {
            minPorciones = Math.min(minPorciones, Math.floor(breakdown.stockVigente / cantConvertida));
          }
        }
      }

      return {
        idDetalle: d.idDetalle,
        idInsumo: d.idInsumo,
        insumoNombre: d.insumo ? d.insumo.nombre : '',
        cantidad: cant,
        unidadMedida: d.unidadMedida,
        precioUnitario: pUnit,
        subtotal: sub
      };
    }) : [];

    const finalCosto = parseFloat(p.costoTotal || 0) > 0 ? parseFloat(p.costoTotal) : calcCosto;
    const rend = parseFloat(p.rendimiento || 1);
    const stockDisponible = minPorciones !== Infinity
      ? (minPorciones * rend)
      : (hasUnlimitedOnly ? (99 * rend) : 0);

    return {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || '',
      unidadMedida: p.unidadMedida || 'und',
      estado: p.estado,
      rendimiento: rend,
      unidadRendimiento: p.unidadRendimiento || 'und',
      precioVenta: parseFloat(p.precioVenta || 0),
      costoTotal: finalCosto,
      esAdicion: p.esAdicion ? 1 : 0,
      precioAdicion: parseFloat(p.precioAdicion || 0),
      imagen: p.imagen || '',
      porcionMinimaCantidad: p.porcionMinimaCantidad !== null && p.porcionMinimaCantidad !== undefined ? parseFloat(p.porcionMinimaCantidad) : null,
      porcionMinimaUnidad: p.porcionMinimaUnidad || null,
      stock: p.estado === 0 ? 0 : stockDisponible,
      fechaCreacion: p.fechaCreacion,
      insumos,
      componentes: insumos,
      fichaTecnica: p.fichaTecnica || null
    };
  }

  static async create(data) {
    await ensureInsumoPaqueteSchemaOnce();
    const {
      nombre, descripcion, unidadMedida, rendimiento, unidadRendimiento, precioVenta,
      insumos, componentes, costoTotal: inputCosto, estado, fichaTecnica,
      esAdicion, precioAdicion, imagen, porcionMinimaCantidad, porcionMinimaUnidad
    } = data;
    if (!nombre) {
      const error = new Error('El nombre del insumo preparado es requerido');
      error.statusCode = 400;
      throw error;
    }

    validatePrepUnit(unidadMedida);

    // Validar que la ficha técnica sea obligatoria al crear
    if (!fichaTecnica) {
      const error = new Error('La ficha técnica es obligatoria para crear un insumo preparado. Por favor completa todos los campos de la ficha técnica.');
      error.statusCode = 400;
      throw error;
    }

    const ftIngredientes = fichaTecnica.detalles || fichaTecnica.insumos || fichaTecnica.ingredientes || [];
    const camposFaltantes = [];
    if (!ftIngredientes || ftIngredientes.length === 0) camposFaltantes.push('Ingredientes');
    if (!fichaTecnica.procedimiento || !String(fichaTecnica.procedimiento).trim()) camposFaltantes.push('Procedimiento');
    if (!fichaTecnica.tiempoPreparacion || Number(fichaTecnica.tiempoPreparacion) < 1) camposFaltantes.push('Tiempo de Preparación');
    if (!fichaTecnica.rendimiento || !String(fichaTecnica.rendimiento).trim()) camposFaltantes.push('Rendimiento');
    if (!fichaTecnica.condicionesAlmacenamiento || !String(fichaTecnica.condicionesAlmacenamiento).trim()) camposFaltantes.push('Condiciones de Almacenamiento');
    if (!fichaTecnica.vidaUtil || !String(fichaTecnica.vidaUtil).trim()) camposFaltantes.push('Vida Útil');
    if (!fichaTecnica.especificaciones || !String(fichaTecnica.especificaciones).trim()) camposFaltantes.push('Especificaciones');
    if (!fichaTecnica.caracteristicas || !String(fichaTecnica.caracteristicas).trim()) camposFaltantes.push('Características Organolépticas');
    if (!fichaTecnica.informacionNutricional || !String(fichaTecnica.informacionNutricional).trim()) camposFaltantes.push('Información Nutricional');

    if (camposFaltantes.length > 0) {
      const error = new Error(`Ficha técnica incompleta. Campos faltantes: ${camposFaltantes.join(', ')}`);
      error.statusCode = 400;
      throw error;
    }

    const itemsList = insumos || componentes || [];
    validatePrepIngredients(itemsList);
    validatePrepIngredients(ftIngredientes);
    let costoTotal = 0;
    itemsList.forEach(item => {
      costoTotal += parseFloat(item.cantidad || 0) * parseFloat(item.precioUnitario || 0);
    });

    if (inputCosto !== undefined && inputCosto !== null && parseFloat(inputCosto) > 0) {
      costoTotal = parseFloat(inputCosto) || 0;
    }

    const estadoNum = (estado === 'Inactivo' || estado === 0 || estado === '0') ? 0 : 1;

    const preparado = await InsumoPreparado.create({
      nombre,
      descripcion: descripcion || '',
      unidadMedida: unidadMedida || 'und',
      estado: estadoNum,
      rendimiento: rendimiento || 1,
      unidadRendimiento: unidadRendimiento || 'und',
      precioVenta: precioVenta || 0,
      costoTotal,
      esAdicion: esAdicion ? 1 : 0,
      precioAdicion: precioAdicion !== undefined && precioAdicion !== null ? parseFloat(precioAdicion) : 0,
      imagen: imagen || null,
      porcionMinimaCantidad: porcionMinimaCantidad !== undefined && porcionMinimaCantidad !== null && porcionMinimaCantidad !== '' ? parseFloat(porcionMinimaCantidad) : null,
      porcionMinimaUnidad: porcionMinimaUnidad || null,
      fechaCreacion: new Date()
    });

    for (const item of itemsList) {
      await DetalleInsumoPreparadoInsumo.create({
        idPreparado: preparado.id,
        idInsumo: item.idInsumo,
        cantidad: item.cantidad,
        unidadMedida: item.unidadMedida || 'und',
        precioUnitario: item.precioUnitario || 0
      });
    }

    if (fichaTecnica) {
      const FichaTecnicaService = require('./fichaTecnicaService');
      await FichaTecnicaService.saveForInsumoPreparado(preparado.id, fichaTecnica, {
        skipSyncPreparadoDetalles: itemsList.length > 0
      });
    }

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Creado',
      entidadNombre: preparado.nombre,
      detalle: `Se creó el insumo preparado: ${preparado.nombre}`,
      motivo: 'Registro inicial de insumo preparado',
      skipStockUpdate: true
    }).catch(() => {});

    return this.getById(preparado.id);
  }

  static async update(id, data) {
    await ensureInsumoPaqueteSchemaOnce();
    const p = await InsumoPreparado.findByPk(id);
    if (!p) {
      const error = new Error('Insumo preparado no encontrado');
      error.statusCode = 404;
      throw error;
    }

    const {
      nombre, descripcion, unidadMedida, rendimiento, unidadRendimiento, precioVenta,
      insumos, componentes, costoTotal: inputCosto, estado, fichaTecnica,
      esAdicion, precioAdicion, imagen, porcionMinimaCantidad, porcionMinimaUnidad
    } = data;

    if (unidadMedida !== undefined) {
      validatePrepUnit(unidadMedida);
      p.unidadMedida = unidadMedida;
    }
    if (nombre !== undefined) p.nombre = nombre;
    if (descripcion !== undefined) p.descripcion = descripcion;
    if (rendimiento !== undefined) p.rendimiento = rendimiento;
    if (unidadRendimiento !== undefined) p.unidadRendimiento = unidadRendimiento;
    if (precioVenta !== undefined) p.precioVenta = precioVenta;
    if (esAdicion !== undefined) p.esAdicion = esAdicion ? 1 : 0;
    if (precioAdicion !== undefined) p.precioAdicion = parseFloat(precioAdicion || 0);
    if (imagen !== undefined) p.imagen = imagen || null;
    if (porcionMinimaCantidad !== undefined) {
      p.porcionMinimaCantidad = porcionMinimaCantidad !== null && porcionMinimaCantidad !== '' ? parseFloat(porcionMinimaCantidad) : null;
    }
    if (porcionMinimaUnidad !== undefined) p.porcionMinimaUnidad = porcionMinimaUnidad || null;
    if (estado !== undefined) {
      p.estado = (estado === 'Activo' || estado === 1 || estado === '1') ? 1 : 0;
    }

    const itemsList = insumos || componentes;
    if (itemsList && Array.isArray(itemsList)) {
      validatePrepIngredients(itemsList);
      const insumoIds = itemsList
        .map(item => Number(item.idInsumo || item.id))
        .filter(n => Number.isFinite(n) && n > 0);
      const dbInsumos = insumoIds.length > 0 && typeof Insumo.findAll === 'function'
        ? await Insumo.findAll({
            where: { idInsumo: insumoIds },
            attributes: ['idInsumo', 'precioUnitario'],
            raw: true
          }).catch(() => [])
        : [];
      const priceMap = new Map(
        dbInsumos.map(row => [Number(row.idInsumo), parseFloat(row.precioUnitario || 0)])
      );

      let costoTotal = 0;
      const resolvedItems = itemsList.map(item => {
        const insId = Number(item.idInsumo || item.id);
        const cant = parseFloat(item.cantidad || 0);
        const rawPrice = parseFloat(item.precioUnitario || 0);
        const resolvedPrice = rawPrice > 0 ? rawPrice : (priceMap.get(insId) || 0);
        costoTotal += cant * resolvedPrice;
        return {
          idPreparado: id,
          idInsumo: insId,
          cantidad: item.cantidad,
          unidadMedida: item.unidadMedida || 'und',
          precioUnitario: resolvedPrice
        };
      });

      if (costoTotal > 0) {
        p.costoTotal = costoTotal;
      } else if (inputCosto && parseFloat(inputCosto) > 0) {
        p.costoTotal = parseFloat(inputCosto);
      }

      await DetalleInsumoPreparadoInsumo.destroy({ where: { idPreparado: id } });
      for (const item of resolvedItems) {
        await DetalleInsumoPreparadoInsumo.create(item);
      }
    }

    await p.save();

    if (fichaTecnica) {
      const FichaTecnicaService = require('./fichaTecnicaService');
      await FichaTecnicaService.saveForInsumoPreparado(id, fichaTecnica, {
        skipSyncPreparadoDetalles: Array.isArray(itemsList) && itemsList.length > 0
      });
    }

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Editado',
      entidadNombre: p.nombre,
      detalle: `Se actualizaron los datos del insumo preparado: ${p.nombre}`,
      motivo: 'Actualización de insumo preparado',
      skipStockUpdate: true
    }).catch(() => {});

    return this.getById(id);
  }

  static async softDelete(id) {
    const p = await InsumoPreparado.findByPk(id);
    if (!p) {
      const error = new Error('Insumo preparado no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (Number(p.stock || 0) > 0) {
      const error = new Error(`No se puede eliminar el insumo preparado "${p.nombre}" porque cuenta con un stock activo de ${p.stock} ${p.unidadMedida || 'und'}. Para eliminarlo, su stock debe ser 0.`);
      error.statusCode = 400;
      throw error;
    }

    p.eliminado = 1;
    await p.save();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Eliminado',
      entidadNombre: p.nombre,
      detalle: `Se movió a la papelera el insumo preparado: ${p.nombre}`,
      motivo: 'Envío a papelera de preparado',
      skipStockUpdate: true
    }).catch(() => {});

    return { message: 'Insumo preparado movido a la papelera' };
  }

  static async restore(id) {
    const p = await InsumoPreparado.findByPk(id);
    if (!p) {
      const error = new Error('Insumo preparado no encontrado');
      error.statusCode = 404;
      throw error;
    }

    p.eliminado = 0;
    await p.save();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Restaurado',
      entidadNombre: p.nombre,
      detalle: `Se restauró el insumo preparado: ${p.nombre}`,
      motivo: 'Restauración desde papelera de preparado',
      skipStockUpdate: true
    }).catch(() => {});

    return this.getById(id);
  }

  static async hardDelete(id) {
    const p = await InsumoPreparado.findByPk(id);
    if (!p) {
      const error = new Error('Insumo preparado no encontrado');
      error.statusCode = 404;
      throw error;
    }

    if (Number(p.stock || 0) > 0) {
      const error = new Error(`No se puede eliminar definitivamente el insumo preparado "${p.nombre}" porque cuenta con un stock activo de ${p.stock} ${p.unidadMedida || 'und'}.`);
      error.statusCode = 400;
      throw error;
    }

    const nombrePreparado = p.nombre;

    await DetalleInsumoPreparadoInsumo.destroy({ where: { idPreparado: id } });
    await p.destroy();

    const TrazabilidadService = require('./trazabilidadService');
    await TrazabilidadService.create({
      tipo: 'Eliminado permanente',
      entidadNombre: nombrePreparado,
      detalle: `Se eliminó permanentemente el insumo preparado: ${nombrePreparado}`,
      motivo: 'Eliminación física definitiva de preparado',
      skipStockUpdate: true
    }).catch(() => {});

    const count = await InsumoPreparado.count();
    if (count === 0) {
      const connectDB = require('../../persistence/config/db');
      await connectDB.sequelize.query('ALTER TABLE `insumopreparado` AUTO_INCREMENT = 1;');
    }

    return { message: 'Insumo preparado eliminado físicamente' };
  }
}

module.exports = InsumoPreparadoService;
