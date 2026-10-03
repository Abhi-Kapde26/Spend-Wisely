export default function Spinner({ className = 'h-6 w-6', label = 'Loading…' }) {
  return (
    <span
      className={`inline-block animate-spin rounded-full border-2 border-emerald-500 border-t-transparent ${className}`}
      role="status"
      aria-label={label}
    />
  );
}

export function FullPageSpinner({ label = 'Loading…' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-400">
      <Spinner className="h-9 w-9" label={label} />
      <p className="text-sm">{label}</p>
    </div>
  );
}
