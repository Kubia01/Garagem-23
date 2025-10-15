import { useEffect, useRef } from 'react';
import { useAuth } from './useAuth';

export function useNetworkRecovery() {
  const { session } = useAuth();
  const wasOffline = useRef(false);
  
  useEffect(() => {
    const handleOnline = async () => {
      if (wasOffline.current && session) {
        console.log('[NetworkRecovery] Connection restored, refreshing session...');
        
        try {
          // Try to refresh the session when coming back online
          const { supabase } = await import('@/lib/supabaseClient');
          if (supabase?.supabase) {
            await supabase.supabase.auth.refreshSession();
          }
        } catch (error) {
          console.warn('[NetworkRecovery] Failed to refresh session:', error);
        }
        
        wasOffline.current = false;
      }
    };
    
    const handleOffline = () => {
      wasOffline.current = true;
      console.log('[NetworkRecovery] Connection lost');
    };
    
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session]);
}