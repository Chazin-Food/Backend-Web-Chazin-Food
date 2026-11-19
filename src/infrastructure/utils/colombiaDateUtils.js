/**
 * Utilidad centralizada de fechas y rangos horarios para Colombia (America/Bogota, UTC-5 sin DST).
 * Evita desfases de -1 día en columnas DATEONLY y saltos al día siguiente después de las 7:00 PM Colombia.
 */

const COLOMBIA_TZ = 'America/Bogota';
const COLOMBIA_OFFSET = '-05:00';
const MS_PER_DAY = 86400000;

const WEEKDAY_MAP = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

/**
 * Devuelve la fecha calendario actual (o de un Date/timestamp) en Colombia como 'YYYY-MM-DD'.
 */
function getColombiaDateISO(date = new Date()) {
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date.trim())) {
    return date.trim();
  }
  const d = date instanceof Date ? date : new Date(date);
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: COLOMBIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(safeDate);
}

/**
 * Extrae 'YYYY-MM-DD' de forma segura desde strings DATEONLY, ISO strings o Date.
 * Devuelve null si el valor no es una fecha válida.
 */
function extractDateOnlyISO(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? null : getColombiaDateISO(value);
  }
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s;
  }
  // Fecha con hora local sin zona (ej. '2026-11-19T00:00:00' o '2026-11-19 14:30:00')
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(s)) {
    return s.slice(0, 10);
  }
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return getColombiaDateISO(parsed);
  }
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

/**
 * Devuelve componentes calendario y hora exactos en America/Bogota.
 * month es 1..12; day es 1..31; hour es 0..23; dayOfWeek es 0 (Dom) .. 6 (Sáb).
 */
function getColombiaParts(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const safeDate = isNaN(d.getTime()) ? new Date() : d;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: COLOMBIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short'
  }).formatToParts(safeDate);

  const map = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }

  return {
    year: parseInt(map.year, 10),
    month: parseInt(map.month, 10),
    day: parseInt(map.day, 10),
    hour: parseInt(map.hour, 10) % 24,
    minute: parseInt(map.minute, 10),
    second: parseInt(map.second, 10),
    dayOfWeek: WEEKDAY_MAP[map.weekday] ?? 0
  };
}

function getColombiaYear(date = new Date()) {
  return getColombiaParts(date).year;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toISODate(year, month1Based, day) {
  return `${year}-${pad2(month1Based)}-${pad2(day)}`;
}

function getDaysInMonth(year, month1Based) {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate();
}

function shiftMonthYear(year, month1Based, deltaMonths) {
  const dt = new Date(Date.UTC(year, (month1Based - 1) + deltaMonths, 1));
  return {
    year: dt.getUTCFullYear(),
    month: dt.getUTCMonth() + 1
  };
}

/**
 * Inicio del día en Colombia (00:00:00.000-05:00) como objeto Date UTC.
 */
function colombiaStartOfDay(dateOrIso) {
  const iso = extractDateOnlyISO(dateOrIso);
  if (!iso) return null;
  return new Date(`${iso}T00:00:00.000${COLOMBIA_OFFSET}`);
}

/**
 * Fin del día en Colombia (23:59:59.999-05:00) como objeto Date UTC.
 */
function colombiaEndOfDay(dateOrIso) {
  const iso = extractDateOnlyISO(dateOrIso);
  if (!iso) return null;
  return new Date(`${iso}T23:59:59.999${COLOMBIA_OFFSET}`);
}

/**
 * Suma o resta días exactos a una fecha 'YYYY-MM-DD' sin drift por zona horaria.
 */
function addDaysColombiaISO(dateOrIso, deltaDays = 0) {
  const iso = extractDateOnlyISO(dateOrIso);
  if (!iso) return null;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Number(deltaDays || 0)));
  return dt.toISOString().slice(0, 10);
}

/**
 * Diferencia en días calendario exactos (target - base) en Colombia.
 * < 0 significa que target está en el pasado; 0 significa hoy; > 0 futuro.
 */
