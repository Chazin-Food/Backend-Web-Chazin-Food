/**
 * Utilidades de paginación retrocompatible y sanitización de nombres cortos para Chazin Food Backend.
 *
 * Contrato retrocompatible:
 * - Si el cliente pasa `page` o `limit` en query string -> responde `{ data, pagination: { total, page, limit, totalPages, hasNext, hasPrev } }`.
 * - Si el cliente omite ambos (`page` y `limit`) -> responde el arreglo plano `[...]` para mantener 100% compatibilidad con exportaciones, selects y clientes existentes.
 */

function parsePaginationParams(query = {}, { defaultLimit = 5, maxLimit = 100 } = {}) {
  const hasPage = query.page !== undefined && query.page !== null && String(query.page).trim() !== '';
  const hasLimit = query.limit !== undefined && query.limit !== null && String(query.limit).trim() !== '';
  const isPaginated = hasPage || hasLimit;

  const rawPage = parseInt(query.page, 10);
  const rawLimit = parseInt(query.limit, 10);

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0
    ? Math.min(maxLimit, rawLimit)
    : defaultLimit;
  const offset = (page - 1) * limit;

  return { isPaginated, page, limit, offset };
}

function buildPaginatedResponse(data = [], total = 0, page = 1, limit = 5) {
  const safeTotal = Math.max(0, Number(total) || 0);
  const safeLimit = Math.max(1, Number(limit) || 5);
  const totalPages = Math.max(1, Math.ceil(safeTotal / safeLimit));
  const safePage = Math.min(Math.max(1, Number(page) || 1), totalPages);

  return {
    data: Array.isArray(data) ? data : [],
    pagination: {
      total: safeTotal,
      page: safePage,
      limit: safeLimit,
      totalPages,
      hasNext: safePage < totalPages,
      hasPrev: safePage > 1
    }
  };
}

function sanitizeShortName(rawValue, maxLen = 80) {
  if (rawValue === undefined || rawValue === null) return '';
  const normalized = String(rawValue)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalized.length > maxLen ? normalized.slice(0, maxLen).trim() : normalized;
}

module.exports = {
  parsePaginationParams,
  buildPaginatedResponse,
  sanitizeShortName
};
