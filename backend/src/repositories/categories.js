import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

const SELECT = `
  SELECT c.id, c.user_id, c.name, c.icon, c.color, c.type, c.is_default, c.created_at,
         (SELECT COUNT(*) FROM transactions t WHERE t.category_id = c.id) AS usage_count
  FROM categories c`;

export function listCategories(userId) {
  return camelizeRows(all(`${SELECT} WHERE c.user_id = ? ORDER BY c.type, c.id`, [userId]))
    .map((c) => ({ ...c, isDefault: Boolean(c.is_default), usageCount: c.usageCount }));
}

export function findCategory(userId, id) {
  return camelizeRow(get(`${SELECT} WHERE c.user_id = ? AND c.id = ?`, [userId, id]));
}

export function createCategory(userId, { name, icon = '📦', color = '#64748b', type = 'expense' }) {
  const r = run(
    'INSERT INTO categories (user_id, name, icon, color, type) VALUES (?, ?, ?, ?, ?)',
    [userId, name, icon, color, type],
  );
  return findCategory(userId, r.lastInsertRowid);
}

export function updateCategory(userId, id, patch) {
  const map = { name: 'name', icon: 'icon', color: 'color', type: 'type' };
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(map)) {
    if (patch[key] !== undefined) { sets.push(`${col} = ?`); params.push(patch[key]); }
  }
  if (!sets.length) return findCategory(userId, id);
  params.push(userId, id);
  run(`UPDATE categories SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`, params);
  return findCategory(userId, id);
}

export function usageCount(userId, id) {
  const row = get('SELECT COUNT(*) AS n FROM transactions WHERE user_id = ? AND category_id = ?', [userId, id]);
  return Number(row?.n || 0);
}

/** force=true → detach transactions (category_id becomes NULL) then delete. */
export function deleteCategory(userId, id, force = false) {
  if (force) run('UPDATE transactions SET category_id = NULL WHERE user_id = ? AND category_id = ?', [userId, id]);
  const r = run('DELETE FROM categories WHERE user_id = ? AND id = ?', [userId, id]);
  return r.changes > 0;
}
