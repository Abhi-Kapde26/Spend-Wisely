import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import CategoryPicker from './CategoryPicker.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatMoney, percent, todayISO } from '../../lib/format.js';
import { toastError, toastSuccess, toastWarning } from '../ui/toast.js';

function pickDefaultCategory(categories, type) {
  const list = categories.filter((c) => c.type === type || c.type === 'both');
  if (type === 'income') {
    return list.find((c) => /pocket\s*money/i.test(c.name)) || list[0] || null;
  }
  return list[0] || null;
}

/**
 * SPEC §2.2 — never blocks the save; only warns when the expense *crosses*
 * the 75% / 90% / 100% thresholds of the daily limit.
 */
function dailyLimitAlert({ budget, spentBefore, spentAfter, currency }) {
  if (!budget || Number(budget.limit) <= 0) return;
  const limit = Number(budget.limit);
  const before = Number(spentBefore) / limit;
  const after = Number(spentAfter) / limit;

  if (after > 1 && before <= 1) {
    toastError(
      `Daily limit exceeded — you've spent ${formatMoney(spentAfter, currency)} of ${formatMoney(limit, currency)} today.`,
    );
  } else if (after > 0.9 && before <= 0.9) {
    toastWarning(`You've used ${percent(after)} of today's ${formatMoney(limit, currency)} limit.`);
  } else if (after > 0.75 && before <= 0.75) {
    toastWarning(`Heads up — ${percent(after)} of today's daily limit is used.`);
  }
}

/**
 * Shared add/edit transaction modal. `AddExpenseModal` and `AddMoneyModal`
 * are thin wrappers around it (SPEC §5 modals).
 */
export function TransactionModal({
  open,
  onClose,
  onSaved,
  transaction = null,
  initialType = 'expense',
  title,
  budget = null,
}) {
  const { currency } = useSettings();
  const editing = Boolean(transaction && transaction.id);

  const [type, setType] = useState(initialType);
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [categories, setCategories] = useState([]);
  const [loadingCats, setLoadingCats] = useState(false);
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState('');

  useEffect(() => {
    if (!open) return undefined;

    setAmountError('');
    if (transaction) {
      setType(transaction.type || initialType);
      setAmount(transaction.amount != null ? String(transaction.amount) : '');
      setCategoryId(
        transaction.category && transaction.category.id != null ? String(transaction.category.id) : '',
      );
      setDate(transaction.date || todayISO());
      setComment(transaction.comment || '');
    } else {
      setType(initialType);
      setAmount('');
      setCategoryId('');
      setDate(todayISO());
      setComment('');
    }

    let cancelled = false;
    setLoadingCats(true);
    api('/categories')
      .then((res) => {
        if (cancelled) return;
        const items = (res && res.items) || [];
        setCategories(items);
        if (!transaction) {
          const fallback = pickDefaultCategory(items, initialType);
          if (fallback) setCategoryId(String(fallback.id));
        }
      })
      .catch(() => {
        if (!cancelled) setCategories([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingCats(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(event) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setAmountError('Enter an amount greater than 0.');
      return;
    }

    setSaving(true);
    try {
      const body = { type, amount: value, date, comment: comment.trim() };
      if (categoryId) body.categoryId = Number(categoryId);

      const res = editing
        ? await api(`/transactions/${transaction.id}`, { method: 'PUT', body })
        : await api('/transactions', { method: 'POST', body });

      // Daily-limit crossing alerts (never block, always save first)
      const todayStr = todayISO();
      const wasExpenseToday = editing && transaction.type === 'expense' && transaction.date === todayStr;
      const isExpenseToday = type === 'expense' && date === todayStr;
      if (budget && (wasExpenseToday || isExpenseToday)) {
        const before = Number(budget.spent) || 0;
        const after =
          before - (wasExpenseToday ? Number(transaction.amount) || 0 : 0) + (isExpenseToday ? value : 0);
        dailyLimitAlert({ budget, spentBefore: before, spentAfter: after, currency });
      }

      if (editing) {
        toastSuccess(`${type === 'expense' ? 'Expense' : 'Income'} updated.`);
      } else if (type === 'expense') {
        toastSuccess(`Expense of ${formatMoney(value, currency)} saved.`);
      } else {
        toastSuccess(`Added ${formatMoney(value, currency)} income.`);
      }

      if (onSaved) onSaved(res.transaction);
      onClose();
    } catch (err) {
      toastError((err && err.message) || 'Could not save the transaction.');
    } finally {
      setSaving(false);
    }
  }

  const heading = editing
    ? 'Edit Transaction'
    : title || (initialType === 'income' ? 'Add Money' : 'Add Expense');

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={heading}
      subtitle={editing ? 'Update the details below' : 'Money in, money out — keep it accurate'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {editing ? 'Save changes' : initialType === 'income' ? 'Add money' : 'Save expense'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {editing ? (
          <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
            {['expense', 'income'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t);
                  const fallback = pickDefaultCategory(categories, t);
                  if (fallback) setCategoryId(String(fallback.id));
                }}
                className={`rounded-lg px-3 py-1.5 text-xs font-bold capitalize transition ${
                  type === t ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => {
              setAmount(e.target.value);
              setAmountError('');
            }}
            error={amountError || undefined}
            className="col-span-2 sm:col-span-1"
          />
          <Input
            label="Date"
            required
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <div>
          <p className="mb-1.5 text-xs font-semibold text-slate-600">
            Category {loadingCats ? <span className="text-slate-400">loading…</span> : null}
          </p>
          <CategoryPicker
            categories={categories}
            type={type}
            value={categoryId}
            onSelect={(cat) => setCategoryId(String(cat.id))}
            onCreated={(cat) => {
              setCategories((prev) => [...prev, cat]);
              setCategoryId(String(cat.id));
            }}
          />
        </div>

        <Input
          label="Comment (optional)"
          placeholder={type === 'income' ? 'e.g. From mom' : 'e.g. Dinner with friends'}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={200}
        />

        {/* Screen-reader friendly submit target for Enter key */}
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}

export default function AddExpenseModal(props) {
  return <TransactionModal {...props} initialType="expense" title="Add Expense" />;
}
