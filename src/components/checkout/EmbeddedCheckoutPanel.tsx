"use client";

import { useEffect, useState } from "react";
import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { Loader2 } from "lucide-react";
import { getStripeClient } from "@/lib/stripe-client";

interface EmbeddedCheckoutPanelProps {
  /** Endpoint to POST to in order to fetch a fresh client_secret. */
  endpoint: string;
  /** Body to POST. Stringified as JSON. */
  body: Record<string, unknown>;
}

// Themed wrapper around Stripe Embedded Checkout. Hits our API on mount
// to create the session, then mounts Stripe's embedded form. Any errors
// surface inline so the user doesn't get bounced.
export function EmbeddedCheckoutPanel({ endpoint, body }: EmbeddedCheckoutPanelProps) {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
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
  }, [endpoint, JSON.stringify(body)]);

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!clientSecret) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-xl border border-[#e0d6d0] bg-white/40">
        <Loader2 className="h-6 w-6 animate-spin text-[#06264e]" />
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
