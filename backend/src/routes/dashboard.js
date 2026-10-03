import { Router } from 'express';
import { auth } from '../middleware/auth.js';
import { buildDashboard } from '../services/dashboardService.js';

const router = Router();

/** GET /api/dashboard (SPEC §3.3) */
router.get('/', auth, (req, res) => {
  res.json(buildDashboard(req.user.id));
});

export default router;
