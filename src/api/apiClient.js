// Generic API client for provider-agnostic REST backends

// Use direct import.meta.env access so Vite replaces at build time
import { supabase } from '@/lib/supabaseClient';

// Base URL and mapping
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let RESOURCE_MAP = {};
try {
  RESOURCE_MAP = JSON.parse(import.meta.env.VITE_API_RESOURCE_MAP || '{}');
} catch (_) {
  RESOURCE_MAP = {};
}

// Optional custom auth header/value and static token
const AUTH_HEADER = import.meta.env.VITE_API_AUTH_HEADER;
const AUTH_VALUE = import.meta.env.VITE_API_AUTH_VALUE;
const TOKEN = import.meta.env.VITE_API_TOKEN;

// Client-side request timeout (ms)
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || 20000);

// Ensure only one refresh runs at a time
let tokenRefreshPromise = null;

function withTimeout(fetchPromise, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetchPromise(controller.signal)
    .finally(() => clearTimeout(timerId));
}

async function doFetch(url, options, timeoutMs) {
  const exec = (signal) => fetch(url, { ...options, signal });
  try {
    return await withTimeout(exec, timeoutMs || REQUEST_TIMEOUT_MS);
  } catch (e) {
    if (e?.name === 'AbortError') {
      throw new Error('request_timeout');
    }
    throw e;
  }
}

async function request(method, path, { query, body, headers: extraHeaders, timeoutMs } = {}) {
  const base = API_BASE_URL || '';
  const url = new URL(`${base}${path}` || path, window.location.origin);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' };
  if (AUTH_HEADER && AUTH_VALUE) headers[AUTH_HEADER] = AUTH_VALUE;
  if (extraHeaders && typeof extraHeaders === 'object') {
    Object.assign(headers, extraHeaders);
  }
  // Only add Authorization automatically if caller did not provide one
  if (!headers['Authorization']) {
    if (TOKEN) {
      headers['Authorization'] = `Bearer ${TOKEN}`;
    } else if (supabase) {
      const { data } = await supabase.auth.getSession();
      const accessToken = data?.session?.access_token;
      if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
    }
  }

  let response = await doFetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  }, timeoutMs);

  if (!response.ok) {
    const status = response.status;
    const text = await response.text().catch(() => '');

    // For 401, attempt one silent token refresh + retry before forcing logout
    if (status === 401 && supabase) {
      try {
        if (!tokenRefreshPromise) {
          tokenRefreshPromise = supabase.auth.refreshSession()
            .catch(() => null)
            .finally(() => { tokenRefreshPromise = null; });
        }
        await tokenRefreshPromise;

        // Rebuild headers with possibly updated access token
        const retryHeaders = { ...headers };
        if (!retryHeaders['Authorization']) {
          const { data: after } = await supabase.auth.getSession();
          const retryAccess = after?.session?.access_token;
          if (retryAccess) retryHeaders['Authorization'] = `Bearer ${retryAccess}`;
        }

        response = await doFetch(url.toString(), {
          method,
          headers: retryHeaders,
          body: body ? JSON.stringify(body) : undefined,
        }, timeoutMs);

        if (response.ok) {
          const ct = response.headers.get('content-type') || '';
          if (ct.includes('application/json')) return response.json();
          // If server returned HTML due to mis-route, treat as error
          throw new Error('invalid_content_type');
        }
      } catch (_) {
        // fall through to sign-out below
      }

      try { await supabase.auth.signOut(); } catch (_) {}
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        try { window.location.assign('/login'); } catch (_) {}
      }
    }
    throw new Error(`API ${method} ${url.pathname} failed: ${status} ${response.statusText} ${text}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  // Try to parse JSON even if header is missing; otherwise error
  try {
    return await response.json();
  } catch (_) {
    throw new Error('invalid_content_type');
  }
}

function buildQuery(criteria, sort) {
  const query = { ...(criteria || {}) };
  if (sort) query.sort = sort;
  return query;
}

export function createEntityApi(resourceName) {
  const mappedName = RESOURCE_MAP[resourceName] || resourceName;
  const resourcePath = `/${mappedName}`;

  return {
    async list(sort, options) {
      const query = buildQuery(undefined, sort);
      return request('GET', resourcePath, { query, ...(options || {}) });
    },

    async filter(criteria, sort, options) {
      const query = buildQuery(criteria, sort);
      return request('GET', resourcePath, { query, ...(options || {}) });
    },

    async create(payload, options) {
      return request('POST', resourcePath, { body: payload, ...(options || {}) });
    },

    async update(id, payload, options) {
      if (!id) throw new Error(`update requires a valid id for ${resourceName}`);
      return request('PUT', `${resourcePath}/${id}`, { body: payload, ...(options || {}) });
    },

    async delete(id, options) {
      if (!id) throw new Error(`delete requires a valid id for ${resourceName}`);
      return request('DELETE', `${resourcePath}/${id}`, { ...(options || {}) });
    },
  };
}

export const apiClient = {
  request,
  createEntityApi,
};
