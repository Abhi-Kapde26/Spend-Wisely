import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

const SELECT = `
  SELECT r.id, r.user_id, r.name, r.amount, r.category_id, r.frequency,
         r.next_due_date, r.active, r.created_at,
         c.name AS cat_name, c.icon AS cat_icon, c.color AS cat_color
  FROM recurring_expenses r
  LEFT JOIN categories c ON c.id = r.category_id`;

export function shapeRecurring(row) {
  if (!row) return row;
  const item = camelizeRow(row);
  item.category = item.catName
    ? { id: item.categoryId, name: item.catName, icon: item.catIcon, color: item.catColor }
    : null;
  delete item.catName; delete item.catIcon; delete item.catColor;
  item.active = Boolean(item.active);
  return item;
}

export function listRecurring(userId) {
  return camelizeRows(all(`${SELECT} WHERE r.user_id = ? ORDER BY r.active DESC, r.next_due_date ASC`, [userId]))
    .map(shapeRecurring);
}

export function findRecurring(userId, id) {
  return shapeRecurring(get(`${SELECT} WHERE r.user_id = ? AND r.id = ?`, [userId, id]));
}

export function createRecurring(userId, { name, amount, categoryId = null, frequency, startDate }) {
  const r = run(
    `INSERT INTO recurring_expenses (user_id, name, amount, category_id, frequency, next_due_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, name, amount, categoryId, frequency, startDate],
  );
  return findRecurring(userId, r.lastInsertRowid);
}

const UPDATABLE = {
  name: 'name', amount: 'amount', categoryId: 'category_id',
  frequency: 'frequency', nextDueDate: 'next_due_date', active: 'active',
};

export function updateRecurring(userId, id, patch) {
  const sets = [];
  const params = [];
  for (const [key, col] of Object.entries(UPDATABLE)) {
    if (patch[key] !== undefined) {
      let v = patch[key];
      if (typeof v === 'boolean') v = v ? 1 : 0;
      sets.push(`${col} = ?`);
      params.push(v);
    }
  }
  if (!sets.length) return findRecurring(userId, id);
  params.push(userId, id);
  run(`UPDATE recurring_expenses SET ${sets.join(', ')} WHERE user_id = ? AND id = ?`, params);
  return findRecurring(userId, id);
}

export function deleteRecurring(userId, id) {
  const r = run('DELETE FROM recurring_expenses WHERE user_id = ? AND id = ?', [userId, id]);
  return r.changes > 0;
}

export function dueRecurring(userId, today) {
  return camelizeRows(all(
    `${SELECT} WHERE r.user_id = ? AND r.active = 1 AND r.next_due_date <= ? ORDER BY r.next_due_date ASC`,
    [userId, today],
  )).map(shapeRecurring);
}

export function setNextDue(userId, id, nextDueDate) {
  run('UPDATE recurring_expenses SET next_due_date = ? WHERE user_id = ? AND id = ?', [nextDueDate, userId, id]);
}
