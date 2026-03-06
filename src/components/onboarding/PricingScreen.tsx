"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Starter",
    price: "$15",
    period: "/month",
    description: "Perfect for getting started with brand insights",
    features: [
      "30 AI brand consultant conversations",
      "Personalized, context-aware responses",
      "1 Brand DNA profile",
      "Email support",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Growth",
    price: "$25",
    period: "/month",
    description: "For brands ready to go deeper",
    features: [
      "100 AI brand consultant conversations",
      "Longer, more detailed responses",
      "Voice-to-text input for hands-free use",
      "3 Brand DNA profiles",
      "Priority support",
    ],
    cta: "Upgrade to Growth",
    highlighted: true,
  },
  {
    name: "Pro",
    price: "$35",
    period: "/month",
    description: "Unlimited access for serious brand builders",
    features: [
      "Unlimited AI brand consultant conversations",
      "Fastest response times",
      "Unlimited Brand DNA profiles",
      "Manage multiple brands in one account",
      "Dedicated priority support",
    ],
    cta: "Go Pro",
    highlighted: false,
  },
];

interface PricingScreenProps {
  onComplete: () => void;
}

export function PricingScreen({ onComplete }: PricingScreenProps) {
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
        <Image src="/logo.png" alt="Valz.AI" width={80} height={80} className="h-auto w-auto" priority />
      </div>

      {/* Headline */}
      <h1 className="mb-2 text-2xl font-bold text-foreground">Choose your plan</h1>
      <p className="mb-8 text-sm text-muted-foreground">
        Select the plan that best fits your brand valuation needs.
      </p>

      {/* Pricing cards */}
      <div className="grid w-full max-w-3xl grid-cols-1 gap-4 sm:grid-cols-3">
        {plans.map((plan) => (
          <div
            key={plan.name}
            className={`relative flex flex-col rounded-xl border p-5 transition-all ${
              plan.highlighted
                ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10"
                : "border-[#e0d6d0] bg-white/40"
            }`}
          >
            {plan.highlighted && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                Most Popular
              </span>
            )}
            <h3 className="text-sm font-semibold text-foreground">{plan.name}</h3>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-bold text-foreground">{plan.price}</span>
              <span className="text-sm text-muted-foreground">{plan.period}</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{plan.description}</p>
            <ul className="mt-4 flex-1 space-y-2">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-xs text-foreground">
                  <Check className="mt-0.5 h-3 w-3 shrink-0 text-green-500" />
                  {feature}
                </li>
              ))}
            </ul>
            <button
              onClick={onComplete}
              className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition-all ${
                plan.highlighted
                  ? "bg-[#06264e] text-white hover:bg-[#06264e]/90"
                  : "border border-[#e0d6d0] text-foreground hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
              }`}
            >
              {plan.cta}
            </button>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
