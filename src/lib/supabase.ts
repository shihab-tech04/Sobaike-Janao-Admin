import { createClient, SupabaseClient } from '@supabase/supabase-js';

const FALLBACK_SUPABASE_URL =
  'https://ahiaymyqfmyyrjkwgvhi.supabase.co';

const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  'sb_publishable_3wqaYyxPJ6spRNS0jNOi4w_69Jqc3-b';

const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const supabaseUrl =
  metaEnv?.VITE_SUPABASE_URL ||
  FALLBACK_SUPABASE_URL;

const supabaseAnonKey =
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv?.VITE_SUPABASE_ANON_KEY ||
  FALLBACK_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  metaEnv?.VITE_SUPABASE_URL &&
  (metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY || metaEnv?.VITE_SUPABASE_ANON_KEY)
);

/**
 * Singleton Supabase Client for Sobaike Admin Operations.
 * Configured with browser session persistence and auto token refresh.
 */
export const supabase: SupabaseClient = createClient(
  supabaseUrl,
  supabaseAnonKey,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    },
  }
);

export default supabase;
