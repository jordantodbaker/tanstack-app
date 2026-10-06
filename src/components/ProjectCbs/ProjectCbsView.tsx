import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Loader2, X } from "lucide-react";
import { SearchBox } from "~/components/SearchBox";
import { useSelectedProject } from "~/lib/selected-project";
import {
  projectCbsDictionaryQueryOptions,
  type ProjectCbsDictionaryItem,
} from "~/utils/cbs";
import {
  buildCbsTree,
  collectExpandableKeys,
  pruneCbsTree,
  rowTypeBadge,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import {
  CBS_HEADER_COLOR,
  CBS_LEGEND_LEVELS,
  cbsColorForLevel,
  type CbsLevelColor,
} from "~/config/cbs-level-colors";

/**
 * Web view of the selected project's CBS: the dictionary rows toggled on the
 * Setup page, laid out as colour-by-level collapsible hierarchies. Two
 * sections share one dataset — the Code Book shows the original Master CBS
 * rows only, the Master CBS Dictionary adds the generated S/M twins. Colours
 * mirror the workbook's outline fills (see ~/config/cbs-level-colors).
 */

type Node = CbsTreeNode<ProjectCbsDictionaryItem>;

/** Detail-panel rows in the workbook's column order. */
const DETAIL_FIELDS: {
  label: string;
  get: (i: ProjectCbsDictionaryItem) => string | null | undefined;
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

/**
 * One flattened tree row. Memoized and fed only primitives + stable refs
 * (`isOpen`/`isSelected` booleans, a stable `color`, stable callbacks) so that
 * scrolling the virtual list — and selecting/toggling — re-renders only the
 * rows whose own state changed, not the whole tree.
 */
const CbsRow = React.memo(function CbsRow({
  node,
  hasChildren,
  isOpen,
  isSelected,
  onToggle,
  onSelect,
  color,
}: {
  node: Node;
  hasChildren: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
  onSelect: (node: Node) => void;
  color: CbsLevelColor;
}) {
  const { item } = node;
  const badge = rowTypeBadge(item.rowType);

  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={isSelected}
      onClick={() => onSelect(node)}
      style={{
        backgroundColor: color.fill,
        color: color.text,
        paddingLeft: 8 + node.depth * 18,
      }}
      className={`flex cursor-pointer items-center gap-2 border-b border-black/5 py-1 pr-3 text-sm transition-[filter] hover:brightness-95 ${
        isSelected ? "ring-2 ring-inset ring-sky-900/60" : ""
      }`}
    >
      {hasChildren ? (
        <button
          type="button"
          aria-label={isOpen ? "Collapse" : "Expand"}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(node.pathKey);
          }}
          className="grid size-4 shrink-0 place-items-center rounded hover:bg-black/10"
        >
          <ChevronRight
            size={13}
            className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0 text-center opacity-40">·</span>
      )}
      <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">
        {item.displayCode}
      </span>
      <span className="truncate font-medium">{item.name}</span>
      {badge && (
        <span
          title={badge.title}
          className="shrink-0 rounded border border-current/30 px-1 text-[10px] leading-4 font-semibold opacity-70"
        >
          {badge.label}
        </span>
      )}
      {item.uom && (
        <span className="ml-auto shrink-0 font-mono text-[11px] opacity-70">
          {item.uom}
        </span>
      )}
    </div>
  );
});

/** Depth-first flatten of the nodes that are currently visible: a node's
 *  children are included only when it's expanded (or a search forces it open). */
function flattenVisible(
  nodes: Node[],
  expanded: Set<string>,
  forceExpand: boolean,
): Node[] {
  const out: Node[] = [];
  const walk = (list: Node[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length > 0 && (forceExpand || expanded.has(n.pathKey))) {
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
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
  const rows = DETAIL_FIELDS.map((f) => ({ label: f.label, value: f.get(item) }))
    .filter((r): r is { label: string; value: string } => !!r.value);
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
      <dl className="min-h-0 flex-1 divide-y divide-slate-100 overflow-y-auto px-4 py-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-2 py-1.5">
            <dt className="text-xs font-medium text-slate-500">{r.label}</dt>
            <dd className="break-words text-slate-800">{r.value}</dd>
          </div>
        ))}
      </dl>
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
      <span className="ml-1 flex flex-wrap items-center gap-1">
        {CBS_LEGEND_LEVELS.map((lvl) => {
          const c = cbsColorForLevel(lvl);
          return (
            <span
              key={lvl}
              title={`Level ${lvl}`}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={{
                backgroundColor: c.fill,
                color: c.text,
                outline: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              L{lvl}
            </span>
          );
        })}
      </span>
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

/** The virtualized, scrollable tree panel (header bar + windowed rows). */
function TreePanel({
  flat,
  expanded,
  needle,
  selectedKey,
  onToggle,
  onSelect,
  query,
}: {
  flat: Node[];
  expanded: Set<string>;
  needle: string;
  selectedKey: string | null;
  onToggle: (key: string) => void;
  onSelect: (node: Node) => void;
  query: string;
}) {
  // Virtualize so only the rows in view are in the DOM — "Expand all" over
  // thousands of nodes stays cheap, and scroll/select/toggle never re-render
  // the whole tree.
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 29,
    overscan: 12,
  });

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      <div
        className="flex items-center gap-2 px-3 py-2 text-xs font-semibold"
        style={{
          backgroundColor: CBS_HEADER_COLOR.fill,
          color: CBS_HEADER_COLOR.text,
        }}
      >
        CBS code &amp; name
        <span className="ml-auto opacity-80">UOM</span>
      </div>
      {flat.length === 0 ? (
        <p className="p-6 text-center text-sm text-slate-500">
          {query ? `No rows match “${query}”.` : "No CBS items selected."}
        </p>
      ) : (
        <div
          ref={scrollRef}
          role="tree"
          aria-label="CBS hierarchy"
          className="max-h-[70vh] overflow-auto"
        >
          <div
            style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
          >
            {rowVirtualizer.getVirtualItems().map((vi) => {
              const node = flat[vi.index];
              return (
                <div
                  key={node.pathKey}
                  data-index={vi.index}
                  ref={rowVirtualizer.measureElement}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${vi.start}px)`,
                  }}
                >
                  <CbsRow
                    node={node}
                    hasChildren={node.children.length > 0}
                    isOpen={needle.length > 0 || expanded.has(node.pathKey)}
                    isSelected={selectedKey === node.pathKey}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    color={cbsColorForLevel(node.level)}
                  />
                </div>
              );
            })}
          </div>
        </div>
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
    () => flattenVisible(visibleNodes, expanded, needle.length > 0),
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
        <TreePanel
          flat={flat}
          expanded={expanded}
          needle={needle}
          selectedKey={selected?.pathKey ?? null}
          onToggle={toggle}
          onSelect={setSelected}
          query={query}
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
