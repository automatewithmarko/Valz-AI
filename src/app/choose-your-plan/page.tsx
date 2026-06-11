"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlans } from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
import type { Plan } from "@/lib/types";

type PlanFeature = { text: string; hint?: string };

// `plans.features` can be either the legacy string[] shape or the richer
// {text, hint?}[] shape. Normalize both into a consistent list for render.
function normalizeFeatures(raw: unknown): PlanFeature[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) =>
    typeof item === "string"
      ? { text: item }
      : { text: String((item as { text?: unknown }).text ?? ""), hint: (item as { hint?: string }).hint }
  );
}

const planMeta: Record<string, { cta: string; highlighted: boolean; description: string }> = {
  starter: {
    cta: "Get Back Pocket",
    highlighted: false,
    description: "Your entry point into having real strategy support whenever you need it.",
  },
  growth: {
    cta: "Get In Hand",
    highlighted: true,
    description: "For when you're ready to go deeper and need support that keeps up with you.",
  },
  pro: {
    cta: "Get On Speed Dial",
    highlighted: false,
    description: "For the person who wants it all, fast, and without limits.",
  },
};

type BillingInterval = "monthly" | "yearly";

export default function ChooseYourPlanPage() {
  const router = useRouter();
  const { session, loading: authLoading, user, supabaseUser } = useAuth();
  const [supabase] = useState(() => createClient());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [interval, setInterval] = useState<BillingInterval>("monthly");

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  // Redirect to Valzacchi AI if already has a subscription
  useEffect(() => {
    if (user?.hasActiveSubscription) {
      router.replace("/valzacchi-ai");
    }
  }, [user, router]);

  // Fetch plans from DB on mount
  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const data = await getPlans(supabase);
        setPlans(data ?? []);
      } catch (err) {
        console.error("Failed to load plans:", err);
        setError("Failed to load plans. Please refresh.");
      } finally {
        setLoadingPlans(false);
      }
    };
    fetchPlans();
  }, [supabase]);

  const handleSelectPlan = (plan: Plan) => {
    if (!supabaseUser || selectingPlanId) return;
    setSelectingPlanId(plan.id);
    setError(null);
    router.push(
      `/checkout/subscription?planId=${encodeURIComponent(plan.id)}&interval=${interval}`
    );
  };

  const formatPrice = (cents: number) => {
    const dollars = cents / 100;
    return dollars % 1 === 0 ? `A$${dollars}` : `A$${dollars.toFixed(2)}`;
  };

  const yearlyAvailable = plans.every((p) => p.yearly_price_cents != null);

  if (authLoading || loadingPlans || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12"
    >
      {/* Logo */}
      <div className="mb-6 flex justify-center">
        <Image src="/logo.png" alt="Valzacchi.ai" width={80} height={80} className="h-auto w-auto" priority />
      </div>

      {/* Headline */}
      <h1 className="mb-2 text-2xl font-bold text-foreground">Unlock Back Pocket AI</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Select the plan that best fits your brand needs.
      </p>

      {/* Billing interval toggle */}
      {yearlyAvailable && (
        <div
          role="tablist"
          aria-label="Billing interval"
          className="mb-8 inline-flex items-center rounded-full border border-[#e0d6d0] bg-white/60 p-1 text-sm"
        >
          {(["monthly", "yearly"] as const).map((value) => {
            const active = interval === value;
            return (
              <button
                key={value}
                role="tab"
                aria-selected={active}
                onClick={() => setInterval(value)}
                className={`relative rounded-full px-4 py-1.5 font-medium transition-all ${
                  active
                    ? "bg-[#06264e] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {value === "monthly" ? "Monthly" : "Annual"}
                {value === "yearly" && (
                  <span
                    className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                      active ? "bg-white/20 text-white" : "bg-[#f2dacb] text-[#06264e]"
                    }`}
                  >
                    Save
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mb-6 w-full max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const meta = planMeta[plan.name] ?? { cta: "Select", highlighted: false, description: "" };
          const features = normalizeFeatures(plan.features);
          const isSelecting = selectingPlanId === plan.id;
          const isYearly = interval === "yearly" && plan.yearly_price_cents != null;
          const displayCents = isYearly ? plan.yearly_price_cents! : plan.price_cents;
          const priceSuffix = isYearly ? "/year" : "/month";
          const monthlyEquivalentCents = isYearly
            ? Math.round(plan.yearly_price_cents! / 12)
            : null;

          return (
            <div
              key={plan.id}
              className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                meta.highlighted
                  ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10"
                  : "border-[#e0d6d0] bg-white/40"
              }`}
            >
              {meta.highlighted && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                  Most Popular
                </span>
              )}
              <h3 className="text-sm font-semibold text-foreground">{plan.display_name}</h3>
              {meta.description && (
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{meta.description}</p>
              )}
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">{formatPrice(displayCents)}</span>
                <span className="text-sm text-muted-foreground">{priceSuffix}</span>
              </div>
              {monthlyEquivalentCents != null && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  ~{formatPrice(monthlyEquivalentCents)}/month, billed yearly
                </p>
              )}
              {plan.monthly_credits != null && (
                <div className="mt-3 rounded-lg border border-[#06264e]/15 bg-[#06264e]/[0.04] px-3 py-2">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-lg font-bold text-[#06264e] tabular-nums">
                      {plan.monthly_credits.toLocaleString()}
                    </span>
                    <span className="text-[11px] font-medium uppercase tracking-wider text-[#06264e]/70">
                      credits / mo
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    ~{(plan.monthly_credits * 1450).toLocaleString()} characters of AI chat
                  </p>
                </div>
              )}
              <ul className="mt-4 space-y-2">
                {features.map((feature) => (
                  <li key={feature.text} className="flex items-start gap-2 text-xs text-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                    <div className="min-w-0">
                      <span>{feature.text}</span>
                      {feature.hint && (
                        <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                          {feature.hint}
                        </p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              {plan.tagline && (
                <p className="mt-3 text-[11px] italic leading-relaxed text-muted-foreground">
                  {plan.tagline}
                </p>
              )}
              <div className="flex-1" />
              <button
                onClick={() => handleSelectPlan(plan)}
                disabled={!!selectingPlanId}
                className={`mt-5 flex w-full items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-all disabled:opacity-70 ${
                  meta.highlighted
                    ? "bg-[#06264e] text-white hover:bg-[#06264e]/90"
                    : "border border-[#e0d6d0] text-foreground hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                }`}
              >
                {isSelecting && <Loader2 className="h-4 w-4 animate-spin" />}
                {isSelecting ? "Activating…" : meta.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="mt-8 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Back
      </button>
    </motion.div>
  );
}
