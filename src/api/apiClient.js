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

// Client-side request timeout (ms) - timeout otimizado
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || 30000);

// Ensure only one refresh runs at a time
let tokenRefreshPromise = null;

function withTimeout(fetchPromise, timeoutMs) {
  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), timeoutMs);
  return fetchPromise(controller.signal)
    .finally(() => clearTimeout(timerId));
}

// Retry simples para erros de rede
async function retryWithBackoff(fn, maxRetries = 2, baseDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries - 1;
      const isRetryableError = error?.name === 'AbortError' || 
                               error?.message === 'request_timeout';
      
      if (isLastAttempt || !isRetryableError) {
        throw error;
      }
      
      const delay = baseDelay * (attempt + 1);
      console.warn(`[API] Tentativa ${attempt + 1} falhou, retry em ${delay}ms`);
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
      // Obtenção simples e eficiente de token
      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data?.session?.access_token;
        
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
          console.warn('[API] Nenhum token disponível');
        }
      } catch (e) {
        console.warn('[API] Erro ao obter token:', e.message);
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

    // Para 401, tenta UMA recuperação simples antes de deslogar
    if (status === 401 && supabase) {
      console.log('[API] Token inválido (401), tentando recuperar uma vez...');
      
      try {
        let newToken = null;
        
        // Estratégia única e simples: refresh da sessão atual
        if (!tokenRefreshPromise) {
          tokenRefreshPromise = supabase.auth
            .refreshSession()
            .then(result => {
              console.log('[API] Refresh result:', !!result?.data?.session);
              return result?.data?.session?.access_token || null;
            })
            .catch(error => {
              console.warn('[API] Refresh failed:', error.message);
              return null;
            })
            .finally(() => { 
              tokenRefreshPromise = null; 
            });
        }
        
        newToken = await tokenRefreshPromise;
        
        // Se conseguiu um novo token, tenta a requisição novamente
        if (newToken) {
          console.log('[API] Tentando requisição com novo token...');
          const retryHeaders = { ...headers };
          retryHeaders['Authorization'] = `Bearer ${newToken}`;

          response = await doFetch(url.toString(), {
            method,
            headers: retryHeaders,
            body: body ? JSON.stringify(body) : undefined,
          }, timeoutMs);

          if (response.ok) {
            console.log('[API] Requisição bem-sucedida após recuperação');
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) return response.json();
            throw new Error('invalid_content_type');
          }
        }
      } catch (recoveryError) {
        console.warn('[API] Erro na recuperação:', recoveryError.message);
      }

      // Se chegou aqui, a recuperação falhou - desloga apenas se não estiver no login
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        console.log('[API] Recuperação falhou, redirecionando para login...');
        try { 
          await supabase.auth.signOut(); 
        } catch (signOutError) {
          console.warn('[API] Sign out failed:', signOutError);
        }
        setTimeout(() => {
          if (!window.location.pathname.startsWith('/login')) {
            window.location.assign('/login');
          }
        }, 2000);
        return;
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
