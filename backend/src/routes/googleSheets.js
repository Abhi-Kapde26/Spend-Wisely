import { Router } from 'express';
import { z } from 'zod';
import { validate, asyncRoute } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { status, connectSheet, syncNow, disconnectSheet } from '../services/sheetsService.js';

const router = Router();
router.use(auth);

/** GET /api/google-sheets/status */
router.get('/status', (req, res) => {
  res.json(status(req.user.id));
});

/** POST /api/google-sheets/connect { sheetUrl } */
router.post('/connect', validate(z.object({
  sheetUrl: z.string().trim().url('Enter a valid URL').max(500),
})), (req, res) => {
  res.json(connectSheet(req.user.id, req.body.sheetUrl));
});

/** POST /api/google-sheets/sync */
router.post('/sync', asyncRoute(async (req, res) => {
  res.json(await syncNow(req.user.id));
}));

/** DELETE /api/google-sheets/disconnect */
router.delete('/disconnect', (req, res) => {
  disconnectSheet(req.user.id);
  res.json({ success: true });
});

export default router;
