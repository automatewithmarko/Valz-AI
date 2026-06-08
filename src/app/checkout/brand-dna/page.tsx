"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CheckoutShell } from "@/components/checkout/CheckoutShell";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
import { EmbeddedCheckoutPanel } from "@/components/checkout/EmbeddedCheckoutPanel";

const BRAND_DNA_PRICE_DOLLARS = 97;

function BrandDnaCheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  // ?additional=1 means the user is intentionally buying ANOTHER brand
  // profile. Without it we treat the visit as the first purchase and bounce
  // an already-purchased user to their builder.
  const additional = params.get("additional") === "1";
  const { session, loading: authLoading, user } = useAuth();

  useEffect(() => {
    if (!authLoading && !session) router.replace("/");
  }, [authLoading, session, router]);

  // First-purchase guard: if they already own the Blueprint, send them to
  // the builder — UNLESS this is an intentional additional-profile purchase.
  useEffect(() => {
    if (!additional && user?.hasBrandDNAPurchase) {
      router.replace("/brand-building-dna-ai");
    }
  }, [user, router, additional]);

  if (authLoading || !session) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  return (
    <CheckoutShell
      eyebrow="One-time purchase"
      title={additional ? "Add another brand profile" : "Aligned Income AI"}
      subtitle="Guided discovery built on your story, skills, and Human Design."
      footerNote="Lifetime access · No recurring charges"
      summary={
        <OrderSummaryCard
          productIcon={Sparkles}
          productName="Aligned Income Blueprint"
          productMeta="One-time payment · lifetime access"
          amountLabel={`A$${BRAND_DNA_PRICE_DOLLARS}`}
          features={[
            "Personalised, conversational discovery",
            "Aligned with your Human Design",
            "Concrete digital product ideas to start selling",
            "Yours forever — revisit and refine anytime",
          ]}
        />
      }
    >
      <EmbeddedCheckoutPanel
        endpoint="/api/stripe/checkout/brand-dna"
        body={additional ? { additional: true } : {}}
      />
    </CheckoutShell>
  );
}

export default function BrandDnaCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
        </div>
      }
    >
      <BrandDnaCheckoutInner />
    </Suspense>
  );
}
