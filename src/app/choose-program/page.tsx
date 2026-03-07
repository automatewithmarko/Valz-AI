"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import { createDemoBrandDNAPurchase } from "@/lib/supabase/db";

export default function ChooseProgramPage() {
  const router = useRouter();
  const { session, loading, user, refreshUser } = useAuth();
  const [supabase] = useState(() => createClient());
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!loading && !session) {
      router.replace("/");
    }
  }, [loading, session, router]);

  if (loading || !session || !user) {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  const hasConsulting = user.hasActiveSubscription;
  const hasBrandDNA = user.hasBrandDNAPurchase || user.brandDNA.configured;

  const handleSelectBrandDNA = async () => {
    if (hasBrandDNA) {
      // Already purchased — go straight to builder
      router.push("/brand-building-dna-ai");
      return;
    }

    // Demo mode: create a demo purchase and navigate to builder
    setActivating(true);
    setError(null);
    try {
      await createDemoBrandDNAPurchase(supabase, user.id);
      await refreshUser();
      router.push("/brand-building-dna-ai");
    } catch (err) {
      console.error("Failed to activate Brand DNA:", err);
      setError("Something went wrong. Please try again.");
      setActivating(false);
    }
  };

  const handleSelectConsulting = () => {
    if (hasConsulting) {
      // Already has a subscription — go to Valzacchi AI chat
      router.push("/valzacchi-ai");
      return;
    }
    router.push("/choose-your-plan");
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-xl text-center">
        {/* Logo */}
        <div className="mb-1 flex justify-center">
          <Image src="/logo.png" alt="Valz.AI" width={200} height={200} className="h-auto w-auto" priority />
        </div>

        {/* Headline */}
        <h1 className="mb-4 text-2xl font-semibold text-[#06264e]">
          Choose how you want to continue
        </h1>

        {/* Description */}
        <p className="mx-auto mb-10 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Get a complete brand identity built for you using the Cass Valzacchi Human Design Framework
          — where AI learns your voice, audience, and positioning to craft messaging that actually converts.
          Or jump straight in with our Consulting AI to build a content strategy on your own terms.
        </p>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Product cards */}
        <div className="space-y-4">
          {/* Brand Building Blueprint */}
          <button
            onClick={handleSelectBrandDNA}
            disabled={activating}
            className={`relative w-full rounded-xl border bg-background px-6 py-6 text-left shadow-sm transition-all hover:shadow-xl ${
              hasBrandDNA
                ? "border-[#06264e] ring-2 ring-[#06264e]/20"
                : "border-[#e0d6d0]"
            }`}
          >
            {hasBrandDNA && (
              <span className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-[#06264e] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                <Check className="h-3 w-3" />
                Active
              </span>
            )}
            <h3 className="text-lg font-semibold text-foreground">Brand Building Blueprint AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$97 one-time fee</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An AI-guided experience that walks you through the entire Cass Valzacchi Human Design
              Framework. You&apos;ll define your brand DNA, nail your messaging, identify your ideal
              audience, and walk away with a complete brand blueprint ready to execute.
            </p>
            {activating && (
              <div className="mt-3 flex items-center gap-2 text-xs text-[#06264e]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Activating…
              </div>
            )}
          </button>

          {/* Consulting AI */}
          <button
            onClick={handleSelectConsulting}
            disabled={activating}
            className={`relative w-full rounded-xl border bg-background px-6 py-6 text-left shadow-sm transition-all hover:shadow-xl ${
              hasConsulting
                ? "border-[#06264e] ring-2 ring-[#06264e]/20"
                : "border-[#e0d6d0]"
            }`}
          >
            {hasConsulting && (
              <span className="absolute top-4 right-4 flex items-center gap-1 rounded-full bg-[#06264e] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                <Check className="h-3 w-3" />
                Current Plan
              </span>
            )}
            <h3 className="text-lg font-semibold text-foreground">Consulting AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$15–$35/month</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your on-demand marketing strategist. Ask anything about content strategy, ad copy,
              social media, or brand positioning — and get tailored, actionable advice based on
              proven frameworks. Perfect for founders and marketers who want expert guidance as they go.
            </p>
          </button>
        </div>

        {/* Back to app button (only if they already have a program) */}
        {user.hasSelectedProgram && (
          <button
            onClick={() => router.push("/valzacchi-ai")}
            className="mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            ← Back to dashboard
          </button>
        )}
      </div>
    </motion.div>
  );
}
