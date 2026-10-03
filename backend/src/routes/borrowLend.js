import { Router } from 'express';
import { z } from 'zod';
import { validate, queryInt } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  listBorrowLend, findBorrowLend, createBorrowLend, updateBorrowLend, deleteBorrowLend, syncStatus,
} from '../repositories/borrowLend.js';
import {
  listRepayments, findRepayment, createRepayment, deleteRepayment, paidSoFar,
} from '../repositories/repayments.js';
import { transaction } from '../db/index.js';
import { round2 } from '../utils/shape.js';

const router = Router();
router.use(auth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

const blSchema = z.object({
  type: z.enum(['borrow', 'lend'], { errorMap: () => ({ message: 'type must be borrow or lend' }) }),
  person: z.string().trim().min(1, 'Person name is required').max(80),
  amount: z.coerce.number().positive('Amount must be greater than 0').max(1_000_000_000),
  date: z.string().regex(dateRe, 'Date must be YYYY-MM-DD').optional(),
  dueDate: z.string().regex(dateRe, 'Due date must be YYYY-MM-DD').nullable().optional(),
  comment: z.string().trim().max(300).nullable().optional(),
});

const repaymentSchema = z.object({
  borrowLendId: z.coerce.number().int().positive(),
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  date: z.string().regex(dateRe, 'Date must be YYYY-MM-DD').optional(),
  comment: z.string().trim().max(300).nullable().optional(),
});

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** GET /api/borrow-lend — items + outstanding totals */
router.get('/', (req, res) => {
  res.json(listBorrowLend(req.user.id, {
    status: req.query.status || undefined,
    type: req.query.type || undefined,
    person: req.query.person || undefined,
  }));
});

/** POST /api/borrow-lend */
router.post('/', validate(blSchema), (req, res) => {
  const { type, person, amount, dueDate, comment } = req.body;
  const item = createBorrowLend(req.user.id, {
    type,
    person,
    amount: Math.round(amount * 100) / 100,
    date: req.body.date || today(),
    dueDate: dueDate || null,
    comment: comment || null,
  });
  res.status(201).json({ item });
});

/** GET /api/borrow-lend/:id — item + repayment history */
router.get('/:id', (req, res) => {
  const item = findBorrowLend(req.user.id, Number(req.params.id));
  if (!item) throw new HttpError(404, 'Record not found');
  res.json({ item, repayments: listRepayments(req.user.id, item.id) });
});

/** PUT /api/borrow-lend/:id — edit person/amount/date/comment (not type) */
router.put('/:id', validate(z.object({
  person: z.string().trim().min(1).max(80).optional(),
  amount: z.coerce.number().positive().max(1_000_000_000).optional(),
  date: z.string().regex(dateRe).optional(),
  dueDate: z.string().regex(dateRe).nullable().optional(),
  comment: z.string().trim().max(300).nullable().optional(),
})), (req, res) => {
  const id = Number(req.params.id);
  if (!findBorrowLend(req.user.id, id)) throw new HttpError(404, 'Record not found');
  const item = updateBorrowLend(req.user.id, id, req.body);
  res.json({ item });
});

/** DELETE /api/borrow-lend/:id (repayments cascade) */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!deleteBorrowLend(req.user.id, id)) throw new HttpError(404, 'Record not found');
  res.json({ success: true });
});

/** POST /api/repayments — partial or full repayment (SPEC §2.3) */
router.post('/repayments', validate(repaymentSchema), (req, res) => {
  const result = transaction(() => {
    const { borrowLendId, amount, comment } = req.body;
    const parent = findBorrowLend(req.user.id, borrowLendId);
    if (!parent) throw new HttpError(404, 'Borrow/Lend record not found');
    if (parent.status === 'completed') throw new HttpError(400, 'This record is already fully repaid');

    const paid = paidSoFar(parent.id);
    const remaining = round2(parent.amount - paid);
    const value = round2(amount);
    if (value > remaining + 0.009) {
      throw new HttpError(400, `Repayment exceeds remaining amount (₹${remaining})`);
    }

    const repayment = createRepayment(req.user.id, {
      borrowLendId: parent.id,
      amount: value,
      date: req.body.date || today(),
      comment: comment || null,
    });
    const item = syncStatus(req.user.id, parent.id);
    return { repayment, item };
  });

  res.status(201).json(result);
});

/** DELETE /api/repayments/:id — undo a repayment, parent status recalculates */
router.delete('/repayments/:id', (req, res) => {
  const id = Number(req.params.id);
  const rep = findRepayment(req.user.id, id);
  if (!rep) throw new HttpError(404, 'Repayment not found');

  transaction(() => {
    deleteRepayment(req.user.id, id);
    syncStatus(req.user.id, rep.borrowLendId);
  });
  res.json({ success: true });
});

export default router;
