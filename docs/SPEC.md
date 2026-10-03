# SPEND WISELY — Build Specification (v1)

> This is the **single source of truth** for the build. Backend and frontend agents MUST follow this contract exactly.

## 0. Ground rules

- **Repo root:** `D:\SpendWisely`
- **Layout:** `backend/` (Express API, port **4000**) and `frontend/` (Vite React SPA, port **5173**, proxies `/api` → `http://localhost:4000`).
- **Database:** SQLite via Node's built-in **`node:sqlite`** (`DatabaseSync`). NO native npm modules (no better-sqlite3, no bcrypt — use `bcryptjs`). All persistence goes through `backend/src/repositories/*` so the DB can be swapped for Firestore/Postgres later.
- **Currency amounts** are stored as REAL numbers rounded to 2 decimals. Default currency `INR`, symbol `₹` (settings.currency holds ISO code; frontend maps code → symbol, default `₹`).
- **Dates** are stored as text `YYYY-MM-DD` (local calendar date). Timestamps are ISO-8601 UTC strings.
- **Auth:** JWT (HS256, 7d) in `Authorization: Bearer <token>`. Frontend stores it in `localStorage` under `sw_token`.
- Every authenticated route is scoped to `req.user.id` — never leak other users' rows.
- Money in/out must be **traceable**: no derived rows are stored; balances are always computed from raw records.

### Node package constraints (exact)

backend: `express@^4.21.2` (**Express 4 API — do not use Express 5 syntax**), `cors`, `helmet`, `express-rate-limit`, `jsonwebtoken`, `bcryptjs`, `zod`, `dotenv`, `exceljs`, `pdfkit`, `google-auth-library`.
frontend: `react@^19`, `react-dom@^19`, `react-router-dom@^7`, `recharts@^3`, `react-toastify@^11`, `vite@^7`, `@vitejs/plugin-react`, `tailwindcss@^4`, `@tailwindcss/vite`.
dev at root: `concurrently`.
ESM everywhere: `"type": "module"` in both package.json files. Use `import` syntax; `__dirname` via `fileURLToPath`.

---

## 1. Database schema (SQLite, `backend/data/spendwisely.db`)

Run idempotent `CREATE TABLE IF NOT EXISTS` on boot from `backend/src/db/schema.js`, then seed default categories per user on register.

```sql
users(id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      google_id TEXT,
      avatar_url TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))

user_settings(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      currency TEXT NOT NULL DEFAULT 'INR',
      opening_balance REAL NOT NULL DEFAULT 0,
      monthly_pocket_money REAL NOT NULL DEFAULT 0,
      daily_limit REAL NOT NULL DEFAULT 0,          -- 0 = no limit set
      monthly_budget REAL NOT NULL DEFAULT 0,       -- 0 = no budget set
      onboarding_completed INTEGER NOT NULL DEFAULT 0,
      notify_near_limit INTEGER NOT NULL DEFAULT 1,
      notify_daily_reminder INTEGER NOT NULL DEFAULT 1,
      notify_borrow_reminder INTEGER NOT NULL DEFAULT 1,
      created_at TEXT, updated_at TEXT)

categories(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, icon TEXT NOT NULL DEFAULT '📦', color TEXT NOT NULL DEFAULT '#64748b',
      type TEXT NOT NULL CHECK(type IN ('expense','income','both')),
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(user_id, name))

transactions(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('expense','income')),
      amount REAL NOT NULL CHECK(amount > 0),
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      comment TEXT,
      date TEXT NOT NULL,                            -- YYYY-MM-DD
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))

borrow_lend(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL CHECK(type IN ('borrow','lend')),
      person TEXT NOT NULL,
      amount REAL NOT NULL CHECK(amount > 0),
      date TEXT NOT NULL,
      due_date TEXT,
      comment TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','partially_paid','completed')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))

repayments(id INTEGER PRIMARY KEY AUTOINCREMENT,
      borrow_lend_id INTEGER NOT NULL REFERENCES borrow_lend(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount REAL NOT NULL CHECK(amount > 0),
      date TEXT NOT NULL,
      comment TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))

daily_budgets(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date TEXT NOT NULL, limit_amount REAL NOT NULL,
      UNIQUE(user_id, date))

monthly_budgets(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      year INTEGER NOT NULL, month INTEGER NOT NULL, amount REAL NOT NULL,
      UNIQUE(user_id, year, month))

google_sheet_connections(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      sheet_url TEXT NOT NULL, spreadsheet_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'connected',
      last_synced_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))

recurring_expenses(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, amount REAL NOT NULL,
      category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
      frequency TEXT NOT NULL CHECK(frequency IN ('daily','weekly','monthly','yearly')),
      next_due_date TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')))
```

