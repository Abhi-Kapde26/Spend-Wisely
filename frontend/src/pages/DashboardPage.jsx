import { useCallback, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import { formatDateLong, formatMoney, todayISO } from '../lib/format.js';

import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import ConfirmDialog from '../components/ui/ConfirmDialog.jsx';
import { FullPageSpinner } from '../components/ui/Spinner.jsx';
import { toastError, toastSuccess } from '../components/ui/toast.js';

import BalanceCard from '../components/dashboard/BalanceCard.jsx';
import DailyBudgetCard from '../components/dashboard/DailyBudgetCard.jsx';
import QuickActions from '../components/dashboard/QuickActions.jsx';
import TodayTransactionList from '../components/dashboard/TodayTransactionList.jsx';
import BorrowLendSummary from '../components/dashboard/BorrowLendSummary.jsx';
import UpcomingDues from '../components/dashboard/UpcomingDues.jsx';
import MonthProgressCard from '../components/dashboard/MonthProgressCard.jsx';

import AddExpenseModal from '../components/modals/AddExpenseModal.jsx';
import AddMoneyModal from '../components/modals/AddMoneyModal.jsx';
import BorrowLendModal from '../components/modals/BorrowLendModal.jsx';
import RepaymentModal from '../components/modals/RepaymentModal.jsx';

export default function DashboardPage() {
  const { user, settings, refresh } = useSettings();
  const currency = (settings && settings.currency) || 'INR';

  const [data, setData] = useState(null);
  const [bl, setBl] = useState({ items: [], totals: {} });
  const [loading, setLoading] = useState(true);
  const [blLoading, setBlLoading] = useState(true);
  const [error, setError] = useState('');

  const [expenseOpen, setExpenseOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [editingTx, setEditingTx] = useState(null);
  const [blOpen, setBlOpen] = useState(false);
  const [blType, setBlType] = useState('borrow');
  const [blItem, setBlItem] = useState(null);
  const [blDeleteTarget, setBlDeleteTarget] = useState(null);
  const [blDeleting, setBlDeleting] = useState(false);
  const [repayOpen, setRepayOpen] = useState(false);
  const [repayItem, setRepayItem] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      const res = await api('/dashboard');
      setData(res);
      setError('');
    } catch (err) {
      setError((err && err.message) || 'Could not load your dashboard.');
    }
  }, []);

  const loadBorrowLend = useCallback(async () => {
    try {
      const res = await api('/borrow-lend');
      setBl({ items: (res && res.items) || [], totals: (res && res.totals) || {} });
    } catch {
      /* borrow/lend panel is secondary — keep whatever we had */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setBlLoading(true);
    Promise.all([loadDashboard(), loadBorrowLend()]).finally(() => {
      if (!cancelled) {
        setLoading(false);
        setBlLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [loadDashboard, loadBorrowLend]);

  /** Refresh dashboard data after every mutation (SPEC §5). */
  const mutated = useCallback(() => {
    loadDashboard();
    loadBorrowLend();
  }, [loadDashboard, loadBorrowLend]);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/transactions/${deleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Transaction deleted.');
      setDeleteTarget(null);
      mutated();
    } catch (err) {
      toastError((err && err.message) || 'Could not delete the transaction.');
    } finally {
      setDeleting(false);
    }
  }

  async function confirmDeleteBorrowLend() {
    if (!blDeleteTarget) return;
    setBlDeleting(true);
    try {
      await api(`/borrow-lend/${blDeleteTarget.id}`, { method: 'DELETE' });
      toastSuccess('Record deleted — repayments were removed too.');
      setBlDeleteTarget(null);
      mutated();
    } catch (err) {
      toastError((err && err.message) || 'Could not delete the record.');
    } finally {
      setBlDeleting(false);
    }
  }

  function openBorrowLend(type, item = null) {
    setBlType(type);
    setBlItem(item);
    setBlOpen(true);
  }

  if (loading && !data) return <FullPageSpinner label="Loading your dashboard…" />;

  if (error && !data) {
    return (
      <Card className="mx-auto max-w-md p-8 text-center">
        <p className="text-3xl" aria-hidden="true">😕</p>
        <h1 className="mt-2 text-lg font-bold text-slate-800">Couldn't load your dashboard</h1>
        <p className="mt-1 text-sm text-slate-400">{error}</p>
        <div className="mt-4 flex justify-center gap-2">
          <Button
            onClick={() => {
              setLoading(true);
              Promise.all([loadDashboard(), loadBorrowLend()]).finally(() => setLoading(false));
            }}
          >
            Retry
          </Button>
          <Button variant="secondary" onClick={() => refresh()}>
            Refresh account
          </Button>
        </div>
      </Card>
    );
  }

  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800">
            {greeting}, {user && user.name ? user.name.split(' ')[0] : 'there'} 👋
          </h1>
          <p className="text-sm text-slate-400">{formatDateLong(todayISO())}</p>
          {data && data.hasRecurringDue ? (
            <span className="mt-1 inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-700">
              🔁 Recurring expenses pending
            </span>
          ) : null}
        </div>
        <p className="money text-sm font-semibold text-slate-500">
          Net position {formatMoney((data && data.netPosition) || 0, currency)}
        </p>
      </div>

      {/* 1. Balance + today's budget */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <BalanceCard data={data} currency={currency} />
        <DailyBudgetCard today={data && data.today} week={data && data.week} currency={currency} />
      </div>

      {/* 2. Quick actions */}
      <QuickActions
        onAddExpense={() => {
          setEditingTx(null);
          setExpenseOpen(true);
        }}
        onAddMoney={() => setMoneyOpen(true)}
        onBorrowLend={() => openBorrowLend('borrow')}
      />

      {/* 3-6. Summary panels */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <TodayTransactionList
            items={(data && data.todayTransactions) || []}
            currency={currency}
            loading={loading}
            onEdit={(tx) => {
              setEditingTx(tx);
              setExpenseOpen(true);
            }}
            onDelete={(tx) => setDeleteTarget(tx)}
          />
          <UpcomingDues
            items={(data && data.upcomingDues) || []}
            currency={currency}
            onRepay={(item) => {
              setRepayItem(item);
              setRepayOpen(true);
            }}
          />
        </div>

        <div className="space-y-5">
          <BorrowLendSummary
            items={bl.items}
            totals={bl.totals}
            currency={currency}
            loading={blLoading}
            onBorrow={() => openBorrowLend('borrow')}
            onLend={() => openBorrowLend('lend')}
            onEdit={(item) => openBorrowLend(item.type || 'borrow', item)}
            onDelete={(item) => setBlDeleteTarget(item)}
            onRepay={(item) => {
              setRepayItem(item);
              setRepayOpen(true);
            }}
          />
          <MonthProgressCard month={data && data.month} currency={currency} />
        </div>
      </div>

      {/* Modals */}
      <AddExpenseModal
        open={expenseOpen}
        transaction={editingTx}
        budget={data ? data.today : null}
        onClose={() => {
          setExpenseOpen(false);
          setEditingTx(null);
        }}
        onSaved={mutated}
      />
      <AddMoneyModal open={moneyOpen} onClose={() => setMoneyOpen(false)} onSaved={mutated} />
      <BorrowLendModal
        open={blOpen}
        initialType={blType}
        item={blItem}
        onClose={() => {
          setBlOpen(false);
          setBlItem(null);
        }}
        onSaved={mutated}
      />
      <RepaymentModal
        open={repayOpen}
        item={repayItem}
        onClose={() => {
          setRepayOpen(false);
          setRepayItem(null);
        }}
        onSaved={mutated}
      />
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete transaction?"
        message={
          deleteTarget
            ? `This will permanently remove ${formatMoney(deleteTarget.amount, currency)} (${
                (deleteTarget.category && deleteTarget.category.name) || deleteTarget.type
              }) from your records.`
            : ''
        }
        confirmLabel="Delete"
        loading={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
      />
      <ConfirmDialog
        open={Boolean(blDeleteTarget)}
        title="Delete borrow / lend record?"
        message={
          blDeleteTarget
            ? `"${blDeleteTarget.person}" (${formatMoney(blDeleteTarget.amount, currency)}) and all of its repayments will be permanently removed.`
            : ''
        }
        confirmLabel="Delete"
        loading={blDeleting}
        onCancel={() => setBlDeleteTarget(null)}
        onConfirm={confirmDeleteBorrowLend}
      />
    </div>
  );
}
