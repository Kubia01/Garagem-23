/**
 * Authentication configuration
 * This file contains settings to ensure sessions never timeout
 */

export const AUTH_CONFIG = {
  // Disable all session timeouts
  SESSION_TIMEOUT_DISABLED: true,
  
  // Aggressive refresh intervals (in milliseconds)
  SESSION_REFRESH_INTERVAL: 30 * 1000, // 30 seconds
  HEALTH_CHECK_INTERVAL: 2 * 60 * 1000, // 2 minutes
  
  // Token refresh threshold (refresh when less than this many seconds remain)
  TOKEN_REFRESH_THRESHOLD: 600, // 10 minutes
  
  // Request timeout (increased to prevent premature failures)
  REQUEST_TIMEOUT: 120 * 1000, // 2 minutes
  
  // Network check interval
  NETWORK_CHECK_INTERVAL: 60 * 1000, // 1 minute
  
  // Supabase client options for unlimited sessions
  SUPABASE_OPTIONS: {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'oficina-auth',
      // Refresh token very early to prevent expiry
      refreshThreshold: 300, // 5 minutes before expiry
    },
  },
};