import { useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Input from '../ui/Input.jsx';
import Select from '../ui/Select.jsx';
import { classNames } from '../../lib/format.js';
import { toastApiError } from '../ui/toast.js';

const FALLBACK_COLORS = ['#f97316', '#ec4899', '#0ea5e9', '#8b5cf6', '#f43f5e', '#16a34a', '#eab308', '#64748b'];

function matchesType(category, type) {
  return category.type === 'both' || category.type === type;
}

/**
 * Grid of icon chips for choosing a category, plus "+ Add Custom Category"
 * which POSTs a new category inline (SPEC §5 modals).
 */
export default function CategoryPicker({ categories = [], type = 'expense', value, onSelect, onCreated }) {
  const [adding, setAdding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', icon: '📦', color: FALLBACK_COLORS[0], type: 'expense' });
  const [error, setError] = useState('');

  const visible = categories.filter((c) => matchesType(c, type));

  async function createCategory(event) {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setError('Category name is required.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await api('/categories', {
        method: 'POST',
        body: { name, icon: form.icon || '📦', color: form.color, type: form.type },
      });
      const created = res.category;
      setAdding(false);
      setForm({ name: '', icon: '📦', color: FALLBACK_COLORS[0], type });
      if (onCreated) onCreated(created);
    } catch (err) {
      setError(err && err.message ? err.message : 'Could not create category.');
      toastApiError(err, 'Could not create category.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {visible.map((cat) => {
          const active = Number(value) === Number(cat.id);
          return (
            <button
              key={cat.id}
              type="button"
              onClick={() => onSelect(cat)}
              aria-pressed={active}
              className={classNames(
                'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-center transition',
                active
                  ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-200'
                  : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
              )}
            >
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-base"
                style={{ backgroundColor: `${cat.color || '#64748b'}22` }}
                aria-hidden="true"
              >
                {cat.icon || '📦'}
              </span>
              <span className="w-full truncate text-[11px] font-semibold text-slate-600">{cat.name}</span>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => {
            setForm((f) => ({ ...f, type }));
            setAdding((v) => !v);
          }}
          className="flex flex-col items-center gap-1 rounded-xl border border-dashed border-slate-300 px-2 py-2.5 text-center transition hover:border-emerald-400 hover:bg-emerald-50/50"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-base text-slate-500">
            +
          </span>
          <span className="text-[11px] font-semibold text-slate-500">Add Custom</span>
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="mt-2 text-xs text-slate-400">No {type} categories yet — add a custom one below.</p>
      ) : null}

      {adding ? (
        <form onSubmit={createCategory} className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <p className="mb-2 text-xs font-bold text-slate-600">New category</p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Name"
              required
              placeholder="e.g. Pets"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              error={error || undefined}
              className="col-span-2 sm:col-span-1"
            />
            <Input
              label="Icon (emoji)"
              maxLength={4}
              value={form.icon}
              onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
            />
            <Input
              label="Colour"
              type="color"
              className="[&_input]:h-9"
              value={form.color}
              onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
            />
            <Select
              label="Type"
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="both">Both</option>
            </Select>
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button size="sm" type="submit" loading={saving}>
              Add & select
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
