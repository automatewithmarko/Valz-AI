"use client";

import { useState } from "react";
import {
  DollarSign,
  TrendingUp,
  CreditCard,
  Users,
  FileText,
  Coins,
  Fingerprint,
  LifeBuoy,
  RefreshCw,
  ArrowUpRight,
} from "lucide-react";
import type { DashboardStats } from "@/lib/admin/types";
import {
  formatCurrency,
  formatNumber,
  monthLabel,
  relativeTime,
} from "@/lib/admin/format";
import { StatCard } from "./StatCard";
import {
  BarList,
  CHART_COLORS,
  DonutChart,
  TrendChart,
} from "./charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const TIER_COLORS = [CHART_COLORS.navy, CHART_COLORS.terracotta, CHART_COLORS.sand];

export function DashboardClient({ stats: initial }: { stats: DashboardStats }) {
  const [stats, setStats] = useState(initial);
  const [refreshing, setRefreshing] = useState(false);
  const [metric, setMetric] = useState<"revenue" | "signups">("revenue");

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch("/api/admin/stats", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data.stats) setStats(data.stats);
      }
    } catch {
      /* keep existing */
    } finally {
      setRefreshing(false);
    }
  }

  const k = stats.kpis;

  const trendData =
    metric === "revenue"
      ? stats.revenue_by_month.map((m) => ({ label: monthLabel(m.month), value: m.cents }))
      : stats.signups_by_month.map((m) => ({ label: monthLabel(m.month), value: m.count }));

  const totalActive = stats.tiers.reduce((s, t) => s + t.active_count, 0);

  const donutData = stats.tiers.map((t, i) => ({
    label: t.display_name,
    value: t.active_count,
    color: TIER_COLORS[i % TIER_COLORS.length],
  }));

  const mrrBars = stats.tiers.map((t, i) => ({
    label: t.display_name,
    value: t.mrr_cents,
    valueLabel: formatCurrency(t.mrr_cents),
    sublabel: `${t.active_count} active · ${formatCurrency(t.price_cents)}/mo`,
    color: TIER_COLORS[i % TIER_COLORS.length],
  }));

  return (
    <div className="flex flex-col gap-5">
      {/* Header row */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Live overview of revenue, subscriptions and growth.
        </p>
        <button
          onClick={refresh}
          disabled={refreshing}
          className="flex shrink-0 cursor-pointer items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
        >
          <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Refresh</span>
        </button>
      </div>

      {/* Primary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Revenue"
          value={formatCurrency(k.total_revenue_cents)}
          icon={DollarSign}
          tint="terracotta"
          hint="Blueprints + credits + est. subscriptions"
        />
        <StatCard
          label="MRR"
          value={formatCurrency(k.mrr_cents)}
          icon={TrendingUp}
          tint="navy"
          hint={`${formatCurrency(k.arr_cents)} ARR`}
        />
        <StatCard
          label="Active Subscriptions"
          value={formatNumber(k.active_subscriptions)}
          icon={CreditCard}
          tint="green"
          hint={`${formatNumber(k.total_subscriptions)} all-time`}
        />
        <StatCard
          label="Total Users"
          value={formatNumber(k.total_users)}
          icon={Users}
          tint="amber"
          hint={`${formatNumber(totalActive)} subscribed`}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Aligned Income Blueprints"
          value={formatNumber(k.blueprints_sold)}
          icon={FileText}
          tint="navy"
          hint={`${formatCurrency(k.blueprint_revenue_cents)} earned`}
        />
        <StatCard
          label="One-time Revenue"
          value={formatCurrency(k.one_time_revenue_cents)}
          icon={Coins}
          tint="terracotta"
          hint={`${formatNumber(k.credit_topup_count)} credit top-ups`}
        />
        <StatCard
          label="Brand DNA Profiles"
          value={formatNumber(k.active_brand_dnas)}
          icon={Fingerprint}
          tint="slate"
          hint="Active profiles"
        />
        <StatCard
          label="Open Tickets"
          value={formatNumber(k.open_tickets)}
          icon={LifeBuoy}
          tint="amber"
          hint="Awaiting response"
        />
      </div>

      {/* Trend + tier donut */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0">
            <CardTitle>
              {metric === "revenue" ? "Revenue" : "New Users"}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                last 12 months
              </span>
            </CardTitle>
            <div className="flex rounded-lg border border-border bg-muted/40 p-0.5">
              {(["revenue", "signups"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={`cursor-pointer rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    metric === m
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {m === "revenue" ? "Revenue" : "Users"}
                </button>
              ))}
            </div>
          </CardHeader>
          <CardContent>
            <TrendChart
              data={trendData}
              color={metric === "revenue" ? CHART_COLORS.navy : CHART_COLORS.terracotta}
              formatValue={(v) =>
                metric === "revenue" ? formatCurrency(v) : `${formatNumber(v)} users`
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Subscriptions by Tier</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-center gap-5">
            <DonutChart
              data={donutData}
              centerLabel={formatNumber(totalActive)}
              centerSub="active"
            />
            <div className="flex w-full flex-col gap-2">
              {stats.tiers.map((t, i) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex items-center gap-2 text-foreground">
                    <span
                      className="size-2.5 rounded-full"
                      style={{ backgroundColor: TIER_COLORS[i % TIER_COLORS.length] }}
                    />
                    {t.display_name}
                  </span>
                  <span className="tabular-nums font-medium text-muted-foreground">
                    {t.active_count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* MRR by tier + recent users */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              MRR by Tier
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {formatCurrency(k.mrr_cents)} total
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {mrrBars.some((b) => b.value > 0) ? (
              <BarList items={mrrBars} />
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No active subscriptions yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Recent Signups</CardTitle>
          </CardHeader>
          <CardContent>
            {stats.recent_users.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No users yet.
              </p>
            ) : (
              <div className="-mx-2 flex flex-col">
                {stats.recent_users.map((u) => (
                  <div
                    key={u.id}
                    className="flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#06264e]/10 text-sm font-semibold text-[#06264e] dark:bg-[#87a8d3]/15 dark:text-[#9fc0e8]">
                      {(u.full_name || u.email).charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {u.full_name || "—"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    <div className="hidden shrink-0 items-center gap-1.5 sm:flex">
                      {u.has_blueprint && (
                        <Badge
                          variant="secondary"
                          className="bg-[#f2dacb] text-[#a96f47] dark:bg-[#3a2a1e] dark:text-[#d6a07c]"
                        >
                          Blueprint
                        </Badge>
                      )}
                      {u.plan_display_name ? (
                        <Badge variant="outline">{u.plan_display_name}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Free
                        </Badge>
                      )}
                    </div>
                    <span className="hidden w-20 shrink-0 text-right text-xs text-muted-foreground md:block">
                      {relativeTime(u.created_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <p className="flex items-center gap-1 px-1 text-xs text-muted-foreground">
        <ArrowUpRight className="size-3" />
        Subscription revenue is estimated from billing cycles elapsed (no
        per-payment ledger is stored). One-time figures are exact.
      </p>
    </div>
  );
}
