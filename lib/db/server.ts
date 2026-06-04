import { createClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client using SERVICE_ROLE_KEY.
 * NEVER import this from a client component.
 */
export function getServerSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key);
}
