import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';

const AuthContext = createContext({
  isReady: false,
  session: undefined,
  user: undefined,
  profile: undefined,
  role: undefined,
  signIn: async () => { throw new Error('Auth not initialized'); },
  signOut: async () => { throw new Error('Auth not initialized'); },
});

// Sistema de recuperação de sessão mais robusto
let sessionRecoveryAttempts = 0;
const MAX_RECOVERY_ATTEMPTS = 3;
let recoveryInProgress = false;

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState();
  const [profile, setProfile] = useState();
  const [connectionStatus, setConnectionStatus] = useState('online');

  // Função para recuperação robusta de sessão
  const recoverSession = useCallback(async () => {
    if (recoveryInProgress || sessionRecoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
      return null;
    }

    recoveryInProgress = true;
    sessionRecoveryAttempts++;

    try {
      console.log(`[Auth] Tentativa de recuperação ${sessionRecoveryAttempts}/${MAX_RECOVERY_ATTEMPTS}`);
      
      // Primeiro, tenta obter a sessão atual
      const { data: { session: currentSession }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.warn('[Auth] Erro ao obter sessão:', error);
        return null;
      }

      if (currentSession) {
        console.log('[Auth] Sessão recuperada com sucesso');
        sessionRecoveryAttempts = 0; // Reset counter on success
        return currentSession;
      }

      // Se não há sessão, tenta refresh se há refresh token no storage
      const storedSession = localStorage.getItem('oficina-auth-v2');
      if (storedSession) {
        try {
          const parsed = JSON.parse(storedSession);
          if (parsed.refresh_token) {
            console.log('[Auth] Tentando refresh com token armazenado');
            const { data, error: refreshError } = await supabase.auth.refreshSession({
              refresh_token: parsed.refresh_token
            });
            
            if (!refreshError && data.session) {
              console.log('[Auth] Refresh bem-sucedido');
              sessionRecoveryAttempts = 0;
              return data.session;
            }
          }
        } catch (parseError) {
          console.warn('[Auth] Erro ao parsear sessão armazenada:', parseError);
        }
      }

      return null;
    } catch (error) {
      console.warn('[Auth] Erro na recuperação de sessão:', error);
      return null;
    } finally {
      recoveryInProgress = false;
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    let mounted = true;
    let authListener = null;

    const init = async () => {
      try {
        // Primeira tentativa: obter sessão atual
        let currentSession = null;
        
        try {
          const { data: { session } } = await supabase.auth.getSession();
          currentSession = session;
        } catch (getSessionError) {
          console.warn('[Auth] Erro ao obter sessão inicial:', getSessionError);
          // Tenta recuperar
          currentSession = await recoverSession();
        }

        if (!mounted) return;
        
        setSession(currentSession || undefined);

        if (currentSession?.user?.id) {
          await loadProfile(currentSession.user.id);
        }
      } catch (e) {
        console.warn('[Auth] init failed:', e?.message || e);
        // Em caso de erro, tenta recuperação
        if (mounted) {
          const recoveredSession = await recoverSession();
          if (recoveredSession) {
            setSession(recoveredSession);
            if (recoveredSession.user?.id) {
              await loadProfile(recoveredSession.user.id);
            }
          }
        }
      } finally {
        if (mounted) setIsReady(true);
      }
    };

    // Set up auth state listener with better error handling
    const setupAuthListener = () => {
      try {
        const { data: listener } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (!mounted) return;
          
          console.log('[Auth] State change:', event, !!newSession);
          
          // Reset recovery attempts on successful events
          if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
            sessionRecoveryAttempts = 0;
          }
          
          // Handle different auth events
          if (event === 'SIGNED_OUT') {
            setSession(undefined);
            setProfile(undefined);
            sessionRecoveryAttempts = 0;
          } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
            setSession(newSession || undefined);
            if (newSession?.user?.id) {
              await loadProfile(newSession.user.id);
            }
          } else {
            setSession(newSession || undefined);
            if (newSession?.user?.id) {
              await loadProfile(newSession.user.id);
            } else {
              setProfile(undefined);
            }
          }
        });
        authListener = listener;
      } catch (e) {
        console.warn('[Auth] Failed to setup listener:', e);
      }
    };

    // Safety: ensure readiness even if init hangs for any reason
    const readyTimeout = setTimeout(() => {
      if (mounted) setIsReady(true);
    }, 5000);

    init();
    setupAuthListener();

    return () => {
      mounted = false;
      clearTimeout(readyTimeout);
      if (authListener?.subscription?.unsubscribe) {
        try {
          authListener.subscription.unsubscribe();
        } catch (e) {
          console.warn('[Auth] Failed to unsubscribe listener:', e);
        }
      }
    };
  }, [recoverSession]);

  // Sistema de manutenção de sessão otimizado - UMA única verificação centralizada
  useEffect(() => {
    if (!session || !supabase) return;

    let keepAliveInterval;
    let isRefreshing = false;

    const maintainSession = async () => {
      // Evita múltiplas execuções simultâneas
      if (isRefreshing) return;
      isRefreshing = true;

      try {
        // Verifica conectividade primeiro
        const online = navigator.onLine;
        setConnectionStatus(online ? 'online' : 'offline');
        
        if (!online) {
          console.log('[Auth] Offline - pulando manutenção de sessão');
          return;
        }

        console.log('[Auth] Verificando e mantendo sessão...');
        
        // Tenta refresh da sessão
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.warn('[Auth] Erro no refresh, tentando recuperar:', error.message);
          const recovered = await recoverSession();
          if (!recovered) {
            console.warn('[Auth] Não foi possível recuperar a sessão');
          } else {
            console.log('[Auth] Sessão recuperada com sucesso');
            sessionRecoveryAttempts = 0;
          }
        } else {
          console.log('[Auth] Sessão mantida com sucesso');
          sessionRecoveryAttempts = 0;
        }
      } catch (e) {
        console.warn('[Auth] Erro na manutenção de sessão:', e.message);
        await recoverSession();
      } finally {
        isRefreshing = false;
      }
    };

    // ÚNICO intervalo - a cada 15 minutos (muito mais eficiente)
    keepAliveInterval = setInterval(maintainSession, 15 * 60 * 1000);

    // Listeners para eventos de rede (mais eficientes)
    const handleOnline = () => {
      console.log('[Auth] Rede restaurada');
      setConnectionStatus('online');
      // Executa manutenção após reconectar (com delay para estabilizar)
      setTimeout(maintainSession, 2000);
    };

    const handleOffline = () => {
      console.log('[Auth] Rede perdida');
      setConnectionStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Executa manutenção inicial (com delay para evitar conflitos)
    setTimeout(maintainSession, 5000);

    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session, recoverSession]);

  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, user_id, full_name, role')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      setProfile(data || undefined);
    } catch (e) {
      console.warn('[Auth] Failed to load profile:', e?.message || e);
      setProfile(undefined);
    }
  };

  const signIn = async ({ email, password }) => {
    if (!supabase) throw new Error('Auth not configured');
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    // After successful login, try admin bootstrap once
    try {
      const token = data?.session?.access_token;
      const userId = data?.session?.user?.id;
      if (token) {
        const res = await fetch('/api/admin/bootstrap', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => undefined);
        if (res && res.ok) {
          const result = await res.json().catch(() => undefined);
          if (result?.promoted && userId) {
            await loadProfile(userId);
          }
        }
      }
    } catch (_) {}
    return data;
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const value = useMemo(() => ({
    isReady,
    session,
    user: session?.user,
    profile,
    role: profile?.role ?? 'operator',
    token: session?.access_token,
    connectionStatus,
    signIn,
    signOut,
  }), [isReady, session, profile, connectionStatus]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
