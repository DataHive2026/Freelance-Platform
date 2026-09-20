import { createClient } from "@supabase/supabase-js";

/**
 * Uses SUPABASE_SERVICE_ROLE_KEY, which bypasses Row Level Security
 * entirely. This is deliberate, not a shortcut: for Storage operations
 * (signed upload/download URLs, deletes), duplicating AuthzService's
 * authorization logic as Storage RLS policies keyed to project
 * membership would mean maintaining the same rule in two places that
 * could silently drift apart. Instead, FileService calls
 * AuthzService.can() itself (the real gate) and only reaches for this
 * client AFTER that check passes.
 *
 * NEVER import this into a Server Action, Route Handler, or Client
 * Component directly — only into a service file that has already
 * called can(). If you're tempted to reach for this to "just get
 * something working," that's the signal to add the missing authz
 * check instead, not bypass it.
 */
export function createSupabaseServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — see .env.example");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
