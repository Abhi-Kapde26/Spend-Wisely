import { todayISO } from './format.js';

/**
 * Normalizes a borrow/lend row into the §3.6 item shape.
 * `/borrow-lend` already returns paid/remaining; dashboard `upcomingDues`
 * may return the raw row, so we fill the gaps defensively.
 */
export function normalizeItem(raw) {
  if (!raw) return null;
  const amount = Number(raw.amount) || 0;
  const paid = Number(raw.paid) || 0;
  const remaining =
    raw.remaining !== undefined && raw.remaining !== null
      ? Number(raw.remaining)
      : Math.max(0, amount - paid);
  let status = raw.status;
  if (!status) {
    if (paid <= 0) status = 'pending';
    else if (paid >= amount) status = 'completed';
    else status = 'partially_paid';
  }
  const dueDate = raw.dueDate || raw.due_date || null;
  const overdue =
    typeof raw.overdue === 'boolean'
      ? raw.overdue
      : Boolean(dueDate && status !== 'completed' && dueDate < todayISO());

  return { ...raw, amount, paid, remaining, status, dueDate, overdue };
}

export function isPending(item) {
  return item && item.status !== 'completed';
}
