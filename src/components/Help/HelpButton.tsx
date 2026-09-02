import * as React from "react";
import { CircleQuestionMark } from "lucide-react";

/**
 * Header "?" control. Mounted next to the notification bell in `__root.tsx`
 * and styled to match it, so the two read as one cluster of utilities.
 *
 * The dialog is lazy and is not mounted until the button is first pressed.
 * The guide's content, its renderer, and the five workflow maps come to
 * ~12 kB gzipped; the header is on every page but the guide is opened rarely,
 * so that weight has no business in the initial bundle. Same reasoning (and
 * the same `React.lazy` shape) as the devtools in `__root.tsx`.
 */
const HelpDialog = React.lazy(() =>
  import("~/components/Help/HelpDialog").then((m) => ({
    default: m.HelpDialog,
  })),
);

export function HelpButton() {
  const [open, setOpen] = React.useState(false);
  // Sticky: once loaded, keep the dialog mounted so reopening is instant.
  const [loaded, setLoaded] = React.useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setLoaded(true);
          setOpen(true);
        }}
        aria-label="Help and user guide"
        title="Help & user guide"
        className="relative flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
      >
        <CircleQuestionMark size={18} />
      </button>
      {loaded && (
        <React.Suspense fallback={null}>
          <HelpDialog open={open} onOpenChange={setOpen} />
        </React.Suspense>
      )}
    </>
  );
}
