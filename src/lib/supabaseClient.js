import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta?.env?.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta?.env?.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  // The app can still render, but auth features will be disabled without envs
  // We intentionally avoid throwing to allow static pages to work in preview
  console.warn('[Auth] Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY envs. Login will be disabled.');
}

export const supabase = SUPABASE_URL && SUPABASE_ANON_KEY
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : undefined;
