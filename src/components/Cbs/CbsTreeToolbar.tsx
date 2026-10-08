import * as React from "react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";

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
  subActive = false,
  materialActive = false,
  onToggleSub,
  onToggleMaterial,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
  /** Omit both handlers to leave the row-type filters out entirely. */
  subActive?: boolean;
  materialActive?: boolean;
  onToggleSub?: () => void;
  onToggleMaterial?: () => void;
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
      {onToggleSub && (
        <Button
          variant={subActive ? "default" : "outline"}
          size="sm"
          onClick={onToggleSub}
          aria-pressed={subActive}
          title="Show only subcontract codes — cost type S, or Sub Code YES"
        >
          Subcontracts
        </Button>
      )}
      {onToggleMaterial && (
        <Button
          variant={materialActive ? "default" : "outline"}
          size="sm"
          onClick={onToggleMaterial}
          aria-pressed={materialActive}
          title="Show only material codes — cost type M, or Material Code YES"
        >
          Materials
        </Button>
      )}
      {children}
    </div>
  );
}
