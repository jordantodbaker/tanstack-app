/**
 * Top-level navigation links rendered in two places:
 *   - The header (desktop only — `lg:flex`); see `__root.tsx`.
 *   - The Sidebar's mobile/tablet drawer block (`lg:hidden`); see `Sidebar.tsx`.
 *
 * Two-source-one-truth keeps the two renderings from drifting. The `to`
 * paths must be valid routes; the type pin below catches typos at compile
 * time against the generated route tree.
 */

export type TopNavLink = {
  to:
    | "/dashboard"
    | "/changelog"
    | "/fco-log"
    | "/rfis"
    | "/trends"
    | "/pco"
    | "/reporting"
    | "/setup";
  label: string;
  /** If true, render only for admins (Field Estimate Form is admin-only). */
  adminOnly?: boolean;
};

export const TOP_NAV_LINKS: ReadonlyArray<TopNavLink> = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/changelog", label: "Change Log" },
  { to: "/fco-log", label: "FCO Log" },
  { to: "/rfis", label: "RFIs" },
  { to: "/trends", label: "Trends" },
  { to: "/pco", label: "PCOs" },
  { to: "/reporting", label: "Reporting" },
  { to: "/setup", label: "Field Estimate Form", adminOnly: true },
];
