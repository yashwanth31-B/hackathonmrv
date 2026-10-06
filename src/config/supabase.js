import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  console.warn('⚠️  [Supabase Config Warning] SUPABASE_URL environment variable is missing.');
}

if (!supabaseAnonKey && !supabaseServiceRoleKey) {
  console.warn('⚠️  [Supabase Config Warning] Neither SUPABASE_ANON_KEY nor SUPABASE_SERVICE_ROLE_KEY is defined.');
}

/**
 * Standard Supabase client using Anon key.
 * Adheres to Row Level Security (RLS) policies.
 */
export const supabase = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseAnonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

/**
 * Privileged Admin Supabase client using Service Role key.
 * Bypasses RLS for autonomous agent worker operations (clustering, dispatch, escalation).
 */
export const supabaseAdmin = createClient(
  supabaseUrl || 'https://placeholder.supabase.co',
  supabaseServiceRoleKey || supabaseAnonKey || 'placeholder-service-key',
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export default supabase;