**Indexes:** `transactions(user_id, date)`, `transactions(user_id, type)`, `borrow_lend(user_id, status)`, `repayments(user_id, date)`.

---

## 2. Business rules (implement exactly)

### 2.1 Balance (repository/service `balanceService`)

```
availableBalance = opening_balance
                 + Σ income transactions
                 - Σ expense transactions
                 + Σ borrow amounts            (cash received when borrowed)
                 - Σ lend amounts              (cash given out when lent)
                 + Σ repayments on lend records   (cash back from debtors)
                 - Σ repayments on borrow records (cash paid back to creditors)

moneyToReceive = Σ (amount - paid) over lend records where status != 'completed'
moneyToPay     = Σ (amount - paid) over borrow records where status != 'completed'
netPosition    = availableBalance + moneyToReceive - moneyToPay
```

Where `paid = Σ repayments` for that record. **Borrow/lend are NOT income/expense transactions** — they live in their own table so reports stay accurate.

### 2.2 Daily budget

- Today's limit = `daily_budgets` override for that date if present, else `settings.daily_limit`.
- `spentToday` = Σ expenses with `date = today` (local date).
- `remaining = limit - spentToday`; `safeToSpend = max(0, remaining)`; `overAmount = max(0, -remaining)`.
- Status when `limit > 0`: `pct = spent/limit` → `≤0.75 'safe'`, `≤0.90 'warning'`, `≤1.0 'near_limit'`, `>1.0 'exceeded'`. When `limit == 0` → status `'none'`.
- **Never block** an over-limit expense; save it and let the UI warn.

### 2.3 Repayments

- `paid = Σ repayments`. `status`: `paid >= amount` → `completed`; `0 < paid < amount` → `partially_paid`; else `pending`.
- Reject repayment `amount <= 0` or `> remaining` (400 with message).
- Cash effect: repayments against **lend** → available `+`; against **borrow** → available `-`.
- Deleting a `borrow_lend` cascades its repayments.

### 2.4 Category seeding (on register)

Expense defaults: `🍔 Food`, `🛍 Shopping`, `🚕 Travel`, `📱 Recharge`, `🎬 Entertainment`, `📚 Education`, `🏠 Bills`, `💊 Health`, `🎁 Gifts`, `📦 Others`.
Income defaults: `💰 Pocket Money`, `💼 Salary`, `🎁 Gift`, `🔄 Refund`, `📥 Other Income`.
Colors: pick a coherent palette per category (Food `#f97316`, Shopping `#ec4899`, Travel `#0ea5e9`, Recharge `#8b5cf6`, Entertainment `#f43f5e`, Education `#16a34a`, Bills `#eab308`, Health `#ef4444`, Gifts `#a855f7`, Others `#64748b`, Pocket Money `#10b981`, Salary `#2563eb`, Gift `#d946ef`, Refund `#14b8a6`, Other Income `#6366f1`).

### 2.5 Monthly statement (§27 of blueprint)

For `(year, month)`:
```
moneyIn  = Σ income + Σ borrow (dated in month) + Σ repayments received (lend, in month)
moneyOut = Σ expenses + Σ lend (dated in month) + Σ repayments given (borrow, in month)
closing  = opening + moneyIn - moneyOut
opening  = closing balance of previous month (for the earliest month: settings.opening_balance)
```
Must also return `expenses`, `moneyLent`, `moneyBorrowed`, `repaymentsReceived`, `repaymentsGiven`, and full unified transaction list for the month.

---

## 3. API contract (all under `/api`)

Errors: non-2xx returns `{ "error": "human readable message" }`. Validation errors → 400, unauthenticated → 401 (`{"error":"Unauthorized"}`), not found → 404, conflicts → 409. Success returns JSON unless noted (exports stream files).

