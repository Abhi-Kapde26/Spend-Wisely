import { Router } from 'express';
import { z } from 'zod';
import { validate, queryInt } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  listTransactions, findTransaction, createTransaction, updateTransaction, deleteTransaction,
} from '../repositories/transactions.js';
import { findCategory } from '../repositories/categories.js';

const router = Router();
router.use(auth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;
const txSchema = z.object({
  type: z.enum(['expense', 'income'], { errorMap: () => ({ message: 'type must be expense or income' }) }),
  amount: z.coerce.number().positive('Amount must be greater than 0').max(1_000_000_000),
  categoryId: z.coerce.number().int().positive().nullable().optional(),
  comment: z.string().trim().max(300).nullable().optional(),
  date: z.string().regex(dateRe, 'Date must be YYYY-MM-DD').optional(),
});

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Category must exist for this user and accept the transaction type. */
function assertCategory(userId, categoryId, type) {
  if (!categoryId) return null;
  const cat = findCategory(userId, categoryId);
  if (!cat) throw new HttpError(400, 'Unknown category');
  if (cat.type !== 'both' && cat.type !== type) {
    throw new HttpError(400, `"${cat.name}" is a ${cat.type} category`);
  }
  return cat.id;
}

/** GET /api/transactions */
router.get('/', (req, res) => {
  const result = listTransactions(req.user.id, {
    page: queryInt(req.query.page, 1),
    limit: queryInt(req.query.limit, 20, { max: 200 }),
    type: req.query.type || undefined,
    categoryId: req.query.categoryId || undefined,
    from: req.query.from || undefined,
    to: req.query.to || undefined,
    search: req.query.search || undefined,
    sort: req.query.sort || 'desc',
  });
  res.json(result);
});

/** POST /api/transactions */
router.post('/', validate(txSchema), (req, res) => {
  const { type, amount, categoryId, comment, date } = req.body;
  const catId = assertCategory(req.user.id, categoryId, type);
  const tx = createTransaction(req.user.id, {
    type,
    amount: Math.round(amount * 100) / 100,
    categoryId: catId,
    comment: comment || null,
    date: date || today(),
  });
  res.status(201).json({ transaction: tx });
});

/** PUT /api/transactions/:id */
router.put('/:id', validate(txSchema.partial()), (req, res) => {
  const id = Number(req.params.id);
  const existing = findTransaction(req.user.id, id);
  if (!existing) throw new HttpError(404, 'Transaction not found');

  const patch = { ...req.body };
  if (patch.categoryId !== undefined && patch.categoryId !== null) {
    patch.categoryId = assertCategory(req.user.id, patch.categoryId, patch.type || existing.type);
  }
  if (patch.amount !== undefined) patch.amount = Math.round(patch.amount * 100) / 100;

  res.json({ transaction: updateTransaction(req.user.id, id, patch) });
});

/** DELETE /api/transactions/:id */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!deleteTransaction(req.user.id, id)) throw new HttpError(404, 'Transaction not found');
  res.json({ success: true });
});

export default router;
