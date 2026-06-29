import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL?.replace(/\/$/, "") ?? "";
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

/** True when Vercel/local env has Supabase URL + anon key (cloud auth ready). */
export const isSupabaseConfigured = Boolean(url && anonKey);

/** Browser Supabase client; null when running offline without env vars. */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(url, anonKey)
  : null;

export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }
  return supabase;
}
