import config from './src/config.js';
import { initDb } from './src/db/index.js';
import { app } from './src/app.js';

initDb();

// Safety net: log stray promise rejections instead of taking the API down.
// Route handlers should still use asyncRoute so the client gets a response.
process.on('unhandledRejection', (reason) => {
  console.error('[API] Unhandled rejection (kept alive):', reason);
});

const server = app.listen(config.PORT, () => {
  console.log(`[API] Spend Wisely API listening on http://localhost:${config.PORT}`);
  console.log(`[API] Database: ${config.DB_PATH}`);
  console.log(`[API] Google Sheets sync: ${config.googleEnabled ? 'enabled' : 'demo mode (no credentials)'}`);
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
