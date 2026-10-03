import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { validate, asyncRoute } from '../middleware/validate.js';
import { auth, signToken } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import { createUser, findUserByEmail, findUserById, updateProfile } from '../repositories/users.js';
import { seedCategories, createDefaultSettings } from '../db/seed.js';
import { getSettings } from '../repositories/settings.js';

const router = Router();

// Tight limit on credential endpoints only (SPEC §36 security).
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, try again later.' },
});

const registerSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80),
  email: z.string().trim().toLowerCase().email('Enter a valid email').max(120),
  password: z.string().min(6, 'Password must be at least 6 characters').max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(1, 'Password is required'),
});

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatarUrl: u.avatar_url || null,
    createdAt: u.created_at,
  };
}

/** POST /api/auth/register — user + settings + default categories (SPEC §3.1). */
router.post('/register', authLimiter, validate(registerSchema), asyncRoute(async (req, res) => {
  const { name, email, password } = req.body;

  if (findUserByEmail(email)) throw new HttpError(409, 'An account with this email already exists');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = createUser({ name, email, passwordHash });
  createDefaultSettings(user.id);
  seedCategories(user.id);

  res.status(201).json({
    token: signToken(user),
    user: publicUser(user),
    onboardingComplete: false,
  });
}));

/** POST /api/auth/login */
router.post('/login', authLimiter, validate(loginSchema), asyncRoute(async (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user) throw new HttpError(401, 'Invalid email or password');

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) throw new HttpError(401, 'Invalid email or password');

  const settings = getSettings(user.id);
  res.json({
    token: signToken(user),
    user: publicUser(user),
    onboardingComplete: Boolean(settings?.onboardingCompleted),
  });
}));

/** GET /api/auth/me */
router.get('/me', auth, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) throw new HttpError(401, 'Unauthorized');
  const settings = getSettings(user.id);
  res.json({
    user: publicUser(user),
    settings,
    onboardingComplete: Boolean(settings?.onboardingCompleted),
  });
});

/** PUT /api/auth/profile — name / avatar (used by Settings → Profile). */
const profileSchema = z.object({
  name: z.string().trim().min(2, 'Name must be at least 2 characters').max(80).optional(),
  avatarUrl: z.string().trim().max(500).nullable().optional(),
});

router.put('/profile', auth, validate(profileSchema), (req, res) => {
  const patch = {};
  if (req.body.name !== undefined) patch.name = req.body.name;
  if (req.body.avatarUrl !== undefined) patch.avatarUrl = req.body.avatarUrl;
  if (!Object.keys(patch).length) throw new HttpError(400, 'Nothing to update');
  const user = updateProfile(req.user.id, patch);
  res.json({ user: publicUser(user) });
});

export default router;
