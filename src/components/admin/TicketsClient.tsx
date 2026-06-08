"use client";

import { useMemo, useState } from "react";
import { Loader2, Mail, RefreshCw, Ticket as TicketIcon, User } from "lucide-react";
import type { Ticket, TicketStatus } from "@/lib/admin/types";
import { TICKET_STATUSES } from "@/lib/admin/types";
import { formatDateTime, relativeTime } from "@/lib/admin/format";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  TicketStatus,
  { label: string; badge: string; dot: string }
> = {
  open: {
    label: "Open",
    badge: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-transparent",
    dot: "bg-amber-500",
  },
  in_progress: {
    label: "In Progress",
    badge: "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-transparent",
    dot: "bg-blue-500",
  },
  resolved: {
    label: "Resolved",
    badge: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-transparent",
    dot: "bg-emerald-500",
  },
  closed: {
    label: "Closed",
    badge: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-transparent",
    dot: "bg-slate-400",
  },
};

function StatusBadge({ status }: { status: TicketStatus }) {
  const meta = STATUS_META[status];
  return <Badge className={meta.badge}>{meta.label}</Badge>;
}

export function TicketsClient({ initialTickets }: { initialTickets: Ticket[] }) {
  const [tickets, setTickets] = useState(initialTickets);
  const [filter, setFilter] = useState<TicketStatus | "all">("all");
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [updating, setUpdating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: tickets.length };
    for (const s of TICKET_STATUSES) c[s] = 0;
    for (const t of tickets) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [tickets]);

  const filtered = filter === "all" ? tickets : tickets.filter((t) => t.status === filter);

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/tickets", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.tickets) setTickets(data.tickets);
      }
    } catch {
      /* ignore */
    } finally {
      setRefreshing(false);
    }
  }

  async function updateStatus(id: string, status: TicketStatus) {
    setUpdating(true);
    try {
      const res = await fetch("/api/admin/tickets", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (res.ok) {
        setTickets((prev) =>
          prev.map((t) => (t.id === id ? { ...t, status } : t))
        );
        setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
      }
    } catch {
      /* ignore */
    } finally {
      setUpdating(false);
    }
  }

  const FILTERS: { key: TicketStatus | "all"; label: string }[] = [
    { key: "all", label: "All" },
    { key: "open", label: "Open" },
    { key: "in_progress", label: "In Progress" },
    { key: "resolved", label: "Resolved" },
    { key: "closed", label: "Closed" },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                "flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors",
                filter === f.key
                  ? "border-[#06264e] bg-[#06264e] text-white dark:border-[#c08967] dark:bg-[#c08967] dark:text-[#1a1510]"
                  : "border-border bg-card text-foreground/70 hover:bg-muted"
              )}
            >
              {f.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs tabular-nums",
                  filter === f.key
                    ? "bg-white/20 text-white dark:bg-black/10 dark:text-[#1a1510]"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {counts[f.key] ?? 0}
              </span>
            </button>
          ))}
        </div>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="ml-auto flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* List */}
      <Card className="gap-0 overflow-hidden py-0">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
            <TicketIcon className="size-8 text-muted-foreground/50" />
            <p className="font-medium text-foreground">No tickets here</p>
            <p className="max-w-xs text-sm text-muted-foreground">
              {filter === "all"
                ? "Support requests from the in-app chat bubble will appear here."
                : "No tickets with this status."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {filtered.map((t) => (
              <li key={t.id}>
                <button
                  onClick={() => setSelected(t)}
                  className="flex w-full cursor-pointer items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-muted/50"
                >
                  <span
                    className={cn(
                      "size-2.5 shrink-0 rounded-full",
                      STATUS_META[t.status].dot
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-medium text-[#a96f47] dark:text-[#d6a07c]">
                        {t.ticket_number}
                      </span>
                      <span className="truncate text-sm font-medium text-foreground">
                        {t.name}
                      </span>
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {t.subject ? (
                        <span className="font-medium text-foreground/70">
                          {t.subject} ·{" "}
                        </span>
                      ) : null}
                      {t.message}
                    </p>
                  </div>
                  <div className="hidden shrink-0 sm:block">
                    <StatusBadge status={t.status} />
                  </div>
                  <span className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground md:block">
                    {relativeTime(t.created_at)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Detail panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <SheetContent side="right" className="w-full gap-0 sm:max-w-md">
          {selected && (
            <>
              <SheetHeader className="border-b border-border">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-[#a96f47] dark:text-[#d6a07c]">
                    {selected.ticket_number}
                  </span>
                  <StatusBadge status={selected.status} />
                </div>
                <SheetTitle className="text-base">
                  {selected.subject || "Support request"}
                </SheetTitle>
              </SheetHeader>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-[20px_1fr] gap-x-2.5 gap-y-3 text-sm">
                    <User className="size-4 text-muted-foreground" />
                    <span className="text-foreground">{selected.name}</span>
                    <Mail className="size-4 text-muted-foreground" />
                    <a
                      href={`mailto:${selected.email}`}
                      className="truncate text-[#06264e] underline-offset-2 hover:underline dark:text-[#9fc0e8]"
                    >
                      {selected.email}
                    </a>
                  </div>

                  <div>
                    <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Message
                    </p>
                    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm whitespace-pre-wrap text-foreground">
                      {selected.message}
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Submitted {formatDateTime(selected.created_at)}
                    {selected.user_id ? " · from a signed-in user" : ""}
                  </p>
                </div>
              </div>

              <div className="border-t border-border p-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Update status
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {TICKET_STATUSES.map((s) => {
                    const active = selected.status === s;
                    return (
                      <Button
                        key={s}
                        variant={active ? "default" : "outline"}
                        disabled={updating || active}
                        onClick={() => updateStatus(selected.id, s)}
                        className={cn(
                          "h-9 justify-center",
                          active && "bg-[#06264e] text-white hover:bg-[#06264e]/90 dark:bg-[#c08967] dark:text-[#1a1510]"
                        )}
                      >
                        {updating && !active ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : null}
                        {STATUS_META[s].label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
