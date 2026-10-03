# Firebase Migration Guide

Spend Wisely ships with **SQLite** (via Node's built-in `node:sqlite`) so it runs with zero setup. The production path is **Firebase**. This document explains how to move there without rewriting the app.

---

## Why the codebase is already Firebase-ready

All persistence is isolated behind one layer:

```
routes → controllers → services → repositories → db/
                                          ↑
                            the ONLY place SQL exists
```

- `backend/src/repositories/*` — pure data access (`users`, `settings`, `categories`, `transactions`, `borrowLend`, `repayments`, `budgets`, `recurring`, `sheets`). Each function takes `userId` first and returns camelCase objects.
- `backend/src/services/*` — all business math (balances, budgets, analytics, statements, exports) consumes repositories, never SQL.
- Controllers/routes never touch the database.

Swapping storage means writing a **new implementation of each repository** — services, controllers, routes and the entire frontend stay unchanged.

---

## 1. Authentication: JWT + bcrypt → Firebase Auth

| Today | After migration |
|---|---|
| `POST /auth/register` hashes with bcryptjs, issues a JWT | `firebase-admin.auth().createUser()`; client signs in with the Firebase SDK (email/password or Google) |
| `Authorization: Bearer <jwt>` verified in `middleware/auth.js` | Client sends `Authorization: Bearer <idToken>`; middleware verifies with `admin.auth().verifyIdToken(token)` → `req.user.uid` |
| `users.id` (autoincrement) | `users.id` = Firebase `uid` (keep the column so SQLite/exports still work) |

`middleware/auth.js` is the only file that changes for auth — same `req.user.id` contract downstream.

Frontend change: replace localStorage JWT handling with the Firebase JS SDK (`signInWithEmailAndPassword`, `onAuthStateChanged`); keep sending the token in the `Authorization` header so the backend contract is unchanged.

---

## 2. Tables → Firestore collections

| SQLite table | Firestore collection | Document shape |
|---|---|---|
| `users` | `users/{uid}` | name, email, avatarUrl, createdAt |
| `user_settings` | `users/{uid}/meta/settings` | single doc (merge-patch on update) |
| `categories` | `users/{uid}/categories/{id}` | name, icon, color, type, isDefault |
| `transactions` | `users/{uid}/transactions/{id}` | type, amount, categoryId, comment, date |
| `borrow_lend` | `users/{uid}/borrowLend/{id}` | type, person, amount, date, dueDate, status |
| `repayments` | `users/{uid}/borrowLend/{blId}/repayments/{id}` | amount, date, comment |
| `daily_budgets` | `users/{uid}/dailyBudgets/{date}` | limit (doc id = `YYYY-MM-DD`) |
| `monthly_budgets` | `users/{uid}/monthlyBudgets/{YYYY-MM}` | amount |
| `google_sheet_connections` | `users/{uid}/meta/googleSheet` | sheetUrl, spreadsheetId, lastSyncedAt |
| `recurring_expenses` | `users/{uid}/recurring/{id}` | name, amount, categoryId, frequency, nextDueDate |

Key points:

- **Documents live under the user path** → the Firestore security rule `allow read, write: if request.auth.uid == uid` reproduces the "user sees only their data" guarantee at the database level.
- IDs: use Firestore auto-IDs (or keep an `extId` field if you export to CSV/Excel and need stable sorting).
- No SQL joins: repositories denormalise (e.g. transactions store `categoryId` + `categoryName/icon/color` snapshot, or the repository batch-fetches categories — one extra `getAll` per list call).

### Suggested repository signatures (unchanged)

```js
// backend/src/repositories/transactions.js
export async function list(userId, filters) { ... }   // was sync SQL → now async
export async function create(userId, row)   { ... }
export async function update(userId, id, patch) { ... }
export async function remove(userId, id)    { ... }
```

> Note: Firestore methods are `async`. Today's repositories are synchronous. The migration therefore also touches services (make them `await`) — mechanical, but budget time for it. Alternatively, adopt `better-sqlite3`→ still sync; Firebase requires async.

---

## 3. Aggregations: on-read vs. read-time

SQLite computes analytics with `GROUP BY`. Firestore has no aggregation queries, so pick one:

| Approach | When |
|---|---|
| **Read + reduce in the service** (recommended to start) | Per-user data volumes are small (thousands of rows); a collection query filtered by `date` range then reduced in JS gives identical results to today's SQL. AnalyticsService keeps its exact logic. |
| **Scheduled rollups** (`dailySpend` counter docs updated transactionally) | When history grows large; use Cloud Functions `onCreate` for transactions to increment `users/{uid}/dailyTotals/{date}` and `.../monthlyTotals/{YYYY-MM}`. |

Balances (SPEC §2.1) can be computed on-read with the same reduce, or maintained as a `users/{uid}/meta/balances` doc updated inside a Firestore transaction on every write.

---

## 4. Cloud SQL (PostgreSQL) as the middle step

If you'd rather keep the SQL (as in the original blueprint) before going fully Firebase:

1. Create a Postgres instance (Cloud SQL / Neon / Supabase).
2. Translate `backend/src/db/schema.js` DDL — it is nearly ANSI SQL already (`INTEGER`, `TEXT`, `CHECK`, `REFERENCES`); replace `datetime('now')` defaults with `now()` and `AUTOINCREMENT` with `SERIAL`.
3. Replace the `node:sqlite` wrapper in `backend/src/db/index.js` with `pg` (`Pool`), keeping the same `all/get/run/transaction` helper signatures.
4. Everything above the repositories layer is untouched.

---

## 5. Migration checklist

- [ ] `npm i firebase-admin` in `backend/`, set `GOOGLE_APPLICATION_CREDENTIALS` in `.env`
- [ ] Rewrite `middleware/auth.js` to verify Firebase ID tokens
- [ ] Implement `repositories/*` against Firestore (async)
- [ ] Propagate `async/await` through services (mechanical)
- [ ] Add Firestore security rules (`request.auth.uid == userId`)
- [ ] Data export/import script: SQLite → Firestore (one-time, per user)
- [ ] Frontend: swap localStorage JWT for Firebase SDK session
- [ ] Google Sheets sync unchanged (service account already used)
- [ ] Keep SQLite for local development — repositories can be selected with `DB_DRIVER=sqlite|firestore` in `.env`

---

## 6. Keeping both drivers

```js
// backend/src/repositories/index.js
const driver = process.env.DB_DRIVER ?? 'sqlite';
export const users = driver === 'firestore' ? firestoreUsers : sqliteUsers;
```

This lets developers run SQLite locally while production uses Firestore — same service code, same API, same frontend.
