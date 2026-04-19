"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useScrollAnchor() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  // Attach scroll listener. Re-run whenever the DOM updates so we pick
  // up the element even if it mounts after the hook's first render
  // (e.g. brand-building page shows a loading screen first).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      setShowScrollButton(distanceFromBottom > 100);
    };

    // Check initial state in case we're already scrolled up
    handleScroll();

    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  });

  // Auto-scroll when new content is added (only if already near bottom)
  const scrollToBottomIfNeeded = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    if (distanceFromBottom < 150) {
      setTimeout(() => {
        el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
      }, 50);
    }
  }, []);

  return {
    scrollRef,
    bottomRef,
    showScrollButton,
    scrollToBottom,
    scrollToBottomIfNeeded,
  };
}
