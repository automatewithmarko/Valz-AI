"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlans } from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
import { CheckoutShell } from "@/components/checkout/CheckoutShell";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { EmbeddedCheckoutPanel } from "@/components/checkout/EmbeddedCheckoutPanel";
import type { Plan } from "@/lib/types";

function SubscriptionCheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const planId = params.get("planId");
  const { session, loading: authLoading } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !session) router.replace("/");
  }, [authLoading, session, router]);

  useEffect(() => {
    if (!planId) return;
    const supabase = createClient();
    getPlans(supabase)
      .then((rows) => {
        const match = (rows ?? []).find((p) => p.id === planId) ?? null;
        setPlan(match);
      })
      .finally(() => setLoading(false));
  }, [planId]);

  if (!planId) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">No plan selected.</p>
          <Link
            href="/choose-your-plan"
            className="mt-3 inline-block text-sm font-medium text-[#06264e] underline"
          >
            Choose a plan
          </Link>
        </div>
      </div>
    );
  }

  if (authLoading || loading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4 text-center">
        <div>
          <p className="text-sm text-muted-foreground">Plan not found.</p>
          <Link
            href="/choose-your-plan"
            className="mt-3 inline-block text-sm font-medium text-[#06264e] underline"
          >
            Back to plans
          </Link>
        </div>
      </div>
    );
  }

  const dollars = (plan.price_cents / 100).toFixed(
    plan.price_cents % 100 === 0 ? 0 : 2
  );

  // Compose the "what's included" bullets from real plan data, leading
  // with the monthly credit allocation when present.
  const planFeatures = ((plan.features as string[] | null) ?? []).slice(0, 3);
  const summaryFeatures: string[] = [];
  if (plan.monthly_credits != null) {
    summaryFeatures.push(
      `${plan.monthly_credits.toLocaleString()} credits every month`
    );
  }
  summaryFeatures.push(...planFeatures);
  summaryFeatures.push("Cancel anytime, no questions asked");

  return (
    <CheckoutShell
      eyebrow="Subscribe"
      title={plan.display_name}
      subtitle="The Back Pocket AI · monthly subscription"
      summary={
        <OrderSummaryCard
          productIcon={Sparkles}
          productName={plan.display_name}
          productMeta="Billed monthly · auto-renews"
          amountLabel={`$${dollars}`}
          amountSuffix="/mo"
          features={summaryFeatures}
        />
      }
    >
      <EmbeddedCheckoutPanel
        endpoint="/api/stripe/checkout/subscription"
        body={{ planId }}
      />
    </CheckoutShell>
  );
}

export default function SubscriptionCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
        </div>
      }
    >
      <SubscriptionCheckoutInner />
    </Suspense>
  );
}
