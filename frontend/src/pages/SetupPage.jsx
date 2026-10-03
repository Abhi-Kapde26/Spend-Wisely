import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import { CURRENCY_OPTIONS, formatMoney } from '../lib/format.js';
import { toastSuccess, toastError } from '../components/ui/toast.js';

const STEPS = [
  { key: 'balance', title: 'Your current balance', emoji: '👋', fields: ['openingBalance'] },
  { key: 'pocket', title: 'Plan your month', emoji: '🗓️', fields: ['monthlyPocketMoney', 'monthlyBudget'] },
  { key: 'limit', title: 'Daily limit & currency', emoji: '🎯', fields: ['dailyLimit', 'currency'] },
];

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function SetupPage() {
  const navigate = useNavigate();
  const { settings, refresh } = useSettings();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(() => ({
    openingBalance: settings && settings.openingBalance != null ? String(settings.openingBalance) : '0',
    monthlyPocketMoney:
      settings && settings.monthlyPocketMoney != null ? String(settings.monthlyPocketMoney) : '0',
    dailyLimit: settings && settings.dailyLimit != null ? String(settings.dailyLimit) : '0',
    monthlyBudget: settings && settings.monthlyBudget != null ? String(settings.monthlyBudget) : '',
    currency: (settings && settings.currency) || 'INR',
  }));

  function update(field) {
    return (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
  }

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function validate() {
    for (const field of current.fields) {
      if (field === 'currency') continue;
      const raw = String(form[field] ?? '').trim();
      if (raw === '') {
        setError('Please fill in the highlighted field (0 is fine).');
        return false;
      }
      if (num(raw) < 0) {
        setError('Amounts cannot be negative.');
        return false;
      }
    }
    setError('');
    return true;
  }

  function next() {
    if (!validate()) return;
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function back() {
    setError('');
    setStep((s) => Math.max(s - 1, 0));
  }

  async function finish() {
    if (!validate()) return;
    setSaving(true);
    setError('');
    try {
      const body = {
        openingBalance: num(form.openingBalance),
        monthlyPocketMoney: num(form.monthlyPocketMoney),
        dailyLimit: num(form.dailyLimit),
        currency: form.currency,
      };
      if (String(form.monthlyBudget).trim() !== '') body.monthlyBudget = num(form.monthlyBudget);

      await api('/setup', { method: 'POST', body });
      await refresh();
      toastSuccess('All set — welcome to Spend Wisely! 🎉');
      navigate('/', { replace: true });
    } catch (err) {
      setError((err && err.message) || 'Could not save your setup.');
      toastError((err && err.message) || 'Could not save your setup.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-base font-bold text-white">
            ₹
          </span>
          <span className="text-lg font-extrabold text-slate-800">Spend Wisely</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
          {/* Step dots */}
          <div className="mb-5 flex items-center gap-2">
            {STEPS.map((s, index) => (
              <div
                key={s.key}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= step ? 'bg-emerald-500' : 'bg-slate-200'
                }`}
              />
            ))}
            <span className="text-xs font-semibold text-slate-400">
              {step + 1}/{STEPS.length}
            </span>
          </div>

          <h1 className="text-xl font-bold text-slate-800">
            {current.emoji} {current.title}
          </h1>
          <p className="mb-5 mt-1 text-sm text-slate-400">
            {step === 0
              ? 'How much cash do you have right now? This becomes your opening balance.'
              : step === 1
                ? 'How much do you get each month, and what would you like to stay under?'
                : 'Set a daily spending guardrail and your currency. You can change everything later.'}
          </p>

          {error ? (
            <div className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-100">
              {error}
            </div>
          ) : null}

          <div className="space-y-4">
            {step === 0 ? (
              <>
                <Input
                  label="Current balance"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.openingBalance}
                  onChange={update('openingBalance')}
                  hint={formatMoney(num(form.openingBalance), form.currency)}
                />
                <p className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-700 ring-1 ring-emerald-100">
                  Tip: your balance is always computed from raw records — money you borrow adds to it,
                  money you lend takes from it.
                </p>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <Input
                  label="Monthly pocket money"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.monthlyPocketMoney}
                  onChange={update('monthlyPocketMoney')}
                  hint={formatMoney(num(form.monthlyPocketMoney), form.currency)}
                />
                <Input
                  label="Monthly budget (optional)"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Leave blank for no budget"
                  value={form.monthlyBudget}
                  onChange={update('monthlyBudget')}
                  hint={
                    String(form.monthlyBudget).trim() === ''
                      ? 'You can add this later in Settings → Budget'
                      : formatMoney(num(form.monthlyBudget), form.currency)
                  }
                />
              </>
            ) : null}

            {step === 2 ? (
              <>
                <Input
                  label="Daily spending limit"
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  value={form.dailyLimit}
                  onChange={update('dailyLimit')}
                  hint={`0 = no limit set · ${formatMoney(num(form.dailyLimit), form.currency)} / day`}
                />
                <Select label="Currency" required value={form.currency} onChange={update('currency')}>
                  {CURRENCY_OPTIONS.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </>
            ) : null}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <Button variant="ghost" onClick={back} disabled={step === 0 || saving}>
              ← Back
            </Button>
            {isLast ? (
              <Button onClick={finish} loading={saving}>
                Finish setup →
              </Button>
            ) : (
              <Button onClick={next}>Continue →</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
