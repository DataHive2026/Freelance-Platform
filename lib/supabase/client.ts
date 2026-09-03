import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Only used for things that must run
// client-side (e.g. Supabase Realtime subscriptions for chat). Regular
// data fetching still goes through Server Actions calling lib/services/*.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
