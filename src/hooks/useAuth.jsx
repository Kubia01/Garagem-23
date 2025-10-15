import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
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

export function AuthProvider({ children }) {
  const [isReady, setIsReady] = useState(false);
  const [session, setSession] = useState();
  const [profile, setProfile] = useState();
  const [lastActivity, setLastActivity] = useState(Date.now());

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    let mounted = true;
    let authListener = null;

    const init = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(currentSession || undefined);

        if (currentSession?.user?.id) {
          await loadProfile(currentSession.user.id);
        }
      } catch (e) {
        console.warn('[Auth] init failed:', e?.message || e);
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
          
          // Handle different auth events
          if (event === 'SIGNED_OUT') {
            setSession(undefined);
            setProfile(undefined);
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
    }, 3000);

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
  }, []);

  // Sessão ilimitada - mantém a sessão sempre ativa
  useEffect(() => {
    if (!session || !supabase) return;

    let keepAliveInterval;

    const keepSessionAlive = async () => {
      try {
        // Refresh da sessão a cada 5 minutos para manter sempre ativa
        await supabase.auth.refreshSession();
      } catch (e) {
        console.warn('[Auth] Failed to refresh session:', e);
      }
    };

    // Refresh automático a cada 5 minutos
    keepAliveInterval = setInterval(keepSessionAlive, 5 * 60 * 1000);

    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
    };
  }, [session]);

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
    signIn,
    signOut,
  }), [isReady, session, profile]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
