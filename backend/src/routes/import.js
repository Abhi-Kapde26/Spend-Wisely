import { Router } from 'express';
import { z } from 'zod';
import { validate, asyncRoute } from '../middleware/validate.js';
import { auth } from '../middleware/auth.js';
import { HttpError } from '../middleware/error.js';
import {
  preview, commit, toCsvUrl, templateCsv, TEMPLATE_HEADERS, TEMPLATE_ROWS,
} from '../services/importService.js';
import {
  getImportSettings, saveSheetUrl, markImported, clearImportSettings, addHistory, listHistory,
} from '../repositories/imports.js';

const router = Router();
router.use(auth);

/** SQLite's datetime('now') is UTC without a zone — relTime() needs ISO-8601. */
const toIso = (s) => (s && !String(s).includes('T') ? `${String(s).replace(' ', 'T')}Z` : s ?? null);

const NO_SOURCE = 'Provide a Google Sheet URL or CSV data';
const hasSource = (d) => Boolean(d.url?.trim() || d.csv?.trim());

const sourceBase = z.object({
  url: z.string().trim().min(1).max(2000).optional(),
  csv: z.string().max(5 * 1024 * 1024).optional(),
});

const sourceSchema = sourceBase.refine(hasSource, { message: NO_SOURCE });

const commitSchema = sourceBase.extend({
  skipDuplicates: z.boolean().optional(),
  createMissingCategories: z.boolean().optional(),
}).refine(hasSource, { message: NO_SOURCE });

/** GET /api/import/status — saved sheet URL, recent imports, CSV template. */
router.get('/status', (req, res) => {
  const settings = getImportSettings(req.user.id);
  res.json({
    savedUrl: settings?.sheetUrl ?? null,
    lastImportAt: toIso(settings?.lastImportAt),
    history: listHistory(req.user.id, 10).map((h) => ({
      id: h.id,
      source: h.source,
      origin: h.origin,
      totalRows: h.totalRows,
      imported: h.imported,
      skipped: h.skipped,
      errorCount: h.errorCount,
      createdAt: toIso(h.createdAt),
    })),
    template: { headers: TEMPLATE_HEADERS, example: TEMPLATE_ROWS },
  });
});

/** POST /api/import/preview — fetch/parse/map without writing anything. */
router.post('/preview', validate(sourceSchema), asyncRoute(async (req, res) => {
  res.json(await preview(req.user.id, req.body));
}));

/** POST /api/import/commit — write rows, record history. */
router.post('/commit', validate(commitSchema), asyncRoute(async (req, res) => {
  const result = await commit(req.user.id, req.body);
  if (result.source === 'url') saveSheetUrl(req.user.id, result.origin);
  markImported(req.user.id);
  const history = addHistory(req.user.id, {
    source: result.source,
    origin: result.origin,
    totalRows: result.totalRows,
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors,
  });
  res.json({
    imported: result.imported,
    skipped: result.skipped,
    errors: result.errors,
    errorCount: result.errorCount,
    byType: result.byType,
    historyId: history.id,
  });
}));

/** PUT /api/import/settings — remember the sheet URL (validated). */
router.put('/settings', (req, res) => {
  const sheetUrl = String(req.body?.sheetUrl ?? '').trim();
  if (!sheetUrl) throw new HttpError(400, 'Sheet URL is required');
  toCsvUrl(sheetUrl); // throws 400 when it is not a Google Sheets link
  saveSheetUrl(req.user.id, sheetUrl);
  res.json({ savedUrl: sheetUrl });
});

/** DELETE /api/import/settings — forget the saved URL. */
router.delete('/settings', (req, res) => {
  clearImportSettings(req.user.id);
  res.json({ success: true });
});

/** GET /api/import/template — CSV template file. */
router.get('/template', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="spend-wisely-import-template.csv"');
  res.send(templateCsv());
});

export default router;
