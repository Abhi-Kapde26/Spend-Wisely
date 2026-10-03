import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api.js';
import { useAuth } from '../../lib/auth.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { classNames, formatMoney, statusMeta } from '../../lib/format.js';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/analytics', label: 'Analytics', icon: '📊', end: false },
  { to: '/history', label: 'History', icon: '📅', end: false },
];

function linkClass({ isActive }) {
  return classNames(
    'flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition-colors',
    isActive ? 'bg-emerald-50 text-emerald-700' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
  );
}

function tabClass({ isActive }) {
  return classNames(
    'flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold transition-colors',
    isActive ? 'text-emerald-600' : 'text-slate-400',
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef(null);
  const { currency } = useSettings();

  useEffect(() => {
    if (!open) return undefined;
    let cancelled = false;
    setLoading(true);
    api('/dashboard')
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const onClick = (event) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => {
      cancelled = true;
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const dues = (data && data.upcomingDues) || [];
  const today = (data && data.today) || null;
  const meta = today ? statusMeta(today.status) : null;
  const hasAlert = dues.length > 0 || (today && (today.status === 'exceeded' || today.status === 'near_limit'));

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Notifications"
        className="relative rounded-xl p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 17h5l-1.4-1.4A2 2 0 0118 14.2V11a6 6 0 10-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>
        {hasAlert ? (
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-white" />
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-80 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-700">
            Notifications
          </div>
          <div className="scroll-thin max-h-80 overflow-y-auto px-4 py-3 text-sm">
            {loading ? (
              <p className="py-3 text-center text-xs text-slate-400">Loading…</p>
            ) : !data ? (
              <p className="py-3 text-center text-xs text-slate-400">Could not load notifications.</p>
            ) : (
              <ul className="space-y-3">
                {today ? (
                  <li className="flex items-start gap-2">
                    <span aria-hidden="true">{meta.icon}</span>
                    <div>
                      <p className="font-semibold text-slate-700">Today: {meta.label}</p>
                      <p className="text-xs text-slate-500">
                        {today.limit > 0
                          ? `${formatMoney(today.spent, currency)} spent of ${formatMoney(today.limit, currency)} — safe to spend ${formatMoney(today.safeToSpend, currency)}`
                          : `Spent ${formatMoney(today.spent, currency)} today. Set a daily limit in Settings.`}
                      </p>
                    </div>
                  </li>
                ) : null}
                {dues.length === 0 ? (
                  <li className="text-xs text-slate-400">No dues in the next 7 days. 🎉</li>
                ) : (
                  dues.map((due) => (
                    <li key={`${due.type}-${due.id}`} className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-700">
                          {due.type === 'borrow' ? 'You owe' : 'You lent'} {due.person}
                        </p>
                        <p className="text-xs text-slate-500">
                          {due.type === 'borrow' ? 'Repay by ' : 'Collect by '}
                          {due.due_date || due.dueDate || '—'}
                        </p>
                      </div>
                      <span className="money text-xs font-bold text-slate-600">
                        {formatMoney(due.amount, currency)}
                      </span>
                    </li>
                  ))
                )}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AppShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout } = useAuth();
  const { user, settings } = useSettings();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onClick = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const initial = (user && user.name ? user.name[0] : '?') || '?';

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Desktop / tablet top nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-base text-white shadow-sm">
                ₹
              </span>
              <span className="text-base font-extrabold tracking-tight text-slate-800">
                Spend Wisely
              </span>
            </NavLink>
            <nav className="hidden items-center gap-1 md:flex">
              {NAV_ITEMS.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className={linkClass}>
                  <span aria-hidden="true">{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-1">
            <span className="hidden text-xs font-semibold text-slate-400 sm:block">
              {settings ? formatMoney(settings.openingBalance, settings.currency) : ''} opening
            </span>
            <NotificationBell />
            <NavLink
              to="/settings"
              aria-label="Settings"
              className={({ isActive }) =>
                classNames(
                  'rounded-xl p-2 transition',
                  isActive
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700',
                )
              }
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M10.3 4.3l.4-1.6h2.6l.4 1.6 1.5.6 1.4-.9 1.9 1.9-.9 1.4.6 1.5 1.6.4v2.6l-1.6.4-.6 1.5.9 1.4-1.9 1.9-1.4-.9-1.5.6-.4 1.6h-2.6l-.4-1.6-1.5-.6-1.4.9-1.9-1.9.9-1.4-.6-1.5L4.3 13v-2.6l1.6-.4.6-1.5-.9-1.4 1.9-1.9 1.4.9 1.5-.6zM14.5 12a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"
                />
              </svg>
            </NavLink>

            <div className="relative" ref={menuRef}>
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                className="ml-1 flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200"
                aria-label="Account menu"
              >
                {initial.toUpperCase()}
              </button>
              {menuOpen ? (
                <div className="absolute right-0 top-10 z-50 w-56 overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="truncate text-sm font-bold text-slate-700">{user ? user.name : ''}</p>
                    <p className="truncate text-xs text-slate-400">{user ? user.email : ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      logout();
                      navigate('/login', { replace: true });
                    }}
                    className="w-full px-4 py-2.5 text-left text-sm font-semibold text-rose-600 hover:bg-rose-50"
                  >
                    Log out
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-24 pt-5 sm:px-6 md:pb-10">
        <Outlet />
      </main>

      {/* Mobile bottom tab bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={tabClass}>
              <span className="text-lg" aria-hidden="true">
                {item.icon}
              </span>
              {item.label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
