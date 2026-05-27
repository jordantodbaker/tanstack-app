import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
  Shield,
  X,
} from "lucide-react";
import React from "react";
import { disciplines } from "~/config/disciplines";
import { useSelectedProject } from "~/lib/selected-project";
import { allowedCbsL1CodesQueryOptions } from "~/utils/setup";
import { useIsAdmin } from "~/lib/use-current-user";
import { invalidByDisciplineQueryOptions } from "~/utils/projectTotals";

/**
 * Order shown under the Admin section. The `to` paths must exist as routes
 * under `/admin/*`; the parent `admin.tsx` layout enforces the role gate so
 * adding an entry here doesn't require touching auth.
 */
const ADMIN_LINKS = [
  { to: "/admin/projects", label: "Projects" },
  { to: "/admin/subcontractors", label: "Subcontractors" },
  { to: "/admin/areas", label: "Areas" },
  { to: "/admin/users", label: "Users" },
  { to: "/admin/system", label: "System" },
] as const;

export function Sidebar({
  mobileOpen = false,
  onMobileClose,
}: {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    () => new Set(["project-controls", "admin"]),
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const { projectId } = useSelectedProject();
  const { data: allowedL1Codes } = useQuery({
    ...allowedCbsL1CodesQueryOptions(projectId ?? 0),
    enabled: projectId !== null,
  });
  // Drives the warning icon on disciplines whose Take Off has invalid rows
  // (started but Total Cost not computable). Has its own slim query — the
  // sidebar mounts on every page, so we want it cheap; Summary/Validation
  // pages pull the full `projectFefRowTotals` payload when they actually
  // need the rest of the breakdown.
  const { data: invalidByDiscipline = {} } = useQuery(
    invalidByDisciplineQueryOptions(projectId),
  );

  const isAdmin = useIsAdmin();

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

  const navClassName = `w-full flex items-center gap-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${collapsed ? "md:justify-center md:px-0 px-4" : "px-4"}`;

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
        className={`flex flex-col bg-white border-r border-slate-200 shrink-0 fixed md:static top-16 md:top-auto bottom-0 md:bottom-auto left-0 z-30 md:z-auto w-60 ${collapsed ? "md:w-14" : "md:w-60"} ${mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"} transition-transform md:transition-all duration-200 ease-in-out`}
      >
        <button
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-5 z-10 hidden md:flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-slate-700 transition-colors"
        >
          {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
        </button>

        <button
          onClick={onMobileClose}
          aria-label="Close sidebar"
          className="absolute right-2 top-2 md:hidden flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
        >
          <X size={18} />
        </button>

        <nav className="flex-1 overflow-y-auto py-3">
          {visibleDisciplines.map((discipline) => {
            const Icon = discipline.icon;
            const isOpen = openSections.has(discipline.id);
            const invalidCount = invalidByDiscipline[discipline.id] ?? 0;
            const warning =
              invalidCount > 0 ? (
                <AlertTriangle
                  size={13}
                  className="shrink-0 text-amber-500"
                  aria-label={`${invalidCount} invalid Take Off row${invalidCount === 1 ? "" : "s"}`}
                />
              ) : null;

            return (
              <div key={discipline.id}>
                {discipline.to && !discipline.items ? (
                  <Link
                    to={discipline.to}
                    title={
                      invalidCount > 0
                        ? `${invalidCount} invalid Take Off row${invalidCount === 1 ? "" : "s"}`
                        : collapsed
                          ? discipline.label
                          : undefined
                    }
                    className={navClassName}
                    onClick={onMobileClose}
                    activeProps={{
                      className: `${navClassName} bg-red-50 text-red-800 [&>svg]:text-red-700`,
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
                    title={
                      invalidCount > 0
                        ? `${invalidCount} invalid Take Off row${invalidCount === 1 ? "" : "s"}`
                        : collapsed
                          ? discipline.label
                          : undefined
                    }
                    className={navClassName}
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
                          onClick={onMobileClose}
                          className="block pl-3 pr-2 py-1.5 text-sm rounded-r transition-colors"
                          activeProps={{
                            className: "text-red-800 bg-red-50 font-medium",
                          }}
                          inactiveProps={{
                            className: "text-slate-600 hover:bg-slate-100",
                          }}
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
        </nav>

        {/* Admin — pinned below the scrolling discipline list so it stays
            visible regardless of how many disciplines are shown. Only
            rendered for ADMINISTRATOR users; the /admin routes are also
            guarded server-side, so hiding this is purely UX. */}
        {isAdmin && (
          <div className="border-t border-slate-200 py-1 shrink-0">
            <button
              onClick={() => toggleSection("admin")}
              title={collapsed ? "Admin" : undefined}
              className={navClassName}
            >
              <Shield size={17} className="shrink-0 text-slate-500" />
              <span
                className={`flex-1 text-left ${collapsed ? "md:hidden" : ""}`}
              >
                Admin
              </span>
              <span className={collapsed ? "md:hidden" : ""}>
                {openSections.has("admin") ? (
                  <ChevronDown size={13} className="text-slate-400" />
                ) : (
                  <ChevronRight size={13} className="text-slate-400" />
                )}
              </span>
            </button>

            {openSections.has("admin") && (
              <div
                className={`ml-9 border-l border-slate-200 mb-1 ${collapsed ? "md:hidden" : ""}`}
              >
                {ADMIN_LINKS.map((link) => (
                  <Link
                    key={link.to}
                    to={link.to}
                    activeOptions={{ exact: true }}
                    onClick={onMobileClose}
                    className="block pl-3 pr-2 py-1.5 text-sm rounded-r transition-colors"
                    activeProps={{
                      className: "text-red-800 bg-red-50 font-medium",
                    }}
                    inactiveProps={{
                      className: "text-slate-600 hover:bg-slate-100",
                    }}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
