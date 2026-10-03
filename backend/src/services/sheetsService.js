import { JWT } from 'google-auth-library';
import config from '../config.js';
import { getConnection, connect, markSynced, disconnect } from '../repositories/sheets.js';
import { listTransactions } from '../repositories/transactions.js';
import { listBorrowLend } from '../repositories/borrowLend.js';
import { monthlyRows as repaymentRows } from '../repositories/repayments.js';
import { fullStatement, archive } from './historyService.js';
import { pad2 } from '../utils/shape.js';

/**
 * SPEC §3.11 — Google Sheets is an OPTIONAL mirror.
 * SQLite is always the source of truth; sync writes three tabs.
 */

const SPREADSHEET_ID_RE = /docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/;

export function extractSpreadsheetId(url) {
  const m = String(url || '').match(SPREADSHEET_ID_RE);
  return m ? m[1] : null;
}

export function status(userId) {
  const row = getConnection(userId);
  if (!row) return { connected: false };
  return {
    connected: true,
    mode: config.googleEnabled ? 'live' : 'demo',
    sheetUrl: row.sheetUrl,
    spreadsheetId: row.spreadsheetId,
    status: row.status,
    lastSyncedAt: row.lastSyncedAt || null,
    warning: config.googleEnabled ? null
      : 'Sync requires Google credentials in backend/.env (demo mode).',
  };
}

export function connectSheet(userId, sheetUrl) {
  const spreadsheetId = extractSpreadsheetId(sheetUrl);
  if (!spreadsheetId) {
    const err = new Error('Invalid Google Sheets URL — expected https://docs.google.com/spreadsheets/d/<id>/...');
    err.status = 400;
    throw err;
  }
  const row = connect(userId, {
    sheetUrl,
    spreadsheetId,
    status: config.googleEnabled ? 'connected' : 'demo',
  });
  return {
    connected: true,
    mode: config.googleEnabled ? 'live' : 'demo',
    sheetUrl: row.sheetUrl,
    spreadsheetId: row.spreadsheetId,
    lastSyncedAt: row.lastSyncedAt || null,
    warning: config.googleEnabled ? null
      : 'Saved in demo mode — add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to backend/.env, and share the sheet with that account.',
  };
}

