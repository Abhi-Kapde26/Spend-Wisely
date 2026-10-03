import { Router } from 'express';
import { z } from 'zod';
import { validate, queryInt } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  listCategories, findCategory, createCategory, updateCategory, deleteCategory, usageCount,
} from '../repositories/categories.js';

const router = Router();
router.use(auth);

const catSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(40),
  icon: z.string().trim().min(1).max(8).default('📦'),
  color: z.string().trim().regex(/^#[0-9a-fA-F]{6}$/, 'Colour must be a hex value like #64748b').default('#64748b'),
  type: z.enum(['expense', 'income', 'both']).default('expense'),
});

/** GET /api/categories */
router.get('/', (req, res) => {
  res.json({ items: listCategories(req.user.id) });
});

/** POST /api/categories */
router.post('/', validate(catSchema), (req, res) => {
  const existing = listCategories(req.user.id)
    .find((c) => c.name.toLowerCase() === req.body.name.toLowerCase());
  if (existing) throw new HttpError(409, 'A category with this name already exists');
  res.status(201).json({ category: createCategory(req.user.id, req.body) });
});

/** PUT /api/categories/:id */
router.put('/:id', validate(catSchema.partial()), (req, res) => {
  const id = Number(req.params.id);
  if (!findCategory(req.user.id, id)) throw new HttpError(404, 'Category not found');
  res.json({ category: updateCategory(req.user.id, id, req.body) });
});

/** DELETE /api/categories/:id  (?force=1 detaches transactions) */
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const cat = findCategory(req.user.id, id);
  if (!cat) throw new HttpError(404, 'Category not found');

  const used = usageCount(req.user.id, id);
  const force = req.query.force === '1' || req.query.force === 'true';
  if (used > 0 && !force) {
    throw new HttpError(409, `Category is in use by ${used} transaction${used > 1 ? 's' : ''}`);
  }
  deleteCategory(req.user.id, id, force);
  res.json({ success: true, detached: used });
});

export default router;
