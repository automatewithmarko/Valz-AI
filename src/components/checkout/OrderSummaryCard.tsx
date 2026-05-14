"use client";

import { Check, type LucideIcon } from "lucide-react";

interface OrderSummaryCardProps {
  productIcon?: LucideIcon;
  productName: string;
  productMeta?: string;
  amountLabel: string;
  amountSuffix?: string;
  description?: string;
  features?: string[];
  badge?: string;
}

// Premium-feel order summary used across all checkout pages. Pure
// presentation — caller supplies the copy and price strings; we just
// render hierarchy, accent, and feature bullets consistently.
export function OrderSummaryCard({
  productIcon: Icon,
  productName,
  productMeta,
  amountLabel,
  amountSuffix,
  description,
  features,
  badge,
}: OrderSummaryCardProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[#06264e]/15 bg-gradient-to-br from-white via-white to-[#f2dacb]/25 p-5 shadow-sm">
      {badge && (
        <div className="absolute right-4 top-4 rounded-full bg-[#06264e] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-white">
          {badge}
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {Icon && (
              <span
                aria-hidden="true"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#06264e]/[0.08] text-[#06264e]"
              >
                <Icon className="h-3.5 w-3.5" />
              </span>
            )}
            <h2 className="text-sm font-semibold text-foreground">
              {productName}
            </h2>
          </div>
          {productMeta && (
            <p className="mt-1 text-xs text-muted-foreground">{productMeta}</p>
          )}
        </div>

        <div className="shrink-0 text-right">
          <div className="flex items-baseline justify-end gap-0.5">
            <span className="text-3xl font-bold tabular-nums text-[#06264e]">
              {amountLabel}
            </span>
            {amountSuffix && (
              <span className="text-sm text-muted-foreground">
                {amountSuffix}
              </span>
            )}
          </div>
        </div>
      </div>

      {description && (
        <p className="mt-3 text-sm leading-relaxed text-foreground/80">
          {description}
        </p>
      )}

      {features && features.length > 0 && (
        <ul className="mt-4 space-y-2 border-t border-[#06264e]/10 pt-4">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-2.5 text-xs">
              <span
                aria-hidden="true"
                className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#06264e]/10 text-[#06264e]"
              >
                <Check className="h-2.5 w-2.5" strokeWidth={3} />
              </span>
              <span className="text-foreground/80">{feature}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
