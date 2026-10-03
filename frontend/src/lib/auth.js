/**
 * Token helpers + auth context (SPEC §5: localStorage key `sw_token`).
 * Deliberately JSX-free so the file can stay `auth.js`.
 */
import { createContext, createElement, useCallback, useContext, useMemo, useState } from 'react';

const TOKEN_KEY = 'sw_token';

export function getToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* storage unavailable — ignore */
  }
}

export function clearToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setTok] = useState(() => getToken());

  const login = useCallback((newToken) => {
    setToken(newToken);
    setTok(newToken);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setTok(null);
  }, []);

  const value = useMemo(
    () => ({ token, isAuthenticated: Boolean(token), login, logout }),
    [token, login, logout],
  );

  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
