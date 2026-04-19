"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, Copy, Download, Eye, EyeOff, Home, Loader2, LogOut, Mic, MicOff, Printer, Save, User, X } from "lucide-react";
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
const SUMMARY_START_MARKER = "===SUMMARY_START===";
const SUMMARY_END_MARKER = "===SUMMARY_END===";

// Human Design calculation pipeline markers.
// AI emits HD_CALCULATE with birth data → page runs calculator → page injects
// HD_DISPLAY (rendered as a card) and HD_RESULT (sent back as the user's next
// message so the AI can interpret it).
const HD_CALCULATE_REGEX = /===HD_CALCULATE:\s*({[\s\S]*?})===/;
const HD_DISPLAY_PREFIX = "===HD_DISPLAY===";
const HD_RESULT_PREFIX = "===HD_RESULT===";

function stripDashes(text: string): string {
  return text.replaceAll("—", ", ").replaceAll("–", ", ");
}

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
            onChunk(stripDashes(fullContent));
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

  return stripDashes(fullContent);
}

// Custom message component for brand building
function BrandMessage({
  message,
  isComplete,
  hasSubscription,
  blueprintContent,
}: {
  message: Message;
  isComplete: boolean;
  hasSubscription: boolean;
  blueprintContent?: string | null;
}) {
  const [downloading, setDownloading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const isUser = message.role === "user";

  const handleCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!isUser && !message.content) return null;

  // Hide the HD_RESULT system-style user message — it's an automated handoff
  // back to the AI, not something the human typed. The previous HD_DISPLAY
  // card already shows the result.
  if (isUser && message.content.startsWith(HD_RESULT_PREFIX)) return null;
  // Hide the bare HD_CALCULATE marker if it ever shows up as an assistant
  // message — the loading card and HD_DISPLAY card supersede it.
  if (!isUser && HD_CALCULATE_REGEX.test(message.content) && message.content.replace(HD_CALCULATE_REGEX, "").trim() === "") {
    return null;
  }

  // HD result display card
  if (!isUser && message.content.startsWith(HD_DISPLAY_PREFIX)) {
    let result: { name: string; type: string; strategy: string; authority: string; profile: string; definedCenters: string[]; approximateTime?: boolean } | null = null;
    try {
      result = JSON.parse(message.content.slice(HD_DISPLAY_PREFIX.length).trim());
    } catch {
      return null;
    }
    if (!result) return null;
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                Human Design Calculated
              </p>
              <p className="mt-1 text-base font-semibold">{result.name}</p>
              <div className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Type</p>
                  <p className="mt-0.5 font-medium">{result.type}</p>
                </div>
                <div className="rounded-lg bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Authority</p>
                  <p className="mt-0.5 font-medium">{result.authority}</p>
                </div>
                <div className="rounded-lg bg-white/10 px-3 py-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-white/60">Profile</p>
                  <p className="mt-0.5 font-medium">{result.profile}</p>
                </div>
              </div>
              <p className="mt-3 text-xs text-white/70">
                Strategy: <span className="text-white/90">{result.strategy}</span>
              </p>
              {result.approximateTime && (
                <p className="mt-2 text-xs text-amber-200">
                  Birth time was unknown, defaulted to 12:00. Type and Authority may be approximate.
                </p>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Detect blueprint messages
  const isBlueprintMessage = !isUser && message.content.includes("# YOUR ALIGNED INCOME BLUEPRINT");
  const hasCompletionMarker =
    message.content.includes(COMPLETION_MARKER) ||
    message.content.includes(EDIT_COMPLETION_MARKER);
  const isBlueprintComplete = isBlueprintMessage && (hasCompletionMarker || isComplete);
  const isBlueprintStreaming = isBlueprintMessage && !isBlueprintComplete;

  // Blueprint is being generated — show a loading card
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

  // Blueprint is complete — show success card with summary, download button and Back Pocket AI CTA
  if (isBlueprintComplete) {
    // Extract the personalized summary from markers
    const sourceContent = blueprintContent || message.content;
    const summaryStartIdx = sourceContent.indexOf(SUMMARY_START_MARKER);
    const summaryEndIdx = sourceContent.indexOf(SUMMARY_END_MARKER);
    const extractedSummary =
      summaryStartIdx !== -1 && summaryEndIdx !== -1
        ? sourceContent
            .substring(summaryStartIdx + SUMMARY_START_MARKER.length, summaryEndIdx)
            .trim()
        : null;

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
              {extractedSummary ? (
                <div className="mt-2 text-sm text-white/90 prose prose-sm prose-invert max-w-none prose-p:leading-relaxed prose-p:text-white/90 prose-strong:text-white">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {extractedSummary}
                  </ReactMarkdown>
                </div>
              ) : (
                <p className="mt-1.5 text-sm text-white/80">
                  I&apos;ve built your completely personalised blueprint to create income online in total alignment with how you best operate, harnessing what you&apos;re already naturally good at and your unique life experiences. This is all ready for you to follow the blueprint and start making an incredible income in the most aligned way.
                </p>
              )}
              <motion.button
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.3 }}
                disabled={downloading}
                onClick={async () => {
                  setDownloading(true);
                  try {
                    await downloadBrandDNA(blueprintContent || message.content);
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
    .replace(HD_CALCULATE_REGEX, "")
    .replace(/===SUMMARY_START===[\s\S]*?===SUMMARY_END===/g, "")
    .trim();

  if (!isUser && !displayContent) return null;

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
            <div className="mt-1.5 flex items-center gap-0.5">
              <button
                onClick={() => handleCopy(displayContent)}
                className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
                aria-label="Copy message"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-green-500" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </button>
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
              Unlock Back Pocket AI
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

  // Build mode: hide input after blueprint is complete (CTA is in the message card)
  if (isComplete && !isEditMode) {
    return null;
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
  const [hdCalculating, setHdCalculating] = useState(false);
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
  const [fullBlueprintContent, setFullBlueprintContent] = useState<string | null>(null);
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
              if (existing.blueprint_content) {
                setFullBlueprintContent(existing.blueprint_content);
              }
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

  // ── Human Design calculation handler ───────────────────────────────
  // When the AI emits ===HD_CALCULATE: {...}===, run the calculator client-
  // side, save a HD_DISPLAY card to the conversation, then auto-send a
  // HD_RESULT user message so the AI can deliver the interpretation.
  const hdProcessedMsgIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isEditMode || isGenerating || hdCalculating || !brandDnaId || !userId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    if (hdProcessedMsgIdRef.current === lastAssistant.id) return;
    const match = lastAssistant.content.match(HD_CALCULATE_REGEX);
    if (!match) return;

    hdProcessedMsgIdRef.current = lastAssistant.id;

    let payload: { name: string; birthDate: string; birthTime: string; birthPlace: string; timezone: string } | null = null;
    try {
      payload = JSON.parse(match[1]);
    } catch (err) {
      console.error("Failed to parse HD_CALCULATE payload:", err);
      return;
    }
    if (!payload) return;

    // Safety net: validate all required fields are present before running
    // the calculator. If the AI emitted HD_CALCULATE with missing data
    // despite prompt instructions, ask the user to confirm.
    const missing: string[] = [];
    if (!payload.name?.trim()) missing.push("full name");
    if (!payload.birthDate?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(payload.birthDate)) missing.push("date of birth");
    if (!payload.birthPlace?.trim()) missing.push("city and country of birth");
    if (!payload.timezone?.trim()) missing.push("birth location (so I can resolve the timezone)");
    if (missing.length > 0) {
      console.warn("HD_CALCULATE emitted with missing fields:", missing);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-hd-incomplete`,
          role: "assistant",
          content: `It looks like I'm missing some of your birth details. Could you confirm your ${missing.join(", ")}?`,
          timestamp: new Date(),
        },
      ]);
      return;
    }

    setHdCalculating(true);

    (async () => {
      try {
        const { calculateHumanDesign } = await import("@/lib/human-design/calculator");
        const result = await calculateHumanDesign(payload);

        // Persist & display a card with the HD result.
        const displayPayload = {
          name: result.name,
          type: result.type,
          strategy: result.strategy,
          authority: result.authority,
          profile: result.profile,
          definedCenters: result.definedCenters,
          approximateTime: result.approximateTime,
        };
        const displayContent = `${HD_DISPLAY_PREFIX}\n${JSON.stringify(displayPayload)}`;

        let displayId = `msg-${Date.now()}-hd-display`;
        try {
          const saved = await insertBrandDNAChatMessage(supabase, {
            brand_dna_id: brandDnaId,
            user_id: userId,
            role: "assistant",
            content: displayContent,
          });
          displayId = saved.id;
        } catch (err) {
          console.error("Failed to save HD_DISPLAY message:", err);
        }
        setMessages((prev) => [
          ...prev,
          { id: displayId, role: "assistant", content: displayContent, timestamp: new Date() },
        ]);

        // Send the HD result back to the AI as the next user-role message
        // so it can deliver the Jenna Zoe interpretation and continue.
        const resultPayload = {
          type: result.type,
          strategy: result.strategy,
          authority: result.authority,
          profile: result.profile,
          definedCenters: result.definedCenters,
          undefinedCenters: result.undefinedCenters,
          personalitySun: result.personalitySun,
          designSun: result.designSun,
          approximateTime: result.approximateTime,
        };
        const resultContent = `${HD_RESULT_PREFIX}\n${JSON.stringify(resultPayload)}`;

        let resultId = `msg-${Date.now()}-hd-result`;
        try {
          const saved = await insertBrandDNAChatMessage(supabase, {
            brand_dna_id: brandDnaId,
            user_id: userId,
            role: "user",
            content: resultContent,
          });
          resultId = saved.id;
        } catch (err) {
          console.error("Failed to save HD_RESULT message:", err);
        }
        const resultMessage: Message = {
          id: resultId,
          role: "user",
          content: resultContent,
          timestamp: new Date(),
        };
        setMessages((prev) => [...prev, resultMessage]);

        // Auto-stream the AI's interpretation response.
        const apiMessages = [...messages, {
          id: displayId, role: "assistant", content: displayContent, timestamp: new Date()
        }, resultMessage].map((m) => ({ role: m.role, content: m.content }));

        const aiMsgId = `msg-${Date.now()}-hd-ai`;
        setMessages((prev) => [
          ...prev,
          { id: aiMsgId, role: "assistant", content: "", timestamp: new Date() },
        ]);
        setIsGenerating(true);

        const abort = new AbortController();
        abortRef.current = abort;
        try {
          const finalContent = await streamResponse(
            apiMessages,
            (text) => {
              setMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, content: text } : m))
              );
            },
            abort.signal,
          );
          try {
            const saved = await insertBrandDNAChatMessage(supabase, {
              brand_dna_id: brandDnaId,
              user_id: userId,
              role: "assistant",
              content: finalContent,
            });
            setMessages((prev) =>
              prev.map((m) => (m.id === aiMsgId ? { ...m, id: saved.id, content: finalContent } : m))
            );
          } catch (err) {
            console.error("Failed to save HD interpretation message:", err);
          }
        } finally {
          abortRef.current = null;
          setIsGenerating(false);
        }
      } catch (err) {
        console.error("Human Design calculation failed:", err);
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-${Date.now()}-hd-error`,
            role: "assistant",
            content:
              "I had trouble calculating your Human Design. Could you double-check your birth date, time, city and country and try again?",
            timestamp: new Date(),
          },
        ]);
      } finally {
        setHdCalculating(false);
      }
    })();
  }, [messages, isEditMode, isGenerating, hdCalculating, brandDnaId, userId, supabase]);

  // Detect build-mode completion marker + save to DB
  useEffect(() => {
    if (isEditMode || isComplete || !brandDnaId || !userId) return;
    const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
    if (lastAssistant?.content.includes(COMPLETION_MARKER)) {
      setIsComplete(true);

      const blueprintContent = lastAssistant.content;
      setFullBlueprintContent(blueprintContent);
      try {
        localStorage.setItem("brandDNAContent", blueprintContent);
      } catch {
        // localStorage may be unavailable
      }
      updateBrandDNA(supabase, brandDnaId, {
        status: "active",
        blueprint_content: blueprintContent,
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

        // Auto-continue if blueprint was started but not completed (truncated output)
        const isBlueprintResponse = accumulated.includes("# YOUR ALIGNED INCOME BLUEPRINT");
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
      const MAX_CONTINUATIONS = 5;

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
        const isBlueprintResponse = accumulated.includes("# YOUR ALIGNED INCOME BLUEPRINT");
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
                <h2 className="mb-2 text-lg font-bold text-foreground">Unlock Back Pocket AI</h2>
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
    <div className="relative flex h-dvh flex-col bg-background">
      {/* Top bar */}
      <div data-print-hide className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
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
          {hasMessages && (
            <button
              onClick={() => {
                const el = scrollRef.current;
                if (el) {
                  el.style.overflow = "visible";
                  el.style.height = "auto";
                  el.style.flex = "none";
                }
                setTimeout(() => {
                  window.print();
                  setTimeout(() => {
                    if (el) {
                      el.style.overflow = "";
                      el.style.height = "";
                      el.style.flex = "";
                    }
                  }, 500);
                }, 100);
              }}
              className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-[#f2dacb]/50 hover:text-foreground"
            >
              <Printer className="h-3.5 w-3.5" />
              Print Chat
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
                  blueprintContent={fullBlueprintContent}
                />
              ))}
              {hdCalculating && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                  className="px-4 py-2"
                >
                  <div className="flex max-w-full items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full overflow-hidden">
                      <Image src="/AgentPhoto.png" alt="Valzacchi.ai" width={28} height={28} className="h-7 w-7 object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="rounded-2xl bg-[#06264e] px-5 py-4 text-white">
                        <div className="flex items-center gap-3">
                          <Loader2 className="h-5 w-5 animate-spin text-white/70" />
                          <p className="text-sm font-medium">Calculating your Human Design...</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
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

      <div data-print-hide className="shrink-0">
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
              <h2 className="mb-2 text-lg font-bold text-foreground">Unlock Back Pocket AI</h2>
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
