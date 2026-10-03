import { Router } from 'express';
import { z } from 'zod';
import { validate, asyncRoute } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { getSettings, updateSettings } from '../repositories/settings.js';
import { updatePassword, findUserById, updateProfile } from '../repositories/users.js';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(auth);

const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED', 'JPY', 'AUD', 'CAD', 'SGD'];

const money = z.coerce.number().min(0, 'Cannot be negative').max(1_000_000_000);

/** POST /api/setup — first-run wizard (SPEC §3.2). */
const setupSchema = z.object({
  openingBalance: money.default(0),
  monthlyPocketMoney: money.default(0),
  dailyLimit: money.default(0),
  monthlyBudget: money.default(0),
  currency: z.enum(CURRENCIES).default('INR'),
});

router.post('/setup', validate(setupSchema), (req, res) => {
  const settings = updateSettings(req.user.id, {
    openingBalance: req.body.openingBalance,
    monthlyPocketMoney: req.body.monthlyPocketMoney,
    dailyLimit: req.body.dailyLimit,
    monthlyBudget: req.body.monthlyBudget,
    currency: req.body.currency,
    onboardingCompleted: true,
  });
  res.json({ settings, onboardingComplete: true });
});

/** GET /api/settings */
router.get('/settings', (req, res) => {
  res.json({ settings: getSettings(req.user.id) });
});

/** PUT /api/settings — partial update (budget fields + notification toggles + profile). */
const settingsSchema = z.object({
  openingBalance: money.optional(),
  monthlyPocketMoney: money.optional(),
  dailyLimit: money.optional(),
  monthlyBudget: money.optional(),
  currency: z.enum(CURRENCIES).optional(),
  notifyNearLimit: z.boolean().optional(),
  notifyDailyReminder: z.boolean().optional(),
  notifyBorrowReminder: z.boolean().optional(),
  // Profile editing lives here too (frontend Settings → Profile).
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

router.put('/settings', validate(settingsSchema), (req, res) => {
  const { name, avatarUrl, ...settingsPatch } = req.body;
  let user = null;
  if (name !== undefined || avatarUrl !== undefined) {
    const profilePatch = {};
    if (name !== undefined) profilePatch.name = name;
    if (avatarUrl !== undefined) profilePatch.avatarUrl = avatarUrl;
    user = updateProfile(req.user.id, profilePatch);
  }
  const settings = updateSettings(req.user.id, settingsPatch);
  res.json({
    settings,
    ...(user ? { user: { id: user.id, name: user.name, email: user.email, avatarUrl: user.avatar_url || null } } : {}),
  });
});

/** PUT /api/settings/password */
const passwordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

router.put('/settings/password', validate(passwordSchema), asyncRoute(async (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) throw new HttpError(401, 'Unauthorized');

  const ok = await bcrypt.compare(req.body.currentPassword, user.password_hash);
  if (!ok) throw new HttpError(400, 'Current password is incorrect');

  const hash = await bcrypt.hash(req.body.newPassword, 10);
  updatePassword(req.user.id, hash);
  res.json({ success: true });
}));

export default router;
