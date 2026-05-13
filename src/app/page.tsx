"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";
import { AuthScreen } from "@/components/onboarding/AuthScreen";

type Screen = "loading" | "auth";

export default function Home() {
  const router = useRouter();
  const { session, loading: authLoading, user: authUser, dataReady } = useAuth();
  const [screen, setScreen] = useState<Screen>("loading");

  // Determine screen based on auth state + program selection
  useEffect(() => {
    if (authLoading) {
      setScreen("loading");
      return;
    }

    if (!session) {
      setScreen("auth");
      return;
    }

    // Session exists but user data still loading
    if (!authUser) return;

    // Hold the loading screen until entitlement flags are real DB-backed
    // values, not the auth-metadata fallback (which defaults all flags to
    // false). Without this, a freshly-subscribed user gets routed to
    // /choose-program for a flicker before the subscription row loads.
    if (!dataReady) return;

    // User is authenticated — route them to the right place
    if (authUser.hasSelectedProgram) {
      // Has a monthly subscription → go to Valzacchi AI chat
      if (authUser.hasActiveSubscription) {
        router.replace("/valzacchi-ai");
      } else {
        // Has Brand DNA only → go to Brand DNA builder
        router.replace("/brand-building-dna-ai");
      }
    } else {
      // No program selected — go to program selection
      router.replace("/choose-program");
    }
  }, [authLoading, session, authUser, dataReady, router]);

  // Loading screen
  if (screen === "loading") {
    return (
      <div className="flex h-dvh items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
      </div>
    );
  }

  // Auth screen
  if (screen === "auth") {
    return (
      <AnimatePresence mode="wait">
        <AuthScreen onComplete={() => {/* routing handled by useEffect */}} />
      </AnimatePresence>
    );
  }

  // Fallback loading (during redirect)
  return (
    <div className="flex h-dvh items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-[#06264e]" />
    </div>
  );
}
