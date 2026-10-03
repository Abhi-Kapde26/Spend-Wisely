import { monthShort } from '../../lib/format.js';

function yearsWindow(count = 6) {
  const current = new Date().getFullYear();
  const list = [];
  for (let i = 0; i < count; i += 1) list.push(current - i);
  return list;
}

/** Compact month selector used by Analytics/History (label: "October 2026"). */
export default function MonthPicker({ value, onChange, withYear = true, className = '' }) {
  const { year, month } = value;
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <select
        aria-label="Month"
        value={month}
        onChange={(e) => onChange({ year, month: Number(e.target.value) })}
        className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      >
        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
          <option key={m} value={m}>
            {monthShort(m)}
          </option>
        ))}
      </select>
      {withYear ? (
        <select
          aria-label="Year"
          value={year}
          onChange={(e) => onChange({ year: Number(e.target.value), month })}
          className="rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          {yearsWindow().map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      ) : null}
    </div>
  );
}

/** Year-only picker for the Monthly chart tab. */
export function YearPicker({ value, onChange, className = '' }) {
  return (
    <select
      aria-label="Year"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className={`rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100 ${className}`}
    >
      {yearsWindow().map((y) => (
        <option key={y} value={y}>
          {y}
        </option>
      ))}
    </select>
  );
}
