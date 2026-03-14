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
          I&apos;m so glad you&apos;re here!
        </h1>

        {/* Description */}
        <p className="mx-auto mb-10 max-w-lg text-sm leading-relaxed text-muted-foreground">
          Whether you&apos;re here for the first time or you&apos;re back to keep building, this is your space. Pick where you want to start today and let&apos;s get into it.
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
            <h3 className="text-lg font-semibold text-foreground">Aligned Income AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$97 one-time fee</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Not sure what you could actually sell online? This is where you start. Through a guided discovery process built around your real life experience, skills, and story, and factoring in your Human Design so the direction actually suits how you work best, this tool comes back with digital product ideas that feel specific, realistic, and genuinely aligned with who you are. What&apos;s on the other side of that clarity is income that belongs to you, built from knowledge you already have, and that&apos;s how the life you&apos;ve been picturing starts to become the one you&apos;re actually living.
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
            <h3 className="text-lg font-semibold text-foreground">The Back Pocket AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$15–$35/month</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Whether you&apos;re building a personal brand or growing a business online, this is the support that sits in your back pocket and shows up whenever you need it. From brand messaging and bios to content pillars, captions, story selling sequences and how to sell without ever feeling pushy about it, this covers the full picture of what it actually takes to grow online. Every piece of guidance is shaped around your brand&apos;s tone and the people you&apos;re trying to reach, so what you put out doesn&apos;t just get seen, it resonates. That&apos;s how you stop just posting and start building something magnetic, a loyal, engaged community that genuinely connects with what you&apos;re putting out and a brand presence that keeps growing because it&apos;s built on something real.
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
