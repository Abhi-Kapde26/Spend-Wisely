import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, download } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { CURRENCY_OPTIONS, formatDate, todayISO } from '../lib/format.js';

import ImportPanel from '../components/settings/ImportPanel.jsx';
import Card from '../components/ui/Card.jsx';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import { toastError, toastSuccess, toastWarning, toastApiError } from '../components/ui/toast.js';

/* ---------- small building blocks ---------- */

function Section({ icon, title, subtitle, open, onToggle, children }) {
  return (
    <Card>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-3">
          <span className="text-lg" aria-hidden="true">
            {icon}
          </span>
          <span>
            <span className="block text-sm font-bold text-slate-800">{title}</span>
            <span className="block text-xs text-slate-400">{subtitle}</span>
          </span>
        </span>
        <span
          className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>
      {open ? <div className="border-t border-slate-100 px-5 py-4">{children}</div> : null}
    </Card>
  );
}

function Toggle({ checked, onChange, label, hint, busy = false }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        {hint ? <p className="text-xs text-slate-400">{hint}</p> : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={Boolean(checked)}
        aria-label={label}
        disabled={busy}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
          checked ? 'bg-emerald-500' : 'bg-slate-300'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function FormActions({ children }) {
  return <div className="mt-4 flex justify-end gap-2">{children}</div>;
}

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'both', label: 'Both' },
];

const FREQUENCIES = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'yearly', label: 'Yearly' },
];

/* ---------- page ---------- */

