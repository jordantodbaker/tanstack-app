import * as React from "react";
import { collectExpandableKeys, type CbsTreeNode } from "~/lib/cbs-tree";

/**
 * Expand/collapse state for a CBS tree — shared by the Setup editor and the
 * CBS dictionary viewers. `expandAll` opens every node of the full `nodes` tree
 * (not just the currently filtered view) so a later cleared search shows the
 * whole catalog open.
 */
export function useCbsTreeExpansion(nodes: CbsTreeNode[]) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());

  const toggle = React.useCallback((pathKey: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const expandableKeys = React.useMemo(() => collectExpandableKeys(nodes), [nodes]);
  const expandAll = React.useCallback(
    () => setExpanded(new Set(expandableKeys)),
    [expandableKeys],
  );
  const collapseAll = React.useCallback(() => setExpanded(new Set()), []);

  return { expanded, toggle, expandAll, collapseAll };
}
