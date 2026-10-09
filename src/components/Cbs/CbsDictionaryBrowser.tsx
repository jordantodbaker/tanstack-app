import * as React from "react";
import { Loader2 } from "lucide-react";
import type { CbsBrowserRow } from "~/utils/cbs";
import {
  buildCbsTree,
  cbsFilterIsEmpty,
  cbsFlagBadges,
  pruneCbsTree,
  type CbsBadge,
  type CbsRowFilter,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import {
  CbsLevelLegend,
  CbsTreePanel,
  flattenVisibleCbsNodes,
} from "~/components/Cbs/CbsTreePanel";
import { CbsDetailPanel } from "~/components/Cbs/CbsDetailPanel";
import { CbsTreeToolbar } from "~/components/Cbs/CbsTreeToolbar";
import { ExportCbsXlsxButton } from "~/components/Cbs/ExportCbsXlsxButton";
import type { CbsExportView } from "~/lib/cbs-export";
import { useCbsTreeExpansion } from "~/components/Cbs/useCbsTreeExpansion";

/**
 * One CBS dataset as a searchable, colour-by-level hierarchy with a detail
 * panel — the Project Cost Code List renders this directly, and
 * `CbsDictionarySections` stacks two of them for Admin → Master CBS.
 *
 * Colours mirror the workbook's outline fills (see ~/config/cbs-level-colors);
 * the tree itself is the shared `CbsTreePanel`.
 */

// Rows and the detail header only need the shared tree fields; the full
// column set is fetched per selected row.
type Node = CbsTreeNode;

/** For views that list only original rows: a badge reports what the row itself
 *  carries (its Sub Code / Material Code) rather than what it is. */
export const cbsFlagBadgesFor = (node: Node): readonly CbsBadge[] =>
  cbsFlagBadges(node.item);

type Counts = {
  total: number;
  original: number;
  subRows: number;
  materialRows: number;
};

function countRows(items: readonly CbsBrowserRow[]): Counts {
  const c: Counts = { total: 0, original: 0, subRows: 0, materialRows: 0 };
  for (const i of items) {
    // Context rows are ancestors pulled in for shape only — not codes this
    // view is listing, so they don't belong in "N rows".
    if (i.context) continue;
    c.total++;
    if (i.rowType === "SUB") c.subRows++;
    else if (i.rowType === "MATERIAL") c.materialRows++;
    else c.original++;
  }
  return c;
}

/**
 * Row-count pills + the per-level colour legend. The row-type breakdown is
 * only worth showing where generated rows can actually appear; a Code Book
 * view would just read "… · 0 sub · 0 material".
 */
function CountsLegend({
  counts,
  showRowTypes,
  onExpandToLevel,
  levelShown,
}: {
  counts: Counts;
  showRowTypes: boolean;
  onExpandToLevel: (level: number) => void;
  levelShown: number | null;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
        {counts.total.toLocaleString()} row{counts.total === 1 ? "" : "s"}
      </span>
      {showRowTypes && (
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600">
          {counts.original.toLocaleString()} original ·{" "}
          {counts.subRows.toLocaleString()} sub ·{" "}
          {counts.materialRows.toLocaleString()} material
        </span>
      )}
      <span className="ml-1 text-xs text-slate-500">
        Level colours (click to expand to a level):
      </span>
      <CbsLevelLegend
        onExpandToLevel={onExpandToLevel}
        levelShown={levelShown}
      />
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
  exportView,
}: {
  items: CbsBrowserRow[];
  badgesFor?: (node: Node) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  showRowTypeCounts?: boolean;
  /** Which view to export as Excel. Omit to leave the button out. */
  exportView?: CbsExportView;
}) {
  const nodes = React.useMemo(() => buildCbsTree(items), [items]);
  const {
    expanded,
    toggle,
    expandAll,
    collapseAll,
    expandToLevel,
    levelShown,
  } = useCbsTreeExpansion(nodes);
  const [selected, setSelected] = React.useState<Node | null>(null);
  const [query, setQuery] = React.useState("");
  const [sub, setSub] = React.useState(false);
  const [material, setMaterial] = React.useState(false);

  const filter: CbsRowFilter = React.useMemo(
    () => ({ query: query.trim().toLowerCase(), sub, material }),
    [query, sub, material],
  );
  const filtering = !cbsFilterIsEmpty(filter);
  const { nodes: visibleNodes, matches } = React.useMemo(
    () => pruneCbsTree(nodes, filter),
    [filter, nodes],
  );

  const counts = React.useMemo(() => countRows(items), [items]);

  // While filtering, open everything that survived — the matches are the point,
  // and leaving them behind collapsed parents hides the result.
  const flat = React.useMemo(
    () => flattenVisibleCbsNodes(visibleNodes, expanded, filtering),
    [visibleNodes, expanded, filtering],
  );

  return (
    <div className="px-4 pb-4 md:px-5">
      <CountsLegend
        counts={counts}
        showRowTypes={showRowTypeCounts}
        onExpandToLevel={expandToLevel}
        levelShown={levelShown}
      />
      <CbsTreeToolbar
        query={query}
        onQueryChange={setQuery}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        subActive={sub}
        materialActive={material}
        onToggleSub={() => setSub((v) => !v)}
        onToggleMaterial={() => setMaterial((v) => !v)}
      >
        {exportView && (
          <ExportCbsXlsxButton
            view={exportView}
            filter={filter}
            disabled={items.length === 0}
          />
        )}
        {filtering && (
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
          forceOpen={filtering}
          selectedKey={selected?.pathKey ?? null}
          onToggle={toggle}
          onSelect={setSelected}
          emptyMessage={filtering ? "No rows match this filter." : emptyMessage}
        />

        <CbsDetailPanel selected={selected} onClose={() => setSelected(null)} />
      </div>

      <p className="mt-2 text-[11px] text-slate-400">{sourceNote}</p>
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
