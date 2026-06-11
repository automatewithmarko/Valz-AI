"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";

// Shows the Admin Panel button for allowlisted admins.
//
// It checks admin status directly and *reactively to the session* rather than
// relying solely on the one-shot `user.isAdmin` flag from AuthProvider. That
// flag is computed once during buildUser and can be briefly stale right after
// a client-side sign-in (the admin RPC may resolve before the session token is
// fully settled), which previously meant the button only appeared after a
// manual refresh. `user.isAdmin` is still used as a fast path on warm loads
// (e.g. a full refresh), OR-ed with the live re-check.
//
// We record the *user id* the check confirmed for (rather than a bare
// boolean) so the result can't leak across a sign-out / account switch, and so
// we never have to call setState synchronously inside the effect.
export function AdminPanelLink() {
  const { user, session } = useAuth();
  const [adminUserId, setAdminUserId] = useState<string | null>(null);

  useEffect(() => {
    const uid = session?.user?.id;
    if (!uid) return;
    let active = true;
    const supabase = createClient();
    (async () => {
      try {
        const { data } = await (
          supabase.rpc as unknown as (fn: string) => Promise<{ data: unknown }>
        )("current_user_is_admin");
        if (active && data === true) setAdminUserId(uid);
      } catch {
        // Ignore — the buildUser flag remains as a fallback.
      }
    })();
    return () => {
      active = false;
    };
  }, [session]);

  const currentUid = session?.user?.id ?? null;
  const isAdmin =
    (currentUid != null && adminUserId === currentUid) || user?.isAdmin === true;

  if (!isAdmin) return null;

  return (
    <div className="shrink-0 px-3 pt-3">
      <Link
        href="/admin"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] px-3 py-2 text-sm font-medium text-white transition-all hover:bg-[#06264e]/90 dark:bg-[#c08967] dark:text-[#1a1510] dark:hover:bg-[#c08967]/90"
      >
        <ShieldCheck className="h-4 w-4" />
        Admin Panel
      </Link>
    </div>
  );
}
