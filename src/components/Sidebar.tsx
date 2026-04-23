import { Link } from "@tanstack/react-router";
import {
  BarChart2,
  Building2,
  Settings2,
  Zap,
  FlaskConical,
  Package,
  HardHat,
  ShieldCheck,
  ClipboardCheck,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import React from "react";

type NavItem = {
  label: string;
  to?: string;
};

type Discipline = {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
};

const disciplines: Discipline[] = [
  {
    id: "project-controls",
    label: "Project Controls",
    icon: BarChart2,
    items: [
      { label: "Change Log", to: "/" },
      { label: "Field Estimate Form", to: "/fef" },
      { label: "Cost Reports" },
      { label: "Schedule" },
    ],
  },
  {
    id: "civil",
    label: "Civil & Structural",
    icon: Building2,
    items: [
      { label: "Foundations" },
      { label: "Structural Steel" },
      { label: "Site Development" },
    ],
  },
  {
    id: "mechanical",
    label: "Mechanical",
    icon: Settings2,
    items: [
      { label: "Equipment List" },
      { label: "Piping Design" },
      { label: "HVAC" },
    ],
  },
  {
    id: "electrical",
    label: "Electrical",
    icon: Zap,
    items: [
      { label: "Power Distribution" },
      { label: "Instrumentation" },
      { label: "Control Systems" },
    ],
  },
  {
    id: "process",
    label: "Process Engineering",
    icon: FlaskConical,
    items: [
      { label: "Process Flow Diagrams" },
      { label: "P&IDs" },
      { label: "Process Safety" },
    ],
  },
  {
    id: "procurement",
    label: "Procurement",
    icon: Package,
    items: [
      { label: "Purchase Orders" },
      { label: "Vendor List" },
      { label: "Material Tracking" },
    ],
  },
  {
    id: "construction",
    label: "Construction",
    icon: HardHat,
    items: [
      { label: "Field Operations" },
      { label: "Commissioning" },
      { label: "Punch Lists" },
    ],
  },
  {
    id: "hse",
    label: "HSE",
    icon: ShieldCheck,
    items: [
      { label: "Safety Plans" },
      { label: "Incident Reports" },
      { label: "Risk Register" },
    ],
  },
  {
    id: "quality",
    label: "Quality",
    icon: ClipboardCheck,
    items: [
      { label: "Inspection Reports" },
      { label: "Non-Conformance" },
      { label: "Testing Records" },
    ],
  },
  {
    id: "document-control",
    label: "Document Control",
    icon: FolderOpen,
    items: [
      { label: "Drawings" },
      { label: "Specifications" },
      { label: "RFIs" },
    ],
  },
];

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

          return (
            <div key={discipline.id}>
              <button
                onClick={() => !collapsed && toggleSection(discipline.id)}
                title={collapsed ? discipline.label : undefined}
                className={`w-full flex items-center gap-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors ${collapsed ? "justify-center px-0" : "px-4"}`}
              >
                <Icon size={17} className="shrink-0 text-slate-500" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left">{discipline.label}</span>
                    {isOpen ? (
                      <ChevronDown size={13} className="text-slate-400" />
                    ) : (
                      <ChevronRight size={13} className="text-slate-400" />
                    )}
                  </>
                )}
              </button>

              {!collapsed && isOpen && (
                <div className="ml-9 border-l border-slate-200 mb-1">
                  {discipline.items.map((item) =>
                    item.to ? (
                      <Link
                        key={item.label}
                        to={item.to}
                        activeOptions={{ exact: true }}
                        className="block pl-3 pr-2 py-1.5 text-sm rounded-r transition-colors"
                        activeProps={{ className: "text-red-800 bg-red-50 font-medium" }}
                        inactiveProps={{ className: "text-slate-600 hover:bg-slate-100" }}
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
