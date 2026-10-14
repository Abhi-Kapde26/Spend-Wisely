import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { findBorrowLend, syncStatus } from '../repositories/borrowLend.js';
import {
  listRepayments, findRepayment, createRepayment, deleteRepayment, paidSoFar,
} from '../repositories/repayments.js';
import { transaction } from '../db/index.js';
import { round2 } from '../utils/shape.js';

const router = Router();
router.use(auth);

const dateRe = /^\d{4}-\d{2}-\d{2}$/;

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

/** GET /api/repayments?borrowLendId=1 - list repayments for a borrow_lend record */
router.get('/', (req, res) => {
  const blId = req.query.borrowLendId ? Number(req.query.borrowLendId) : null;
  if (!blId) throw new HttpError(400, 'borrowLendId is required');
  res.json({ items: listRepayments(req.user.id, blId) });
});

/** POST /api/repayments - record repayment */
router.post('/', validate(repaymentSchema), (req, res) => {
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

/** DELETE /api/repayments/:id - delete repayment */
router.delete('/:id', (req, res) => {
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
