import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Supabase client for browser-side operations
 * Uses the anon key for public access with RLS policies
 */
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
  realtime: {
    params: {
      eventsPerSecond: 40, // High frequency for spreadsheet updates
    },
  },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Get a typed Supabase client
 */
export function getSupabaseClient() {
  return supabase;
}

