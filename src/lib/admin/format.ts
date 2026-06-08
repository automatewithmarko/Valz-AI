// Display formatting helpers (client-safe — no secrets). Currency is AUD,
// shown with an "A$" symbol to match the rest of the app.

export function formatCurrency(cents: number, opts?: { compact?: boolean }): string {
  const dollars = (cents ?? 0) / 100;
  if (opts?.compact && Math.abs(dollars) >= 10000) {
    return (
      "A$" +
      new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(dollars)
    );
  }
  const whole = Number.isInteger(dollars);
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat("en-US").format(n ?? 0);
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-AU", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function relativeTime(iso: string): string {
  try {
    const then = new Date(iso).getTime();
    const diff = Date.now() - then;
    const mins = Math.round(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return formatDate(iso);
  } catch {
    return iso;
  }
}

// "2026-06" -> "Jun" (and append year only on January for clarity)
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  if (!y || !m) return ym;
  const d = new Date(y, m - 1, 1);
  const mon = d.toLocaleDateString("en-US", { month: "short" });
  return m === 1 ? `${mon} ${String(y).slice(2)}` : mon;
}
