import { useEffect, useRef, useState } from 'react';
import Card, { CardBody, CardHeader } from '../ui/Card.jsx';
import Button from '../ui/Button.jsx';
import { api } from '../../lib/api.js';
import { useSettings } from '../../context/SettingsContext.jsx';
import { toastSuccess } from '../ui/toast.js';

export default function NotepadCard({ initialNote, onNoteSaved, className = '' }) {
  const { user } = useSettings();
  const userId = user && user.id;
  const storageKey = userId ? `spendwisely_notepad_${userId}` : 'spendwisely_notepad';

  const [content, setContent] = useState(() => {
    if (initialNote && typeof initialNote.content === 'string' && initialNote.content.length > 0) {
      return initialNote.content;
    }
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached != null && cached.length > 0) return cached;
    } catch {
      // ignore storage access errors
    }
    return (initialNote && initialNote.content) || '';
  });

  const [status, setStatus] = useState('saved'); // 'saved' | 'saving' | 'dirty' | 'error'
  const [lastSaved, setLastSaved] = useState(() => (initialNote && initialNote.updatedAt) || null);

  const textareaRef = useRef(null);
  const debounceRef = useRef(null);
  const statusRef = useRef(status);
  statusRef.current = status;

  const latestContentRef = useRef(content);
  latestContentRef.current = content;

  const lastSavedContentRef = useRef(
    (initialNote && typeof initialNote.content === 'string') ? initialNote.content : content,
  );

  // Sync when initialNote arrives from outside (e.g. initial dashboard fetch or account switch)
  useEffect(() => {
    if (!initialNote) return;
    const incomingText = typeof initialNote.content === 'string' ? initialNote.content : '';

    // If server text matches what we already have or recently saved, just sync timestamp
    if (incomingText === lastSavedContentRef.current) {
      if (initialNote.updatedAt) setLastSaved(initialNote.updatedAt);
      return;
    }

    // Never overwrite in-flight user edits
    if (statusRef.current === 'dirty' || statusRef.current === 'saving') {
      return;
    }

    setContent(incomingText);
    latestContentRef.current = incomingText;
    lastSavedContentRef.current = incomingText;
    if (initialNote.updatedAt) setLastSaved(initialNote.updatedAt);
  }, [initialNote?.content, initialNote?.updatedAt]);

  // Re-sync when switching accounts
  useEffect(() => {
    const serverText = (initialNote && typeof initialNote.content === 'string') ? initialNote.content : '';
    let starting = serverText;
    if (!starting) {
      try {
        starting = localStorage.getItem(storageKey) || '';
      } catch {
        starting = '';
      }
    }
    setContent(starting);
    latestContentRef.current = starting;
    lastSavedContentRef.current = starting;
    setStatus('saved');
    statusRef.current = 'saved';
    setLastSaved((initialNote && initialNote.updatedAt) || null);
  }, [userId]);

  // Flush unsaved edits on unmount so user navigation doesn't discard notes
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      const pending = latestContentRef.current;
      if (pending !== lastSavedContentRef.current) {
        try {
          localStorage.setItem(storageKey, pending);
        } catch {
          // ignore quota
        }
        api('/notes', { method: 'PUT', body: { content: pending } }).catch(() => {});
      }
    };
  }, [storageKey]);

  async function persist(textToSave, showToast = false) {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    setStatus('saving');
    statusRef.current = 'saving';

    try {
      try {
        localStorage.setItem(storageKey, textToSave);
      } catch {
        // ignore quota
      }

      const res = await api('/notes', {
        method: 'PUT',
        body: { content: textToSave },
      });

      lastSavedContentRef.current = textToSave;
      setStatus('saved');
      statusRef.current = 'saved';

      const savedTime = (res && res.note && res.note.updatedAt) || new Date().toISOString();
      setLastSaved(savedTime);

      if (onNoteSaved && res && res.note) {
        onNoteSaved(res.note);
      }

      if (showToast) {
        toastSuccess('Notepad saved.');
      }
    } catch {
      setStatus('error');
      statusRef.current = 'error';
    }
  }

  function scheduleAutoSave(next) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      persist(next, false);
    }, 750);
  }

  function handleChange(e) {
    const next = e.target.value;
    setContent(next);
    setStatus('dirty');
    statusRef.current = 'dirty';

    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // ignore quota
    }

    scheduleAutoSave(next);
  }

  function handleBlur() {
    if (statusRef.current === 'dirty') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      persist(latestContentRef.current, false);
    }
  }

  function handleManualSave() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    persist(latestContentRef.current, true);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') {
      const textarea = textareaRef.current;
      if (!textarea) return;

      const { selectionStart, selectionEnd } = textarea;
      if (selectionStart !== selectionEnd) return;

      const currentVal = latestContentRef.current;
      const lineStart = currentVal.lastIndexOf('\n', selectionStart - 1) + 1;
      const currentLine = currentVal.substring(lineStart, selectionStart);

      // Check if current line is a bullet
      if (currentLine.startsWith('• ') || currentLine.startsWith('- ')) {
        const bulletPrefix = currentLine.startsWith('• ') ? '• ' : '- ';

        // If user pressed enter on an empty bullet line, remove the bullet
        if (currentLine.trim() === '•' || currentLine.trim() === '-') {
          e.preventDefault();
          const before = currentVal.substring(0, lineStart);
          const after = currentVal.substring(selectionStart);
          const updated = before + after;
          setContent(updated);
          setStatus('dirty');
          statusRef.current = 'dirty';
          setTimeout(() => {
            textarea.setSelectionRange(lineStart, lineStart);
          }, 0);
          scheduleAutoSave(updated);
          return;
        }

        // Auto-continue bullet on the new line
        e.preventDefault();
        const before = currentVal.substring(0, selectionStart);
        const after = currentVal.substring(selectionStart);
        const newlineAndBullet = `\n${bulletPrefix}`;
        const updated = `${before}${newlineAndBullet}${after}`;
        const newPos = selectionStart + newlineAndBullet.length;

        setContent(updated);
        setStatus('dirty');
        statusRef.current = 'dirty';
        setTimeout(() => {
          textarea.setSelectionRange(newPos, newPos);
        }, 0);
        scheduleAutoSave(updated);
      }
    }
  }

  function insertBullet() {
    const textarea = textareaRef.current;
    const bullet = '• ';
    if (!textarea) {
      const updated = content ? `${content}\n${bullet}` : bullet;
      setContent(updated);
      setStatus('dirty');
      statusRef.current = 'dirty';
      scheduleAutoSave(updated);
      return;
    }

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = content.substring(0, start);
    const after = content.substring(end);
    const needsNewline = before.length > 0 && !before.endsWith('\n');
    const insertion = `${needsNewline ? '\n' : ''}${bullet}`;
    const updated = `${before}${insertion}${after}`;

    setContent(updated);
    setStatus('dirty');
    statusRef.current = 'dirty';

    setTimeout(() => {
      textarea.focus();
      const pos = start + insertion.length;
      textarea.setSelectionRange(pos, pos);
    }, 0);

    scheduleAutoSave(updated);
  }

  const linesCount = content.trim() ? content.trim().split('\n').length : 0;
  const isNearLimit = content.length > 18000;

  return (
    <Card className={`flex h-full flex-col ${className}`}>
      <CardHeader
        icon="📝"
        title="Future Expenses & Notes"
        subtitle="Planned spends, reminders & quick ideas"
        action={
          <div className="flex items-center gap-2">
            {status === 'saving' ? (
              <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-600">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
                Saving…
              </span>
            ) : status === 'error' ? (
              <div className="flex items-center gap-1.5">
                <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-600">
                  Save failed
                </span>
                <Button size="xs" variant="secondary" onClick={handleManualSave}>
                  Retry
                </Button>
              </div>
            ) : status === 'dirty' ? (
              <Button size="xs" variant="secondary" onClick={handleManualSave}>
                Save
              </Button>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-600">
                ✓ Saved
              </span>
            )}
          </div>
        }
      />
      <CardBody className="flex flex-1 flex-col gap-2 pt-2">
        <div className="relative flex flex-1 flex-col min-h-[130px]">
          <textarea
            ref={textareaRef}
            id="dashboard-notepad-input"
            aria-label="Future expenses notepad"
            value={content}
            onChange={handleChange}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            maxLength={20000}
            placeholder={`Jot down your future expenses or notes here...\n\nExample:\n• Rent: ₹12,000 (1st of next month)\n• Electricity bill: ₹1,500\n• Grocery stock-up: ₹3,000\n• Friend's birthday gift: ₹1,000`}
            className="w-full flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-xs leading-relaxed text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white focus:ring-2 focus:ring-emerald-500/20"
          />
        </div>

        <div className="flex items-center justify-between pt-1 text-[11px] text-slate-400">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={insertBullet}
              className="rounded px-1.5 py-0.5 font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              title="Add bullet point"
            >
              + Bullet
            </button>
            <span>·</span>
            <span>
              {linesCount} {linesCount === 1 ? 'item' : 'items'}
            </span>
            {isNearLimit ? (
              <>
                <span>·</span>
                <span className="text-amber-500 font-medium">
                  {content.length}/20,000 chars
                </span>
              </>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline">Auto-saves as you type</span>
            {content ? (
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Clear all notepad text?')) {
                    setContent('');
                    latestContentRef.current = '';
                    setStatus('dirty');
                    statusRef.current = 'dirty';
                    persist('', false);
                  }
                }}
                className="text-slate-400 hover:text-rose-500"
                title="Clear notepad"
              >
                Clear
              </button>
            ) : null}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}