export default function SettingsPage() {
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, settings, refresh, saveSettings } = useSettings();

  const [openSec, setOpenSec] = useState({ profile: true });
  const toggleSection = (key) => setOpenSec((s) => ({ ...s, [key]: !s[key] }));

  /* profile */
  const [profile, setProfile] = useState(() => ({
    name: (user && user.name) || '',
    avatarUrl: (user && user.avatarUrl) || '',
  }));
  const [profileBusy, setProfileBusy] = useState(false);

  /* budget */
  const [budgetForm, setBudgetForm] = useState(() => ({
    dailyLimit: String((settings && settings.dailyLimit) || 0),
    monthlyBudget: String((settings && settings.monthlyBudget) || 0),
    monthlyPocketMoney: String((settings && settings.monthlyPocketMoney) || 0),
    currency: (settings && settings.currency) || 'INR',
  }));
  const [budgetBusy, setBudgetBusy] = useState(false);
  const [overrides, setOverrides] = useState([]);
  const [overrideForm, setOverrideForm] = useState({ date: todayISO(), limit: '' });
  const [overrideTarget, setOverrideTarget] = useState(null);

  /* categories */
  const [cats, setCats] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catForm, setCatForm] = useState({ name: '', icon: '📦', color: '#64748b', type: 'expense' });
  const [catEditId, setCatEditId] = useState(null);
  const [catBusy, setCatBusy] = useState(false);
  const [forceTarget, setForceTarget] = useState(null);
  const [forceBusy, setForceBusy] = useState(false);

  /* notifications */
  const [notify, setNotify] = useState(() => ({
    notifyNearLimit: Boolean(Number((settings && settings.notifyNearLimit) ?? 1)),
    notifyDailyReminder: Boolean(Number((settings && settings.notifyDailyReminder) ?? 1)),
    notifyBorrowReminder: Boolean(Number((settings && settings.notifyBorrowReminder) ?? 1)),
  }));
  const [notifyBusy, setNotifyBusy] = useState(false);

  /* data / google sheets */
  const [sheets, setSheets] = useState(null);
  const [sheetUrl, setSheetUrl] = useState('');
  const [sheetBusy, setSheetBusy] = useState('');
  const [exportRange, setExportRange] = useState(() => ({
    from: `${new Date().getFullYear()}-01-01`,
    to: todayISO(),
  }));
  const [exporting, setExporting] = useState('');

  /* security */
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwBusy, setPwBusy] = useState(false);
  const [pwError, setPwError] = useState('');

  /* recurring */
  const [recurring, setRecurring] = useState([]);
  const [recLoading, setRecLoading] = useState(true);
  const [recForm, setRecForm] = useState({
    name: '',
    amount: '',
    categoryId: '',
    frequency: 'monthly',
    startDate: todayISO(),
  });
  const [recEditId, setRecEditId] = useState(null);
  const [recBusy, setRecBusy] = useState(false);
  const [recDeleteTarget, setRecDeleteTarget] = useState(null);
  const [recDeleteBusy, setRecDeleteBusy] = useState(false);

  /* ---------- loaders ---------- */
  const loadCats = useCallback(async () => {
    setCatsLoading(true);
    try {
      const res = await api('/categories');
      setCats((res && res.items) || []);
    } catch (err) {
      toastApiError(err, 'Could not load categories.');
    } finally {
      setCatsLoading(false);
    }
  }, []);

  const loadOverrides = useCallback(async () => {
    try {
      const res = await api('/budgets');
      setOverrides((res && res.dailyOverrides) || []);
    } catch {
      /* non-fatal */
    }
  }, []);

  const loadSheets = useCallback(async () => {
    try {
      const res = await api('/google-sheets/status');
      setSheets(res || { connected: false });
    } catch {
      setSheets({ connected: false });
    }
  }, []);

  const loadRecurring = useCallback(async () => {
    setRecLoading(true);
    try {
      const res = await api('/recurring');
      setRecurring((res && res.items) || []);
    } catch (err) {
      toastApiError(err, 'Could not load recurring expenses.');
    } finally {
      setRecLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCats();
    loadOverrides();
    loadSheets();
    loadRecurring();
  }, [loadCats, loadOverrides, loadSheets, loadRecurring]);

  /* ---------- handlers ---------- */

  async function saveProfile(event) {
    event.preventDefault();
    setProfileBusy(true);
    try {
      await saveSettings({ name: profile.name.trim(), avatarUrl: profile.avatarUrl.trim() });
      await refresh();
      toastSuccess('Profile updated.');
    } catch (err) {
      toastApiError(err, 'Could not update your profile.');
    } finally {
      setProfileBusy(false);
    }
  }

  async function saveBudget(event) {
    event.preventDefault();
    setBudgetBusy(true);
    try {
      await api('/budgets', {
        method: 'PUT',
        body: {
          dailyLimit: Number(budgetForm.dailyLimit) || 0,
          monthlyBudget: Number(budgetForm.monthlyBudget) || 0,
          monthlyPocketMoney: Number(budgetForm.monthlyPocketMoney) || 0,
        },
      });
      await saveSettings({ currency: budgetForm.currency });
      await refresh();
      toastSuccess('Budget settings saved.');
    } catch (err) {
      toastApiError(err, 'Could not save budget settings.');
    } finally {
      setBudgetBusy(false);
    }
  }

  async function addOverride(event) {
    event.preventDefault();
    const limit = Number(overrideForm.limit);
    if (!overrideForm.date || !Number.isFinite(limit) || limit <= 0) {
      toastError('Pick a date and a limit greater than 0.');
      return;
    }
    try {
      await api('/budgets/daily', { method: 'POST', body: { date: overrideForm.date, limit } });
      toastSuccess(`Daily limit set for ${overrideForm.date}.`);
      setOverrideForm({ date: todayISO(), limit: '' });
      await loadOverrides();
    } catch (err) {
      toastApiError(err, 'Could not save the daily limit.');
    }
  }

  async function confirmDeleteOverride() {
    if (!overrideTarget) return;
    try {
      await api(`/budgets/daily/${overrideTarget.date}`, { method: 'DELETE' });
      toastSuccess('Daily limit override removed.');
      setOverrideTarget(null);
      await loadOverrides();
    } catch (err) {
      toastApiError(err, 'Could not remove the override.');
    }
  }

  async function submitCategory(event) {
    event.preventDefault();
    const name = catForm.name.trim();
    if (!name) {
      toastError('Category name is required.');
      return;
    }
    setCatBusy(true);
    try {
      const body = { name, icon: catForm.icon || '📦', color: catForm.color, type: catForm.type };
      if (catEditId) {
        await api(`/categories/${catEditId}`, { method: 'PUT', body });
        toastSuccess('Category updated.');
      } else {
        await api('/categories', { method: 'POST', body });
        toastSuccess('Category added.');
      }
      setCatEditId(null);
      setCatForm({ name: '', icon: '📦', color: '#64748b', type: 'expense' });
      await loadCats();
    } catch (err) {
      toastApiError(err, 'Could not save the category.');
    } finally {
      setCatBusy(false);
    }
  }

  async function deleteCategory(cat) {
    try {
      await api(`/categories/${cat.id}`, { method: 'DELETE' });
      toastSuccess(`"${cat.name}" deleted.`);
      await loadCats();
    } catch (err) {
      if (err && err.status === 409) {
        setForceTarget(cat);
      } else {
        toastApiError(err, 'Could not delete the category.');
      }
    }
  }

  async function forceDeleteCategory() {
    if (!forceTarget) return;
    setForceBusy(true);
    try {
      await api(`/categories/${forceTarget.id}`, { method: 'DELETE', params: { force: 1 } });
      toastSuccess(`"${forceTarget.name}" deleted — transactions were unlinked.`);
      setForceTarget(null);
      await loadCats();
    } catch (err) {
      toastApiError(err, 'Could not delete the category.');
    } finally {
      setForceBusy(false);
    }
  }

  async function updateNotify(key, value) {
    setNotifyBusy(true);
    setNotify((n) => ({ ...n, [key]: value }));
    try {
      await saveSettings({ [key]: value });
      toastSuccess('Notification preference saved.');
    } catch (err) {
      setNotify((n) => ({ ...n, [key]: !value }));
      toastApiError(err, 'Could not save that preference.');
    } finally {
      setNotifyBusy(false);
    }
  }

  async function connectSheet(event) {
    event.preventDefault();
    setSheetBusy('connect');
    try {
      const res = await api('/google-sheets/connect', { method: 'POST', body: { sheetUrl: sheetUrl.trim() } });
      if (res && res.warning) toastWarning(res.warning);
      else toastSuccess('Google Sheet connected.');
      setSheetUrl('');
      await loadSheets();
    } catch (err) {
      toastApiError(err, 'Could not connect the sheet.');
    } finally {
      setSheetBusy('');
    }
  }

  async function syncSheet() {
    setSheetBusy('sync');
    try {
      const res = await api('/google-sheets/sync', { method: 'POST' });
      const tx = (res && res.counts && res.counts.transactions) ?? 0;
      const bl = (res && res.counts && res.counts.borrowLend) ?? 0;
      toastSuccess(`Sheet synced successfully (${tx} transaction${tx === 1 ? '' : 's'}, ${bl} borrow/lend).`);
      await loadSheets();
    } catch (err) {
      toastApiError(err, 'Sync failed.');
    } finally {
      setSheetBusy('');
    }
  }

  async function disconnectSheet() {
    setSheetBusy('disconnect');
    try {
      await api('/google-sheets/disconnect', { method: 'DELETE' });
      toastSuccess('Google Sheet disconnected.');
      await loadSheets();
    } catch (err) {
      toastApiError(err, 'Could not disconnect.');
    } finally {
      setSheetBusy('');
    }
  }

  async function runExport(kind) {
    setExporting(kind);
    try {
      await download(`/export/${kind}`, {
        params: { from: exportRange.from, to: exportRange.to },
        filename: `spend-wisely-${exportRange.from}_${exportRange.to}.${kind === 'excel' ? 'xlsx' : kind}`,
      });
      toastSuccess(`${kind === 'excel' ? 'Excel' : kind.toUpperCase()} export downloaded.`);
    } catch (err) {
      toastApiError(err, 'Export failed.');
    } finally {
      setExporting('');
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setPwError('');
    if (pw.next.length < 6) {
      setPwError('New password must be at least 6 characters.');
      return;
    }
    if (pw.next !== pw.confirm) {
      setPwError('New passwords do not match.');
      return;
    }
    setPwBusy(true);
    try {
      await api('/settings/password', {
        method: 'PUT',
        body: { currentPassword: pw.current, newPassword: pw.next },
      });
      toastSuccess('Password changed.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      setPwError((err && err.message) || 'Could not change the password.');
      toastApiError(err, 'Could not change the password.');
    } finally {
      setPwBusy(false);
    }
  }

  async function submitRecurring(event) {
    event.preventDefault();
    const amount = Number(recForm.amount);
    if (!recForm.name.trim()) {
      toastError('Name the recurring expense.');
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      toastError('Amount must be greater than 0.');
      return;
    }
    setRecBusy(true);
    try {
      const body = {
        name: recForm.name.trim(),
        amount,
        frequency: recForm.frequency,
      };
      if (recForm.categoryId) body.categoryId = Number(recForm.categoryId);
      if (recEditId) {
        await api(`/recurring/${recEditId}`, { method: 'PUT', body });
        toastSuccess('Recurring expense updated.');
      } else {
        body.startDate = recForm.startDate || todayISO();
        await api('/recurring', { method: 'POST', body });
        toastSuccess('Recurring expense added.');
      }
      setRecEditId(null);
      setRecForm({ name: '', amount: '', categoryId: '', frequency: 'monthly', startDate: todayISO() });
      await loadRecurring();
    } catch (err) {
      toastApiError(err, 'Could not save the recurring expense.');
    } finally {
      setRecBusy(false);
    }
  }

  async function toggleRecurringActive(item) {
    const active = item.active === 1 || item.active === true ? 0 : 1;
    try {
      await api(`/recurring/${item.id}`, { method: 'PUT', body: { active } });
      await loadRecurring();
    } catch (err) {
      toastApiError(err, 'Could not update the recurring expense.');
    }
  }

  async function confirmDeleteRecurring() {
    if (!recDeleteTarget) return;
    setRecDeleteBusy(true);
    try {
      await api(`/recurring/${recDeleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Recurring expense deleted.');
      setRecDeleteTarget(null);
      await loadRecurring();
    } catch (err) {
      toastApiError(err, 'Could not delete the recurring expense.');
    } finally {
      setRecDeleteBusy(false);
    }
  }

  async function processRecurring() {
    setRecBusy('process');
    try {
      const res = await api('/recurring/process', { method: 'POST' });
      const count = (res && res.created && res.created.length) || 0;
      toastSuccess(count > 0 ? `${count} recurring expense${count === 1 ? '' : 's'} recorded.` : 'Nothing due right now.');
      await loadRecurring();
    } catch (err) {
      toastApiError(err, 'Could not process recurring expenses.');
    } finally {
      setRecBusy(false);
    }
  }

  const expenseCats = cats.filter((c) => c.type === 'expense' || c.type === 'both');

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight text-slate-800">Settings</h1>
        <p className="text-sm text-slate-400">Everything about your account, budgets and data.</p>
      </div>

      {/* 👤 Profile */}
      <Section
        icon="👤"
        title="Profile"
        subtitle="Name, avatar and email"
        open={Boolean(openSec.profile)}
        onToggle={() => toggleSection('profile')}
      >
        <form onSubmit={saveProfile} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            required
            value={profile.name}
            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
          />
          <Input
            label="Avatar URL"
            type="url"
            placeholder="https://…"
            value={profile.avatarUrl}
            onChange={(e) => setProfile((p) => ({ ...p, avatarUrl: e.target.value }))}
          />
          <Input label="Email (read-only)" value={(user && user.email) || ''} readOnly className="sm:col-span-2" />
          <div className="sm:col-span-2">
            <FormActions>
              <Button type="submit" loading={profileBusy}>
                Save profile
              </Button>
            </FormActions>
          </div>
        </form>
      </Section>

      {/* 💰 Budget */}
      <Section
        icon="💰"
        title="Budget"
        subtitle="Daily limit, monthly budget, pocket money and currency"
        open={Boolean(openSec.budget)}
        onToggle={() => toggleSection('budget')}
      >
        <form onSubmit={saveBudget} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label="Daily limit"
            type="number"
            min="0"
            step="0.01"
            value={budgetForm.dailyLimit}
            onChange={(e) => setBudgetForm((f) => ({ ...f, dailyLimit: e.target.value }))}
            hint="0 = no daily limit"
          />
          <Input
            label="Monthly budget"
            type="number"
            min="0"
            step="0.01"
            value={budgetForm.monthlyBudget}
            onChange={(e) => setBudgetForm((f) => ({ ...f, monthlyBudget: e.target.value }))}
            hint="0 = no monthly budget"
          />
          <Input
            label="Monthly pocket money"
            type="number"
            min="0"
            step="0.01"
            value={budgetForm.monthlyPocketMoney}
            onChange={(e) => setBudgetForm((f) => ({ ...f, monthlyPocketMoney: e.target.value }))}
          />
          <Select
            label="Currency"
            value={budgetForm.currency}
            onChange={(e) => setBudgetForm((f) => ({ ...f, currency: e.target.value }))}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </Select>
          <div className="sm:col-span-2">
            <FormActions>
              <Button type="submit" loading={budgetBusy}>
                Save budget
              </Button>
            </FormActions>
          </div>
        </form>

        <div className="mt-5 border-t border-slate-100 pt-4">
          <p className="text-sm font-bold text-slate-700">One-off daily limits</p>
          <p className="mb-3 text-xs text-slate-400">
            Override the daily limit for a specific date (e.g. a wedding day).
          </p>
          <form onSubmit={addOverride} className="flex flex-wrap items-end gap-3">
            <Input
              label="Date"
              type="date"
              value={overrideForm.date}
              onChange={(e) => setOverrideForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Input
              label="Limit"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="500"
              value={overrideForm.limit}
              onChange={(e) => setOverrideForm((f) => ({ ...f, limit: e.target.value }))}
            />
            <Button type="submit" size="md">
              Add override
            </Button>
          </form>

          {overrides.length > 0 ? (
            <ul className="mt-3 space-y-1.5">
              {overrides.map((ov) => (
                <li
                  key={ov.date}
                  className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                >
                  <span className="text-sm text-slate-600">{formatDate(ov.date)}</span>
                  <span className="flex items-center gap-3">
                    <span className="money text-sm font-bold text-slate-800">{Number(ov.limit).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => setOverrideTarget(ov)}
                      aria-label={`Remove override for ${ov.date}`}
                      className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      🗑️
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-slate-400">No overrides yet.</p>
          )}
        </div>
      </Section>

      {/* 🏷 Categories */}
      <Section
        icon="🏷️"
        title="Categories"
        subtitle="Add, edit or remove the labels you spend under"
        open={Boolean(openSec.categories)}
        onToggle={() => toggleSection('categories')}
      >
        <form onSubmit={submitCategory} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Input
            label="Name"
            required
            placeholder="e.g. Pets"
            value={catForm.name}
            onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
            className="col-span-2"
          />
          <Input
            label="Icon"
            maxLength={4}
            value={catForm.icon}
            onChange={(e) => setCatForm((f) => ({ ...f, icon: e.target.value }))}
          />
          <Input
            label="Colour"
            type="color"
            className="[&_input]:h-9"
            value={catForm.color}
            onChange={(e) => setCatForm((f) => ({ ...f, color: e.target.value }))}
          />
          <Select
            label="Type"
            value={catForm.type}
            onChange={(e) => setCatForm((f) => ({ ...f, type: e.target.value }))}
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-5">
            {catEditId ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setCatEditId(null);
                  setCatForm({ name: '', icon: '📦', color: '#64748b', type: 'expense' });
                }}
              >
                Cancel edit
              </Button>
            ) : null}
            <Button type="submit" loading={catBusy}>
              {catEditId ? 'Update category' : 'Add category'}
            </Button>
          </div>
        </form>

        <div className="mt-4">
          {catsLoading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading categories" />
            </div>
          ) : cats.length === 0 ? (
            <EmptyState icon="🏷️" title="No categories yet" />
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {cats.map((cat) => (
                <li
                  key={cat.id}
                  className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2 ring-1 ring-slate-100"
                >
                  <span
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-base"
                    style={{ backgroundColor: `${cat.color || '#64748b'}22` }}
                    aria-hidden="true"
                  >
                    {cat.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-slate-700">{cat.name}</span>
                    <span className="block text-[11px] uppercase text-slate-400">{cat.type}</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Edit ${cat.name}`}
                    onClick={() => {
                      setCatEditId(cat.id);
                      setCatForm({
                        name: cat.name,
                        icon: cat.icon || '📦',
                        color: cat.color || '#64748b',
                        type: cat.type,
                      });
                    }}
                    className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                  >
                    ✏️
                  </button>
                  <button
                    type="button"
                    aria-label={`Delete ${cat.name}`}
                    onClick={() => deleteCategory(cat)}
                    className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                  >
                    🗑️
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Section>

      {/* 🔔 Notifications */}
      <Section
        icon="🔔"
        title="Notifications"
        subtitle="Choose which nudges you receive"
        open={Boolean(openSec.notifications)}
        onToggle={() => toggleSection('notifications')}
      >
        <div className="divide-y divide-slate-100">
          <Toggle
            label="Near daily limit"
            hint="Warn me when I cross 75% / 90% / 100% of today's limit"
            checked={notify.notifyNearLimit}
            busy={notifyBusy}
            onChange={(v) => updateNotify('notifyNearLimit', v)}
          />
          <Toggle
            label="Daily reminder"
            hint="A gentle daily reminder to log spending"
            checked={notify.notifyDailyReminder}
            busy={notifyBusy}
            onChange={(v) => updateNotify('notifyDailyReminder', v)}
          />
          <Toggle
            label="Borrow / lend reminders"
            hint="Nudge me before a repayment due date"
            checked={notify.notifyBorrowReminder}
            busy={notifyBusy}
            onChange={(v) => updateNotify('notifyBorrowReminder', v)}
          />
        </div>
      </Section>

      {/* 📊 Data */}
      <Section
        icon="📊"
        title="Data"
        subtitle="Google Sheets sync, imports and file exports"
        open={Boolean(openSec.data)}
        onToggle={() => toggleSection('data')}
      >
        <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${
                  sheets && sheets.connected ? 'bg-emerald-500' : 'bg-slate-300'
                }`}
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-bold text-slate-700">Google Sheets</p>
                <p className="text-xs text-slate-400">
                  {!sheets
                    ? 'Checking status…'
                    : sheets.connected
                      ? `Connected${sheets.status === 'demo' ? ' (demo mode)' : ''}${
                          sheets.lastSyncedAt ? ` · last synced ${formatDate(String(sheets.lastSyncedAt).slice(0, 10))}` : ' · never synced'
                        }`
                      : 'Not connected — SQLite stays the source of truth.'}
                </p>
              </div>
            </div>
            {sheets && sheets.connected ? (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={syncSheet}
                  loading={sheetBusy === 'sync'}
                  disabled={Boolean(sheetBusy)}
                >
                  Sync now
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={disconnectSheet}
                  loading={sheetBusy === 'disconnect'}
                  disabled={Boolean(sheetBusy)}
                >
                  Disconnect
                </Button>
              </div>
            ) : null}
          </div>

          {sheets && sheets.connected && sheets.sheetUrl ? (
            <div className="mt-3 space-y-1 rounded-lg bg-emerald-50/60 p-3 ring-1 ring-emerald-100">
              <p className="text-xs">
                <a
                  href={sheets.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-bold text-emerald-700 hover:underline"
                >
                  <span>Open your sheet</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </p>
              <p className="text-xs text-slate-600">
                Data is mirrored across your sheet tabs: <strong className="font-semibold text-slate-800">Transactions</strong>, <strong className="font-semibold text-slate-800">Borrow-Lend</strong>, and <strong className="font-semibold text-slate-800">Monthly Summary</strong> (and <strong className="font-semibold text-slate-800">Sheet1</strong>). Click the tabs at the bottom of Google Sheets to view each.
              </p>
            </div>
          ) : null}

          {!sheets || !sheets.connected ? (
            <form onSubmit={connectSheet} className="mt-3 flex flex-wrap items-end gap-3">
              <Input
                label="Spreadsheet URL"
                type="url"
                required
                placeholder="https://docs.google.com/spreadsheets/d/…"
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                className="min-w-[18rem] flex-1"
              />
              <Button type="submit" size="md" loading={sheetBusy === 'connect'} disabled={Boolean(sheetBusy)}>
                Connect
              </Button>
            </form>
          ) : null}
        </div>

        <ImportPanel />

        <div className="mt-5">
          <p className="text-sm font-bold text-slate-700">Export everything</p>
          <p className="mb-3 text-xs text-slate-400">CSV, Excel and PDF of every record in the date range.</p>
          <div className="flex flex-wrap items-end gap-3">
            <Input
              label="From"
              type="date"
              value={exportRange.from}
              onChange={(e) => setExportRange((r) => ({ ...r, from: e.target.value }))}
            />
            <Input
              label="To"
              type="date"
              value={exportRange.to}
              onChange={(e) => setExportRange((r) => ({ ...r, to: e.target.value }))}
            />
            <div className="flex gap-2">
              <Button size="md" variant="secondary" loading={exporting === 'csv'} onClick={() => runExport('csv')}>
                Export CSV
              </Button>
              <Button size="md" variant="secondary" loading={exporting === 'excel'} onClick={() => runExport('excel')}>
                Export Excel
              </Button>
              <Button size="md" variant="secondary" loading={exporting === 'pdf'} onClick={() => runExport('pdf')}>
                Export PDF
              </Button>
            </div>
          </div>
        </div>
      </Section>

      {/* 🔐 Security */}
      <Section
        icon="🔐"
        title="Security"
        subtitle="Change password or log out"
        open={Boolean(openSec.security)}
        onToggle={() => toggleSection('security')}
      >
        <form onSubmit={changePassword} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Input
            label="Current password"
            type="password"
            required
            autoComplete="current-password"
            value={pw.current}
            onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
          />
          <Input
            label="New password"
            type="password"
            required
            autoComplete="new-password"
            value={pw.next}
            onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
            error={pwError || undefined}
          />
          <Input
            label="Confirm new password"
            type="password"
            required
            autoComplete="new-password"
            value={pw.confirm}
            onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
          />
          <div className="sm:col-span-3">
            <FormActions>
              <Button
                type="button"
                variant="danger"
                onClick={() => {
                  logout();
                  navigate('/login', { replace: true });
                }}
              >
                Log out
              </Button>
              <Button type="submit" loading={pwBusy}>
                Change password
              </Button>
            </FormActions>
          </div>
        </form>
      </Section>

      {/* ➕ Recurring expenses */}
      <Section
        icon="➕"
        title="Recurring expenses"
        subtitle="Subscriptions and bills that repeat"
        open={Boolean(openSec.recurring)}
        onToggle={() => toggleSection('recurring')}
      >
        <form onSubmit={submitRecurring} className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Input
            label="Name"
            required
            placeholder="e.g. Netflix"
            value={recForm.name}
            onChange={(e) => setRecForm((f) => ({ ...f, name: e.target.value }))}
            className="col-span-2"
          />
          <Input
            label="Amount"
            type="number"
            min="0.01"
            step="0.01"
            required
            value={recForm.amount}
            onChange={(e) => setRecForm((f) => ({ ...f, amount: e.target.value }))}
          />
          <Select
            label="Frequency"
            value={recForm.frequency}
            onChange={(e) => setRecForm((f) => ({ ...f, frequency: e.target.value }))}
          >
            {FREQUENCIES.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
          <Select
            label="Category"
            value={recForm.categoryId}
            onChange={(e) => setRecForm((f) => ({ ...f, categoryId: e.target.value }))}
          >
            <option value="">Uncategorised</option>
            {expenseCats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.icon} {c.name}
              </option>
            ))}
          </Select>
          {!recEditId ? (
            <Input
              label="First due date"
              type="date"
              value={recForm.startDate}
              onChange={(e) => setRecForm((f) => ({ ...f, startDate: e.target.value }))}
              className="col-span-2 sm:col-span-2"
            />
          ) : null}
          <div className="col-span-2 flex justify-end gap-2 sm:col-span-5">
            <Button variant="secondary" loading={recBusy === 'process'} onClick={processRecurring}>
              Process due now
            </Button>
            {recEditId ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setRecEditId(null);
                  setRecForm({ name: '', amount: '', categoryId: '', frequency: 'monthly', startDate: todayISO() });
                }}
              >
                Cancel edit
              </Button>
            ) : null}
            <Button type="submit" loading={recBusy === true}>
              {recEditId ? 'Update' : 'Add recurring'}
            </Button>
          </div>
        </form>

        <div className="mt-4">
          {recLoading ? (
            <div className="flex justify-center py-6">
              <Spinner label="Loading recurring expenses" />
            </div>
          ) : recurring.length === 0 ? (
            <EmptyState icon="🔁" title="No recurring expenses" subtitle="Add subscriptions so they're never forgotten." />
          ) : (
            <ul className="space-y-2">
              {recurring.map((item) => {
                const active = item.active === 1 || item.active === true;
                return (
                  <li
                    key={item.id}
                    className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5 ring-1 ring-slate-100"
                  >
                    <span
                      className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${
                        active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'
                      }`}
                    >
                      {active ? 'Active' : 'Paused'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-slate-700">{item.name}</span>
                      <span className="block text-[11px] text-slate-400">
                        {(FREQUENCIES.find((f) => f.value === item.frequency) || {}).label || item.frequency} ·
                        next due {item.nextDueDate ? formatDate(item.nextDueDate) : '—'}
                      </span>
                    </span>
                    <span className="money text-sm font-bold text-slate-700">{Number(item.amount).toFixed(2)}</span>
                    <button
                      type="button"
                      onClick={() => toggleRecurringActive(item)}
                      className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-200"
                    >
                      {active ? 'Pause' : 'Resume'}
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => {
                        setRecEditId(item.id);
                        setRecForm((f) => ({
                          ...f,
                          name: item.name,
                          amount: String(item.amount),
                          categoryId: item.categoryId != null ? String(item.categoryId) : '',
                          frequency: item.frequency,
                        }));
                      }}
                      className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                    >
                      ✏️
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() => setRecDeleteTarget(item)}
                      className="rounded-lg px-1.5 py-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      🗑️
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Section>

      {/* Confirm dialogs */}
      <ConfirmDialog
        open={Boolean(forceTarget)}
        title="Category is in use"
        message={
          forceTarget
            ? `Transactions are tagged with "${forceTarget.name}". Delete it anyway? Those transactions will become uncategorised.`
            : ''
        }
        confirmLabel="Delete anyway"
        loading={forceBusy}
        onCancel={() => setForceTarget(null)}
        onConfirm={forceDeleteCategory}
      />
      <ConfirmDialog
        open={Boolean(overrideTarget)}
        title="Remove daily override?"
        message={overrideTarget ? `The special limit for ${formatDate(overrideTarget.date)} will be removed.` : ''}
        confirmLabel="Remove"
        onCancel={() => setOverrideTarget(null)}
        onConfirm={confirmDeleteOverride}
      />
      <ConfirmDialog
        open={Boolean(recDeleteTarget)}
        title="Delete recurring expense?"
        message={recDeleteTarget ? `"${recDeleteTarget.name}" will stop being recorded automatically.` : ''}
        confirmLabel="Delete"
        loading={recDeleteBusy}
        onCancel={() => setRecDeleteTarget(null)}
        onConfirm={confirmDeleteRecurring}
      />
    </div>
  );
}
