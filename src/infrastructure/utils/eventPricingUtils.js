/**
 * Resuelve el precio promocional vigente de un evento para un producto específico.
 *
 * Regla clave para eventos multi-producto (ej. "Super Fin de Semana Chazin (15% OFF)"):
 * - `evento.nuevoPrecio` pertenece ÚNICAMENTE al producto principal (`evento.idProducto`)
 *   y NUNCA debe sobreescribir el precio de otros productos en `evento.productosAsociados`.
 * - Para variantes personalizadas con precio distinto al base del producto, se aplica
 *   el porcentaje de descuento (`descuento`) o el ahorro fijo equivalente, en lugar de
 *   aplastar el precio de la variante con el precio promocional de la presentación base.
 */
function parseProductosAsociados(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }
  return [];
}

function resolveEventUnitPriceForProduct({ evento, idProducto, precioBase, prodBasePrice = null }) {
  if (!evento || !idProducto || !(Number(precioBase) > 0)) return null;

  const base = Number(precioBase);
  const catalogProdBase = Number(prodBasePrice || 0);
  const isCustomPricedVariant = catalogProdBase > 0 && Math.abs(base - catalogProdBase) > 0.01;

  const asociados = parseProductosAsociados(evento.productosAsociados);
  const match = asociados.find(
    (p) => p && Number(p.idProducto ?? p.id) === Number(idProducto)
  ) || null;
  const isPrimaryProduct = Number(evento.idProducto) === Number(idProducto);

  if (!match && !isPrimaryProduct) return null;

  if (match) {
    const matchDescuento = Number(match.descuento ?? evento.descuento ?? 0);
    const matchNuevoPrecio = Number(match.precioPromocional || match.nuevoPrecio || 0);

    if (isCustomPricedVariant) {
      if (Number.isFinite(matchDescuento) && matchDescuento > 0 && matchDescuento < 100) {
        return Math.max(0, Math.round(base * (1 - matchDescuento / 100)));
      }
      if (matchNuevoPrecio > 0 && catalogProdBase > 0 && matchNuevoPrecio < catalogProdBase) {
        const savings = catalogProdBase - matchNuevoPrecio;
        return Math.max(0, Math.round(base - savings));
      }
      return null;
    }

    if (matchNuevoPrecio > 0) {
      return Math.round(matchNuevoPrecio);
    }
    if (Number.isFinite(matchDescuento) && matchDescuento > 0 && matchDescuento < 100) {
      return Math.max(0, Math.round(base * (1 - matchDescuento / 100)));
    }
    if (isPrimaryProduct && Number(evento.nuevoPrecio) > 0) {
      return Math.round(Number(evento.nuevoPrecio));
    }
    return null;
  }

  // Solo producto principal sin entrada en productosAsociados
  const evDescuento = Number(evento.descuento || 0);
  const evNuevoPrecio = Number(evento.nuevoPrecio || 0);

  if (isCustomPricedVariant) {
    if (Number.isFinite(evDescuento) && evDescuento > 0 && evDescuento < 100) {
      return Math.max(0, Math.round(base * (1 - evDescuento / 100)));
    }
    if (evNuevoPrecio > 0 && catalogProdBase > 0 && evNuevoPrecio < catalogProdBase) {
      const savings = catalogProdBase - evNuevoPrecio;
      return Math.max(0, Math.round(base - savings));
    }
    return null;
  }

  if (evNuevoPrecio > 0) {
    return Math.round(evNuevoPrecio);
  }
  if (Number.isFinite(evDescuento) && evDescuento > 0 && evDescuento < 100) {
    return Math.max(0, Math.round(base * (1 - evDescuento / 100)));
  }
  return null;
}

function resolveBestEventUnitPrice({ eventosVigentes = [], idProducto, precioBase, prodBasePrice = null }) {
  let best = Number(precioBase) || 0;
  if (!Array.isArray(eventosVigentes) || eventosVigentes.length === 0 || !(best > 0)) {
    return Math.round(best);
  }

  for (const evento of eventosVigentes) {
    const candidate = resolveEventUnitPriceForProduct({
      evento,
      idProducto,
      precioBase: Number(precioBase),
      prodBasePrice
    });
    if (candidate !== null && candidate > 0 && candidate < best) {
      best = candidate;
    }
  }
  return Math.round(best);
}

module.exports = {
  parseProductosAsociados,
  resolveEventUnitPriceForProduct,
  resolveBestEventUnitPrice
};
