"use client";

import { useEffect, useState } from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { getStripeClient } from "@/lib/stripe-client";

interface EmbeddedCheckoutPanelProps {
  /** Endpoint to POST to in order to fetch a fresh client_secret. */
  endpoint: string;
  /** Body to POST. Stringified as JSON. */
  body: Record<string, unknown>;
}

// Themed wrapper around Stripe Embedded Checkout. Hits our API on mount
// to create the session, then mounts Stripe's embedded form. Network
// errors surface inline with a retry button so the user doesn't have to
// hard-refresh the page.
export function EmbeddedCheckoutPanel({ endpoint, body }: EmbeddedCheckoutPanelProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    // Reset before refetch so the retry path doesn't briefly show stale
    // success/error state.
    setClientSecret(null);
    setError(null);
    (async () => {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok || !data.clientSecret) {
          throw new Error(data.error ?? "Could not start checkout");
        }
        if (!cancelled) setClientSecret(data.clientSecret);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not start checkout");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint, JSON.stringify(body), retryKey]);

  if (error) {
    return (
      <div
        role="alert"
        className="rounded-xl border border-red-200 bg-red-50/70 p-5 text-center"
      >
        <AlertCircle className="mx-auto h-7 w-7 text-red-500" aria-hidden="true" />
        <p className="mt-3 text-sm font-semibold text-red-700">
          Couldn&apos;t start checkout
        </p>
        <p className="mt-1 text-xs leading-relaxed text-red-600/80">{error}</p>
        <button
          type="button"
          onClick={() => setRetryKey((k) => k + 1)}
          className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-red-300 bg-white px-3.5 py-2 text-xs font-medium text-red-700 transition-colors hover:bg-red-100/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
        >
          <RefreshCcw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }

  if (!clientSecret) {
    // Skeleton shaped like a typical Stripe form (email + card + exp/cvc
    // + submit button) so the layout doesn't shift when the real form
    // mounts. Animation is GPU-friendly opacity pulse.
    return (
      <div
        aria-busy="true"
        aria-label="Loading payment form"
        className="overflow-hidden rounded-xl border border-[#e0d6d0] bg-white"
      >
        <div className="space-y-4 p-5">
          <SkeletonField labelWidth="w-14" />
          <SkeletonField labelWidth="w-24" />
          <div className="grid grid-cols-2 gap-3">
            <SkeletonField labelWidth="w-12" />
            <SkeletonField labelWidth="w-10" />
          </div>
          <div className="h-11 animate-pulse rounded-md bg-[#06264e]/15" />
        </div>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[#e0d6d0] bg-white shadow-sm">
      <EmbeddedCheckoutProvider stripe={getStripeClient()} options={{ clientSecret }}>
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}

function SkeletonField({ labelWidth }: { labelWidth: string }) {
  return (
    <div>
      <div className={`h-3 animate-pulse rounded bg-[#e0d6d0]/70 ${labelWidth}`} />
      <div className="mt-2 h-10 animate-pulse rounded-md bg-[#f2dacb]/30" />
    </div>
  );
}
