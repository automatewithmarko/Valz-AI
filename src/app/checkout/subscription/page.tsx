"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getPlans } from "@/lib/supabase/db";
import { useAuth } from "@/components/AuthProvider";
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

  const dollars = (plan.price_cents / 100).toFixed(plan.price_cents % 100 === 0 ? 0 : 2);

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <button
          onClick={() => router.back()}
          className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="mb-6 flex items-center gap-3">
          <Image src="/logo.png" alt="Valzacchi.ai" width={48} height={48} className="h-12 w-12" priority />
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Subscribe</p>
            <h1 className="text-xl font-bold text-foreground">{plan.display_name}</h1>
          </div>
        </div>

        {/* Order summary */}
        <div className="mb-6 rounded-xl border border-[#06264e]/15 bg-[#06264e]/[0.04] p-5">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-medium text-foreground">Monthly subscription</span>
            <span className="text-2xl font-bold text-[#06264e]">${dollars}<span className="text-sm font-normal text-muted-foreground">/mo</span></span>
          </div>
          {plan.monthly_credits != null && (
            <p className="mt-1 text-xs text-muted-foreground">
              {plan.monthly_credits.toLocaleString()} credits per month · cancel anytime
            </p>
          )}
        </div>

        {/* Embedded Stripe form */}
        <EmbeddedCheckoutPanel
          endpoint="/api/stripe/checkout/subscription"
          body={{ planId }}
        />

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Payments are securely processed by Stripe.
        </p>
      </div>
    </div>
  );
}

export default function SubscriptionCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    }>
      <SubscriptionCheckoutInner />
    </Suspense>
  );
}
