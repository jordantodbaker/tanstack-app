import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, X } from "lucide-react";
import { SearchBox } from "~/components/SearchBox";
import { useSelectedProject } from "~/lib/selected-project";
import {
  cbsItemDetailQueryOptions,
  projectCbsDictionaryQueryOptions,
  type CbsItemDetail,
  type ProjectCbsDictionaryItem,
} from "~/utils/cbs";
import {
  buildCbsTree,
  collectExpandableKeys,
  pruneCbsTree,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import {
  cbsColorForLevel,
  type CbsLevelColor,
} from "~/config/cbs-level-colors";
import {
  CbsLevelLegend,
  CbsTreePanel,
  flattenVisibleCbsNodes,
} from "~/components/CbsTree/CbsTreePanel";

/**
 * The CBS items available on the selected project: the dictionary rows
 * toggled on the Setup page, laid out as colour-by-level collapsible
 * hierarchies. Two sections share one dataset — the Code Book shows the
 * original Master CBS rows only, the Master CBS Dictionary adds the generated
 * S/M twins. Colours mirror the workbook's outline fills (see
 * ~/config/cbs-level-colors); the tree itself is the shared CbsTreePanel.
 */

type Node = CbsTreeNode<ProjectCbsDictionaryItem>;

/** Detail-panel rows in the workbook's column order. */
const DETAIL_FIELDS: {
  label: string;
  get: (i: CbsItemDetail) => string | null | undefined;
}[] = [
  { label: "UOM", get: (i) => i.uom },
  { label: "Sub Code", get: (i) => yesNo(i.subReporting) },
  { label: "Material Code", get: (i) => yesNo(i.materialCode) },
  { label: "Material Type", get: (i) => i.materialType },
  { label: "Cost Center", get: (i) => i.costCenter },
  { label: "Cost Classification", get: (i) => i.costClassification },
  { label: "Status", get: (i) => i.status },
  { label: "Account Description", get: (i) => i.accountDescription },
  { label: "L2 Description", get: (i) => i.l2Description },
  { label: "Core", get: (i) => i.core },
  { label: "Core Extension", get: (i) => i.coreExtension },
  { label: "WBS", get: (i) => i.wbs },
  { label: "P6 Cost Account (L1-4)", get: (i) => i.p6CostAccount },
  { label: "G/L", get: (i) => i.gl },
  { label: "Discipline", get: (i) => i.discipline },
  { label: "Cost Code", get: (i) => i.costCode },
  { label: "Description", get: (i) => i.description },
  { label: "Notes", get: (i) => i.notes },
  { label: "Generated From", get: (i) => i.generatedFrom },
  { label: "Row Type", get: (i) => rowTypeLabel(i.rowType) },
];

function yesNo(v: boolean | null): string | null {
  if (v === true) return "YES";
  if (v === false) return "NO";
  return null;
}

function rowTypeLabel(rowType: ProjectCbsDictionaryItem["rowType"]): string {
  if (rowType === "SUB") return "Generated - Sub Code";
  if (rowType === "MATERIAL") return "Generated - Material Code";
  return "Original";
}

type Counts = {
  total: number;
  original: number;
  subRows: number;
  materialRows: number;
};

function countRows(items: readonly ProjectCbsDictionaryItem[]): Counts {
  const c: Counts = { total: items.length, original: 0, subRows: 0, materialRows: 0 };
  for (const i of items) {
    if (i.rowType === "SUB") c.subRows++;
    else if (i.rowType === "MATERIAL") c.materialRows++;
    else c.original++;
  }
  return c;
}

function DetailPanel({
  node,
  color,
  onClose,
}: {
  node: Node;
  color: CbsLevelColor;
  onClose: () => void;
}) {
  const { item } = node;
  // The tree only carries the slim row; the full column set is fetched when a
  // row is selected (and cached for the session).
  const detail = useQuery(cbsItemDetailQueryOptions(item.id));
  const rows = detail.data
    ? DETAIL_FIELDS.map((f) => ({ label: f.label, value: f.get(detail.data) }))
        .filter((r): r is { label: string; value: string } => !!r.value)
    : [];
  return (
    <div className="flex h-full flex-col">
      <div
        className="flex items-start justify-between gap-2 rounded-t-lg px-4 py-3"
        style={{ backgroundColor: color.fill, color: color.text }}
      >
        <div className="min-w-0">
          <div className="font-mono text-xs tabular-nums opacity-80">
            {item.displayCode}
          </div>
          <div className="text-sm font-semibold break-words">{item.name}</div>
          <div className="mt-0.5 text-[11px] opacity-70">
            Level {node.level} · {rowTypeLabel(item.rowType)}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close details"
          className="shrink-0 rounded p-0.5 hover:bg-black/10"
        >
          <X size={15} />
        </button>
      </div>
      {detail.isPending ? (
        <div className="flex items-center gap-2 px-4 py-6 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin" /> Loading detail…
        </div>
      ) : detail.isError ? (
        <p className="px-4 py-6 text-sm text-red-600">
          Failed to load this row's detail.
        </p>
      ) : (
        <dl className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-4 py-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-2 py-1.5">
              <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
              <dd className="break-words text-slate-800">{r.value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Row-count pills + the per-level colour legend. */
function CountsLegend({ counts }: { counts: Counts }) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {counts.total.toLocaleString()} rows
      </span>
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
        {counts.original.toLocaleString()} original · {counts.subRows} sub ·{" "}
        {counts.materialRows} material
      </span>
      <CbsLevelLegend className="ml-1" />
    </div>
  );
}

/** Search box + expand/collapse-all + (while searching) a match count. */
function HierarchyToolbar({
  query,
  setQuery,
  onExpandAll,
  onCollapseAll,
  matchCount,
}: {
  query: string;
  setQuery: (v: string) => void;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  matchCount: number | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <SearchBox
        value={query}
        onChange={setQuery}
        placeholder="Search code or name…"
        ariaLabel="Search this CBS hierarchy"
        className="h-8 w-64"
      />
      <button
        type="button"
        onClick={onExpandAll}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Expand all
      </button>
      <button
        type="button"
        onClick={onCollapseAll}
        className="rounded-md border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
      >
        Collapse all
      </button>
      {matchCount !== null && (
        <span className="text-xs text-slate-500">
          {matchCount.toLocaleString()} match{matchCount === 1 ? "" : "es"}
        </span>
      )}
    </div>
  );
}

/** The collapsible tree + toolbar + detail for one CBS dataset. Owns the state
 *  and derivation; the presentational pieces above take plain props. */
function CbsHierarchy({
  items,
  nodes,
}: {
  items: ProjectCbsDictionaryItem[];
  nodes: Node[];
}) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [selected, setSelected] = React.useState<Node | null>(null);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const { nodes: visibleNodes, matches } = React.useMemo(
    () => pruneCbsTree(nodes, needle),
    [needle, nodes],
  );

  const toggle = React.useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const expandableKeys = React.useMemo(() => collectExpandableKeys(nodes), [nodes]);
  const counts = React.useMemo(() => countRows(items), [items]);

  const flat = React.useMemo(
    () => flattenVisibleCbsNodes(visibleNodes, expanded, needle.length > 0),
    [visibleNodes, expanded, needle],
  );

  return (
    <div className="px-4 pb-4 md:px-5">
      <CountsLegend counts={counts} />
      <HierarchyToolbar
        query={query}
        setQuery={setQuery}
        onExpandAll={() => setExpanded(new Set(expandableKeys))}
        onCollapseAll={() => setExpanded(new Set())}
        matchCount={needle ? matches : null}
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <CbsTreePanel
          flat={flat}
          expanded={expanded}
          forceOpen={needle.length > 0}
          selectedKey={selected?.pathKey ?? null}
          onToggle={toggle}
          onSelect={setSelected}
          emptyMessage={
            query ? `No rows match “${query}”.` : "No CBS items selected."
          }
        />

        <aside className="hidden rounded-lg border border-slate-200 bg-white shadow-sm lg:block lg:self-start">
          {selected ? (
            <DetailPanel
              node={selected}
              color={cbsColorForLevel(selected.level)}
              onClose={() => setSelected(null)}
            />
          ) : (
            <p className="p-6 text-sm text-slate-500">
              Select a row to see its full CBS detail (UOM, cost code, account,
              discipline, description, and more).
            </p>
          )}
        </aside>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        Source: the Master CBS Dictionary (prisma/data/MasterCBS.xlsx), limited
        to the items selected for this project on the Setup page. Colours
        mirror the workbook's outline levels.
      </p>
    </div>
  );
}

/** A collapsible section over one view of the project's dictionary. */
function CbsSection({
  title,
  description,
  items,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  items: ProjectCbsDictionaryItem[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  // Build the tree only once the section is opened (and keep it afterwards).
  const nodes = React.useMemo(
    () => (open ? buildCbsTree(items) : null),
    [open, items],
  );

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50"
      >
        <ChevronRight
          size={18}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <p className="truncate text-xs text-slate-500">{description}</p>
        </div>
        <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
          {items.length.toLocaleString()} rows
        </span>
      </button>
      {open && nodes && (
        <div className="border-t border-slate-100">
          <CbsHierarchy items={items} nodes={nodes} />
        </div>
      )}
    </section>
  );
}

function ProjectCbsSections({ projectId }: { projectId: number }) {
  const query = useQuery(projectCbsDictionaryQueryOptions(projectId));

  if (query.isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading CBS data…
      </div>
    );
  }
  if (query.isError) {
    return (
      <p className="px-4 py-10 text-sm text-red-600">
        Failed to load this project's CBS.
      </p>
    );
  }

  const items = query.data;
  const originals = items.filter((i) => i.rowType === "ORIGINAL");

  return (
    <div className="flex flex-col gap-4">
      <CbsSection
        title="CBS Code Book"
        description="The project's selected Master CBS rows — original rows only (no generated S/M)."
        items={originals}
        defaultOpen
      />
      <CbsSection
        title="Master CBS Dictionary"
        description="The project's selected dictionary rows — originals plus the generated S/M rows."
        items={items}
        defaultOpen
      />
    </div>
  );
}

export function ProjectCbsView() {
  const { projectId } = useSelectedProject();

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 md:px-8">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-slate-800">Project CBS</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-500">
          The CBS items available on this project — the dictionary rows
          selected on the Setup page — as a colour-coded, collapsible
          hierarchy. Colours and grouping mirror the Master CBS Dictionary
          workbook.
        </p>
      </header>

      {projectId === null ? (
        <p className="text-sm text-slate-500">
          Choose a project to see its available CBS items.
        </p>
      ) : (
        <ProjectCbsSections key={projectId} projectId={projectId} />
      )}
    </div>
  );
}
