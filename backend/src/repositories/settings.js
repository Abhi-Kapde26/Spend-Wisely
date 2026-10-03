import { get, run } from '../db/index.js';
import { camelizeRow } from '../utils/shape.js';

const COLUMNS = {
  currency: 'currency',
  openingBalance: 'opening_balance',
  monthlyPocketMoney: 'monthly_pocket_money',
  dailyLimit: 'daily_limit',
  monthlyBudget: 'monthly_budget',
  onboardingCompleted: 'onboarding_completed',
  notifyNearLimit: 'notify_near_limit',
  notifyDailyReminder: 'notify_daily_reminder',
  notifyBorrowReminder: 'notify_borrow_reminder',
};

const BOOLEAN_FLAGS = ['onboardingCompleted', 'notifyNearLimit', 'notifyDailyReminder', 'notifyBorrowReminder'];

export function getSettings(userId) {
  const row = camelizeRow(get('SELECT * FROM user_settings WHERE user_id = ?', [userId]));
  if (!row) return row;
  // SQLite stores flags as 0/1 — the API contract promises real booleans.
  for (const key of BOOLEAN_FLAGS) row[key] = Boolean(row[key]);
  return row;
}

export function createSettings(userId) {
  run(
    `INSERT OR IGNORE INTO user_settings (user_id, currency, opening_balance, monthly_pocket_money,
       daily_limit, monthly_budget, onboarding_completed)
     VALUES (?, 'INR', 0, 0, 0, 0, 0)`,
    [userId],
  );
  return getSettings(userId);
}

/** Whitelisted partial update — accepts camelCase keys from the API. */
export function updateSettings(userId, patch = {}) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(COLUMNS)) {
    if (patch[key] !== undefined) {
      let v = patch[key];
      if (typeof v === 'boolean') v = v ? 1 : 0;
      sets.push(`${col} = ?`);
      params.push(v);
    }
  }
  if (sets.length) {
    sets.push("updated_at = datetime('now')");
    params.push(userId);
    run(`UPDATE user_settings SET ${sets.join(', ')} WHERE user_id = ?`, params);
  }
  return getSettings(userId);
}
