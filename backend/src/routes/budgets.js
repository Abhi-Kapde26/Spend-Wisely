import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getSettings, updateSettings } from '../repositories/settings.js';
import {
  listDailyOverrides, upsertDailyOverride, deleteDailyOverride, getMonthlyOverride,
} from '../repositories/budgets.js';
import { monthInfo } from '../services/budgetService.js';
import { sumTransactions } from '../repositories/transactions.js';
import { today as todayStr, round2, daysInMonth, pad2 } from '../utils/shape.js';

const router = Router();
router.use(auth);

const money = z.coerce.number().min(0, 'Cannot be negative').max(1_000_000_000);
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/budgets — current limits + per-day overrides */
router.get('/', (req, res) => {
  const s = getSettings(req.user.id);
  res.json({
    dailyLimit: round2(s?.dailyLimit || 0),
    monthlyBudget: round2(s?.monthlyBudget || 0),
    pocketMoney: round2(s?.monthlyPocketMoney || 0),
    openingBalance: round2(s?.openingBalance || 0),
    currency: s?.currency || 'INR',
    dailyOverrides: listDailyOverrides(req.user.id).map((o) => ({ date: o.date, limit: round2(o.limitAmount) })),
  });
});

/** PUT /api/budgets — global limits (daily/monthly/pocket money) */
router.put('/', validate(z.object({
  dailyLimit: money.optional(),
  monthlyBudget: money.optional(),
  monthlyPocketMoney: money.optional(),
})), (req, res) => {
  const settings = updateSettings(req.user.id, req.body);
  res.json({ settings });
});

/** POST /api/budgets/daily — per-day override */
router.post('/daily', validate(z.object({
  date: z.string().regex(dateRe, 'Date must be YYYY-MM-DD'),
  limit: money,
})), (req, res) => {
  const row = upsertDailyOverride(req.user.id, req.body.date, req.body.limit);
  res.status(201).json({ override: { date: row.date, limit: round2(row.limitAmount) } });
});

/** DELETE /api/budgets/daily/:date */
router.delete('/daily/:date', (req, res) => {
  if (!dateRe.test(req.params.date)) throw new HttpError(400, 'Date must be YYYY-MM-DD');
  if (!deleteDailyOverride(req.user.id, req.params.date)) throw new HttpError(404, 'No override for that date');
  res.json({ success: true });
});

/** GET /api/budgets/month?year&month — effective monthly budget + spend */
router.get('/month', (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  const s = getSettings(req.user.id);
  const override = getMonthlyOverride(req.user.id, year, month);

  const from = `${year}-${pad2(month)}-01`;
  const to = `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}`;
  const info = monthInfo(req.user.id, todayStr());
  const isCurrent = info.year === year && info.month === month;
  const totals = isCurrent
    ? { expense: info.spent }
    : sumTransactions(req.user.id, { from, to, type: 'expense' });

  res.json({
    year,
    month,
    amount: round2(override ? Number(override.amount) : Number(s?.monthlyBudget || 0)),
    spent: round2(totals.expense),
  });
});

export default router;
