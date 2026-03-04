"use client";

import { useState } from "react";
import { MoreHorizontal, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { Chat } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SidebarChatListProps {
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
}

function getTimeGroup(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days <= 7) return "Previous 7 Days";
  if (days <= 30) return "Previous 30 Days";
  return "Older";
}

function groupChats(chats: Chat[]): Record<string, Chat[]> {
  const groups: Record<string, Chat[]> = {};
  for (const chat of chats) {
    const group = getTimeGroup(chat.updatedAt);
    if (!groups[group]) groups[group] = [];
    groups[group].push(chat);
  }
  return groups;
}

export function SidebarChatList({
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
}: SidebarChatListProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const grouped = groupChats(chats);
  const groupOrder = [
    "Today",
    "Yesterday",
    "Previous 7 Days",
    "Previous 30 Days",
    "Older",
  ];

  if (chats.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-3">
        <p className="text-center text-xs text-muted-foreground">
          No conversations yet
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-2 sidebar-scroll">
      <AnimatePresence>
        {groupOrder.map((group) => {
          const items = grouped[group];
          if (!items?.length) return null;
          return (
            <div key={group} className="mb-2">
              <p className="px-2 pb-1 pt-3 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                {group}
              </p>
              {items.map((chat) => (
                <motion.button
                  key={chat.id}
                  layout
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => onSelectChat(chat.id)}
                  onMouseEnter={() => setHoveredId(chat.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  className={cn(
                    "group relative flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                    activeChatId === chat.id
                      ? "bg-[#f2dacb]/50 text-foreground"
                      : "text-muted-foreground hover:bg-[#f2dacb]/30 hover:text-foreground"
                  )}
                >
                  {activeChatId === chat.id && (
                    <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-gradient-to-b from-[#c08967] to-[#06264e]" />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {chat.title}
                  </span>
                  {hoveredId === chat.id && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteChat(chat.id);
                      }}
                      className="shrink-0 rounded p-0.5 text-muted-foreground transition-colors hover:bg-[#f2dacb] hover:text-red-400"
                    >
                      <MoreHorizontal className="hidden h-4 w-4 group-hover:hidden" />
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </motion.button>
              ))}
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
