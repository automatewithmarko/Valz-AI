"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// Shown the very first time a user lands in the app. Dismissal is keyed by
// user id in localStorage so each account sees it exactly once per browser.
const STORAGE_PREFIX = "valzacchi:firstUseWelcomeSeen:";

interface FirstUseWelcomeDialogProps {
  userId: string | null | undefined;
}

export function FirstUseWelcomeDialog({ userId }: FirstUseWelcomeDialogProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!userId) return;
    try {
      const seen = window.localStorage.getItem(`${STORAGE_PREFIX}${userId}`);
      if (!seen) setOpen(true);
    } catch {
      // localStorage unavailable (private mode, etc.) — fail closed: don't show.
    }
  }, [userId]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next && userId) {
      try {
        window.localStorage.setItem(`${STORAGE_PREFIX}${userId}`, "1");
      } catch {
        // ignore — worst case the dialog reappears next visit
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Before You Start</DialogTitle>
          <DialogDescription className="sr-only">
            A quick note before you begin using The Back Pocket AI.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 text-sm leading-relaxed text-foreground">
          <p>
            I am so glad you&rsquo;re here! I just wanted to say, the more context you share, the
            more accurate and helpful the guidance from The Back Pocket will be.
          </p>
          <p>
            If you aren&rsquo;t sure where to start and you select a prompt to explore, don&rsquo;t
            worry about answering perfectly. Even messy thoughts, half-formed ideas, or rough
            explanations are helpful.
          </p>
          <p>
            If typing everything out feels difficult, feel free to use your phone or computer&rsquo;s
            dictation feature and just yap away to me. Speak naturally and share whatever comes to
            mind. I&rsquo;ll interpret what you mean and help shape it into something clear and
            aligned.
          </p>
          <p>
            The goal here isn&rsquo;t perfection. It&rsquo;s understanding your brand, your
            audience, and your ideas as deeply as possible so the guidance you receive is genuinely
            useful.
          </p>
        </div>
        <button
          onClick={() => handleOpenChange(false)}
          className="mt-2 w-full rounded-lg bg-[#06264e] py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#06264e]/90"
        >
          Got it, let&rsquo;s start
        </button>
      </DialogContent>
    </Dialog>
  );
}
