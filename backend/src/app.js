import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import config from './config.js';
import routes from './routes/index.js';
import { notFound, errorHandler } from './middleware/error.js';
import { requestLog } from './middleware/log.js';

export const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));
app.use(cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()), credentials: false }));
app.use(express.json({ limit: '10mb' })); // headroom for CSV import payloads (SPEC §3.12)
app.use(requestLog);

// Mild global limit — generous enough for normal UI use, blocks runaway loops.
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many requests, slow down.' },
}));

app.use('/api', routes);
app.get('/health', (_req, res) => res.json({ ok: true, service: 'spend-wisely-api' }));

app.use(notFound);
app.use(errorHandler);
