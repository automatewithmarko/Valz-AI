"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Tag, X, Zap } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { CheckoutShell } from "@/components/checkout/CheckoutShell";
import { OrderSummaryCard } from "@/components/checkout/OrderSummaryCard";
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
  const credits =
    Number.isInteger(raw) &&
    raw >= MIN_CREDITS &&
    raw <= MAX_CREDITS &&
    raw % CREDITS_STEP === 0
      ? raw
      : null;

  // Promo-code state. `appliedPromo` is what gets sent to the API and
  // baked into the Stripe session; `promoDraft` is the live input value.
  // Changing `appliedPromo` re-renders EmbeddedCheckoutPanel (because
  // `body` changes), which fetches a fresh clientSecret with the
  // discount applied and re-mounts the Stripe iframe.
  const [promoDraft, setPromoDraft] = useState("");
  const [appliedPromo, setAppliedPromo] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !session) router.replace("/");
  }, [authLoading, session, router]);

  const ready = !authLoading && !!session;

  if (!credits) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            Credit amount must be {MIN_CREDITS}–{MAX_CREDITS} in steps of{" "}
            {CREDITS_STEP}.
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
    <CheckoutShell
      eyebrow="Buy credits"
      title="One-time top-up"
      subtitle="Credits never expire — use them whenever you need."
      footerNote="One-time charge · Credits never expire"
      summary={
        <OrderSummaryCard
          productIcon={Zap}
          productName={`${credits.toLocaleString()} credits`}
          productMeta={`~${(credits * 1000).toLocaleString()} characters of AI chat`}
          amountLabel={`$${totalDollars}`}
          features={[
            "Credits never expire",
            "Use them across every chat and tool",
            "Stacks on top of your monthly plan",
          ]}
        />
      }
    >
      <PromoCodeRow
        applied={appliedPromo}
        draft={promoDraft}
        onDraftChange={setPromoDraft}
        onApply={() => {
          const code = promoDraft.trim();
          if (code) setAppliedPromo(code);
        }}
        onRemove={() => {
          setAppliedPromo(null);
          setPromoDraft("");
        }}
      />
      <EmbeddedCheckoutPanel
        endpoint="/api/stripe/checkout/credits"
        body={
          appliedPromo ? { credits, promoCode: appliedPromo } : { credits }
        }
      />
    </CheckoutShell>
  );
}

interface PromoCodeRowProps {
  applied: string | null;
  draft: string;
  onDraftChange: (v: string) => void;
  onApply: () => void;
  onRemove: () => void;
}

// Compact promo-code input that sits above the Stripe form. When the user
// applies a code, the parent re-renders EmbeddedCheckoutPanel with the
// new body, which creates a fresh Stripe session with the discount and
// shows the updated total inside the iframe.
function PromoCodeRow({
  applied,
  draft,
  onDraftChange,
  onApply,
  onRemove,
}: PromoCodeRowProps) {
  if (applied) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#06264e]/20 bg-[#06264e]/[0.04] px-3 py-2 text-xs">
        <Tag className="h-3.5 w-3.5 text-[#06264e]" aria-hidden="true" />
        <span className="text-foreground">
          Promo code applied:{" "}
          <span className="font-semibold text-[#06264e]">{applied}</span>
        </span>
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove promo code"
          className="ml-auto inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30"
        >
          <X className="h-3 w-3" />
          Remove
        </button>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <label
        htmlFor="promo-code"
        className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-foreground/70"
      >
        Promo code (optional)
      </label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Tag
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            id="promo-code"
            type="text"
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            placeholder="e.g. MYAEO100"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onApply();
              }
            }}
            className="w-full rounded-md border border-[#e0d6d0] bg-white px-3 py-2 pl-8 text-xs text-foreground placeholder:text-muted-foreground/60 focus:border-[#06264e] focus:outline-none focus:ring-2 focus:ring-[#06264e]/20"
          />
        </div>
        <button
          type="button"
          onClick={onApply}
          disabled={!draft.trim()}
          className="rounded-md border border-[#e0d6d0] bg-white px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30 disabled:opacity-50"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

export default function CreditsCheckoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
        </div>
      }
    >
      <CreditsCheckoutInner />
    </Suspense>
  );
}
