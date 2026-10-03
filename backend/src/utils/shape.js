/** Row/shape helpers: SQLite returns snake_case, API returns camelCase. */

export function toCamel(key) {
  return key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

export function toSnake(key) {
  return key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

export function camelizeRow(row) {
  if (!row) return row;
  const out = {};
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v;
  return out;
}

export function camelizeRows(rows) {
  return (rows || []).map(camelizeRow);
}

/** Round to 2 decimals (money). */
export function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

/** Today's local calendar date as YYYY-MM-DD. */
export function today() {
  const d = new Date();
  return isoDate(d);
}

/** Local date → YYYY-MM-DD (NOT UTC — keeps "today" correct for the user). */
export function isoDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function daysInMonth(year, month /* 1-12 */) {
  return new Date(year, month, 0).getDate();
}

export function pad2(n) {
  return String(n).padStart(2, '0');
}
