"use client";

import { Suspense, useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

type Status = "loading" | "success" | "processing" | "failed";

function ReturnInner() {
  const router = useRouter();
  const params = useSearchParams();
  const { refreshUser } = useAuth();
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
        const res = await fetch(
          `/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Failed to load session");
        if (cancelled) return;
        setKind(data.kind);
        // "no_payment_required" covers 100%-off promo codes — Stripe still
        // completes the session, it just doesn't take a payment.
        const settled =
          data.paymentStatus === "paid" ||
          data.paymentStatus === "no_payment_required";
        if (data.status === "complete" && settled) {
          setStatus("success");
          // Pull the freshly-written subscription/credits/etc. into the
          // AuthProvider so the next page doesn't see stale state and
          // bounce the user to /choose-program.
          refreshUser().catch(() => {});
        } else if (data.status === "open") {
          setStatus("processing");
        } else {
          setStatus("failed");
          setErrorMsg("Payment was not completed.");
        }
      } catch (err) {
        if (!cancelled) {
          setStatus("failed");
          setErrorMsg(
            err instanceof Error ? err.message : "Failed to load session"
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionId, refreshUser]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
        <p className="text-sm text-muted-foreground">
          Confirming your payment…
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="relative min-h-dvh bg-background">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-red-100/40 via-red-50/25 to-transparent"
        />
        <div className="relative flex min-h-dvh items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-8 text-center shadow-sm"
          >
            <motion.div
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{
                type: "spring",
                stiffness: 220,
                damping: 18,
                delay: 0.05,
              }}
              className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-red-50 ring-4 ring-red-50/60"
            >
              <XCircle className="h-8 w-8 text-red-500" aria-hidden="true" />
            </motion.div>
            <h1 className="mt-4 text-xl font-bold text-foreground">
              Payment incomplete
            </h1>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
              {errorMsg ?? "Something went wrong with your payment."}
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <button
                onClick={() => router.back()}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/40"
              >
                Try again
              </button>
              <Link
                href="/"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Back to home
              </Link>
            </div>
          </motion.div>
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
  const continueLabel = isBrandDna
    ? "Start your discovery"
    : "Continue to Valzacchi.ai";

  return (
    <div className="relative min-h-dvh bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#f2dacb]/40 via-[#f2dacb]/15 to-transparent"
      />
      <div className="relative flex min-h-dvh items-center justify-center px-4">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="w-full max-w-md rounded-2xl border border-[#06264e]/15 bg-white p-8 text-center shadow-sm"
        >
          <div className="mb-3 flex justify-center">
            <Image
              src="/logo.png"
              alt="Valzacchi.ai"
              width={56}
              height={56}
              className="h-14 w-14"
              priority
            />
          </div>

          <motion.div
            initial={{ scale: 0.5, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 18,
              delay: 0.1,
            }}
            className="mx-auto inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50 ring-4 ring-green-50/60"
          >
            <CheckCircle2
              className="h-10 w-10 text-green-500"
              strokeWidth={2.2}
              aria-hidden="true"
            />
          </motion.div>

          <h1 className="mt-4 text-2xl font-bold text-foreground">{heading}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {sub}
          </p>

          {status === "processing" && (
            <p className="mt-4 rounded-lg bg-[#f2dacb]/40 px-3 py-2.5 text-xs text-[#06264e]">
              Still processing — refresh in a few seconds if your account
              hasn&apos;t updated yet.
            </p>
          )}

          <Link
            href={continueHref}
            className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/40"
          >
            {continueLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </motion.div>
      </div>
    </div>
  );
}

export default function CheckoutReturnPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
        </div>
      }
    >
      <ReturnInner />
    </Suspense>
  );
}
