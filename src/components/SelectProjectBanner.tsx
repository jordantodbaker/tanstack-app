import * as React from "react";

/**
 * Amber "Select a project from the header to …" banner shown on the list
 * routes and the dashboard when no project is selected. Each call site
 * passes its own action-specific wording as children; the visual treatment
 * (amber border + background + rounded paragraph) lives here so all four
 * sites stay visually consistent.
 *
 * Replaces a 1-liner `<p className="rounded border border-amber-200 …">`
 * that was duplicated across [changelog.tsx, fco-log.tsx, rfis.tsx,
 * dashboard.tsx].
 */
export function SelectProjectBanner({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
      {children}
    </p>
  );
}
