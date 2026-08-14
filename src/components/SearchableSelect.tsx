import React from "react";
import { editableCellClass } from "~/lib/table-utils";

/** Cap the number of option rows rendered at once. Some lists (e.g. the ~1,100
 *  structural-steel members) are far too large to mount in full — the user
 *  narrows them by typing. Matches past the cap still filter; they're just not
 *  all rendered until the query trims the set below the cap. */
const MAX_VISIBLE = 100;

export type SearchableSelectOption = {
  value: string;
  label: string;
  /** Lowercased text used to match the search query; defaults to `label`. */
  searchText?: string;
};

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

  // Async mode: notify the parent of the search term (it fetches options).
  React.useEffect(() => {
    onSearchChange?.(search);
  }, [search, onSearchChange]);

  React.useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
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
          {selected ? selected.label : value ? value : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-slate-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[90vw] rounded border border-slate-300 bg-white shadow-lg">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <ul className="max-h-64 overflow-auto py-1">
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
