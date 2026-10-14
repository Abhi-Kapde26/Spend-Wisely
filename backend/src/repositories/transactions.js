import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

const SELECT = `
  SELECT t.id, t.user_id, t.type, t.amount, t.category_id, t.comment, t.date,
         t.created_at, t.updated_at,
         c.name AS cat_name, c.icon AS cat_icon, c.color AS cat_color
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.category_id`;

/** Attach the `category` object expected by the API (SPEC §3.4 shape). */
export function shapeTransaction(row) {
  if (!row) return row;
  const t = camelizeRow(row);
  const cat = t.catName !== undefined
    ? (t.catName === null || t.catName === undefined ? null
      : { id: t.categoryId, name: t.catName, icon: t.catIcon, color: t.catColor })
    : undefined;
  delete t.catName; delete t.catIcon; delete t.catColor;
  if (cat !== undefined) t.category = cat;
  return t;
}

export function listTransactions(userId, f = {}) {
  const where = ['t.user_id = ?'];
  const params = [userId];

  if (f.type) { where.push('t.type = ?'); params.push(f.type); }
  if (f.categoryId) { where.push('t.category_id = ?'); params.push(Number(f.categoryId)); }
  if (f.from) { where.push('t.date >= ?'); params.push(f.from); }
  if (f.to) { where.push('t.date <= ?'); params.push(f.to); }
  if (f.search) {
    where.push('(LOWER(t.comment) LIKE ? OR LOWER(c.name) LIKE ?)');
    const s = `%${String(f.search).toLowerCase()}%`;
    params.push(s, s);
  }

  const total = Number(get(
    `SELECT COUNT(*) AS n FROM transactions t LEFT JOIN categories c ON c.id = t.category_id
     WHERE ${where.join(' AND ')}`,
    params,
  ).n);

  const maxLimit = f.limit && Number(f.limit) > 200 ? 10000 : 200;
  const limit = Math.min(Math.max(Number(f.limit) || 20, 1), maxLimit);
  const page = Math.max(Number(f.page) || 1, 1);
  const sortDir = String(f.sort).toLowerCase() === 'asc' ? 'ASC' : 'DESC';

  const rows = all(
    `${SELECT} WHERE ${where.join(' AND ')} ORDER BY t.date ${sortDir}, t.id ${sortDir} LIMIT ? OFFSET ?`,
    [...params, limit, (page - 1) * limit],
  );

  return { items: rows.map(shapeTransaction), total, page, limit };
}

export function findTransaction(userId, id) {
  return shapeTransaction(get(`${SELECT} WHERE t.user_id = ? AND t.id = ?`, [userId, id]));
}

export function createTransaction(userId, { type, amount, categoryId = null, comment = null, date }) {
  const r = run(
    `INSERT INTO transactions (user_id, type, amount, category_id, comment, date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, type, amount, categoryId, comment, date],
  );
  return findTransaction(userId, r.lastInsertRowid);
}

const UPDATABLE = { type: 'type', amount: 'amount', categoryId: 'category_id', comment: 'comment', date: 'date' };

export function updateTransaction(userId, id, patch) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(UPDATABLE)) {
    if (patch[key] !== undefined) { sets.push(`${col} = ?`); params.push(patch[key]); }
  }
  if (!sets.length) return findTransaction(userId, id);
  sets.push("updated_at = datetime('now')");
  params.push(userId, id);
  run(`UPDATE transactions SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`, params);
  return findTransaction(userId, id);
}

export function deleteTransaction(userId, id) {
  const r = run('DELETE FROM transactions WHERE user_id = ? AND id = ?', [userId, id]);
  return r.changes > 0;
}

/** Import dedupe (SPEC §3.12): same user + date + amount + comment. */
export function existsDuplicate(userId, { date, amount, comment }) {
  return Boolean(get(
    `SELECT 1 AS hit FROM transactions
     WHERE user_id = ? AND date = ? AND ABS(amount - ?) < 0.005
       AND LOWER(COALESCE(comment, '')) = LOWER(COALESCE(?, '')) LIMIT 1`,
    [userId, date, amount, comment],
  ));
}

/** Sum of income + expenses, optionally bounded by [from, to] dates (inclusive). */
export function sumTransactions(userId, { from = null, to = null, type = null } = {}) {
  const where = ['user_id = ?'];
  const params = [userId];
  if (from) { where.push('date >= ?'); params.push(from); }
  if (to) { where.push('date <= ?'); params.push(to); }
  if (type) { where.push('type = ?'); params.push(type); }
  const row = get(
    `SELECT COALESCE(SUM(CASE WHEN type = 'income'  THEN amount ELSE 0 END), 0) AS income,
            COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) AS expense
     FROM transactions WHERE ${where.join(' AND ')}`,
    params,
  );
  return { income: Number(row.income || 0), expense: Number(row.expense || 0) };
}

/** Expense totals per day — GROUP BY date, within [from, to]. */
export function dailyExpenseTotals(userId, from, to) {
  return all(
    `SELECT date, COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?
     GROUP BY date ORDER BY date ASC`,
    [userId, from, to],
  );
}

/** Expense totals per category within [from, to]. */
export function categoryExpenseTotals(userId, from, to) {
  return all(
    `SELECT COALESCE(t.category_id, 0) AS category_id,
            COALESCE(c.name, 'Others') AS name,
            COALESCE(c.icon, '📦') AS icon,
            COALESCE(c.color, '#64748b') AS color,
            SUM(t.amount) AS total
     FROM transactions t
     LEFT JOIN categories c ON c.id = t.category_id
     WHERE t.user_id = ? AND t.type = 'expense' AND t.date >= ? AND t.date <= ?
     GROUP BY t.category_id, c.name, c.icon, c.color
     ORDER BY total DESC`,
    [userId, from, to],
  );
}

/** Highest single spending day within [from, to]. */
export function highestDay(userId, from, to) {
  const row = get(
    `SELECT date, COALESCE(SUM(amount), 0) AS total
     FROM transactions
     WHERE user_id = ? AND type = 'expense' AND date >= ? AND date <= ?
     GROUP BY date ORDER BY total DESC LIMIT 1`,
    [userId, from, to],
  );
  return row ? { date: row.date, total: Number(row.total) } : null;
}
