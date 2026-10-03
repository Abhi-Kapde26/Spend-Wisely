import { HttpError } from '../middleware/error.js';
import { listCategories, createCategory } from '../repositories/categories.js';
import { createTransaction, existsDuplicate as txDuplicate } from '../repositories/transactions.js';
import {
  createBorrowLend, existsDuplicate as blDuplicate, findOldestOpenByPerson, syncStatus,
} from '../repositories/borrowLend.js';
import { createRepayment, existsDuplicate as repDuplicate } from '../repositories/repayments.js';
import { transaction } from '../db/index.js';
import { round2, pad2 } from '../utils/shape.js';

/**
 * SPEC §3.12 — import rows from a published Google Sheet (CSV) or an uploaded CSV.
 * SQLite stays the source of truth; the sheet is only an input.
 */

const MAX_CSV_BYTES = 5 * 1024 * 1024;

/* ------------------------------------------------------------------ */
/* 1. URL handling (allowlist → SSRF guard)                            */
/* ------------------------------------------------------------------ */

export function toCsvUrl(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    throw new HttpError(400, 'That does not look like a valid URL');
  }
  if (u.protocol !== 'https:') throw new HttpError(400, 'Only https:// links are supported');

  const host = u.hostname.toLowerCase();
  const allowed = host === 'docs.google.com'
    || host.endsWith('.googleusercontent.com')
    || host === 'googleusercontent.com';
  if (!allowed) throw new HttpError(400, 'Only published Google Sheets links are supported (docs.google.com)');

  const path = u.pathname;
  const gid = u.searchParams.get('gid');

  // Published-to-web link (…/d/e/<key>/pub?output=csv)
  const pub = path.match(/\/spreadsheets\/d\/e\/([A-Za-z0-9-_]+)/);
  if (pub) {
    return `https://docs.google.com/spreadsheets/d/e/${pub[1]}/pub?output=csv${gid ? `&gid=${gid}&single=true` : ''}`;
  }
  // Normal editor link (…/d/<id>/edit) — export via gviz (needs "anyone with link" access)
  const std = path.match(/\/spreadsheets\/d\/([A-Za-z0-9-_]+)/);
  if (std && std[1] !== 'e') {
    return `https://docs.google.com/spreadsheets/d/${std[1]}/gviz/tq?tqx=out:csv${gid ? `&gid=${gid}` : ''}`;
  }
  if (host.endsWith('googleusercontent.com')) return u.toString();

  throw new HttpError(400, 'That does not look like a Google Sheets link');
}

async function fetchSheet(rawUrl) {
  const csvUrl = toCsvUrl(rawUrl);
  let res;
  try {
    res = await fetch(csvUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
      headers: { Accept: 'text/csv,*/*' },
    });
  } catch (err) {
    if (err?.name === 'TimeoutError') throw new HttpError(504, 'The sheet took too long to respond');
    throw new HttpError(502, 'Could not reach Google Sheets — check your internet connection');
  }
  if (res.status === 404) {
    throw new HttpError(404, 'Sheet not found — check the link, and publish it (File → Share → Publish to web)');
  }
  if (!res.ok) throw new HttpError(502, `Google Sheets returned an error (HTTP ${res.status})`);

  const text = await res.text();
  if (!text.trim()) throw new HttpError(400, 'Sheet is empty — add rows first');
  if (text.length > MAX_CSV_BYTES) throw new HttpError(413, 'Sheet is too large to import (5 MB max)');
  return text;
}

/* ------------------------------------------------------------------ */
/* 2. CSV parsing (RFC 4180: quotes, escaped quotes, CRLF, BOM)        */
/* ------------------------------------------------------------------ */

