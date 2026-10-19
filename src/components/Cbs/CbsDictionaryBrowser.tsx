import * as React from "react";
import { Loader2 } from "lucide-react";
import type { CbsBrowserRow } from "~/utils/cbs";
import {
  buildCbsTree,
  cbsAncestorCodes,
  CBS_STATUSES,
  cbsFilterIsEmpty,
  cbsFlagBadges,
  cbsHasStatus,
  cbsNoCostTypes,
  cbsNoStatuses,
  pruneCbsTree,
  type CbsBadge,
  type CbsCostTypeKey,
  type CbsRowFilter,
  type CbsStatusKey,
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
  focusCode = null,
}: {
  items: CbsBrowserRow[];
  badgesFor?: (node: Node) => readonly CbsBadge[];
  sourceNote: string;
  emptyMessage: string;
  showRowTypeCounts?: boolean;
  /** Which view to export as Excel. Omit to leave the button out. */
  exportView?: CbsExportView;
  /**
   * A display code to open on arrival — the `?code=` deep link. Its ancestors
   * are expanded, the row is selected so the detail panel fills, and the list
   * scrolls to it.
   */
  focusCode?: string | null;
}) {
  // Context rows are ancestors the project was never granted, carried in so
  // the codes under them nest correctly. Hiding them is a view choice, so it
  // happens before the tree is built: `buildCbsTree` already collapses a row
  // whose intermediate code is absent up to the nearest ancestor that exists,
  // which is exactly the shape wanted once the ungranted parents are gone.
  const [hideContext, setHideContext] = React.useState(false);
  const hasContext = React.useMemo(() => items.some((i) => i.context), [items]);
  const shown = React.useMemo(
    () => (hideContext && hasContext ? items.filter((i) => !i.context) : items),
    [items, hideContext, hasContext],
  );
  const nodes = React.useMemo(() => buildCbsTree(shown), [shown]);
  const {
    expanded,
    toggle,
    expandAll,
    collapseAll,
    expandToLevel,
    reveal,
    levelShown,
  } = useCbsTreeExpansion(nodes);
  const [selected, setSelected] = React.useState<Node | null>(null);

  // Deep link: open the path down to the code, then select it. Runs on the
  // code rather than on `nodes`, so re-rendering does not keep re-selecting a
  // row the user has since clicked away from.
  React.useEffect(() => {
    if (!focusCode) return;
    reveal(cbsAncestorCodes(focusCode));
    const find = (list: Node[]): Node | null => {
      for (const n of list) {
        if (n.item.displayCode === focusCode) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    setSelected(find(nodes));
  }, [focusCode, nodes, reveal]);
  const [query, setQuery] = React.useState("");
  const [costTypes, setCostTypes] = React.useState(cbsNoCostTypes);
  const toggleCostType = React.useCallback(
    (key: CbsCostTypeKey) =>
      setCostTypes((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );
  const [statuses, setStatuses] = React.useState(cbsNoStatuses);
  const toggleStatus = React.useCallback(
    (key: CbsStatusKey) =>
      setStatuses((prev) => ({ ...prev, [key]: !prev[key] })),
    [],
  );

  // Which statuses this dataset actually contains. The Cost Accounts list and
  // the Project Cost Code List are filtered to active rows before they reach
  // this component, so every status button there would either do nothing
  // (Active) or empty the tree (Inactive, Retired).
  const statusAvailability = React.useMemo(
    () =>
      Object.fromEntries(
        CBS_STATUSES.map((s) => [
          s.key,
          items.some((item) => cbsHasStatus(item, s.key)),
        ]),
      ) as Record<CbsStatusKey, boolean>,
    [items],
  );
  // The row appears only where it can tell rows apart — two or more statuses
  // present. On a list that is all one status the filter is not a disabled
  // control, it is a question with one answer, so it is not asked. Where it
  // does appear, a status the data lacks stays visible but disabled, so the
  // set of buttons does not shift about between views.
  const canFilterByStatus =
    CBS_STATUSES.filter((s) => statusAvailability[s.key]).length > 1;

  const filter: CbsRowFilter = React.useMemo(
    () => ({ query: query.trim().toLowerCase(), ...costTypes, ...statuses }),
    [query, costTypes, statuses],
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
        costTypes={costTypes}
        onToggleCostType={toggleCostType}
        statuses={statuses}
        onToggleStatus={canFilterByStatus ? toggleStatus : undefined}
        statusAvailability={statusAvailability}
      >
        {/* Offered only where there are any — the catalog views have none. */}
        {hasContext && (
          <label
            className="flex items-center gap-1.5 text-xs text-slate-600"
            title="Hide the greyed-out parent summaries this project was not granted. The codes under them move up to the nearest parent it does have."
          >
            <input
              type="checkbox"
              checked={hideContext}
              onChange={(e) => setHideContext(e.target.checked)}
            />
            Hide ungranted parents
          </label>
        )}
        {exportView && (
          <ExportCbsXlsxButton
            view={exportView}
            filter={filter}
            hideContext={hideContext && hasContext}
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
          scrollToKey={focusCode}
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
