import { dueRecurring, setNextDue, listRecurring } from '../repositories/recurring.js';
import { createTransaction } from '../repositories/transactions.js';
import { today as todayStr, isoDate, daysInMonth } from '../utils/shape.js';

/**
 * SPEC §3.12 — materialise due recurring expenses as real transactions.
 * Advances each item's next_due_date by its frequency (day-clamped for months).
 */
export function processDue(userId, onDate = todayStr()) {
  const due = dueRecurring(userId, onDate);
  const created = [];

  for (const item of due) {
    // Create the transaction dated on the due date, then advance the schedule.
    createTransaction(userId, {
      type: 'expense',
      amount: item.amount,
      categoryId: item.categoryId,
      comment: item.name,
      date: item.nextDueDate,
    });

    const next = advance(item.nextDueDate, item.frequency);
    setNextDue(userId, item.id, next);
    created.push({ id: item.id, name: item.name, amount: item.amount, date: item.nextDueDate, next });
  }

  return { created, count: created.length };
}

function advance(dateStr, frequency) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);

  switch (frequency) {
    case 'daily':
      date.setDate(date.getDate() + 1);
      break;
    case 'weekly':
      date.setDate(date.getDate() + 7);
      break;
    case 'monthly': {
      const targetMonth = date.getMonth() + 1;
      const dim = daysInMonth(date.getFullYear(), targetMonth + 1 === 13 ? 1 : targetMonth + 1);
      const safeDay = Math.min(d, dim);
      date.setMonth(date.getMonth() + 1);
      date.setDate(safeDay);
      break;
    }
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }
  return isoDate(date);
}

export { listRecurring };
