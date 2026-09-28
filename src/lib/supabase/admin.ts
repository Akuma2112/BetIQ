import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role client: bypasses RLS. Only for cron routes and local scripts —
 * never import from a Client Component.
 */
export function createAdminClient(url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SECRET_KEY): SupabaseClient {
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