export async function syncNow(userId) {
  const conn = getConnection(userId);
  if (!conn) {
    const err = new Error('No Google Sheet connected');
    err.status = 400;
    throw err;
  }
  if (!config.googleEnabled) {
    const err = new Error('Google service account credentials not configured. Add GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_PRIVATE_KEY to backend/.env');
    err.status = 400;
    throw err;
  }

  const client = new JWT({
    email: config.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: config.GOOGLE_PRIVATE_KEY,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  const { token } = await client.getAccessToken();
  const auth = `Bearer ${token}`;
  const id = conn.spreadsheetId;

  // 1. Ensure the required tabs exist.
  let meta = await rest('GET', `/v4/spreadsheets/${id}?fields=sheets.properties`, auth);
  let existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  const wanted = ['Transactions', 'Borrow-Lend', 'Monthly Summary'];
  const missing = wanted.filter((t) => !existing.has(t));
  if (missing.length) {
    await rest('POST', `/v4/spreadsheets/${id}:batchUpdate`, auth, {
      requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
    });
    meta = await rest('GET', `/v4/spreadsheets/${id}?fields=sheets.properties`, auth);
    existing = new Set((meta.sheets || []).map((s) => s.properties.title));
  }

  // 2. Build values.
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const txRows = listTransactions(userId, { limit: 5000, sort: 'desc' }).items;
  const blRows = listBorrowLend(userId).items;
  const reps = repaymentRows(userId, '1970-01-01', '2099-12-31');
  const st = fullStatement(userId, year, month);
  const months = archive(userId);

  const transactions = [
    ['Date', 'Type', 'Category', 'Amount', 'Comment'],
    ...txRows.map((t) => [t.date, t.type, t.category?.name || '', t.amount, t.comment || '']),
  ];
  const borrowLend = [
    ['Date', 'Type', 'Person', 'Amount', 'Paid', 'Remaining', 'Status', 'Due Date', 'Comment'],
    ...blRows.map((b) => [b.date, b.type, b.person, b.amount, b.paid, b.remaining, b.status, b.dueDate || '', b.comment || '']),
  ];
  const summary = [
    ['Spend Wisely — Monthly Summary', ''],
    ['Generated', now.toISOString()],
    ['', ''],
    ['Month', st.label],
    ['Opening Balance', st.openingBalance],
    ['Money In', st.moneyIn],
    ['Money Out', st.moneyOut],
    ['Expenses', st.expenses],
    ['Money Lent', st.moneyLent],
    ['Money Borrowed', st.moneyBorrowed],
    ['Closing Balance', st.closingBalance],
    ['', ''],
    ['Month', 'Total Spent'],
    ...months.map((m) => [m.label, m.totalSpent]),
  ];

  // Unified rows across transactions, borrow/lend, and repayments (for Sheet1 if present)
  const unified = [];
  for (const t of txRows) {
    unified.push({
      date: t.date,
      type: t.type,
      categoryOrPerson: t.category?.name || (t.type === 'income' ? 'Income' : 'Expense'),
      amount: t.amount,
      comment: t.comment || '',
    });
  }
  for (const b of blRows) {
    unified.push({
      date: b.date,
      type: b.type,
      categoryOrPerson: b.person,
      amount: b.amount,
      comment: b.comment || '',
    });
  }
  for (const r of reps) {
    unified.push({
      date: r.date,
      type: 'repayment',
      categoryOrPerson: r.person,
      amount: r.amount,
      comment: r.comment || '',
    });
  }
  unified.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  const sheet1Data = [
    ['Date', 'Type', 'Category/Person', 'Amount', 'Comment'],
    ...unified.map((u) => [u.date, u.type, u.categoryOrPerson, u.amount, u.comment]),
  ];

  // 3. Clear existing ranges to avoid ghost rows when data is updated/deleted
  const clearRanges = [
    'Transactions!A1:Z5000',
    'Borrow-Lend!A1:Z5000',
    'Monthly Summary!A1:Z5000',
  ];
  const writeData = [
    { range: 'Transactions!A1', values: transactions },
    { range: 'Borrow-Lend!A1', values: borrowLend },
    { range: 'Monthly Summary!A1', values: summary },
  ];

  if (existing.has('Sheet1')) {
    clearRanges.unshift('Sheet1!A1:Z5000');
    writeData.unshift({ range: 'Sheet1!A1', values: sheet1Data });
  }

  try {
    await rest('POST', `/v4/spreadsheets/${id}/values:batchClear`, auth, {
      ranges: clearRanges,
    });
  } catch {
    /* non-fatal if clear ranges fail */
  }

  // 4. Write data.
  await rest('POST', `/v4/spreadsheets/${id}/values:batchUpdate?valueInputOption=USER_ENTERED`, auth, {
    valueInputOption: 'USER_ENTERED',
    data: writeData,
  });

  // 5. Style header row (bold) for each tab
  try {
    const formatSheets = (meta.sheets || []).filter((s) =>
      ['Sheet1', 'Transactions', 'Borrow-Lend', 'Monthly Summary'].includes(s.properties.title)
    );
    if (formatSheets.length) {
      await rest('POST', `/v4/spreadsheets/${id}:batchUpdate`, auth, {
        requests: formatSheets.map((s) => ({
          repeatCell: {
            range: {
              sheetId: s.properties.sheetId,
              startRowIndex: 0,
              endRowIndex: 1,
            },
            cell: {
              userEnteredFormat: {
                textFormat: { bold: true },
              },
            },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        })),
      });
    }
  } catch {
    /* styling is non-fatal */
  }

  const updated = markSynced(userId);
  return {
    synced: true,
    lastSyncedAt: updated.lastSyncedAt,
    counts: {
      transactions: txRows.length,
      borrowLend: blRows.length,
      repayments: reps.length,
      months: months.length,
      unified: unified.length,
    },
  };
}

export function disconnectSheet(userId) {
  return disconnect(userId);
}

async function rest(method, path, auth, body) {
  const res = await fetch(`https://sheets.googleapis.com${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { error: { message: text } }; }
  if (!res.ok) {
    const err = new Error(json?.error?.message || `Google Sheets API error (${res.status})`);
    err.status = 502;
    throw err;
  }
  return json;
}
