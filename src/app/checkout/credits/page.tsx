"use client";

import { Suspense, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { EmbeddedCheckoutPanel } from "@/components/checkout/EmbeddedCheckoutPanel";

const CREDIT_PRICE_CENTS = 10;
const MIN_CREDITS = 50;
const MAX_CREDITS = 5000;
const CREDITS_STEP = 50;

function CreditsCheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { session, loading: authLoading } = useAuth();
  const raw = Number(params.get("credits") ?? "0");
  const credits = Number.isInteger(raw) && raw >= MIN_CREDITS && raw <= MAX_CREDITS && raw % CREDITS_STEP === 0
    ? raw
    : null;

  useEffect(() => {
    if (!authLoading && !session) router.replace("/");
  }, [authLoading, session, router]);

  const ready = !authLoading && !!session;

  if (!credits) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Credit amount must be {MIN_CREDITS}–{MAX_CREDITS} in steps of {CREDITS_STEP}.
          </p>
          <button
            onClick={() => router.back()}
            className="mt-3 inline-block text-sm font-medium text-[#06264e] underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  const totalCents = credits * CREDIT_PRICE_CENTS;
  const totalDollars = (totalCents / 100).toFixed(2);

  return (
    <div className="min-h-dvh bg-background px-4 py-10">
      <div className="mx-auto max-w-2xl">
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
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Buy credits</p>
            <h1 className="text-xl font-bold text-foreground">One-time top-up</h1>
          </div>
        </div>

        {/* Order summary */}
        <div className="mb-6 rounded-xl border border-[#06264e]/15 bg-[#06264e]/[0.04] p-5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#06264e]" />
              <span className="text-sm font-medium text-foreground">
                {credits.toLocaleString()} credits
              </span>
            </div>
            <span className="text-2xl font-bold text-[#06264e]">${totalDollars}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            ~{(credits * 1000).toLocaleString()} characters of AI chat · never expire
          </p>
        </div>

        {/* Embedded Stripe form */}
        <EmbeddedCheckoutPanel
          endpoint="/api/stripe/checkout/credits"
          body={{ credits }}
        />

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Payments are securely processed by Stripe.
        </p>
      </div>
    </div>
  );
}

export default function CreditsCheckoutPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    }>
      <CreditsCheckoutInner />
    </Suspense>
  );
}
