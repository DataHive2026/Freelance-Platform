import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Server-side Supabase client — used inside Server Actions and Route
// Handlers only. UI components never import this directly; they go
// through lib/services/*, which is the only layer allowed to touch
// the database (see phase0-database-and-lifecycle.md, Section 6).
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — safe to ignore if you have
            // middleware refreshing sessions (see lib/supabase/middleware.ts).
          }
        },
      },
    }
  );
}
