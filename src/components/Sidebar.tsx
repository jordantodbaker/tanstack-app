import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import React from "react";
import { disciplines } from "~/config/disciplines";

export function Sidebar() {
  const [collapsed, setCollapsed] = React.useState(false);
  const [openSections, setOpenSections] = React.useState<Set<string>>(
    () => new Set(["project-controls"]),
  );

  const toggleSection = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <aside
      className={`relative flex flex-col bg-white border-r border-slate-200 shrink-0 transition-all duration-200 ease-in-out ${collapsed ? "w-14" : "w-60"}`}
    >
      <button
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm text-slate-400 hover:text-slate-700 transition-colors"
      >
        {collapsed ? <PanelLeftOpen size={12} /> : <PanelLeftClose size={12} />}
      </button>

      <nav className="flex-1 overflow-y-auto py-3">
        {disciplines.map((discipline) => {
          const Icon = discipline.icon;
          const isOpen = openSections.has(discipline.id);

          const navClassName = `w-full flex items-center gap-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${collapsed ? "justify-center px-0" : "px-4"}`;

          return (
            <div key={discipline.id}>
              {discipline.to && !discipline.items ? (
                <Link
                  to={discipline.to}
                  title={collapsed ? discipline.label : undefined}
                  className={navClassName}
                  activeProps={{
                    className: `${navClassName} bg-red-50 text-red-800 [&>svg]:text-red-700`,
                  }}
                >
                  <Icon size={17} className="shrink-0 text-slate-500" />
                  {!collapsed && (
                    <span className="flex-1 text-left">{discipline.label}</span>
                  )}
                </Link>
              ) : (
                <button
                  onClick={() => !collapsed && toggleSection(discipline.id)}
                  title={collapsed ? discipline.label : undefined}
                  className={navClassName}
                >
                  <Icon size={17} className="shrink-0 text-slate-500" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left">
                        {discipline.label}
                      </span>
                      {discipline.items &&
                        (isOpen ? (
                          <ChevronDown size={13} className="text-slate-400" />
                        ) : (
                          <ChevronRight size={13} className="text-slate-400" />
                        ))}
                    </>
                  )}
                </button>
              )}

              {!collapsed && isOpen && (
                <div className="ml-9 border-l border-slate-200 mb-1">
                  {discipline.items?.map((item) =>
                    item.to ? (
                      <Link
                        key={item.label}
                        to={item.to}
                        activeOptions={{ exact: true }}
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
    </aside>
  );
}
