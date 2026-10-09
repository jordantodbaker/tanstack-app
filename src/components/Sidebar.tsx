import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from "lucide-react";
import React from "react";
import { disciplines } from "~/config/disciplines";
import { useSelectedProject } from "~/lib/selected-project";
import { useSelectedVersion } from "~/lib/selected-version";
import { allowedCbsL1CodesQueryOptions } from "~/utils/setup";
import { useIsAdmin } from "~/lib/use-current-user";
import { invalidByDisciplineQueryOptions } from "~/utils/projectTotals";
import { userRecentsQueryOptions } from "~/utils/userPreferences";
import {
  RECENTS_MAX_DISPLAYED,
  RECENT_ENTITY_LABELS,
  RECENT_ENTITY_ROUTES,
} from "~/config/recent-entities";
import { visibleAppLinks, type AppDef } from "~/config/apps";
import { ProjectSelect } from "~/components/ProjectSelect";
import { VersionSelect } from "~/components/VersionSelect";

/**
 * The current app's navigation.
 *
 * What it renders depends on the app: the Field Estimate Form gets the
 * discipline take-off tree (`disciplineNav`), everything else a flat list of
 * that app's pages, grouped where the app supplies groups. Nothing here is
 * global any more — the discipline tree used to render on every page in the
 * product, including the Change Log, which has no disciplines.
 */
export function Sidebar({
  app,
  mobileOpen = false,
  onMobileClose,
}: {
  /** The app the current route belongs to; null on the launcher and /help. */
  app: AppDef | null;
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const isAdmin = useIsAdmin();

  if (app === null) {
    // The launcher and the help guide stand outside the apps and carry no nav.
    return null;
  }

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 top-16 bg-black/40 z-20 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label={`${app.label} navigation`}
        className={`flex flex-col bg-white border-r border-slate-200 shrink-0 fixed md:static top-16 md:top-auto bottom-0 md:bottom-auto left-0 z-30 md:z-auto w-60 ${collapsed ? "md:w-14" : "md:w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} transition-transform md:transition-all duration-200 ease-in-out`}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-5 z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-slate-700 transition-colors"
        >
          {collapsed ? (
            <PanelLeftOpen size={12} />
          ) : (
            <PanelLeftClose size={12} />
          )}
        </button>

        <button
          onClick={onMobileClose}
          aria-label="Close sidebar"
          className="absolute right-2 top-2 md:hidden flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <X size={18} />
        </button>

        <nav className="flex-1 overflow-y-auto py-3">
          {/* Mobile/tablet block — the header hides the project pickers below
              `lg` to avoid overflow, so they live here instead. The app
              switcher stays in the header at every width. */}
          <div
            className={`lg:hidden border-b border-slate-200 pb-3 mb-2 ${collapsed ? "md:hidden" : ""}`}
          >
            <div className="px-4 pb-1 space-y-2">
              <ProjectSelect
                placeholder="Select project…"
                className="h-9 w-full"
              />
              {app.versionScoped && <VersionSelect className="h-9 w-full" />}
            </div>
          </div>

          {app.disciplineNav ? (
            <DisciplineNav
              collapsed={collapsed}
              onItemClick={onMobileClose}
              isAdmin={isAdmin}
            />
          ) : (
            <AppLinkNav
              app={app}
              collapsed={collapsed}
              onItemClick={onMobileClose}
              isAdmin={isAdmin}
            />
          )}
        </nav>

        {app.showRecents && (
          <RecentsSection collapsed={collapsed} onItemClick={onMobileClose} />
        )}
      </aside>
    </>
  );
}

const NAV_LINK_BASE =
  "w-full flex items-center gap-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors";
const navClass = (collapsed: boolean) =>
  `${NAV_LINK_BASE} ${collapsed ? "md:justify-center md:px-0 px-4" : "px-4"}`;
const SUB_LINK_CLASS =
  "block pl-3 pr-2 py-1.5 text-sm rounded-r transition-colors";
const SUB_ACTIVE = { className: "text-red-800 bg-red-50 font-medium" };
const SUB_INACTIVE = { className: "text-slate-600 hover:bg-slate-100" };

