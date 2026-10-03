/**
 * SettingsContext — loads /auth/me + settings, exposes settings, user,
 * onboardingComplete, refresh() and logout(). Also fires the one-shot
 * `POST /recurring/process` when an account is loaded (SPEC §3.12).
 */
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { useAuth } from '../lib/auth.js';

const SettingsContext = createContext(null);

/** Survives StrictMode's double-effect in dev so due items are processed once per user. */
let recurringProcessedFor = null;

export function SettingsProvider({ children }) {
  const { token, logout: authLogout } = useAuth();
  const [user, setUser] = useState(null);
  const [settings, setSettings] = useState(null);
  const [onboardingComplete, setOnboardingComplete] = useState(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!token) {
      setUser(null);
      setSettings(null);
      setOnboardingComplete(null);
      setLoading(false);
      setError(null);
      return null;
    }
    setLoading(true);
    try {
      // SPEC §5: SettingsContext loads /auth/me + /settings
      const [me, settingsRes] = await Promise.all([
        api('/auth/me'),
        api('/settings').catch(() => null),
      ]);
      const activeSettings = (settingsRes && settingsRes.settings) || me.settings || null;
      setUser(me.user || null);
      setSettings(activeSettings);
      setOnboardingComplete(Boolean(me.onboardingComplete));
      setError(null);

      const uid = me.user && me.user.id;
      if (uid != null && recurringProcessedFor !== uid) {
        recurringProcessedFor = uid;
        api('/recurring/process', { method: 'POST' }).catch(() => {
          /* silent — SPEC: ignore failures */
        });
      }
      return { user: me.user, settings: activeSettings, onboardingComplete: me.onboardingComplete };
    } catch (err) {
      if (!err || err.status !== 401) {
        setError((err && err.message) || 'Could not load your account.');
      }
      return null;
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    if (!token) {
      setUser(null);
      setSettings(null);
      setOnboardingComplete(null);
      setLoading(false);
      setError(null);
      return undefined;
    }
    setLoading(true);
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [token, refresh]);

  /** PUT /settings (partial) then update local state from the response. */
  const saveSettings = useCallback(
    async (partial) => {
      const data = await api('/settings', { method: 'PUT', body: partial });
      if (data && data.settings) setSettings(data.settings);
      return data;
    },
    [],
  );

  const logout = useCallback(() => {
    setUser(null);
    setSettings(null);
    setOnboardingComplete(null);
    setError(null);
    authLogout();
  }, [authLogout]);

  const value = {
    user,
    settings,
    onboardingComplete,
    loading,
    error,
    refresh,
    saveSettings,
    logout,
    currency: (settings && settings.currency) || 'INR',
  };

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>');
  return ctx;
}
