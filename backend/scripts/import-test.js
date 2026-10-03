/* Quick E2E test for SPEC §3.12 import endpoints.
 * Run: node scripts/import-test.js   (server must be up on :4000)
 * Creates its own throwaway user — never touches real accounts. */
const API = process.env.API_URL || 'http://localhost:4000';

let pass = 0;
let fail = 0;
const ok = (cond, label) => {
  if (cond) { pass += 1; console.log(`  PASS  ${label}`); }
  else { fail += 1; console.log(`  FAIL  ${label}`); }
};

async function req(method, path, { token, body } = {}) {
  const res = await fetch(`${API}/api${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : await res.text();
  return { status: res.status, data, headers: res.headers };
}

const stamp = Date.now();
const email = `import-test-${stamp}@example.com`;
const CSV = [
  'Date,Type,Category/Person,Amount,Comment',
  '2026-10-01,Income,Pocket Money,"5,000",October pocket money',
  '2026-10-02,Expense,Food,200,Dinner with friends',
  '02/10/2026,Expense,Travel,"₹150",Auto rickshaw',
  '2026-10-03,Borrow,Rahul,500,Lunch money',
  '2026-10-04,Lend,Aman,300,Travel fare',
  '2026-10-05,repayment,Rahul,200,Returned part',
  'not-a-date,Expense,Food,99,Bad date row',
  '2026-10-06,Expense,Food,,Missing amount',
].join('\n');

const USER_SHEET = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS319MkWu-sv5_VN4W8djFoytvTe6G2N9o2fZgvoN5o8f2Unw_W5nKqPjqVkfFEaL24t-PyZcS0pNy3/pub?output=csv';

async function main() {
  // --- register ---
  const reg = await req('POST', '/auth/register', {
    body: { name: 'ImportTester', email, password: 'Test1234!' },
  });
  ok(reg.status === 201 || reg.status === 200, `register (${reg.status})`);
  const token = reg.data.token || reg.data.accessToken;
  ok(Boolean(token), 'token received');

  // --- GET /import/status ---
  const st = await req('GET', '/import/status', { token });
  ok(st.status === 200, `GET /import/status (${st.status})`);
  ok(st.data.savedUrl === null, 'savedUrl starts null');
  ok(Array.isArray(st.data.history) && st.data.history.length === 0, 'history starts empty');
  ok(Array.isArray(st.data.template?.headers) && st.data.template.headers.includes('Date'), 'template.headers present');
  ok(Array.isArray(st.data.template?.example), 'template.example present');

  // --- GET /import/template (CSV file) ---
  const tpl = await fetch(`${API}/api/import/template`, { headers: { Authorization: `Bearer ${token}` } });
  const tplText = await tpl.text();
  ok(tpl.status === 200, `GET /import/template (${tpl.status})`);
  ok(tplText.includes('Date,Type,Category/Person,Amount,Comment'), 'template has headers');
  ok((tpl.headers.get('content-disposition') || '').includes('spend-wisely-import-template.csv'), 'template filename header');

  // --- POST /import/preview (CSV string) ---
  const pv = await req('POST', '/import/preview', { token, body: { csv: CSV } });
  ok(pv.status === 200, `POST /import/preview (${pv.status}: ${pv.data?.error || ''})`);
  ok(pv.data.columns?.[0] === 'Date', 'columns captured');
  ok(pv.data.mapping?.date === 'Date' && pv.data.mapping?.amount === 'Amount', 'date+amount mapped');
  ok(pv.data.mapping?.category === 'Category/Person', 'category/person mapped');
  ok(pv.data.stats?.total === 8, `stats.total = 8 (got ${pv.data.stats?.total})`);
  ok(pv.data.stats?.valid === 6, `stats.valid = 6 (got ${pv.data.stats?.valid})`);
  ok(pv.data.stats?.invalid === 2, `stats.invalid = 2 (got ${pv.data.stats?.invalid})`);
  ok(pv.data.rows?.length === 10 || pv.data.rows?.length === 8, `rows previewed (${pv.data.rows?.length})`);
  ok(pv.data.errors?.length === 2, `2 row errors reported (${pv.data.errors?.length})`);
  ok(pv.data.stats?.byType?.income === 1 && pv.data.stats?.byType?.expense === 2, 'byType income/expense');
  ok(pv.data.stats?.byType?.borrow === 1 && pv.data.stats?.byType?.lend === 1, 'byType borrow/lend');
  ok(pv.data.stats?.byType?.repayment === 1, 'byType repayment');
  const parsedRow = pv.data.rows.find((r) => r.comment === 'Auto rickshaw');
  ok(parsedRow?.date === '2026-10-02' && parsedRow?.amount === 150, `DD/MM/YYYY + ₹ parsing (got ${parsedRow?.date}/${parsedRow?.amount})`);

  // --- POST /import/preview with user's EMPTY sheet URL ---
  const empty = await req('POST', '/import/preview', { token, body: { url: USER_SHEET } });
  ok(empty.status === 400, `empty sheet → 400 (${empty.status})`);
  ok(String(empty.data?.error || '').toLowerCase().includes('empty'), `empty sheet message ("${empty.data?.error}")`);

  // --- POST /import/preview with a non-Google URL (SSRF guard) ---
  const ssrf = await req('POST', '/import/preview', { token, body: { url: 'https://evil.example.com/x.csv' } });
  ok(ssrf.status === 400, `non-Google host → 400 (${ssrf.status})`);

  // --- POST /import/preview with neither url nor csv ---
  const none = await req('POST', '/import/preview', { token, body: {} });
  ok(none.status === 400, `missing source → 400 (${none.status})`);

  // --- POST /import/commit ---
  const cm = await req('POST', '/import/commit', { token, body: { csv: CSV } });
  ok(cm.status === 200, `POST /import/commit (${cm.status}: ${cm.data?.error || ''})`);
  ok(cm.data.imported === 6, `imported = 6 (got ${cm.data.imported})`);
  ok(cm.data.skipped === 0, `skipped = 0 (got ${cm.data.skipped})`);
  ok(cm.data.errors?.length === 2, `commit errors = 2 (got ${cm.data.errors?.length})`);
  ok(typeof cm.data.historyId === 'number', 'historyId returned');

  // --- re-commit same CSV → duplicates skipped ---
  const cm2 = await req('POST', '/import/commit', { token, body: { csv: CSV } });
  ok(cm2.status === 200 && cm2.data.imported === 0, `re-commit imported=0 (got ${cm2.data?.imported})`);
  ok(cm2.data.skipped === 6, `re-commit skipped=6 (got ${cm2.data?.skipped})`);

  // --- re-commit with skipDuplicates=false → duplicates re-import ---
  const cm3 = await req('POST', '/import/commit', { token, body: { csv: CSV, skipDuplicates: false } });
  ok(cm3.status === 200 && cm3.data.imported === 6, `skipDuplicates=false imported=6 (got ${cm3.data?.imported})`);

  // --- data really landed: history + transaction list ---
  const hist = await req('GET', '/history?limit=50', { token });
  const comments = (hist.data?.items || []).map((i) => i.comment || i.description || '');
  ok(comments.some((c) => c.includes('October pocket money')), 'income row visible in history');
  ok(comments.some((c) => c.includes('Auto rickshaw')), '₹ row visible in history');

  const bl = await req('GET', '/borrow-lend', { token });
  const people = (bl.data?.items || []).map((i) => i.person);
  ok(people.includes('Rahul') && people.includes('Aman'), 'borrow/lend rows imported');
  ok((bl.data?.items || []).some((i) => i.type === 'repayment' || i.paid > 0), 'repayment applied to open record');

  // --- category auto-created ---
  const cats = await req('GET', '/categories', { token });
  const catNames = (cats.data?.items || cats.data?.categories || []).map((c) => c.name);
  ok(catNames.includes('Food'), `missing category auto-created (got: ${catNames.join(', ')})`);

  // --- PUT /import/settings with user's sheet URL ---
  const put = await req('PUT', '/import/settings', { token, body: { sheetUrl: USER_SHEET } });
  ok(put.status === 200 && put.data.savedUrl === USER_SHEET, `PUT /import/settings (${put.status})`);

  const putBad = await req('PUT', '/import/settings', { token, body: { sheetUrl: 'https://notgoogle.com/x' } });
  ok(putBad.status === 400, `PUT invalid URL → 400 (${putBad.status})`);

  // --- status reflects settings + history ---
  const st2 = await req('GET', '/import/status', { token });
  ok(st2.data.savedUrl === USER_SHEET, 'savedUrl persisted');
  ok(st2.data.history?.length === 3, `history has 3 entries (got ${st2.data.history?.length})`);
  ok(st2.data.history?.[0]?.source === 'upload', 'history ordered newest first');

  // --- DELETE /import/settings ---
  const del = await req('DELETE', '/import/settings', { token });
  ok(del.status === 200 && del.data.success === true, 'DELETE /import/settings');
  const st3 = await req('GET', '/import/status', { token });
  ok(st3.data.savedUrl === null, 'savedUrl cleared');

  // --- auth required ---
  const noAuth = await req('GET', '/import/status');
  ok(noAuth.status === 401, `unauthenticated → 401 (${noAuth.status})`);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error('FATAL:', e); process.exit(1); });
