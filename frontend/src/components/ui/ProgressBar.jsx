import { DAILY_STATUS_COLORS, classNames } from '../../lib/format.js';

/**
 * Progress bar colored by daily-budget status (SPEC §2.2 / §5).
 * `value` is a fraction (0..1+); the bar clamps at 100% visually.
 */
export default function ProgressBar({ value = 0, status, color, className = '', height = 'h-2.5' }) {
  const pct = Math.max(0, Math.min(1, Number(value) || 0)) * 100;
  const fill = color || DAILY_STATUS_COLORS[status] || '#10b981';
  return (
    <div
      className={classNames('w-full overflow-hidden rounded-full bg-slate-200', height, className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-500"
        style={{ width: `${pct}%`, backgroundColor: fill }}
      />
    </div>
  );
}
