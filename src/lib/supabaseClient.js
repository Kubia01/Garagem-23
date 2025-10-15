import { createClient } from '@supabase/supabase-js';
import { AUTH_CONFIG } from '@/config/auth';

// IMPORTANT: use direct access to import.meta.env so Vite can inline values at build time
const { VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY } = import.meta.env;

if (!VITE_SUPABASE_URL || !VITE_SUPABASE_ANON_KEY) {
  // The app can still render, but auth features will be disabled without envs
  // We intentionally avoid throwing to allow static pages to work in preview
  console.warn('[Auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY envs. Login will be disabled.');
}

export const supabase = VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY
  ? createClient(VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, AUTH_CONFIG.SUPABASE_OPTIONS)
  : undefined;
