import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { api, download } from '../../lib/api.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatDate, formatMoney } from '../../lib/format.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { errorMessage, toastApiError, toastError, toastSuccess } from '../ui/toast.js';

/**
 * Settings → Data → "Import from Google Sheet / CSV" (SPEC §3.12).
 * The reverse of the Google Sheets sync card above it: this pulls rows INTO the app.
 * Flow: source (published sheet URL or uploaded CSV) → preview → commit.
 */

const TYPE_TONES = {
  expense: 'bg-rose-50 text-rose-600',
  income: 'bg-emerald-50 text-emerald-700',
  borrow: 'bg-sky-50 text-sky-700',
  lend: 'bg-violet-50 text-violet-700',
  repayment: 'bg-amber-50 text-amber-700',
};

const TYPE_LABELS = {
  expense: 'expenses',
  income: 'incomes',
  borrow: 'borrow rows',
  lend: 'lend rows',
  repayment: 'repayments',
};

/** 'just now' / '5 min ago' / '3 days ago' / '02 Oct 2026' */
function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return String(iso);
  const diff = Date.now() - t;
  if (diff < 60000) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;
  return formatDate(String(iso).slice(0, 10));
}

function countOf(value) {
  if (Array.isArray(value)) return value.length;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function ImportPanel() {
  const { settings } = useSettings();
  const currency = (settings && settings.currency) || 'INR';
  const fileId = useId();

  const [status, setStatus] = useState(null);
  const [url, setUrl] = useState('');
  const [csv, setCsv] = useState(null); // { name, text }
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(''); // 'preview' | 'commit' | 'template'
  const [error, setError] = useState('');
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [createMissingCategories, setCreateMissingCategories] = useState(true);
  const urlEdited = useRef(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await api('/import/status');
      setStatus(res || null);
      if (!urlEdited.current) setUrl((res && res.savedUrl) || '');
    } catch {
      /* endpoint not ready or nothing saved yet — the card still works */
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // The active source: an uploaded file wins over the typed URL.
  const source = csv ? { csv: csv.text } : url.trim() ? { url: url.trim() } : null;
  const canPreview = Boolean(source);

  async function pickFile(event) {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      event.target.value = '';
      return;
    }
    setError('');
    setPreview(null);
    try {
      const text = await file.text();
      setCsv({ name: file.name, text });
    } catch {
      setError('Could not read that file — pick a plain .csv export.');
      toastError('Could not read that file — pick a plain .csv export.');
    } finally {
      event.target.value = ''; // allow re-picking the same file
    }
  }

  function clearFile() {
    setCsv(null);
    setPreview(null);
    setError('');
  }

  async function saveUrlSilently(sheetUrl) {
    try {
      const res = await api('/import/settings', { method: 'PUT', body: { sheetUrl } });
      if (res && res.savedUrl != null) {
        setStatus((s) => (s ? { ...s, savedUrl: res.savedUrl } : s));
      }
    } catch {
      /* saving the URL is a convenience — never block the import on it */
    }
  }

  async function runPreview(event) {
    if (event) event.preventDefault();
    if (!source) return;
    setError('');
    setBusy('preview');
    try {
      const res = await api('/import/preview', { method: 'POST', body: source });
      setPreview(res || null);
      if (source.url) await saveUrlSilently(source.url);
    } catch (err) {
      setPreview(null);
      const message = errorMessage(err, 'Could not preview that sheet.');
      setError(message); // inline red message in the card
      toastApiError(err, 'Could not preview that sheet.'); // and a toast
    } finally {
      setBusy('');
    }
  }

  async function runCommit() {
    if (!source || !preview) return;
    setError('');
    setBusy('commit');
    try {
      const res = await api('/import/commit', {
        method: 'POST',
        body: { ...source, skipDuplicates, createMissingCategories },
      });
      const imported = countOf(res && res.imported);
      const skipped = countOf(res && res.skipped);
      const errors = countOf(res && res.errors);
      toastSuccess(
        `Imported ${imported} row${imported === 1 ? '' : 's'} · ${skipped} skipped · ${errors} error${errors === 1 ? '' : 's'}`,
      );
      setPreview(null);
      if (source.url) await saveUrlSilently(source.url);
      await loadStatus(); // refresh history
    } catch (err) {
      const message = errorMessage(err, 'Could not import those rows.');
      setError(message);
      toastApiError(err, 'Could not import those rows.');
    } finally {
      setBusy('');
    }
  }

  async function getTemplate() {
    setBusy('template');
    try {
      await download('/import/template', { filename: 'spend-wisely-import-template.csv' });
      toastSuccess('Import template downloaded.');
    } catch (err) {
      toastApiError(err, 'Could not download the template.');
    } finally {
      setBusy('');
    }
  }

  const stats = (preview && preview.stats) || {};
  const total = Number(stats.total) || 0;
  const ready = Number(stats.valid) || 0;
  const attention = Number(stats.invalid) || 0;
  const rows = (preview && Array.isArray(preview.rows) && preview.rows) || [];
  const rowErrors = (preview && Array.isArray(preview.errors) && preview.errors) || [];
  const byType = (stats.byType && typeof stats.byType === 'object' ? Object.entries(stats.byType) : []).filter(
    ([, n]) => Number(n) > 0,
  );
  const history = (status && Array.isArray(status.history) && status.history) || [];
  const columnsHint =
    status && status.template && Array.isArray(status.template.headers) && status.template.headers.length
      ? ` Columns: ${status.template.headers.join(', ')}.`
      : '';

  return (
    <div className="mt-5 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
      {/* header — pull IN vs the sync card's push OUT */}
      <div className="flex items-start gap-2">
        <span className="text-lg" aria-hidden="true">
          📥
        </span>
        <div>
          <p className="text-sm font-bold text-slate-700">Import from Google Sheet / CSV</p>
          <p className="text-xs text-slate-400">
            Pulls rows <span className="font-semibold text-slate-500">into</span> this app from a published sheet or a
            CSV file — the opposite of Google Sheets sync above, which pushes your data{' '}
            <span className="font-semibold text-slate-500">out</span>.
          </p>
        </div>
      </div>

      <form onSubmit={runPreview} className="mt-3">
        <Input
          label="Sheet URL"
          type="url"
          inputMode="url"
          placeholder="https://docs.google.com/spreadsheets/d/e/…/pub?output=csv"
          value={url}
          onChange={(e) => {
            urlEdited.current = true;
            setUrl(e.target.value);
          }}
          hint={`Paste the published sheet link (File → Share → Publish to web → CSV).${columnsHint}`}
        />

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            id={fileId}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={pickFile}
            aria-label="Choose CSV file"
          />
          <label
            htmlFor={fileId}
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-300 transition-colors hover:bg-slate-50"
          >
            Choose CSV file
          </label>
          <Button variant="secondary" onClick={getTemplate} loading={busy === 'template'} disabled={Boolean(busy)}>
            Download template
          </Button>
          <Button type="submit" loading={busy === 'preview'} disabled={!canPreview || Boolean(busy)}>
            Preview
          </Button>
        </div>

        {csv ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-lg bg-white px-2 py-1 font-semibold text-slate-600 ring-1 ring-slate-200">
              <span aria-hidden="true">📄</span>
              <span className="max-w-[16rem] truncate" title={csv.name}>
                {csv.name}
              </span>
              <button
                type="button"
                aria-label="Remove chosen file"
                onClick={clearFile}
                className="ml-0.5 rounded px-1 text-slate-400 hover:bg-slate-100 hover:text-rose-600"
              >
                ✕
              </button>
            </span>
            <span className="text-slate-400">will be imported instead of the URL</span>
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-600 ring-1 ring-rose-100">
            ⚠ {error}
          </p>
        ) : null}
      </form>

      {/* ---------- preview panel ---------- */}
      {preview ? (
        <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200/70">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-bold text-slate-700" title={preview.origin || ''}>
                Preview — {preview.origin || 'import'}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-bold text-slate-700">{total} rows</span>
                <span className="text-slate-300"> · </span>
                <span className="font-semibold text-emerald-600">{ready} ready</span>
                <span className="text-slate-300"> · </span>
                <span className="font-semibold text-rose-500">{attention} need attention</span>
                {byType.length ? (
                  <span className="text-slate-400">
                    {' '}
                    · {byType.map(([type, n]) => `${n} ${TYPE_LABELS[type] || type}`).join(' · ')}
                  </span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setPreview(null)}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              Close
            </button>
          </div>

          {/* sample rows */}
          {rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wide text-slate-400">
                    <th className="pb-1 pr-3 font-semibold">Date</th>
                    <th className="pb-1 pr-3 font-semibold">Type</th>
                    <th className="pb-1 pr-3 text-right font-semibold">Amount</th>
                    <th className="pb-1 pr-3 font-semibold">Category</th>
                    <th className="pb-1 pr-3 font-semibold">Person</th>
                    <th className="pb-1 font-semibold">Comment</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const invalid = row.valid === false;
                    return (
                      <Fragment key={row.rowNumber ?? i}>
                        <tr className={`border-t border-slate-100 ${invalid ? 'bg-rose-50' : ''}`}>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {row.date ? formatDate(row.date) : <span className="text-slate-300">—</span>}
                          </td>
                          <td className="py-1.5 pr-3">
                            <span
                              className={`inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                TYPE_TONES[row.type] || 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {row.type || '—'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-right">
                            <span className="money font-bold text-slate-700">
                              {row.amount != null && row.amount !== '' ? formatMoney(row.amount, currency) : '—'}
                            </span>
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {row.category ? (
                              <span className="block max-w-[9rem] truncate" title={row.category}>
                                {row.category}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-600">
                            {row.person ? (
                              <span className="block max-w-[8rem] truncate" title={row.person}>
                                {row.person}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="py-1.5 text-slate-600">
                            {row.comment ? (
                              <span className="block max-w-[12rem] truncate" title={row.comment}>
                                {row.comment}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                        </tr>
                        {invalid && row.error ? (
                          <tr className="bg-rose-50">
                            <td colSpan={6} className="pb-1.5 text-[11px] font-semibold text-rose-500">
                              ⚠ Row {row.rowNumber ?? i + 1} — {row.error}
                            </td>
                          </tr>
                        ) : null}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              {total > rows.length ? (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  Showing first {rows.length} of {total} rows — every row is checked on import.
                </p>
              ) : null}
            </div>
          ) : null}

          {/* row errors */}
          {rowErrors.length > 0 ? (
            <div className="mt-3">
              <p className="text-xs font-bold text-slate-600">
                {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} need{rowErrors.length === 1 ? 's' : ''}{' '}
                attention
              </p>
              <ul className="mt-1 max-h-36 space-y-1 overflow-y-auto rounded-xl bg-rose-50 p-2 ring-1 ring-rose-100">
                {rowErrors.map((err, i) => (
                  <li key={`${err.rowNumber}-${i}`} className="text-xs text-rose-600">
                    Row {err.rowNumber} — {err.message}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* options + commit */}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-500"
                  checked={skipDuplicates}
                  onChange={(e) => setSkipDuplicates(e.target.checked)}
                />
                Skip rows that already exist
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 accent-emerald-500"
                  checked={createMissingCategories}
                  onChange={(e) => setCreateMissingCategories(e.target.checked)}
                />
                Create missing categories
              </label>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" onClick={() => setPreview(null)}>
                Cancel
              </Button>
              <Button onClick={runCommit} loading={busy === 'commit'} disabled={ready === 0}>
                Import {ready} row{ready === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
          {ready === 0 ? (
            <p className="mt-2 text-right text-[11px] text-slate-400">No valid rows to import yet.</p>
          ) : null}
        </div>
      ) : null}

      {/* ---------- recent imports ---------- */}
      <div className="mt-5 border-t border-slate-100 pt-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="text-sm font-bold text-slate-700">Recent imports</p>
          {status && status.lastImportAt ? (
            <p className="text-xs text-slate-400">
              Last import {relTime(status.lastImportAt)}
              {status.savedUrl ? ' · from a Google Sheet' : ''}
            </p>
          ) : null}
        </div>

        {history.length === 0 ? (
          <EmptyState
            icon="📥"
            title="No imports yet"
            subtitle="Preview a published Google Sheet or a CSV file above to bring your data in."
          />
        ) : (
          <ul className="mt-2 space-y-1.5">
            {history.map((item) => {
              const imported = countOf(item.imported);
              const skipped = countOf(item.skipped);
              const errorCount = countOf(item.errorCount);
              return (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-3 py-2 ring-1 ring-slate-100"
                >
                  <span className="text-base" aria-hidden="true" title={item.source === 'url' ? 'Google Sheet' : 'CSV file'}>
                    {item.source === 'url' ? '🌐' : '📄'}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-700" title={item.origin || ''}>
                      {item.origin || (item.source === 'url' ? 'Google Sheet' : 'CSV upload')}
                    </span>
                    <span className="block text-[11px] text-slate-400">
                      {relTime(item.createdAt)} · {item.source === 'url' ? 'Google Sheet' : 'CSV upload'}
                    </span>
                  </span>
                  <span className="money whitespace-nowrap text-xs text-slate-500">
                    <span className="font-bold text-emerald-600">{imported} imported</span>
                    <span className="text-slate-300"> · </span>
                    {skipped} skipped
                    <span className="text-slate-300"> · </span>
                    <span className={errorCount > 0 ? 'font-bold text-rose-500' : ''}>
                      {errorCount} error{errorCount === 1 ? '' : 's'}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
