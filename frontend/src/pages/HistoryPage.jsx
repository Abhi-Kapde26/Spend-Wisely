import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../lib/api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { daysInMonth, formatDate, formatMoney, monthLabel, sentenceCase } from '../lib/format.js';

import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Modal from '../components/ui/Modal.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import MonthPicker from '../components/ui/MonthPicker.jsx';
import { toastApiError, toastError, toastSuccess } from '../components/ui/toast.js';

const SOURCES = [
  { key: 'all', label: 'All' },
  { key: 'income', label: 'Income' },
  { key: 'expense', label: 'Expense' },
  { key: 'borrow', label: 'Borrow' },
  { key: 'lend', label: 'Lend' },
  { key: 'repayment', label: 'Repayment' },
];

const TYPE_BADGE = {
  expense: 'bg-rose-100 text-rose-600',
  income: 'bg-emerald-100 text-emerald-700',
  borrow: 'bg-sky-100 text-sky-700',
  lend: 'bg-amber-100 text-amber-700',
  repayment: 'bg-violet-100 text-violet-700',
};

const SUMMARY_FIELDS = [
  ['openingBalance', 'Opening Balance'],
  ['moneyIn', 'Money In'],
  ['moneyOut', 'Money Out'],
  ['expenses', 'Expenses'],
  ['moneyLent', 'Money Lent'],
  ['moneyBorrowed', 'Money Borrowed'],
  ['repaymentsReceived', 'Repayments Received'],
  ['repaymentsGiven', 'Repayments Given'],
  ['closingBalance', 'Closing Balance'],
];

const LIMIT = 20;

