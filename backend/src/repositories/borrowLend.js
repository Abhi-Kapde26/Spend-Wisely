import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

/** Rows always carry `paid` + `remaining` so status can never drift. */
const SELECT = `
  SELECT b.*,
         COALESCE((SELECT SUM(r.amount) FROM repayments r WHERE r.borrow_lend_id = b.id), 0) AS paid
  FROM borrow_lend b`;

export function statusFor(amount, paid) {
  if (paid >= amount - 1e-9) return 'completed';
  if (paid > 0) return 'partially_paid';
  return 'pending';
}

export function shapeItem(row) {
  if (!row) return row;
  const item = camelizeRow(row);
  item.paid = Number(item.paid || 0);
  item.amount = Number(item.amount);
  item.remaining = Math.max(0, Number((item.amount - item.paid).toFixed(2)));
  item.status = statusFor(item.amount, item.paid);
  item.overdue = Boolean(
    item.dueDate && item.status !== 'completed' && item.dueDate < new Date().toISOString().slice(0, 10),
  );
  return item;
}

export function listBorrowLend(userId, f = {}) {
  const where = ['b.user_id = ?'];
  const params = [userId];
  if (f.status) { where.push('b.status = ?'); params.push(f.status); }
  if (f.type) { where.push('b.type = ?'); params.push(f.type); }
  if (f.person) { where.push('LOWER(b.person) LIKE ?'); params.push(`%${String(f.person).toLowerCase()}%`); }

  const items = camelizeRows(all(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY b.date DESC, b.id DESC`, params))
    .map((r) => shapeItem({ ...r }));

  const totals = {
    toReceive: roundSum(items.filter((i) => i.type === 'lend').reduce((s, i) => s + i.remaining, 0)),
    toPay: roundSum(items.filter((i) => i.type === 'borrow').reduce((s, i) => s + i.remaining, 0)),
  };
  return { items: items.map(shapeItem), totals };
}

function roundSum(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

export function findBorrowLend(userId, id) {
  return shapeItem(get(`${SELECT} WHERE b.user_id = ? AND b.id = ?`, [userId, id]));
}

export function createBorrowLend(userId, { type, person, amount, date, dueDate = null, comment = null }) {
  const r = run(
    `INSERT INTO borrow_lend (user_id, type, person, amount, date, due_date, comment)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, type, person, amount, date, dueDate, comment],
  );
  return findBorrowLend(userId, r.lastInsertRowid);
}

const UPDATABLE = { person: 'person', amount: 'amount', date: 'date', dueDate: 'due_date', comment: 'comment' };

export function updateBorrowLend(userId, id, patch) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(UPDATABLE)) {
    if (patch[key] !== undefined) { sets.push(`${col} = ?`); params.push(patch[key]); }
  }
  if (!sets.length) return findBorrowLend(userId, id);
  sets.push("updated_at = datetime('now')");
  params.push(userId, id);
  run(`UPDATE borrow_lend SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`, params);
  const item = findBorrowLend(userId, id);
  syncStatus(userId, id);
  return findBorrowLend(userId, id) || item;
}

export function deleteBorrowLend(userId, id) {
  const r = run('DELETE FROM borrow_lend WHERE user_id = ? AND id = ?', [userId, id]);
  return r.changes > 0;
}

/** Recompute and persist status after a repayment change. */
export function syncStatus(userId, id) {
  const item = findBorrowLend(userId, id);
  if (!item) return null;
  if (item.status !== undefined) {
    run('UPDATE borrow_lend SET status = ?, updated_at = datetime(\'now\') WHERE user_id = ? AND id = ?',
      [item.status, userId, id]);
  }
  return item;
}

/**
 * Aggregate flows for the balance formula (SPEC §2.1).
 * `to` bounds by the borrow_lend / repayment date (inclusive).
 */
