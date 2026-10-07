import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, X } from "lucide-react";
import {
  cbsItemDetailQueryOptions,
  type CbsItemDetail,
  type CbsTreeRow,
} from "~/utils/cbs";
import {
  buildCbsTree,
  cbsFlagBadges,
  pruneCbsTree,
  type CbsBadge,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import { cbsColorForLevel, type CbsLevelColor } from "~/config/cbs-level-colors";
import {
  CbsLevelLegend,
  CbsTreePanel,
  flattenVisibleCbsNodes,
} from "~/components/CbsTree/CbsTreePanel";
import { CbsTreeToolbar } from "~/components/CbsTree/CbsTreeToolbar";
import { useCbsTreeExpansion } from "~/components/CbsTree/useCbsTreeExpansion";

/**
 * The two-section CBS Dictionary browser: a Code Book of original rows and a
 * Master CBS Dictionary that adds the generated S/M rows, each a
 * colour-by-level collapsible hierarchy with a detail panel.
 *
 * `CbsDictionaryBrowser` is one such dataset on its own (the project-scoped
 * Project Cost Code List); `CbsDictionarySections` stacks two of them for the
 * admin-only Master CBS page. Colours mirror the workbook's outline fills (see
 * ~/config/cbs-level-colors); the tree itself is the shared CbsTreePanel.
 */

// Rows and the detail header only need the shared tree fields; the full
// column set is fetched per selected row.
type Node = CbsTreeNode;

/** For views that list only original rows: a badge reports what the row itself
 *  carries (its Sub Code / Material Code) rather than what it is. */
export const cbsFlagBadgesFor = (node: Node): readonly CbsBadge[] =>
  cbsFlagBadges(node.item);

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

function rowTypeLabel(rowType: CbsTreeRow["rowType"]): string {
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

function countRows(items: readonly CbsTreeRow[]): Counts {
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

/**
 * Row-count pills + the per-level colour legend. The row-type breakdown is
 * only worth showing where generated rows can actually appear; a Code Book
 * view would just read "… · 0 sub · 0 material".
 */
function CountsLegend({
  counts,
  showRowTypes,
}: {
  counts: Counts;
  showRowTypes: boolean;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {counts.total.toLocaleString()} rows
      </span>
      {showRowTypes && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {counts.original.toLocaleString()} original ·{" "}
          {counts.subRows.toLocaleString()} sub ·{" "}
          {counts.materialRows.toLocaleString()} material
        </span>
      )}
      <CbsLevelLegend className="ml-1" />
    </div>
  );
}

/**
 * The searchable tree + toolbar + detail panel for one set of CBS rows. Owns
 * the state and derivation; the presentational pieces above take plain props.
 *
 * Usable on its own (a single-section page) or inside `CbsSection` (one of
 * several collapsible datasets). Builds its tree on mount, so a section that
 * mounts it lazily still pays for the build only when opened.
 */
export function CbsDictionaryBrowser({
  items,
  badgesFor,
  sourceNote,
  emptyMessage,
  showRowTypeCounts = true,
}: {
  items: CbsTreeRow[];
  badgesFor?: (node: Node) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  showRowTypeCounts?: boolean;
}) {
  const nodes = React.useMemo(() => buildCbsTree(items), [items]);
  const { expanded, toggle, expandAll, collapseAll } = useCbsTreeExpansion(nodes);
  const [selected, setSelected] = React.useState<Node | null>(null);
  const [query, setQuery] = React.useState("");

  const needle = query.trim().toLowerCase();
  const { nodes: visibleNodes, matches } = React.useMemo(
    () => pruneCbsTree(nodes, needle),
    [needle, nodes],
  );

  const counts = React.useMemo(() => countRows(items), [items]);

  const flat = React.useMemo(
    () => flattenVisibleCbsNodes(visibleNodes, expanded, needle.length > 0),
    [visibleNodes, expanded, needle],
  );

  return (
    <div className="px-4 pb-4 md:px-5">
      <CountsLegend counts={counts} showRowTypes={showRowTypeCounts} />
      <CbsTreeToolbar
        query={query}
        onQueryChange={setQuery}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
      >
        {needle && (
          <span className="text-xs text-slate-500">
            {matches.toLocaleString()} match{matches === 1 ? "" : "es"}
          </span>
        )}
      </CbsTreeToolbar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <CbsTreePanel
          badgesFor={badgesFor}
          flat={flat}
          expanded={expanded}
          forceOpen={needle.length > 0}
          selectedKey={selected?.pathKey ?? null}
          onToggle={toggle}
          onSelect={setSelected}
          emptyMessage={query ? `No rows match “${query}”.` : emptyMessage}
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

      <p className="mt-2 text-[11px] text-slate-400">{sourceNote}</p>
    </div>
  );
}

/** A collapsible section over one view of a dictionary. */
function CbsSection({
  title,
  description,
  items,
  badgesFor,
  sourceNote,
  emptyMessage,
  defaultOpen = false,
}: {
  title: string;
  description: string;
  items: CbsTreeRow[];
  badgesFor?: (node: Node) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = React.useState(defaultOpen);

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
      {/* Mounted only while open, so a closed section never builds its tree. */}
      {open && (
        <div className="border-t border-slate-100">
          <CbsDictionaryBrowser
            items={items}
            badgesFor={badgesFor}
            sourceNote={sourceNote}
            emptyMessage={emptyMessage}
          />
        </div>
      )}
    </section>
  );
}

const MASTER_SOURCE_NOTE =
  "Source: the Master CBS Dictionary (prisma/data/MasterCBS.xlsx), in full — no project allow-list applied. Colours mirror the workbook's outline levels.";
const MASTER_EMPTY = "No CBS items in the catalog.";

/**
 * The whole catalog as two collapsible datasets: a Code Book of original rows
 * and the full dictionary including the generated S/M rows. The Admin → Master
 * CBS page; project-scoped pages render a single `CbsDictionaryBrowser`.
 */
export function CbsDictionarySections({ items }: { items: CbsTreeRow[] }) {
  const originals = React.useMemo(
    () => items.filter((i) => i.rowType === "ORIGINAL"),
    [items],
  );

  return (
    <div className="flex flex-col gap-4">
      <CbsSection
        title="CBS Code Book"
        description="Every Master CBS row — original rows only. S / M mark a row's own Sub Code / Material Code."
        items={originals}
        badgesFor={cbsFlagBadgesFor}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
      />
      <CbsSection
        title="Master CBS Dictionary"
        description="The complete dictionary — every original row plus the generated S/M rows."
        items={items}
        sourceNote={MASTER_SOURCE_NOTE}
        emptyMessage={MASTER_EMPTY}
        defaultOpen
      />
    </div>
  );
}

/** Shared pending / error chrome for whichever query feeds the sections. */
export function CbsDictionaryStatus({
  isPending,
  isError,
  errorMessage,
}: {
  isPending: boolean;
  isError: boolean;
  errorMessage: string;
}) {
  if (isPending) {
    return (
      <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Loading CBS data…
      </div>
    );
  }
  if (isError) {
    return <p className="px-4 py-10 text-sm text-red-600">{errorMessage}</p>;
  }
  return null;
}
