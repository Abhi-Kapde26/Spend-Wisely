/**
 * End-to-end smoke test against a running API (default http://localhost:4000).
 * Run: npm run smoke   (start the server first: npm run dev)
 *
 * Verifies SPEC §7: auth → setup → dashboard math → transactions →
 * borrow/lend/repayments → analytics → history/statements → exports →
 * sheets → recurring → security (cross-user isolation).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.API_URL || 'http://localhost:4000/api';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP = path.join(__dirname, '..', 'data');
fs.mkdirSync(TMP, { recursive: true });

let pass = 0;
let fail = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  ok   ${name}`); }
  else { fail += 1; failures.push(`${name} ${detail}`); console.log(`  FAIL ${name} ${detail}`); }
}

function near(a, b) { return Math.abs(Number(a) - Number(b)) < 0.011; }

async function api(method, url, { token, body, raw = false } = {}) {
  const res = await fetch(`${BASE}${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (raw) return { res, buffer: Buffer.from(await res.arrayBuffer()) };
  let json = null;
  const text = await res.text();
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { res, json };
}

const stamp = Date.now();
const USER = { name: 'Test User', email: `test${stamp}@spendwise.dev`, password: 'secret123' };
const OTHER = { name: 'Other User', email: `other${stamp}@spendwise.dev`, password: 'secret123' };
const today = new Date().toISOString().slice(0, 10);

async function main() {
  console.log('\n=== 1. AUTH ===');
  let r = await api('POST', '/auth/register', { body: USER });
  check('register → 201 + token', r.res.status === 201 && Boolean(r.json?.token), `status=${r.res.status}`);
  const token = r.json?.token;
  const userId = r.json?.user?.id;

  r = await api('POST', '/auth/register', { body: { ...USER, email: `dup${stamp}@x.dev` } });
  check('duplicate email → 201 (different addr ok)', r.res.status === 201);

  r = await api('POST', '/auth/register', { body: USER });
  check('duplicate email → 409', r.res.status === 409, `status=${r.res.status}`);

  r = await api('POST', '/auth/login', { body: { email: USER.email, password: 'wrong' } });
  check('bad password → 401', r.res.status === 401);

  r = await api('POST', '/auth/login', { body: USER });
  check('login → token', r.res.status === 200 && Boolean(r.json?.token));

  r = await api('GET', '/auth/me', { token });
  check('me → user + settings', r.res.status === 200 && r.json?.user?.email === USER.email);
  check('default categories seeded', r.res.status === 200); // verified below
  const onboardingBefore = r.json?.onboardingComplete;

  r = await api('GET', '/categories', { token });
  const cats = r.json?.items || [];
  check('categories seeded (≥15)', cats.length >= 15, `got=${cats.length}`);
  const food = cats.find((c) => c.name === 'Food');
  const pocket = cats.find((c) => c.name === 'Pocket Money');
  check('Food expense category present', Boolean(food));
  check('Pocket Money income category present', Boolean(pocket));

  console.log('\n=== 2. SETUP (opening 5000, pocket 5000, daily 500) ===');
  r = await api('POST', '/setup', { token, body: { openingBalance: 5000, monthlyPocketMoney: 5000, dailyLimit: 500, monthlyBudget: 5000, currency: 'INR' } });
  check('setup → 200', r.res.status === 200 && r.json?.settings?.onboardingCompleted === true);

  r = await api('GET', '/auth/me', { token });
  check('onboardingComplete now true', r.json?.onboardingComplete === true && onboardingBefore === false);

  r = await api('GET', '/dashboard', { token });
  check('dashboard → available 5000', near(r.json?.availableBalance, 5000), `got=${r.json?.availableBalance}`);
  check('dashboard → today limit 500', near(r.json?.today?.limit, 500));
  check('dashboard → status none→safe', ['safe', 'none'].includes(r.json?.today?.status), `status=${r.json?.today?.status}`);

  console.log('\n=== 3. EXPENSE (200 Food today) ===');
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: 200, categoryId: food.id, comment: 'Dinner', date: today } });
  check('expense → 201', r.res.status === 201 && Boolean(r.json?.transaction?.id), `status=${r.res.status} ${JSON.stringify(r.json)}`);
  const txId = r.json?.transaction?.id;

  r = await api('GET', '/dashboard', { token });
  check('available 5000 → 4800', near(r.json?.availableBalance, 4800), `got=${r.json?.availableBalance}`);
  check('today spent 200', near(r.json?.today?.spent, 200), `got=${r.json?.today?.spent}`);
  check('safe to spend 300', near(r.json?.today?.safeToSpend, 300));
  check('status safe', r.json?.today?.status === 'safe', `status=${r.json?.today?.status}`);

  console.log('\n=== 4. OVER-LIMIT EXPENSE still saves (400 more = 600/500) ===');
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: 400, categoryId: food.id, comment: 'Over limit', date: today } });
  check('over-limit expense → 201 (never blocked)', r.res.status === 201);
  r = await api('GET', '/dashboard', { token });
  check('status exceeded', r.json?.today?.status === 'exceeded', `status=${r.json?.today?.status}`);
  check('overAmount 100', near(r.json?.today?.overAmount, 100), `got=${r.json?.today?.overAmount}`);
  const overTxId = r.json?.todayTransactions?.[0]?.id || null;

  console.log('\n=== 5. INCOME (+5000 pocket money) ===');
  r = await api('POST', '/transactions', { token, body: { type: 'income', amount: 5000, categoryId: pocket.id, comment: 'October pocket money', date: today } });
  check('income → 201', r.res.status === 201);
  r = await api('GET', '/dashboard', { token });
  // 5000 opening − 200 − 400 expenses + 5000 income = 9400
  check('available 9400', near(r.json?.availableBalance, 9400), `got=${r.json?.availableBalance}`);

  console.log('\n=== 6. BORROW 500 from Rahul ===');
  r = await api('POST', '/borrow-lend', { token, body: { type: 'borrow', person: 'Rahul', amount: 500, date: today, comment: 'Lunch money' } });
  check('borrow → 201', r.res.status === 201 && r.json?.item?.status === 'pending', `status=${r.res.status}`);
  const rahulId = r.json?.item?.id;
  r = await api('GET', '/dashboard', { token });
  check('available +500 → 9900', near(r.json?.availableBalance, 9900), `got=${r.json?.availableBalance}`);
  check('moneyToPay 500', near(r.json?.moneyToPay, 500), `got=${r.json?.moneyToPay}`);
  check('netPosition unchanged 9400', near(r.json?.netPosition, 9400), `got=${r.json?.netPosition}`);

  console.log('\n=== 7. LEND 300 to Aman ===');
  r = await api('POST', '/borrow-lend', { token, body: { type: 'lend', person: 'Aman', amount: 300, date: today, dueDate: today, comment: 'Travel' } });
  check('lend → 201', r.res.status === 201);
  const amanId = r.json?.item?.id;
  r = await api('GET', '/dashboard', { token });
  check('available −300 → 9600', near(r.json?.availableBalance, 9600), `got=${r.json?.availableBalance}`);
  check('moneyToReceive 300', near(r.json?.moneyToReceive, 300), `got=${r.json?.moneyToReceive}`);
  check('moneyToPay 500', near(r.json?.moneyToPay, 500));
  check('netPosition still 9400 (borrow/lend shift cash, not wealth)', near(r.json?.netPosition, 9400), `got=${r.json?.netPosition}`);
  check('overdue lend appears in dues', (r.json?.upcomingDues || []).some((d) => d.id === amanId));

  console.log('\n=== 8. REPAYMENT 200 from Rahul → partially_paid ===');
  r = await api('POST', '/borrow-lend/repayments', { token, body: { borrowLendId: rahulId, amount: 200, date: today } });
  check('repayment → 201', r.res.status === 201, JSON.stringify(r.json));
  check('status partially_paid', r.json?.item?.status === 'partially_paid', `status=${r.json?.item?.status}`);
  check('remaining 300', near(r.json?.item?.remaining, 300));
  r = await api('GET', '/dashboard', { token });
  // 9600 − 200 cash paid back
  check('available −200 → 9400', near(r.json?.availableBalance, 9400), `got=${r.json?.availableBalance}`);
  check('moneyToPay 300', near(r.json?.moneyToPay, 300), `got=${r.json?.moneyToPay}`);

  r = await api('POST', '/borrow-lend/repayments', { token, body: { borrowLendId: rahulId, amount: 999, date: today } });
  check('over-repayment rejected → 400', r.res.status === 400, `status=${r.res.status}`);

  r = await api('POST', '/borrow-lend/repayments', { token, body: { borrowLendId: rahulId, amount: 300, date: today } });
  check('final repayment → completed', r.json?.item?.status === 'completed', `status=${r.json?.item?.status}`);
  r = await api('GET', '/dashboard', { token });
  check('moneyToPay 0', near(r.json?.moneyToPay, 0), `got=${r.json?.moneyToPay}`);
  // 5000 − 600 expenses + 5000 income + 500 borrowed − 300 lent − 500 repaid = 9100
  check('available 9100 after paying back 500', near(r.json?.availableBalance, 9100), `got=${r.json?.availableBalance}`);
  check('netPosition still 9400', near(r.json?.netPosition, 9400), `got=${r.json?.netPosition}`);

  console.log('\n=== 9. ANALYTICS ===');
  for (const ep of ['/analytics/daily?days=7', '/analytics/weekly', '/analytics/monthly', '/analytics/category', '/analytics/budget-performance', '/analytics/summary', '/analytics/insights']) {
    r = await api('GET', ep, { token });
    check(`GET ${ep} → 200 JSON`, r.res.status === 200 && typeof r.json === 'object', `status=${r.res.status}`);
  }
  r = await api('GET', '/analytics/daily?days=7', { token });
  check('daily series has 7 zero-filled points', r.json?.items?.length === 7, `got=${r.json?.items?.length}`);
  r = await api('GET', '/analytics/category', { token });
  check('category total > 0', Number(r.json?.total) > 0, `total=${r.json?.total}`);
  check('category percentages present', (r.json?.items || []).every((i) => typeof i.percent === 'number'));
  r = await api('GET', '/analytics/summary', { token });
  check('summary has avgDailySpending', typeof r.json?.avgDailySpending === 'number');
  r = await api('GET', '/analytics/insights', { token });
  check('insights array returned', Array.isArray(r.json?.items) && r.json.items.length > 0, `n=${r.json?.items?.length}`);

  console.log('\n=== 10. HISTORY + STATEMENTS ===');
  const [yy, mm] = [Number(today.slice(0, 4)), Number(today.slice(5, 7))];
  r = await api('GET', `/history?year=${yy}&month=${mm}&limit=100`, { token });
  check('history items ≥ 4', r.json?.total >= 4, `total=${r.json?.total}`);
  check('history has unified source field', (r.json?.items || []).every((i) => ['transaction', 'borrow', 'lend', 'repayment'].includes(i.source)));
  check('history summary present', typeof r.json?.summary?.closingBalance === 'number');

  r = await api('GET', `/history?year=${yy}&month=${mm}&source=borrow`, { token });
  check('filter source=borrow', (r.json?.items || []).every((i) => i.source === 'borrow') && r.json.total >= 1, `total=${r.json?.total}`);

  r = await api('GET', `/history?year=${yy}&month=${mm}&search=Rahul`, { token });
  check('search "Rahul" finds rows', r.json?.total >= 1, `total=${r.json?.total}`);

  r = await api('GET', `/history?year=${yy}&month=${mm}&search=Dinner`, { token });
  check('search "Dinner" finds rows', r.json?.total >= 1, `total=${r.json?.total}`);

  r = await api('GET', `/monthly/${yy}/${mm}`, { token });
  check('statement opening 5000', near(r.json?.openingBalance, 5000), `got=${r.json?.openingBalance}`);
  // moneyIn = 5000 income + 500 borrow (the 300 lend was never repaid, so nothing came back)
  check('statement moneyIn = 5500', near(r.json?.moneyIn, 5500), `got=${r.json?.moneyIn}`);
  // moneyOut = 600 expenses + 300 lent + 500 repaid to Rahul
  check('statement moneyOut = 1400', near(r.json?.moneyOut, 1400), `got=${r.json?.moneyOut}`);
  check('statement closing = 9100', near(r.json?.closingBalance, 9100), `got=${r.json?.closingBalance}`);

  r = await api('GET', '/monthly', { token });
  check('archive lists current month', (r.json?.items || []).some((m) => m.year === yy && m.month === mm));

  r = await api('GET', `/monthly/compare?year=${yy}&month=${mm}`, { token });
  check('compare returns current + previous', Boolean(r.json?.current && r.json?.previous));

  console.log('\n=== 11. EXPORTS ===');
  {
    const { res, buffer } = await api('GET', `/export/csv?from=${yy}-${String(mm).padStart(2, '0')}-01&to=${today}`, { token, raw: true });
    const csv = buffer.toString('utf8');
    check('csv → 200 + attachment', res.status === 200 && (res.headers.get('content-disposition') || '').includes('attachment'), `status=${res.status}`);
    check('csv has BOM + header + rows', csv.charCodeAt(0) === 0xFEFF && csv.includes('Date,Type,') && csv.split('\r\n').length > 4, `len=${csv.length}`);
    fs.writeFileSync(path.join(TMP, 'smoke-export.csv'), buffer);
  }
  {
    const { res, buffer } = await api('GET', `/export/excel?from=${yy}-${String(mm).padStart(2, '0')}-01&to=${today}`, { token, raw: true });
    check('excel → 200 + xlsx magic bytes', res.status === 200 && buffer.subarray(0, 2).toString() === 'PK', `status=${res.status} size=${buffer.length}`);
    fs.writeFileSync(path.join(TMP, 'smoke-export.xlsx'), buffer);
  }
  {
    const { res, buffer } = await api('GET', `/export/pdf?year=${yy}&month=${mm}`, { token, raw: true });
    check('pdf → 200 + %PDF header', res.status === 200 && buffer.subarray(0, 5).toString() === '%PDF-', `status=${res.status} size=${buffer.length}`);
    check('pdf non-trivial size', buffer.length > 2000, `size=${buffer.length}`);
    fs.writeFileSync(path.join(TMP, 'smoke-export.pdf'), buffer);
  }

  console.log('\n=== 12. GOOGLE SHEETS ===');
  r = await api('GET', '/google-sheets/status', { token });
  check('status disconnected', r.json?.connected === false);
  r = await api('POST', '/google-sheets/connect', { token, body: { sheetUrl: 'https://docs.google.com/spreadsheets/d/1AbCDeFgHiJkLmNoPqRsTuVwXyZ/edit#gid=0' } });
  check('connect valid URL → connected (demo mode)', r.json?.connected === true && r.json?.mode === 'demo', JSON.stringify(r.json));
  r = await api('POST', '/google-sheets/connect', { token, body: { sheetUrl: 'https://example.com/not-a-sheet' } });
  check('connect invalid URL → 400', r.res.status === 400, `status=${r.res.status}`);
  r = await api('POST', '/google-sheets/sync', { token });
  check('sync without creds → 400 with guidance', r.res.status === 400 && /credentials/i.test(r.json?.error || ''), `status=${r.res.status} ${r.json?.error}`);
  r = await api('DELETE', '/google-sheets/disconnect', { token });
  check('disconnect → success', r.json?.success === true);

  console.log('\n=== 13. RECURRING ===');
  r = await api('POST', '/recurring', { token, body: { name: 'Netflix', amount: 199, categoryId: cats.find((c) => c.name === 'Entertainment').id, frequency: 'monthly', startDate: today } });
  check('create recurring → 201', r.res.status === 201, JSON.stringify(r.json));
  const recId = r.json?.item?.id;
  r = await api('POST', '/recurring/process', { token });
  check('process creates due transaction', r.json?.count >= 1, `count=${r.json?.count}`);
  r = await api('GET', `/recurring`, { token });
  check('next_due_date advanced past today', (r.json?.items || []).every((i) => i.nextDueDate > today), JSON.stringify(r.json?.items?.[0]?.nextDueDate));
  r = await api('DELETE', `/recurring/${recId}`, { token });
  check('delete recurring → success', r.json?.success === true);

  console.log('\n=== 14. CRUD + validation ===');
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: -5, categoryId: food.id, date: today } });
  check('negative amount → 400', r.res.status === 400, `status=${r.res.status}`);
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: 10, categoryId: 999999, date: today } });
  check('unknown category → 400', r.res.status === 400, `status=${r.res.status}`);
  const incomeOnly = cats.find((c) => c.type === 'income');
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: 10, categoryId: incomeOnly.id, date: today } });
  check('income category on expense → 400', r.res.status === 400, `status=${r.res.status}`);

  r = await api('PUT', `/transactions/${txId}`, { token, body: { amount: 250, comment: 'Dinner (edited)' } });
  check('edit transaction → amount 250', near(r.json?.transaction?.amount, 250), JSON.stringify(r.json));
  r = await api('DELETE', `/transactions/${overTxId || txId}`, { token });
  check('delete transaction → success', r.json?.success === true);

  r = await api('POST', '/categories', { token, body: { name: 'Pets', icon: '🐶', color: '#f59e0b', type: 'expense' } });
  check('create custom category → 201', r.res.status === 201, JSON.stringify(r.json));
  const petId = r.json?.category?.id;
  r = await api('POST', '/categories', { token, body: { name: 'Pets', icon: '🐶', color: '#f59e0b', type: 'expense' } });
  check('duplicate category name → 409', r.res.status === 409, `status=${r.res.status}`);
  r = await api('POST', '/transactions', { token, body: { type: 'expense', amount: 999, categoryId: petId, comment: 'In use', date: today } });
  const petTxId = r.json?.transaction?.id;
  r = await api('DELETE', `/categories/${petId}`, { token });
  check('delete category in use → 409', r.res.status === 409, `status=${r.res.status}`);
  r = await api('DELETE', `/categories/${petId}?force=1`, { token });
  check('force delete → success', r.json?.success === true);
  r = await api('DELETE', `/transactions/${petTxId}`, { token });
  check('cleanup', r.json?.success === true);

  r = await api('PUT', '/budgets', { token, body: { dailyLimit: 600 } });
  check('update daily limit → 600', near(r.json?.settings?.dailyLimit, 600));
  r = await api('POST', '/budgets/daily', { token, body: { date: today, limit: 750 } });
  check('daily override created', near(r.json?.override?.limit, 750));
  r = await api('GET', '/dashboard', { token });
  check('override wins over global limit', near(r.json?.today?.limit, 750), `got=${r.json?.today?.limit}`);
  r = await api('DELETE', `/budgets/daily/${today}`, { token });
  check('override removed', r.json?.success === true);

  r = await api('PUT', '/settings/password', { token, body: { currentPassword: 'wrong', newPassword: 'newpass1' } });
  check('wrong current password → 400', r.res.status === 400);
  r = await api('PUT', '/settings/password', { token, body: { currentPassword: USER.password, newPassword: 'newpass1' } });
  check('change password → success', r.json?.success === true);
  r = await api('POST', '/auth/login', { body: { email: USER.email, password: 'newpass1' } });
  check('login with new password → token', Boolean(r.json?.token));
  USER.password = 'newpass1';

  console.log('\n=== 15. SECURITY — cross-user isolation ===');
  r = await api('POST', '/auth/register', { body: OTHER });
  const token2 = r.json?.token;
  r = await api('GET', '/dashboard', { token: token2 });
  check('user2 dashboard empty (no user1 data)', Number(r.json?.availableBalance) === 0 && r.json?.today?.spent === 0, `bal=${r.json?.availableBalance}`);
  r = await api('GET', `/transactions/${txId}`, { token: token2 });
  check('user2 cannot read user1 transaction', r.res.status !== 200, `status=${r.res.status}`);
  r = await api('PUT', `/transactions/${txId}`, { token: token2, body: { amount: 1 } });
  check('user2 cannot edit user1 transaction', r.res.status === 404 || r.res.status === 401 || r.res.status === 400, `status=${r.res.status}`);
  r = await api('DELETE', `/borrow-lend/${amanId}`, { token: token2 });
  check('user2 cannot delete user1 borrow/lend', r.res.status === 404, `status=${r.res.status}`);
  r = await api('GET', '/dashboard');
  check('no token → 401', r.res.status === 401, `status=${r.res.status}`);
  r = await api('GET', '/dashboard', { token: 'not.a.real.token' });
  check('garbage token → 401', r.res.status === 401, `status=${r.res.status}`);
  r = await api('GET', '/dashboard', { token: `${token}x` });
  check('tampered token → 401', r.res.status === 401, `status=${r.res.status}`);

  // Report
  console.log(`\n================ SMOKE RESULT: ${pass} passed, ${fail} failed ================`);
  if (failures.length) {
    console.log('Failures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  process.exit(fail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('SMOKE CRASHED:', err);
  process.exit(1);
});
