/** HTTP error with a user-facing message. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export const notFound = (req, res) => {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
};

/* eslint-disable no-unused-vars */
export function errorHandler(err, req, res, next) {
  // Response already streaming (e.g. a half-written PDF) — nothing safe to send.
  if (res.headersSent) {
    console.error(`[API] ERROR after headers sent ${req.method} ${req.originalUrl}:`, err);
    return res.destroy();
  }
  const status = err.status || 500;
  if (status >= 500) {
    console.error(`[API] ERROR ${req.method} ${req.originalUrl}:`, err);
  }
  const message = status >= 500 && !err.expose ? 'Something went wrong' : err.message;
  res.status(status).json({ error: message });
}