function diffCalendarDaysColombia(targetDateOrIso, baseDateOrIso = getColombiaDateISO()) {
  const targetISO = extractDateOnlyISO(targetDateOrIso);
  const baseISO = extractDateOnlyISO(baseDateOrIso);
  if (!targetISO || !baseISO) return null;
  const [ty, tm, td] = targetISO.split('-').map(Number);
  const [by, bm, bd] = baseISO.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(by, bm - 1, bd)) / MS_PER_DAY);
}

/**
 * Calcula rango de fechas [start, end] y su periodo anterior [prevStart, prevEnd]
 * en horario oficial de Colombia (America/Bogota). Fuente única para Dashboard y Ventas.
 */
function getColombiaPeriodRange(periodo = '', options = {}) {
  const {
    year: rawYearParam,
    startDate: rawStart,
    endDate: rawEnd,
    now = new Date()
  } = options || {};

  const parts = getColombiaParts(now);
  const todayISO = toISODate(parts.year, parts.month, parts.day);
  const p = String(periodo || '').toLowerCase().trim();

  const parsedYear = rawYearParam !== undefined && rawYearParam !== null && rawYearParam !== ''
    ? parseInt(rawYearParam, 10)
    : NaN;
  const targetYear = !isNaN(parsedYear) ? parsedYear : parts.year;

  let start = null;
  let end = null;
  let prevStart = null;
  let prevEnd = null;
  let labelVariacion = 'vs período anterior';
  let resolvedPeriod = p;

  const setCustomPrevIfBounded = () => {
    if (start && end) {
      const spanDays = Math.max(1, Math.round((end.getTime() - start.getTime() + 1) / MS_PER_DAY));
      const startISO = getColombiaDateISO(start);
      prevEnd = colombiaEndOfDay(addDaysColombiaISO(startISO, -1));
      prevStart = colombiaStartOfDay(addDaysColombiaISO(startISO, -spanDays));
    }
  };

  if (p === 'hoy') {
    start = colombiaStartOfDay(todayISO);
    end = colombiaEndOfDay(todayISO);
    const yesterdayISO = addDaysColombiaISO(todayISO, -1);
    prevStart = colombiaStartOfDay(yesterdayISO);
    prevEnd = colombiaEndOfDay(yesterdayISO);
    labelVariacion = 'vs ayer';
  } else if (p === 'ayer') {
    const yesterdayISO = addDaysColombiaISO(todayISO, -1);
    const prevISO = addDaysColombiaISO(todayISO, -2);
    start = colombiaStartOfDay(yesterdayISO);
    end = colombiaEndOfDay(yesterdayISO);
    prevStart = colombiaStartOfDay(prevISO);
    prevEnd = colombiaEndOfDay(prevISO);
    labelVariacion = 'vs anteayer';
  } else if (p === '7_dias' || p === '7dias' || p === 'ultima_semana' || p === 'semana') {
    // Exactamente 7 días calendario en Colombia: hoy-6 .. hoy
    start = colombiaStartOfDay(addDaysColombiaISO(todayISO, -6));
    end = colombiaEndOfDay(todayISO);
    prevStart = colombiaStartOfDay(addDaysColombiaISO(todayISO, -13));
    prevEnd = colombiaEndOfDay(addDaysColombiaISO(todayISO, -7));
    labelVariacion = 'vs 7 días ant.';
  } else if (p === 'este_mes' || p === 'mes' || p === 'mes_actual' || p === 'mes actual') {
    const lastDay = getDaysInMonth(parts.year, parts.month);
    start = colombiaStartOfDay(toISODate(parts.year, parts.month, 1));
    end = colombiaEndOfDay(toISODate(parts.year, parts.month, lastDay));
    const prevMY = shiftMonthYear(parts.year, parts.month, -1);
    prevStart = colombiaStartOfDay(toISODate(prevMY.year, prevMY.month, 1));
    prevEnd = colombiaEndOfDay(toISODate(prevMY.year, prevMY.month, getDaysInMonth(prevMY.year, prevMY.month)));
    labelVariacion = 'vs mes anterior';
  } else if (p === 'mes_anterior' || p === 'mes anterior') {
    const prevMY = shiftMonthYear(parts.year, parts.month, -1);
    start = colombiaStartOfDay(toISODate(prevMY.year, prevMY.month, 1));
    end = colombiaEndOfDay(toISODate(prevMY.year, prevMY.month, getDaysInMonth(prevMY.year, prevMY.month)));
    const prev2MY = shiftMonthYear(parts.year, parts.month, -2);
    prevStart = colombiaStartOfDay(toISODate(prev2MY.year, prev2MY.month, 1));
    prevEnd = colombiaEndOfDay(toISODate(prev2MY.year, prev2MY.month, getDaysInMonth(prev2MY.year, prev2MY.month)));
    labelVariacion = 'vs mes previo';
  } else if (p === 'ultimos_3_meses' || p === 'últimos 3 meses' || p === 'ultimos 3 meses' || p === '3_meses' || p === '3meses') {
    const mStart = shiftMonthYear(parts.year, parts.month, -2);
    start = colombiaStartOfDay(toISODate(mStart.year, mStart.month, 1));
    end = colombiaEndOfDay(todayISO);
    const prevMStart = shiftMonthYear(parts.year, parts.month, -5);
    const prevMEnd = shiftMonthYear(parts.year, parts.month, -3);
    prevStart = colombiaStartOfDay(toISODate(prevMStart.year, prevMStart.month, 1));
    prevEnd = colombiaEndOfDay(toISODate(prevMEnd.year, prevMEnd.month, getDaysInMonth(prevMEnd.year, prevMEnd.month)));
    labelVariacion = 'vs 3 meses ant.';
  } else if (p === 'ultimos_6_meses' || p === 'últimos 6 meses' || p === 'ultimos 6 meses' || p === '6_meses' || p === '6meses') {
    const mStart = shiftMonthYear(parts.year, parts.month, -5);
    start = colombiaStartOfDay(toISODate(mStart.year, mStart.month, 1));
    end = colombiaEndOfDay(todayISO);
    const prevMStart = shiftMonthYear(parts.year, parts.month, -11);
    const prevMEnd = shiftMonthYear(parts.year, parts.month, -6);
    prevStart = colombiaStartOfDay(toISODate(prevMStart.year, prevMStart.month, 1));
    prevEnd = colombiaEndOfDay(toISODate(prevMEnd.year, prevMEnd.month, getDaysInMonth(prevMEnd.year, prevMEnd.month)));
    labelVariacion = 'vs 6 meses ant.';
  } else if (p === 'este_ano' || p === 'año' || p === 'ano' || p === 'año actual' || p === 'ano actual' || p === 'ano_actual' || p === 'anual') {
    start = colombiaStartOfDay(`${targetYear}-01-01`);
    end = colombiaEndOfDay(`${targetYear}-12-31`);
    prevStart = colombiaStartOfDay(`${targetYear - 1}-01-01`);
    prevEnd = colombiaEndOfDay(`${targetYear - 1}-12-31`);
    labelVariacion = 'vs año anterior';
  } else if (p === 'ano_anterior' || p === 'año anterior' || p === 'ano anterior') {
    const prevTargetYear = targetYear - 1;
    start = colombiaStartOfDay(`${prevTargetYear}-01-01`);
    end = colombiaEndOfDay(`${prevTargetYear}-12-31`);
    prevStart = colombiaStartOfDay(`${prevTargetYear - 1}-01-01`);
    prevEnd = colombiaEndOfDay(`${prevTargetYear - 1}-12-31`);
    labelVariacion = `vs ${prevTargetYear - 1}`;
  } else if (p === 'todos' || p === 'historico' || p === 'all') {
    start = null;
    end = null;
    // Comparativa informativa de mes actual vs mes anterior para histórico general
    const curStart = colombiaStartOfDay(toISODate(parts.year, parts.month, 1));
    const curEnd = colombiaEndOfDay(todayISO);
    const prevMY = shiftMonthYear(parts.year, parts.month, -1);
    prevStart = colombiaStartOfDay(toISODate(prevMY.year, prevMY.month, 1));
    prevEnd = colombiaEndOfDay(toISODate(prevMY.year, prevMY.month, getDaysInMonth(prevMY.year, prevMY.month)));
    labelVariacion = 'vs mes anterior';
    return {
      start,
      end,
      prevStart,
      prevEnd,
      currentCompareStart: curStart,
      currentCompareEnd: curEnd,
      labelVariacion,
      todayISO,
      year: targetYear,
      currentYear: parts.year,
      month: parts.month,
      day: parts.day,
      periodo: p
    };
  } else if (rawStart || rawEnd) {
    start = rawStart ? colombiaStartOfDay(rawStart) : null;
    end = rawEnd ? colombiaEndOfDay(rawEnd) : null;
    setCustomPrevIfBounded();
    resolvedPeriod = 'personalizado';
  } else if (!isNaN(parsedYear)) {
    start = colombiaStartOfDay(`${parsedYear}-01-01`);
    end = colombiaEndOfDay(`${parsedYear}-12-31`);
    prevStart = colombiaStartOfDay(`${parsedYear - 1}-01-01`);
    prevEnd = colombiaEndOfDay(`${parsedYear - 1}-12-31`);
    labelVariacion = 'vs año anterior';
    resolvedPeriod = 'este_ano';
  }

  return {
    start,
    end,
    prevStart,
    prevEnd,
    labelVariacion,
    todayISO,
    year: targetYear,
    currentYear: parts.year,
    month: parts.month,
    day: parts.day,
    periodo: resolvedPeriod
  };
}

