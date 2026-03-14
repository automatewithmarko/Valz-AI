"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useAuth } from "@/components/AuthProvider";

interface AuthScreenProps {
  onComplete: () => void;
}

export function AuthScreen({ onComplete }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { signIn, signUp } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      if (mode === "signup") {
        if (!fullName.trim()) {
          setError("Please enter your full name.");
          setIsLoading(false);
          return;
        }
        const { error: signUpError } = await signUp(email, password, fullName.trim());
        if (signUpError) {
          setError(signUpError);
        } else {
          // No email confirmation required — user is logged in immediately
          onComplete();
        }
      } else {
        const { error: signInError } = await signIn(email, password);
        if (signInError) {
          setError(signInError);
        } else {
          onComplete();
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <motion.div
      key="auth"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-6 flex justify-center">
          <Image src="/logo.png" alt="Valz.AI" width={120} height={120} className="h-auto w-auto" priority />
        </div>

        <h1 className="mb-3 text-center text-xl font-semibold text-[#06264e]">
          Welcome to Valzacchi AI
        </h1>
        <p className="mb-6 text-center text-sm leading-relaxed text-muted-foreground">
          Built for founders, creators, and anyone figuring out how to grow online without losing themselves in it. This is where you get clear on your brand, nail what you&apos;re selling, and build content that actually gets results and sounds like nobody but you.
        </p>

        {/* Tab toggle */}
        <div className="mb-6 flex rounded-lg border border-[#e0d6d0] bg-white/40 p-1">
          <button
            onClick={() => { setMode("login"); setError(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "login"
                ? "bg-[#06264e] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => { setMode("signup"); setError(null); }}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "signup"
                ? "bg-[#06264e] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
              required
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
            required
            minLength={6}
          />
          <button
            type="submit"
            disabled={isLoading}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-70"
          >
            {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
