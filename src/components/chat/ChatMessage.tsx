"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Message } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MessageActions } from "./MessageActions";
import { assistantProseClass } from "./prose";

interface ChatMessageProps {
  message: Message;
  isLast: boolean;
  onRegenerate?: () => void;
}

export function ChatMessage({ message, isLast, onRegenerate }: ChatMessageProps) {
  const [hovered, setHovered] = useState(false);
  const isUser = message.role === "user";

  // Show thinking indicator for empty assistant messages (waiting for stream)
  if (!isUser && !message.content) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
        className="px-4 py-2"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
            <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <span className="text-sm text-muted-foreground">
            thinking<span className="thinking-dots" />
          </span>
        </div>
      </motion.div>
    );
  }

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
          <div className="rounded-2xl bg-[#87a8d3] px-4 py-2.5 text-sm text-white">
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
            <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn("rounded-2xl bg-[#06264e] px-5 py-4", assistantProseClass)}>
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
