import React from "react";
import { editableCellClass } from "~/lib/table-utils";

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
}: {
  value: string;
  options: SearchableSelectOption[];
  placeholder?: string;
  onSelect: (value: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);

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
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      (opt.searchText ?? opt.label.toLowerCase()).includes(q),
    );
  }, [search, options]);

  function apply(next: string) {
    onSelect(next);
    setOpen(false);
    setSearch("");
  }

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${editableCellClass} flex items-center justify-between text-left cursor-pointer`}
      >
        <span className={selected ? "truncate" : "truncate text-slate-400"}>
          {selected ? selected.label : placeholder}
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
              <li className="px-2 py-1 text-sm text-slate-400">No matches</li>
            ) : (
              filtered.map((opt) => (
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
          </ul>
        </div>
      )}
    </div>
  );
}
