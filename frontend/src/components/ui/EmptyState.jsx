export default function EmptyState({ icon = '📭', title, subtitle, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-xl px-4 py-10 text-center ${className}`}>
      <div className="text-3xl" aria-hidden="true">
        {icon}
      </div>
      <p className="text-sm font-semibold text-slate-600">{title}</p>
      {subtitle ? <p className="max-w-sm text-xs text-slate-400">{subtitle}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
