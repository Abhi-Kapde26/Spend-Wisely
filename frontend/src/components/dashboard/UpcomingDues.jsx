import Card, { CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import { formatDate, formatMoney, formatSignedMoney } from '../../lib/format.js';
import { normalizeItem } from '../../lib/items.js';

export default function UpcomingDues({ items, currency, onRepay }) {
  const list = (items || []).map(normalizeItem).filter((i) => i && i.status !== 'completed');

  return (
    <Card className="flex flex-col">
      <CardHeader title="Upcoming Dues" subtitle="Due within the next 7 days (or overdue)" />
      <div className="px-5 pb-5 pt-2">
        {list.length === 0 ? (
          <EmptyState icon="🎉" title="Nothing due soon" subtitle="You're all caught up." />
        ) : (
          <ul className="space-y-2">
            {list.map((item) => (
              <li
                key={`${item.type}-${item.id}`}
                className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${
                  item.overdue ? 'border-rose-200 bg-rose-50/60' : 'border-slate-200 bg-slate-50/60'
                }`}
              >
                <span className="text-base" aria-hidden="true">
                  ⏰
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-700">
                    {item.type === 'borrow' ? 'Repay' : 'Collect from'} {item.person}
                  </p>
                  <p className="text-xs text-slate-400">
                    {item.overdue ? (
                      <span className="font-semibold text-rose-500">Overdue since {formatDate(item.dueDate)}</span>
                    ) : (
                      <>Due {item.dueDate ? formatDate(item.dueDate) : '—'}</>
                    )}
                    {' · '}
                    {item.type === 'borrow' ? 'you owe' : 'you get'}{' '}
                    <span className="money font-semibold text-slate-600">
                      {formatSignedMoney(item.remaining, item.type === 'borrow' ? 'out' : 'in', currency)}
                    </span>
                  </p>
                </div>
                <Button size="xs" variant="subtle" onClick={() => onRepay(item)}>
                  Record Repayment
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}