/**
 * A flat app's pages, under the app's own group headings. Used by every app
 * except the Field Estimate Form — Administration's nine pages across four
 * groups are what the headings are for.
 */
function AppLinkNav({
  app,
  collapsed,
  onItemClick,
  isAdmin,
}: {
  app: AppDef;
  collapsed: boolean;
  onItemClick?: () => void;
  isAdmin: boolean;
}) {
  const links = visibleAppLinks(app, isAdmin);

  // Preserve declaration order, both of the groups and within them.
  const groups: { name: string | null; links: typeof links }[] = [];
  for (const link of links) {
    const name = link.group ?? null;
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.links = [...last.links, link];
    else groups.push({ name, links: [link] });
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.name ?? "_"} className="mb-1">
          {group.name && (
            <p
              className={`px-4 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-400 uppercase ${collapsed ? "md:hidden" : ""}`}
            >
              {group.name}
            </p>
          )}
          {group.links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              activeOptions={{ exact: true }}
              onClick={onItemClick}
              title={collapsed ? link.label : undefined}
              className={navClass(collapsed)}
              activeProps={{
                className: `${navClass(collapsed)} bg-red-50 text-red-800`,
              }}
            >
              <span className={collapsed ? "md:hidden" : ""}>{link.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </>
  );
}

/**
 * The Field Estimate Form's take-off tree: one section per discipline, filtered
 * to the ones this project's CBS allow-list actually enables, with a warning
 * icon on any discipline holding invalid Take Off rows.
 */
function DisciplineNav({
  collapsed,
  onItemClick,
  isAdmin,
}: {
  collapsed: boolean;
  onItemClick?: () => void;
  isAdmin: boolean;
}) {
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    () => new Set(["project-controls"]),
  );
  const toggleSection = (id: string) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { projectId } = useSelectedProject();
  const { data: allowedL1Codes } = useQuery({
    ...allowedCbsL1CodesQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });
  // Drives the warning icon on disciplines whose Take Off has invalid rows
  // (started but Total Cost not computable). Has its own slim query — the
  // sidebar mounts on every estimate page, so we want it cheap;
  // Summary/Validation pull the full `projectFefRowTotals` payload when they
  // actually need the rest of the breakdown.
  const { versionId } = useSelectedVersion();
  const { data: invalidByDiscipline = {} } = useQuery(
    invalidByDisciplineQueryOptions(versionId),
  );

  const visibleDisciplines = React.useMemo(() => {
    // Setup is project-configuration; only admins should see or reach it.
    const allowed = isAdmin
      ? disciplines
      : disciplines.filter((d) => d.id !== "setup");
    if (projectId === null) {
      return allowed.filter((d) => d.id === "setup");
    }
    const allowedSet = new Set(allowedL1Codes ?? []);
    return allowed.filter((d) => {
      if (!d.l1Codes) return true;
      return d.l1Codes.some((code) => allowedSet.has(code));
    });
  }, [projectId, allowedL1Codes, isAdmin]);

  return (
    <>
      {visibleDisciplines.map((discipline) => {
        const Icon = discipline.icon;
        const isOpen = openSections.has(discipline.id);
        const invalidCount = invalidByDiscipline[discipline.id] ?? 0;
        const invalidLabel = `${invalidCount} invalid Take Off row${invalidCount === 1 ? "" : "s"}`;
        const warning =
          invalidCount > 0 ? (
            <AlertTriangle
              size={13}
              className="shrink-0 text-amber-500"
              aria-label={invalidLabel}
            />
          ) : null;
        const title =
          invalidCount > 0
            ? invalidLabel
            : collapsed
              ? discipline.label
              : undefined;

        return (
          <div key={discipline.id}>
            {discipline.to && !discipline.items ? (
              <Link
                to={discipline.to}
                title={title}
                className={navClass(collapsed)}
                onClick={onItemClick}
                activeProps={{
                  className: `${navClass(collapsed)} bg-red-50 text-red-800 [&>svg]:text-red-700`,
                }}
              >
                <Icon size={17} className="shrink-0 text-slate-500" />
                <span
                  className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}
                >
                  {discipline.label}
                </span>
                {!collapsed && warning}
              </Link>
            ) : (
              <button
                onClick={() => toggleSection(discipline.id)}
                title={title}
                className={navClass(collapsed)}
              >
                <Icon size={17} className="shrink-0 text-slate-500" />
                <span
                  className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}
                >
                  {discipline.label}
                </span>
                {!collapsed && warning}
                {discipline.items && (
                  <span className={collapsed ? "md:hidden" : ""}>
                    {isOpen ? (
                      <ChevronDown size={13} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={13} className="text-slate-400" />
                    )}
                  </span>
                )}
              </button>
            )}

            {isOpen && (
              <div
                className={`ml-9 border-l border-slate-200 mb-1 ${collapsed ? "md:hidden" : ""}`}
              >
                {discipline.items?.map((item) =>
                  item.to ? (
                    <Link
                      key={item.label}
                      to={item.to}
                      activeOptions={{ exact: true }}
                      onClick={onItemClick}
                      className={SUB_LINK_CLASS}
                      activeProps={SUB_ACTIVE}
                      inactiveProps={SUB_INACTIVE}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <span
                      key={item.label}
                      className="block pl-3 pr-2 py-1.5 text-sm text-slate-400 cursor-default select-none"
                    >
                      {item.label}
                    </span>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * Compact "Recently viewed" list pinned to the bottom of the Change Log's
 * sidebar — the five entity types it tracks (changes, FCOs, RFIs, trends,
 * PCOs) all live in that one app, so it shows nowhere else.
 *
 * Scoped to the currently-selected project: switching projects resets the list
 * to that project's recents (the full per-user log is kept in
 * `UserPreference.prefs.recentlyViewed`; the project filter is purely a
 * display choice). Hidden entirely when the sidebar is collapsed (no
 * horizontal room for two-line rows), when no project is selected, or when the
 * user has no recents for this project yet.
 *
 * A click navigates to the entity's list route with `?q={number}` so the
 * destination table is pre-filtered to that single record; one more click on
 * the row opens the dialog. We deliberately don't deep-link to the dialog
 * itself — routes don't carry dialog state today, and a list-filter is the
 * existing convention.
 */
function RecentsSection({
  collapsed,
  onItemClick,
}: {
  collapsed: boolean;
  onItemClick?: () => void;
}) {
  const [isOpen, setIsOpen] = React.useState(true);
  const { projectId } = useSelectedProject();
  const { data: allRecents = [] } = useQuery(userRecentsQueryOptions());

  const recents = React.useMemo(
    () =>
      projectId === null
        ? []
        : allRecents
            .filter((r) => r.projectId === projectId)
            .slice(0, RECENTS_MAX_DISPLAYED),
    [allRecents, projectId],
  );

  if (collapsed) return null;
  if (projectId === null) return null;
  if (recents.length === 0) return null;

  return (
    <div className="border-t border-slate-200 py-1 shrink-0">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="w-full flex items-center gap-3 py-2 px-4 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Clock size={17} className="shrink-0 text-slate-500" />
        <span className="flex-1 text-left">Recently viewed</span>
        {isOpen ? (
          <ChevronDown size={13} className="text-slate-400" />
        ) : (
          <ChevronRight size={13} className="text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="ml-9 border-l border-slate-200 mb-1">
          {recents.map((r) => (
            <Link
              key={`${r.entityType}:${r.entityId}`}
              to={RECENT_ENTITY_ROUTES[r.entityType]}
              search={{ q: r.number || r.title }}
              onClick={onItemClick}
              title={`${RECENT_ENTITY_LABELS[r.entityType]} ${r.number} — ${r.title}`}
              className="block pl-3 pr-2 py-1.5 text-xs text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <span className="font-medium text-slate-700">
                {RECENT_ENTITY_LABELS[r.entityType]}
                {r.number ? ` ${r.number}` : ""}
              </span>
              <span className="block truncate text-slate-500">{r.title}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
