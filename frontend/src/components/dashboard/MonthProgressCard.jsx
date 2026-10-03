import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';
import { formatMoney, monthLabel, percent } from '../../lib/format.js';

export default function MonthProgressCard({ month, currency, year, monthNumber }) {
  const m = month || { spent: 0, budget: 0, remaining: 0, income: 0, progress: 0 };
  const budget = Number(m.budget) || 0;
  const spent = Number(m.spent) || 0;
  const progress = budget > 0 ? spent / budget : Number(m.progress) || 0;
  const status = budget <= 0 ? 'none' : progress > 1 ? 'exceeded' : progress > 0.9 ? 'near_limit' : progress > 0.75 ? 'warning' : 'safe';
  const label = year && monthNumber ? monthLabel(year, monthNumber) : 'This Month';

  return (
    <Card className="flex flex-col">
      <CardHeader title={`${label} Progress`} subtitle="Spent vs monthly budget" />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex items-end justify-between">
          <p className="money text-2xl font-bold text-slate-800">
            {formatMoney(spent, currency)}
            <span className="text-sm font-semibold text-slate-400">
              {budget > 0 ? ` / ${formatMoney(budget, currency)}` : ''}
            </span>
          </p>
          {budget > 0 ? (
            <span className="money text-sm font-semibold text-slate-500">{percent(progress)}</span>
          ) : null}
        </div>
        <ProgressBar value={progress} status={status} />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              {budget > 0 ? 'Remaining' : 'Budget'}
            </p>
            <p className="money font-bold text-slate-700">
              {budget > 0 ? formatMoney(m.remaining, currency) : 'Not set'}
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Income</p>
            <p className="money font-bold text-emerald-600">{formatMoney(m.income, currency)}</p>
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
