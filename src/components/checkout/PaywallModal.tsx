"use client";

import { useRouter } from "next/navigation";
import { Sparkles, ArrowRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface PaywallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const PACKS = [
  { credits: 500, label: "Starter top-up" },
  { credits: 1000, label: "Most popular", highlighted: true },
  { credits: 2500, label: "Best value" },
] satisfies { credits: number; label: string; highlighted?: boolean }[];

const CREDIT_PRICE_CENTS = 10;

export function PaywallModal({ open, onOpenChange }: PaywallModalProps) {
  const router = useRouter();

  const handlePick = (credits: number) => {
    onOpenChange(false);
    router.push(`/checkout/credits?credits=${credits}`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#06264e]">You&apos;re out of credits</DialogTitle>
          <DialogDescription>
            Top up to keep chatting. Credits never expire.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-2">
          {PACKS.map((pack) => {
            const dollars = ((pack.credits * CREDIT_PRICE_CENTS) / 100).toFixed(0);
            return (
              <button
                key={pack.credits}
                onClick={() => handlePick(pack.credits)}
                className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-left transition-all hover:shadow-md ${
                  pack.highlighted
                    ? "border-[#06264e] bg-[#06264e]/[0.04] ring-1 ring-[#06264e]/20"
                    : "border-[#e0d6d0] bg-white/40"
                }`}
              >
                <div className="flex items-center gap-3">
                  <Sparkles className="h-4 w-4 text-[#06264e]" />
                  <div>
                    <div className="text-sm font-semibold text-foreground">
                      {pack.credits.toLocaleString()} credits
                    </div>
                    <div className="text-[11px] text-muted-foreground">{pack.label}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#06264e]">${dollars}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          Or{" "}
          <button
            onClick={() => {
              onOpenChange(false);
              router.push("/choose-your-plan");
            }}
            className="font-medium text-[#06264e] underline-offset-2 hover:underline"
          >
            change your monthly plan
          </button>
          .
        </p>
      </DialogContent>
    </Dialog>
  );
}