/**
 * Formatea una fecha como 'DD/MM/YYYY' en Colombia.
 * Maneja DATEONLY 'YYYY-MM-DD' sin provocar el bug de -1 día.
 */
function formatColombiaDateES(dateInput, fallback = '') {
  if (!dateInput) return fallback;
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed) || /^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(:\d{2})?(\.\d+)?$/.test(trimmed)) {
      const [y, m, d] = trimmed.slice(0, 10).split('-');
      return `${d}/${m}/${y}`;
    }
  }
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return fallback;
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: COLOMBIA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/**
 * Formatea fecha y hora en 24h 'DD/MM/YYYY HH:mm' en Colombia.
 */
function formatColombiaDateTime24(dateInput, fallback = '') {
  if (!dateInput) return fallback;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return fallback || String(dateInput);
  const p = getColombiaParts(d);
  return `${pad2(p.day)}/${pad2(p.month)}/${p.year} ${pad2(p.hour)}:${pad2(p.minute)}`;
}

/**
 * Formatea hora en formato 12h ('hh:mm AM/PM') en America/Bogota.
 */
function formatColombiaTime12(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: COLOMBIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  }).format(d);
}

/**
 * Formatea hora con segundos en formato 12h ('hh:mm:ss AM/PM') en America/Bogota.
 */
function formatColombiaTimeWithSeconds12(dateInput) {
  if (!dateInput) return null;
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    timeZone: COLOMBIA_TZ,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  }).format(d);
}

module.exports = {
  COLOMBIA_TZ,
  COLOMBIA_OFFSET,
  MS_PER_DAY,
  getColombiaDateISO,
  extractDateOnlyISO,
  getColombiaParts,
  getColombiaYear,
  colombiaStartOfDay,
  colombiaEndOfDay,
  addDaysColombiaISO,
  diffCalendarDaysColombia,
  getColombiaPeriodRange,
  getDaysInMonth,
  shiftMonthYear,
  formatColombiaDateES,
  formatColombiaDateTime24,
  formatColombiaTime12,
  formatColombiaTimeWithSeconds12
};
