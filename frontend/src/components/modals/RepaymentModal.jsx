import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Spinner from '../ui/Spinner.jsx';
import ConfirmDialog from '../ui/ConfirmDialog.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatMoney, todayISO } from '../../lib/format.js';
import { normalizeItem } from '../../lib/items.js';
import { toastError, toastSuccess } from '../ui/toast.js';

const STATUS_LABELS = {
  pending: 'PENDING',
  partially_paid: 'PARTIALLY PAID',
  completed: 'COMPLETED',
};

const STATUS_STYLES = {
  pending: { color: '#eab308', bg: '#eab30822' },
  partially_paid: { color: '#f97316', bg: '#f9731622' },
  completed: { color: '#22c55e', bg: '#22c55e22' },
};

function StatusBadge({ status }) {
  const style = STATUS_STYLES[status] || STATUS_STYLES.pending;
  return (
    <span
      className="rounded-full px-2.5 py-1 text-[11px] font-bold tracking-wide"
      style={{ backgroundColor: style.bg, color: style.color }}
    >
      {STATUS_LABELS[status] || String(status || '').toUpperCase()}
    </span>
  );
}

function SummaryRow({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-xs text-slate-500">{label}</span>
      <span className={`money text-sm ${strong ? 'font-bold' : 'font-semibold'} text-slate-700`}>{value}</span>
    </div>
  );
}

/**
 * Record a repayment (SPEC §5 RepaymentModal): shows original / paid /
 * remaining, posts to /repayments, then reveals the new status.
 */
