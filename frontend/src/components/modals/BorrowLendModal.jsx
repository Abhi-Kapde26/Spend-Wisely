import { useEffect, useState } from 'react';
import Modal from '../ui/Modal.jsx';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { formatMoney, todayISO } from '../../lib/format.js';
import { toastError, toastSuccess } from '../ui/toast.js';

/** Borrow | Lend form with tabs (SPEC §5 BorrowLendModal). */
export default function BorrowLendModal({ open, onClose, onSaved, item = null, initialType = 'borrow' }) {
  const { currency } = useSettings();
  const editing = Boolean(item && item.id);

  const [type, setType] = useState(initialType);
  const [person, setPerson] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState('');
  const [comment, setComment] = useState('');
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setSaving(false);
    if (item) {
      setType(item.type || initialType);
      setPerson(item.person || '');
      setAmount(item.amount != null ? String(item.amount) : '');
      setDate(item.date || todayISO());
      setDueDate(item.dueDate || '');
      setComment(item.comment || '');
    } else {
      setType(initialType);
      setPerson('');
      setAmount('');
      setDate(todayISO());
      setDueDate('');
      setComment('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function submit(event) {
    if (event) event.preventDefault();
    const value = Number(amount);
    const nextErrors = {};
    if (!person.trim()) nextErrors.person = 'Who is it with?';
    if (!Number.isFinite(value) || value <= 0) nextErrors.amount = 'Enter an amount greater than 0.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    setSaving(true);
    try {
      let saved;
      if (editing) {
        const body = { person: person.trim(), amount: value, comment: comment.trim() };
        if (dueDate) body.dueDate = dueDate; // omit when empty (optional field)
        const res = await api(`/borrow-lend/${item.id}`, { method: 'PUT', body });
        saved = res.item;
        toastSuccess('Borrow / lend record updated.');
      } else {
        const body = { type, person: person.trim(), amount: value, date, comment: comment.trim() };
        if (dueDate) body.dueDate = dueDate;
        const res = await api('/borrow-lend', { method: 'POST', body });
        saved = res.item;
        if (type === 'borrow') {
          toastSuccess(
            `${formatMoney(value, currency)} borrowed from ${person.trim()} — cash added to balance`,
          );
        } else {
          toastSuccess(`${formatMoney(value, currency)} lent to ${person.trim()} — cash deducted from balance`);
        }
      }
      if (onSaved) onSaved(saved);
      onClose();
    } catch (err) {
      toastError((err && err.message) || 'Could not save the record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={saving ? undefined : onClose}
      title={editing ? 'Edit Borrow / Lend' : 'Borrow or Lend Money'}
      subtitle="Borrowing adds cash to your balance, lending takes it out"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button variant="primary" onClick={submit} loading={saving}>
            {editing ? 'Save changes' : 'Save'}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
          {['borrow', 'lend'].map((t) => (
            <button
              key={t}
              type="button"
              disabled={editing}
              onClick={() => setType(t)}
              className={`rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-wide transition disabled:cursor-not-allowed ${
                type === t
                  ? t === 'borrow'
                    ? 'bg-white text-rose-600 shadow-sm'
                    : 'bg-white text-emerald-700 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'borrow' ? 'Borrow' : 'Lend'}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Person"
            required
            placeholder="e.g. Rahul"
            value={person}
            onChange={(e) => setPerson(e.target.value)}
            error={errors.person}
            className="col-span-2 sm:col-span-1"
          />
          <Input
            label="Amount"
            required
            type="number"
            min="0.01"
            step="0.01"
            inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            error={errors.amount}
            className="col-span-2 sm:col-span-1"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={editing}
            className="col-span-2 sm:col-span-1"
            hint={editing ? 'Date is fixed after creation' : undefined}
          />
          <Input
            label="Due date (optional)"
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="col-span-2 sm:col-span-1"
          />
        </div>

        <Input
          label="Comment (optional)"
          placeholder="e.g. Split dinner bill"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={200}
        />

        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </Modal>
  );
}
