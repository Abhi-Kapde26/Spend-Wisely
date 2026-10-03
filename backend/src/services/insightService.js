import { dailyExpenseTotals, categoryExpenseTotals, sumTransactions } from '../repositories/transactions.js';
import { getSettings } from '../repositories/settings.js';
import { budgetPerformance, monthlySeries, summary } from './analyticsService.js';
import { today as todayStr, isoDate, round2 } from '../utils/shape.js';

/**
 * SPEC §3.8.1 — rule-based spending insights.
 * Plain rules today; this is the exact interface the Phase-5 ML service will replace.
 */
export function buildInsights(userId) {
  const items = [];
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const today = todayStr();

  // --- This week vs last week (same number of elapsed days) ---
  const dow = (now.getDay() + 6) % 7; // Mon = 0
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dow);
  const lastMonday = new Date(thisMonday);
  lastMonday.setDate(thisMonday.getDate() - 7);
  const lastSunday = new Date(lastMonday);
  lastSunday.setDate(lastMonday.getDate() + 6);

  const thisWeek = sumRange(userId, isoDate(thisMonday), today);
  const lastWeek = sumRange(userId, isoDate(lastMonday), isoDate(lastSunday));
  const topCatThisWeek = categoryExpenseTotals(userId, isoDate(thisMonday), today)[0];

  if (lastWeek.expense > 0 && thisWeek.expense > 0) {
    const change = Math.round(((thisWeek.expense - lastWeek.expense) / lastWeek.expense) * 100);
    if (Math.abs(change) >= 10 && topCatThisWeek) {
      items.push({
        type: change > 0 ? 'warning' : 'success',
        text: `You spent ${Math.abs(change)}% ${change > 0 ? 'more' : 'less'} on ${topCatThisWeek.name} this week.`,
      });
    }
  }

  // --- Monthly average ---
  const s = summary(userId);
  items.push({
    type: 'info',
    text: `Your average daily spending is ₹${fmt(s.avgDailySpending)}.`,
  });

  // --- Limit breaches ---
  const perf = budgetPerformance(userId, year, month);
  if (perf.stats.daysExceeded > 0) {
    items.push({
      type: 'warning',
      text: `You exceeded your daily limit ${perf.stats.daysExceeded} time${perf.stats.daysExceeded > 1 ? 's' : ''} this month.`,
    });
  }

  // --- Second-highest category ---
  const monthFrom = `${year}-${String(month).padStart(2, '0')}-01`;
  const monthTo = `${year}-${String(month).padStart(2, '0')}-${String(
    new Date(year, month, 0).getDate(),
  ).padStart(2, '0')}`;
  const cats = categoryExpenseTotals(userId, monthFrom, monthTo);
  if (cats.length >= 2) {
    items.push({
      type: 'info',
      text: `${cats[1].name} is your second-highest category.`,
    });
  }

  // --- Pace vs monthly budget projection ---
  const settings = getSettings(userId);
  const monthBudget = Number(settings?.monthlyBudget || 0);
  if (monthBudget > 0 && s.daysElapsed > 3) {
    const projected = round2((s.monthSpent / s.daysElapsed) * s.daysInMonth);
    if (projected > monthBudget * 1.1) {
      items.push({
        type: 'warning',
        text: `Based on this pace you may exceed your monthly budget by ₹${fmt(projected - monthBudget)}.`,
      });
    } else if (projected < monthBudget * 0.85) {
      items.push({
        type: 'success',
        text: `You're on track to finish the month ~₹${fmt(monthBudget - projected)} under budget.`,
      });
    }
  }

  // --- Today's discipline ---
  const todayTotals = sumRange(userId, today, today);
  if (todayTotals.expense === 0) {
    items.push({ type: 'success', text: "You haven't spent anything today — keep it up!" });
  }

  // --- Safe to spend nudge ---
  if (s.safeToSpendToday > 0) {
    items.push({
      type: 'info',
      text: `Safe to spend today: ₹${fmt(s.safeToSpendToday)}.`,
    });
  }

  return { items, generatedAt: new Date().toISOString() };
}

function sumRange(userId, from, to) {
  const t = sumTransactions(userId, { from, to });
  return { expense: round2(t.expense), income: round2(t.income) };
}

function fmt(n) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(n));
}
