"use client";

import { Sparkles } from "lucide-react";
import type { User } from "@/lib/types";

interface SidebarCreditsProps {
  user: User;
}

export function SidebarCredits({ user }: SidebarCreditsProps) {
  const denominator = user.maxCredits > 0 ? user.maxCredits : 1;
  const percentage = Math.min(100, Math.max(0, (user.credits / denominator) * 100));

  return (
    <div className="mx-3 space-y-2 px-0.5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Sparkles className="h-3.5 w-3.5" />
        <span className="text-[10px] font-medium uppercase tracking-widest">
          Credits
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-bold text-[#ad0201] tabular-nums">
          {user.credits.toLocaleString()}
        </p>
        {user.monthlyCredits != null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            / {user.monthlyCredits.toLocaleString()}
          </span>
        )}
      </div>
      {user.planName && (
        <p className="text-xs text-muted-foreground">{user.planName} plan</p>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-300">
        <div
          className="h-full rounded-full bg-[#ad0201] transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
