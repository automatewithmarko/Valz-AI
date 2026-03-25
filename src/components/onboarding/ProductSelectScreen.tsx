"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

interface ProductSelectScreenProps {
  onSelectConsulting: () => void;
  onBack: () => void;
}

export function ProductSelectScreen({ onSelectConsulting, onBack }: ProductSelectScreenProps) {
  const router = useRouter();

  return (
    <motion.div
      key="products"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh items-center justify-center bg-background px-4 py-12"
    >
      <div className="w-full max-w-xl text-center">
        {/* Logo */}
        <div className="mb-1 flex justify-center">
          <Image src="/logo.png" alt="Valzacchi.ai" width={200} height={200} className="h-auto w-auto" priority />
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

        {/* Product cards */}
        <div className="space-y-4">
          {/* Brand Building Blueprint */}
          <button
            onClick={() => router.push("/brand-building-dna-ai")}
            className="w-full rounded-xl border border-[#e0d6d0] bg-background px-6 py-6 text-left shadow-sm transition-all hover:shadow-xl"
          >
            <h3 className="text-lg font-semibold text-foreground">Brand Building Blueprint AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$97 one-time fee</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              An AI-guided experience that walks you through the entire Cass Valzacchi Human Design
              Framework. You&apos;ll define your brand DNA, nail your messaging, identify your ideal
              audience, and walk away with a complete brand blueprint ready to execute.
            </p>
          </button>

          {/* Consulting AI */}
          <button
            onClick={onSelectConsulting}
            className="w-full rounded-xl border border-[#e0d6d0] bg-background px-6 py-6 text-left shadow-sm transition-all hover:shadow-xl"
          >
            <h3 className="text-lg font-semibold text-foreground">Consulting AI</h3>
            <p className="mt-1 text-sm text-muted-foreground">$15–$35/month</p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Your on-demand marketing strategist. Ask anything about content strategy, ad copy,
              social media, or brand positioning — and get tailored, actionable advice based on
              proven frameworks. Perfect for founders and marketers who want expert guidance as they go.
            </p>
          </button>
        </div>

        {/* Back button */}
        <button
          onClick={onBack}
          className="mt-6 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          Back
        </button>
      </div>
    </motion.div>
  );
}
