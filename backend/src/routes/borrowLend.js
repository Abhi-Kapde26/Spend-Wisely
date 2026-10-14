import { Router } from 'express';
import { z } from 'zod';
import { validate, queryInt } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  listBorrowLend, findBorrowLend, createBorrowLend, updateBorrowLend, deleteBorrowLend,
} from '../repositories/borrowLend.js';
import { listRepayments } from '../repositories/repayments.js';

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

import repaymentsRouter from './repayments.js';

router.use('/repayments', repaymentsRouter);

export default router;
