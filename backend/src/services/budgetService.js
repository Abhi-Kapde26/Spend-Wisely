import { getSettings } from '../repositories/settings.js';
import { getDailyOverride, getMonthlyOverride } from '../repositories/budgets.js';
import { dailyExpenseTotals, sumTransactions } from '../repositories/transactions.js';
import { today as todayStr, isoDate, round2, daysInMonth } from '../utils/shape.js';

/**
 * SPEC §2.2 — daily budget evaluation.
 * Never blocks an over-limit expense; it only reports status.
 */
export function budgetStatus(spent, limit) {
  if (!limit || limit <= 0) return 'none';
  const pct = spent / limit;
  if (pct > 1) return 'exceeded';
  if (pct > 0.9) return 'near_limit';
  if (pct > 0.75) return 'warning';
  return 'safe';
}

/** The effective limit for a given day: per-day override → global daily_limit → none. */
export function dailyLimitFor(userId, date) {
  const override = getDailyOverride(userId, date);
  if (override) return round2(Number(override.limitAmount));
  const settings = getSettings(userId);
  return round2(Number(settings?.dailyLimit || 0));
}

/** Evaluate a specific day's budget. */
export function evaluateDay(userId, date = todayStr()) {
  const limit = dailyLimitFor(userId, date);
  const totals = dailyExpenseTotals(userId, date, date);
  const spent = round2(totals.reduce((s, r) => s + Number(r.total), 0));
  const remaining = round2(limit - spent);

  return {
    date,
    spent,
    limit,
    remaining,
    safeToSpend: Math.max(0, remaining),
    overAmount: Math.max(0, round2(spent - limit)),
    status: budgetStatus(spent, limit),
    progress: limit > 0 ? Math.min(1, spent / limit) : 0,
  };
}

/** Current-week totals (Mon → given date). */
export function weekInfo(userId, date = todayStr()) {
  const d = new Date(`${date}T00:00:00`);
  const dow = (d.getDay() + 6) % 7; // Mon = 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - dow);
  const start = isoDate(monday);
  const limit = round2(dailyLimitFor(userId, date) * 7);
  const totals = dailyExpenseTotals(userId, start, date);
  const spent = round2(totals.reduce((s, r) => s + Number(r.total), 0));
  return { spent, limit, safeToSpend: Math.max(0, round2(limit - spent)), start, end: date };
}

/** Current-month spending vs. monthly budget (override → settings). */
export function monthInfo(userId, date = todayStr()) {
  const d = new Date(`${date}T00:00:00`);
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;

  const settings = getSettings(userId);
  const override = getMonthlyOverride(userId, year, month);
  const budget = round2(override ? Number(override.amount) : Number(settings?.monthlyBudget || 0));

  const totals = sumTransactions(userId, { from, to });
  const spent = round2(totals.expense);
  const remaining = round2(budget - spent);

  return {
    year, month, from, to,
    spent,
    budget,
    income: round2(totals.income),
    remaining,
    progress: budget > 0 ? round2(spent / budget) : 0,
    status: budgetStatus(spent, budget),
    daysInMonth: daysInMonth(year, month),
  };
}
