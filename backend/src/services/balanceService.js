import { getSettings } from '../repositories/settings.js';
import { sumTransactions } from '../repositories/transactions.js';
import { sums, outstanding } from '../repositories/borrowLend.js';
import { round2 } from '../utils/shape.js';

/**
 * SPEC §2.1 — the money formulas.
 *
 *   available = opening + income − expenses + borrowed − lent
 *                     + repayments received − repayments given
 *   net       = available + receivable − payable
 *
 * Borrow/lend/repayment records are NEVER counted as income or expenses,
 * so reports and statements stay accurate.
 */

/** Full balance snapshot (all time). */
export function getBalance(userId) {
  const settings = getSettings(userId);
  const tx = sumTransactions(userId);
  const bl = sums(userId);

  const available = round2(
    Number(settings?.openingBalance || 0)
    + tx.income
    - tx.expense
    + bl.borrowed
    - bl.lent
    + bl.repayReceived
    - bl.repayGiven,
  );

  const out = outstanding(userId);

  return {
    openingBalance: round2(settings?.openingBalance || 0),
    availableBalance: available,
    moneyToReceive: round2(out.toReceive),
    moneyToPay: round2(out.toPay),
    netPosition: round2(available + out.toReceive - out.toPay),
    incomeTotal: round2(tx.income),
    expenseTotal: round2(tx.expense),
    borrowedTotal: round2(bl.borrowed),
    lentTotal: round2(bl.lent),
    repaymentsReceived: round2(bl.repayReceived),
    repaymentsGiven: round2(bl.repayGiven),
  };
}

/** Balance as of end-of-day `date` — used by monthly statements. */
export function balanceAsOf(userId, date) {
  const settings = getSettings(userId);
  const tx = sumTransactions(userId, { to: date });
  const bl = sums(userId, { to: date });
  const opening = round2(settings?.openingBalance || 0);
  const closing = round2(
    opening + tx.income - tx.expense + bl.borrowed - bl.lent + bl.repayReceived - bl.repayGiven,
  );
  return { openingBalance: opening, closingBalance: closing };
}
