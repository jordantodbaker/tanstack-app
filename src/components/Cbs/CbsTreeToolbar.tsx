import * as React from "react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";
import { CBS_COST_TYPES, type CbsCostTypeKey } from "~/lib/cbs-tree";

/**
 * Search box + Expand all / Collapse all + the Subcontracts / Materials row
 * filters for a CBS tree, with a trailing slot for page-specific status (match
 * count, selected count, saving…). Shared by the Setup editor and the CBS
 * dictionary viewers.
 */
export function CbsTreeToolbar({
  query,
  onQueryChange,
  placeholder = "Search code or name…",
  onExpandAll,
  onCollapseAll,
  costTypes,
  onToggleCostType,
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
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
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
      {onToggleCostType &&
        CBS_COST_TYPES.map((t) => {
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
      {children}
    </div>
  );
}
