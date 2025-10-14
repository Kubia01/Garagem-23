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
      const {
        data: { session: currentSession },
      } = await supabase.auth.getSession();
      if (!mounted) return;
      setSession(currentSession || undefined);

      if (currentSession?.user?.id) {
        await loadProfile(currentSession.user.id);
      }
      setIsReady(true);
    };

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession || undefined);
      if (newSession?.user?.id) {
        await loadProfile(newSession.user.id);
      } else {
        setProfile(undefined);
      }
    });

    init();

    return () => {
      mounted = false;
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
