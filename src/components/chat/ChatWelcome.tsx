"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export interface ConversationStarter {
  title: string;
  descriptor: string;
  openingMessage: string;
}

const starters: ConversationStarter[] = [
  {
    title: "Make My Profile Make Sense",
    descriptor:
      "Turn your bio and messaging into something that instantly explains who you help, what you do, and why people should stick around.",
    openingMessage: `Let's make sure your profile is doing its job.

Your bio and profile should help someone land on your page and immediately understand who you help, what you do, and why they should follow or buy from you.

Share whatever feels easiest to explain. If you're not sure how to word something perfectly, that's okay. Messy context is still helpful.

Tell me what you can about:

• What your business does and what you offer
• Who you help and the result they're looking for
• What makes your approach, experience, or perspective different
• The tone or feeling you want your brand to give people
• Anything important about your story, niche, or offers that should shape your profile

If typing feels hard, just yap away. Talk through your thoughts and I'll help interpret and shape them.

Once I understand this, I'll help refine your bio and messaging so your profile communicates your value clearly and attracts the right audience.`,
  },
  {
    title: "Understand My Audience Properly",
    descriptor:
      "Get clear on who you're speaking to, what their life actually looks like, and what content will genuinely resonate.",
    openingMessage: `Great content starts with understanding the person on the other side of the screen.

The clearer you are about your audience's life, problems, desires, and mindset, the easier it becomes to create content that actually connects.

Tell me what you know about your audience:

• Who they are and what stage of life or business they're in
• What their day-to-day life currently looks like
• What problems, frustrations, or questions they're navigating
• What they wish could change or improve in their situation
• What problem your product or service is trying to solve
• Why your content, perspective, or offer would matter to them

Even if your answers feel rough or incomplete, that's completely fine. Share whatever you've got.

From this, I'll help build a clearer picture of your audience's mindset, emotional drivers, behaviours, and the messaging that will resonate most with them.`,
  },
  {
    title: "Give Me Content That Works",
    descriptor:
      "Build your content pillars and generate scroll-stopping ideas for TikToks, Reels, carousels, and captions.",
    openingMessage: `Let's make content creation easier.

This space helps define the themes your content should revolve around and then turns those themes into actual post ideas you can create.

Share whatever feels relevant:

• What your business does and what you want to be known for
• Who your content is designed to reach
• Topics you already talk about or want to explore more
• Any expertise, lived experience, stories, or opinions that shape your perspective
• Whether your main priority right now is growth, authority, trust-building, or sales
• The platform you're primarily creating for (TikTok, Instagram, etc.)

If you already have an idea you want help developing, you can also share:

• The message, story, or lesson you want to communicate
• What you want your audience to think, feel, or do after seeing it

From this, I'll help identify strong content pillars and generate content ideas that feel authentic to your voice while still being engaging and strategic.`,
  },
  {
    title: "Help Me Sell Without Feeling Salesy",
    descriptor:
      "Create natural Instagram Story or email sequences that build trust and guide people toward your offer.",
    openingMessage: `Selling works best when it feels natural and connected to the conversation you're already having with your audience.

This space helps build story or email sequences that guide people toward your offer without feeling pushy.

Tell me about what you're promoting:

• What the offer is and who it's for
• The problem it solves or the result it helps create
• What objections, hesitations, or doubts someone might have before buying
• What they need to understand or believe before saying yes
• Any details about pricing, bonuses, deadlines, or calls to action
• Whether this sequence is for Instagram Stories, email, or both

You can also share any tone preferences such as conversational, educational, storytelling, or direct.`,
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
