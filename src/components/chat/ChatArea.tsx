"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Chat } from "@/lib/types";
import { ChatMessage } from "./ChatMessage";
import { ChatWelcome } from "./ChatWelcome";
import { ChatInput } from "./ChatInput";
import { ScrollToBottom } from "./ScrollToBottom";
import { useScrollAnchor } from "@/hooks/useScrollAnchor";

interface ChatAreaProps {
  chat: Chat | null;
  isGenerating: boolean;
  onSend: (message: string) => void;
  onRegenerate: () => void;
}

export function ChatArea({ chat, isGenerating, onSend, onRegenerate }: ChatAreaProps) {
  const { scrollRef, bottomRef, showScrollButton, scrollToBottom, scrollToBottomIfNeeded } =
    useScrollAnchor();
  const [suggestionText, setSuggestionText] = useState("");

  const hasMessages = chat && chat.messages.length > 0;

  // Auto-scroll when messages change or during streaming
  const lastMessageContent = chat?.messages[chat.messages.length - 1]?.content;
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [chat?.messages.length, lastMessageContent, scrollToBottomIfNeeded]);

  const handleSuggestionClick = useCallback((text: string) => {
    setSuggestionText(text);
    // Small delay so the input can pick it up and then clear
    setTimeout(() => {
      setSuggestionText("");
    }, 100);
  }, []);

  const handleSend = useCallback(
    (text: string) => {
      onSend(text);
      setSuggestionText("");
      setTimeout(() => scrollToBottom(), 100);
    },
    [onSend, scrollToBottom]
  );

  return (
    <div className="relative flex h-full flex-col bg-background">
      {/* Messages or Welcome */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto chat-scroll">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col">
          <AnimatePresence mode="wait">
            {hasMessages ? (
              <motion.div
                key="messages"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="flex-1 space-y-1 py-4"
              >
                {chat.messages.map((msg, i) => (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isLast={i === chat.messages.length - 1 && msg.role === "assistant"}
                    onRegenerate={onRegenerate}
                  />
                ))}
                <div ref={bottomRef} className="h-1" />
              </motion.div>
            ) : (
              <ChatWelcome key="welcome" onSuggestionClick={handleSuggestionClick} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Scroll to bottom button */}
      <ScrollToBottom show={showScrollButton} onClick={scrollToBottom} />

      {/* Input */}
      <div className="shrink-0">
      <ChatInput
        onSend={handleSend}
        isGenerating={isGenerating}
        initialValue={suggestionText || undefined}
      />
      </div>
    </div>
  );
}
