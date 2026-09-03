import * as React from "react";
import { Link } from "@tanstack/react-router";
import { ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "~/components/ui/dialog";
import { HelpContent } from "~/components/Help/HelpContent";
import {
  GuideSearchBox,
  guideContentsRowClass,
  useHelpGuide,
} from "~/components/Help/help-guide-shell";

/**
 * The guide in a dialog — reading it shouldn't cost you the page you were on.
 *
 * Contents rail on the left, scrollable body on the right, and a filter box
 * that narrows both. `/help` renders the same sections full-page for anyone
 * who wants to link to or print them.
 */
export function HelpDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { role, query, setQuery, sections, contents } = useHelpGuide();
  const bodyRef = React.useRef<HTMLDivElement | null>(null);

  // Reset the filter each time the dialog opens — a stale search from last
  // time reads as a broken guide.
  React.useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  const scrollTo = (id: string) => {
    const el = bodyRef.current?.querySelector(`[data-help-section="${id}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="grid h-[85vh] w-[calc(100vw-2rem)] max-w-4xl grid-rows-[auto_1fr] gap-0 overflow-hidden p-0 text-sm sm:max-w-4xl">
        <div className="border-b border-slate-200 px-5 py-3">
          <DialogTitle className="text-base font-bold text-slate-800">
            Help & user guide
          </DialogTitle>
          <DialogDescription className="mt-0.5 text-xs text-slate-500">
            Everything below reflects what your account can do.
          </DialogDescription>
        </div>

        <div className="grid min-h-0 grid-cols-1 md:grid-cols-[15rem_1fr]">
          <div className="hidden min-h-0 flex-col border-r border-slate-200 bg-slate-50/60 md:flex">
            <div className="border-b border-slate-200 p-3">
              <GuideSearchBox value={query} onChange={setQuery} className="h-8" />
            </div>

            <nav className="min-h-0 flex-1 overflow-y-auto p-2">
              {contents.map(({ section, depth }) => (
                <button
                  key={section.id}
                  type="button"
                  onClick={() => scrollTo(section.id)}
                  className={`block w-full truncate rounded px-2 py-1.5 text-left transition-colors hover:bg-slate-200/70 ${guideContentsRowClass(
                    depth,
                  )}`}
                >
                  {section.title}
                </button>
              ))}
            </nav>

            <div className="border-t border-slate-200 p-3">
              <Link
                to="/help"
                onClick={() => onOpenChange(false)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-800 hover:underline"
              >
                Open the full guide
                <ExternalLink size={12} />
              </Link>
            </div>
          </div>

          <div ref={bodyRef} className="min-h-0 overflow-y-auto px-5 py-4">
            <div className="mb-3 md:hidden">
              <GuideSearchBox
                value={query}
                onChange={setQuery}
                className="h-8"
                showIcon={false}
              />
            </div>
            <HelpContent sections={sections} role={role} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
