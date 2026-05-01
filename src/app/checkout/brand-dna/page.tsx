"use client";

import { useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { EmbeddedCheckoutPanel } from "@/components/checkout/EmbeddedCheckoutPanel";

const BRAND_DNA_PRICE_DOLLARS = 97;

export default function BrandDnaCheckoutPage() {
  const router = useRouter();
  const { session, loading: authLoading, user } = useAuth();

  useEffect(() => {
    if (!authLoading && !session) router.replace("/");
  }, [authLoading, session, router]);

  // Already purchased — bounce them to the builder
  useEffect(() => {
    if (user?.hasBrandDNAPurchase) {
      router.replace("/brand-building-dna-ai");
    }
  }, [user, router]);

  if (authLoading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

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
            <p className="text-xs uppercase tracking-wider text-muted-foreground">One-time purchase</p>
            <h1 className="text-xl font-bold text-foreground">Aligned Income AI</h1>
          </div>
        </div>

        {/* Order summary */}
        <div className="mb-6 rounded-xl border border-[#06264e]/15 bg-[#06264e]/[0.04] p-5">
          <div className="flex items-baseline justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-[#06264e]" />
              <span className="text-sm font-medium text-foreground">
                Aligned Income AI · lifetime access
              </span>
            </div>
            <span className="text-2xl font-bold text-[#06264e]">${BRAND_DNA_PRICE_DOLLARS}</span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Guided discovery built on your story, skills, and Human Design.
          </p>
        </div>

        {/* Embedded Stripe form */}
        <EmbeddedCheckoutPanel
          endpoint="/api/stripe/checkout/brand-dna"
          body={{}}
        />

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Payments are securely processed by Stripe.
        </p>
      </div>
    </div>
  );
}
