"use client";

import { useEffect, useRef, useState } from "react";
import { LogIn, Loader2, Search, Users as UsersIcon } from "lucide-react";
import type { AdminUserRow, UsersResponse } from "@/lib/admin/types";
import { formatDate, formatNumber } from "@/lib/admin/format";
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const PAGE = 50;

export function UsersClient({ initial }: { initial: UsersResponse }) {
  const [users, setUsers] = useState(initial.users);
  const [total, setTotal] = useState(initial.total);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const firstRender = useRef(true);

  // Impersonation ("sign in as user")
  const [confirmUser, setConfirmUser] = useState<AdminUserRow | null>(null);
  const [impersonating, setImpersonating] = useState(false);
  const [impersonateError, setImpersonateError] = useState<string | null>(null);

  async function confirmImpersonate() {
    if (!confirmUser) return;
    setImpersonating(true);
    setImpersonateError(null);

    // Open the tab synchronously inside the click gesture so the browser
    // doesn't treat it as a blocked popup; we point it at the app once the
    // session is established.
    const newTab = window.open("", "_blank");
    if (newTab) {
      newTab.document.write(
        '<!doctype html><meta charset="utf-8"><title>Signing in…</title>' +
          '<body style="font-family:system-ui,-apple-system,sans-serif;display:grid;' +
          'place-items:center;height:100vh;margin:0;background:#f6f1ee;color:#06264e">' +
          "<p>Signing you in…</p></body>"
      );
    }

    try {
      const res = await fetch("/api/admin/impersonate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: confirmUser.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        newTab?.close();
        setImpersonateError(data.error ?? "Couldn't start impersonation.");
        setImpersonating(false);
        return;
      }
      // Redeem the one-time token. The Supabase session lives in cookies that
      // are shared across tabs, so the new tab will load as the user.
      const supabase = createClient();
      const { error } = await supabase.auth.verifyOtp({
        token_hash: data.tokenHash,
        type: data.type,
      });
      if (error) {
        newTab?.close();
        setImpersonateError(error.message);
        setImpersonating(false);
        return;
      }

      const target = data.redirectTo || "/valzacchi-ai";
      if (newTab) {
        newTab.location.href = target;
        // Leave the admin panel open in this tab.
        setImpersonating(false);
        setConfirmUser(null);
      } else {
        // Popup was blocked — fall back to navigating the current tab.
        window.location.href = target;
      }
    } catch {
      newTab?.close();
      setImpersonateError("Network error. Please try again.");
      setImpersonating(false);
    }
  }

  // Debounced search.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/admin/users?search=${encodeURIComponent(search)}&limit=${PAGE}&offset=0`,
          { cache: "no-store" }
        );
        if (res.ok) {
          const data: UsersResponse = await res.json();
          setUsers(data.users);
          setTotal(data.total);
        }
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => clearTimeout(handle);
  }, [search]);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/admin/users?search=${encodeURIComponent(search)}&limit=${PAGE}&offset=${users.length}`,
        { cache: "no-store" }
      );
      if (res.ok) {
        const data: UsersResponse = await res.json();
        setUsers((prev) => [...prev, ...data.users]);
        setTotal(data.total);
      }
    } catch {
      /* ignore */
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Search + count */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          {loading ? (
            <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />
          ) : null}
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-9 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-[#c08967] focus:ring-2 focus:ring-[#c08967]/25"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {formatNumber(total)} {total === 1 ? "user" : "users"}
        </p>
      </div>

      <Card className="gap-0 overflow-hidden py-0">
        {users.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <UsersIcon className="size-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">No users found</p>
            <p className="text-sm text-muted-foreground">
              {search ? "Try a different search." : "Users will appear here."}
            </p>
          </div>
        ) : (
          <>
            {/* Table header (desktop) */}
            <div className="hidden grid-cols-[1fr_120px_92px_72px_96px_112px] gap-3 border-b border-border px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
              <span>User</span>
              <span>Plan</span>
              <span>Blueprint</span>
              <span className="text-right">Credits</span>
              <span className="text-right">Joined</span>
              <span className="text-right">Action</span>
            </div>

            <ul className="divide-y divide-border">
              {users.map((u) => (
                <li
                  key={u.id}
                  className="grid grid-cols-1 gap-2 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[1fr_120px_92px_72px_96px_112px] md:items-center md:gap-3"
                >
                  {/* User */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#06264e]/10 text-sm font-semibold text-[#06264e] dark:bg-[#87a8d3]/15 dark:text-[#9fc0e8]">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-foreground">
                        {u.full_name || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {u.email}
                      </p>
                    </div>
                  </div>

                  {/* Plan */}
                  <div className="flex items-center gap-2 md:block">
                    <span className="text-xs text-muted-foreground md:hidden">Plan:</span>
                    {u.plan_display_name ? (
                      <Badge
                        variant="outline"
                        className="border-[#06264e]/20 text-[#06264e] dark:border-[#9fc0e8]/30 dark:text-[#9fc0e8]"
                      >
                        {u.plan_display_name}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Free
                      </Badge>
                    )}
                  </div>

                  {/* Blueprint */}
                  <div className="flex items-center gap-2 md:block">
                    <span className="text-xs text-muted-foreground md:hidden">
                      Blueprint:
                    </span>
                    {u.has_blueprint ? (
                      <Badge className="bg-[#f2dacb] text-[#a96f47] dark:bg-[#3a2a1e] dark:text-[#d6a07c]">
                        Yes
                      </Badge>
                    ) : (
                      <span className="text-sm text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Credits */}
                  <div className="flex items-center gap-2 md:block md:text-right">
                    <span className="text-xs text-muted-foreground md:hidden">
                      Credits:
                    </span>
                    <span className="text-sm tabular-nums text-foreground">
                      {u.credit_balance != null
                        ? formatNumber(Math.floor(u.credit_balance))
                        : "—"}
                    </span>
                  </div>

                  {/* Joined */}
                  <div className="flex items-center gap-2 md:block md:text-right">
                    <span className="text-xs text-muted-foreground md:hidden">
                      Joined:
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(u.created_at)}
                    </span>
                  </div>

                  {/* Action: sign in as user */}
                  <div className="pt-1 md:flex md:justify-end md:pt-0">
                    <button
                      onClick={() => {
                        setImpersonateError(null);
                        setConfirmUser(u);
                      }}
                      title="Sign in as user"
                      aria-label={`Sign in as ${u.email}`}
                      className="flex h-8 w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium text-foreground transition-colors hover:border-[#06264e]/30 hover:bg-[#f2dacb]/30 md:w-9 md:px-0 dark:hover:border-[#c08967]/40 dark:hover:bg-sidebar-accent"
                    >
                      <LogIn className="size-4" />
                      <span className="md:hidden">Sign in as user</span>
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            {users.length < total && (
              <div className="border-t border-border p-3 text-center">
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                >
                  {loadingMore && <Loader2 className="size-4 animate-spin" />}
                  Load more ({formatNumber(total - users.length)} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Sign in as user — confirmation */}
      <Dialog
        open={!!confirmUser}
        onOpenChange={(o) => {
          if (!o && !impersonating) setConfirmUser(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign in as this user?</DialogTitle>
            <DialogDescription>
              The app will open in a new tab signed in as{" "}
              <span className="font-medium text-foreground">
                {confirmUser?.full_name || confirmUser?.email}
              </span>{" "}
              ({confirmUser?.email}). A banner there lets you exit back to the
              admin panel. This action is logged.
            </DialogDescription>
          </DialogHeader>
          {impersonateError && (
            <p
              role="alert"
              className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
            >
              {impersonateError}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmUser(null)}
              disabled={impersonating}
            >
              Cancel
            </Button>
            <Button
              onClick={confirmImpersonate}
              disabled={impersonating}
              className="bg-[#06264e] text-white hover:bg-[#06264e]/90 dark:bg-[#c08967] dark:text-[#1a1510]"
            >
              {impersonating && <Loader2 className="size-4 animate-spin" />}
              <LogIn className="size-4" />
              Sign in as user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
