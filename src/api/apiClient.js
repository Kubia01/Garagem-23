// Generic API client for provider-agnostic REST backends

// Use direct import.meta.env access so Vite replaces at build time
import { supabase } from '@/lib/supabaseClient';
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
let RESOURCE_MAP = {};
try {
  RESOURCE_MAP = JSON.parse(import.meta.env.VITE_API_RESOURCE_MAP || '{}');
} catch (_) {
  RESOURCE_MAP = {};
}

const AUTH_HEADER = import.meta.env.VITE_API_AUTH_HEADER;
const AUTH_VALUE = import.meta.env.VITE_API_AUTH_VALUE;
const TOKEN = import.meta.env.VITE_API_TOKEN;

async function request(method, path, { query, body, headers: extraHeaders } = {}) {
  const base = API_BASE_URL || '';
  const url = new URL(`${base}${path}` || path, window.location.origin);
  if (query && typeof query === 'object') {
    Object.entries(query).forEach(([key, value]) => {
      if (value === undefined || value === null || value === '') return;
      url.searchParams.set(key, String(value));
    });
  }

  const headers = { 'Content-Type': 'application/json' };
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

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API ${method} ${url.pathname} failed: ${response.status} ${response.statusText} ${text}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    return response.json();
  }
  return undefined;
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
