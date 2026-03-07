"use client";

import { useState } from "react";
import { ChevronDown, Settings, CreditCard, Sparkles, LogOut, Check, Minus, Plus } from "lucide-react";
import type { User } from "@/lib/types";
import { useAuth } from "@/components/AuthProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

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

const CREDIT_PRICE = 0.10;
const CREDIT_STEP = 50;
const MIN_CREDITS = 50;
const MAX_CREDITS = 5000;

interface SidebarProfileProps {
  user: User;
}

export function SidebarProfile({ user }: SidebarProfileProps) {
  const { signOut } = useAuth();
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState(100);

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase();

  const totalPrice = (creditAmount * CREDIT_PRICE).toFixed(2);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[#f2dacb]/30">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#06264e] text-xs font-semibold text-white">
              {initials}
            </div>
            <div className="min-w-0 flex-1 text-left">
              <p className="truncate text-sm font-semibold text-foreground">
                {user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
            </div>
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" sideOffset={8} className="w-56">
          <DropdownMenuGroup>
            <DropdownMenuItem>
              <Settings className="h-4 w-4" />
              Settings
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setSubscriptionOpen(true)}>
              <CreditCard className="h-4 w-4" />
              Subscription
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setCreditsOpen(true)}>
              <Sparkles className="h-4 w-4" />
              Buy more credits
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => signOut()}>
            <LogOut className="h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Subscription modal */}
      <Dialog open={subscriptionOpen} onOpenChange={setSubscriptionOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Choose your plan</DialogTitle>
            <DialogDescription>
              Select the plan that best fits your brand valuation needs.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {plans.map((plan, idx) => {
              const currentPlanIdx = user.planName
                ? plans.findIndex((p) => p.name.toLowerCase() === user.planName!.toLowerCase())
                : -1;
              const isCurrent = currentPlanIdx >= 0 && idx === currentPlanIdx;
              const isUpgrade = currentPlanIdx >= 0 && idx > currentPlanIdx;
              const isDowngrade = currentPlanIdx >= 0 && idx < currentPlanIdx;

              let ctaText = plan.cta;
              if (isCurrent) ctaText = "Current Plan";
              else if (isUpgrade) ctaText = "Upgrade";
              else if (isDowngrade) ctaText = "Downgrade";

              return (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-xl border p-5 transition-all ${
                    isCurrent
                      ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10 ring-2 ring-[#06264e]/20"
                      : plan.highlighted && !user.planName
                        ? "border-[#06264e] bg-[#06264e]/[0.03] shadow-lg shadow-[#06264e]/10"
                        : "border-[#e0d6d0] bg-white/40"
                  }`}
                >
                  {isCurrent ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Current Plan
                    </span>
                  ) : plan.highlighted && !user.planName ? (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#06264e] px-3 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
                      Most Popular
                    </span>
                  ) : null}
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
                    disabled={isCurrent}
                    className={`mt-5 w-full rounded-lg py-2 text-sm font-medium transition-all ${
                      isCurrent
                        ? "cursor-default border border-[#06264e]/30 bg-[#06264e]/5 text-[#06264e] opacity-80"
                        : isUpgrade || (plan.highlighted && !user.planName)
                          ? "bg-[#06264e] text-white hover:bg-[#06264e]/90"
                          : "border border-[#e0d6d0] text-foreground hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
                    }`}
                  >
                    {ctaText}
                  </button>
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Buy credits modal */}
      <Dialog open={creditsOpen} onOpenChange={(open) => { setCreditsOpen(open); if (!open) setCreditAmount(100); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Buy credits</DialogTitle>
            <DialogDescription>
              Select the number of credits you&apos;d like to purchase.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-4">
            {/* Counter */}
            <div className="flex items-center gap-4">
              <button
                onClick={() => setCreditAmount((prev) => Math.max(MIN_CREDITS, prev - CREDIT_STEP))}
                disabled={creditAmount <= MIN_CREDITS}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e0d6d0] text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Minus className="h-4 w-4" />
              </button>
              <div className="flex w-28 flex-col items-center">
                <span className="text-4xl font-bold tabular-nums text-foreground">
                  {creditAmount}
                </span>
                <span className="text-xs text-muted-foreground">credits</span>
              </div>
              <button
                onClick={() => setCreditAmount((prev) => Math.min(MAX_CREDITS, prev + CREDIT_STEP))}
                disabled={creditAmount >= MAX_CREDITS}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[#e0d6d0] text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:cursor-not-allowed disabled:opacity-30"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {/* Price */}
            <p className="text-sm text-muted-foreground">
              Total: <span className="font-semibold text-foreground">${totalPrice}</span>
            </p>
            {/* Purchase button */}
            <button className="w-full rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90">
              Purchase Credits
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
