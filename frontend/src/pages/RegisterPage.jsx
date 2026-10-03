import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';

export default function RegisterPage() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function update(field) {
    return (event) => setForm((f) => ({ ...f, [field]: event.target.value }));
  }

  async function submit(event) {
    event.preventDefault();
    setError('');
    if (form.password !== form.confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (form.password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    try {
      const res = await api('/auth/register', {
        method: 'POST',
        body: { name: form.name.trim(), email: form.email.trim(), password: form.password },
      });
      login(res.token);
      // New accounts always need setup — the guard routes to /setup.
      navigate('/', { replace: true });
    } catch (err) {
      setError((err && err.message) || 'Could not create your account.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500 text-lg font-bold text-white shadow-sm">
            ₹
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-800">Spend Wisely</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200/70">
          <h1 className="text-lg font-bold text-slate-800">Create your account</h1>
          <p className="mb-5 mt-1 text-sm text-slate-400">
            Track balance, budgets, borrowings and statements in one place.
          </p>

          {error ? (
            <div className="mb-4 rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-600 ring-1 ring-rose-100">
              {error}
            </div>
          ) : null}

          <form onSubmit={submit} className="space-y-4">
            <Input
              label="Name"
              required
              autoComplete="name"
              placeholder="Your name"
              value={form.name}
              onChange={update('name')}
            />
            <Input
              label="Email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={form.email}
              onChange={update('email')}
            />
            <Input
              label="Password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="At least 6 characters"
              value={form.password}
              onChange={update('password')}
            />
            <Input
              label="Confirm password"
              type="password"
              required
              autoComplete="new-password"
              placeholder="Repeat password"
              value={form.confirm}
              onChange={update('confirm')}
            />
            <Button type="submit" loading={loading} className="w-full" size="lg">
              Create account
            </Button>
          </form>

          <p className="mt-4 text-center text-sm text-slate-500">
            Already registered?{' '}
            <Link to="/login" className="font-semibold text-emerald-600 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
