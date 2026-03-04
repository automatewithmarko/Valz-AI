"use client";

import Image from "next/image";
import { motion } from "framer-motion";

interface ChatWelcomeProps {
  onSuggestionClick: (text: string) => void;
}

const suggestions = [
  "Estimate my brand's current valuation",
  "Analyze my brand DNA strengths",
  "How can I increase my brand value?",
  "Compare my brand to competitors",
];

export function ChatWelcome({ onSuggestionClick }: ChatWelcomeProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.4 }}
      className="flex flex-1 flex-col items-center justify-center px-4"
    >
      {/* Logo */}
      <div className="mb-6">
        <Image src="/logo.png" alt="Valz.AI" width={180} height={180} className="h-auto w-auto" priority />
      </div>

      {/* Subtitle */}
      <p className="mb-8 max-w-md text-center text-base text-muted-foreground">
        What would you like to know about your brand&apos;s value?
      </p>

      {/* Suggestion Cards */}
      <div className="grid w-full max-w-lg grid-cols-1 gap-2.5 sm:grid-cols-2">
        {suggestions.map((text, i) => (
          <motion.button
            key={text}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
            onClick={() => onSuggestionClick(text)}
            className="group rounded-xl border border-[#e0d6d0] bg-white/40 px-4 py-3.5 text-left text-sm text-muted-foreground transition-all hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30 hover:text-foreground hover:shadow-lg hover:shadow-[#c08967]/10"
          >
            {text}
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
