import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "~/lib/utils";
import { HELP_SECTIONS, type HelpSection } from "~/config/help-guide";
import {
  flattenSections,
  searchSections,
  visibleSections,
  type FlatSection,
} from "~/lib/help-visibility";
import { useCurrentUser } from "~/lib/use-current-user";
import type { UserRole } from "~/utils/users";

/**
 * Shared guide state for both entry points — the header dialog and the `/help`
 * route. It resolves the viewer's role (least privilege until the query
 * settles, so admin-only content never flashes at a non-admin), holds the
 * search query, and derives the role-filtered + searched sections plus the
 * flattened contents-rail rows. The entry-point-specific effects (the dialog's
 * reset-on-open, the route's hash scroll) stay with each caller; everything
 * they render identically lives here so the two can't drift.
 */
export function useHelpGuide(): {
  role: UserRole;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  sections: HelpSection[];
  contents: FlatSection[];
} {
  const { data: user } = useCurrentUser();
  const role: UserRole = user?.role ?? "USER";
  const [query, setQuery] = React.useState("");
  const sections = React.useMemo(
    () => searchSections(visibleSections(HELP_SECTIONS, role), query),
    [role, query],
  );
  const contents = React.useMemo(() => flattenSections(sections), [sections]);
  return { role, query, setQuery, sections, contents };
}

/**
 * The guide's search box. `showIcon` off drops the leading magnifier (the
 * dialog's compact mobile variant); `className` carries the per-placement
 * height (e.g. `h-8` in the dialog, `h-9` on the route).
 */
export function GuideSearchBox({
  value,
  onChange,
  className,
  showIcon = true,
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showIcon?: boolean;
}) {
  const input = (
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="Search the guide…"
      aria-label="Search the guide"
      className={cn(
        "w-full rounded-md border border-slate-200 bg-white text-sm text-slate-700 outline-none placeholder:text-slate-400 focus-visible:border-slate-400",
        showIcon ? "pr-2 pl-7" : "px-2",
        className,
      )}
    />
  );
  if (!showIcon) return input;
  return (
    <div className="relative">
      <Search
        size={14}
        className="absolute top-1/2 left-2 -translate-y-1/2 text-slate-400"
      />
      {input}
    </div>
  );
}

/**
 * Depth class for a contents-rail row. Shared so the dialog (which renders the
 * rail as scroll buttons) and the route (real anchors) can't drift on how a
 * nested section looks. The row element itself differs per caller, so each
 * keeps its own `contents.map`.
 */
export function guideContentsRowClass(depth: number): string {
  return depth === 0
    ? "text-sm font-medium text-slate-700"
    : "pl-5 text-xs text-slate-500";
}
