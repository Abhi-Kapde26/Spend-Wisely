import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <p className="text-6xl font-extrabold text-emerald-500">404</p>
      <h1 className="mt-3 text-xl font-bold text-slate-800">Page not found</h1>
      <p className="mt-1 max-w-sm text-sm text-slate-400">
        The page you're looking for doesn't exist or has moved.
      </p>
      <Link
        to="/"
        className="mt-5 rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-600"
      >
        Back to Dashboard
      </Link>
    </div>
  );
}
