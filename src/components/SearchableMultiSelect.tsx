import React from "react";
import { Check, X } from "lucide-react";
import { editableCellClass } from "~/lib/table-utils";
import type { SearchableSelectOption } from "~/components/SearchableSelect";

/** Cap on rendered options so a large list (e.g. all CBS items) stays snappy. */
const RENDER_CAP = 100;

/**
 * Searchable dropdown allowing multiple selections. Selected values render as
 * removable chips below the control. The dropdown stays open as you toggle
 * items; it closes on outside click or Escape.
 */
export function SearchableMultiSelect({
  values,
  options,
  placeholder = "-- Select --",
  onChange,
}: {
  values: string[];
  options: SearchableSelectOption[];
  placeholder?: string;
  onChange: (values: string[]) => void;
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

  const selectedSet = React.useMemo(() => new Set(values), [values]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return options;
    return options.filter((opt) =>
      (opt.searchText ?? opt.label.toLowerCase()).includes(q),
    );
  }, [search, options]);

  const visible = filtered.slice(0, RENDER_CAP);
  const hiddenCount = filtered.length - visible.length;

  function toggle(value: string) {
    onChange(
      selectedSet.has(value)
        ? values.filter((v) => v !== value)
        : [...values, value],
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${editableCellClass} flex items-center justify-between text-left cursor-pointer`}
      >
        <span
          className={values.length ? "truncate" : "truncate text-slate-400"}
        >
          {values.length
            ? `${values.length} selected`
            : placeholder}
        </span>
        <span className="ml-2 shrink-0 text-slate-400">▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 max-w-[90vw] rounded border border-slate-300 bg-white shadow-lg">
          <input
            type="text"
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="w-full border-b border-slate-200 px-2 py-1.5 text-sm focus:outline-none"
          />
          <ul className="max-h-64 overflow-auto py-1">
            {visible.length === 0 ? (
              <li className="px-2 py-1 text-sm text-slate-400">No matches</li>
            ) : (
              visible.map((opt) => {
                const checked = selectedSet.has(opt.value);
                return (
                  <li key={opt.value}>
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggle(opt.value)}
                      className={`flex w-full items-center gap-2 cursor-pointer px-2 py-1 text-left text-sm hover:bg-slate-100 ${
                        checked ? "bg-slate-50" : ""
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-slate-300">
                        {checked && (
                          <Check size={12} className="text-slate-700" />
                        )}
                      </span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  </li>
                );
              })
            )}
            {hiddenCount > 0 && (
              <li className="px-2 py-1 text-xs text-slate-400">
                +{hiddenCount} more — refine your search
              </li>
            )}
          </ul>
        </div>
      )}

      {values.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1">
          {values.map((value) => (
            <span
              key={value}
              className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-xs text-slate-700"
            >
              {value}
              <button
                type="button"
                onClick={() => toggle(value)}
                aria-label={`Remove ${value}`}
                className="text-slate-400 hover:text-red-600"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
