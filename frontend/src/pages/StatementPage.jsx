import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, download } from '../lib/api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatDate, formatMoney, monthLabel, percent } from '../lib/format.js';

import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import ProgressBar from '../components/ui/ProgressBar.jsx';
import { FullPageSpinner } from '../components/ui/Spinner.jsx';
import { toastApiError, toastSuccess } from '../components/ui/toast.js';
import { SummaryCard, UnifiedTable } from './HistoryPage.jsx';

function normalizeStatement(raw) {
  const s = raw || {};
  return {
    ...s,
    label: s.label || monthLabel(s.year, s.month),
    openingBalance: s.openingBalance != null ? s.openingBalance : s.opening,
    closingBalance: s.closingBalance != null ? s.closingBalance : s.closing,
    items: s.items || [],
  };
}

export default function StatementPage() {
  const params = useParams();
  const navigate = useNavigate();
  const { currency } = useSettings();

  const year = Number(params.year);
  const month = Number(params.month);

  const [statement, setStatement] = useState(null);
  const [budget, setBudget] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setStatement(null);
    Promise.all([
      api(`/monthly/${year}/${month}`),
      api('/budgets/month', { params: { year, month } }).catch(() => null),
    ])
      .then(([st, bg]) => {
        if (cancelled) return;
        setStatement(normalizeStatement(st));
        setBudget(bg);
        setError('');
      })
      .catch((err) => {
        if (!cancelled) setError((err && err.message) || 'Could not load this statement.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [year, month]);

  const range = useMemo(() => {
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { from, to };
  }, [year, month]);

  async function runExport(kind) {
    setExporting(kind);
    try {
      const params =
        kind === 'pdf'
          ? { year, month }
          : { from: range.from, to: range.to };
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

  if (loading) return <FullPageSpinner label="Loading statement…" />;

  if (error || !statement) {
    return (
      <div className="space-y-4">
        <Link to="/history" className="text-sm font-semibold text-emerald-600 hover:underline">
          ← Back to History
        </Link>
        <Card className="p-8 text-center">
          <p className="text-3xl" aria-hidden="true">📄</p>
          <h1 className="mt-2 text-lg font-bold text-slate-800">Statement not available</h1>
          <p className="mt-1 text-sm text-slate-400">{error || 'No data for this month.'}</p>
          <Button className="mt-4" onClick={() => navigate('/history')}>
            Back to History
          </Button>
        </Card>
      </div>
    );
  }

  const budgetAmount = budget ? Number(budget.amount) || 0 : 0;
  const budgetSpent = budget ? Number(budget.spent) || 0 : 0;
  const budgetProgress = budgetAmount > 0 ? budgetSpent / budgetAmount : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/history" className="text-sm font-semibold text-emerald-600 hover:underline">
            ← Back to History
          </Link>
          <h1 className="mt-1 text-xl font-extrabold tracking-tight text-slate-800">
            Statement · {statement.label}
          </h1>
          <p className="text-sm text-slate-400">
            {formatDate(range.from)} — {formatDate(range.to)} · {statement.items.length} records
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/history/${month === 1 ? year - 1 : year}/${month === 1 ? 12 : month - 1}`)}
          >
            ← Prev month
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(`/history/${month === 12 ? year + 1 : year}/${month === 12 ? 1 : month + 1}`)}
          >
            Next month →
          </Button>
        </div>
      </div>

      {/* Money in / out headline */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Money In</p>
          <p className="money mt-1 text-2xl font-bold text-emerald-600">
            {formatMoney(statement.moneyIn, currency)}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Money Out</p>
          <p className="money mt-1 text-2xl font-bold text-rose-600">
            {formatMoney(statement.moneyOut, currency)}
          </p>
        </Card>
        <Card className="px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Closing Balance</p>
          <p className="money mt-1 text-2xl font-bold text-slate-800">
            {formatMoney(statement.closingBalance, currency)}
          </p>
        </Card>
      </div>

      <SummaryCard summary={statement} currency={currency} />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card>
          <CardHeader title="Budget vs actual" subtitle={statement.label} />
          <CardBody className="space-y-3">
            {budgetAmount > 0 ? (
              <>
                <div className="flex items-end justify-between">
                  <p className="money text-xl font-bold text-slate-800">
                    {formatMoney(budgetSpent, currency)}
                    <span className="text-sm font-semibold text-slate-400">
                      {' '}
                      / {formatMoney(budgetAmount, currency)}
                    </span>
                  </p>
                  <span className="money text-sm font-semibold text-slate-500">
                    {percent(budgetProgress)}
                  </span>
                </div>
                <ProgressBar
                  value={budgetProgress}
                  status={
                    budgetProgress > 1 ? 'exceeded' : budgetProgress > 0.9 ? 'near_limit' : budgetProgress > 0.75 ? 'warning' : 'safe'
                  }
                />
                <p className="money text-sm font-semibold text-slate-500">
                  {formatMoney(budget.remaining, currency)} remaining
                </p>
              </>
            ) : (
              <p className="text-sm text-slate-400">
                No monthly budget set for {statement.label}. Add one in Settings → Budget.
              </p>
            )}
          </CardBody>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader
            title="Download"
            subtitle="Authenticated export of this statement"
            action={
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" loading={exporting === 'csv'} onClick={() => runExport('csv')}>
                  CSV
                </Button>
                <Button size="sm" variant="secondary" loading={exporting === 'excel'} onClick={() => runExport('excel')}>
                  Excel
                </Button>
                <Button size="sm" variant="secondary" loading={exporting === 'pdf'} onClick={() => runExport('pdf')}>
                  PDF
                </Button>
              </div>
            }
          />
          <CardBody>
            <p className="text-sm text-slate-500">
              The PDF is a bank-style A4 statement with opening/closing balances, the money in/out breakdown
              and a zebra-striped transaction table.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="All records" subtitle="Unified list — transactions, borrow/lend and repayments" />
        <CardBody>
          <UnifiedTable items={statement.items} currency={currency} emptyTitle="Nothing happened this month" />
        </CardBody>
      </Card>
    </div>
  );
}
