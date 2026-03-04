"use client";

import { useState } from "react";
import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { motion } from "framer-motion";

interface MessageActionsProps {
  content: string;
  isAssistant: boolean;
  onRegenerate?: () => void;
}

export function MessageActions({
  content,
  isAssistant,
  onRegenerate,
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [feedback, setFeedback] = useState<"up" | "down" | null>(null);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.15 }}
      className="flex items-center gap-0.5"
    >
      <button
        onClick={handleCopy}
        className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
        aria-label="Copy message"
      >
        {copied ? (
          <Check className="h-3.5 w-3.5 text-green-500" />
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        onClick={() => setFeedback(feedback === "up" ? null : "up")}
        className={`rounded-md p-1.5 transition-colors hover:bg-[#f2dacb]/50 ${
          feedback === "up" ? "text-green-500" : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Thumbs up"
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => setFeedback(feedback === "down" ? null : "down")}
        className={`rounded-md p-1.5 transition-colors hover:bg-[#f2dacb]/50 ${
          feedback === "down" ? "text-red-400" : "text-muted-foreground hover:text-foreground"
        }`}
        aria-label="Thumbs down"
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {isAssistant && onRegenerate && (
        <button
          onClick={onRegenerate}
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
          aria-label="Regenerate response"
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </button>
      )}
    </motion.div>
  );
}
