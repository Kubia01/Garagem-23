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

  useEffect(() => {
    if (!supabase) {
      setIsReady(true);
      return;
    }

    let mounted = true;

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

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession || undefined);
      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(undefined);
      }
    });

    // Safety: ensure readiness even if init hangs for any reason
    const readyTimeout = setTimeout(() => {
      if (mounted) setIsReady(true);
    }, 2000);

    init();

    return () => {
      mounted = false;
      clearTimeout(readyTimeout);
      listener?.subscription?.unsubscribe?.();
    };
  }, []);

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
