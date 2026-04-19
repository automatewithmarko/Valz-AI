"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export interface ConversationStarter {
  title: string;
  descriptor: string;
  /** Sent as the user's first message so the AI responds with Brand DNA context. */
  userPrompt: string;
}

const starters: ConversationStarter[] = [
  {
    title: "Make My Profile Make Sense",
    descriptor:
      "Turn your bio and messaging into something that instantly explains who you help, what you do, and why people should stick around.",
    userPrompt:
      "I want to make my profile make sense. Help me turn my bio and messaging into something that instantly explains who I help, what I do, and why people should stick around.",
  },
  {
    title: "Understand My Audience Properly",
    descriptor:
      "Get clear on who you're speaking to, what their life actually looks like, and what content will genuinely resonate.",
    userPrompt:
      "Help me understand my audience properly. I want to get clear on who I'm speaking to, what their life actually looks like, and what content will genuinely resonate with them.",
  },
  {
    title: "Give Me Content That Works",
    descriptor:
      "Build your content pillars and generate scroll-stopping ideas for TikToks, Reels, carousels, and captions.",
    userPrompt:
      "I need content that actually works. Help me build my content pillars and generate scroll-stopping ideas I can use for TikToks, Reels, carousels, and captions.",
  },
  {
    title: "Help Me Sell Without Feeling Salesy",
    descriptor:
      "Create natural Instagram Story or email sequences that build trust and guide people toward your offer.",
    userPrompt:
      "I want to sell without feeling salesy. Help me create natural sequences for Instagram Stories or email that build trust and guide people toward my offer.",
  },
];

interface ChatWelcomeProps {
  onStarterClick: (starter: ConversationStarter) => void;
}

export function ChatWelcome({ onStarterClick }: ChatWelcomeProps) {
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
        <Image src="/logo.png" alt="Valzacchi.ai" width={180} height={180} className="h-auto w-auto" priority />
      </div>

      {/* Subtitle */}
      <p className="mb-8 max-w-md text-center text-base text-muted-foreground">
        What would you like help with today?
      </p>

      {/* Starter Cards */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-2.5">
        {starters.map((starter, i) => (
          <motion.button
            key={starter.title}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 + i * 0.05 }}
            onClick={() => onStarterClick(starter)}
            className="group rounded-xl border border-[#e0d6d0] bg-white/40 px-4 py-3.5 text-left transition-all hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30 hover:shadow-lg hover:shadow-[#c08967]/10"
          >
            <span className="block text-sm font-semibold text-foreground">
              {starter.title}
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              {starter.descriptor}
            </span>
          </motion.button>
        ))}
      </div>
    </motion.div>
  );
}
