import { Loader2 } from "lucide-react";
import { cn } from "~/lib/utils";

type SpinnerSize = "sm" | "md";

/**
 * Just the spinner + label — used inside route pending components or anywhere
 * you need the visual without the absolute-positioned overlay.
 */
export function SpinnerBlock({
  label = "Loading…",
  size = "md",
}: {
  label?: string;
  size?: SpinnerSize;
}) {
  return (
    <div className="flex flex-col items-center gap-3 text-slate-500">
      <Loader2
        className={cn(
          // `will-change-transform` promotes the spinner to its own compositor
          // layer so the rotation keeps running on the GPU when the main
          // thread is busy (e.g. during a heavy initial table mount).
          "animate-spin will-change-transform",
          size === "sm" ? "size-6" : "size-8",
        )}
      />
      <span className="text-sm">{label}</span>
    </div>
  );
}

/**
 * Translucent overlay with a spinner — covers its closest positioned parent
 * (the parent needs `position: relative`). Use for in-component loading states
 * like the Take Off hydration mask, tab-switch transitions, the Setup filter.
 */
export function LoadMask({
  label = "Loading…",
  size = "md",
  rounded = false,
}: {
  label?: string;
  size?: SpinnerSize;
  /** Match rounded corners of the parent panel. */
  rounded?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm",
        rounded && "rounded-md",
      )}
    >
      <SpinnerBlock label={label} size={size} />
    </div>
  );
}
