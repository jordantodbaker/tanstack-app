import * as React from "react";
import {
  collectExpandableKeys,
  collectKeysToLevel,
  type CbsTreeNode,
} from "~/lib/cbs-tree";

/**
 * Expand/collapse state for a CBS tree — shared by the Setup editor and the
 * CBS dictionary viewers. `expandAll` opens every node of the full `nodes` tree
 * (not just the currently filtered view) so a later cleared search shows the
 * whole catalog open.
 *
 * `expandToLevel` opens the tree down to one code level, which is what the
 * colour legend's L0…L5 buttons call. `levelShown` is the level last asked for,
 * so the legend can mark it; any other change to the expansion clears it,
 * because the tree no longer stands at a single level.
 */
export function useCbsTreeExpansion(nodes: CbsTreeNode[]) {
  const [expanded, setExpanded] = React.useState<Set<string>>(() => new Set());
  const [levelShown, setLevelShown] = React.useState<number | null>(null);

  const toggle = React.useCallback((pathKey: string) => {
    setLevelShown(null);
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(pathKey)) next.delete(pathKey);
      else next.add(pathKey);
      return next;
    });
  }, []);

  const expandableKeys = React.useMemo(
    () => collectExpandableKeys(nodes),
    [nodes],
  );
  const expandAll = React.useCallback(() => {
    setLevelShown(null);
    setExpanded(new Set(expandableKeys));
  }, [expandableKeys]);

  // "Collapse all" and the legend's L0 are the same thing, so they agree on
  // what the legend highlights.
  const collapseAll = React.useCallback(() => {
    setLevelShown(0);
    setExpanded(new Set());
  }, []);

  /**
   * Opens the given nodes without closing anything — what a `?code=` deep link
   * needs, since the row it names is usually four levels down and every
   * ancestor has to be open for it to exist in the list at all.
   */
  const reveal = React.useCallback((pathKeys: string[]) => {
    if (pathKeys.length === 0) return;
    setLevelShown(null);
    setExpanded((prev) => {
      if (pathKeys.every((k) => prev.has(k))) return prev;
      const next = new Set(prev);
      for (const k of pathKeys) next.add(k);
      return next;
    });
  }, []);

  const expandToLevel = React.useCallback(
    (level: number) => {
      setLevelShown(level);
      setExpanded(new Set(collectKeysToLevel(nodes, level)));
    },
    [nodes],
  );

  return {
    expanded,
    toggle,
    expandAll,
    collapseAll,
    expandToLevel,
    reveal,
    levelShown,
  };
}