function SourceChips({ value, onChange }) {
  return (
    <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1">
      {SOURCES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => onChange(s.key)}
          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-bold transition ${
            value === s.key
              ? 'bg-slate-800 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
          }`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

function SummaryCard({ summary, currency }) {
  if (!summary) return null;
  return (
    <Card>
      <CardHeader title="Statement summary" subtitle="Money in and out for this month" />
      <CardBody className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUMMARY_FIELDS.filter(([key]) => summary[key] !== undefined && summary[key] !== null).map(
          ([key, label]) => {
            const isClose = key === 'closingBalance' || key === 'openingBalance';
            return (
              <div key={key} className="rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
                <p
                  className={`money mt-0.5 text-sm font-bold ${
                    key === 'moneyOut' || key === 'expenses'
                      ? 'text-rose-600'
                      : key === 'moneyIn'
                        ? 'text-emerald-600'
                        : isClose
                          ? 'text-slate-800'
                          : 'text-slate-700'
                  }`}
                >
                  {formatMoney(summary[key], currency)}
                </p>
              </div>
            );
          },
        )}
      </CardBody>
    </Card>
  );
}

function UnifiedTable({ items, currency, emptyTitle = 'No transactions found' }) {
  if (!items || items.length === 0) {
    return <EmptyState icon="🔍" title={emptyTitle} subtitle="Try a different month, filter or search." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2.5 font-semibold">Date</th>
            <th className="px-4 py-2.5 font-semibold">Type</th>
            <th className="px-4 py-2.5 font-semibold">Category</th>
            <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
            <th className="px-4 py-2.5 text-right font-semibold">Total Balance</th>
          </tr>
        </thead>
        <tbody>
          {items.map((row, index) => {
            const key = `${row.source || row.type}-${row.id ?? index}-${index}`;
            const isIn = row.direction === 'in';
            const bal = row.totalBalance ?? row.balance;
            return (
              <tr key={key} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/70">
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-slate-500">{formatDate(row.date)}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                      TYPE_BADGE[row.type] || 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.type}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  <p className="truncate text-sm font-semibold text-slate-700">
                    {row.category ? `${row.category.icon || ''} ` : ''}
                    {row.title || '—'}
                  </p>
                  <p className="truncate text-xs text-slate-400">
                    {row.subtitle || row.comment || row.status ? (
                      <>
                        {[row.subtitle, row.comment].filter(Boolean).join(' · ')}
                        {row.status ? ` · ${sentenceCase(row.status)}` : ''}
                      </>
                    ) : (
                      '—'
                    )}
                  </p>
                </td>
                <td
                  className="money whitespace-nowrap px-4 py-2.5 text-right text-sm font-bold"
                  style={{ color: isIn ? '#10b981' : '#ef4444' }}
                >
                  {isIn ? '+' : '−'}
                  {formatMoney(row.amount, currency)}
                </td>
                <td className="money whitespace-nowrap px-4 py-2.5 text-right text-sm font-bold text-slate-700">
                  {bal !== undefined && bal !== null ? formatMoney(bal, currency) : '—'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function CompareModal({ open, onClose, data, currency, loading }) {
  return (
    <Modal open={open} onClose={onClose} title="Compare with previous month" size="lg">
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner label="Loading comparison" />
        </div>
      ) : !data ? (
        <EmptyState icon="📊" title="No comparison available" />
      ) : (
        <div className="space-y-4">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                  <th className="py-2 font-semibold">Metric</th>
                  <th className="py-2 text-right font-semibold">
                    {data.previous && data.previous.label ? data.previous.label : 'Previous'}
                  </th>
                  <th className="py-2 text-right font-semibold">
                    {data.current && data.current.label ? data.current.label : 'Current'}
                  </th>
                </tr>
              </thead>
              <tbody>
                {SUMMARY_FIELDS.filter(
                  ([key]) =>
                    (data.current && data.current[key] !== undefined) ||
                    (data.previous && data.previous[key] !== undefined),
                ).map(([key, label]) => (
                  <tr key={key} className="border-t border-slate-100">
                    <td className="py-2 text-slate-500">{label}</td>
                    <td className="money py-2 text-right font-semibold text-slate-500">
                      {formatMoney(data.previous ? data.previous[key] : 0, currency)}
                    </td>
                    <td className="money py-2 text-right font-bold text-slate-800">
                      {formatMoney(data.current ? data.current[key] : 0, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {data.deltas && typeof data.deltas === 'object' ? (
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">Deltas</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Object.entries(data.deltas).map(([key, value]) => (
                  <div key={key} className="rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
                    <p className="text-[11px] font-semibold text-slate-400">{sentenceCase(key)}</p>
                    <p
                      className="money text-sm font-bold"
                      style={{
                        color:
                          typeof value === 'number'
                            ? value > 0
                              ? '#10b981'
                              : value < 0
                                ? '#ef4444'
                                : '#64748b'
                            : '#334155',
                      }}
                    >
                      {typeof value === 'number'
                        ? `${value > 0 ? '+' : ''}${formatMoney(value, currency)}`
                        : String(value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </Modal>
  );
}

export default function HistoryPage() {
  const navigate = useNavigate();
  const { currency } = useSettings();
  const now = useMemo(() => new Date(), []);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [source, setSource] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState({ items: [], total: 0, page: 1, limit: LIMIT, summary: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [archive, setArchive] = useState([]);

  const [exporting, setExporting] = useState('');
  const [compareOpen, setCompareOpen] = useState(false);
  const [compare, setCompare] = useState(null);
  const [compareLoading, setCompareLoading] = useState(false);

  /* debounced search (300ms) */
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  /* history fetch */
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api('/history', { params: { year, month, source, search, page, limit: LIMIT } })
      .then((res) => {
        if (cancelled) return;
        setRows({
          items: (res && res.items) || [],
          total: (res && res.total) || 0,
          page: (res && res.page) || 1,
          limit: (res && res.limit) || LIMIT,
          summary: (res && res.summary) || null,
        });
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError((err && err.message) || 'Could not load history.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month, source, search, page]);

  /* monthly archive (once) */
  useEffect(() => {
    let cancelled = false;
    api('/monthly')
      .then((res) => {
        if (!cancelled) setArchive((res && res.items) || []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const changeMonth = useCallback((nextYear, nextMonth) => {
    setYear(nextYear);
    setMonth(nextMonth);
    setPage(1);
  }, []);

  function shiftMonth(delta) {
    let nextMonth = month + delta;
    let nextYear = year;
    if (nextMonth < 1) {
      nextMonth = 12;
      nextYear -= 1;
    } else if (nextMonth > 12) {
      nextMonth = 1;
      nextYear += 1;
    }
    changeMonth(nextYear, nextMonth);
  }

  const range = useMemo(() => {
    const first = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = `${year}-${String(month).padStart(2, '0')}-${String(daysInMonth(year, month)).padStart(2, '0')}`;
    return { from: first, to: last };
  }, [year, month]);

  async function runExport(kind) {
    setExporting(kind);
    try {
      const params =
        kind === 'pdf'
          ? { year, month }
          : {
              from: range.from,
              to: range.to,
              ...(source === 'income' || source === 'expense' ? { type: source } : {}),
            };
      await download(`/export/${kind}`, {
        params,
        filename: `spend-wisely-${range.from}_${range.to}.${kind === 'excel' ? 'xlsx' : kind}`,
      });
      toastSuccess(`${kind === 'excel' ? 'Excel' : kind.toUpperCase()} export downloaded.`);
    } catch (err) {
      toastApiError(err, 'Export failed.');
    } finally {
      setExporting('');
    }
  }

  async function openCompare() {
    setCompareOpen(true);
    setCompare(null);
    setCompareLoading(true);
    try {
      const res = await api('/monthly/compare', { params: { year, month } });
      setCompare(res);
    } catch (err) {
      toastError((err && err.message) || 'Could not load the comparison.');
      setCompareOpen(false);
    } finally {
      setCompareLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil((rows.total || 0) / (rows.limit || LIMIT)));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800">History</h1>
          <p className="text-sm text-slate-400">Every rupee, unified — transactions, borrowings and repayments.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => runExport('csv')} loading={exporting === 'csv'}>
            Export CSV
          </Button>
          <Button size="sm" variant="secondary" onClick={() => runExport('excel')} loading={exporting === 'excel'}>
            Export Excel
          </Button>
          <Button size="sm" variant="secondary" onClick={() => runExport('pdf')} loading={exporting === 'pdf'}>
            Export PDF
          </Button>
        </div>
      </div>

      {/* Month nav */}
      <Card className="px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
              className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              ←
            </button>
            <span className="min-w-[9.5rem] text-center text-base font-bold text-slate-800">
              {monthLabel(year, month)}
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
              className="rounded-xl bg-white px-3 py-1.5 text-sm font-bold text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
            >
              →
            </button>
            <MonthPicker
              value={{ year, month }}
              onChange={(v) => changeMonth(v.year, v.month)}
              className="hidden sm:flex"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={openCompare}
              className="text-sm font-semibold text-emerald-600 hover:underline"
            >
              Compare with previous month ↗
            </button>
            <button
              type="button"
              onClick={() => navigate(`/history/${year}/${month}`)}
              className="text-sm font-semibold text-slate-500 hover:text-slate-700"
            >
              Full statement →
            </button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <SummaryCard summary={rows.summary} currency={currency} />

          <Card>
            <CardHeader title="Transactions" subtitle={`${rows.total} record${rows.total === 1 ? '' : 's'}`} />
            <CardBody className="space-y-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <SourceChips
                  value={source}
                  onChange={(key) => {
                    setSource(key);
                    setPage(1);
                  }}
                />
                <div className="relative sm:ml-auto sm:w-64">
                  <input
                    type="search"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    placeholder="Search comment, category, person, amount…"
                    aria-label="Search transactions"
                    className="w-full rounded-xl border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <span className="pointer-events-none absolute left-3 top-2.5 text-slate-400" aria-hidden="true">
                    🔍
                  </span>
                </div>
              </div>

              {error ? (
                <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-100">
                  {error}
                </div>
              ) : loading ? (
                <div className="flex justify-center py-10">
                  <Spinner label="Loading history" />
                </div>
              ) : (
                <UnifiedTable items={rows.items} currency={currency} />
              )}

              {totalPages > 1 && !loading ? (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-slate-400">
                    Page {rows.page} of {totalPages} · {rows.total} total
                  </span>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                      ← Prev
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next →
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardBody>
          </Card>
        </div>

        {/* Monthly archive */}
        <Card className="h-fit">
          <CardHeader title="Monthly archive" subtitle="Jump to a past statement" />
          <CardBody>
            {archive.length === 0 ? (
              <EmptyState icon="🗂️" title="No archives yet" subtitle="Statements appear after your first month." />
            ) : (
              <ul className="max-h-[28rem] space-y-1.5 overflow-y-auto scroll-thin pr-1">
                {archive.map((entry, index) => {
                  const active = Number(entry.year) === Number(year) && Number(entry.month) === Number(month);
                  const key = `${entry.year}-${entry.month}-${index}`;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => navigate(`/history/${entry.year}/${entry.month}`)}
                        className={`flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition ${
                          active ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'hover:bg-slate-50'
                        }`}
                      >
                        <span>
                          <span className="block text-sm font-semibold text-slate-700">
                            {entry.label || monthLabel(entry.year, entry.month)}
                          </span>
                          <span className="block text-[11px] text-slate-400">
                            {entry.transactionCount ?? 0} transactions · income{' '}
                            <span className="money">{formatMoney(entry.income, currency)}</span>
                          </span>
                        </span>
                        <span className="money text-sm font-bold text-rose-500">
                          {formatMoney(entry.totalSpent, currency)}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <CompareModal open={compareOpen} onClose={() => setCompareOpen(false)} data={compare} loading={compareLoading} currency={currency} />
    </div>
  );
}

export { UnifiedTable, SummaryCard, SUMMARY_FIELDS, TYPE_BADGE };