### 3.1 Auth
| Method | Path | Body → Response |
|---|---|---|
| POST | `/auth/register` | `{name,email,password}` (password ≥ 6) → `201 {token,user}` — creates settings row + default categories |
| POST | `/auth/login` | `{email,password}` → `{token,user}` |
| GET | `/auth/me` (auth) | → `{user:{id,name,email,avatarUrl,createdAt}, settings, onboardingComplete}` |

`user` shape: `{id,name,email,avatarUrl,createdAt}`. `settings` = full settings row (camelCase).

### 3.2 Setup & Settings
| Method | Path | Body → Response |
|---|---|---|
| POST | `/setup` (auth) | `{openingBalance, monthlyPocketMoney, dailyLimit, currency, monthlyBudget?}` → `{settings}`; sets `onboarding_completed=1` |
| GET | `/settings` (auth) | → `{settings}` |
| PUT | `/settings` (auth) | partial settings (all optional except none) → `{settings}` |
| PUT | `/settings/password` (auth) | `{currentPassword,newPassword}` → `{success:true}` |

### 3.3 Dashboard
`GET /dashboard` (auth) →
```json
{
  "availableBalance": 8450,
  "moneyToReceive": 800,
  "moneyToPay": 500,
  "netPosition": 8750,
  "today": { "spent": 320, "limit": 500, "remaining": 180, "safeToSpend": 180,
             "overAmount": 0, "status": "safe", "count": 3 },
  "week": { "spent": 1120, "limit": 3500, "safeToSpend": 1120 },
  "month": { "spent": 4580, "budget": 5000, "remaining": 420, "income": 5300, "progress": 0.916 },
  "todayTransactions": [ /* latest 10 transactions dated today, newest first */ ],
  "recentTransactions": [ /* latest 5 across all dates */ ],
  "upcomingDues": [ /* borrow_lend rows with due_date <= today+7 and status != completed */ ],
  "hasRecurringDue": true
}
```
Transaction shape (camelCase, used everywhere):
```json
{ "id":1, "type":"expense", "amount":200, "comment":"Dinner", "date":"2026-10-02",
  "category":{"id":1,"name":"Food","icon":"🍔","color":"#f97316"},
  "createdAt":"...", "updatedAt":"..." }
```

### 3.4 Transactions
| Method | Path | Query/Body |
|---|---|---|
| GET | `/transactions` | `?page=1&limit=20&type=expense&categoryId=1&from=2026-10-01&to=2026-10-31&search=Dinner&sort=desc` → `{items, total, page, limit}` (items joined with category) |
| POST | `/transactions` | `{type:'expense'|'income', amount, categoryId, comment?, date?}` → `201 {transaction}` |
| PUT | `/transactions/:id` | same fields (partial) → `{transaction}` |
| DELETE | `/transactions/:id` | → `{success:true}` |

`amount > 0` required; unknown categoryId → 400 `"Unknown category"`; category type mismatch (income row → expense-only category) → 400.

### 3.5 Categories
`GET /categories` → `{items}`; `POST {name,icon,color,type}` → `201 {category}`; `PUT /:id`; `DELETE /:id` → 409 `{error:"Category is in use"}` if referenced by transactions (unless `?force=1`, then set `category_id=NULL`).

### 3.6 Borrow & Lend
| Method | Path | Body |
|---|---|---|
| GET | `/borrow-lend` | `?status=pending&type=lend&person=Rahul` → `{items, totals:{toReceive,toPay}}` |
| POST | `/borrow-lend` | `{type:'borrow'|'lend', person, amount, date, dueDate?, comment?}` → `201 {item}` |
| PUT | `/borrow-lend/:id` | partial (person, amount, dueDate, comment) — not type |
| DELETE | `/borrow-lend/:id` | → `{success:true}` |
| GET | `/borrow-lend/:id` | → `{item, repayments:[{id,amount,date,comment,createdAt}]}` |
| POST | `/repayments` | `{borrowLendId, amount, date, comment?}` → `201 {repayment, item:{...,status,paid,remaining}}` |
| DELETE | `/repayments/:id` | → `{success:true}` (recalculates parent status) |

