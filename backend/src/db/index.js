import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import config from '../config.js';
import { migrate } from './schema.js';

let db = null;

/** Open (once) and migrate the SQLite database. */
export function initDb() {
  if (db) return db;
  fs.mkdirSync(config.DATA_DIR, { recursive: true });
  db = new DatabaseSync(config.DB_PATH);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');
  migrate(db);
  return db;
}

export function getDb() {
  if (!db) return initDb();
  return db;
}

/** Run a query returning all rows (snake_case objects). */
export function all(sql, params = []) {
  return getDb().prepare(sql).all(...sanitize(params));
}

/** Run a query returning the first row or undefined. */
export function get(sql, params = []) {
  return getDb().prepare(sql).get(...sanitize(params));
}

/** Run a write statement. Returns { changes, lastInsertRowid }. */
export function run(sql, params = []) {
  const r = getDb().prepare(sql).run(...sanitize(params));
  return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
}

/** Serialised transaction — returns fn()'s value, rolls back on throw. */
export function transaction(fn) {
  const d = getDb();
  d.exec('BEGIN');
  try {
    const out = fn();
    d.exec('COMMIT');
    return out;
  } catch (err) {
    try { d.exec('ROLLBACK'); } catch { /* already rolled back */ }
    throw err;
  }
}

/** node:sqlite rejects booleans/undefined/Date — normalise bind values. */
function sanitize(params) {
  return params.map((v) => {
    if (v === undefined || v === null) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v;
  });
}
