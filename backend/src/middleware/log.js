/** Compact per-request access log: [API] GET /api/dashboard 200 4ms */
export function requestLog(req, res, next) {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - start) / 1e6;
    const line = `[API] ${req.method} ${req.originalUrl} ${res.statusCode} ${ms.toFixed(1)}ms`;
    if (res.statusCode >= 500) console.error(line);
    else console.log(line);
  });
  next();
}
