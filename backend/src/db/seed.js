import { run, all } from './index.js';

/** Default expense + income categories created for every new user (SPEC §2.4). */
const DEFAULT_CATEGORIES = [
  { name: 'Food', icon: '🍔', color: '#f97316', type: 'expense' },
  { name: 'Shopping', icon: '🛍', color: '#ec4899', type: 'expense' },
  { name: 'Travel', icon: '🚕', color: '#0ea5e9', type: 'expense' },
  { name: 'Recharge', icon: '📱', color: '#8b5cf6', type: 'expense' },
  { name: 'Entertainment', icon: '🎬', color: '#f43f5e', type: 'expense' },
  { name: 'Education', icon: '📚', color: '#16a34a', type: 'expense' },
  { name: 'Bills', icon: '🏠', color: '#eab308', type: 'expense' },
  { name: 'Health', icon: '💊', color: '#ef4444', type: 'expense' },
  { name: 'Gifts', icon: '🎁', color: '#a855f7', type: 'expense' },
  { name: 'Others', icon: '📦', color: '#64748b', type: 'expense' },
  { name: 'Pocket Money', icon: '💰', color: '#10b981', type: 'income' },
  { name: 'Salary', icon: '💼', color: '#2563eb', type: 'income' },
  { name: 'Gift', icon: '🎁', color: '#d946ef', type: 'income' },
  { name: 'Refund', icon: '🔄', color: '#14b8a6', type: 'income' },
  { name: 'Other Income', icon: '📥', color: '#6366f1', type: 'income' },
];

export function seedCategories(userId) {
  const count = all('SELECT id FROM categories WHERE user_id = ?', [userId]).length;
  if (count > 0) return;
  for (const c of DEFAULT_CATEGORIES) {
    run(
      `INSERT INTO categories (user_id, name, icon, color, type, is_default)
       VALUES (?, ?, ?, ?, ?, 1)`,
      [userId, c.name, c.icon, c.color, c.type],
    );
  }
}

export function createDefaultSettings(userId) {
  run(
    `INSERT OR IGNORE INTO user_settings (user_id, currency, opening_balance, monthly_pocket_money,
       daily_limit, monthly_budget, onboarding_completed)
     VALUES (?, 'INR', 0, 0, 0, 0, 0)`,
    [userId],
  );
}
