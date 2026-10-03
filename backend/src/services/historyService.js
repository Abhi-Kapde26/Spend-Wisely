import { listTransactions, sumTransactions, dailyExpenseTotals } from '../repositories/transactions.js';
import { listBorrowLend, monthlySums } from '../repositories/borrowLend.js';
import { monthlyRows as repaymentRows } from '../repositories/repayments.js';
import { balanceAsOf } from './balanceService.js';
import { daysInMonth, round2, pad2 } from '../utils/shape.js';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** One row per money movement across all sources — powers History + statements. */
function unifiedRows(userId, { from, to }) {
  const rows = [];

  const txs = listTransactions(userId, { from, to, limit: 200, sort: 'desc' }).items;
  for (const t of txs) {
    rows.push({
      id: `tx-${t.id}`,
      numericId: t.id,
      source: 'transaction',
      type: t.type,
      direction: t.type === 'income' ? 'in' : 'out',
      amount: round2(t.amount),
      date: t.date,
      title: t.category?.name || (t.type === 'income' ? 'Income' : 'Expense'),
      subtitle: t.comment || '',
      comment: t.comment || '',
      category: t.category || null,
      person: null,
      status: null,
      createdAt: t.createdAt,
    });
  }

  const bl = listBorrowLend(userId).items.filter((i) => i.date >= from && i.date <= to);
  for (const b of bl) {
    rows.push({
      id: `bl-${b.id}`,
      numericId: b.id,
      source: b.type,
      type: b.type,
      direction: b.type === 'borrow' ? 'in' : 'out',
      amount: round2(b.amount),
      date: b.date,
      title: b.type === 'borrow' ? `Borrowed from ${b.person}` : `Lent to ${b.person}`,
      subtitle: b.comment || (b.type === 'borrow' ? 'Money to pay' : 'Money to receive'),
      comment: b.comment || '',
      category: null,
      person: b.person,
      status: b.status,
      dueDate: b.dueDate,
      createdAt: b.createdAt,
    });
  }

  const reps = repaymentRows(userId, from, to);
  for (const r of reps) {
    const isOnLend = r.bl_type === 'lend'; // receiving back / getting paid
    rows.push({
      id: `rp-${r.id}`,
      numericId: r.id,
      source: 'repayment',
      type: 'repayment',
      direction: isOnLend ? 'in' : 'out',
      amount: round2(r.amount),
      date: r.date,
      title: isOnLend ? `Repaid by ${r.person}` : `Repaid to ${r.person}`,
      subtitle: r.comment || 'Repayment',
      comment: r.comment || '',
      category: null,
      person: r.person,
      status: null,
      createdAt: r.createdAt,
    });
  }

  rows.sort((a, b) => (a.date === b.date ? (b.numericId ?? 0) - (a.numericId ?? 0) : a.date < b.date ? 1 : -1));
  return rows;
}

function filterUnified(rows, { source, search, type }) {
  let out = rows;
  if (source && source !== 'all') {
    if (source === 'income' || source === 'expense') {
      out = out.filter((r) => r.source === 'transaction' && r.type === source);
    } else {
      out = out.filter((r) => r.source === source);
    }
  } else if (type && type !== 'all') {
    out = out.filter((r) => r.type === type);
  }
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter((r) =>
      (r.comment || '').toLowerCase().includes(q)
      || (r.title || '').toLowerCase().includes(q)
      || (r.person || '').toLowerCase().includes(q)
      || (r.category?.name || '').toLowerCase().includes(q)
      || String(r.amount) === String(search).trim());
  }
  return out;
}

/** Statement math for a month (SPEC §2.5). */
export function statement(userId, year, month) {
  const dim = daysInMonth(year, month);
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(dim)}`;

  const tx = sumTransactions(userId, { from, to });
  const bl = monthlySums(userId, from, to);
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevDim = daysInMonth(prevYear, prevMonth);
  const opening = balanceAsOf(userId, `${prevYear}-${pad2(prevMonth)}-${pad2(prevDim)}`).closingBalance;

  const moneyIn = round2(tx.income + bl.borrowed + bl.repayReceived);
  const moneyOut = round2(tx.expense + bl.lent + bl.repayGiven);
  const closing = round2(opening + moneyIn - moneyOut);

  return {
    year,
    month,
    label: `${MONTH_NAMES[month - 1]} ${year}`,
    openingBalance: opening,
    moneyIn,
    moneyOut,
    expenses: round2(tx.expense),
    income: round2(tx.income),
    moneyLent: round2(bl.lent),
    moneyBorrowed: round2(bl.borrowed),
    repaymentsReceived: round2(bl.repayReceived),
    repaymentsGiven: round2(bl.repayGiven),
    closingBalance: closing,
    from,
    to,
  };
}

/** GET /history — unified, filterable, paginated + month summary. */
export function history(userId, opts = {}) {
  const { year, month } = opts;
  const now = new Date();
  const y = Number(year) || now.getFullYear();
  const m = Number(month) || now.getMonth() + 1;
  const dim = daysInMonth(y, m);
  const from = `${y}-${pad2(m)}-01`;
  const to = `${y}-${pad2(m)}-${pad2(dim)}`;

  const all = unifiedRows(userId, { from, to });
  const filtered = filterUnified(all, opts);

  const page = Math.max(1, Number(opts.page) || 1);
  const limit = Math.min(200, Math.max(1, Number(opts.limit) || 20));
  const items = filtered.slice((page - 1) * limit, page * limit);

  return {
    items,
    total: filtered.length,
    page,
    limit,
    year: y,
    month: m,
    summary: statement(userId, y, m),
  };
}

/** GET /monthly — archive list with per-month totals. */
export function archive(userId) {
  const rows = dailyExpenseTotals(userId, '2000-01-01', '2999-12-31');
  const byMonth = new Map();
  for (const r of rows) {
    const [yy, mm] = r.date.split('-');
    const key = `${yy}-${mm}`;
    byMonth.set(key, round2((byMonth.get(key) || 0) + Number(r.total)));
  }

  // Include months that have income/no expense too, so archives aren't lossy.
  const txs = listTransactions(userId, { limit: 200, sort: 'desc' }).items;
  for (const t of txs) {
    const key = t.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, 0);
  }

  return [...byMonth.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, total]) => {
      const [yy, mm] = key.split('-').map(Number);
      return {
        year: yy,
        month: mm,
        label: `${MONTH_NAMES[mm - 1]} ${yy}`,
        totalSpent: total,
      };
    });
}

/** GET /monthly/:year/:month — full statement incl. its transaction rows. */
export function fullStatement(userId, year, month) {
  const st = statement(userId, year, month);
  const dim = daysInMonth(year, month);
  const rows = unifiedRows(userId, { from: st.from, to: `${year}-${pad2(month)}-${pad2(dim)}` });
  return { ...st, items: rows, transactionCount: rows.length };
}

/** GET /monthly/compare — current vs previous month. */
export function compare(userId, year, month) {
  const prevYear = month === 1 ? year - 1 : year;
  const prevMonth = month === 1 ? 12 : month - 1;
  const current = statement(userId, year, month);
  const previous = statement(userId, prevYear, prevMonth);
  return { current, previous };
}

/** Month transactions for exports (wider page cap). */
export function exportRows(userId, { from, to, type = null, limit = 5000 }) {
  const rows = listTransactions(userId, { from, to, type, limit, sort: 'desc' });
  return rows.items;
}
