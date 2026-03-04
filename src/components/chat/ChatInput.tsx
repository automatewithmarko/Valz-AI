"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Mic, MicOff, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAutoResize } from "@/hooks/useAutoResize";

interface ChatInputProps {
  onSend: (message: string) => void;
  isGenerating: boolean;
  initialValue?: string;
}

export function ChatInput({ onSend, isGenerating, initialValue }: ChatInputProps) {
  const [value, setValue] = useState("");
  const { ref, resize } = useAutoResize(200);
  const canSend = value.trim().length > 0 && !isGenerating;
  const inputRef = ref;

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  // Sync initialValue from suggestion clicks
  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
      inputRef.current?.focus();
    }
  }, [initialValue, inputRef]);

  // Auto-focus on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

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
      setValue((prev) => {
        const base = prev.endsWith(interim) ? prev.slice(0, -interim.length) : prev;
        return finalTranscript + interim;
      });
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
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }
    // Re-focus after sending
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [canSend, onSend, value, inputRef, isListening]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

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
        {/* Attachment button placeholder */}
        <button
          className="ml-2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-[#f2dacb]/40 hover:text-foreground"
          aria-label="Attach file"
        >
          <Paperclip className="h-[18px] w-[18px]" />
        </button>

        {/* Textarea */}
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            resize();
          }}
          onKeyDown={handleKeyDown}
          placeholder={isListening ? "Listening..." : "Message Valz.AI..."}
          rows={1}
          className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent py-3 pl-1 pr-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          disabled={isGenerating}
        />

        {/* Microphone button */}
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

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!canSend}
          className={cn(
            "mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all",
            canSend
              ? "bg-[#06264e] text-white hover:opacity-80"
              : "cursor-not-allowed bg-[#e0d6d0] text-muted-foreground"
          )}
          aria-label="Send message"
        >
          <ArrowUp className="h-[18px] w-[18px]" />
        </button>
      </div>

      {/* Disclaimer */}
      <p className="mt-2 text-center text-[11px] text-muted-foreground/60">
        Valz.AI can make mistakes. Verify important brand data.
      </p>
    </div>
  );
}
