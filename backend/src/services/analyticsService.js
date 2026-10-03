import {
  dailyExpenseTotals, categoryExpenseTotals, highestDay, sumTransactions,
} from '../repositories/transactions.js';
import { getSettings } from '../repositories/settings.js';
import { getMonthlyOverride } from '../repositories/budgets.js';
import { budgetStatus, dailyLimitFor, evaluateDay, monthInfo } from './budgetService.js';
import { today as todayStr, isoDate, round2, daysInMonth, pad2 } from '../utils/shape.js';

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** SPEC §3.8 — daily spending series, zero-filled (7/30/90/custom days). */
export function dailySeries(userId, days = 30) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - (days - 1));

  const from = isoDate(start);
  const to = isoDate(end);
  const totals = new Map(dailyExpenseTotals(userId, from, to).map((r) => [r.date, Number(r.total)]));

  const items = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = isoDate(d);
    items.push({ date: key, total: round2(totals.get(key) || 0) });
  }
  return { items, from, to, days };
}

/** SPEC §3.8 — week buckets (1st–7th, 8th–14th, …) for a month. */
export function weeklySeries(userId, year, month) {
  const dim = daysInMonth(year, month);
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(dim)}`;
  const totals = new Map(dailyExpenseTotals(userId, from, to).map((r) => [r.date, Number(r.total)]));

  const buckets = Math.ceil(dim / 7);
  const items = [];
  for (let i = 0; i < buckets; i++) {
    const startDay = i * 7 + 1;
    const endDay = Math.min(startDay + 6, dim);
    let total = 0;
    for (let d = startDay; d <= endDay; d++) {
      total += totals.get(`${year}-${pad2(month)}-${pad2(d)}`) || 0;
    }
    items.push({
      label: `Week ${i + 1}`,
      start: `${year}-${pad2(month)}-${pad2(startDay)}`,
      end: `${year}-${pad2(month)}-${pad2(endDay)}`,
      total: round2(total),
    });
  }
  return { items, year, month };
}

/** SPEC §3.8 — 12 monthly totals for a year, zero-filled. */
export function monthlySeries(userId, year) {
  const items = [];
  for (let m = 1; m <= 12; m++) {
    const from = `${year}-${pad2(m)}-01`;
    const to = `${year}-${pad2(m)}-${pad2(daysInMonth(year, m))}`;
    const t = sumTransactions(userId, { from, to, type: 'expense' });
    items.push({ month: m, label: MONTH_LABELS[m - 1], total: round2(t.expense) });
  }
  return { items, year };
}

/** SPEC §3.8 — category breakdown with percentages. */
export function categoryBreakdown(userId, from, to) {
  const rows = categoryExpenseTotals(userId, from, to);
  const grandTotal = round2(rows.reduce((s, r) => s + Number(r.total), 0));
  const items = rows.map((r) => ({
    category: { id: Number(r.category_id), name: r.name, icon: r.icon, color: r.color },
    total: round2(r.total),
    percent: grandTotal > 0 ? round2((Number(r.total) / grandTotal) * 100) : 0,
  }));
  return { items, total: grandTotal, from, to };
}

/** SPEC §3.8 — per-day limit performance for a month + stats. */
export function budgetPerformance(userId, year, month) {
  const settings = getSettings(userId);
  const dim = daysInMonth(year, month);
  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(dim)}`;
  const totals = new Map(dailyExpenseTotals(userId, from, to).map((r) => [r.date, Number(r.total)]));
  const globalLimit = round2(Number(settings?.dailyLimit || 0));

  const items = [];
  let daysWithin = 0;
  let daysExceeded = 0;
  let daysWithLimit = 0;

  for (let d = 1; d <= dim; d++) {
    const date = `${year}-${pad2(month)}-${pad2(d)}`;
    const spent = round2(totals.get(date) || 0);
    const limit = dailyLimitFor(userId, date);
    const status = budgetStatus(spent, limit);
    if (limit > 0) {
      daysWithLimit += 1;
      if (status === 'exceeded') daysExceeded += 1;
      else daysWithin += 1;
    }
    items.push({ date, spent, limit, status, hasData: totals.has(date) });
  }

  return {
    items,
    stats: {
      daysWithin,
      daysExceeded,
      totalDays: dim,
      daysWithLimit,
      globalLimit,
    },
    year,
    month,
  };
}

/** SPEC §3.8 — headline statistics. */
export function summary(userId) {
  const date = todayStr();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const elapsed = now.getDate();
  const monthInfoData = monthInfo(userId, date);
  const monthTotals = sumTransactions(userId, { from: monthInfoData.from, to: monthInfoData.to, type: 'expense' });
  const monthSpent = round2(monthTotals.expense);

  const cat = categoryBreakdown(userId, monthInfoData.from, monthInfoData.to);
  const high = highestDay(userId, monthInfoData.from, monthInfoData.to);
  const todayInfo = evaluateDay(userId, date);

  const settings = getSettings(userId);
  const dailyLimit = dailyLimitFor(userId, date);
  const weekSafe = Math.max(0, round2(dailyLimit * 7 - weekSpent(userId)));

  return {
    avgDailySpending: round2(monthSpent / Math.max(1, elapsed)),
    highestDay: high,
    highestCategory: cat.items[0]?.category || null,
    monthSpent,
    monthBudget: monthInfoData.budget,
    daysInMonth: monthInfoData.daysInMonth,
    daysElapsed: elapsed,
    safeToSpendToday: todayInfo.safeToSpend,
    safeToSpendWeek: weekSafe,
    currency: settings?.currency || 'INR',
  };
}

function weekSpent(userId) {
  const d = new Date();
  const dow = (d.getDay() + 6) % 7;
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const totals = dailyExpenseTotals(userId, isoDate(monday), todayStr());
  return round2(totals.reduce((s, r) => s + Number(r.total), 0));
}


