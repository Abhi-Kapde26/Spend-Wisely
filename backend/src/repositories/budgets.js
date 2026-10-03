import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

/** Per-day override, or null when the global daily_limit applies. */
export function getDailyOverride(userId, date) {
  const row = get('SELECT * FROM daily_budgets WHERE user_id = ? AND date = ?', [userId, date]);
  return camelizeRow(row);
}

export function listDailyOverrides(userId) {
  return camelizeRows(all('SELECT * FROM daily_budgets WHERE user_id = ? ORDER BY date DESC LIMIT 365', [userId]));
}

export function upsertDailyOverride(userId, date, limit) {
  run(
    `INSERT INTO daily_budgets (user_id, date, limit_amount) VALUES (?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET limit_amount = excluded.limit_amount`,
    [userId, date, limit],
  );
  return getDailyOverride(userId, date);
}

export function deleteDailyOverride(userId, date) {
  const r = run('DELETE FROM daily_budgets WHERE user_id = ? AND date = ?', [userId, date]);
  return r.changes > 0;
}

export function getMonthlyOverride(userId, year, month) {
  const row = get('SELECT * FROM monthly_budgets WHERE user_id = ? AND year = ? AND month = ?', [userId, year, month]);
  return camelizeRow(row);
}

export function upsertMonthlyOverride(userId, year, month, amount) {
  run(
    `INSERT INTO monthly_budgets (user_id, year, month, amount) VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, year, month) DO UPDATE SET amount = excluded.amount`,
    [userId, year, month, amount],
  );
  return getMonthlyOverride(userId, year, month);
}
