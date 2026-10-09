import type React from "react";
import type { LinkProps } from "@tanstack/react-router";
import {
  BarChart3,
  ClipboardList,
  FolderTree,
  GitPullRequestArrow,
  Shield,
} from "lucide-react";
import { disciplinesData } from "./disciplines-data";

/**
 * The app registry — the platform's top-level split.
 *
 * The product is four working areas plus administration, and they share almost
 * nothing day to day: an estimator lives in the Field Estimate Form, a project
 * engineer in the Change Log, project controls in Reporting. Before this
 * existed, one navigation shell carried all of it at once — every page showed
 * all twenty-odd estimate disciplines, and the header's nine links overflowed
 * into a "More" menu.
 *
 * So navigation is per app: the shell asks `appForPath` which app the current
 * route belongs to and renders only that app's nav. URLs are untouched — an
 * app is a grouping of existing routes, not a new path prefix — which keeps the
 * emailed "Open in app" deep links in `~/lib/entity-routes` working.
 *
 * To add a page: put it in the right app's `links`. To add an app: add an entry
 * and give it `ownedPaths` so `appForPath` can find it.
 */

/** Any route registered in the generated route tree. */
type AppPath = NonNullable<LinkProps["to"]>;

export type AppNavLink = {
  to: AppPath;
  label: string;
  /** Rendered only for administrators. The route is gated independently. */
  adminOnly?: boolean;
  /** Sidebar heading to file this link under. Ungrouped links render first. */
  group?: string;
};

export type AppId = "estimate" | "changes" | "cbs" | "reports" | "admin";

export type AppDef = {
  id: AppId;
  label: string;
  /** One line for the launcher card. */
  description: string;
  icon: React.ElementType;
  /** Where the launcher card and the app switcher land. */
  home: AppPath;
  links: readonly AppNavLink[];
  /**
   * Extra paths this app owns, for `appForPath` only — print routes and the
   * like, which have no nav entry. An exact path or a prefix; the longest
   * match wins, so "/admin/master-cbs" can sit in the CBS app while the rest
   * of "/admin" belongs to Administration.
   */
  ownedPaths?: readonly string[];
  adminOnly?: boolean;
  /** Show the estimate's discipline tree instead of a flat link list. */
  disciplineNav?: boolean;
  /** This app's work is version-scoped, so the header offers the version picker. */
  versionScoped?: boolean;
  /** Show "Recently viewed" — the log entities it tracks all live in one app. */
  showRecents?: boolean;
};

/**
 * Every take-off page, derived from the discipline config rather than listed
 * again: most of them have no route file of their own and are served by the
 * `$discipline` catch-all, so a hand-written list would go stale silently.
 */
const ESTIMATE_PATHS: readonly string[] = [
  "/setup",
  "/summary",
  "/basis",
  "/validation",
  ...disciplinesData.flatMap((d) => [
    ...(d.to ? [d.to] : []),
    ...(d.items ?? []).flatMap((i) => (i.to ? [i.to] : [])),
  ]),
];

/** Paths that belong to no app — the launcher itself and the help guide. */
const GLOBAL_PATHS = new Set(["/", "/help"]);

