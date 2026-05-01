import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

// Module-level singleton. Every caller in the browser shares the same
// instance, which is critical for auth-lock correctness: multiple
// Supabase clients in the same tab fight over `navigator.locks` during
// auth init and produce "Lock broken with the 'steal' option" AbortErrors
// that cascade into "Profile query timed out" / "Auth init failed".
// In an SSR / RSC context there is no `window`, so we always create a
// fresh per-call client there (no shared auth state needed).
let _browserClient: ReturnType<typeof createBrowserClient<Database>> | null = null;

export function createClient() {
  if (typeof window === "undefined") {
    return createBrowserClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
  }
  if (_browserClient) return _browserClient;
  _browserClient = createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
  return _browserClient;
}
