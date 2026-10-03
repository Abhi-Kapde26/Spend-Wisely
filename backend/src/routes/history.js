import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { queryInt } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { history, archive, fullStatement, compare } from '../services/historyService.js';

const router = Router();
router.use(auth);

/** GET /api/history?year&month&source&search&page&limit */
router.get('/history', (req, res) => {
  res.json(history(req.user.id, {
    year: req.query.year,
    month: req.query.month,
    source: req.query.source || 'all',
    search: req.query.search || '',
    page: queryInt(req.query.page, 1),
    limit: queryInt(req.query.limit, 20, { max: 200 }),
  }));
});

/** GET /api/monthly — archive list */
router.get('/monthly', (req, res) => {
  res.json({ items: archive(req.user.id) });
});

/** GET /api/monthly/compare?year&month — vs previous month */
router.get('/monthly/compare', (req, res) => {
  const now = new Date();
  const year = Number(req.query.year) || now.getFullYear();
  const month = Number(req.query.month) || now.getMonth() + 1;
  if (month < 1 || month > 12) throw new HttpError(400, 'Month must be 1–12');
  res.json(compare(req.user.id, year, month));
});

/** GET /api/monthly/:year/:month — full statement */
router.get('/monthly/:year/:month', (req, res) => {
  const year = Number(req.params.year);
  const month = Number(req.params.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new HttpError(400, 'Invalid year');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new HttpError(400, 'Invalid month');
  res.json(fullStatement(req.user.id, year, month));
});

export default router;
