import { get, run } from '../db/index.js';
import { camelizeRow } from '../utils/shape.js';

export function getConnection(userId) {
  return camelizeRow(get('SELECT * FROM google_sheet_connections WHERE user_id = ?', [userId]));
}

export function connect(userId, { sheetUrl, spreadsheetId, status = 'connected' }) {
  run(
    `INSERT INTO google_sheet_connections (user_id, sheet_url, spreadsheet_id, status, last_synced_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(user_id) DO UPDATE SET
       sheet_url = excluded.sheet_url,
       spreadsheet_id = excluded.spreadsheet_id,
       status = excluded.status,
       last_synced_at = NULL`,
    [userId, sheetUrl, spreadsheetId, status],
  );
  return getConnection(userId);
}

export function markSynced(userId) {
  run("UPDATE google_sheet_connections SET last_synced_at = datetime('now'), status = 'connected' WHERE user_id = ?",
    [userId]);
  return getConnection(userId);
}

export function disconnect(userId) {
  const r = run('DELETE FROM google_sheet_connections WHERE user_id = ?', [userId]);
  return r.changes > 0;
}
