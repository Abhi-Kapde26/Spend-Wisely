import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { getNote, saveNote } from '../repositories/notes.js';

const router = Router();
router.use(auth);

const noteSchema = z.object({
  content: z
    .string()
    .max(20000, 'Note is too long (max 20,000 characters)')
    .nullish()
    .transform((v) => v ?? ''),
});

/** GET /api/notes - get user's notepad content */
router.get('/', (req, res) => {
  res.json({ note: getNote(req.user.id) });
});

/** PUT /api/notes - update user's notepad content */
router.put('/', validate(noteSchema), (req, res) => {
  const note = saveNote(req.user.id, req.body.content);
  res.json({ note });
});

/** POST /api/notes - alias for updating */
router.post('/', validate(noteSchema), (req, res) => {
  const note = saveNote(req.user.id, req.body.content);
  res.json({ note });
});

export default router;