export function sums(userId, { to = null } = {}) {
  const blWhere = ['user_id = ?'];
  const blParams = [userId];
  if (to) { blWhere.push('date <= ?'); blParams.push(to); }
  const bl = get(
    `SELECT COALESCE(SUM(CASE WHEN type = 'borrow' THEN amount ELSE 0 END), 0) AS borrowed,
            COALESCE(SUM(CASE WHEN type = 'lend'   THEN amount ELSE 0 END), 0) AS lent
     FROM borrow_lend WHERE ${blWhere.join(' AND ')}`,
    blParams,
  );

  const rpWhere = ['r.user_id = ?'];
  const rpParams = [userId];
  if (to) { rpWhere.push('r.date <= ?'); rpParams.push(to); }
  const rp = get(
    `SELECT COALESCE(SUM(CASE WHEN b.type = 'lend'   THEN r.amount ELSE 0 END), 0) AS received,
            COALESCE(SUM(CASE WHEN b.type = 'borrow' THEN r.amount ELSE 0 END), 0) AS given
     FROM repayments r JOIN borrow_lend b ON b.id = r.borrow_lend_id
     WHERE ${rpWhere.join(' AND ')}`,
    rpParams,
  );

  return {
    borrowed: Number(bl.borrowed || 0),
    lent: Number(bl.lent || 0),
    repayReceived: Number(rp.received || 0),
    repayGiven: Number(rp.given || 0),
  };
}

/** Outstanding totals + counts (dashboard). */
export function outstanding(userId) {
  const items = listBorrowLend(userId).items;
  return {
    toReceive: roundSum(items.filter((i) => i.type === 'lend' && i.status !== 'completed')
      .reduce((s, i) => s + i.remaining, 0)),
    toPay: roundSum(items.filter((i) => i.type === 'borrow' && i.status !== 'completed')
      .reduce((s, i) => s + i.remaining, 0)),
    pendingCount: items.filter((i) => i.status !== 'completed').length,
  };
}

/** Borrow/lend rows with dues due on/before `to` that aren't completed. */
export function upcomingDues(userId, to) {
  const rows = all(
    `${SELECT} WHERE b.user_id = ? AND b.due_date IS NOT NULL AND b.due_date <= ?
       AND COALESCE((SELECT SUM(r.amount) FROM repayments r WHERE r.borrow_lend_id = b.id), 0) < b.amount
     ORDER BY b.due_date ASC`,
    [userId, to],
  );
  return rows.map(shapeItem);
}

/** Import dedupe (SPEC §3.12): same user + type + person + date + amount. */
export function existsDuplicate(userId, { type, person, date, amount }) {
  return Boolean(get(
    `SELECT 1 AS hit FROM borrow_lend
     WHERE user_id = ? AND type = ? AND LOWER(person) = LOWER(?) AND date = ?
       AND ABS(amount - ?) < 0.005 LIMIT 1`,
    [userId, type, person, date, amount],
  ));
}

/** Oldest record for `person` that isn't fully repaid (import repayment target). */
export function findOldestOpenByPerson(userId, person) {
  const row = get(
    `${SELECT} WHERE b.user_id = ? AND LOWER(b.person) = LOWER(?)
       AND (SELECT COALESCE(SUM(r.amount), 0) FROM repayments r WHERE r.borrow_lend_id = b.id) < b.amount
     ORDER BY b.date ASC, b.id ASC LIMIT 1`,
    [userId, person],
  );
  return shapeItem(row);
}

/** Flow totals for a month window. */
export function monthlySums(userId, from, to) {
  const row = get(
    `SELECT COALESCE(SUM(CASE WHEN type = 'borrow' THEN amount ELSE 0 END), 0) AS borrowed,
            COALESCE(SUM(CASE WHEN type = 'lend'   THEN amount ELSE 0 END), 0) AS lent
     FROM borrow_lend WHERE user_id = ? AND date >= ? AND date <= ?`,
    [userId, from, to],
  );
  const rp = get(
    `SELECT COALESCE(SUM(CASE WHEN b.type = 'lend'   THEN r.amount ELSE 0 END), 0) AS received,
            COALESCE(SUM(CASE WHEN b.type = 'borrow' THEN r.amount ELSE 0 END), 0) AS given
     FROM repayments r JOIN borrow_lend b ON b.id = r.borrow_lend_id
     WHERE r.user_id = ? AND r.date >= ? AND r.date <= ?`,
    [userId, from, to],
  );
  return {
    borrowed: Number(row.borrowed || 0),
    lent: Number(row.lent || 0),
    repayReceived: Number(rp.received || 0),
    repayGiven: Number(rp.given || 0),
  };
}
