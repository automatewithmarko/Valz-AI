"use client";

import { ArrowDown } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ScrollToBottomProps {
  show: boolean;
  onClick: () => void;
}

export function ScrollToBottom({ show, onClick }: ScrollToBottomProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          onClick={onClick}
          className="absolute bottom-32 left-1/2 z-10 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-[#e0d6d0] bg-white/80 text-muted-foreground shadow-lg transition-colors hover:bg-[#f2dacb]/40 hover:text-foreground"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-4 w-4" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
