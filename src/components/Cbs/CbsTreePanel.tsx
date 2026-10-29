import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import {
  CBS_COST_TYPES,
  cbsIsBackbone,
  type CbsTreeItem,
  type CbsTreeNode,
} from "~/lib/cbs-tree";
import {
  CBS_HEADER_COLOR,
  CBS_LEGEND_LEVELS,
  cbsColorForLevel,
  type CbsLevelColor,
} from "~/config/cbs-level-colors";

/**
 * The color-by-level CBS tree shared by the Setup page (with a checkbox per
 * row) and the CBS dictionary pages (with a detail panel). Rows are flattened to
 * the currently-visible set and virtualized, so "Expand all" over thousands
 * of nodes stays cheap and scroll/select/toggle never re-render the whole
 * tree. Rows only read `CbsTreeItem` fields, so any `CbsTreeNode<T>` tree is
 * accepted as plain `CbsTreeNode`s.
 */

/** Depth-first flatten of the nodes that are currently visible: a node's
 *  children are included only when it's expanded (or a search forces it open). */
export function flattenVisibleCbsNodes<T extends CbsTreeItem>(
  nodes: CbsTreeNode<T>[],
  expanded: Set<string>,
  forceExpand: boolean,
): CbsTreeNode<T>[] {
  const out: CbsTreeNode<T>[] = [];
  const walk = (list: CbsTreeNode<T>[]) => {
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
  leading,
}: {
  node: CbsTreeNode;
  hasChildren: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
  onSelect?: (node: CbsTreeNode) => void;
  color: CbsLevelColor;
  /** Optional control rendered between the chevron and the code (Setup's checkbox). */
  leading?: React.ReactNode;
}) {
  const { item } = node;
  const label = item.name || item.accountDescription || item.displayCode;
  // A context row is not part of this project's scope — it is here so its
  // granted descendants have something to hang from. Mute it so it cannot be
  // mistaken for an available code.
  const isContext = item.context === true;

  return (
    <div
      role="treeitem"
      aria-level={node.depth + 1}
      aria-expanded={hasChildren ? isOpen : undefined}
      aria-selected={onSelect ? isSelected : undefined}
      onClick={onSelect ? () => onSelect(node) : undefined}
      style={{
        backgroundColor: color.fill,
        color: color.text,
        paddingLeft: 8 + node.depth * 18,
      }}
      title={
        isContext
          ? "Not selected for this project — shown so its selected codes nest correctly."
          : undefined
      }
      className={`flex items-center gap-2 border-b border-black/5 py-1 pr-3 text-sm transition-[filter] hover:brightness-95 ${
        onSelect ? "cursor-pointer" : ""
      } ${isContext ? "opacity-55 italic" : ""} ${
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
          // 24px to tap, 16px of layout — the negative margin keeps rows
          // aligned with the leaf rows' 16px placeholder.
          className="-m-1 grid size-6 shrink-0 place-items-center rounded hover:bg-black/10"
        >
          <ChevronRight
            size={13}
            className={`transition-transform ${isOpen ? "rotate-90" : ""}`}
          />
        </button>
      ) : (
        <span className="size-4 shrink-0 text-center opacity-40">·</span>
      )}
      {leading}
      <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">
        {item.displayCode}
      </span>
      <CostTypeChip item={item} />
      <span className="truncate font-medium">{label}</span>
      {item.uom && (
        <span className="ml-auto shrink-0 font-mono text-[11px] opacity-70">
          {item.uom}
        </span>
      )}
    </div>
  );
});

/**
 * The per-level color legend shown above a tree. Given `onExpandToLevel` the
 * swatches become buttons that open the tree down to that level — so the key
 * to the colors is also how you get to them. `levelShown` marks the one in
 * force, and is null once the expansion no longer stands at a single level.
 */
export function CbsLevelLegend({
  className = "",
  onExpandToLevel,
  levelShown = null,
}: {
  className?: string;
  onExpandToLevel?: (level: number) => void;
  levelShown?: number | null;
}) {
  return (
    <span
      className={`flex flex-wrap items-center gap-1 ${className}`}
      role={onExpandToLevel ? "group" : undefined}
      aria-label={onExpandToLevel ? "Expand to level" : undefined}
    >
      {CBS_LEGEND_LEVELS.map((lvl) => {
        const c = cbsColorForLevel(lvl);
        const active = levelShown === lvl;
        const style = {
          backgroundColor: c.fill,
          color: c.text,
          // The active outline has to read against every fill in the scheme,
          // white and navy included, so it thickens rather than recolors.
          outline: active
            ? "2px solid rgba(15,23,42,0.85)"
            : "1px solid rgba(0,0,0,0.1)",
        };
        const label = `L${lvl}`;

        if (!onExpandToLevel) {
          return (
            <span
              key={lvl}
              title={`Level ${lvl}`}
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
              style={style}
            >
              {label}
            </span>
          );
        }
        return (
          <button
            key={lvl}
            type="button"
            onClick={() => onExpandToLevel(lvl)}
            aria-pressed={active}
            title={
              lvl === 0
                ? "Level 0 — collapse to the discipline roots"
                : `Level ${lvl} — expand the tree to this level`
            }
            className="inline-flex min-h-6 min-w-6 cursor-pointer items-center justify-center rounded px-1.5 text-[10px] font-semibold transition-[filter] hover:brightness-90 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
            style={style}
          >
            {label}
          </button>
        );
      })}
    </span>
  );
}

/** Light chips that read on every level fill, one hue per cost type. */
const COST_TYPE_CHIP: Record<string, string> = {
  L: "border-sky-300 bg-sky-100 text-sky-900",
  S: "border-violet-300 bg-violet-100 text-violet-900",
  M: "border-amber-300 bg-amber-100 text-amber-900",
  E: "border-emerald-300 bg-emerald-100 text-emerald-900",
  O: "border-slate-300 bg-slate-100 text-slate-800",
  R: "border-teal-300 bg-teal-100 text-teal-900",
};

/**
 * The cost-type letter beside a typed line's code — the same letter the code
 * ends in, read off the code rather than stored, so it is never stale. The
 * "-0" roll-up row carries none: it is the account itself.
 */
function CostTypeChip({ item }: { item: CbsTreeItem }) {
  if (cbsIsBackbone(item)) return null;
  const code = item.l6;
  const type = CBS_COST_TYPES.find((t) => t.code === code);
  return (
    <span
      title={
        type ? `${type.label.replace(/s$/, "")} line` : `Cost type ${code}`
      }
      className={`shrink-0 rounded border px-1 text-[10px] leading-4 font-semibold ${COST_TYPE_CHIP[code] ?? "border-slate-300 bg-slate-100 text-slate-800"}`}
    >
      {code}
    </span>
  );
}

export function CbsTreePanel({
  flat,
  expanded,
  forceOpen,
  selectedKey = null,
  onToggle,
  onSelect,
  renderLeading,
  emptyMessage,
  emptyAction,
  scrollToKey = null,
  children,
}: {
  /** The visible rows — see `flattenVisibleCbsNodes`. */
  flat: CbsTreeNode[];
  expanded: Set<string>;
  /** Treat every node as open (while searching). */
  forceOpen: boolean;
  selectedKey?: string | null;
  onToggle: (key: string) => void;
  onSelect?: (node: CbsTreeNode) => void;
  renderLeading?: (node: CbsTreeNode) => React.ReactNode;
  emptyMessage: string;
  /** Shown under the empty message — a Clear filters button, typically. */
  emptyAction?: React.ReactNode;
  /**
   * Scroll this row into view once it is present. Set by a `?code=` deep
   * link: the row is virtualised, so it does not exist in the DOM to scroll
   * to until the list knows where it sits.
   */
  scrollToKey?: string | null;
  /** Overlay content (e.g. a load mask) rendered inside the bordered panel. */
  children?: React.ReactNode;
}) {
  const scrollRef = React.useRef<HTMLDivElement | null>(null);
  const rowVirtualizer = useVirtualizer({
    count: flat.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 29,
    overscan: 12,
  });

  // Scroll once per target. `flat` changes on every expand and every
  // keystroke, so re-running on its identity would yank the list back under
  // anyone who scrolled away from a deep-linked row.
  const scrolled = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!scrollToKey || scrolled.current === scrollToKey) return;
    const index = flat.findIndex((n) => n.pathKey === scrollToKey);
    if (index === -1) return; // not revealed yet; a later render will find it
    scrolled.current = scrollToKey;
    rowVirtualizer.scrollToIndex(index, { align: "center" });
  }, [scrollToKey, flat, rowVirtualizer]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
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
      {children}
      {flat.length === 0 ? (
        <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-slate-500">
          <p>{emptyMessage}</p>
          {emptyAction}
        </div>
      ) : (
        <div
          ref={scrollRef}
          role="tree"
          aria-label="CBS hierarchy"
          className="max-h-[70vh] overflow-auto"
        >
          <div
            style={{
              height: rowVirtualizer.getTotalSize(),
              position: "relative",
            }}
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
                    isOpen={forceOpen || expanded.has(node.pathKey)}
                    isSelected={selectedKey === node.pathKey}
                    onToggle={onToggle}
                    onSelect={onSelect}
                    color={cbsColorForLevel(node.level)}
                    leading={renderLeading?.(node)}
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
