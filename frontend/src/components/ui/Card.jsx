export default function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`rounded-2xl bg-white shadow-sm ring-1 ring-slate-200/70 ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-500">
          {icon ? <span aria-hidden="true">{icon}</span> : null}
          {title}
        </h3>
        {subtitle ? <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function CardBody({ className = '', children }) {
  return <div className={`px-5 pb-5 pt-3 ${className}`}>{children}</div>;
}
