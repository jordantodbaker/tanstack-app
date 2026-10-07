import * as React from "react";
import { SearchBox } from "~/components/SearchBox";
import { Button } from "~/components/ui/button";

/**
 * Search box + Expand all / Collapse all for a CBS tree, with a trailing slot
 * for page-specific status (match count, selected count, saving…). Shared by
 * the Setup editor and the CBS dictionary viewers.
 */
export function CbsTreeToolbar({
  query,
  onQueryChange,
  placeholder = "Search code or name…",
  onExpandAll,
  onCollapseAll,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder?: string;
  onExpandAll: () => void;
  onCollapseAll: () => void;
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
      {children}
    </div>
  );
}
