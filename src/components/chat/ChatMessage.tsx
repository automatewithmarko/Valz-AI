"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessageActions } from "./MessageActions";

interface ChatMessageProps {
  message: Message;
  isLast: boolean;
  onRegenerate?: () => void;
}

export function ChatMessage({ message, isLast, onRegenerate }: ChatMessageProps) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === "user";

  // Hide empty assistant messages (streaming hasn't started yet)
  if (!isUser && !message.content) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("group relative px-4 py-2", isUser ? "flex justify-end" : "")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isUser ? (
        /* User message */
        <div className="max-w-[80%]">
          <div className="rounded-2xl bg-[#f2dacb] px-4 py-2.5 text-sm text-[#c08967]">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
          <AnimatePresence>
            {hovered && (
              <div className="mt-1 flex justify-end">
                <MessageActions content={message.content} isAssistant={false} />
              </div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        /* Assistant message */
        <div className="flex max-w-full items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
            <Image src="/logo.png" alt="Valz.AI" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-[#06264e] px-4 py-3 text-white prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-white prose-p:leading-relaxed prose-p:text-white prose-strong:text-white prose-table:text-sm prose-th:py-2 prose-th:px-3 prose-th:text-white prose-td:py-2 prose-td:px-3 prose-td:text-white/90 prose-blockquote:border-l-white/40 prose-blockquote:not-italic prose-blockquote:text-white/90 prose-li:text-white/90 prose-a:text-blue-300 prose-code:text-blue-200 prose-hr:border-white/20">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {message.content}
              </ReactMarkdown>
            </div>
            <AnimatePresence>
              {(hovered || isLast) && (
                <div className="mt-2">
                  <MessageActions
                    content={message.content}
                    isAssistant={true}
                    onRegenerate={isLast ? onRegenerate : undefined}
                  />
                </div>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}
    </motion.div>
  );
}
