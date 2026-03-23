"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Download, Eye, EyeOff, Home, Loader2, LogOut, Mic, MicOff, Save, User, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import { downloadBrandDNA } from "@/lib/brand-pdf";
import { ScrollToBottom } from "@/components/chat/ScrollToBottom";
import { useScrollAnchor } from "@/hooks/useScrollAnchor";
import { useAutoResize } from "@/hooks/useAutoResize";
import { useAuth } from "@/components/AuthProvider";
import { createClient } from "@/lib/supabase/client";
import {
  createBrandDNA,
  getPrimaryBrandDNA,
  getBrandDNAChatMessages,
  insertBrandDNAChatMessage,
  updateBrandDNA,
} from "@/lib/supabase/db";
import type { Message } from "@/lib/types";

const COMPLETION_MARKER = "===BRAND_DNA_COMPLETE===";
const EDIT_COMPLETION_MARKER = "===BRAND_DNA_EDIT_COMPLETE===";

async function streamResponse(
  messages: { role: string; content: string }[],
  onChunk: (text: string) => void,
  abortSignal?: AbortSignal,
  options?: { mode?: string; brandDnaContent?: string }
): Promise<string> {
  const res = await fetch("/api/brand-chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, ...options }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const error = await res.text();
    throw new Error(`API error: ${error}`);
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let fullContent = "";
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) {
            fullContent += delta;
            onChunk(fullContent);
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    // Re-throw abort (user cancellation) so callers can handle it
    if ((err as Error).name === "AbortError") throw err;
    // For network drops, timeouts, etc. — return what we have instead of throwing
    console.error("Stream interrupted:", err);
  }

  return fullContent;
}

