import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { asyncRoute } from '../middleware/validate.js';
import { HttpError } from '../middleware/error.js';
import { buildCsv, buildExcel, streamPdf, exportContext } from '../services/exportService.js';
import { today as todayStr } from '../utils/shape.js';

const router = Router();
router.use(auth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Resolve {from,to} from query — defaults to the current month. */
function range(req) {
  const now = new Date();
  const from = req.query.from || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
  const to = req.query.to || todayStr();
  if (!dateRe.test(from) || !dateRe.test(to)) throw new HttpError(400, 'Dates must be YYYY-MM-DD');
  if (from > to) throw new HttpError(400, '`from` must be before `to`');
  return { from, to, type: req.query.type === 'income' || req.query.type === 'expense' ? req.query.type : null };
}

/** GET /api/export/csv */
router.get('/csv', (req, res) => {
  const { from, to, type } = range(req);
  const { rows } = exportContext(req.user.id, { from, to, type });
  const csv = buildCsv(rows);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="spend-wisely-${from}_${to}.csv"`);
  res.send(csv);
});

/** GET /api/export/excel */
router.get('/excel', asyncRoute(async (req, res) => {
  const { from, to, type } = range(req);
  const { rows } = exportContext(req.user.id, { from, to, type });
  const buffer = await buildExcel(req.user.id, rows, { from, to });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="spend-wisely-${from}_${to}.xlsx"`);
  res.send(buffer);
}));

/** GET /api/export/pdf?year&month — bank-style statement */
router.get('/pdf', (req, res, next) => {
  try {
    const now = new Date();
    const year = Number(req.query.year) || now.getFullYear();
    const month = Number(req.query.month) || now.getMonth() + 1;
    if (month < 1 || month > 12) throw new HttpError(400, 'Invalid month');
    streamPdf(req.user.id, { year, month }, res);
  } catch (err) {
    next(err);
  }
});

export default router;
