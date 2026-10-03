import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { api } from '../lib/api.js';
import { useSettings } from '../context/SettingsContext.jsx';
import {
  DAILY_STATUS_COLORS,
  formatDate,
  formatDayShort,
  formatMoney,
  monthLabel,
  percent,
} from '../lib/format.js';

import Card, { CardBody, CardHeader } from '../components/ui/Card.jsx';
import Spinner from '../components/ui/Spinner.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import MonthPicker, { YearPicker } from '../components/ui/MonthPicker.jsx';
import { toastApiError } from '../components/ui/toast.js';

const TABS = [
  { key: 'daily', label: 'Daily' },
  { key: 'weekly', label: 'Weekly' },
  { key: 'monthly', label: 'Monthly' },
  { key: 'category', label: 'Category' },
  { key: 'budget', label: 'Budget' },
  { key: 'insights', label: 'Insights' },
];

const BAR_COLOR = '#10b981';

function ChartBox({ loading, empty, emptyTitle, children }) {
  if (loading) {
    return (
      <div className="flex h-72 items-center justify-center">
        <Spinner className="h-8 w-8" label="Loading chart" />
      </div>
    );
  }
  if (empty) {
    return <EmptyState icon="📉" title={emptyTitle} subtitle="No data for this range yet." />;
  }
  return <div className="h-72 w-full">{children}</div>;
}

function chartTooltip(currency) {
  return {
    contentStyle: {
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      fontSize: 12,
      boxShadow: '0 4px 14px rgba(15,23,42,0.08)',
    },
    formatter: (value) => [formatMoney(value, currency), 'Spent'],
  };
}

