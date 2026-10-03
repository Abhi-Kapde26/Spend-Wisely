import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Spinner from '../ui/Spinner.jsx';
import { formatMoney, formatDate } from '../../lib/format.js';
import { normalizeItem } from '../../lib/items.js';

export default function BorrowLendSummary({ items, totals, currency, onBorrow, onLend, onRepay, onEdit, onDelete, loading }) {
  const list = (items || []).map(normalizeItem).filter((i) => i && i.status !== 'completed');
  const toReceive = Number((totals && totals.toReceive) || 0);
  const toPay = Number((totals && totals.toPay) || 0);

  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Borrow & Lend"
        subtitle="Money you owe and money owed to you"
        action={
          <div className="flex gap-2">
            <Button size="sm" variant="subtle" onClick={onBorrow}>
              + Borrow
            </Button>
            <Button size="sm" variant="secondary" onClick={onLend}>
              + Lend
            </Button>
          </div>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-emerald-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700">
              Money to Receive
            </p>
            <p className="money text-lg font-bold text-emerald-700">{formatMoney(toReceive, currency)}</p>
          </div>
          <div className="rounded-xl bg-rose-50 px-3 py-2.5">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-600">
              Money to Pay
            </p>
            <p className="money text-lg font-bold text-rose-600">{formatMoney(toPay, currency)}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-6">
            <Spinner label="Loading borrow & lend" />
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            icon="🤝"
            title="No active borrow / lend records"
            subtitle="Borrowed or lent money will show up here with a Record Repayment action."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {list.slice(0, 6).map((item) => (
              <li key={item.id} className="flex items-center gap-3 py-2.5">
                <span
                  className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold ${
                    item.type === 'borrow' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {item.type === 'borrow' ? 'BORROW' : 'LEND'}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-slate-700">{item.person}</p>
                  <p className="truncate text-xs text-slate-400">
                    {item.overdue ? (
                      <span className="font-semibold text-rose-500">Overdue</span>
                    ) : item.dueDate ? (
                      <>Due {formatDate(item.dueDate)}</>
                    ) : (
                      <>Added {formatDate(item.date)}</>
                    )}
                    {item.paid > 0 ? ` · paid ${formatMoney(item.paid, currency)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="money text-sm font-bold text-slate-700">
                    {formatMoney(item.remaining, currency)}
                  </p>
                  <p className="text-[10px] uppercase text-slate-400">remaining</p>
                </div>
                <div className="flex items-center gap-1">
                  {onEdit ? (
                    <button
                      type="button"
                      aria-label={`Edit record for ${item.person}`}
                      onClick={() => onEdit(item)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      ✏️
                    </button>
                  ) : null}
                  {onDelete ? (
                    <button
                      type="button"
                      aria-label={`Delete record for ${item.person}`}
                      onClick={() => onDelete(item)}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      🗑️
                    </button>
                  ) : null}
                  <Button size="xs" variant="subtle" onClick={() => onRepay(item)}>
                    Record Repayment
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {list.length > 6 ? (
          <p className="text-center text-xs text-slate-400">
            +{list.length - 6} more — manage them from History.
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}
