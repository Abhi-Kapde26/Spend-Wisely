import { all, get, run } from '../db/index.js';
import { camelizeRow, camelizeRows } from '../utils/shape.js';

export function getImportSettings(userId) {
  return camelizeRow(get('SELECT * FROM import_settings WHERE user_id = ?', [userId]));
}

export function saveSheetUrl(userId, sheetUrl) {
  run(
    `INSERT INTO import_settings (user_id, sheet_url) VALUES (?, ?)
     ON CONFLICT(user_id) DO UPDATE SET sheet_url = excluded.sheet_url,
       updated_at = datetime('now')`,
    [userId, sheetUrl],
  );
  return getImportSettings(userId);
}

export function markImported(userId) {
  run("UPDATE import_settings SET last_import_at = datetime('now'), updated_at = datetime('now') WHERE user_id = ?",
    [userId]);
  return getImportSettings(userId);
}

export function clearImportSettings(userId) {
  const r = run('DELETE FROM import_settings WHERE user_id = ?', [userId]);
  return r.changes > 0;
}

export function addHistory(userId, { source, origin, totalRows, imported, skipped, errors }) {
  const r = run(
    `INSERT INTO import_history (user_id, source, origin, total_rows, imported, skipped, errors)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, source, origin || null, totalRows, imported, skipped, JSON.stringify(errors || [])],
  );
  return findHistory(userId, r.lastInsertRowid);
}

export function findHistory(userId, id) {
  return camelizeRow(get('SELECT * FROM import_history WHERE user_id = ? AND id = ?', [userId, id]));
}

export function listHistory(userId, limit = 10) {
  const rows = all(
    'SELECT * FROM import_history WHERE user_id = ? ORDER BY id DESC LIMIT ?',
    [userId, limit],
  );
  return camelizeRows(rows).map((h) => ({
    ...h,
    errors: safeParse(h.errors),
    errorCount: (safeParse(h.errors) || []).length,
  }));
}

function safeParse(json) {
  try { return JSON.parse(json || '[]'); } catch { return []; }
}
