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

  // Sistema de manutenção de sessão 24/7 com múltiplas camadas de proteção
  useEffect(() => {
    if (!session || !supabase) return;

    let keepAliveInterval;
    let healthCheckInterval;
    let networkCheckInterval;

    const keepSessionAlive = async () => {
      try {
        console.log('[Auth] Mantendo sessão ativa...');
        const { data, error } = await supabase.auth.refreshSession();
        
        if (error) {
          console.warn('[Auth] Erro no refresh:', error);
          // Tenta recuperar a sessão
          const recovered = await recoverSession();
          if (!recovered) {
            console.warn('[Auth] Não foi possível recuperar a sessão');
          }
        } else {
          console.log('[Auth] Sessão renovada com sucesso');
          sessionRecoveryAttempts = 0; // Reset counter on success
        }
      } catch (e) {
        console.warn('[Auth] Erro crítico no keep alive:', e);
        // Tenta recuperação em caso de erro crítico
        await recoverSession();
      }
    };

    const healthCheck = async () => {
      try {
        // Verifica se a sessão ainda é válida
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        
        if (!currentSession && session) {
          console.warn('[Auth] Sessão perdida detectada, tentando recuperar...');
          await recoverSession();
        }
      } catch (e) {
        console.warn('[Auth] Erro no health check:', e);
      }
    };

    const checkNetworkAndRecover = async () => {
      try {
        // Verifica conectividade
        const online = navigator.onLine;
        setConnectionStatus(online ? 'online' : 'offline');
        
        if (online && session) {
          // Se voltou online, força um refresh preventivo
          await keepSessionAlive();
        }
      } catch (e) {
        console.warn('[Auth] Erro na verificação de rede:', e);
      }
    };

    // Múltiplos intervalos para garantir funcionamento 24/7:
    
    // 1. Keep alive principal - a cada 3 minutos
    keepAliveInterval = setInterval(keepSessionAlive, 3 * 60 * 1000);
    
    // 2. Health check - a cada 1 minuto
    healthCheckInterval = setInterval(healthCheck, 60 * 1000);
    
    // 3. Network check - a cada 30 segundos
    networkCheckInterval = setInterval(checkNetworkAndRecover, 30 * 1000);

    // Listeners para eventos de rede
    const handleOnline = () => {
      console.log('[Auth] Rede restaurada, renovando sessão...');
      setConnectionStatus('online');
      keepSessionAlive();
    };

    const handleOffline = () => {
      console.log('[Auth] Rede perdida');
      setConnectionStatus('offline');
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Executa um keep alive imediato
    keepSessionAlive();

    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      if (healthCheckInterval) clearInterval(healthCheckInterval);
      if (networkCheckInterval) clearInterval(networkCheckInterval);
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
