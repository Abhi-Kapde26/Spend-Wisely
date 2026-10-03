import Card, { CardHeader } from '../ui/Card.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import Spinner from '../ui/Spinner.jsx';
import { formatDate, formatMoney, formatTime, todayISO } from '../../lib/format.js';

export default function TodayTransactionList({ items, currency, onEdit, onDelete, loading }) {
  return (
    <Card className="flex flex-col">
      <CardHeader
        title="Today's Transactions"
        subtitle={items && items.length ? `${items.length} of today's latest` : undefined}
        action={
          <span className="text-xs font-semibold text-slate-400">{formatDate(todayISO())}</span>
        }
      />
      <div className="px-3 pb-4 pt-2">
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner label="Loading transactions" />
          </div>
        ) : !items || items.length === 0 ? (
          <EmptyState
            icon="🧾"
            title="No transactions yet today"
            subtitle="Tap “+ Add Expense” to record your first spend of the day."
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((tx) => {
              const category = tx.category || {};
              const isExpense = tx.type === 'expense';
              return (
                <li key={tx.id} className="flex items-center gap-3 py-2.5">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-base"
                    style={{ backgroundColor: `${category.color || '#64748b'}22` }}
                    aria-hidden="true"
                  >
                    {category.icon || '📦'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-slate-700">
                      {category.name || (isExpense ? 'Expense' : 'Income')}
                    </p>
                    <p className="truncate text-xs text-slate-400">
                      {tx.comment || 'No note'}
                      {tx.createdAt ? ` · ${formatTime(tx.createdAt)}` : ''}
                    </p>
                  </div>
                  <span
                    className="money text-sm font-bold"
                    style={{ color: isExpense ? '#ef4444' : '#10b981' }}
                  >
                    {isExpense ? '-' : '+'}
                    {formatMoney(tx.amount, currency)}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onEdit && onEdit(tx)}
                      aria-label={`Edit ${category.name || 'transaction'}`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete && onDelete(tx)}
                      aria-label={`Delete ${category.name || 'transaction'}`}
                      className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Card>
  );
}