export default function RepaymentModal({ open, onClose, onSaved, item }) {
  const { currency } = useSettings();

  const [detail, setDetail] = useState(null);
  const [repayments, setRepayments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [amountError, setAmountError] = useState('');
  const [result, setResult] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [repDelete, setRepDelete] = useState(null);
  const [repDeleteBusy, setRepDeleteBusy] = useState(false);

  const itemId = item && item.id;

  useEffect(() => {
    if (!open || !itemId) return undefined;
    let cancelled = false;
    setLoading(true);
    setLoadError('');
    setResult(null);
    setAmount('');
    setDate(todayISO());
    setComment('');
    setAmountError('');

    api(`/borrow-lend/${itemId}`)
      .then((res) => {
        if (cancelled) return;
        const normalized = normalizeItem(res.item);
        setDetail(normalized);
        setRepayments((res.repayments || []).slice().reverse());
        setAmount(normalized.remaining > 0 ? String(normalized.remaining) : '');
      })
      .catch((err) => {
        if (!cancelled) setLoadError((err && err.message) || 'Could not load this record.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, itemId, reloadKey]);

  async function confirmDeleteRepayment() {
    if (!repDelete) return;
    setRepDeleteBusy(true);
    try {
      await api(`/repayments/${repDelete.id}`, { method: 'DELETE' });
      toastSuccess('Repayment removed and the record status recalculated.');
      setRepDelete(null);
      setReloadKey((k) => k + 1);
      if (onSaved) onSaved(null);
    } catch (err) {
      toastError((err && err.message) || 'Could not delete the repayment.');
    } finally {
      setRepDeleteBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    if (!detail) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setAmountError('Enter an amount greater than 0.');
      return;
    }
    if (value > detail.remaining + 0.001) {
      setAmountError(`Maximum you can pay is ${formatMoney(detail.remaining, currency)}.`);
      return;
    }

    setSaving(true);
    try {
      const res = await api('/repayments', {
        method: 'POST',
        body: { borrowLendId: detail.id, amount: value, date, comment: comment.trim() },
      });
      const updated = normalizeItem(res.item || { ...detail, paid: detail.paid + value });
      setDetail(updated);
      setResult(updated);
      setRepayments((prev) => [
        { id: res.repayment.id, amount: res.repayment.amount, date: res.repayment.date, comment: res.repayment.comment },
        ...prev,
      ]);
      toastSuccess(
        `${formatMoney(value, currency)} recorded — status: ${STATUS_LABELS[updated.status] || updated.status}`,
      );
      if (onSaved) onSaved(updated);
    } catch (err) {
      toastError((err && err.message) || 'Could not record the repayment.');
    } finally {
      setSaving(false);
    }
  }

  function resetForAnother() {
    setResult(null);
    setAmount(detail && detail.remaining > 0 ? String(detail.remaining) : '');
    setDate(todayISO());
    setComment('');
    setAmountError('');
  }

  const title =
    detail && detail.type === 'lend' ? 'Record Repayment (you get back)' : 'Record Repayment (you pay back)';

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={detail ? title : 'Record Repayment'}
      subtitle={detail ? `${detail.type === 'lend' ? 'From' : 'To'} ${detail.person}` : 'Loading record…'}
      footer={
        result ? (
          <>
            {detail && detail.remaining > 0 ? (
              <Button variant="secondary" onClick={resetForAnother}>
                Record another
              </Button>
            ) : null}
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button variant="primary" onClick={submit} loading={saving} disabled={!detail}>
              Record repayment
            </Button>
          </>
        )
      }
    >
      {loading ? (
        <div className="flex justify-center py-10">
          <Spinner className="h-8 w-8" label="Loading record" />
        </div>
      ) : loadError ? (
        <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-600">{loadError}</div>
      ) : !detail ? (
        <p className="py-6 text-center text-sm text-slate-400">Select a record first.</p>
      ) : result ? (
        <div className="space-y-4">
          <div className="rounded-xl bg-emerald-50 px-4 py-4 text-center ring-1 ring-emerald-100">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600">New status</p>
            <p className="mt-1 text-xl font-extrabold text-emerald-700">
              <StatusBadge status={result.status} />
            </p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <SummaryRow label="Original amount" value={formatMoney(result.amount, currency)} />
            <SummaryRow label="Paid so far" value={formatMoney(result.paid, currency)} />
            <SummaryRow label="Remaining" value={formatMoney(result.remaining, currency)} strong />
          </div>
          {result.status === 'completed' ? (
            <p className="text-center text-sm font-semibold text-emerald-600">
              🎉 All settled — this record is now completed.
            </p>
          ) : null}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                {detail.type === 'lend' ? 'Lend record' : 'Borrow record'}
              </span>
              <StatusBadge status={detail.status} />
            </div>
            <SummaryRow label="Original amount" value={formatMoney(detail.amount, currency)} />
            <SummaryRow label="Paid so far" value={formatMoney(detail.paid, currency)} />
            <SummaryRow label="Remaining" value={formatMoney(detail.remaining, currency)} strong />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Amount"
              required
              type="number"
              min="0.01"
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => {
                setAmount(e.target.value);
                setAmountError('');
              }}
              error={amountError || undefined}
              hint={`Max ${formatMoney(detail.remaining, currency)}`}
              className="col-span-2 sm:col-span-1"
            />
            <Input
              label="Date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="col-span-2 sm:col-span-1"
            />
          </div>

          <Input
            label="Comment (optional)"
            placeholder="e.g. Part payment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={200}
          />

          {repayments.length > 0 ? (
            <div>
              <p className="mb-1 text-xs font-semibold text-slate-600">Repayment history</p>
              <ul className="max-h-32 space-y-1 overflow-y-auto scroll-thin">
                {repayments.map((rep, index) => (
                  <li
                    key={rep.id != null ? rep.id : `rep-${index}`}
                    className="flex items-center justify-between rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200"
                  >
                    <span className="text-slate-500">
                      {rep.date}
                      {rep.comment ? ` · ${rep.comment}` : ''}
                    </span>
                    <span className="money font-bold text-slate-700">
                      {formatMoney(rep.amount, currency)}
                    </span>
                    <button
                      type="button"
                      aria-label="Delete this repayment"
                      onClick={() => setRepDelete(rep)}
                      className="rounded px-1 text-slate-300 transition hover:bg-rose-50 hover:text-rose-600"
                    >
                      🗑️
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
        </form>
      )}

      <ConfirmDialog
        open={Boolean(repDelete)}
        title="Delete repayment?"
        message={
          repDelete
            ? `${formatMoney(repDelete.amount, currency)} recorded on ${repDelete.date} will be removed and the record status recalculated.`
            : ''
        }
        confirmLabel="Delete"
        loading={repDeleteBusy}
        onCancel={() => setRepDelete(null)}
        onConfirm={confirmDeleteRepayment}
      />
    </Modal>
  );
}
