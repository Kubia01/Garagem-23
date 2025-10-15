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

// Client-side request timeout (ms) - timeout generoso para evitar falhas
const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_API_REQUEST_TIMEOUT_MS || 120000);

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
      // Sistema robusto para obter token com fallback
      try {
        let accessToken = null;
        
        // Primeira tentativa: sessão atual
        try {
          const { data } = await supabase.auth.getSession();
          accessToken = data?.session?.access_token;
        } catch (sessionError) {
          console.warn('[API] Erro ao obter sessão, tentando recuperar:', sessionError);
          
          // Segunda tentativa: refresh da sessão
          try {
            const { data: refreshData } = await supabase.auth.refreshSession();
            accessToken = refreshData?.session?.access_token;
          } catch (refreshError) {
            console.warn('[API] Erro no refresh, tentando storage:', refreshError);
            
            // Terceira tentativa: token do localStorage
            try {
              const storedSession = localStorage.getItem('oficina-auth-v2');
              if (storedSession) {
                const parsed = JSON.parse(storedSession);
                accessToken = parsed.access_token;
              }
            } catch (storageError) {
              console.warn('[API] Erro ao acessar storage:', storageError);
            }
          }
        }
        
        if (accessToken) {
          headers['Authorization'] = `Bearer ${accessToken}`;
        } else {
          console.warn('[API] Nenhum token disponível');
        }
      } catch (e) {
        console.warn('[API] Erro crítico ao obter token:', e);
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

    // Para 401, tenta múltiplas estratégias de recuperação antes de deslogar
    if (status === 401 && supabase) {
      console.log('[API] Token inválido (401), tentando recuperar...');
      
      try {
        let newToken = null;
        
        // Estratégia 1: Refresh da sessão atual
        if (!tokenRefreshPromise) {
          tokenRefreshPromise = supabase.auth
            .refreshSession()
            .then(result => {
              console.log('[API] Resultado do refresh:', !!result?.data?.session);
              return result;
            })
            .catch(error => {
              console.warn('[API] Refresh falhou:', error);
              return null;
            })
            .finally(() => { 
              tokenRefreshPromise = null; 
            });
        }
        
        const refreshResult = await tokenRefreshPromise;
        
        if (refreshResult?.data?.session?.access_token) {
          newToken = refreshResult.data.session.access_token;
          console.log('[API] Token recuperado via refresh');
        } else {
          // Estratégia 2: Tentar obter nova sessão
          console.log('[API] Refresh falhou, tentando obter nova sessão...');
          try {
            const { data: sessionData } = await supabase.auth.getSession();
            if (sessionData?.session?.access_token) {
              newToken = sessionData.session.access_token;
              console.log('[API] Token recuperado via getSession');
            }
          } catch (sessionError) {
            console.warn('[API] getSession falhou:', sessionError);
            
            // Estratégia 3: Tentar recuperar do localStorage e fazer refresh
            try {
              const storedSession = localStorage.getItem('oficina-auth-v2');
              if (storedSession) {
                const parsed = JSON.parse(storedSession);
                if (parsed.refresh_token) {
                  console.log('[API] Tentando refresh com token do storage...');
                  const { data: storageRefreshData } = await supabase.auth.refreshSession({
                    refresh_token: parsed.refresh_token
                  });
                  if (storageRefreshData?.session?.access_token) {
                    newToken = storageRefreshData.session.access_token;
                    console.log('[API] Token recuperado via storage refresh');
                  }
                }
              }
            } catch (storageError) {
              console.warn('[API] Recuperação via storage falhou:', storageError);
            }
          }
        }
        
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
            console.log('[API] Requisição bem-sucedida após recuperação de token');
            const ct = response.headers.get('content-type') || '';
            if (ct.includes('application/json')) return response.json();
            // If server returned HTML due to mis-route, treat as error
            throw new Error('invalid_content_type');
          } else {
            console.warn('[API] Requisição falhou mesmo com novo token:', response.status);
          }
        } else {
          console.warn('[API] Não foi possível recuperar token válido');
        }
      } catch (recoveryError) {
        console.warn('[API] Erro na recuperação de token:', recoveryError);
      }

      // Só desloga se realmente não conseguiu recuperar E não está na página de login
      if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
        console.log('[API] Todas as tentativas de recuperação falharam, redirecionando para login...');
        try { 
          await supabase.auth.signOut(); 
        } catch (signOutError) {
          console.warn('[API] Sign out failed:', signOutError);
        }
        // Aguarda um pouco antes de redirecionar para dar tempo de outras recuperações
        setTimeout(() => {
          if (!window.location.pathname.startsWith('/login')) {
            window.location.assign('/login');
          }
        }, 1000);
        return; // Não continua com o erro
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
