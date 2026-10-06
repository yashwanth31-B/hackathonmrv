import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// ---------------------------------------------------------------------------
// Environment variable validation
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '❌  Missing required environment variables: SUPABASE_URL and SUPABASE_ANON_KEY must be set.'
  );
}

// ---------------------------------------------------------------------------
// Public (anon) client – honours Row-Level Security (RLS) policies
// Use for any request where the caller is an end-user / citizen.
// ---------------------------------------------------------------------------
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,   // server-side: no browser storage
    detectSessionInUrl: false
  }
});

// ---------------------------------------------------------------------------
// Admin (service-role) client – bypasses RLS
// Use only for backend-internal operations (agents, seed scripts, migrations).
// ---------------------------------------------------------------------------
export const supabaseAdmin = SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })
  : supabase; // fallback to anon client during early development

// ---------------------------------------------------------------------------
// Helper: run a query and throw on error so callers get a clean async/await
// ---------------------------------------------------------------------------
export async function dbQuery(queryFn) {
  const { data, error } = await queryFn;
  if (error) {
    const dbError = new Error(error.message);
    dbError.statusCode = 400;
    dbError.details = error.details;
    throw dbError;
  }
  return data;
}

// ---------------------------------------------------------------------------
// Connection health-check – call once at server startup
// ---------------------------------------------------------------------------
export async function checkConnection() {
  try {
    const { error } = await supabaseAdmin
      .from('users')
      .select('id')
      .limit(1);

    if (error) {
      console.warn('⚠️  Supabase connection check warning:', error.message);
      return false;
    }
    console.log('✅  Supabase connection verified.');
    return true;
  } catch (err) {
    console.warn('⚠️  Supabase connection check failed:', err.message);
    return false;
  }
}

export default supabase;
