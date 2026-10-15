import * as React from "react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";
import {
  CBS_COST_TYPES,
  CBS_STATUSES,
  type CbsCostTypeKey,
  type CbsStatusKey,
} from "~/lib/cbs-tree";

/**
 * Two rows for a CBS tree: the cost-type filters, then the search box with
 * Expand all / Collapse all and a trailing slot for page-specific controls
 * (the Excel export, a match count, a selected count, saving…). Shared by the
 * Setup editor and the CBS dictionary viewers.
 *
 * The filters get a row of their own, under the level-colour legend, because
 * sharing one line with the search box put five toggles that change WHICH
 * rows exist beside the controls that only change how they are shown.
 */
export function CbsTreeToolbar({
  query,
  onQueryChange,
  placeholder = "Search code or name…",
  onExpandAll,
  onCollapseAll,
  costTypes,
  onToggleCostType,
  statuses,
  onToggleStatus,
  statusAvailability,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Which cost-type filters are on. Omit the handler to leave them out. */
  costTypes?: Record<CbsCostTypeKey, boolean>;
  onToggleCostType?: (key: CbsCostTypeKey) => void;
  /** Which status filters are on. Omit the handler to leave the row out. */
  statuses?: Record<CbsStatusKey, boolean>;
  onToggleStatus?: (key: CbsStatusKey) => void;
  /**
   * Statuses present in this dataset. A status nothing carries is shown
   * disabled rather than hidden, so the row reads the same everywhere and a
   * press that could only ever return nothing is not offered.
   */
  statusAvailability?: Record<CbsStatusKey, boolean>;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-col gap-2">
      {onToggleCostType && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by cost type"
        >
          <span className="text-xs text-slate-500">Cost types:</span>
          {CBS_COST_TYPES.map((t) => {
            const on = costTypes?.[t.key] ?? false;
            return (
              <Button
                key={t.key}
                variant={on ? "default" : "outline"}
                size="sm"
                onClick={() => onToggleCostType(t.key)}
                aria-pressed={on}
                title={`Show only ${t.label.toLowerCase()} codes — cost type ${t.code}, or ${t.column} YES`}
              >
                {t.label}
              </Button>
            );
          })}
        </div>
      )}
      {onToggleStatus && (
        <div
          className="flex flex-wrap items-center gap-2"
          role="group"
          aria-label="Filter by status"
        >
          <span className="text-xs text-slate-500">Status:</span>
          {CBS_STATUSES.map((s) => {
            const on = statuses?.[s.key] ?? false;
            const available = statusAvailability?.[s.key] ?? true;
            return (
              <Button
                key={s.key}
                variant={on ? "default" : "outline"}
                size="sm"
                disabled={!available}
                onClick={() => onToggleStatus(s.key)}
                aria-pressed={on}
                title={
                  available
                    ? `Show only codes with Status ${s.label}${s.key === "active" ? " (a blank Status counts as Active)" : ""}`
                    : `No ${s.label.toLowerCase()} codes in this view`
                }
              >
                {s.label}
              </Button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SearchBox
          value={query}
          onChange={onQueryChange}
          placeholder={placeholder}
          ariaLabel="Search this CBS hierarchy"
          className="h-8 w-72"
        />
        <Button variant="outline" size="sm" onClick={onExpandAll}>
          Expand all
        </Button>
        <Button variant="outline" size="sm" onClick={onCollapseAll}>
          Collapse all
        </Button>
        {children}
      </div>
    </div>
  );
}
