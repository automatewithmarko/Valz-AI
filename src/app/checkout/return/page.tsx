"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

type Status = "loading" | "success" | "processing" | "failed";

function ReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const sessionId = params.get("session_id");
  const [status, setStatus] = useState<Status>("loading");
  const [kind, setKind] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setStatus("failed");
      setErrorMsg("Missing session id.");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load session");
        if (cancelled) return;
        setKind(data.kind);
        if (data.status === "complete" && data.paymentStatus === "paid") {
          setStatus("success");
        } else if (data.status === "open") {
          setStatus("processing");
        } else {
          setStatus("failed");
          setErrorMsg("Payment was not completed.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          setErrorMsg(err instanceof Error ? err.message : "Failed to load session");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background px-4">
        <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-8 text-center shadow-sm">
          <XCircle className="mx-auto h-12 w-12 text-red-500" />
          <h1 className="mt-4 text-xl font-bold text-foreground">Payment incomplete</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {errorMsg ?? "Something went wrong with your payment."}
          </p>
          <button
            onClick={() => router.back()}
            className="mt-5 w-full rounded-lg border border-[#e0d6d0] py-2 text-sm font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  const isCredits = kind === "credit_topup";
  const isBrandDna = kind === "brand_dna";
  const heading = isCredits
    ? "Credits added"
    : isBrandDna
      ? "Aligned Income AI is ready"
      : "Welcome to Valzacchi.ai";
  const sub = isCredits
    ? "Your top-up has been processed and credits are on your account."
    : isBrandDna
      ? "Your purchase is complete. Let's start your guided discovery."
      : "Your subscription is active. Let's get to work.";
  const continueHref = isBrandDna ? "/brand-building-dna-ai" : "/valzacchi-ai";
  const continueLabel = isBrandDna ? "Start your discovery" : "Continue to Valzacchi.ai";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-xl border border-[#06264e]/15 bg-white p-8 text-center shadow-sm">
        <div className="mb-2 flex justify-center">
          <Image src="/logo.png" alt="Valzacchi.ai" width={56} height={56} className="h-14 w-14" priority />
        </div>
        <CheckCircle2 className="mx-auto h-12 w-12 text-green-500" />
        <h1 className="mt-3 text-xl font-bold text-foreground">{heading}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{sub}</p>
        {status === "processing" && (
          <p className="mt-3 rounded-lg bg-[#f2dacb]/40 px-3 py-2 text-xs text-[#06264e]">
            Still processing — refresh in a few seconds if your account hasn&apos;t updated yet.
          </p>
        )}
        <Link
          href={continueHref}
          className="mt-6 block w-full rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
        >
          {continueLabel}
        </Link>
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    }>
      <ReturnInner />
    </Suspense>
  );
}
