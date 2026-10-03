# 💰 Spend Wisely

A personal money-management web app that tracks income, expenses, daily budgets, borrowing/lending and spending patterns — and tells you clearly **how much money you can safely spend**.

```
🏠 Dashboard   📊 Analytics   📅 History   ⚙ Settings
```

---

## Quick start

Requirements: **Node.js 20+** (developed on Node 24). No database to install — SQLite is built into Node.

```bash
npm run setup     # installs root, backend and frontend dependencies
npm run dev       # starts API on :4000 and the web app on :5173
```

Open **http://localhost:5173**, register an account, complete the one-time setup (current balance, pocket money, daily limit, currency) and start tracking.

> Optional Google Sheets sync needs a Google service account — see [Google Sheets sync](#google-sheets-sync).

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite 7, Tailwind CSS 4, Recharts, React Router 7 |
| Backend | Node.js + Express 4 (REST API, JWT auth, Zod validation) |
| Database | SQLite via Node's built-in `node:sqlite` (WAL, zero native modules) |
| Exports | CSV (built-in), Excel (`exceljs`), PDF statement (`pdfkit`) |
| Cloud (future) | Firebase Auth + Firestore — see [`docs/FIREBASE_MIGRATION.md`](docs/FIREBASE_MIGRATION.md) |

**Design principle:** the database is the source of truth.

```
SQLite ──▶ backend calculations ──▶ Dashboard / Analytics / History
                    └──▶ optional Google Sheets sync / CSV / Excel / PDF
```

Every ₹1 entered has a traceable record, and all views are derived from the same raw rows.

---

## Features

### ✅ Phase 1 — MVP
- Email/password auth (JWT, hashed passwords), per-user data isolation
- First-run setup wizard: opening balance, pocket money, daily limit, currency
- Dashboard: available balance, today's budget with 🟢🟡🟠🔴 status, safe-to-spend
- Add expense / add income with categories, icons, colours, comments, dates
- Transaction history with edit and delete

### ✅ Phase 2 — Money management
- **Borrow & lend** with people, due dates, and partial repayments
  (borrowed cash raises *available balance* **and** *money to pay*; lent cash lowers balance **and** raises *money to receive*)
- Net position = available + receivable − payable
- Daily limit per-day overrides, monthly budgets
- Monthly statements (opening → money in / money out → closing), month archive, month-over-month comparison
- Unified search + filters (income, expense, borrow, lend, repayment)

### ✅ Phase 3 — Analytics
- Daily (7/30/90 days), weekly, monthly and category (donut) charts
- Budget performance calendar (days within / exceeded) + statistics
- Spending statistics: average daily, highest day, top category
- Rule-based spending insights (ready to be upgraded to ML)

### ✅ Phase 4 — Data
- Export **CSV**, **Excel** (transactions + summary sheets) and **PDF** (bank-style statement)
- Optional **Google Sheets** sync (service account; SQLite stays primary)
- Recurring expenses (Netflix, recharges…) with due processing

### 🔜 Phase 5 — Intelligence (roadmap)
- Spending prediction, anomaly detection, category prediction
- Smart budget suggestions, safe-to-spend forecasting

---

## Project structure

```
spend-wisely/
├── backend/            # Express REST API (port 4000)
│   ├── server.js
│   └── src/
│       ├── db/          # node:sqlite connection, schema, seeds
│       ├── middleware/  # auth (JWT), validation (zod), errors
│       ├── repositories/# ALL data access lives here (swap point for Firebase)
│       ├── services/    # balance, budget, analytics, history, exports, sheets
│       ├── controllers/ # request/response handling
│       └── routes/      # /api/* route definitions
├── frontend/           # React SPA (port 5173, proxies /api)
│   └── src/
│       ├── components/  # layout, ui, dashboard widgets, modals
│       ├── context/     # settings + auth context
│       ├── lib/         # api client, formatting helpers
│       └── pages/       # Dashboard, Analytics, History, Statement, Settings…
├── docs/
│   ├── SPEC.md              # full product + API contract
│   └── FIREBASE_MIGRATION.md
└── package.json         # root scripts: setup / dev / build / start
```

---

## API overview

All endpoints are prefixed with `/api` and, unless noted, require `Authorization: Bearer <token>`.

| Group | Endpoints |
|---|---|
| Auth | `POST /auth/register`, `POST /auth/login`, `GET /auth/me` |
| Setup / Settings | `POST /setup`, `GET|PUT /settings`, `PUT /settings/password` |
| Dashboard | `GET /dashboard` |
| Transactions | `GET|POST /transactions`, `PUT|DELETE /transactions/:id` |
| Categories | `GET|POST /categories`, `PUT|DELETE /categories/:id` |
| Borrow & Lend | `GET|POST /borrow-lend`, `GET|PUT|DELETE /borrow-lend/:id`, `POST /repayments`, `DELETE /repayments/:id` |
| Budgets | `GET|PUT /budgets`, `POST /budgets/daily`, `DELETE /budgets/daily/:date` |
| Analytics | `GET /analytics/daily`, `/weekly`, `/monthly`, `/category`, `/budget-performance`, `/summary`, `/insights` |
| History | `GET /history`, `GET /monthly`, `GET /monthly/:year/:month`, `GET /monthly/compare` |
| Exports | `GET /export/csv`, `/export/excel`, `/export/pdf` |
| Google Sheets | `GET /google-sheets/status`, `POST /connect`, `POST /sync`, `DELETE /disconnect` |
| Import | `GET /import/status`, `POST /import/preview`, `POST /import/commit`, `PUT|DELETE /import/settings`, `GET /import/template` |
| Recurring | `GET|POST /recurring`, `PUT|DELETE /recurring/:id`, `POST /recurring/process` |

The complete contract (shapes, rules, formulas) lives in [`docs/SPEC.md`](docs/SPEC.md).

---

## Money math

```
availableBalance = opening + income − expenses + borrowed − lent
                              + repayments received − repayments given

moneyToReceive   = outstanding amounts on lent money
moneyToPay       = outstanding amounts on borrowed money
netPosition      = availableBalance + moneyToReceive − moneyToPay
```

Borrow/lend records are **never** mixed into income or expenses, so reports and statements stay accurate.

---

## Google Sheets sync

Google Sheets is an **optional mirror**, never the primary database:

1. Create a Google Cloud service account, share your sheet with its email.
2. Fill in `backend/.env`:

   ```
   GOOGLE_SERVICE_ACCOUNT_EMAIL=...@....iam.gserviceaccount.com
   GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ```

3. In **Settings → Data**, paste the sheet URL and press **Connect**, then **Sync Now**.

Without credentials the feature stays in *demo* mode (connection saved, sync clearly reported as unavailable).

---

## Import from Google Sheet / CSV

The opposite direction — pull rows that already live in a spreadsheet **into** the app:

1. In Google Sheets: **File → Share → Publish to web → CSV**, copy the `/pub?output=csv` link.
2. In **Settings → Data → Import**, paste the URL (or choose a local `.csv` file) and press **Preview**.
3. Review the mapped columns, row stats and any row errors, then press **Import**.

Behaviour:

- **Columns auto-map** by header: `Date`, `Type`, `Amount`, `Category/Person`, `Comment` (aliases like `Notes`, `Amt`, `Kind` also work). Type is optional — it is derived from a `Direction` column or the amount sign (default `expense`).
- **Dates**: `YYYY-MM-DD`, `DD/MM/YYYY`, `DD-MM-YYYY`, `02 Oct 2026`, `Oct 2, 2026`. Ambiguous slashes are read as day-first.
- **Amounts**: `₹`, `Rs`, commas and `(500)` parentheses are understood.
- **Rows become** transactions (income/expense), borrow/lend records (person required), or repayments (applied to the oldest open record for that person).
- **Missing categories are auto-created** (can be switched off), and re-imports **skip duplicates** by default (switchable), so importing twice is safe.
- The saved URL and a per-run history (imported/skipped/errors) are stored in the `import_settings` / `import_history` tables; SQLite remains the source of truth.
- A ready-made CSV template lives at `GET /api/import/template` (also a **Download template** button in the UI).

Notes: the fetch is server-side and allow-listed to `docs.google.com` / `googleusercontent.com` (no arbitrary URLs), the sheet must be *published to web* (or shared as "anyone with the link"), and an empty sheet returns `400 Sheet is empty — add rows first`.

---

## Verification

```bash
cd backend
npm run smoke          # 107-check end-to-end suite against a running API
npm run smoke:import   # 48-check Google Sheet / CSV import suite
npm run smoke:all      # both
```

---

## Security

- Passwords hashed with bcryptjs · JWT expiry 7 days
- Zod input validation on every write endpoint
- Helmet security headers, CORS restricted to the SPA origin, rate limiting on auth
- Every query scoped to the authenticated user — no cross-user reads
- Parameterised queries only (no string-built SQL)

---

## Roadmap

See [Development phases](#--phase-5--intelligence-roadmap) above and `docs/SPEC.md` §46 of the original blueprint. Next up: ML insights (spending prediction, anomaly detection, category prediction), push-style notifications, and Firebase for production.
