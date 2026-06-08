import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";

type Tint = "navy" | "terracotta" | "green" | "amber" | "slate";

// Tints chosen to read well in both light and dark themes.
const TINTS: Record<Tint, string> = {
  navy: "bg-[#06264e]/10 text-[#06264e] dark:bg-[#87a8d3]/15 dark:text-[#9fc0e8]",
  terracotta: "bg-[#c08967]/15 text-[#a96f47] dark:text-[#d6a07c]",
  green: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  amber: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  slate: "bg-slate-500/12 text-slate-600 dark:text-slate-300",
};

export function StatCard({
  label,
  value,
  icon: Icon,
  hint,
  tint = "navy",
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tint?: Tint;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-0", className)}>
      <div className="flex items-start gap-4 p-5">
        <div
          className={cn(
            "flex size-11 shrink-0 items-center justify-center rounded-xl",
            TINTS[tint]
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-2xl font-semibold tabular-nums text-foreground">
            {value}
          </p>
          {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}
