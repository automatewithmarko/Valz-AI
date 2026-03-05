"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { useChat } from "@/hooks/useChat";

export default function Home() {
  const {
    chats,
    activeChat,
    activeChatId,
    user,
    isGenerating,
    createNewChat,
    selectChat,
    deleteChat,
    sendMessage,
    regenerateLastResponse,
    updateBrandDNADocument,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Responsive detection
  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) {
        setSidebarOpen(false);
      }
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "n") {
        e.preventDefault();
        createNewChat();
        setMobileMenuOpen(false);
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        if (isMobile) {
          setMobileMenuOpen((p) => !p);
        } else {
          setSidebarOpen((p) => !p);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [createNewChat, isMobile]);

  const handleSelectChat = useCallback(
    (id: string) => {
      selectChat(id);
      setMobileMenuOpen(false);
    },
    [selectChat]
  );

  const handleNewChat = useCallback(() => {
    createNewChat();
    setMobileMenuOpen(false);
  }, [createNewChat]);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Desktop sidebar */}
      {!isMobile && (
        <motion.div
          initial={false}
          animate={{ width: sidebarOpen ? 280 : 0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          className="shrink-0 overflow-hidden"
        >
          <div className="h-full w-[280px] border-r border-border">
            <Sidebar
              user={user}
              chats={chats}
              activeChatId={activeChatId}
              onSelectChat={handleSelectChat}
              onDeleteChat={deleteChat}
              onNewChat={handleNewChat}
              onUploadBrandDNADocument={updateBrandDNADocument}
            />
          </div>
        </motion.div>
      )}

      {/* Mobile sidebar overlay */}
      <AnimatePresence>
        {isMobile && mobileMenuOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-40 bg-black/60"
              onClick={() => setMobileMenuOpen(false)}
            />
            <motion.div
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border"
            >
              <Sidebar
                user={user}
                chats={chats}
                activeChatId={activeChatId}
                onSelectChat={handleSelectChat}
                onDeleteChat={deleteChat}
                onNewChat={handleNewChat}
                onUploadBrandDNADocument={updateBrandDNADocument}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col bg-background">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
          <button
            onClick={() => {
              if (isMobile) {
                setMobileMenuOpen((p) => !p);
              } else {
                setSidebarOpen((p) => !p);
              }
            }}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
            aria-label="Toggle sidebar"
          >
            {isMobile && mobileMenuOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
          <span className="text-sm font-medium text-foreground">
            {activeChat?.title ?? "New Chat"}
          </span>
        </div>

        {/* Chat area */}
        <ChatArea
          chat={activeChat}
          isGenerating={isGenerating}
          onSend={sendMessage}
          onRegenerate={regenerateLastResponse}
        />
      </div>
    </div>
  );
}
