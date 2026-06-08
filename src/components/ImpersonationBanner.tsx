"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Loader2, LogOut, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Shows a floating "you're viewing as <user>" bar whenever an admin has
// started impersonation, with a one-click exit back to the admin panel.
export function ImpersonationBanner() {
  const pathname = usePathname();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [exiting, setExiting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/impersonation/status", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => {
        if (active) setUserEmail(d?.active ? (d.userEmail as string) : null);
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [pathname]);

  const exit = useCallback(async () => {
    setExiting(true);
    let restored = false;
    try {
      const res = await fetch("/api/impersonation/stop", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      restored = Boolean(data?.restored);
    } catch {
      /* ignore */
    }
    if (restored) {
      // Admin session was restored server-side; reload straight into the panel.
      window.location.href = "/admin/users";
      return;
    }
    // Couldn't restore — sign out of the user session and return to the app.
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    window.location.href = "/";
  }, []);

  // Not impersonating, or sitting on an admin page → nothing to show.
  if (!userEmail || pathname?.startsWith("/admin")) return null;

  return (
    <div className="fixed left-1/2 top-3 z-40 flex max-w-[calc(100vw-1.5rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-white/10 bg-[#06264e] py-1.5 pl-4 pr-1.5 text-sm text-white shadow-xl">
      <ShieldAlert className="size-4 shrink-0 text-amber-300" />
      <span className="truncate">
        Viewing as <span className="font-semibold">{userEmail}</span>
      </span>
      <button
        onClick={exit}
        disabled={exiting}
        className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-semibold text-[#06264e] transition-colors hover:bg-white/90 disabled:opacity-60"
      >
        {exiting ? (
          <Loader2 className="size-3.5 animate-spin" />
        ) : (
          <LogOut className="size-3.5" />
        )}
        Exit
      </button>
    </div>
  );
}
