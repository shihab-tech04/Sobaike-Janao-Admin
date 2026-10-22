import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Unconfigured recovery previews must fail closed and must never inherit a
// production Supabase URL. The reserved .invalid hostname cannot resolve.
const DISABLED_SUPABASE_URL =
  'https://sobaike-backend-not-configured.invalid';

const DISABLED_SUPABASE_PUBLISHABLE_KEY =
  'recovery-preview-backend-disabled';

const metaEnv = typeof import.meta !== 'undefined' ? import.meta.env : undefined;

const supabaseUrl =
  metaEnv?.VITE_SUPABASE_URL?.trim() ||
  DISABLED_SUPABASE_URL;

const supabaseAnonKey =
  metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ||
  metaEnv?.VITE_SUPABASE_ANON_KEY?.trim() ||
  DISABLED_SUPABASE_PUBLISHABLE_KEY;

export const isSupabaseConfigured = Boolean(
  metaEnv?.VITE_SUPABASE_URL?.trim() &&
  (metaEnv?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() || metaEnv?.VITE_SUPABASE_ANON_KEY?.trim())
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
