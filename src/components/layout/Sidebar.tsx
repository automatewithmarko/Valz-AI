"use client";

import { MessageSquarePlus } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { SidebarProfile } from "./SidebarProfile";
import { SidebarBrandDNA } from "./SidebarBrandDNA";
import { SidebarCredits } from "./SidebarCredits";
import { SidebarChatList } from "./SidebarChatList";
import { SidebarFooter } from "./SidebarFooter";
import type { Chat, User } from "@/lib/types";

interface SidebarProps {
  user: User;
  chats: Chat[];
  activeChatId: string | null;
  onSelectChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onNewChat: () => void;
  onUploadBrandDNADocument: (index: number, fileName: string) => void;
}

export function Sidebar({
  user,
  chats,
  activeChatId,
  onSelectChat,
  onDeleteChat,
  onNewChat,
  onUploadBrandDNADocument,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col overflow-hidden bg-sidebar">
      {/* Profile */}
      <div className="shrink-0 p-3 pb-2">
        <SidebarProfile user={user} />
      </div>

      <Separator className="mx-3 w-auto shrink-0 bg-border" />

      {/* Brand DNA */}
      <div className="shrink-0 py-3">
        <SidebarBrandDNA brandDNA={user.brandDNA} onUploadDocument={onUploadBrandDNADocument} />
      </div>

      <Separator className="mx-3 w-auto shrink-0 bg-border" />

      {/* Credits */}
      <div className="shrink-0 py-3">
        <SidebarCredits user={user} />
      </div>

      <Separator className="mx-3 w-auto shrink-0 bg-border" />

      {/* New Chat Button */}
      <div className="shrink-0 px-3 pt-3 pb-1">
        <button
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-foreground transition-all hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
        >
          <MessageSquarePlus className="h-4 w-4" />
          New Chat
        </button>
      </div>

      {/* Chat History */}
      <SidebarChatList
        chats={chats}
        activeChatId={activeChatId}
        onSelectChat={onSelectChat}
        onDeleteChat={onDeleteChat}
      />

      {/* Footer */}
      <SidebarFooter />
    </div>
  );
}
