"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export function TypingIndicator() {
  return (
    <div className="flex items-start gap-3 px-4">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
        <Image src="/logo.png" alt="Valz.AI" width={28} height={28} className="h-7 w-7 object-cover" />
      </div>
      <div className="flex items-center gap-1 rounded-2xl bg-[#06264e] px-4 py-3">
        {[0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="h-2 w-2 rounded-full bg-white/60"
            animate={{ scale: [1, 1.3, 1], opacity: [0.4, 1, 0.4] }}
            transition={{
              duration: 1,
              repeat: Infinity,
              delay: i * 0.2,
              ease: "easeInOut",
            }}
          />
        ))}
      </div>
    </div>
  );
}
