import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { queryInt } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import {
  dailySeries, weeklySeries, monthlySeries, categoryBreakdown, budgetPerformance, summary,
} from '../services/analyticsService.js';
import { buildInsights } from '../services/insightService.js';
import { today as todayStr } from '../utils/shape.js';

const router = Router();
router.use(auth);

/** GET /api/analytics/daily?days=7|30|90 */
router.get('/daily', (req, res) => {
  const days = queryInt(req.query.days, 30, { min: 1, max: 730 });
  res.json(dailySeries(req.user.id, days));
});

/** GET /api/analytics/weekly?year&month */
router.get('/weekly', (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  if (month < 1 || month > 12) throw new HttpError(400, 'Month must be 1–12');
  res.json(weeklySeries(req.user.id, year, month));
});

/** GET /api/analytics/monthly?year */
router.get('/monthly', (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(monthlySeries(req.user.id, year));
});

/** GET /api/analytics/category?from&to */
router.get('/category', (req, res) => {
  const now = new Date();
  const from = req.query.from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = req.query.to || todayStr();
  res.json(categoryBreakdown(req.user.id, from, to));
});

/** GET /api/analytics/budget-performance?year&month */
router.get('/budget-performance', (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  if (month < 1 || month > 12) throw new HttpError(400, 'Month must be 1–12');
  res.json(budgetPerformance(req.user.id, year, month));
});

/** GET /api/analytics/summary */
router.get('/summary', (req, res) => {
  res.json(summary(req.user.id));
});

/** GET /api/analytics/insights — rule-based (Phase-5 ML slot) */
router.get('/insights', (req, res) => {
  res.json(buildInsights(req.user.id));
});

export default router;
