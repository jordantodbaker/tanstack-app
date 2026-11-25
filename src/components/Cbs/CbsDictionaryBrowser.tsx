import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Maximize2 } from "lucide-react";
import { cbsLegacyQueryOptions, type CbsBrowserRow } from "~/utils/cbs";
import {
  buildCbsTree,
  CBS_COST_TYPES,
  cbsIsBackbone,
  isCbsLegacyCode,
  pruneCbsTree,
  type CbsRowFilterState,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import { cbsFullscreenHref, cbsFullscreenSearch } from "~/lib/cbs-fullscreen";
import { CBS_VIEWS, type CbsCodeSet, type CbsView } from "~/lib/cbs-views";
import {
  CbsLevelLegend,
  CbsTreePanel,
  flattenVisibleCbsNodes,
} from "~/components/Cbs/CbsTreePanel";
import { CbsDetailPanel } from "~/components/Cbs/CbsDetailPanel";
import { CbsTreeToolbar } from "~/components/Cbs/CbsTreeToolbar";
import { ExportCbsXlsxButton } from "~/components/Cbs/ExportCbsXlsxButton";
import { useCbsTreeExpansion } from "~/components/Cbs/useCbsTreeExpansion";
import { useCbsRowFilter } from "~/components/Cbs/useCbsRowFilter";
import { LoadMask } from "~/components/LoadMask";
import { Button } from "~/components/ui/button";

/**
 * One CBS dataset as a searchable, color-by-level hierarchy with a detail
 * panel — the Project Cost Code List renders this directly, and
 * `CbsDictionarySections` stacks two of them for Admin → Master CBS.
 *
 * Every view lists cost LINES — each L / S / M / E / O / R variant on its own row —
 * so a cost-type filter reads a row's own code and nothing else (see
 * `cbsIsCostType`), and the row-type badge marks generated rows.
 * The views differ only in which rows they are handed.
 *
 * Colors mirror the workbook's outline fills (see ~/config/cbs-level-colors);
 * the tree itself is the shared `CbsTreePanel`.
 */

// Rows and the detail header only need the shared tree fields; the full
// column set is fetched per selected row.
type Node = CbsTreeNode;

/**
 * Rows per cost type — the code's last segment — so "N rows" can say what it
 * is made of. `byCode` is keyed by the cost-type code ("L", "S", …); the "-0"
 * account roll-ups are `accounts`, and any other trailing segment is counted
 * under `unknown` so the parts still add up to the total.
 */
type Counts = {
  total: number;
  accounts: number;
  byCode: Record<string, number>;
  unknown: number;
};

const COST_TYPE_CODES = new Set<string>(CBS_COST_TYPES.map((t) => t.code));

function countRows(items: readonly CbsBrowserRow[]): Counts {
  const c: Counts = { total: 0, accounts: 0, byCode: {}, unknown: 0 };
  for (const i of items) {
    // Context rows are ancestors pulled in for shape only — not codes this
    // view is listing, so they don't belong in "N rows".
    if (i.context) continue;
    c.total++;
    if (cbsIsBackbone(i)) c.accounts++;
    else if (COST_TYPE_CODES.has(i.l6)) {
      c.byCode[i.l6] = (c.byCode[i.l6] ?? 0) + 1;
    } else c.unknown++;
  }
  return c;
}

/** The breakdown pill's parts, in the workbook's column order. */
function costTypeParts(counts: Counts) {
  const parts = [
    {
      key: "account",
      label: "rollups",
      title: 'Roll-up rows — codes ending in "-0"',
      n: counts.accounts,
    },
    ...CBS_COST_TYPES.map((t) => ({
      key: t.key,
      label: t.label.toLowerCase(),
      title: `${t.label} codes — ending in "-${t.code}"`,
      n: counts.byCode[t.code] ?? 0,
    })),
  ];
  if (counts.unknown > 0) {
    parts.push({
      key: "unknown",
      label: "other suffix",
      title: "Codes whose last segment is not a known cost type",
      n: counts.unknown,
    });
  }
  return parts;
}

/** Row-count pills, with the per-level color legend on its own line below. */
function CountsLegend({
  counts,
  onExpandToLevel,
  levelShown,
}: {
  counts: Counts;
  onExpandToLevel: (level: number) => void;
  levelShown: number | null;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
          {counts.total.toLocaleString()} row{counts.total === 1 ? "" : "s"}
        </span>
        <span
          className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600"
          aria-label="Rows by cost type"
        >
          {costTypeParts(counts).map((p, i) => (
            <React.Fragment key={p.key}>
              {i > 0 && " · "}
              <span title={p.title}>
                {p.n.toLocaleString()} {p.label}
              </span>
            </React.Fragment>
          ))}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-500">
          Level colors (click to expand to a level):
        </span>
        <CbsLevelLegend
          onExpandToLevel={onExpandToLevel}
          levelShown={levelShown}
        />
      </div>
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
  view,
  items: sourceItems,
  focusCode = null,
  initialCodeSet = "current",
  fill = false,
  initialFilter,
  initialHideContext = false,
}: {
  /** Which tree this is — its rows, filters and wording are in `CBS_VIEWS`. */
  view: CbsView;
  /** The rows the view's query returned; the view decides which it lists. */
  items: CbsBrowserRow[];
  /**
   * The full-screen tab itself: the list runs to the bottom of the window,
   * and there is no "Full screen" button since this already is.
   */
  fill?: boolean;
  /** Start with these filters in force — see `useCbsRowFilter`. */
  initialFilter?: CbsRowFilterState;
  /** Start with "Hide … parents" ticked. */
  initialHideContext?: boolean;
  /**
   * Which codes to start on. A `?code=` link to a legacy code starts on Both
   * instead of Current, or there would be no row to land on.
   */
  initialCodeSet?: CbsCodeSet;
  /**
   * A display code to open on arrival — the `?code=` deep link. Its ancestors
   * are expanded, the row is selected so the detail panel fills, and the list
   * scrolls to it.
   */
  focusCode?: string | null;
}) {
  const def = CBS_VIEWS[view];
  const { statusFilter, rowTypeFilter, legacyFilter } = def;
  const catalogItems = React.useMemo(
    () => def.rows(sourceItems),
    [def, sourceItems],
  );
  const [chosenSet, setChosenSet] = React.useState<CbsCodeSet>(() =>
    initialCodeSet === "current" &&
    focusCode !== null &&
    isCbsLegacyCode(focusCode)
      ? "both"
      : initialCodeSet,
  );
  const codeSet = legacyFilter ? chosenSet : "current";
  const showLegacy = codeSet !== "current";
  const legacy = useQuery({ ...cbsLegacyQueryOptions(), enabled: showLegacy });
  const items = React.useMemo(() => {
    if (codeSet === "current") return catalogItems;
    const legacyItems = legacy.data ?? [];
    return codeSet === "legacy"
      ? legacyItems
      : [...catalogItems, ...legacyItems];
  }, [catalogItems, codeSet, legacy.data]);

  // Context rows are ancestors the project was never granted, carried in so
  // the codes under them nest correctly. Hiding them is a view choice, so it
  // happens before the tree is built: `buildCbsTree` already collapses a row
  // whose intermediate code is absent up to the nearest ancestor that exists,
  // which is exactly the shape wanted once the ungranted parents are gone.
  const [hideContext, setHideContext] = React.useState(initialHideContext);
  const hasContext = React.useMemo(() => items.some((i) => i.context), [items]);
  const shown = React.useMemo(
    () => (hideContext && hasContext ? items.filter((i) => !i.context) : items),
    [items, hideContext, hasContext],
  );
  const nodes = React.useMemo(() => buildCbsTree(shown), [shown]);
  // Every tree offers the same filters, Status and Row Type apart: those two
  // belong to the Dictionary, the one view that lists inactive and generated
  // rows as a matter of course.
  // The search filters a deferred copy of the text, as Setup does: the
  // catalog views re-prune ~14,000 rows per keystroke otherwise.
  const { filter, state, filtering, searchPending, controls } = useCbsRowFilter(
    {
      items,
      statusFilter,
      rowTypeFilter,
      deferQuery: true,
      initial: initialFilter,
    },
  );
  const { nodes: visibleNodes, matches } = React.useMemo(
    () => pruneCbsTree(nodes, filter),
    [filter, nodes],
  );
  const {
    expanded,
    forceOpen,
    shownNodes,
    toggle,
    expandAll,
    collapseAll,
    expandToLevel,
    reveal,
    levelShown,
  } = useCbsTreeExpansion(nodes, { nodes: visibleNodes, filtering, filter });
  const [selected, setSelected] = React.useState<Node | null>(null);

  // Deep link: open the path down to the code, then select it.
  //
  // The path is read off the built tree, not computed from the code. The
  // tree does not always hang a row where its code says: a typed line sits
  // under its own account's "-0" roll-up, the pipe shop's size variants sit
  // under their bore account through a shared lineage key, and a row whose
  // roll-up is absent collapses up to whatever exists. `cbsAncestorCodes`
  // names none of the first and misses the second, so opening what it listed
  // left the linked row behind a closed parent — for every typed line, which
  // is most of the catalog. Runs on the code rather than on `nodes`, so
  // re-rendering does not keep re-selecting a row the user has since clicked
  // away from.
  React.useEffect(() => {
    if (!focusCode) return;
    const path: Node[] = [];
    const find = (list: Node[]): Node | null => {
      for (const n of list) {
        if (n.item.displayCode === focusCode) return n;
        path.push(n);
        const hit = find(n.children);
        if (hit) return hit;
        path.pop();
      }
      return null;
    };
    const hit = find(nodes);
    if (hit) reveal(path.map((n) => n.pathKey));
    setSelected(hit);
  }, [focusCode, nodes, reveal]);

  const counts = React.useMemo(() => countRows(items), [items]);

  const flat = React.useMemo(
    () => flattenVisibleCbsNodes(shownNodes, expanded, forceOpen),
    [shownNodes, expanded, forceOpen],
  );

  return (
    <div className="px-4 pb-4 md:px-5">
      <CountsLegend
        counts={counts}
        onExpandToLevel={expandToLevel}
        levelShown={levelShown}
      />
      <CbsTreeToolbar
        {...controls}
        onExpandAll={expandAll}
        onCollapseAll={collapseAll}
        codeSet={codeSet}
        onCodeSetChange={
          legacyFilter
            ? (next) => {
                setChosenSet(next);
                // Close the detail of a row that is leaving the tree.
                if (
                  selected &&
                  next === (selected.item.legacy ? "current" : "legacy")
                ) {
                  setSelected(null);
                }
              }
            : undefined
        }
      >
        {/* Offered only where there are any — the catalog views have none. */}
        {hasContext && (
          <label
            className="flex items-center gap-1.5 text-xs text-slate-600"
            title={def.context.title}
          >
            <input
              type="checkbox"
              checked={hideContext}
              onChange={(e) => setHideContext(e.target.checked)}
            />
            {def.context.label}
          </label>
        )}
        {showLegacy && legacy.isPending && (
          <span className="text-xs text-slate-500">Loading legacy codes…</span>
        )}
        {showLegacy && legacy.isError && (
          <span className="text-xs text-red-600">
            Failed to load the legacy codes.
          </span>
        )}
        <ExportCbsXlsxButton
          view={view}
          filter={filter}
          hideContext={hideContext && hasContext}
          codeSet={codeSet}
          disabled={items.length === 0}
        />
        {/* A plain link, not a navigation: the new tab must start from the
            URL, and a link is what the browser's "open in new tab" and
            middle-click already understand. Left off the full-screen tab
            itself. */}
        {!fill && (
          <Button
            asChild
            variant="outline"
            size="sm"
            title="Open this tree in a new tab with these filters and no navigation around it"
          >
            <a
              href={cbsFullscreenHref(
                cbsFullscreenSearch(view, state, {
                  hideContext: hideContext && hasContext,
                  codeSet,
                  code: selected?.item.displayCode ?? null,
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Maximize2 className="size-3.5" />
              Full screen
            </a>
          </Button>
        )}
        {filtering && (
          <span className="text-xs text-slate-500">
            {matches.toLocaleString()} match{matches === 1 ? "" : "es"}
          </span>
        )}
      </CbsTreeToolbar>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_22rem]">
        <CbsTreePanel
          flat={flat}
          expanded={expanded}
          forceOpen={forceOpen}
          scrollToKey={focusCode}
          fill={fill}
          selectedKey={selected?.pathKey ?? null}
          onToggle={toggle}
          onSelect={setSelected}
          emptyMessage={
            showLegacy && legacy.isPending
              ? "Loading legacy codes…"
              : showLegacy && legacy.isError
                ? "Failed to load the legacy codes."
                : filtering
                  ? `No ${codeSet === "legacy" ? "legacy codes" : "rows"} match this filter.`
                  : def.emptyMessage
          }
          emptyAction={
            filtering && (
              <Button
                variant="outline"
                size="sm"
                onClick={controls.onClearFilters}
              >
                Clear filters
              </Button>
            )
          }
        >
          {searchPending && <LoadMask label="Filtering…" size="sm" rounded />}
        </CbsTreePanel>

        <CbsDetailPanel
          selected={selected}
          linkPath={def.linkPath}
          onClose={() => setSelected(null)}
        />
      </div>

      <p className="mt-2 text-[11px] text-slate-400">{def.sourceNote}</p>
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
