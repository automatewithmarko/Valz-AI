"use client";

import { useState } from "react";
import Image from "next/image";
import { motion } from "framer-motion";

interface AuthScreenProps {
  onComplete: () => void;
}

export function AuthScreen({ onComplete }: AuthScreenProps) {
  const [mode, setMode] = useState<"login" | "signup">("login");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onComplete();
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
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image src="/logo.png" alt="Valz.AI" width={120} height={120} className="h-auto w-auto" priority />
        </div>

        {/* Tab toggle */}
        <div className="mb-6 flex rounded-lg border border-[#e0d6d0] bg-white/40 p-1">
          <button
            onClick={() => setMode("login")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "login"
                ? "bg-[#06264e] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Log in
          </button>
          <button
            onClick={() => setMode("signup")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-all ${
              mode === "signup"
                ? "bg-[#06264e] text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sign up
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          {mode === "signup" && (
            <input
              type="text"
              placeholder="Full name"
              className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
            />
          )}
          <input
            type="email"
            placeholder="Email address"
            className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
          />
          <input
            type="password"
            placeholder="Password"
            className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
          />
          <button
            type="submit"
            className="w-full rounded-lg bg-[#06264e] py-3 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
          >
            {mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
    </motion.div>
  );
}