export default function AnalyticsPage() {
  const { settings, currency } = useSettings();
  const now = useMemo(() => new Date(), []);
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1;

  const [tab, setTab] = useState('daily');
  const [summary, setSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [days, setDays] = useState(30);
  const [daily, setDaily] = useState([]);
  const [dailyLoading, setDailyLoading] = useState(true);

  const [weekSel, setWeekSel] = useState({ year: currentYear, month: currentMonth });
  const [weekly, setWeekly] = useState([]);
  const [weeklyLoading, setWeeklyLoading] = useState(true);

  const [year, setYear] = useState(currentYear);
  const [monthly, setMonthly] = useState([]);
  const [monthlyLoading, setMonthlyLoading] = useState(true);

  const [catSel, setCatSel] = useState({ year: currentYear, month: currentMonth });
  const [categories, setCategories] = useState({ items: [], total: 0 });
  const [catLoading, setCatLoading] = useState(true);
  const [drill, setDrill] = useState(null);

  const [budgetSel, setBudgetSel] = useState({ year: currentYear, month: currentMonth });
  const [budgetPerf, setBudgetPerf] = useState(null);
  const [budgetLoading, setBudgetLoading] = useState(true);

  const [insights, setInsights] = useState([]);
  const [insightsLoading, setInsightsLoading] = useState(true);

  /* ---- data fetching ---- */
  useEffect(() => {
    let cancelled = false;
    setSummaryLoading(true);
    api('/analytics/summary')
      .then((res) => !cancelled && setSummary(res))
      .catch(() => !cancelled && setSummary(null))
      .finally(() => !cancelled && setSummaryLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDailyLoading(true);
    api('/analytics/daily', { params: { days } })
      .then((res) => !cancelled && setDaily((res && res.items) || []))
      .catch((err) => !cancelled && toastApiError(err, 'Could not load daily analytics.'))
      .finally(() => !cancelled && setDailyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [days]);

  useEffect(() => {
    let cancelled = false;
    setWeeklyLoading(true);
    api('/analytics/weekly', { params: { year: weekSel.year, month: weekSel.month } })
      .then((res) => !cancelled && setWeekly((res && res.items) || []))
      .catch(() => !cancelled && setWeekly([]))
      .finally(() => !cancelled && setWeeklyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [weekSel]);

  useEffect(() => {
    let cancelled = false;
    setMonthlyLoading(true);
    api('/analytics/monthly', { params: { year } })
      .then((res) => !cancelled && setMonthly((res && res.items) || []))
      .catch(() => !cancelled && setMonthly([]))
      .finally(() => !cancelled && setMonthlyLoading(false));
    return () => {
      cancelled = true;
    };
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    setCatLoading(true);
    setDrill(null);
    const from = `${catSel.year}-${String(catSel.month).padStart(2, '0')}-01`;
    const last = new Date(catSel.year, catSel.month, 0).getDate();
    const to = `${catSel.year}-${String(catSel.month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    api('/analytics/category', { params: { from, to } })
      .then((res) => !cancelled && setCategories({ items: (res && res.items) || [], total: (res && res.total) || 0 }))
      .catch(() => !cancelled && setCategories({ items: [], total: 0 }))
      .finally(() => !cancelled && setCatLoading(false));
    return () => {
      cancelled = true;
    };
  }, [catSel]);

  useEffect(() => {
    let cancelled = false;
    setBudgetLoading(true);
    api('/analytics/budget-performance', { params: { year: budgetSel.year, month: budgetSel.month } })
      .then((res) => !cancelled && setBudgetPerf(res))
      .catch(() => !cancelled && setBudgetPerf(null))
      .finally(() => !cancelled && setBudgetLoading(false));
    return () => {
      cancelled = true;
    };
  }, [budgetSel]);

  useEffect(() => {
    let cancelled = false;
    setInsightsLoading(true);
    api('/analytics/insights')
      .then((res) => !cancelled && setInsights((res && res.items) || []))
      .catch(() => !cancelled && setInsights([]))
      .finally(() => !cancelled && setInsightsLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  /** Drill-down: click a category to see its latest transactions (GET /transactions). */
  async function drillCategory(entry) {
    const category = entry.category || {};
    const from = `${catSel.year}-${String(catSel.month).padStart(2, '0')}-01`;
    const last = new Date(catSel.year, catSel.month, 0).getDate();
    const to = `${catSel.year}-${String(catSel.month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    setDrill({ category, items: [], total: 0, loading: true });
    try {
      const res = await api('/transactions', {
        params: { categoryId: category.id, from, to, limit: 5, sort: 'desc' },
      });
      setDrill({
        category,
        items: (res && res.items) || [],
        total: (res && res.total) || 0,
        loading: false,
      });
    } catch (err) {
      toastApiError(err, 'Could not load transactions for this category.');
      setDrill({ category, items: [], total: 0, loading: false });
    }
  }

  /** Weekly rows get a precomputed range label for the tooltip. */
  const weeklyData = useMemo(
    () =>
      (weekly || []).map((w) => ({
        ...w,
        rangeLabel:
          w.start && w.end ? `${formatDate(w.start)} – ${formatDate(w.end)}` : String(w.label || ''),
      })),
    [weekly],
  );

  /** Donut data normalised to flat {name, value, color} rows. */
  const pieData = useMemo(
    () =>
      categories.items.map((entry, index) => ({
        name: (entry.category && entry.category.name) || 'Others',
        value: Number(entry.total) || 0,
        color: (entry.category && entry.category.color) || '#64748b',
        id: entry.category && entry.category.id != null ? entry.category.id : `idx-${index}`,
      })),
    [categories.items],
  );

  const highestCategory = summary ? summary.highestCategory : null;
  const highestCategoryName = highestCategory
    ? typeof highestCategory === 'string'
      ? highestCategory
      : `${highestCategory.icon || ''} ${highestCategory.name || ''}`.trim()
    : '—';

  const stats = [
    { label: 'Average Daily Spending', value: summary ? formatMoney(summary.avgDailySpending, currency) : '—', icon: '📊' },
    {
      label: 'Highest Spending Day',
      value: summary && summary.highestDay && summary.highestDay.date ? `${formatMoney(summary.highestDay.total, currency)}` : '—',
      sub: summary && summary.highestDay && summary.highestDay.date ? formatDate(summary.highestDay.date) : 'No data',
      icon: '🏔️',
    },
    { label: 'Highest Category', value: highestCategoryName, icon: '🏆' },
    {
      label: 'Total Monthly Spending',
      value: summary ? formatMoney(summary.monthSpent, currency) : '—',
      sub: summary && summary.monthBudget > 0 ? `budget ${formatMoney(summary.monthBudget, currency)}` : undefined,
      icon: '🗓️',
    },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-slate-800">Analytics</h1>
          <p className="text-sm text-slate-400">Where your money actually goes.</p>
        </div>
        {settings ? (
          <p className="text-xs font-semibold text-slate-400">
            Safe to spend today:{' '}
            <span className="money text-emerald-600">
              {summary ? formatMoney(summary.safeToSpendToday, currency) : '—'}
            </span>
            {' · '}this week:{' '}
            <span className="money text-emerald-600">
              {summary ? formatMoney(summary.safeToSpendWeek, currency) : '—'}
            </span>
          </p>
        ) : null}
      </div>

      {/* Top stats strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.label} className="px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <span aria-hidden="true">{s.icon}</span> {s.label}
            </p>
            <p className="money mt-1 truncate text-lg font-bold text-slate-800" title={s.value}>
              {summaryLoading ? <span className="text-slate-300">…</span> : s.value}
            </p>
            {s.sub ? <p className="text-[11px] text-slate-400">{s.sub}</p> : null}
          </Card>
        ))}
      </div>

      {/* Tab chips */}
      <div className="scroll-thin -mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              tab === t.key
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Daily */}
      {tab === 'daily' ? (
        <Card>
          <CardHeader
            title="Daily spending"
            subtitle={`Last ${days} days`}
            action={
              <div className="flex gap-1 rounded-xl bg-slate-50 p-1 ring-1 ring-slate-200">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays(d)}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      days === d ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {d}d
                  </button>
                ))}
              </div>
            }
          />
          <CardBody>
            <ChartBox loading={dailyLoading} empty={daily.length === 0} emptyTitle="No spending in this range">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={daily} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={formatDayShort}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    minTickGap={20}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tickFormatter={(v) => formatMoney(v, currency)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={76}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...chartTooltip(currency)} labelFormatter={(l) => formatDate(l)} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="total" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={30} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </CardBody>
        </Card>
      ) : null}

      {/* Weekly */}
      {tab === 'weekly' ? (
        <Card>
          <CardHeader
            title="Weekly spending"
            subtitle={monthLabel(weekSel.year, weekSel.month)}
            action={<MonthPicker value={weekSel} onChange={setWeekSel} />}
          />
          <CardBody>
            <ChartBox loading={weeklyLoading} empty={weekly.length === 0} emptyTitle="No data for this month">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => formatMoney(v, currency)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={76}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    {...chartTooltip(currency)}
                    labelFormatter={(label, payload) =>
                      payload && payload[0] && payload[0].payload && payload[0].payload.rangeLabel
                        ? payload[0].payload.rangeLabel
                        : String(label)
                    }
                    cursor={{ fill: '#f1f5f9' }}
                  />
                  <Bar dataKey="total" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </CardBody>
        </Card>
      ) : null}

      {/* Monthly */}
      {tab === 'monthly' ? (
        <Card>
          <CardHeader
            title="Monthly spending"
            subtitle={String(year)}
            action={<YearPicker value={year} onChange={setYear} />}
          />
          <CardBody>
            <ChartBox loading={monthlyLoading} empty={monthly.length === 0} emptyTitle="No data for this year">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis
                    tickFormatter={(v) => formatMoney(v, currency)}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    width={76}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip {...chartTooltip(currency)} cursor={{ fill: '#f1f5f9' }} />
                  <Bar dataKey="total" fill={BAR_COLOR} radius={[4, 4, 0, 0]} maxBarSize={38} />
                </BarChart>
              </ResponsiveContainer>
            </ChartBox>
          </CardBody>
        </Card>
      ) : null}

      {/* Category */}
      {tab === 'category' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader
              title="By category"
              subtitle={monthLabel(catSel.year, catSel.month)}
              action={<MonthPicker value={catSel} onChange={setCatSel} />}
            />
            <CardBody>
              <ChartBox loading={catLoading} empty={categories.items.length === 0} emptyTitle="No spending this month">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius="55%"
                      outerRadius="85%"
                      paddingAngle={2}
                      stroke="#ffffff"
                      strokeWidth={2}
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${entry.id}-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: '1px solid #e2e8f0',
                        fontSize: 12,
                      }}
                      formatter={(value, name) => [formatMoney(value, currency), name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </ChartBox>
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Legend" subtitle="Tap a category to see its latest transactions" />
            <CardBody>
              {catLoading ? (
                <div className="flex justify-center py-8">
                  <Spinner label="Loading categories" />
                </div>
              ) : categories.items.length === 0 ? (
                <EmptyState icon="🏷️" title="Nothing to break down yet" />
              ) : (
                <>
                  <ul className="space-y-1.5">
                    {categories.items.map((entry, index) => {
                      const cat = entry.category || {};
                      const active = drill && drill.category && drill.category.id === cat.id;
                      return (
                        <li key={cat.id != null ? `lg-${cat.id}` : `lg-idx-${index}`}>
                          <button
                            type="button"
                            onClick={() => drillCategory(entry)}
                            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition hover:bg-slate-50 ${
                              active ? 'bg-slate-50 ring-1 ring-slate-200' : ''
                            }`}
                          >
                            <span
                              className="h-3 w-3 shrink-0 rounded-full"
                              style={{ backgroundColor: cat.color || '#64748b' }}
                              aria-hidden="true"
                            />
                            <span className="flex-1 truncate text-sm font-semibold text-slate-700">
                              {cat.icon || ''} {cat.name || 'Others'}
                            </span>
                            <span className="money text-sm font-bold text-slate-700">
                              {formatMoney(entry.total, currency)}
                            </span>
                            <span className="money w-12 text-right text-xs font-semibold text-slate-400">
                              {percent(
                                categories.total > 0 ? Number(entry.total) / categories.total : 0,
                              )}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>

                  <div className="mt-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm ring-1 ring-slate-200">
                    <span className="text-slate-500">Total</span>
                    <span className="money float-right font-bold text-slate-800">
                      {formatMoney(categories.total, currency)}
                    </span>
                  </div>

                  {drill ? (
                    <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-slate-200">
                      <p className="mb-2 text-xs font-bold text-slate-600">
                        {drill.category.icon || ''} {drill.category.name} — latest{' '}
                        <span className="money">{drill.total}</span> transaction
                        {drill.total === 1 ? '' : 's'}
                      </p>
                      {drill.loading ? (
                        <div className="flex justify-center py-4">
                          <Spinner label="Loading transactions" />
                        </div>
                      ) : drill.items.length === 0 ? (
                        <p className="py-2 text-xs text-slate-400">No transactions in this month.</p>
                      ) : (
                        <ul className="space-y-1.5">
                          {drill.items.map((tx, index) => (
                            <li
                              key={tx.id != null ? `tx-${tx.id}` : `tx-idx-${index}`}
                              className="flex items-center justify-between gap-2 text-xs"
                            >
                              <span className="truncate text-slate-500">
                                {formatDate(tx.date)} · {tx.comment || tx.type}
                              </span>
                              <span
                                className="money font-bold"
                                style={{ color: tx.type === 'expense' ? '#ef4444' : '#10b981' }}
                              >
                                {tx.type === 'expense' ? '-' : '+'}
                                {formatMoney(tx.amount, currency)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </>
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Budget performance */}
      {tab === 'budget' ? (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Daily limit performance"
              subtitle={monthLabel(budgetSel.year, budgetSel.month)}
              action={<MonthPicker value={budgetSel} onChange={setBudgetSel} />}
            />
            <CardBody>
              {budgetLoading ? (
                <div className="flex h-56 items-center justify-center">
                  <Spinner className="h-8 w-8" label="Loading budget performance" />
                </div>
              ) : !budgetPerf || !budgetPerf.items || budgetPerf.items.length === 0 ? (
                <EmptyState icon="🗓️" title="No days to show" subtitle="Set a daily limit in Settings." />
              ) : (
                <>
                  <div
                    className="grid gap-1.5"
                    style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(2.6rem, 1fr))' }}
                  >
                    {budgetPerf.items.map((day, index) => {
                      const color = DAILY_STATUS_COLORS[day.status] || '#e2e8f0';
                      const hasLimit = Number(day.limit) > 0;
                      const dayNumber = String(day.date || '').slice(8, 10);
                      return (
                        <div
                          key={day.date || `day-${index}`}
                          title={`Day ${dayNumber}: ${formatMoney(day.spent, currency)}${
                            hasLimit ? ` / ${formatMoney(day.limit, currency)}` : ''
                          }${hasLimit ? ` (${day.status})` : ' — no limit'}`}
                          className="flex aspect-square flex-col items-center justify-center rounded-lg text-[11px] font-bold"
                          style={{
                            backgroundColor: hasLimit ? color : '#f1f5f9',
                            color: hasLimit ? '#ffffff' : '#94a3b8',
                          }}
                        >
                          {dayNumber}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-3 text-[11px] font-semibold text-slate-500">
                    {[
                      ['🟢', '#22c55e', 'Within limit'],
                      ['🟡', '#eab308', '75–90%'],
                      ['🟠', '#f97316', '90–100%'],
                      ['🔴', '#ef4444', 'Exceeded'],
                      ['⬜', '#f1f5f9', 'No limit / no data'],
                    ].map(([icon, color, label]) => (
                      <span key={label} className="flex items-center gap-1.5">
                        <span
                          className="h-3 w-3 rounded"
                          style={{ backgroundColor: color }}
                          aria-hidden="true"
                        />
                        {icon} {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Stats" subtitle={monthLabel(budgetSel.year, budgetSel.month)} />
            <CardBody className="space-y-2">
              {budgetLoading ? (
                <div className="flex justify-center py-6">
                  <Spinner label="Loading stats" />
                </div>
              ) : (
                (() => {
                  const s = (budgetPerf && budgetPerf.stats) || {};
                  const rows = [
                    ['Days within limit', s.daysWithin],
                    ['Days exceeded', s.daysExceeded],
                    ['Days with a limit', s.daysWithLimit],
                    ['Total days', s.totalDays],
                  ];
                  return rows.map(([label, value]) => (
                    <div
                      key={label}
                      className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-2.5 ring-1 ring-slate-100"
                    >
                      <span className="text-sm text-slate-500">{label}</span>
                      <span className="money text-sm font-bold text-slate-800">{value ?? 0}</span>
                    </div>
                  ));
                })()
              )}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {/* Insights */}
      {tab === 'insights' ? (
        <Card>
          <CardHeader title="Insights" subtitle="Rule-based nudges about your habits" icon="💡" />
          <CardBody>
            {insightsLoading ? (
              <div className="flex justify-center py-8">
                <Spinner label="Loading insights" />
              </div>
            ) : insights.length === 0 ? (
              <EmptyState
                icon="💡"
                title="No insights yet"
                subtitle="Log a few days of spending and patterns will show up here."
              />
            ) : (
              <ul className="space-y-3">
                {insights.map((insight, index) => {
                  const tone =
                    insight.type === 'warning'
                      ? { bg: '#fef3c7', fg: '#b45309', ring: '#fde68a' }
                      : insight.type === 'success'
                        ? { bg: '#d1fae5', fg: '#047857', ring: '#a7f3d0' }
                        : { bg: '#e0f2fe', fg: '#0369a1', ring: '#bae6fd' };
                  return (
                    <li
                      key={insight.text ? `ins-${index}` : `ins-idx-${index}`}
                      className="flex items-start gap-3 rounded-xl px-4 py-3"
                      style={{ backgroundColor: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.ring}` }}
                    >
                      <span aria-hidden="true">💡</span>
                      <p className="text-sm font-semibold">{insight.text}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