// Custom message component for brand building
function BrandMessage({
  message,
  isComplete,
  hasSubscription,
}: {
  message: Message;
  isComplete: boolean;
  hasSubscription: boolean;
}) {
  const [downloading, setDownloading] = useState(false);
  const router = useRouter();
  const isUser = message.role === "user";

  if (!isUser && !message.content) return null;

  // Detect blueprint messages
  const isBlueprintMessage = !isUser && message.content.includes("# YOUR IDENTITY");
  const hasCompletionMarker =
    message.content.includes(COMPLETION_MARKER) ||
    message.content.includes(EDIT_COMPLETION_MARKER);
  const isBlueprintComplete = isBlueprintMessage && (hasCompletionMarker || isComplete);
  const isBlueprintStreaming = isBlueprintMessage && !isBlueprintComplete;

  // Blueprint is being generated — show a loading card instead of the raw text
  if (isBlueprintStreaming) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative px-4 py-2"
      >
        <div className="flex max-w-full items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
            <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-[#06264e] px-5 py-4 text-white">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                <p className="text-sm font-medium">Building your Aligned Income Blueprint...</p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Blueprint is complete — show success card with download button and Back Pocket AI CTA
  if (isBlueprintComplete) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="group relative px-4 py-2"
      >
        <div className="flex max-w-full items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
            <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-[#06264e] px-5 py-4 text-white">
              <p className="text-sm font-semibold">Your Aligned Income Blueprint is complete!</p>
              <p className="mt-1.5 text-sm text-white/80">
                I&apos;ve built your completely personalised blueprint to create income online in total alignment with how you best operate, harnessing what you&apos;re already naturally good at and your unique life experiences. This is all ready for you to follow the blueprint and start making an incredible income in the most aligned way.
              </p>
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadBrandDNA(message.content);
                  } finally {
                    setDownloading(false);
                  }
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a3a6e] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0d4a8a] disabled:opacity-70"
              >
                {downloading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {downloading ? "Generating PDF..." : "Download Your Aligned Income Blueprint"}
              </motion.button>
              <p className="mt-4 text-sm text-white/80">
                Ready to keep the momentum going? Because this is just the beginning. Now that you know what you&apos;re building, <strong className="text-white">The Back Pocket AI</strong> helps you bring it to life. From fleshing out your offer and nailing your messaging to mapping out a full social media launch plan, it&apos;s your on-demand strategist for everything that comes next. The idea is yours. Let&apos;s go build it.
              </p>
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.5 }}
                onClick={() => {
                  if (hasSubscription) {
                    router.push("/valzacchi-ai");
                  } else {
                    router.push("/choose-your-plan");
                  }
                }}
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[#0a3a6e] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0d4a8a]"
              >
                {hasSubscription ? "Go to Back Pocket AI" : "Get the Back Pocket AI"}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Regular messages — render normally
  const displayContent = message.content
    .replace(COMPLETION_MARKER, "")
    .replace(EDIT_COMPLETION_MARKER, "")
    .trim();

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className={cn("group relative px-4 py-2", isUser ? "flex justify-end" : "")}
    >
      {isUser ? (
        <div className="max-w-[80%]">
          <div className="rounded-2xl bg-[#87a8d3] px-4 py-2.5 text-sm text-white">
            <p className="whitespace-pre-wrap">{message.content}</p>
          </div>
        </div>
      ) : (
        <div className="flex max-w-full items-start gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
            <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="rounded-2xl bg-[#06264e] px-4 py-3 text-white prose prose-sm prose-invert max-w-none prose-headings:font-semibold prose-headings:text-white prose-p:leading-relaxed prose-p:text-white prose-strong:text-white prose-table:text-sm prose-th:py-2 prose-th:px-3 prose-th:text-white prose-td:py-2 prose-td:px-3 prose-td:text-white/90 prose-blockquote:border-l-white/40 prose-blockquote:not-italic prose-blockquote:text-white/90 prose-li:text-white/90 prose-a:text-blue-300 prose-code:text-blue-200 prose-hr:border-white/20">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayContent}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// Profile / Settings modal — wired to real auth user
function ProfileModal({
  onClose,
  onShowPricing,
}: {
  onClose: () => void;
  onShowPricing: () => void;
}) {
  const { user: authUser, supabaseUser } = useAuth();
  const router = useRouter();

  const userEmail = authUser?.email || supabaseUser?.email || "";
  const hasSubscription = authUser?.hasActiveSubscription ?? false;
  const planName = authUser?.planName ?? null;

  const [changingPassword, setChangingPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);
  const supabase = createClient();

  const handlePasswordSave = async () => {
    if (newPassword.length < 6) return;
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        console.error("Failed to update password:", error);
        return;
      }
      setPasswordSaved(true);
      setTimeout(() => {
        setPasswordSaved(false);
        setChangingPassword(false);
        setNewPassword("");
      }, 1500);
    } catch (err) {
      console.error("Failed to update password:", err);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ duration: 0.25 }}
        className="relative max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-background p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#06264e]">
            <User className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{authUser?.name || "User"}</p>
            <p className="text-xs text-muted-foreground">{userEmail}</p>
          </div>
        </div>

        {/* Email */}
        <div className="mb-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Account
          </p>
          <div>
            <p className="text-sm font-medium text-foreground">Email</p>
            <p className="mt-0.5 rounded bg-[#06264e]/[0.06] px-2 py-0.5 text-xs text-muted-foreground">
              {userEmail}
            </p>
          </div>
        </div>

        <div className="my-3 border-t border-border" />

        {/* Security */}
        <div className="mb-4">
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Security
          </p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Password</p>
              <p className="text-xs text-muted-foreground">
                {changingPassword ? "Enter your new password" : "Update your account password"}
              </p>
            </div>
            {!changingPassword && (
              <button
                onClick={() => setChangingPassword(true)}
                className="shrink-0 rounded-lg border border-[#e0d6d0] px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30"
              >
                Change Password
              </button>
            )}
          </div>
          <AnimatePresence>
            {changingPassword && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="mt-3 space-y-2">
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="w-full rounded-lg border border-[#e0d6d0] bg-white/60 px-3 py-2 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus:border-[#c08967]/50 focus:outline-none"
                      placeholder="New password (min. 6 characters)"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setShowNew((p) => !p)}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showNew ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setChangingPassword(false);
                        setNewPassword("");
                      }}
                      className="flex-1 rounded-lg border border-[#e0d6d0] py-2 text-xs font-medium text-foreground transition-colors hover:bg-[#f2dacb]/30"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handlePasswordSave}
                      disabled={newPassword.length < 6 || passwordSaved}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#06264e] py-2 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60"
                    >
                      {passwordSaved ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          Saved
                        </>
                      ) : (
                        "Save Password"
                      )}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="my-3 border-t border-border" />

        {/* Plan */}
        <div>
          <p className="mb-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Plan
          </p>
          <div className="rounded-lg border border-border bg-[#f2dacb]/10 p-3">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
              </span>
              <p className="text-sm font-medium text-foreground">Brand Building Blueprint</p>
            </div>
            <p className="mt-1 ml-4 text-xs text-muted-foreground">Active</p>

            {hasSubscription && (
              <div className="mt-2 flex items-center gap-2">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                </span>
                <p className="text-sm font-medium text-foreground">{planName || "Consulting AI"}</p>
              </div>
            )}
          </div>

          {hasSubscription ? (
            <button
              onClick={() => {
                onClose();
                router.push("/valzacchi-ai");
              }}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-[#06264e] py-2.5 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90"
            >
              <Home className="h-3.5 w-3.5" />
              Go to Back Pocket AI
            </button>
          ) : (
            <button
              onClick={() => {
                onClose();
                onShowPricing();
              }}
              className="mt-3 w-full rounded-lg bg-[#06264e] py-2.5 text-xs font-medium text-white transition-colors hover:bg-[#06264e]/90"
            >
              Get Marketing AI
            </button>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// Custom input that can become a CTA button
function BrandInput({
  onSend,
  isGenerating,
  isComplete,
  onGetMarketing,
  hasSubscription,
  isEditMode,
  isEditComplete,
  onSaveBrandDNA,
  onContinueEditing,
  isSaving,
}: {
  onSend: (msg: string) => void;
  isGenerating: boolean;
  isComplete: boolean;
  onGetMarketing: () => void;
  hasSubscription: boolean;
  isEditMode?: boolean;
  isEditComplete?: boolean;
  onSaveBrandDNA?: () => void;
  onContinueEditing?: () => void;
  isSaving?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const { ref, resize } = useAutoResize(200);
  const canSend = value.trim().length > 0 && !isGenerating;

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in your browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    let finalTranscript = "";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interim += transcript;
        }
      }
      setValue(() => finalTranscript + interim);
      resize();
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    finalTranscript = value;
    recognition.start();
    setIsListening(true);
  }, [isListening, value, resize]);

  const handleSend = useCallback(() => {
    if (!canSend) return;
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
    }
    onSend(value.trim());
    setValue("");
    if (ref.current) {
      ref.current.style.height = "44px";
      ref.current.style.overflowY = "hidden";
    }
    setTimeout(() => ref.current?.focus(), 0);
  }, [canSend, onSend, value, ref, isListening]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  // Edit mode: show Save / Continue Editing buttons when edit is complete
  if (isEditMode && isEditComplete) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex gap-3"
        >
          <button
            onClick={onContinueEditing}
            disabled={isSaving}
            className="flex-1 rounded-2xl border border-[#e0d6d0] py-4 text-sm font-medium text-foreground transition-colors hover:border-[#c08967]/40 hover:bg-[#f2dacb]/30 disabled:opacity-60"
          >
            Continue Editing
          </button>
          <button
            onClick={onSaveBrandDNA}
            disabled={isSaving}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#06264e] py-4 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 disabled:opacity-60"
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isSaving ? "Saving..." : "Save Brand DNA"}
          </button>
        </motion.div>
      </div>
    );
  }

  // Build mode: show CTA after blueprint is complete
  if (isComplete && !isEditMode) {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 pb-4">
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          onClick={() => {
            if (hasSubscription) {
              router.push("/valzacchi-ai");
            } else {
              onGetMarketing();
            }
          }}
          className="w-full rounded-2xl bg-[#06264e] py-4 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90 flex items-center justify-center gap-2"
        >
          {hasSubscription ? (
            <>
              <Home className="h-4 w-4" />
              Go to Back Pocket AI
            </>
          ) : (
            "Get Marketing AI"
          )}
        </motion.button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-4">
      <div
        className={cn(
          "relative flex items-center rounded-2xl border transition-all",
          "bg-white/60",
          "border-[#e0d6d0]",
          "focus-within:border-[#c08967]/50",
          "focus-within:shadow-[0_0_0_1px_rgba(192,137,103,0.15),0_0_15px_rgba(192,137,103,0.08)]",
          isListening && "border-[#ad0201]/50 shadow-[0_0_0_1px_rgba(173,2,1,0.15),0_0_15px_rgba(173,2,1,0.08)]"
        )}
      >
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : isEditMode ? "Describe what you'd like to change..." : "Type your answer..."}
          rows={1}
          style={{ height: 44, overflowY: "hidden" }}
          className="max-h-[200px] flex-1 resize-none bg-transparent py-3 pl-4 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          disabled={isGenerating}
        />
        <button
          onClick={toggleListening}
          disabled={isGenerating}
          className={cn(
            "mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
            isListening
              ? "bg-[#ad0201] text-white animate-pulse"
              : "text-muted-foreground hover:bg-[#f2dacb]/40 hover:text-foreground"
          )}
          aria-label={isListening ? "Stop listening" : "Voice input"}
        >
          {isListening ? (
            <MicOff className="h-[18px] w-[18px]" />
          ) : (
            <Mic className="h-[18px] w-[18px]" />
          )}
        </button>
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
            canSend
              ? "bg-[#06264e] text-white hover:opacity-80"
              : "cursor-not-allowed bg-[#e0d6d0] text-muted-foreground"
          )}
          aria-label="Send"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
        </button>
      </div>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it
