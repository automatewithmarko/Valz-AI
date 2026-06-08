"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Check,
  Copy,
  Headset,
  Loader2,
  MessageCircle,
  Send,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Step = "form" | "success";

export function SupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ticketNumber, setTicketNumber] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Focus the first field and wire up Escape-to-close when the panel opens.
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => nameRef.current?.focus(), 120);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The widget belongs to the customer app, not the admin panel.
  if (pathname?.startsWith("/admin")) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/support/ticket", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setTicketNumber(data.ticketNumber);
      setStep("success");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setStep("form");
    setName("");
    setEmail("");
    setMessage("");
    setTicketNumber(null);
    setError(null);
    setCopied(false);
  }

  function closeAll() {
    setOpen(false);
    // Reset shortly after the close animation so it doesn't flash mid-fade.
    setTimeout(reset, 250);
  }

  async function copyTicket() {
    if (!ticketNumber) return;
    try {
      await navigator.clipboard.writeText(ticketNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard may be blocked; ignore */
    }
  }

  const inputCls =
    "w-full rounded-lg border border-[#e0d6d0] bg-white px-3 py-2 text-sm text-[#09090b] outline-none transition-colors placeholder:text-[#9a8e85] focus:border-[#c08967] focus:ring-2 focus:ring-[#c08967]/30 dark:border-[#3a2a1e] dark:bg-[#1a1510] dark:text-[#f6f1ee]";

  return (
    <>
      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.96 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            style={{ transformOrigin: "bottom right" }}
            role="dialog"
            aria-label="Support"
            className="fixed bottom-[5.5rem] right-4 z-50 flex max-h-[min(560px,calc(100dvh-7rem))] w-[calc(100vw-2rem)] max-w-[370px] flex-col overflow-hidden rounded-2xl border border-[#e0d6d0] bg-[#f6f1ee] shadow-2xl dark:border-[#3a2a1e] dark:bg-[#231e18]"
          >
            {/* Header */}
            <div className="relative shrink-0 bg-[#06264e] px-4 py-4 text-white">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-full bg-white/15">
                  <Headset className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">Valzacchi Support</p>
                  <p className="text-xs text-white/70">
                    We typically reply within a day
                  </p>
                </div>
              </div>
              <button
                onClick={closeAll}
                aria-label="Close support"
                className="absolute right-3 top-3 flex size-7 cursor-pointer items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-4">
              {step === "form" ? (
                <>
                  <div className="mb-4 flex gap-2.5">
                    <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-[#06264e] text-white dark:bg-[#c08967] dark:text-[#1a1510]">
                      <MessageCircle className="size-3.5" />
                    </div>
                    <div className="rounded-2xl rounded-tl-sm bg-white px-3 py-2 text-sm text-[#09090b] shadow-sm dark:bg-[#1a1510] dark:text-[#f6f1ee]">
                      Hi there! Tell us a bit about your question and our team will
                      get back to you by email.
                    </div>
                  </div>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sw-name"
                        className="text-xs font-medium text-[#71717a] dark:text-[#9a8e85]"
                      >
                        Your name
                      </label>
                      <input
                        id="sw-name"
                        ref={nameRef}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={120}
                        placeholder="Jane Doe"
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sw-email"
                        className="text-xs font-medium text-[#71717a] dark:text-[#9a8e85]"
                      >
                        Email address
                      </label>
                      <input
                        id="sw-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        maxLength={200}
                        placeholder="you@example.com"
                        className={inputCls}
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label
                        htmlFor="sw-message"
                        className="text-xs font-medium text-[#71717a] dark:text-[#9a8e85]"
                      >
                        How can we help?
                      </label>
                      <textarea
                        id="sw-message"
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        required
                        rows={4}
                        maxLength={4000}
                        placeholder="Describe your question or issue…"
                        className={cn(inputCls, "resize-none")}
                      />
                    </div>

                    {error && (
                      <p
                        role="alert"
                        className="rounded-md bg-destructive/10 px-2.5 py-1.5 text-xs text-destructive"
                      >
                        {error}
                      </p>
                    )}

                    <button
                      type="submit"
                      disabled={submitting}
                      className="flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg bg-[#06264e] text-sm font-semibold text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60 dark:bg-[#c08967] dark:text-[#1a1510]"
                    >
                      {submitting ? (
                        <Loader2 className="size-4 animate-spin" />
                      ) : (
                        <Send className="size-4" />
                      )}
                      {submitting ? "Sending…" : "Send message"}
                    </button>
                  </form>
                </>
              ) : (
                <div className="flex flex-col items-center px-2 py-4 text-center">
                  <div className="mb-3 flex size-14 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                    <Check className="size-7" />
                  </div>
                  <p className="text-base font-semibold text-foreground">
                    Support ticket created
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Thanks{name ? `, ${name.split(" ")[0]}` : ""}! Our team will get
                    back to you at{" "}
                    <span className="font-medium text-foreground">{email}</span>.
                  </p>

                  <button
                    onClick={copyTicket}
                    className="mt-4 flex cursor-pointer items-center gap-2 rounded-lg border border-[#e0d6d0] bg-white px-3 py-2 dark:border-[#3a2a1e] dark:bg-[#1a1510]"
                    title="Copy ticket number"
                  >
                    <span className="font-mono text-sm font-semibold tracking-wide text-[#a96f47] dark:text-[#d6a07c]">
                      {ticketNumber}
                    </span>
                    {copied ? (
                      <Check className="size-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="size-3.5 text-muted-foreground" />
                    )}
                  </button>
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Keep this number for your reference.
                  </p>

                  <div className="mt-5 flex w-full gap-2">
                    <button
                      onClick={reset}
                      className="h-9 flex-1 cursor-pointer rounded-lg border border-[#e0d6d0] bg-transparent text-sm font-medium text-foreground transition-colors hover:bg-white/60 dark:border-[#3a2a1e] dark:hover:bg-[#1a1510]"
                    >
                      New request
                    </button>
                    <button
                      onClick={closeAll}
                      className="h-9 flex-1 cursor-pointer rounded-lg bg-[#06264e] text-sm font-semibold text-white transition-colors hover:bg-[#06264e]/90 dark:bg-[#c08967] dark:text-[#1a1510]"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Launcher */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close support" : "Open support chat"}
        aria-expanded={open}
        className="fixed bottom-4 right-4 z-40 flex size-14 cursor-pointer items-center justify-center rounded-full bg-[#06264e] text-white shadow-xl transition-all hover:scale-105 hover:bg-[#06264e]/90 active:scale-95 dark:bg-[#c08967] dark:text-[#1a1510]"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? "x" : "chat"}
            initial={{ opacity: 0, rotate: -45, scale: 0.6 }}
            animate={{ opacity: 1, rotate: 0, scale: 1 }}
            exit={{ opacity: 0, rotate: 45, scale: 0.6 }}
            transition={{ duration: 0.15 }}
          >
            {open ? (
              <X className="size-6" />
            ) : (
              <MessageCircle className="size-6" />
            )}
          </motion.span>
        </AnimatePresence>
      </button>
    </>
  );
}
