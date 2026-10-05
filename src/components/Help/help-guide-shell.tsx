import * as React from "react";
import { SearchBox } from "~/components/SearchBox";
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
 * The guide's search box — the shared `SearchBox` with the guide's wording.
 * `showIcon` off drops the leading magnifier (the dialog's compact mobile
 * variant); `className` carries the per-placement height (`h-8`/`h-9`).
 */
export function GuideSearchBox(props: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <SearchBox
      {...props}
      placeholder="Search the guide…"
      ariaLabel="Search the guide"
    />
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
