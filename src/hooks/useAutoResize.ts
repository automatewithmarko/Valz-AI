"use client";

import { useCallback, useRef } from "react";

const MIN_HEIGHT = 44;

export function useAutoResize(maxHeight = 200) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Collapse to 0 so scrollHeight reflects actual content height,
    // not the current rendered height.
    el.style.height = "0px";
    const contentHeight = Math.max(MIN_HEIGHT, Math.min(el.scrollHeight, maxHeight));
    el.style.height = contentHeight + "px";
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [maxHeight]);

  return { ref, resize };
}