Item shape: `{id,type,person,amount,paid,remaining,date,dueDate,comment,status,createdAt,overdue:boolean}`.

### 3.7 Budgets
`GET /budgets` → `{dailyLimit, monthlyBudget, pocketMoney, currency, dailyOverrides:[{date,limit}]}`.
`PUT /budgets` → `{dailyLimit?, monthlyBudget?, monthlyPocketMoney?}` → `{settings}`.
`POST /budgets/daily` `{date, limit}` (upsert); `DELETE /budgets/daily/:date`.
`GET /budgets/month?year&month` → `{amount, spent, remaining}` (monthly_budgets override else settings.monthly_budget).

### 3.8 Analytics (all auth, all accept `from`/`to` where sensible)
| Path | Response |
|---|---|
| `GET /analytics/daily?days=30` | `{items:[{date,total}]}` — **includes zero days**, oldest→newest |
| `GET /analytics/weekly?year=&month=` | `{items:[{label:"Week 1",start,end,total}], month}` — ISO-ish week buckets (1st–7th, 8th–14th, …) |
| `GET /analytics/monthly?year=2026` | `{items:[{month:1,label:"Jan",total}], year}` (year defaults to current; 12 buckets, zero-filled) |
| `GET /analytics/category?from=&to=` | `{items:[{category:{id,name,icon,color},total,percent}], total}` sorted desc; uncategorised → `{name:"Others"}` |
| `GET /analytics/budget-performance?year=&month=` | `{items:[{date,spent,limit,status}], stats:{daysWithin,daysExceeded,totalDays,daysWithLimit}}` |
| `GET /analytics/summary` | `{avgDailySpending, highestDay:{date,total}, highestCategory, monthSpent, monthBudget, daysInMonth, daysElapsed, safeToSpendToday, safeToSpendWeek}` (avg over elapsed days of current month, min 1) |
| `GET /analytics/insights` | `{items:[{type:'info'|'warning'|'success', text}]}` rule-based (see §3.8.1) |

**Insight rules** (compare current week Mon→today vs previous week same weekday count):
1. If last week total > 0 and change ≥ ±10% → `"You spent {n}% more/less on {topCategory} this week."`
2. `"Your average daily spending is ₹{avg}."` (current month)
3. If limit set and exceededDays > 0 → `"You exceeded your daily limit {n} times this month."`
4. If ≥2 categories → `"{Cat} is your second-highest category."`
5. If projected month-end exceeds monthly budget by >10% → warning `"Based on this pace you may exceed your monthly budget by ₹{x}."`
6. If no spending today → success `"You haven't spent anything today — keep it up!"`
Amounts formatted with Indian grouping (₹8,450 / ₹1,20,000) — use `Intl.NumberFormat('en-IN')`.

### 3.9 History & Monthly
| Path | Response |
|---|---|
| `GET /history?year=&month=&source=all\|transaction\|income\|expense\|borrow\|lend\|repayment&type=&search=&page=&limit=` | `{items:[unified row], total, page, limit, summary:{openingBalance,moneyIn,moneyOut,expenses,moneyLent,moneyBorrowed,repaymentsReceived,repaymentsGiven,closingBalance}}` (month defaults to current) |
| `GET /monthly` | `{items:[{year,month,label:"October 2026",totalSpent,income,transactionCount}]}` newest first |
| `GET /monthly/:year/:month` | full statement per §2.5 incl. `items` (unified, sorted date desc) |
| `GET /monthly/compare?year=&month=` | `{current:{...statement}, previous:{...statement}, deltas}` |

**Unified history row:** `{id, source:'transaction'|'borrow'|'lend'|'repayment', type:'expense'|'income'|'borrow'|'lend'|'repayment', amount, direction:'in'|'out', date, title, subtitle, category?, person?, comment, status?}` where `title` = category name (transaction), `person` (borrow/lend), or `"Repayment — {person}"`.
`search` matches comment, category name, person, and exact amount.

