/**
 * Idempotent schema — runs on every boot (CREATE TABLE IF NOT EXISTS).
 * Kept ANSI-ish so it can be translated to Postgres/Firestore later
 * (see docs/FIREBASE_MIGRATION.md).
 */
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  google_id     TEXT,
  avatar_url    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS user_settings (
  user_id               INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency              TEXT NOT NULL DEFAULT 'INR',
  opening_balance       REAL NOT NULL DEFAULT 0,
  monthly_pocket_money  REAL NOT NULL DEFAULT 0,
  daily_limit           REAL NOT NULL DEFAULT 0,
  monthly_budget        REAL NOT NULL DEFAULT 0,
  onboarding_completed  INTEGER NOT NULL DEFAULT 0,
  notify_near_limit     INTEGER NOT NULL DEFAULT 1,
  notify_daily_reminder INTEGER NOT NULL DEFAULT 1,
  notify_borrow_reminder INTEGER NOT NULL DEFAULT 1,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  icon       TEXT NOT NULL DEFAULT '📦',
  color      TEXT NOT NULL DEFAULT '#64748b',
  type       TEXT NOT NULL DEFAULT 'expense' CHECK(type IN ('expense','income','both')),
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, name)
);

CREATE TABLE IF NOT EXISTS transactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK(type IN ('expense','income')),
  amount      REAL NOT NULL CHECK(amount > 0),
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  comment     TEXT,
  date        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS borrow_lend (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK(type IN ('borrow','lend')),
  person     TEXT NOT NULL,
  amount     REAL NOT NULL CHECK(amount > 0),
  date       TEXT NOT NULL,
  due_date   TEXT,
  comment    TEXT,
  status     TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partially_paid','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS repayments (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  borrow_lend_id INTEGER NOT NULL REFERENCES borrow_lend(id) ON DELETE CASCADE,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount         REAL NOT NULL CHECK(amount > 0),
  date           TEXT NOT NULL,
  comment        TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS daily_budgets (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date         TEXT NOT NULL,
  limit_amount REAL NOT NULL,
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS monthly_budgets (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  year    INTEGER NOT NULL,
  month   INTEGER NOT NULL,
  amount  REAL NOT NULL,
  UNIQUE(user_id, year, month)
);

CREATE TABLE IF NOT EXISTS google_sheet_connections (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sheet_url     TEXT NOT NULL,
  spreadsheet_id TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'connected',
  last_synced_at TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recurring_expenses (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  amount        REAL NOT NULL CHECK(amount > 0),
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  frequency     TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','yearly')),
  next_due_date TEXT NOT NULL,
  active        INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_settings (
  user_id        INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sheet_url      TEXT NOT NULL,
  last_import_at TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS import_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source     TEXT NOT NULL CHECK(source IN ('url','upload')),
  origin     TEXT,
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported   INTEGER NOT NULL DEFAULT 0,
  skipped    INTEGER NOT NULL DEFAULT 0,
  errors     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
  user_id    INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  content    TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tx_user_date    ON transactions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tx_user_type    ON transactions(user_id, type);
CREATE INDEX IF NOT EXISTS idx_bl_user_status  ON borrow_lend(user_id, status);
CREATE INDEX IF NOT EXISTS idx_rp_user_date    ON repayments(user_id, date);
CREATE INDEX IF NOT EXISTS idx_cat_user        ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_imp_history     ON import_history(user_id, created_at);
`;

export function migrate(db) {
  db.exec(SCHEMA);
}
