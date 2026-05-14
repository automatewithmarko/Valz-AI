"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

interface CheckoutShellProps {
  eyebrow: string;
  title: string;
  subtitle?: string;
  summary: ReactNode;
  children: ReactNode;
  footerNote?: string;
}

// Shared chrome around every /checkout/* page: back link, branded header,
// soft warm backdrop, order-summary slot, payment slot, and a trust footer.
// Pure presentation — no fetching, no routing logic of its own beyond the
// "Back" affordance (router.back(), matching prior behavior).
export function CheckoutShell({
  eyebrow,
  title,
  subtitle,
  summary,
  children,
  footerNote = "Cancel anytime · Secure checkout",
}: CheckoutShellProps) {
  const router = useRouter();

  return (
    <div className="relative min-h-dvh bg-background">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-gradient-to-b from-[#f2dacb]/30 via-[#f2dacb]/10 to-transparent"
      />

      <div className="relative mx-auto max-w-2xl px-4 py-8 sm:py-12">
        <button
          onClick={() => router.back()}
          aria-label="Go back"
          className="-ml-2 inline-flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#06264e]/30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <motion.header
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="mt-5 flex items-start gap-4"
        >
          <div className="shrink-0 rounded-xl bg-white p-1.5 shadow-sm ring-1 ring-[#e0d6d0]">
            <Image
              src="/logo.png"
              alt="Valzacchi.ai"
              width={44}
              height={44}
              className="h-11 w-11"
              priority
            />
          </div>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#06264e]/70">
              {eyebrow}
            </p>
            <h1 className="mt-0.5 text-2xl font-bold leading-tight text-foreground">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {subtitle}
              </p>
            )}
          </div>
        </motion.header>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          aria-label="Order summary"
          className="mt-7"
        >
          {summary}
        </motion.section>

        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          aria-label="Payment"
          className="mt-6"
        >
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-foreground/70">
              Payment
            </span>
            <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Encrypted
            </span>
          </div>
          {children}
        </motion.section>

        <div className="mt-6 flex flex-col items-center gap-1.5 text-center">
          <div className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Secure payment powered by Stripe
          </div>
          <p className="text-[11px] text-muted-foreground/80">{footerNote}</p>
        </div>
      </div>
    </div>
  );
}
