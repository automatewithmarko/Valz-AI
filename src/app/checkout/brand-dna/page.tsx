"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CheckoutShell } from "@/components/checkout/CheckoutShell";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
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
    <CheckoutShell
      eyebrow="One-time purchase"
      title="Aligned Income AI"
      subtitle="Guided discovery built on your story, skills, and Human Design."
      footerNote="Lifetime access · No recurring charges"
      summary={
        <OrderSummaryCard
          productIcon={Sparkles}
          productName="Aligned Income Blueprint"
          productMeta="One-time payment · lifetime access"
          amountLabel={`$${BRAND_DNA_PRICE_DOLLARS}`}
          features={[
            "Personalised, conversational discovery",
            "Aligned with your Human Design",
            "Concrete digital product ideas to start selling",
            "Yours forever — revisit and refine anytime",
          ]}
        />
      }
    >
      <EmbeddedCheckoutPanel endpoint="/api/stripe/checkout/brand-dna" body={{}} />
    </CheckoutShell>
  );
}
