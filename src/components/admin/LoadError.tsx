import { AlertTriangle } from "lucide-react";

export function LoadError({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 py-16 text-center">
      <AlertTriangle className="size-7 text-destructive" />
      <p className="font-medium text-foreground">Couldn&apos;t load {what}</p>
      <p className="max-w-sm text-sm text-muted-foreground">
        Please refresh the page or try again shortly.
      </p>
    </div>
  );
}
