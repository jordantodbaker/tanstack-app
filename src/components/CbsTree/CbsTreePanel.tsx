import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import { rowTypeBadge, type CbsTreeItem, type CbsTreeNode } from "~/lib/cbs-tree";
import {
  CBS_HEADER_COLOR,
  CBS_LEGEND_LEVELS,
  cbsColorForLevel,
  type CbsLevelColor,
} from "~/config/cbs-level-colors";

/**
 * The colour-by-level CBS tree shared by the Setup page (with a checkbox per
 * row) and the Project CBS page (with a detail panel). Rows are flattened to
 * the currently-visible set and virtualized, so "Expand all" over thousands
 * of nodes stays cheap and scroll/select/toggle never re-render the whole
 * tree.
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

type RowProps<T extends CbsTreeItem> = {
  node: CbsTreeNode<T>;
  hasChildren: boolean;
  isOpen: boolean;
  isSelected: boolean;
  onToggle: (key: string) => void;
  onSelect?: (node: CbsTreeNode<T>) => void;
  color: CbsLevelColor;
  /** Optional control rendered between the chevron and the code (Setup's checkbox). */
  leading?: React.ReactNode;
};

/**
 * One flattened tree row. Memoized and fed only primitives + stable refs
 * (`isOpen`/`isSelected` booleans, a stable `color`, stable callbacks) so that
 * scrolling the virtual list — and selecting/toggling — re-renders only the
 * rows whose own state changed, not the whole tree.
 */
const CbsRowInner = React.memo(function CbsRow<T extends CbsTreeItem>({
  node,
  hasChildren,
  isOpen,
  isSelected,
  onToggle,
  onSelect,
  color,
  leading,
}: RowProps<T>) {
  const { item } = node;
  const badge = rowTypeBadge(item.rowType);
  const label = item.name || item.accountDescription || item.displayCode;

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
      className={`flex items-center gap-2 border-b border-black/5 py-1 pr-3 text-sm transition-[filter] hover:brightness-95 ${
        onSelect ? "cursor-pointer" : ""
      } ${isSelected ? "ring-2 ring-inset ring-sky-900/60" : ""}`}
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
      {leading}
      <span className="shrink-0 font-mono text-xs tabular-nums opacity-80">
        {item.displayCode}
      </span>
      <span className="truncate font-medium">{label}</span>
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
// React.memo erases the generic; restore it for callers.
const CbsRow = CbsRowInner as unknown as <T extends CbsTreeItem>(
  props: RowProps<T>,
) => React.ReactElement;

/** The per-level colour legend shown above a tree. */
export function CbsLevelLegend({ className = "" }: { className?: string }) {
  return (
    <span className={`flex flex-wrap items-center gap-1 ${className}`}>
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
  );
}

export function CbsTreePanel<T extends CbsTreeItem>({
  flat,
  expanded,
  forceOpen,
  selectedKey = null,
  onToggle,
  onSelect,
  renderLeading,
  emptyMessage,
  children,
}: {
  /** The visible rows — see `flattenVisibleCbsNodes`. */
  flat: CbsTreeNode<T>[];
  expanded: Set<string>;
  /** Treat every node as open (while searching). */
  forceOpen: boolean;
  selectedKey?: string | null;
  onToggle: (key: string) => void;
  onSelect?: (node: CbsTreeNode<T>) => void;
  renderLeading?: (node: CbsTreeNode<T>) => React.ReactNode;
  emptyMessage: string;
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
        <p className="p-6 text-center text-sm text-slate-500">{emptyMessage}</p>
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