export const APPS: readonly AppDef[] = [
  {
    id: "estimate",
    label: "Field Estimate Form",
    description:
      "Build the estimate discipline by discipline — take-offs, crews and rates, then summary, basis and validation.",
    icon: ClipboardList,
    home: "/summary",
    disciplineNav: true,
    versionScoped: true,
    // The discipline tree IS this app's nav; see `Sidebar`.
    links: [],
    ownedPaths: ESTIMATE_PATHS,
  },
  {
    id: "changes",
    label: "Change Log",
    description:
      "Trends, PCOs, RFIs and field change orders — from first notice through pricing to approval.",
    icon: GitPullRequestArrow,
    home: "/changelog",
    showRecents: true,
    links: [
      { to: "/changelog", label: "Change Log" },
      { to: "/fco-log", label: "FCO Log" },
      { to: "/rfis", label: "RFIs" },
      { to: "/pco", label: "PCOs" },
      { to: "/trends", label: "Trends" },
    ],
    ownedPaths: ["/fco-print", "/rfi-print"],
  },
  {
    id: "cbs",
    label: "Cost Breakdown Structure",
    description:
      "The cost code library — the codes this project may book against, and the full catalog behind them.",
    icon: FolderTree,
    home: "/project-cost-codes",
    links: [
      { to: "/project-cost-codes", label: "Project Cost Code List" },
      { to: "/admin/master-cbs", label: "CBS Code Book", adminOnly: true },
    ],
  },
  {
    id: "reports",
    label: "Reporting",
    description:
      "Project dashboard, cost periods, earned value and cost/value reconciliation.",
    icon: BarChart3,
    home: "/dashboard",
    links: [
      { to: "/dashboard", label: "Dashboard" },
      { to: "/reporting", label: "Periods & EVM" },
      { to: "/admin/cvr-templates", label: "CVR Templates", adminOnly: true },
    ],
    ownedPaths: ["/cvr-print"],
  },
  {
    id: "admin",
    label: "Administration",
    description:
      "Projects and areas, labour rates and crew mixes, templates, users and system settings.",
    icon: Shield,
    home: "/admin/projects",
    adminOnly: true,
    links: [
      { to: "/admin/projects", label: "Projects", group: "Project data" },
      { to: "/admin/areas", label: "Areas", group: "Project data" },
      {
        to: "/admin/subcontractors",
        label: "Subcontractors",
        group: "Project data",
      },
      { to: "/admin/roles", label: "Roles", group: "Rates & resources" },
      {
        to: "/admin/crew-mixes",
        label: "Crew Mixes",
        group: "Rates & resources",
      },
      {
        to: "/admin/schedules",
        label: "Schedules",
        group: "Rates & resources",
      },
      {
        to: "/admin/fco-templates",
        label: "FCO Templates",
        group: "Templates",
      },
      { to: "/admin/users", label: "Users", group: "Platform" },
      { to: "/admin/system", label: "System", group: "Platform" },
    ],
    // CBS and CVR Templates are /admin routes that belong to other apps, so
    // this prefix has to lose to their longer, more specific matches.
    ownedPaths: ["/admin"],
  },
];

export const appById = Object.fromEntries(APPS.map((a) => [a.id, a])) as Record<
  AppId,
  AppDef
>;

/**
 * The app a path belongs to, by longest owned-path match, or null for the
 * launcher and the help guide.
 *
 * Anything left over is a take-off page: `$discipline` is a catch-all for a
 * single path segment, so an unrecognised one-segment route is the estimate's.
 */
export function appForPath(pathname: string): AppDef | null {
  if (GLOBAL_PATHS.has(pathname)) return null;

  let best: AppDef | null = null;
  let bestLength = -1;
  for (const app of APPS) {
    const owned = [
      ...app.links.map((l) => l.to as string),
      ...(app.ownedPaths ?? []),
    ];
    for (const path of owned) {
      const hit = pathname === path || pathname.startsWith(`${path}/`);
      if (hit && path.length > bestLength) {
        best = app;
        bestLength = path.length;
      }
    }
  }
  if (best) return best;

  return /^\/[^/]+$/.test(pathname) ? appById.estimate : null;
}

/** This app's links, minus the admin-only ones for a non-admin. */
export function visibleAppLinks(
  app: AppDef,
  isAdmin: boolean,
): readonly AppNavLink[] {
  return isAdmin ? app.links : app.links.filter((l) => !l.adminOnly);
}

/** The apps to offer in the switcher and on the launcher. */
export function visibleApps(isAdmin: boolean): readonly AppDef[] {
  return APPS.filter((a) => !a.adminOnly || isAdmin);
}
