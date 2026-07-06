import { Check, TriangleAlert } from "lucide-react";

/**
 * Autosave lifecycle for a grid section:
 *  - idle    — nothing to save (freshly loaded, no edits)
 *  - pending — edits made, debounce timer running (not yet sent)
 *  - saving  — a save request is in flight
 *  - saved   — the last save succeeded
 *  - error   — the last save failed
 */
export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

/**
 * Combine several sections' statuses into one headline for a page-level
 * indicator. Worst-news-first: an error anywhere wins, then an in-flight save,
 * then unsaved edits, then a recent success; only "idle" everywhere is idle.
 */
export function combineSaveStatus(statuses: SaveStatus[]): SaveStatus {
  const priority: SaveStatus[] = ["error", "saving", "pending", "saved", "idle"];
  for (const s of priority) {
    if (statuses.includes(s)) return s;
  }
  return "idle";
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * Compact autosave status pill. Renders nothing when idle so it stays out of
 * the way until there's something to report. `aria-live` announces changes to
 * screen readers without stealing focus.
 */
export function SaveIndicator({
  status,
  lastSavedAt,
  className = "",
}: {
  status: SaveStatus;
  lastSavedAt?: number | null;
  className?: string;
}) {
  if (status === "idle") return null;

  const base = `inline-flex items-center gap-1.5 text-xs font-medium ${className}`;

  if (status === "pending") {
    return (
      <span role="status" aria-live="polite" className={`${base} text-slate-500`}>
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden />
        Unsaved changes…
      </span>
    );
  }
  if (status === "saving") {
    return (
      <span role="status" aria-live="polite" className={`${base} text-slate-500`}>
        <span
          className="h-3 w-3 animate-spin rounded-full border-2 border-slate-300 border-t-slate-600"
          aria-hidden
        />
        Saving…
      </span>
    );
  }
  if (status === "error") {
    return (
      <span role="status" aria-live="assertive" className={`${base} text-red-600`}>
        <TriangleAlert className="size-3.5" aria-hidden />
        Save failed — will retry on next edit
      </span>
    );
  }
  // saved
  return (
    <span role="status" aria-live="polite" className={`${base} text-emerald-600`}>
      <Check className="size-3.5" aria-hidden />
      Saved{lastSavedAt ? ` ${formatTime(lastSavedAt)}` : ""}
    </span>
  );
}
