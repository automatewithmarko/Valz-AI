"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlans, createDemoSubscription } from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
import type { Plan } from "@/lib/types";

// Feature descriptions for display (maps plan name → display metadata)
const planMeta: Record<string, { cta: string; highlighted: boolean }> = {
  starter: { cta: "Get Started", highlighted: false },
  growth: { cta: "Upgrade to Growth", highlighted: true },
  pro: { cta: "Go Pro", highlighted: false },
};

interface PricingScreenProps {
  onComplete: () => void;
}

export function PricingScreen({ onComplete }: PricingScreenProps) {
  const { supabaseUser, refreshUser } = useAuth();
  const [supabase] = useState(() => createClient());
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadingPlans, setLoadingPlans] = useState(true);
  const [selectingPlanId, setSelectingPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const handleSelectPlan = async (plan: Plan) => {
    if (!supabaseUser || selectingPlanId) return;

    setSelectingPlanId(plan.id);
    setError(null);

    try {
      await createDemoSubscription(
        supabase,
        supabaseUser.id,
        plan.id,
        plan.monthly_credits
      );
      // Refresh user context so it picks up the new subscription + credits
      await refreshUser();
      onComplete();
    } catch (err) {
      console.error("Failed to activate plan:", err);
      setError("Something went wrong. Please try again.");
      setSelectingPlanId(null);
    }
  };

  const formatPrice = (cents: number) => `$${(cents / 100).toFixed(0)}`;

  if (loadingPlans) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  return (
    <motion.div
      key="pricing"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh flex-col items-center justify-center bg-background px-4 py-12"
    >
      {/* Logo */}
      <div className="mb-6 flex justify-center">
        <Image src="/logo.png" alt="Valzacchi.ai" width={80} height={80} className="h-auto w-auto" priority />
      </div>

      {/* Headline */}
      <h1 className="mb-2 text-2xl font-bold text-foreground">Choose your plan</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Select the plan that best fits your brand needs.
      </p>

      {/* Error */}
      {error && (
        <div className="mb-6 w-full max-w-3xl rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Pricing cards */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => {
          const meta = planMeta[plan.name] ?? { cta: "Select", highlighted: false };
          const features = (plan.features as string[]) ?? [];
          const isSelecting = selectingPlanId === plan.id;

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
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-bold text-foreground">{formatPrice(plan.price_cents)}</span>
                <span className="text-sm text-muted-foreground">/month</span>
              </div>
              <ul className="mt-4 flex-1 space-y-2">
                {features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-xs text-foreground">
                    <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
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
    </motion.div>
  );
}
