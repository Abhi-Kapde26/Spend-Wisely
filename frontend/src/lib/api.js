/**
 * Fetch wrapper for the Spend Wisely API (SPEC §3).
 * - base `/api`, attaches `Authorization: Bearer <token>`
 * - throws `{ message, status }` on any error
 * - on 401 clears the token and redirects to /login
 */
import { clearToken, getToken } from './auth.js';

const BASE = `${import.meta.env.VITE_API_URL || ''}/api`;

function buildUrl(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

function authHeaders(withBody) {
  const headers = {};
  if (withBody) headers['Content-Type'] = 'application/json';
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

function handle401() {
  clearToken();
  const path = window.location.pathname;
  if (path !== '/login' && path !== '/register') {
    window.location.assign('/login');
  }
}

async function readBody(res) {
  const type = res.headers.get('content-type') || '';
  if (type.includes('application/json')) {
    return res.json().catch(() => null);
  }
  return null;
}

function errorFrom(res, data) {
  const message =
    (data && (data.error || data.message)) || `Request failed (${res.status})`;
  return { message, status: res.status };
}

/**
 * JSON request helper.
 * @returns parsed JSON body
 * @throws { message, status }
 */
export async function api(path, options = {}) {
  const { method = 'GET', body, params, auth = true, signal } = options;
  const init = {
    method,
    headers: authHeaders(body !== undefined),
    signal,
  };
  if (body !== undefined) init.body = JSON.stringify(body);

  let res;
  try {
    res = await fetch(buildUrl(path, params), init);
  } catch (err) {
    if (err && err.name === 'AbortError') throw err;
    throw { message: 'Network error — could not reach the server.', status: 0 };
  }

  if (res.status === 401 && auth) handle401();

  const data = await readBody(res);
  if (!res.ok) throw errorFrom(res, data);
  return data;
}

/**
 * Authenticated file download (CSV / Excel / PDF exports).
 * Streams the blob and triggers a browser save.
 */
export async function download(path, options = {}) {
  const { params, filename, method = 'GET' } = options;

  let res;
  try {
    res = await fetch(buildUrl(path, params), { method, headers: authHeaders(false) });
  } catch {
    throw { message: 'Network error — could not reach the server.', status: 0 };
  }

  if (res.status === 401) {
    handle401();
    throw { message: 'Your session expired. Please sign in again.', status: 401 };
  }

  if (!res.ok) {
    const data = await readBody(res);
    throw errorFrom(res, data);
  }

  const blob = await res.blob();
  let name = filename;
  if (!name) {
    const disposition = res.headers.get('content-disposition') || '';
    const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
    if (match) {
      try {
        name = decodeURIComponent(match[1]);
      } catch {
        name = match[1];
      }
    }
  }
  if (!name) name = 'spend-wisely-export';

  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(href), 15000);
  return name;
}
