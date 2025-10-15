// Generic API client for provider-agnostic REST backends

// Use direct import.meta.env access so Vite replaces at build time
import { supabase } from '@/lib/supabaseClient';
import { AUTH_CONFIG } from '@/config/auth';

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

// Client-side request timeout (ms) - Use configuration to prevent premature timeouts
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || AUTH_CONFIG.REQUEST_TIMEOUT);

// Ensure only one refresh runs at a time
let tokenRefreshPromise = null;

function withTimeout(fetchPromise, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetchPromise(controller.signal)
    .finally(() => clearTimeout(timerId));
}

// Exponential backoff retry for network errors
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryableError = error?.name === 'AbortError' || 
                               error?.message === 'request_timeout' ||
                               (error?.message && error.message.includes('fetch'));
      
      if (isLastAttempt || !isRetryableError) {
        throw error;
      }
      
      const delay = baseDelay * Math.pow(2, attempt) + Math.random() * 1000;
      console.warn(`[API] Request failed (attempt ${attempt + 1}), retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}

async function doFetch(url, options, timeoutMs) {
  const exec = (signal) => fetch(url, { ...options, signal });
  
  return retryWithBackoff(async () => {
    try {
      return await withTimeout(exec, timeoutMs || REQUEST_TIMEOUT_MS);
    } catch (e) {
      if (e?.name === 'AbortError') {
        throw new Error('request_timeout');
      }
      throw e;
    }
  });
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
      // Always try to refresh session before making requests to prevent token expiry
      try {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session?.access_token) {
          // Check if token is close to expiry
          const expiresAt = currentSession.session.expires_at;
          const now = Math.floor(Date.now() / 1000);
          const timeUntilExpiry = expiresAt - now;
          
          if (timeUntilExpiry < AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD) {
            console.log('[API] Token expires soon, refreshing...');
            const { data: refreshedSession } = await supabase.auth.refreshSession();
            if (refreshedSession?.session?.access_token) {
              headers['Authorization'] = `Bearer ${refreshedSession.session.access_token}`;
            } else {
              headers['Authorization'] = `Bearer ${currentSession.session.access_token}`;
            }
          } else {
            headers['Authorization'] = `Bearer ${currentSession.session.access_token}`;
          }
        }
      } catch (e) {
        console.warn('[API] Failed to check/refresh session:', e);
        // Fallback to getting current session
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;
        if (accessToken) headers['Authorization'] = `Bearer ${accessToken}`;
      }
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
        // Ensure only one refresh attempt runs concurrently
        if (!tokenRefreshPromise) {
          tokenRefreshPromise = supabase.auth
            .refreshSession()
            .catch(() => null)
            .finally(() => { 
              tokenRefreshPromise = null; 
            });
        }
        
        const refreshResult = await tokenRefreshPromise;
        
        // Only retry if refresh was successful
        if (refreshResult && refreshResult.data?.session?.access_token) {
          const retryHeaders = { ...headers };
          retryHeaders['Authorization'] = `Bearer ${refreshResult.data.session.access_token}`;

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
        }
      } catch (refreshError) {
        console.warn('[API] Token refresh failed:', refreshError);
        // fall through to sign-out below
      }

      // Only sign out if we're not already on the login page
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        try { 
          await supabase.auth.signOut(); 
          window.location.assign('/login'); 
        } catch (signOutError) {
          console.warn('[API] Sign out failed:', signOutError);
          // Force redirect even if signOut fails
          window.location.assign('/login');
        }
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
