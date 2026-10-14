import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

function privateKey(value = '') {
  return value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

// Vercel (and most serverless hosts) have a read-only filesystem except /tmp,
// so the SQLite file has to live there.
const isVercel = Boolean(process.env.VERCEL);
const dataDir = process.env.DATA_DIR
  || (isVercel ? path.join('/tmp', 'spendwisely') : path.join(backendRoot, 'data'));

const config = {
  ROOT: backendRoot,
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || (isVercel ? '*' : 'http://localhost:5173'),
  DATA_DIR: dataDir,
  IS_VERCEL: isVercel,
  EPHEMERAL_DB: isVercel && !process.env.DATA_DIR,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: privateKey(process.env.GOOGLE_PRIVATE_KEY || ''),
};

config.DB_PATH = path.join(config.DATA_DIR, 'spendwisely.db');
config.googleEnabled = Boolean(config.GOOGLE_SERVICE_ACCOUNT_EMAIL && config.GOOGLE_PRIVATE_KEY);

if (config.EPHEMERAL_DB) {
  console.warn(`[API] Serverless host detected — SQLite at ${config.DB_PATH} is EPHEMERAL (lost on redeploy/cold start). Point DATA_DIR at a persistent volume, or migrate to the hosted database (docs/FIREBASE_MIGRATION.md).`);
}
if (!process.env.JWT_SECRET) {
  console.warn('[API] JWT_SECRET is not set — using an insecure development default. Set it in your host\'s environment variables.');
}

export default config;
