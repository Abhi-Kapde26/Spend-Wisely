import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';
import { formatMoney, percent, statusMeta } from '../../lib/format.js';

export default function DailyBudgetCard({ today, week, currency }) {
  const t = today || { spent: 0, limit: 0, remaining: 0, safeToSpend: 0, overAmount: 0, status: 'none', count: 0 };
  const limit = Number(t.limit) || 0;
  const spent = Number(t.spent) || 0;
  const meta = statusMeta(t.status);
  const fraction = limit > 0 ? spent / limit : 0;

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Today's Budget"
        subtitle={t.count ? `${t.count} transaction${t.count === 1 ? '' : 's'} today` : 'No transactions yet'}
        action={
          <span
            className="rounded-full px-2.5 py-1 text-xs font-bold"
            style={{ backgroundColor: `${meta.color}22`, color: meta.color }}
          >
            {meta.icon} {meta.label}
          </span>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-end justify-between gap-2">
          <p className="money text-2xl font-bold text-slate-800">
            {formatMoney(spent, currency)}
            <span className="text-sm font-semibold text-slate-400">
              {limit > 0 ? ` / ${formatMoney(limit, currency)}` : ''}
            </span>
          </p>
          {limit > 0 ? (
            <span className="money text-sm font-semibold text-slate-500">{percent(fraction)}</span>
          ) : null}
        </div>

        <ProgressBar value={fraction} status={t.status} />

        <p
          className="money text-sm font-semibold"
          style={{ color: t.overAmount > 0 ? '#ef4444' : limit > 0 ? '#059669' : '#64748b' }}
        >
          {limit === 0
            ? 'No daily limit set — add one in Settings.'
            : t.overAmount > 0
              ? `${formatMoney(t.overAmount, currency)} over budget`
              : `${formatMoney(t.remaining, currency)} remaining`}
        </p>

        {week && Number(week.limit) > 0 ? (
          <div className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100">
            <span className="text-xs font-semibold text-slate-500">This week</span>
            <span className="money text-xs font-bold text-slate-700">
              {formatMoney(week.spent, currency)} / {formatMoney(week.limit, currency)}
            </span>
          </div>
        ) : null}

        <div className="mt-auto rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
          <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600">
            Safe to Spend Today
          </p>
          <p className="money text-2xl font-bold text-emerald-600">
            {formatMoney(t.safeToSpend, currency)}
          </p>
        </div>
      </CardBody>
    </Card>
  );
}
