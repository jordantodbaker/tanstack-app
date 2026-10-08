import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight } from "lucide-react";
import {
  cbsRowTypeBadges,
  type CbsBadge,
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
 * The colour-by-level CBS tree shared by the Setup page (with a checkbox per
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

const defaultBadgesFor = (node: CbsTreeNode): readonly CbsBadge[] =>
  cbsRowTypeBadges(node.item);

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
  badges,
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
  /** Markers shown after the name, resolved by the panel so this memoized row
   *  receives a plain array rather than a fresh callback each render. */
  badges: readonly CbsBadge[];
}) {
  const { item } = node;
  const label = item.name || item.accountDescription || item.displayCode;
  // A context row is not part of this project's scope — it is here so its
  // granted descendants have something to hang from. Mute it and drop its
  // badges so it cannot be mistaken for an available code.
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
      {(isContext ? [] : badges).map((b) => (
        <span
          key={b.label}
          title={b.title}
          className="shrink-0 rounded border border-current/30 px-1 text-[10px] leading-4 font-semibold opacity-70"
        >
          {b.label}
        </span>
      ))}
      {item.uom && (
        <span className="ml-auto shrink-0 font-mono text-[11px] opacity-70">
          {item.uom}
        </span>
      )}
    </div>
  );
});

/**
 * The per-level colour legend shown above a tree. Given `onExpandToLevel` the
 * swatches become buttons that open the tree down to that level — so the key
 * to the colours is also how you get to them. `levelShown` marks the one in
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
          // white and navy included, so it thickens rather than recolours.
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
            className="cursor-pointer rounded px-1.5 py-0.5 text-[10px] font-semibold transition-[filter] hover:brightness-90 focus-visible:ring-2 focus-visible:ring-sky-600 focus-visible:outline-none"
            style={style}
          >
            {label}
          </button>
        );
      })}
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
  badgesFor = defaultBadgesFor,
  emptyMessage,
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
  /** Which markers a row shows. Defaults to the row-type badge (what a
   *  generated row IS); the CBS Code Book passes `cbsFlagBadges` instead,
   *  because that section lists no generated rows. */
  badgesFor?: (node: CbsTreeNode) => readonly CbsBadge[];
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
                    badges={badgesFor(node)}
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