export default function BrandBuildingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-dvh items-center justify-center bg-background">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <BrandBuildingContent />
    </Suspense>
  );
}

function BrandBuildingContent() {
  const searchParams = useSearchParams();
  const isEditMode = searchParams.get("mode") === "edit";

  const { user: authUser, supabaseUser, signOut, refreshUser } = useAuth();
  const [supabase] = useState(() => createClient());
  const [messages, setMessages] = useState<Message[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [started, setStarted] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [showPricing, setShowPricing] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [brandDnaId, setBrandDnaId] = useState<string | null>(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const router = useRouter();
  const abortRef = useRef<AbortController | null>(null);
  const { scrollRef, bottomRef, showScrollButton, scrollToBottom, scrollToBottomIfNeeded } =
    useScrollAnchor();

  const hasMessages = messages.length > 0;
  const hasSubscription = authUser?.hasActiveSubscription ?? false;

  // ── Edit mode state ─────────────────────────────────────────────────
  const [isEditComplete, setIsEditComplete] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [existingBlueprintContent, setExistingBlueprintContent] = useState<string | null>(null);
  const needsAutoEditRef = useRef(false);
  // Tracks the message ID that already triggered edit-complete so the
  // detection effect won't re-fire for the same message after "Continue Editing".
  const editCompleteSeenIdRef = useRef<string | null>(null);

  // Ref to track whether auto-resume is needed (set during load, consumed once)
  const needsAutoResumeRef = useRef(false);

  // Load existing brand DNA session on mount — use supabaseUser (available
  // immediately after auth) instead of authUser (which requires 5 extra DB
  // queries to build the full profile). This eliminates the waterfall.
  const userId = supabaseUser?.id;
  useEffect(() => {
    if (!userId) return;

    const loadExisting = async () => {
      try {
        const existing = await getPrimaryBrandDNA(supabase, userId);
        if (existing) {
          setBrandDnaId(existing.id);

          if (isEditMode) {
            // ── Edit mode ──────────────────────────────────────────
            // Load the existing blueprint content but DON'T load old messages.
            // Start a fresh conversation for editing.
            if (existing.blueprint_content) {
              setExistingBlueprintContent(existing.blueprint_content);
              setStarted(true);
              needsAutoEditRef.current = true;
            }
          } else {
            // ── Build mode (original logic) ────────────────────────
            if (existing.status === "active") {
              setIsComplete(true);
              try {
                localStorage.setItem("brandDNAContent", existing.blueprint_content || "");
              } catch {
                // ignore
              }
            }

            // Load messages for any status that has started
            if (existing.status === "in_progress" || existing.status === "active") {
              const msgs = await getBrandDNAChatMessages(supabase, existing.id);
              if (msgs.length > 0) {
                const loadedMessages = msgs.map((m) => ({
                  id: m.id,
                  role: m.role as "user" | "assistant",
                  content: m.content,
                  timestamp: new Date(m.created_at),
                }));
                setMessages(loadedMessages);
                setStarted(true);

                if (
                  existing.status === "in_progress" &&
                  loadedMessages[loadedMessages.length - 1]?.role === "user"
                ) {
                  needsAutoResumeRef.current = true;
                }
              }
            }
          }
        }
      } catch (err) {
        console.error("Failed to load brand DNA:", err);
      } finally {
        setLoadingSession(false);
      }
    };

    loadExisting();
  }, [userId, supabase, isEditMode]);

  const lastMessageContent = messages[messages.length - 1]?.content;
  useEffect(() => {
    scrollToBottomIfNeeded();
  }, [messages.length, lastMessageContent, scrollToBottomIfNeeded]);

  // Detect build-mode completion marker in any assistant message + save to DB
  useEffect(() => {
    if (isEditMode || isComplete || !brandDnaId || !userId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content.includes(COMPLETION_MARKER)) {
      setIsComplete(true);
      try {
        localStorage.setItem("brandDNAContent", lastAssistant.content);
      } catch {
        // localStorage may be unavailable
      }
      updateBrandDNA(supabase, brandDnaId, {
        status: "active",
        blueprint_content: lastAssistant.content,
        brand_name: authUser?.name || "",
      }).then(() => refreshUser()).catch((err) => console.error("Failed to save brand DNA:", err));
    }
  }, [messages, isComplete, brandDnaId, supabase, userId, authUser, refreshUser, isEditMode]);

  // Detect edit-mode completion marker — do NOT auto-save, wait for user to click Save.
  // Skip messages that were already "seen" after the user clicked Continue Editing.
  useEffect(() => {
    if (!isEditMode || isEditComplete) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (
      lastAssistant?.content.includes(EDIT_COMPLETION_MARKER) &&
      lastAssistant.id !== editCompleteSeenIdRef.current
    ) {
      setIsEditComplete(true);
    }
  }, [messages, isEditMode, isEditComplete]);

  // ── Auto-start edit conversation ────────────────────────────────────
  // Runs ONCE after loading completes in edit mode. Sends "I want to make
  // some changes to my Brand DNA" and streams the AI's first response.
  useEffect(() => {
    if (
      !isEditMode ||
      loadingSession ||
      !needsAutoEditRef.current ||
      !brandDnaId ||
      !userId ||
      !existingBlueprintContent
    )
      return;

    needsAutoEditRef.current = false;

    setIsGenerating(true);
    const userMsg: Message = {
      id: `msg-${Date.now()}-edit-user`,
      role: "user",
      content: "I want to make some changes to my Brand DNA.",
      timestamp: new Date(),
    };
    const assistantMsgId = `msg-${Date.now()}-edit-ai`;

    setMessages([
      userMsg,
      { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    streamResponse(
      [{ role: "user", content: userMsg.content }],
      (text) => {
        setMessages([
          userMsg,
          { id: assistantMsgId, role: "assistant", content: text, timestamp: new Date() },
        ]);
      },
      abort.signal,
      { mode: "edit", brandDnaContent: existingBlueprintContent }
    )
      .catch((err) => {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) => {
            const existing = prev.find((m) => m.id === assistantMsgId);
            if (existing?.content) return prev; // preserve streamed content
            return [
              userMsg,
              {
                id: assistantMsgId,
                role: "assistant",
                content: "Sorry, something went wrong. Please try again.",
                timestamp: new Date(),
              },
            ];
          });
        }
      })
      .finally(() => {
        abortRef.current = null;
        setIsGenerating(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, loadingSession, brandDnaId, userId, existingBlueprintContent]);

  // Auto-resume: runs ONCE after loading completes (build mode only). If
  // loadExisting flagged that the last DB message was from the user (AI never
  // responded), this effect fires a single AI response.
  useEffect(() => {
    if (isEditMode || loadingSession || !needsAutoResumeRef.current || !brandDnaId || !userId) return;

    needsAutoResumeRef.current = false;

    setIsGenerating(true);
    const assistantMsgId = `msg-${Date.now()}-resume`;

    setMessages((prev) => [
      ...prev,
      { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    const abort = new AbortController();
    abortRef.current = abort;

    const currentMessages = [...messages];
    const apiMessages = currentMessages.map((m) => ({ role: m.role, content: m.content }));
    const MAX_CONTINUATIONS = 3;

    (async () => {
      try {
        let accumulated = "";

        const initialContent = await streamResponse(
          apiMessages,
          (text) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: text } : m))
            );
          },
          abort.signal
        );
        accumulated = initialContent;

        // Auto-continue if blueprint was started but not completed
        const isBlueprintResponse = accumulated.includes("# YOUR IDENTITY");
        if (isBlueprintResponse && !accumulated.includes(COMPLETION_MARKER)) {
          for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt++) {
            const continuationMessages = [
              ...apiMessages,
              { role: "assistant", content: accumulated },
              { role: "user", content: "Continue exactly where you left off. Do not repeat any content already written. Complete the remaining sections of the blueprint." },
            ];

            const prevAccumulated = accumulated;
            const continuationContent = await streamResponse(
              continuationMessages,
              (text) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: prevAccumulated + text }
                      : m
                  )
                );
              },
              abort.signal
            );
            accumulated += continuationContent;

            if (accumulated.includes(COMPLETION_MARKER)) break;
          }
        }

        // Final state update
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: accumulated } : m
          )
        );

        try {
          const saved = await insertBrandDNAChatMessage(supabase, {
            brand_dna_id: brandDnaId,
            user_id: userId,
            role: "assistant",
            content: accumulated,
          });
          setMessages((prev) =>
            prev.map((m) => (m.id === assistantMsgId ? { ...m, id: saved.id } : m))
          );
        } catch (err) {
          console.error("Failed to save resumed assistant message:", err);
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content || "Sorry, something went wrong. Please try again." }
                : m
            )
          );
        }
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEditMode, loadingSession, brandDnaId, userId]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isGenerating || !userId || !brandDnaId) return;

      // Set generating immediately to prevent any race conditions
      setIsGenerating(true);

      const userMessage: Message = {
        id: `msg-${Date.now()}`,
        role: "user",
        content,
        timestamp: new Date(),
      };

      const updatedMessages = [...messages, userMessage];
      setMessages(updatedMessages);
      setTimeout(() => scrollToBottom(), 100);

      // Save user message to DB (skip in edit mode — edit is ephemeral)
      if (!isEditMode) {
        try {
          const saved = await insertBrandDNAChatMessage(supabase, {
            brand_dna_id: brandDnaId,
            user_id: userId,
            role: "user",
            content,
          });
          userMessage.id = saved.id;
        } catch (err) {
          console.error("Failed to save user message:", err);
        }
      }

      const assistantMsgId = `msg-${Date.now()}-ai`;

      setMessages((prev) => [
        ...prev,
        { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
      ]);

      const apiMessages = updatedMessages.map((m) => ({ role: m.role, content: m.content }));

      const streamOpts = isEditMode
        ? { mode: "edit" as const, brandDnaContent: existingBlueprintContent || "" }
        : undefined;

      const completionMarker = isEditMode ? EDIT_COMPLETION_MARKER : COMPLETION_MARKER;
      const MAX_CONTINUATIONS = 3;

      try {
        const abort = new AbortController();
        abortRef.current = abort;

        let accumulated = "";

        // Initial stream
        const initialContent = await streamResponse(
          apiMessages,
          (text) => {
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, content: text } : m))
            );
          },
          abort.signal,
          streamOpts
        );
        accumulated = initialContent;

        // Auto-continue if blueprint was started but not completed (truncated output)
        const isBlueprintResponse = accumulated.includes("# YOUR IDENTITY");
        if (isBlueprintResponse && !accumulated.includes(completionMarker)) {
          for (let attempt = 0; attempt < MAX_CONTINUATIONS; attempt++) {
            const continuationMessages = [
              ...apiMessages,
              { role: "assistant", content: accumulated },
              { role: "user", content: "Continue exactly where you left off. Do not repeat any content already written. Complete the remaining sections of the blueprint." },
            ];

            const prevAccumulated = accumulated;
            const continuationContent = await streamResponse(
              continuationMessages,
              (text) => {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantMsgId
                      ? { ...m, content: prevAccumulated + text }
                      : m
                  )
                );
              },
              abort.signal,
              streamOpts
            );
            accumulated += continuationContent;

            if (accumulated.includes(completionMarker)) break;
          }
        }

        // Final state update
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId ? { ...m, content: accumulated } : m
          )
        );

        // Save assistant message to DB (skip in edit mode)
        if (!isEditMode) {
          try {
            const saved = await insertBrandDNAChatMessage(supabase, {
              brand_dna_id: brandDnaId,
              user_id: userId,
              role: "assistant",
              content: accumulated,
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === assistantMsgId ? { ...m, id: saved.id } : m))
            );
          } catch (err) {
            console.error("Failed to save assistant message:", err);
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          // Preserve any content that was already streamed — never wipe it
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsgId
                ? { ...m, content: m.content || "Sorry, something went wrong. Please try again." }
                : m
            )
          );
        }
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
      }
    },
    [messages, isGenerating, scrollToBottom, userId, brandDnaId, supabase, isEditMode, existingBlueprintContent]
  );

  // ── Save edited Brand DNA ──────────────────────────────────────────
  const handleSaveBrandDNA = useCallback(async () => {
    if (!brandDnaId || isSaving) return;
    setIsSaving(true);

    // Find the last assistant message containing the updated blueprint
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) {
      setIsSaving(false);
      return;
    }

    // Clean the edit marker from the content before saving
    const cleanContent = lastAssistant.content.replace(EDIT_COMPLETION_MARKER, "").trim();

    try {
      await updateBrandDNA(supabase, brandDnaId, {
        status: "active",
        blueprint_content: cleanContent,
        brand_name: authUser?.name || "",
      });

      try {
        localStorage.setItem("brandDNAContent", cleanContent);
      } catch {
        // ignore
      }

      await refreshUser();
      router.push("/valzacchi-ai");
    } catch (err) {
      console.error("Failed to save edited Brand DNA:", err);
      setIsSaving(false);
    }
  }, [brandDnaId, messages, supabase, authUser, refreshUser, router, isSaving]);

  // ── Continue editing (reset edit completion) ───────────────────────
  const handleContinueEditing = useCallback(() => {
    // Mark the current edit-complete message as "seen" so the detection
    // effect won't re-trigger for it. Messages stay intact (with marker
    // and download button visible).
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant) {
      editCompleteSeenIdRef.current = lastAssistant.id;
    }
    setIsEditComplete(false);
  }, [messages]);

  // Start the session — create brand DNA + AI introduces itself (build mode only)
  const handleStart = useCallback(async () => {
    if (!userId) return;

    setStarted(true);
    setIsGenerating(true);

    // Create brand DNA record in DB (or reuse existing)
    let dnaId = brandDnaId;
    if (!dnaId) {
      try {
        const newDna = await createBrandDNA(supabase, userId);
        dnaId = newDna.id;
        setBrandDnaId(dnaId);
      } catch (err) {
        console.error("Failed to create brand DNA:", err);
        setIsGenerating(false);
        return;
      }
    }

    // Mark as in_progress
    try {
      await updateBrandDNA(supabase, dnaId!, { status: "in_progress" });
    } catch (err) {
      console.error("Failed to update brand DNA status:", err);
    }

    const assistantMsgId = `msg-${Date.now()}-intro`;
    setMessages([
      { id: assistantMsgId, role: "assistant", content: "", timestamp: new Date() },
    ]);

    try {
      const abort = new AbortController();
      abortRef.current = abort;

      const finalContent = await streamResponse(
        [{ role: "user", content: "I'm ready to build my Brand DNA. Please introduce yourself and start the process." }],
        (text) => {
          setMessages([{ id: assistantMsgId, role: "assistant", content: text, timestamp: new Date() }]);
        },
        abort.signal
      );

      // Save intro message to DB
      try {
        const saved = await insertBrandDNAChatMessage(supabase, {
          brand_dna_id: dnaId!,
          user_id: userId,
          role: "assistant",
          content: finalContent,
        });
        setMessages((prev) =>
          prev.map((m) => (m.id === assistantMsgId ? { ...m, id: saved.id } : m))
        );
      } catch (err) {
        console.error("Failed to save intro message:", err);
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setMessages((prev) => {
          const existing = prev.find((m) => m.id === assistantMsgId);
          if (existing?.content) return prev; // preserve streamed content
          return [
            { id: assistantMsgId, role: "assistant", content: "Sorry, something went wrong. Please refresh and try again.", timestamp: new Date() },
          ];
        });
      }
    } finally {
      abortRef.current = null;
      setIsGenerating(false);
    }
  }, [userId, brandDnaId, supabase]);

  // Loading state — show ghost/skeleton messages
  if (loadingSession) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        {/* Top bar skeleton */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
          <div className="flex items-center gap-2">
            <div className="h-7 w-16 animate-pulse rounded-md bg-muted" />
            <div className="h-7 w-20 animate-pulse rounded-md bg-muted" />
          </div>
        </div>

        {/* Ghost messages */}
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className="mx-auto flex max-w-3xl flex-col space-y-4 py-6 px-4">
            {/* Assistant message skeleton 1 */}
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-20 w-[85%] animate-pulse rounded-2xl bg-[#06264e]/10" style={{ animationDelay: "0ms" }} />
              </div>
            </div>

            {/* User message skeleton 1 */}
            <div className="flex justify-end">
              <div className="h-10 w-[45%] animate-pulse rounded-2xl bg-[#f2dacb]/50" style={{ animationDelay: "150ms" }} />
            </div>

            {/* Assistant message skeleton 2 */}
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-32 w-[90%] animate-pulse rounded-2xl bg-[#06264e]/10" style={{ animationDelay: "300ms" }} />
              </div>
            </div>

            {/* User message skeleton 2 */}
            <div className="flex justify-end">
              <div className="h-10 w-[35%] animate-pulse rounded-2xl bg-[#f2dacb]/50" style={{ animationDelay: "450ms" }} />
            </div>

            {/* Assistant message skeleton 3 */}
            <div className="flex items-start gap-3">
              <div className="h-7 w-7 shrink-0 animate-pulse rounded-full bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-24 w-[75%] animate-pulse rounded-2xl bg-[#06264e]/10" style={{ animationDelay: "600ms" }} />
              </div>
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
    );
  }

  // Welcome / start screen (only if no existing session found)
  if (!started) {
    return (
      <div className="flex h-dvh flex-col bg-background">
        {/* Top bar */}
        <div className="flex h-12 shrink-0 items-center justify-end gap-2 border-b border-border px-4">
          {hasSubscription && (
            <button
              onClick={() => router.push("/valzacchi-ai")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" />
              Go to Back Pocket AI
            </button>
          )}
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </button>
          <button
            onClick={async () => { await signOut(); router.push("/"); }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>

        <div className="flex flex-1 items-center justify-center px-4">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="text-center"
          >
            <div className="mb-4 flex justify-center">
              <Image src="/logo.png" alt="Valzacchi.ai" width={180} height={180} className="h-auto w-auto" priority />
            </div>
            <h1 className="mb-2 text-2xl font-semibold text-[#06264e]">Brand Building Blueprint</h1>
            <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-muted-foreground">
              An AI-guided experience that walks you through the Cass Valzacchi Human Design Framework
              to build your complete brand DNA — your identity, messaging, audience, and strategy.
            </p>
            <button
              onClick={handleStart}
              className="rounded-xl bg-[#06264e] px-8 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
            >
              Start Building
            </button>
          </motion.div>
        </div>

        <AnimatePresence>
          {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onShowPricing={() => setShowPricing(true)} />}
        </AnimatePresence>
        <AnimatePresence>
          {showPricing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="relative w-full max-w-md rounded-2xl bg-background p-6 text-center shadow-2xl"
              >
                <button onClick={() => setShowPricing(false)} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-4 w-4" />
                </button>
                <h2 className="mb-2 text-lg font-bold text-foreground">Get Marketing AI</h2>
                <p className="mb-4 text-sm text-muted-foreground">Choose a Consulting AI plan to unlock your marketing assistant.</p>
                <button
                  onClick={() => {
                    setShowPricing(false);
                    router.push("/choose-your-plan");
                  }}
                  className="w-full rounded-lg bg-[#06264e] py-3 text-sm font-medium text-white hover:bg-[#06264e]/90"
                >
                  View Plans
                </button>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-background">
      {/* Top bar */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="text-sm font-medium text-foreground">
          {isEditMode ? "Edit Brand DNA" : "Brand Building Blueprint"}
        </span>
        <div className="flex items-center gap-2">
          {isEditMode && (
            <button
              onClick={() => router.push("/brand-building-dna-ai")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Cancel Edit
            </button>
          )}
          {hasSubscription && (
            <button
              onClick={() => router.push("/valzacchi-ai")}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
            >
              <Home className="h-3.5 w-3.5" />
              Go to Back Pocket AI
            </button>
          )}
          <button
            onClick={() => setShowProfile(true)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
          >
            <User className="h-3.5 w-3.5" />
            Profile
          </button>
          <button
            onClick={async () => { await signOut(); router.push("/"); }}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto chat-scroll">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col">
          {hasMessages && (
            <div className="flex-1 space-y-1 py-4">
              {messages.map((msg) => (
                <BrandMessage
                  key={msg.id}
                  message={msg}
                  isComplete={isEditMode ? isEditComplete : isComplete}
                  hasSubscription={hasSubscription}
                />
              ))}
              {isEditComplete && isEditMode && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: 0.5 }}
                  className="px-4 py-2"
                >
                  <div className="flex max-w-full items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
                      <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl bg-[#06264e] px-4 py-3 text-sm leading-relaxed text-white">
                        Your updated Brand DNA is ready! Click <strong>Save Brand DNA</strong> to save
                        your changes, or <strong>Continue Editing</strong> if you&apos;d like to make
                        more adjustments.
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={bottomRef} className="h-1" />
            </div>
          )}
        </div>
      </div>

      <ScrollToBottom show={showScrollButton} onClick={scrollToBottom} />

      <div className="shrink-0">
        <BrandInput
          onSend={sendMessage}
          isGenerating={isGenerating}
          isComplete={isComplete}
          onGetMarketing={() => setShowPricing(true)}
          hasSubscription={hasSubscription}
          isEditMode={isEditMode}
          isEditComplete={isEditComplete}
          onSaveBrandDNA={handleSaveBrandDNA}
          onContinueEditing={handleContinueEditing}
          isSaving={isSaving}
        />
      </div>

      {/* Pricing redirect overlay */}
      <AnimatePresence>
        {showPricing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-md rounded-2xl bg-background p-6 text-center shadow-2xl"
            >
              <button onClick={() => setShowPricing(false)} className="absolute right-3 top-3 rounded-md p-1 text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
              <h2 className="mb-2 text-lg font-bold text-foreground">Get Marketing AI</h2>
              <p className="mb-4 text-sm text-muted-foreground">Choose a Consulting AI plan to unlock your marketing assistant.</p>
              <button
                onClick={() => {
                  setShowPricing(false);
                  router.push("/choose-your-plan");
                }}
                className="w-full rounded-lg bg-[#06264e] py-3 text-sm font-medium text-white hover:bg-[#06264e]/90"
              >
                View Plans
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Profile modal */}
      <AnimatePresence>
        {showProfile && <ProfileModal onClose={() => setShowProfile(false)} onShowPricing={() => setShowPricing(true)} />}
      </AnimatePresence>
    </div>
  );
}
