import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

const SELECT = `
  SELECT r.*, b.person AS person, b.type AS bl_type
  FROM repayments r
  JOIN borrow_lend b ON b.id = r.borrow_lend_id`;

export function listRepayments(userId, borrowLendId) {
  return camelizeRows(all(
    `${SELECT} WHERE r.user_id = ? AND r.borrow_lend_id = ? ORDER BY r.date DESC, r.id DESC`,
    [userId, borrowLendId],
  )).map((r) => ({ ...r, blType: undefined }));
}

export function findRepayment(userId, id) {
  return camelizeRow(get(`${SELECT} WHERE r.user_id = ? AND r.id = ?`, [userId, id]));
}

export function paidSoFar(borrowLendId) {
  const row = get('SELECT COALESCE(SUM(amount), 0) AS paid FROM repayments WHERE borrow_lend_id = ?', [borrowLendId]);
  return Number(row.paid || 0);
}

export function createRepayment(userId, { borrowLendId, amount, date, comment = null }) {
  const r = run(
    'INSERT INTO repayments (borrow_lend_id, user_id, amount, date, comment) VALUES (?, ?, ?, ?, ?)',
    [borrowLendId, userId, amount, date, comment],
  );
  return findRepayment(userId, r.lastInsertRowid);
}

export function deleteRepayment(userId, id) {
  const r = run('DELETE FROM repayments WHERE user_id = ? AND id = ?', [userId, id]);
  return r.changes > 0;
}

/** Import dedupe (SPEC §3.12): same borrow_lend + date + amount. */
export function existsDuplicate(userId, borrowLendId, { date, amount }) {
  return Boolean(get(
    `SELECT 1 AS hit FROM repayments
     WHERE user_id = ? AND borrow_lend_id = ? AND date = ? AND ABS(amount - ?) < 0.005 LIMIT 1`,
    [userId, borrowLendId, date, amount],
  ));
}

/** Repayment rows in [from, to] joined with parent person/type (for statements). */
export function monthlyRows(userId, from, to) {
  return all(
    `${SELECT} WHERE r.user_id = ? AND r.date >= ? AND r.date <= ? ORDER BY r.date DESC, r.id DESC`,
    [userId, from, to],
  );
}
