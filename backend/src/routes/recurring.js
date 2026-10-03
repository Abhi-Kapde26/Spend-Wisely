import { Router } from 'express';
import { z } from 'zod';
import { validate, asyncRoute } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { listRecurring, createRecurring, updateRecurring, deleteRecurring, findRecurring } from '../repositories/recurring.js';
import { processDue } from '../services/recurringService.js';
import { findCategory } from '../repositories/categories.js';

const router = Router();
router.use(auth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const money = z.coerce.number().positive('Amount must be greater than 0').max(1_000_000_000);

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const recSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  amount: money,
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  startDate: z.string().regex(dateRe, 'Start date must be YYYY-MM-DD').optional(),
  active: z.boolean().optional(),
});

/** GET /api/recurring */
router.get('/', (req, res) => {
  res.json({ items: listRecurring(req.user.id) });
});

/** POST /api/recurring */
router.post('/', validate(recSchema), (req, res) => {
  const { name, amount, categoryId, frequency, startDate } = req.body;
  if (categoryId && !findCategory(req.user.id, categoryId)) throw new HttpError(400, 'Unknown category');
  const item = createRecurring(req.user.id, {
    name,
    amount: Math.round(amount * 100) / 100,
    categoryId: categoryId || null,
    frequency,
    startDate: startDate || today(),
  });
  res.status(201).json({ item });
});

/** PUT /api/recurring/:id */
router.put('/:id', validate(recSchema.partial()), (req, res) => {
  const id = Number(req.params.id);
  if (!findRecurring(req.user.id, id)) throw new HttpError(404, 'Recurring expense not found');
  if (req.body.categoryId && !findCategory(req.user.id, req.body.categoryId)) {
    throw new HttpError(400, 'Unknown category');
  }
  res.json({ item: updateRecurring(req.user.id, id, req.body) });
});

/** DELETE /api/recurring/:id */
router.delete('/:id', (req, res) => {
  if (!deleteRecurring(req.user.id, Number(req.params.id))) throw new HttpError(404, 'Recurring expense not found');
  res.json({ success: true });
});

/** POST /api/recurring/process — materialise anything due today */
router.post('/process', asyncRoute(async (req, res) => {
  res.json(processDue(req.user.id));
}));

export default router;
