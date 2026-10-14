import { get, run } from '../db/index.js';

export function getNote(userId) {
  const row = get('SELECT content, updated_at FROM notes WHERE user_id = ?', [userId]);
  return row ? { content: row.content, updatedAt: row.updated_at } : { content: '', updatedAt: null };
}

export function saveNote(userId, content) {
  const text = typeof content === 'string' ? content : '';
  run(
    `INSERT INTO notes (user_id, content, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET
       content = excluded.content,
       updated_at = datetime('now')`,
    [userId, text],
  );
  return getNote(userId);
}
