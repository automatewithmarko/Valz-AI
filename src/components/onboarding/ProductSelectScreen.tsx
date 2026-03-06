"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface ProductSelectScreenProps {
  onSelectConsulting: () => void;
}

export function ProductSelectScreen({ onSelectConsulting }: ProductSelectScreenProps) {
  return (
    <motion.div
      key="products"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
      className="flex min-h-dvh items-center justify-center bg-background px-4"
    >
      <div className="w-full max-w-sm text-center">
        {/* Logo */}
        <div className="mb-8 flex justify-center">
          <Image src="/logo.png" alt="Valz.AI" width={120} height={120} className="h-auto w-auto" priority />
        </div>

        {/* Headline */}
        <h1 className="mb-8 text-2xl font-bold text-foreground">Choose your product</h1>

        {/* Product buttons */}
        <div className="space-y-4">
          {/* Brand Building Blueprint - Blue */}
          <button
            className="w-full rounded-xl bg-[#06264e] px-6 py-5 text-left transition-all hover:bg-[#06264e]/90 hover:shadow-lg"
          >
            <p className="text-base font-semibold text-white">Brand Building Blueprint AI</p>
            <p className="mt-1 text-sm text-white/70">(one-time fee of $97)</p>
          </button>

          {/* Consulting AI - Red */}
          <button
            onClick={onSelectConsulting}
            className="w-full rounded-xl bg-[#ef4444] px-6 py-5 text-left transition-all hover:bg-[#ef4444]/90 hover:shadow-lg"
          >
            <p className="text-base font-semibold text-white">Consulting AI</p>
            <p className="mt-1 text-sm text-white/70">($15–$35/month)</p>
          </button>
        </div>
      </div>
    </motion.div>
  );
}