### 3.10 Exports (auth, all accept `from`,`to`,`type` — pdf accepts `year`,`month`)
| Path | Output |
|---|---|
| `GET /export/csv` | `text/csv` attachment `spend-wisely-<from>_<to>.csv`, columns `Date,Type,Source,Category/Person,Amount,Direction,Comment` (UTF-8 BOM, CRLF) |
| `GET /export/excel` | `.xlsx` via exceljs: sheet **Transactions** (same columns, styled header, frozen top row, auto column width) + sheet **Summary** (Income, Expenses, Lent, Borrowed, Net) |
| `GET /export/pdf` | A4 bank-style statement via pdfkit: header (app name, user name, period, generated date), opening/closing, Money In/Out breakdown table, then transaction table with zebra rows, amounts right-aligned with ₹, footer page numbers. Streams `application/pdf`. |

Set `Content-Disposition: attachment`.

### 3.11 Google Sheets
- `GET /google-sheets/status` → `{connected:false}` or `{connected:true, sheetUrl, lastSyncedAt, status:'connected'}`
- `POST /google-sheets/connect` `{sheetUrl}` → validates URL (`docs.google.com/spreadsheets/d/<id>`), extracts spreadsheet id, stores row → `{connected:true,...}`. If `GOOGLE_SERVICE_ACCOUNT_EMAIL` + `GOOGLE_PRIVATE_KEY` are missing from env, still store but mark `status:'demo'` and respond `{connected:true, mode:'demo', warning:"Sync requires Google credentials in backend/.env"}`.
- `POST /google-sheets/sync` → if creds present: use `google-auth-library` JWT client + `fetch` to Sheets REST `values:batchUpdate` writing three tabs: `Transactions`, `Borrow-Lend`, `Monthly Summary` (current user's full data, header row styled). Updates `last_synced_at`. If no creds → `400 {error:"Google service account credentials not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to backend/.env"}`.
- `DELETE /google-sheets/disconnect` → `{success:true}`.
- **Google Sheets is optional; SQLite is always the source of truth.**

### 3.12 Import — Google Sheet / CSV (pull data INTO the app)

The reverse of §3.11: fetch a **published Google Sheet as CSV** (or an uploaded CSV file),
map its columns, preview, then import rows as transactions / borrow-lend / repayments.

**New tables:**

```sql
import_settings(user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      sheet_url TEXT NOT NULL, last_import_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')))

import_history(id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      source TEXT NOT NULL CHECK(source IN ('url','upload')),
      origin TEXT,               -- sheet URL or file name
      total_rows INTEGER NOT NULL DEFAULT 0,
      imported INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      errors TEXT,               -- JSON array of {rowNumber,message} (first 50)
      created_at TEXT NOT NULL DEFAULT (datetime('now')))
```

**Endpoints:**

| Method | Path | Body/Query → Response |
|---|---|---|
| GET | `/import/status` | → `{savedUrl, lastImportAt, history:[{id,source,origin,totalRows,imported,skipped,errorCount,createdAt}], template:{headers,example}}` |
| POST | `/import/preview` | `{url?, csv?}` → `{origin, columns[], mapping, rows[first 10], stats:{total,valid,invalid,byType}, errors[≤50]}` |
| POST | `/import/commit` | `{url?, csv?, skipDuplicates=true, createMissingCategories=true}` → `{imported, skipped, errors, byType, historyId}` |
| PUT | `/import/settings` | `{sheetUrl}` → `{savedUrl}` |
| DELETE | `/import/settings` | → `{success:true}` |
| GET | `/import/template` | → `text/csv` template (headers + 2 sample rows) |

**URL handling:** accept `/spreadsheets/d/e/<pubkey>/pub?output=csv` (as given by the user),
`/pub?gid=N&single=true&output=csv`, and normal `/spreadsheets/d/<id>/edit` links
(converted to `gviz/tq?tqx=out:csv`). **Host allowlist** `docs.google.com` + `*.googleusercontent.com` (SSRF guard);
follow redirects; empty body → `400 "Sheet is empty — add rows first"`.

**Row mapping rules:**
- Headers (case/space-insensitive, aliases): `date|day`, `type|kind`, `amount|amt|value`,
  `category|cat|label|category/person`, `person|name|party`, `comment|note|notes|description|remarks`,
  `direction|in/out`, `balance` (accepted, ignored).
- Date: `YYYY-MM-DD` · `DD/MM/YYYY`/`DD-MM-YYYY` (ambiguous slash → **DD/MM**) · also `YYYY/MM/DD`.
- Amount: strip `₹`, `,`, spaces; `−`/negative → money out.
- Type: explicit (`income/expense/borrow/lend/repayment`) else derived from `direction` (`IN→income`, `OUT→expense`) else sign, **default expense**.
- `borrow`/`lend` need a person (person column, else category cell, else row error).
- `repayment` matches the **oldest open** borrow/lend with the same person (case-insensitive); none → row error.
- Category: match existing by name (case-insensitive) → else create when `createMissingCategories`
  (expense defaults to `Others`, income to `Other Income`).
- `skipDuplicates` → identical `user+date+amount+comment` (transactions), `user+borrow_lend+date+amount` (repayments), or same `user+type+person+date+amount` (borrow/lend) ⇒ skipped, not re-imported.
- Every commit writes `import_history` (+ `import_settings.last_import_at` when a URL was used).

### 3.13 Recurring

`GET /recurring` → `{items}`; `POST {name, amount, categoryId, frequency, startDate?}` → creates with `next_due_date = startDate ?? today`; `PUT /:id`; `DELETE /:id`.
`POST /recurring/process` → for every active item with `next_due_date <= today`, create an expense transaction dated `next_due_date`, advance `next_due_date` by frequency (daily+1, weekly+7, monthly+1 month, yearly+1 year — clamp day), returns `{created:[...]}`. **Called by frontend on app load** and after login.

---

## 4. Backend structure

> **As built:** route files own their handlers (route → service → repository) instead of a
> separate `controllers/` folder — one file per feature, same layering, fewer hops.
> The only SQL lives in `src/db/` and `src/repositories/`.

```
backend/
  server.js                 # loads dotenv, starts app, unhandledRejection safety net
  package.json              # scripts: dev = "node --watch server.js", start = "node server.js"
  .env / .env.example       # PORT, JWT_SECRET, JWT_EXPIRES_IN, CORS_ORIGIN, GOOGLE_* (optional)
  scripts/smoke.js          # 107-check end-to-end suite (npm run smoke, server must be up)
  data/spendwisely.db       # SQLite (WAL), created on first boot (.gitignore'd)
  src/
    app.js                  # helmet, cors, json, request log, rate limit, /api router, 404 + errors
    config.js               # env parsing (single place)
    db/
      index.js              # node:sqlite DatabaseSync wrapper: all/get/run/transaction,
                            # WAL + foreign_keys, bind-value sanitiser
      schema.js             # idempotent CREATE TABLE IF NOT EXISTS + indexes
      seed.js               # defaultCategories(userId), createDefaultSettings(userId)
    middleware/
      auth.js               # verify JWT → req.user (+ signToken)
      validate.js           # zod body validation, queryInt, asyncRoute (Express-4 async safety)
      error.js              # HttpError + headersSent-aware global handler
      log.js                # [API] METHOD /path status ms
    repositories/           # ALL data access — the Firebase/Postgres swap point
      users.js settings.js categories.js transactions.js borrowLend.js
      repayments.js budgets.js recurring.js sheets.js
    services/
      balanceService.js     # §2.1 formulas (+ balanceAsOf for statements)
      budgetService.js      # §2.2 status/limits/week/month
      dashboardService.js   # one round-trip dashboard payload
      analyticsService.js   # §3.8 charts + summary
      insightService.js     # §3.8.1 rule-based insights (Phase-5 ML slot)
      historyService.js     # §3.9 unified rows, statements, archive, compare
      exportService.js      # csv / excel (exceljs) / pdf (pdfkit, Unicode ₹)
      sheetsService.js      # google sync (google-auth-library JWT → Sheets REST)
      recurringService.js   # due processing + frequency advancement
    routes/                 # Express routers with inline handlers
      index.js auth.js settings.js dashboard.js transactions.js categories.js
      borrowLend.js budgets.js analytics.js history.js export.js
      googleSheets.js recurring.js
    utils/shape.js          # toCamel/round2/isoDate/daysInMonth helpers
```

---

## 5. Frontend structure

```
frontend/
  package.json   # scripts: dev = vite, build = vite build, preview = vite preview
  vite.config.js # plugins react + tailwindcss; server.proxy '/api' → http://localhost:4000
  index.html     # title "Spend Wisely", Inter font (Google Fonts), meta viewport
  src/
    main.jsx  App.jsx (routes)  index.css (tailwind import + base styles)
    lib/
      api.js          # fetch wrapper: base '/api', attaches token, JSON parse, throws {message}
      format.js       # formatMoney (Intl en-IN, ₹ default from settings.currency),
                      # formatDate, formatDateLong, percent, statusMeta(status) → {color,label,icon}
      auth.js         # token get/set/clear, useAuth context
    context/
      SettingsContext.jsx  # loads /auth/me + /settings, exposes settings, refresh()
    components/
      layout/AppShell.jsx  # top nav (desktop) + bottom tab bar (mobile): 🏠 Dashboard, 📊 Analytics,
                           # 📅 History; right side: notification bell + ⚙ Settings icon → /settings
      ui/  Card.jsx Button.jsx Modal.jsx Input.jsx Select.jsx Spinner.jsx EmptyState.jsx
           ProgressBar.jsx (color by status) Toast helpers (react-toastify)
      dashboard/ BalanceCard.jsx DailyBudgetCard.jsx QuickActions.jsx TodayTransactionList.jsx
                 BorrowLendSummary.jsx UpcomingDues.jsx
      modals/ AddExpenseModal.jsx AddMoneyModal.jsx BorrowLendModal.jsx RepaymentModal.jsx
              CategoryPicker.jsx (grid of icon chips + "+ Add Custom Category")
    pages/
      LoginPage.jsx  RegisterPage.jsx  SetupPage.jsx (first-run wizard)
      DashboardPage.jsx  AnalyticsPage.jsx  HistoryPage.jsx
      StatementPage.jsx (/history/:year/:month)
      SettingsPage.jsx  (sections below)
      NotFoundPage.jsx
```

### Page requirements

**SetupPage** (`/setup`, redirect here when `onboardingComplete=false`): welcome card — Current balance, Monthly pocket money, Daily spending limit, Currency (select: INR ₹, USD $, EUR €, GBP £, AED د.إ, JPY ¥), Monthly budget (optional) → `POST /setup` → `/`.

**DashboardPage** (`/`):
1. Top row: **Available Balance** card (with Net Position + money to receive/pay mini-rows) and **Today's Budget** card (`spent / limit`, progress bar with status color, `{status}` badge 🟢 Safe / 🟡 Warning / 🟠 Near Limit / 🔴 Limit Exceeded / ⚪ No limit, "₹X remaining" or "₹Y over budget", **Safe to Spend Today** highlighted amount).
2. Quick actions: `+ ADD EXPENSE`, `+ ADD MONEY`, `+ BORROW/LEND` (large buttons opening modals).
3. **Borrow & Lend** summary card: Money to Receive / Money to Pay + `[+ BORROW] [+ LEND]` buttons + list of pending items with `Record Repayment` action.
4. **Today's transactions** list (icon, category name, comment, time/amount `-₹200`), each with Edit ✏ / Delete 🗑 (confirm dialog).
5. **Upcoming dues** (due within 7 days / overdue) with ⏰ badge.
6. Month progress card: spent vs monthly budget.
Toast on save. When an expense pushes past 75/90/100% of the daily limit → toast `warning`/`error` per §2.2 (never block). Borrow/Lend action → toast "₹500 borrowed from Rahul — cash added to balance".

**Add Expense / Add Money modals:** Amount, Category (grid picker + custom), Date (default today), Comment (optional). Expense posts `type:'expense'`, Add Money posts `type:'income'` with income-category picker (default Pocket Money).

**BorrowLendModal:** tabs **Borrow** / **Lend**, Person, Amount, Date, Due date (optional), Comment. **RepaymentModal:** shows original amount, paid so far, remaining; inputs Amount (default remaining), Date, Comment → `POST /repayments`; shows new status (PARTIALLY PAID / COMPLETED).

**AnalyticsPage**: tab chips `Daily | Weekly | Monthly | Category | Budget | Insights`.
- Daily: recharts **BarChart** of last 30 days (range switcher 7/30/90), tooltip ₹ amounts.
- Weekly: bar chart of weeks for selected month (month picker).
- Monthly: bar chart for selected year (year picker), 12 months.
- Category: **PieChart (donut)** + legend list with ₹ and % (matches blueprint §21).
- Budget: heatmap-style grid of the month, one cell per day colored 🟢🟡🟠🔴/grey (no data), plus stats (days within / exceeded / total).
- Insights: card list from `/analytics/insights` with 💡 icons, colored by type.
- Top stats strip: Average Daily Spending, Highest Spending Day, Highest Category, Total Monthly Spending (from `/analytics/summary`).

**HistoryPage**: month selector (`October 2026 ▼` prev/next arrows), statement summary card (Opening Balance, Money In, Money Out, Expenses, Money Lent, Money Borrowed, Closing Balance), unified transaction table (DATE | TYPE | CATEGORY | AMOUNT colored ±), source filter chips (All/Income/Expense/Borrow/Lend/Repayment), search box (debounced 300ms), pagination. Buttons: `Export CSV`, `Export Excel`, `Export PDF` (trigger authenticated download — fetch blob with token, then `URL.createObjectURL` download). Link "Compare with previous month" → shows comparison. Monthly archive sidebar/list (from `/monthly`) → navigates to `/history/:year/:month` (StatementPage renders same statement + full list).

**SettingsPage** with collapsible sections (all functional):
- 👤 Profile (name, avatar URL, email read-only) → `PUT /settings/profile`-style handled via `PUT /settings` with `{name}` (backend: `PUT /settings` also accepts `name`/`avatarUrl` and updates users table).
- 💰 Budget (daily limit, monthly budget, pocket money, currency) → `PUT /budgets` + `PUT /settings`.
- 🏷 Categories (list with icons, add/edit/delete, in-use delete shows toast error).
- 🔔 Notifications (3 toggles → `PUT /settings`).
- 📊 Data (Google Sheets connect/sync/disconnect UI per §3.11 incl. URL input + status dot + last synced time; Export CSV/Excel/PDF buttons).
- 🔐 Security (change password → `PUT /settings/password`, Logout).
- ➕ Recurring expenses management (list/add/edit/delete, frequency select).

**Auth flow:** `RequireAuth` wrapper — no token → `/login`; token but `onboardingComplete=false` → `/setup`; logged in visiting `/login` → `/`. Register page shows password confirm; errors shown inline via toast.

### UI/UX style
- Tailwind v4, modern fintech look: slate/white surfaces, emerald primary (`#10b981`), rounded-2xl cards, subtle shadows, `text-2xl font-bold tabular-nums` for money.
- **Light theme** default. Status colors: safe `#22c55e`, warning `#eab308`, near `#f97316`, exceeded `#ef4444`.
- Fully responsive: desktop top nav, mobile bottom tab bar; grid columns collapse to 1.
- Money rendered with `tabular-nums`, sign colored (green in / red out).
- Accessible labels on inputs; focus rings.

---

## 6. Root files (owned by Lead, but spec'd here)

- `README.md` — overview, quick start (`npm run setup && npm run dev`), default ports, feature list, phase status, Firebase migration pointer.
- `package.json` — scripts: `setup` (install both), `dev` (concurrently backend+frontend), `build`, `start`.
- `.gitignore` — node_modules, .env, backend/data/*.db*, dist.
- `docs/FIREBASE_MIGRATION.md` — mapping tables→Firestore collections, JWT→Firebase Auth, repository layer swap plan.

---

## 7. Definition of done

1. `npm install` succeeds in `backend/`, `frontend/`, root (no native builds).
2. `npm run dev` from root starts API on :4000 and Vite on :5173 with no console errors.
3. Full happy path works in browser: register → setup → add expense → dashboard numbers update → add income → borrow/lend + repayment → analytics charts render with real data → history search/filter/month switch → exports download files → settings edits persist.
4. All money math matches §2 exactly (verify: borrow adds to available AND payable; lend subtracts from available AND adds receivable; repayments reverse them).
5. Every endpoint in §3 exists and is wired to a frontend control (or explicitly documented).
6. No `any`-style SQL leaks (repositories only), no plaintext passwords, no cross-user data access.