export function parseCsv(input) {
  let text = String(input ?? '');
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') { inQuotes = true; continue; }
    if (c === ',') { row.push(field); field = ''; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
    field += c;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/* ------------------------------------------------------------------ */
/* 3. Header mapping                                                    */
/* ------------------------------------------------------------------ */

const ALIASES = {
  date: ['date', 'day', 'txndate', 'transactiondate', 'dated', 'tanggal'],
  type: ['type', 'kind', 'txntype', 'transactiontype', 'categorytype'],
  amount: ['amount', 'amt', 'value', 'money', 'sum', 'price', 'rs'],
  category: ['category', 'cat', 'label', 'tag', 'categoryperson', 'head', 'group'],
  person: ['person', 'name', 'party', 'contact', 'counterparty', 'paidto', 'paidfrom', 'borrower', 'lender'],
  comment: ['comment', 'note', 'notes', 'description', 'remark', 'remarks', 'details', 'narration', 'memo', 'for'],
  direction: ['direction', 'inout', 'flow', 'io'],
  balance: ['balance', 'closingbalance', 'runningbalance'],
};

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');

function mapHeaders(headerRow) {
  const mapping = { date: null, type: null, amount: null, category: null, person: null, comment: null, direction: null, balance: null };
  const byNorm = headerRow.map((h) => norm(h));

  for (const [field, aliases] of Object.entries(ALIASES)) {
    // exact-normalised match first, then "contains" match (e.g. "Amount (₹)")
    let idx = byNorm.findIndex((h) => h && aliases.includes(h));
    if (idx === -1) idx = byNorm.findIndex((h) => h && aliases.some((a) => h.includes(a) && a.length > 2));
    if (idx !== -1) mapping[field] = headerRow[idx];
  }
  return mapping;
}

function colIndex(headerRow, columnName) {
  if (!columnName) return -1;
  return headerRow.findIndex((h) => h === columnName);
}

/* ------------------------------------------------------------------ */
/* 4. Cell parsers                                                      */
/* ------------------------------------------------------------------ */

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseDateCell(raw) {
  const s = String(raw ?? '').trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);           // 2026-10-02 / 2026/10/02
  if (m) return validDate(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);            // 02/10/2026, 02-10-26
  if (m) {
    let a = +m[1];
    let b = +m[2];
    let y = +m[3];
    if (y < 100) y += 2000;
    let day; let month;
    if (a > 12 && b <= 12) { day = a; month = b; }                   // clearly DD/MM
    else if (b > 12 && a <= 12) { month = a; day = b; }              // clearly MM/DD
    else { day = a; month = b; }                                     // ambiguous → DD/MM (INR default)
    return validDate(y, month, day);
  }

  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3,})[\s-](\d{4})/);         // 02 Oct 2026
  if (m) {
    const month = MONTHS[m[2].slice(0, 3).toLowerCase()];
    if (month) return validDate(+m[3], month, +m[1]);
  }

  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{4})/);           // Oct 2, 2026
  if (m) {
    const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
    if (month) return validDate(+m[3], month, +m[2]);
  }
  return null;
}

