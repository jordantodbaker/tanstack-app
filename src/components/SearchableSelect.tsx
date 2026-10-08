import React from "react";
import { editableCellClass } from "~/lib/table-utils";

/** Cap the number of option rows rendered at once. Some lists (e.g. the ~1,100
 *  structural-steel members) are far too large to mount in full — the user
 *  narrows them by typing. Matches past the cap still filter; they're just not
 *  all rendered until the query trims the set below the cap. */
const MAX_VISIBLE = 100;

/** Panel sizing. The panel is at least this wide so long "code: name" labels
 *  stay readable even in a narrow cell, and never taller than this so a big
 *  catalog scrolls inside it rather than filling the screen. */
const MIN_PANEL_WIDTH = 288;
const MAX_PANEL_HEIGHT = 320;
/** Below this there is no usable list, so the panel flips above the trigger. */
const MIN_PANEL_HEIGHT = 140;

export type SearchableSelectOption = {
  value: string;
  /** Shown in the open list, and in the closed control when there is no
   *  `shortLabel`. */
  label: string;
  /** What the CLOSED control shows once this option is chosen. Lets a grid
   *  cell rest on just the item name while the list still offers the fuller
   *  "code: name" — the code already has its own column. Mirrors
   *  `CellSelect`'s option of the same name. */
  shortLabel?: string;
  /** Lowercased text used to match the search query; defaults to `label`. */
  searchText?: string;
};

/** Where the fixed dropdown panel should paint, in viewport coordinates. */
type PanelAnchor = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

/** Panel geometry for a trigger rect: as wide as the cell (within sensible
 *  bounds), below it when there is room, flipped above it when there is not. */
function measure(rect: DOMRect, panel: HTMLElement | null): PanelAnchor {
  const GAP = 4;
  const MARGIN = 8;
  const width = Math.min(
    Math.max(rect.width, MIN_PANEL_WIDTH),
    Math.max(MIN_PANEL_WIDTH, window.innerWidth - 2 * MARGIN),
  );
  const below = window.innerHeight - rect.bottom - GAP - MARGIN;
  const above = rect.top - GAP - MARGIN;
  // Measure what the panel wants so a short list isn't given a tall box, and
  // so the flip only happens when the content genuinely doesn't fit below.
  const wanted = Math.min(panel?.scrollHeight ?? MAX_PANEL_HEIGHT, MAX_PANEL_HEIGHT);
  const flip = below < Math.min(wanted, MIN_PANEL_HEIGHT) && above > below;
  const maxHeight = Math.max(MIN_PANEL_HEIGHT, flip ? above : below);
  const height = Math.min(wanted, maxHeight);
  return {
    top: flip ? rect.top - GAP - height : rect.bottom + GAP,
    left: Math.max(
      MARGIN,
      Math.min(rect.left, window.innerWidth - width - MARGIN),
    ),
    width,
    maxHeight,
  };
}

export function SearchableSelect({
  value,
  options,
  placeholder = "-- Select --",
  onSelect,
  onSearchChange,
  loading = false,
}: {
  value: string;
  options: SearchableSelectOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
  /** When provided, the parent owns search: the term is reported here (the
   *  parent fetches matching `options`) and client-side filtering is skipped. */
  onSearchChange?: (query: string) => void;
  /** Show a "Searching…" hint while the parent's fetch is in flight. */
  loading?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = React.useState<PanelAnchor | null>(null);

  // Async mode: notify the parent of the search term (it fetches options).
  React.useEffect(() => {
    onSearchChange?.(search);
  }, [search, onSearchChange]);

  // The panel is `fixed`, so its coordinates come from the trigger's viewport
  // rect and have to be recomputed whenever anything moves: the page, the
  // table's own scroller, or a resize. Capture-phase so a scroll inside the
  // grid is seen too, not just one on the document.
  React.useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const el = containerRef.current;
      if (!el) return;
      setAnchor(measure(el.getBoundingClientRect(), panelRef.current));
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, options.length, loading]);

  React.useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      // The panel is still a DOM child of the trigger (only its painting is
      // detached by `fixed`), so the container check already covers it — the
      // explicit panel check keeps that true if it is ever portalled out.
      const target = e.target as Node;
      const inTrigger = containerRef.current?.contains(target);
      const inPanel = panelRef.current?.contains(target);
      if (!inTrigger && !inPanel) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const filtered = React.useMemo(() => {
    // Async mode: `options` are already server-filtered for `search`.
    if (onSearchChange) return options;
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      (opt.searchText ?? opt.label.toLowerCase()).includes(q),
    );
  }, [search, options, onSearchChange]);

  function apply(next: string) {
    onSelect(next);
    setOpen(false);
    setAnchor(null);
    setSearch("");
  }

  const visible = filtered.length > MAX_VISIBLE
    ? filtered.slice(0, MAX_VISIBLE)
    : filtered;
  const hiddenCount = filtered.length - visible.length;

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${editableCellClass} flex items-center justify-between text-left cursor-pointer`}
      >
        <span className={value ? "truncate" : "truncate text-slate-400"}>
          {/* Fall back to the raw value when the selected option isn't in the
              current (possibly server-paged) options, so a saved code still
              shows instead of reverting to the placeholder. */}
          {selected
            ? (selected.shortLabel ?? selected.label)
            : value
              ? value
              : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-slate-400">▾</span>
      </button>
      {open && (
        <div
          ref={panelRef}
          // `fixed`, not `absolute`: the take-off grid scrolls inside an
          // `overflow-auto` box, which clipped the panel to the table, and its
          // sticky header/frozen columns (z-20/z-30) painted over what was
          // left. z-50 matches the grid's own context menu.
          style={{
            top: anchor?.top ?? -9999,
            left: anchor?.left ?? -9999,
            width: anchor?.width,
            maxHeight: anchor?.maxHeight,
            visibility: anchor ? "visible" : "hidden",
          }}
          className="fixed z-50 flex flex-col overflow-hidden rounded border border-slate-300 bg-white shadow-lg"
        >
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <ul className="min-h-0 flex-1 overflow-auto py-1">
            <li>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => apply("")}
                className="block w-full cursor-pointer px-2 py-1 text-left text-sm text-slate-400 hover:bg-slate-100"
              >
                {placeholder}
              </button>
            </li>
            {filtered.length === 0 ? (
              <li className="px-2 py-1 text-sm text-slate-400">
                {loading ? "Searching…" : "No matches"}
              </li>
            ) : (
              visible.map((opt) => (
                <li key={opt.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(opt.value)}
                    className={`block w-full cursor-pointer px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                      opt.value === value ? "bg-slate-50 font-medium" : ""
                    }`}
                  >
                    {opt.label}
                  </button>
                </li>
              ))
            )}
            {hiddenCount > 0 && (
              <li className="px-2 py-1 text-xs text-slate-400">
                +{hiddenCount} more — type to narrow…
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
