import { HttpError } from './error.js';

/**
 * Zod validation middleware.
 * `schema` validates req.body; a successful parse replaces req.body
 * with the typed/defaults-applied data.
 */
export function validate(schema) {
  return (req, _res, next) => {
    const result = schema.safeParse(req.body ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue.path.length ? `${issue.path.join('.')}: ` : '';
      return next(new HttpError(400, `${where}${issue.message}`));
    }
    req.body = result.data;
    next();
  };
}

/** Query-string int helper (Express 4 has no async error capture). */
export function queryInt(value, fallback, { min = 1, max = 100000 } = {}) {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new HttpError(400, 'Invalid number in query');
  return Math.min(Math.max(Math.trunc(n), min), max);
}

/** Wrap an async handler so rejections reach the error middleware (Express 4). */
export const asyncRoute = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
