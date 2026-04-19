"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Menu, X } from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import { useChat } from "@/hooks/useChat";
import { useAuth } from "@/components/AuthProvider";

export default function ValzacchiAI() {
  const router = useRouter();
  const { session, loading: authLoading, user: authUser } = useAuth();

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
    startWithOpening,
    regenerateLastResponse,
    updateBrandDNADocument,
    setBrandDNAComplete,
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Auth guard — redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !session) {
      router.replace("/");
    }
  }, [authLoading, session, router]);

  // Program guard — redirect to choose program if not selected
  useEffect(() => {
    if (!authLoading && authUser && !authUser.hasSelectedProgram) {
      router.replace("/choose-program");
    }
  }, [authLoading, authUser, router]);

  // Check for brandDnaComplete query param (coming from brand DNA page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("brandDnaComplete") === "true") {
      setBrandDNAComplete();
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, [setBrandDNAComplete]);

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

  // Loading / waiting for data
  if (authLoading || !session || !user) {
    return (
      <div className="flex h-dvh overflow-hidden bg-background">
        {/* Sidebar skeleton */}
        <div className="hidden w-[280px] shrink-0 border-r border-border md:block">
          <div className="flex h-full flex-col p-4 space-y-4">
            <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 w-full animate-pulse rounded-md bg-muted/60" style={{ animationDelay: `${i * 100}ms` }} />
              ))}
            </div>
            <div className="mt-auto space-y-3">
              <div className="h-24 w-full animate-pulse rounded-lg bg-muted/40" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-muted/40" />
            </div>
          </div>
        </div>

        {/* Main area skeleton */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top bar skeleton */}
          <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
            <div className="h-5 w-5 animate-pulse rounded bg-muted" />
            <div className="h-4 w-32 animate-pulse rounded bg-muted" />
          </div>

          {/* Chat area skeleton — ghost messages */}
          <div className="min-h-0 flex-1 overflow-hidden">
            <div className="mx-auto flex max-w-3xl flex-col space-y-4 py-6 px-4">
              {/* Assistant ghost 1 */}
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="h-16 w-[80%] animate-pulse rounded-2xl bg-[#06264e]/10" />
              </div>
              {/* User ghost 1 */}
              <div className="flex justify-end">
                <div className="h-10 w-[40%] animate-pulse rounded-2xl bg-[#f2dacb]/50" style={{ animationDelay: "150ms" }} />
              </div>
              {/* Assistant ghost 2 */}
              <div className="flex items-start gap-3">
                <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
                <div className="h-28 w-[85%] animate-pulse rounded-2xl bg-[#06264e]/10" style={{ animationDelay: "300ms" }} />
              </div>
              {/* User ghost 2 */}
              <div className="flex justify-end">
                <div className="h-10 w-[30%] animate-pulse rounded-2xl bg-[#f2dacb]/50" style={{ animationDelay: "450ms" }} />
              </div>
            </div>
          </div>

          {/* Input skeleton */}
          <div className="shrink-0 px-4 pb-4">
            <div className="mx-auto max-w-3xl">
              <div className="h-[44px] w-full animate-pulse rounded-2xl border border-[#e0d6d0]/50 bg-muted/30" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Main app
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
              className="fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-sidebar"
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
