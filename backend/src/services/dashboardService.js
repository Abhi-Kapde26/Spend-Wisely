import { getBalance } from './balanceService.js';
import { evaluateDay, weekInfo, monthInfo } from './budgetService.js';
import { listTransactions, shapeTransaction } from '../repositories/transactions.js';
import { upcomingDues, outstanding } from '../repositories/borrowLend.js';
import { dueRecurring } from '../repositories/recurring.js';
import { getSettings } from '../repositories/settings.js';
import { today as todayStr, round2, isoDate } from '../utils/shape.js';

/** GET /dashboard — one round-trip payload for the whole dashboard page (SPEC §3.3). */
export function buildDashboard(userId) {
  const date = todayStr();
  const balance = getBalance(userId);
  const todayInfo = evaluateDay(userId, date);
  const week = weekInfo(userId, date);
  const month = monthInfo(userId, date);
  const settings = getSettings(userId);

  const todayRows = listTransactions(userId, { from: date, to: date, limit: 10, sort: 'desc' });
  const recentRows = listTransactions(userId, { limit: 5, sort: 'desc' });

  const dueTo = isoDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));
  const dues = upcomingDues(userId, dueTo);
  const out = outstanding(userId);

  return {
    availableBalance: balance.availableBalance,
    moneyToReceive: round2(out.toReceive),
    moneyToPay: round2(out.toPay),
    netPosition: balance.netPosition,
    currency: settings?.currency || 'INR',
    today: {
      ...todayInfo,
      count: todayRows.total,
    },
    week,
    month: {
      ...month,
      progress: month.progress,
    },
    todayTransactions: todayRows.items,
    recentTransactions: recentRows.items,
    upcomingDues: dues,
    hasRecurringDue: dueRecurring(userId, date).length > 0,
  };
}
