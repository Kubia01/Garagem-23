import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { AUTH_CONFIG } from '@/config/auth';

/**
 * Hook to keep the session alive indefinitely
 * This prevents any session timeouts or UI freezing
 */
export function useSessionKeepAlive() {
  useEffect(() => {
    if (!supabase || !AUTH_CONFIG.SESSION_TIMEOUT_DISABLED) return;

    let keepAliveInterval;

    // Keep session alive by periodically refreshing it
    const keepSessionAlive = async () => {
      try {
        const { data: currentSession } = await supabase.auth.getSession();
        if (currentSession?.session) {
          // Refresh the session to extend its lifetime
          await supabase.auth.refreshSession();
          console.log('[SessionKeepAlive] Session refreshed successfully');
        }
      } catch (error) {
        console.warn('[SessionKeepAlive] Failed to refresh session:', error);
      }
    };

    // Use configured interval for session refresh
    keepAliveInterval = setInterval(keepSessionAlive, AUTH_CONFIG.SESSION_REFRESH_INTERVAL);

    // Also refresh on visibility change (when user returns to tab)
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        keepSessionAlive();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial refresh
    keepSessionAlive();

    return () => {
      if (keepAliveInterval) clearInterval(keepAliveInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);
}