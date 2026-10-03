/**
 * Money / date / status formatting helpers (SPEC §0, §2.2, §5).
 * All money goes through Intl.NumberFormat('en-IN') with ₹ as the default symbol.
 */

export const CURRENCY_OPTIONS = [
  { code: 'INR', symbol: '₹', label: 'INR ₹' },
  { code: 'USD', symbol: '$', label: 'USD $' },
  { code: 'EUR', symbol: '€', label: 'EUR €' },
  { code: 'GBP', symbol: '£', label: 'GBP £' },
  { code: 'AED', symbol: 'د.إ', label: 'AED د.إ' },
  { code: 'JPY', symbol: '¥', label: 'JPY ¥' },
];

const formatterCache = new Map();

function getFormatter(currency) {
  const code = currency || 'INR';
  if (!formatterCache.has(code)) {
    let fmt;
    try {
      fmt = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    } catch {
      fmt = new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      });
    }
    formatterCache.set(code, fmt);
  }
  return formatterCache.get(code);
}

/** ₹8,450 / ₹1,20,000 / ₹500.50 — Indian grouping, currency from settings. */
export function formatMoney(amount, currency) {
  const n = Number(amount);
  return getFormatter(currency).format(Number.isFinite(n) ? n : 0);
}

/** '-₹200' for money out, '+₹500' for money in. */
export function formatSignedMoney(amount, direction, currency) {
  const sign = direction === 'out' ? '-' : '+';
  return `${sign}${formatMoney(Math.abs(amount), currency)}`;
}

/** Currency symbol only (₹). */
export function currencySymbol(currency) {
  const opt = CURRENCY_OPTIONS.find((c) => c.code === (currency || 'INR'));
  if (opt) return opt.symbol;
  try {
    return (
      new Intl.NumberFormat('en-IN', { style: 'currency', currency: currency || 'INR' })
        .formatToParts(0)
        .find((p) => p.type === 'currency')?.value || '₹'
    );
  } catch {
    return '₹';
  }
}

/** Local calendar date as YYYY-MM-DD (never uses UTC — avoids off-by-one). */
export function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseISODate(value) {
  const s = String(value || '').slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** '02 Oct 2026' */
export function formatDate(value) {
  const d = parseISODate(value);
  if (!d) return String(value || '');
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(d);
}

/** 'Friday, 2 October 2026' */
export function formatDateLong(value) {
  const d = parseISODate(value);
  if (!d) return String(value || '');
  return new Intl.DateTimeFormat('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d);
}

/** 'Mon, 5 Oct' — used in chart axes. */
export function formatDayShort(value) {
  const d = parseISODate(value);
  if (!d) return String(value || '');
  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric' }).format(d);
}

/** '7:45 PM' from an ISO timestamp (local time). */
export function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(d);
}

/** Fraction (0.916) → '91.6%' */
export function percent(fraction, digits = 1) {
  const n = Number(fraction);
  if (!Number.isFinite(n)) return '0%';
  const v = n * 100;
  const rounded = Number(v.toFixed(digits));
  return `${rounded}%`;
}

/** SPEC §2.2 status → colors/labels/icons used across the app. */
const STATUS_META = {
  safe: { color: '#22c55e', label: 'Safe', icon: '🟢' },
  warning: { color: '#eab308', label: 'Warning', icon: '🟡' },
  near_limit: { color: '#f97316', label: 'Near Limit', icon: '🟠' },
  exceeded: { color: '#ef4444', label: 'Limit Exceeded', icon: '🔴' },
  none: { color: '#94a3b8', label: 'No limit', icon: '⚪' },
};

export function statusMeta(status) {
  return STATUS_META[status] || STATUS_META.none;
}

export const DAILY_STATUS_COLORS = {
  safe: '#22c55e',
  warning: '#eab308',
  near_limit: '#f97316',
  exceeded: '#ef4444',
  none: '#e2e8f0',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** month: 1-12 → 'October 2026' */
export function monthLabel(year, month) {
  return `${MONTH_NAMES[Number(month) - 1] || ''} ${year}`.trim();
}

export function monthShort(month) {
  return MONTH_NAMES[Number(month) - 1] || '';
}

export function daysInMonth(year, month) {
  return new Date(Number(year), Number(month), 0).getDate();
}

/** 'overdue' | 'due_today' | 'due_soon' | 'upcoming' relative to today. */
export function dueTone(dueDate) {
  if (!dueDate) return 'upcoming';
  const t = parseISODate(todayISO());
  const d = parseISODate(dueDate);
  if (!d) return 'upcoming';
  const diff = Math.round((d - t) / 86400000);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= 7) return 'due_soon';
  return 'upcoming';
}

/** 'money_to_receive' → 'Money To Receive' (label helper for generic maps). */
export function sentenceCase(key) {
  const s = String(key || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]/g, ' ')
    .trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export function classNames(...parts) {
  return parts.filter(Boolean).join(' ');
}
