import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const backendRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

dotenv.config({ path: path.join(backendRoot, '.env') });

function privateKey(value = '') {
  return value.replace(/^["']|["']$/g, '').replace(/\\n/g, '\n');
}

const config = {
  ROOT: backendRoot,
  PORT: Number(process.env.PORT || 4000),
  JWT_SECRET: process.env.JWT_SECRET || 'dev-only-secret-change-me',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
  DATA_DIR: process.env.DATA_DIR || path.join(backendRoot, 'data'),
  GOOGLE_SERVICE_ACCOUNT_EMAIL: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '',
  GOOGLE_PRIVATE_KEY: privateKey(process.env.GOOGLE_PRIVATE_KEY || ''),
};

config.DB_PATH = path.join(config.DATA_DIR, 'spendwisely.db');
config.googleEnabled = Boolean(config.GOOGLE_SERVICE_ACCOUNT_EMAIL && config.GOOGLE_PRIVATE_KEY);

export default config;