function validDate(y, m, d) {
  if (!(y >= 2000 && y <= 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null; // e.g. 31 Feb
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

export function parseAmountCell(raw) {
  let s = String(raw ?? '').trim();
  if (!s) return null;

  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }        // (500) accounting negative
  s = s.replace(/[₹\u20b9]/g, '').replace(/\b(rs|inr)\.?\b/gi, '').replace(/,/g, '').replace(/\s/g, '');
  if (s.startsWith('-')) { neg = true; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}

const EXPLICIT_TYPES = new Map([
  ['income', 'income'], ['in', 'income'], ['credit', 'income'], ['money in', 'income'], ['received', 'income'],
  ['expense', 'expense'], ['out', 'expense'], ['debit', 'expense'], ['spend', 'expense'], ['spent', 'expense'],
  ['money out', 'expense'], ['paid', 'expense'], ['expense ', 'expense'],
  ['borrow', 'borrow'], ['borrowed', 'borrow'], ['lend', 'lend'], ['lent', 'lend'], ['loan', 'lend'],
  ['repayment', 'repayment'], ['repay', 'repayment'], ['payment', 'repayment'],
]);

function resolveType(rawType, rawDirection) {
  const t = String(rawType ?? '').trim().toLowerCase();
  if (EXPLICIT_TYPES.has(t)) return { type: EXPLICIT_TYPES.get(t), explicit: true };

  const d = String(rawDirection ?? '').trim().toLowerCase();
  if (['in', '+', 'credit', 'money in', 'received'].includes(d)) return { type: 'income', explicit: false };
  if (['out', '-', 'debit', 'money out', 'paid'].includes(d)) return { type: 'expense', explicit: false };
  return { type: 'expense', explicit: false }; // default
}

/* ------------------------------------------------------------------ */
/* 5. Row normalisation + validation (shared by preview and commit)     */
/* ------------------------------------------------------------------ */

/**
 * Returns { columns, mapping, rows:[{rowNumber, date, type, amount, category,
 * person, comment, valid, error}], valid, errors }.
 */
export function analyse(csvText, { requirePerson = true } = {}) {
  const grid = parseCsv(csvText);
  const headerIdx = grid.findIndex((r) => r.some((c) => String(c).trim() !== ''));
  if (headerIdx === -1) throw new HttpError(400, 'Sheet is empty — add rows first');

  const headerRow = grid[headerIdx].map((h) => String(h).trim());
  const mapping = mapHeaders(headerRow);

  if (!mapping.date && !mapping.amount) {
    throw new HttpError(400,
      `Could not find Date and Amount columns (found headers: ${headerRow.filter(Boolean).join(', ') || 'none'})`);
  }

  const idx = {
    date: colIndex(headerRow, mapping.date),
    type: colIndex(headerRow, mapping.type),
    amount: colIndex(headerRow, mapping.amount),
    category: colIndex(headerRow, mapping.category),
    person: colIndex(headerRow, mapping.person),
    comment: colIndex(headerRow, mapping.comment),
    direction: colIndex(headerRow, mapping.direction),
  };
  const get = (row, key) => (idx[key] === -1 ? '' : row[idx[key]]);

  const rows = [];
  const errors = [];
  let valid = 0;

  for (let i = headerIdx + 1; i < grid.length; i++) {
    const raw = grid[i];
    if (!raw.some((c) => String(c).trim() !== '')) continue; // blank line: skip silently
    const rowNumber = i + 1; // 1-based, header is row 1

    const date = parseDateCell(get(raw, 'date'));
    const rawAmount = parseAmountCell(get(raw, 'amount'));
    const resolved = resolveType(get(raw, 'type'), get(raw, 'direction'));
    let { type } = resolved;
    const { explicit } = resolved;
    const categoryRaw = String(get(raw, 'category') ?? '').trim();
    const personRaw = String(get(raw, 'person') ?? '').trim();
    const comment = String(get(raw, 'comment') ?? '').trim() || null;

    let error = null;
    let amount = rawAmount;

    if (!date) error = 'date is missing or not a recognised date (use YYYY-MM-DD or DD/MM/YYYY)';
    else if (rawAmount === null) error = 'amount is missing or not a number';
    else if (Math.abs(rawAmount) < 0.005) error = 'amount must be greater than 0';

    if (!error && amount < 0 && !explicit && type !== 'borrow' && type !== 'lend' && type !== 'repayment') {
      type = 'expense'; // negative → money out
    }
    if (amount !== null) amount = Math.abs(round2(amount));

    // For borrow/lend/repayment the person may live in the Category column too.
    const person = personRaw || (type === 'borrow' || type === 'lend' || type === 'repayment' ? categoryRaw : '');
    if (!error && requirePerson && ['borrow', 'lend', 'repayment'].includes(type) && !person) {
      error = `person is required for "${type}" rows (use the Person or Category column)`;
    }

    const item = {
      rowNumber,
      date: date || String(get(raw, 'date') ?? '').trim() || null,
      type,
      amount: amount ?? null,
      category: type === 'expense' || type === 'income' ? (categoryRaw || null) : null,
      person: ['borrow', 'lend', 'repayment'].includes(type) ? person : (personRaw || null),
      comment,
      valid: !error,
      error,
    };

    if (error) errors.push({ rowNumber, message: error });
    else valid += 1;
    rows.push(item);
  }

  if (!rows.length) throw new HttpError(400, 'Sheet is empty — add rows first');

  const byType = { expense: 0, income: 0, borrow: 0, lend: 0, repayment: 0 };
  for (const r of rows) if (r.valid) byType[r.type] += 1;

  return {
    columns: headerRow,
    mapping,
    rows,
    stats: { total: rows.length, valid, invalid: rows.length - valid, byType },
    errors: errors.slice(0, 50),
  };
}

/* ------------------------------------------------------------------ */
/* 6. Category resolution                                               */
/* ------------------------------------------------------------------ */

const FALLBACK = { expense: 'Others', income: 'Other Income' };

function resolveCategory(userId, wanted, typeName, createMissing) {
  const cats = listCategories(userId);
  const q = String(wanted || '').trim().toLowerCase();

  if (q) {
    const exact = cats.filter((c) => c.name.toLowerCase() === q);
    const sameType = exact.find((c) => c.type === typeName || c.type === 'both');
    if (sameType) return sameType.id;
    if (createMissing && !exact.length) {
      return createCategory(userId, {
        name: String(wanted).trim().slice(0, 40),
        icon: '📦',
        color: typeName === 'income' ? '#6366f1' : '#64748b',
        type: typeName,
      }).id;
    }
  }

  const fallback = cats.find((c) => c.name === FALLBACK[typeName] && c.type === typeName)
    || cats.find((c) => c.name === FALLBACK[typeName])
    || cats.find((c) => c.type === typeName);
  if (fallback) return fallback.id;
  return createCategory(userId, {
    name: FALLBACK[typeName], icon: '📦', color: '#64748b', type: typeName,
  }).id;
}

/* ------------------------------------------------------------------ */
/* 7. Public API: preview / commit / template                           */
/* ------------------------------------------------------------------ */

/** analyse() with friendlier wording when the source is an uploaded file. */
function analyseFor(source, text) {
  try {
    return analyse(text);
  } catch (err) {
    if (source === 'upload' && err instanceof HttpError && err.status === 400) {
      if (/Sheet is empty/.test(err.message)) {
        throw new HttpError(400,
          'This CSV file has no data rows yet — add your rows in Excel and save the file first');
      }
      if (/Could not find Date and Amount/.test(err.message)) {
        throw new HttpError(400,
          `${err.message}. The first row must be a header like: Date,Type,Category/Person,Amount,Comment`);
      }
    }
    throw err;
  }
}

export async function preview(userId, { url, csv }) {
  const { text, origin, source } = await loadText({ url, csv });
  const analysis = analyseFor(source, text);
  return {
    origin,
    source,
    columns: analysis.columns,
    mapping: analysis.mapping,
    rows: analysis.rows.slice(0, 10),
    stats: analysis.stats,
    errors: analysis.errors,
  };
}

export async function commit(userId, { url, csv, skipDuplicates = true, createMissingCategories = true }) {
  const { text, origin, source } = await loadText({ url, csv });
  const analysis = analyseFor(source, text);

  const byType = { expense: 0, income: 0, borrow: 0, lend: 0, repayment: 0 };
  const errors = [...analysis.errors];
  let imported = 0;
  let skipped = 0;

  transaction(() => {
    for (const row of analysis.rows) {
      if (!row.valid) continue;
      try {
        if (row.type === 'expense' || row.type === 'income') {
          if (skipDuplicates && txDuplicate(userId, row)) { skipped += 1; continue; }
          createTransaction(userId, {
            type: row.type,
            amount: row.amount,
            categoryId: resolveCategory(userId, row.category, row.type, createMissingCategories),
            comment: row.comment,
            date: row.date,
          });
        } else if (row.type === 'borrow' || row.type === 'lend') {
          if (skipDuplicates && blDuplicate(userId, row)) { skipped += 1; continue; }
          createBorrowLend(userId, {
            type: row.type,
            person: row.person,
            amount: row.amount,
            date: row.date,
            dueDate: null,
            comment: row.comment,
          });
        } else if (row.type === 'repayment') {
          const parent = findOldestOpenByPerson(userId, row.person);
          if (!parent) {
            errors.push({ rowNumber: row.rowNumber, message: `no open borrow/lend found for "${row.person}"` });
            continue;
          }
          if (skipDuplicates && repDuplicate(userId, parent.id, row)) { skipped += 1; continue; }
          createRepayment(userId, {
            borrowLendId: parent.id,
            amount: row.amount,
            date: row.date,
            comment: row.comment,
          });
          syncStatus(userId, parent.id);
        }
        imported += 1;
        byType[row.type] += 1;
      } catch (err) {
        errors.push({ rowNumber: row.rowNumber, message: err.message || 'could not import this row' });
      }
    }
  });

  const historyErrors = errors.slice(0, 50);
  return {
    imported,
    skipped,
    errors: historyErrors,
    errorCount: errors.length,
    byType,
    origin,
    source,
    totalRows: analysis.stats.total,
  };
}

async function loadText({ url, csv }) {
  if (url && String(url).trim()) {
    return { text: await fetchSheet(url), origin: String(url).trim(), source: 'url' };
  }
  if (csv && String(csv).trim()) {
    if (csv.length > MAX_CSV_BYTES) throw new HttpError(413, 'CSV is too large to import (5 MB max)');
    return { text: String(csv), origin: 'uploaded CSV', source: 'upload' };
  }
  throw new HttpError(400, 'Provide a Google Sheet URL or paste/upload CSV data');
}

export const TEMPLATE_HEADERS = ['Date', 'Type', 'Category/Person', 'Amount', 'Comment'];
export const TEMPLATE_ROWS = [
  ['2026-10-01', 'Income', 'Pocket Money', '5000', 'October pocket money'],
  ['2026-10-02', 'Expense', 'Food', '200', 'Dinner with friends'],
  ['2026-10-03', 'Borrow', 'Rahul', '500', 'Lunch money'],
  ['2026-10-04', 'Lend', 'Aman', '300', 'Travel fare'],
];

export function templateCsv() {
  const esc = (v) => (/[",\r\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const lines = [TEMPLATE_HEADERS, ...TEMPLATE_ROWS].map((r) => r.map(esc).join(','));
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
